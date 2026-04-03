import type { Express } from "express";
import { pool } from "./db";
import { buscarLugarCercano } from "./viajes-historico";

export function registerRutasGpsRoutes(app: Express) {

  // Dynamic contratos from viajes data
  app.get("/api/rutas/contratos-disponibles", async (_req, res) => {
    try {
      const r = await pool.query(`
        SELECT va.contrato, COUNT(*) as viajes, COUNT(DISTINCT camion_id) as camiones,
          ROUND(AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0)::numeric, 2) as rend,
          MAX(fecha_inicio)::text as ultimo
        FROM viajes_aprendizaje va
        WHERE va.km_ecu::float > 20 AND va.fecha_inicio >= NOW() - INTERVAL '30 days' AND va.contrato IS NOT NULL
        GROUP BY va.contrato HAVING COUNT(*) >= 3 ORDER BY viajes DESC
      `);
      const totalViajes = r.rows.reduce((s: number, c: any) => s + parseInt(c.viajes), 0);
      const contratos = [
        { id: "TODOS", label: "TODOS", viajes: totalViajes, camiones: 0 },
        ...r.rows.map((c: any) => ({
          id: c.contrato,
          label: c.contrato.substring(0, 14),
          viajes: parseInt(c.viajes),
          camiones: parseInt(c.camiones),
          rend: parseFloat(c.rend || "0"),
          ultimo: c.ultimo,
        })),
      ];
      res.json({ contratos });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/rutas/viajes-dia", async (req, res) => {
    try {
      const ayer = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const fecha = (req.query.fecha as string) || ayer;
      const contrato = req.query.contrato as string | undefined;

      let whereContrato = "";
      const params: any[] = [fecha];
      if (contrato && contrato !== "TODOS") {
        whereContrato = " AND f.nombre = $2";
        params.push(contrato);
      }

      const puntosResult = await pool.query(`
        SELECT g.patente, g.camion_id, g.lat::float as lat, g.lng::float as lng,
               g.timestamp_punto, g.velocidad_kmh::float as velocidad_kmh,
               g.km_odometro::float as km_odometro,
               f.nombre as contrato
        FROM geo_puntos g
        JOIN camiones c ON g.camion_id = c.id
        JOIN faenas f ON c.faena_id = f.id
        WHERE g.timestamp_punto >= ($1::date) AND g.timestamp_punto < ($1::date + interval '1 day')
          AND c.vin IS NOT NULL AND c.vin != '' ${whereContrato}
        ORDER BY g.patente, g.timestamp_punto
      `, params);

      if (puntosResult.rows.length === 0) {
        return res.json({ viajes: [], rutasFrecuentes: [], fecha, totalViajes: 0 });
      }

      const patentes = [...new Set(puntosResult.rows.map((r: any) => r.patente))];

      const camInfoResult = await pool.query(`
        SELECT c.patente, c.vin,
          (SELECT conductor FROM cargas WHERE patente = c.patente AND conductor IS NOT NULL ORDER BY fecha DESC LIMIT 1) as conductor
        FROM camiones c WHERE c.patente = ANY($1)
      `, [patentes]);
      const patenteToVin = new Map<string, string>();
      const patenteToConductor = new Map<string, string | null>();
      for (const r of camInfoResult.rows) {
        if (r.vin) patenteToVin.set(r.patente, r.vin);
        patenteToConductor.set(r.patente, r.conductor || null);
      }

      const vins = [...patenteToVin.values()];
      const fuelMap = new Map<string, { litrosEcu: number }>();
      if (vins.length > 0) {
        const fuelResult = await pool.query(`
          SELECT vin, 
            (MAX(total_fuel_used) - MIN(total_fuel_used)) / 1000.0 as litros_ecu
          FROM volvo_fuel_snapshots
          WHERE captured_at::timestamp >= ($1::date) AND captured_at::timestamp < ($1::date + interval '1 day')
            AND vin = ANY($2)
          GROUP BY vin
          HAVING MAX(total_fuel_used) > MIN(total_fuel_used)
        `, [fecha, vins]);
        for (const r of fuelResult.rows) {
          fuelMap.set(r.vin, { litrosEcu: parseFloat(r.litros_ecu) || 0 });
        }
      }

      const porPatente = new Map<string, typeof puntosResult.rows>();
      for (const p of puntosResult.rows) {
        if (!porPatente.has(p.patente)) porPatente.set(p.patente, []);
        porPatente.get(p.patente)!.push(p);
      }

      const viajes: any[] = [];

      for (const [patente, pts] of porPatente) {
        if (pts.length < 2) continue;

        const contratoName = pts[0]?.contrato || undefined;
        const primerPunto = pts[0];
        const ultimoPunto = pts[pts.length - 1];

        const validOdometer = pts.map((p: any) => p.km_odometro).filter((v: any) => v != null && v > 0);
        const kmTotal = validOdometer.length >= 2
          ? Math.round(Math.max(...validOdometer) - Math.min(...validOdometer))
          : 0;

        const vin = patenteToVin.get(patente);
        const fuel = vin ? fuelMap.get(vin) : null;
        const litrosEcu = fuel?.litrosEcu || 0;
        const rendimiento = litrosEcu > 0 && kmTotal > 0 ? Math.round((kmTotal / litrosEcu) * 100) / 100 : null;

        const lugarOrigen = buscarLugarCercano(primerPunto.lat, primerPunto.lng, contratoName);
        const lugarDestino = buscarLugarCercano(ultimoPunto.lat, ultimoPunto.lng, contratoName);

        const clusters = new Map<string, { nombre: string; count: number; lat: number; lng: number }>();
        for (const p of pts) {
          const lugar = buscarLugarCercano(p.lat, p.lng, contratoName);
          if (lugar) {
            const key = lugar.nombre;
            if (!clusters.has(key)) clusters.set(key, { nombre: lugar.nombre, count: 0, lat: lugar.lat, lng: lugar.lng });
            clusters.get(key)!.count++;
          }
        }

        let lugarPrincipal: { nombre: string; lat: number; lng: number } | null = null;
        let maxCount = 0;
        for (const [, cl] of clusters) {
          if (cl.count > maxCount) { maxCount = cl.count; lugarPrincipal = { nombre: cl.nombre, lat: cl.lat, lng: cl.lng }; }
        }

        const origenNombre = lugarOrigen?.nombre || "Punto desconocido";
        const destinoNombre = lugarDestino?.nombre || "Punto desconocido";
        let nombreViaje = `${origenNombre} \u2192 ${destinoNombre}`;
        if (lugarPrincipal && lugarPrincipal.nombre !== origenNombre && lugarPrincipal.nombre !== destinoNombre) {
          nombreViaje = `${origenNombre} \u2192 ${lugarPrincipal.nombre} \u2192 ${destinoNombre}`;
        }

        const velocidades = pts.map((p: any) => p.velocidad_kmh).filter((v: any) => v != null && v > 0);
        const velPromedio = velocidades.length > 0 ? Math.round(velocidades.reduce((a: number, b: number) => a + b, 0) / velocidades.length) : 0;
        const velMax = velocidades.length > 0 ? Math.round(Math.max(...velocidades)) : 0;

        const duracionMin = Math.round((new Date(ultimoPunto.timestamp_punto).getTime() - new Date(primerPunto.timestamp_punto).getTime()) / 60000);

        const puntosGps = pts
          .filter((p: any) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng))
          .map((p: any) => {
            const lugar = buscarLugarCercano(p.lat, p.lng, contratoName);
            return { lat: p.lat, lng: p.lng, nombre: lugar?.nombre || null, timestamp: p.timestamp_punto, velocidad: p.velocidad_kmh };
          });

        viajes.push({
          patente,
          conductor: patenteToConductor.get(patente) || null,
          contrato: contratoName || null,
          lugar_origen: origenNombre,
          lugar_destino: destinoNombre,
          lugar_principal: lugarPrincipal?.nombre || null,
          lugar_principal_lat: lugarPrincipal?.lat || null,
          lugar_principal_lng: lugarPrincipal?.lng || null,
          hora_inicio: primerPunto.timestamp_punto,
          hora_fin: ultimoPunto.timestamp_punto,
          duracion_min: duracionMin,
          km_total: kmTotal,
          litros_ecu: Math.round(litrosEcu * 100) / 100,
          rendimiento,
          vel_promedio: velPromedio,
          vel_max: velMax,
          nombre_viaje: nombreViaje,
          puntos_gps: puntosGps,
          total_puntos: pts.length,
        });
      }

      viajes.sort((a, b) => b.km_total - a.km_total);

      const frecuencia = new Map<string, number>();
      for (const v of viajes) {
        const key = `${v.lugar_origen} \u2192 ${v.lugar_destino}`;
        frecuencia.set(key, (frecuencia.get(key) || 0) + 1);
      }
      const rutasFrecuentes = Array.from(frecuencia.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      console.log(`[RUTAS-GPS] viajes-dia ${fecha}: ${viajes.length} viajes, ${puntosResult.rows.length} puntos`);
      res.json({ viajes, rutasFrecuentes, fecha, totalViajes: viajes.length });
    } catch (error: any) {
      console.error("[RUTAS-GPS] Error viajes-dia:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rutas/frecuentes", async (req, res) => {
    try {
      const contrato = req.query.contrato as string | undefined;

      let whereContrato = "";
      const params: any[] = [];
      if (contrato && contrato !== "TODOS") {
        whereContrato = " WHERE contrato = $1";
        params.push(contrato);
      }

      const result = await pool.query(`
        SELECT nombre_viaje as ruta,
          COUNT(*)::int as veces,
          ROUND(AVG(km_total))::int as km_prom,
          COUNT(DISTINCT patente)::int as camiones,
          COUNT(DISTINCT fecha)::int as dias,
          ARRAY_AGG(DISTINCT contrato ORDER BY contrato) as contratos
        FROM viajes_diarios ${whereContrato}
        GROUP BY nombre_viaje
        HAVING COUNT(*) >= 3
        ORDER BY veces DESC
        LIMIT 50
      `, params);

      const rutasConRend = [];
      for (const r of result.rows) {
        const rendParams: any[] = [r.ruta];
        let rendWhere = "WHERE vd.nombre_viaje = $1";
        if (contrato && contrato !== "TODOS") {
          rendWhere += " AND vd.contrato = $2";
          rendParams.push(contrato);
        }
        const rendResult = await pool.query(`
          SELECT AVG(
            CASE WHEN vd.km_total > 0 AND c.vin IS NOT NULL THEN
              vd.km_total::float / NULLIF(
                (SELECT (MAX(total_fuel_used) - MIN(total_fuel_used)) / 1000.0
                 FROM volvo_fuel_snapshots
                 WHERE vin = c.vin
                   AND captured_at::timestamp >= vd.fecha AND captured_at::timestamp < vd.fecha + interval '1 day'
                   AND total_fuel_used > 0
                 HAVING MAX(total_fuel_used) > MIN(total_fuel_used)
                ), 0)
            END
          )::numeric(6,2) as rend_prom
          FROM viajes_diarios vd
          LEFT JOIN camiones c ON vd.patente = c.patente
          ${rendWhere}
        `, rendParams);

        rutasConRend.push({
          ...r,
          rend_prom: rendResult.rows[0]?.rend_prom ? parseFloat(rendResult.rows[0].rend_prom) : null,
        });
      }

      console.log(`[RUTAS-GPS] frecuentes: ${rutasConRend.length} rutas con >= 3 repeticiones`);
      res.json({ rutas: rutasConRend, total: rutasConRend.length });
    } catch (error: any) {
      console.error("[RUTAS-GPS] Error frecuentes:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  async function generarYAcumular(fecha: string) {
    const puntosResult = await pool.query(`
      SELECT g.patente, g.camion_id, g.lat::float as lat, g.lng::float as lng,
             g.timestamp_punto, g.velocidad_kmh::float as velocidad_kmh,
             g.km_odometro::float as km_odometro,
             f.nombre as contrato
      FROM geo_puntos g
      JOIN camiones c ON g.camion_id = c.id
      JOIN faenas f ON c.faena_id = f.id
      WHERE g.timestamp_punto >= ($1::date) AND g.timestamp_punto < ($1::date + interval '1 day')
      ORDER BY g.patente, g.timestamp_punto
    `, [fecha]);

    if (puntosResult.rows.length === 0) return { fecha, accion: "sin_datos", viajes: 0 };

    const porPatente = new Map<string, typeof puntosResult.rows>();
    for (const p of puntosResult.rows) {
      if (!porPatente.has(p.patente)) porPatente.set(p.patente, []);
      porPatente.get(p.patente)!.push(p);
    }

    const viajes: any[] = [];
    for (const [patente, pts] of porPatente) {
      if (pts.length < 2) continue;
      const contratoName = pts[0]?.contrato || undefined;
      const primerPunto = pts[0];
      const ultimoPunto = pts[pts.length - 1];
      const validOdometer = pts.map((p: any) => p.km_odometro).filter((v: any) => v != null && v > 0);
      const kmTotal = validOdometer.length >= 2 ? Math.round(Math.max(...validOdometer) - Math.min(...validOdometer)) : 0;
      const lugarOrigen = buscarLugarCercano(primerPunto.lat, primerPunto.lng, contratoName);
      const lugarDestino = buscarLugarCercano(ultimoPunto.lat, ultimoPunto.lng, contratoName);

      const clusters = new Map<string, { nombre: string; count: number; lat: number; lng: number }>();
      for (const p of pts) {
        const lugar = buscarLugarCercano(p.lat, p.lng, contratoName);
        if (lugar) {
          const key = lugar.nombre;
          if (!clusters.has(key)) clusters.set(key, { nombre: lugar.nombre, count: 0, lat: lugar.lat, lng: lugar.lng });
          clusters.get(key)!.count++;
        }
      }
      let lugarPrincipal: { nombre: string; lat: number; lng: number } | null = null;
      let maxCount = 0;
      for (const [, cl] of clusters) {
        if (cl.count > maxCount) { maxCount = cl.count; lugarPrincipal = { nombre: cl.nombre, lat: cl.lat, lng: cl.lng }; }
      }

      const origenNombre = lugarOrigen?.nombre || "Punto desconocido";
      const destinoNombre = lugarDestino?.nombre || "Punto desconocido";
      let nombreViaje = `${origenNombre} \u2192 ${destinoNombre}`;
      if (lugarPrincipal && lugarPrincipal.nombre !== origenNombre && lugarPrincipal.nombre !== destinoNombre) {
        nombreViaje = `${origenNombre} \u2192 ${lugarPrincipal.nombre} \u2192 ${destinoNombre}`;
      }

      const puntosGps = pts
        .filter((p: any) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng))
        .map((p: any) => {
          const lugar = buscarLugarCercano(p.lat, p.lng, contratoName);
          return { lat: p.lat, lng: p.lng, nombre: lugar?.nombre || null };
        });

      viajes.push({
        patente, camion_id: pts[0].camion_id, contrato: contratoName || null,
        lugar_origen: origenNombre, lugar_destino: destinoNombre,
        lugar_principal: lugarPrincipal?.nombre || null,
        lugar_principal_lat: lugarPrincipal?.lat || null,
        lugar_principal_lng: lugarPrincipal?.lng || null,
        hora_inicio: primerPunto.timestamp_punto, hora_fin: ultimoPunto.timestamp_punto,
        km_total: kmTotal, nombre_viaje: nombreViaje, puntos_gps: puntosGps, total_puntos: pts.length,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM viajes_diarios WHERE fecha = $1", [fecha]);
      for (const v of viajes) {
        await client.query(`
          INSERT INTO viajes_diarios (fecha, patente, camion_id, conductor, contrato, lugar_origen, lugar_destino,
            lugar_principal, lugar_principal_lat, lugar_principal_lng, hora_inicio, hora_fin, km_total,
            nombre_viaje, total_puntos, puntos_gps)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, [fecha, v.patente, v.camion_id, null, v.contrato, v.lugar_origen, v.lugar_destino,
            v.lugar_principal, v.lugar_principal_lat, v.lugar_principal_lng, v.hora_inicio, v.hora_fin,
            v.km_total, v.nombre_viaje, v.total_puntos, JSON.stringify(v.puntos_gps)]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    console.log(`[RUTAS-GPS] Acumulados ${viajes.length} viajes para ${fecha}`);
    return { fecha, accion: "acumulado", viajes: viajes.length };
  }

  app.get("/api/rutas/patrones", async (req, res) => {
    try {
      const contrato = req.query.contrato as string | undefined;
      let whereContrato = "";
      const params: any[] = [];
      if (contrato && contrato !== "TODOS") { whereContrato = " WHERE contrato = $1"; params.push(contrato); }

      const diasResult = await pool.query(`
        SELECT COUNT(DISTINCT fecha)::int as dias, MIN(fecha) as desde, MAX(fecha) as hasta,
               COUNT(*)::int as total_viajes FROM viajes_diarios ${whereContrato}
      `, params);
      const info = diasResult.rows[0];
      const diasAcumulados = info.dias || 0;

      const rutasResult = await pool.query(`
        SELECT nombre_viaje, contrato, COUNT(*)::int as frecuencia,
          COUNT(DISTINCT fecha)::int as dias_distintos, COUNT(DISTINCT patente)::int as camiones_distintos,
          ROUND(AVG(km_total))::int as km_promedio
        FROM viajes_diarios ${whereContrato}
        GROUP BY nombre_viaje, contrato HAVING COUNT(*) >= 2
        ORDER BY frecuencia DESC LIMIT 30
      `, params);

      const porContrato = await pool.query(`
        SELECT contrato, COUNT(DISTINCT nombre_viaje)::int as rutas_unicas,
          COUNT(*)::int as viajes_total, COUNT(DISTINCT patente)::int as camiones,
          ROUND(AVG(km_total))::int as km_promedio
        FROM viajes_diarios ${whereContrato} GROUP BY contrato ORDER BY viajes_total DESC
      `, params);

      const listo = diasAcumulados >= 7;
      res.json({
        diasAcumulados, desde: info.desde, hasta: info.hasta, totalViajes: info.total_viajes, listo,
        mensaje: listo ? `${diasAcumulados} dias de datos acumulados.` : `${diasAcumulados}/7 dias. Faltan ${7 - diasAcumulados} dias.`,
        patrones: rutasResult.rows, porContrato: porContrato.rows,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rutas/viajes-acumulados", async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT fecha, COUNT(*)::int as viajes, COUNT(DISTINCT patente)::int as camiones,
          SUM(km_total)::int as km_total FROM viajes_diarios GROUP BY fecha ORDER BY fecha DESC
      `);
      res.json({ dias: result.rows, totalDias: result.rows.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  let acumulacionEnCurso = false;
  setTimeout(async () => {
    if (acumulacionEnCurso) return;
    acumulacionEnCurso = true;
    try {
      const fechasResult = await pool.query(`
        SELECT DISTINCT DATE(timestamp_punto)::text as fecha FROM geo_puntos
        WHERE timestamp_punto < CURRENT_DATE ORDER BY fecha
      `);
      for (const row of fechasResult.rows) {
        const r = await generarYAcumular(row.fecha);
        if (r.accion === "acumulado") console.log(`[RUTAS-GPS] Auto: ${r.viajes} viajes para ${r.fecha}`);
      }
      console.log(`[RUTAS-GPS] Acumulacion completa: ${fechasResult.rows.length} fechas`);
    } catch (err: any) {
      console.error("[RUTAS-GPS] Error acumulacion:", err.message);
    } finally {
      acumulacionEnCurso = false;
    }
  }, 30_000);

  setInterval(async () => {
    try {
      const ayer = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const r = await generarYAcumular(ayer);
      if (r.accion === "acumulado") console.log(`[RUTAS-GPS] Diario: ${r.viajes} viajes para ${ayer}`);
    } catch (err: any) {
      console.error("[RUTAS-GPS] Error diario:", err.message);
    }
  }, 6 * 60 * 60 * 1000);

  // ═══════════════════════════════════════════════════
  // GET /api/camion/mes-completo/:patente
  // V2: Híbrido Sigetra (todo el mes) + Volvo ECU (donde exista)
  // Sigetra cargas = fuente primaria de actividad y rendimiento
  // viajes_aprendizaje = complemento con detalle GPS
  // ═══════════════════════════════════════════════════
  app.get("/api/camion/mes-completo/:patente", async (req, res) => {
    try {
      const { patente } = req.params;
      const mesParam = req.query.mes as string | undefined;
      const anioParam = req.query.anio as string | undefined;

      const now = new Date();
      const mes = mesParam ? parseInt(mesParam) : now.getMonth() + 1;
      const anio = anioParam ? parseInt(anioParam) : now.getFullYear();

      const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mes, 0);
      const ultimoDiaStr = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia.getDate()).padStart(2, "0")}`;
      const diasEnMes = ultimoDia.getDate();

      // Resolve camion_id from patente
      const camionResult = await pool.query(`SELECT id, conductor, faena_id FROM camiones WHERE patente = $1 LIMIT 1`, [patente]);
      const camionId = camionResult.rows[0]?.id;
      const conductor = camionResult.rows[0]?.conductor || null;

      // ─── FUENTE 1: Cargas Sigetra (todo el mes, fuente primaria) ───
      const cargasResult = await pool.query(`
        SELECT c.id, c.fecha, c.litros_surtidor::float as litros, c.lugar_consumo as estacion,
               c.faena as contrato, c.km_anterior::float as km_anterior, c.km_actual::float as km_actual,
               c.rend_real::float as rendimiento, c.conductor
        FROM cargas c
        WHERE c.patente = $1
          AND c.fecha::text >= $2 AND c.fecha::text <= ($3 || 'T23:59:59')
        ORDER BY c.fecha
      `, [patente, primerDia, ultimoDiaStr]);

      // Build cargas timeline con km entre cargas
      const cargas: any[] = [];
      for (let i = 0; i < cargasResult.rows.length; i++) {
        const c = cargasResult.rows[i];
        const prev = i > 0 ? cargasResult.rows[i - 1] : null;
        const kmDesdeUltima = prev && c.km_actual && prev.km_actual
          ? Math.round(c.km_actual - prev.km_actual)
          : c.km_actual && c.km_anterior ? Math.round(c.km_actual - c.km_anterior) : 0;

        // Rendimiento del período entre cargas
        let rendPeriodo = c.rendimiento || 0;
        if (!rendPeriodo && prev && c.km_actual && prev.km_actual && c.litros > 0) {
          const kmPeriodo = c.km_actual - prev.km_actual;
          if (kmPeriodo > 0) rendPeriodo = Math.round((kmPeriodo / c.litros) * 100) / 100;
        }

        cargas.push({
          fecha: c.fecha,
          litros: c.litros || 0,
          estacion: c.estacion || "Desconocida",
          contrato: c.contrato || "",
          km_desde_ultima_carga: Math.abs(kmDesdeUltima),
          rendimiento_periodo: rendPeriodo,
          km_actual: c.km_actual || 0,
        });
      }

      // ─── Construir actividad diaria desde cargas ───
      // Cada carga implica actividad ese día. Entre 2 cargas consecutivas
      // distribuimos km recorridos proporcionalmente a los días entre ellas.
      const calendarioMap = new Map<string, { km: number; litros: number; cargas: number; rendimiento_sum: number; rendimiento_count: number }>();

      for (let i = 0; i < cargasResult.rows.length; i++) {
        const c = cargasResult.rows[i];
        const fecha = c.fecha ? c.fecha.split("T")[0] : null;
        if (!fecha) continue;

        const existing = calendarioMap.get(fecha) || { km: 0, litros: 0, cargas: 0, rendimiento_sum: 0, rendimiento_count: 0 };
        existing.cargas += 1;
        existing.litros += c.litros || 0;

        // km entre esta carga y la anterior
        if (i > 0) {
          const prev = cargasResult.rows[i - 1];
          const kmDelta = (c.km_actual && prev.km_actual) ? c.km_actual - prev.km_actual : 0;
          if (kmDelta > 0 && kmDelta < 5000) {
            // Distribuir km entre días desde la carga anterior hasta hoy
            const fechaPrev = prev.fecha ? prev.fecha.split("T")[0] : fecha;
            const d1 = new Date(fechaPrev);
            const d2 = new Date(fecha);
            const diasEntre = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));

            if (diasEntre === 1) {
              existing.km += kmDelta;
            } else {
              // Distribuir proporcionalmente
              const kmPorDia = kmDelta / diasEntre;
              for (let dd = 0; dd < diasEntre; dd++) {
                const diaFecha = new Date(d1.getTime() + (dd + 1) * 86400000).toISOString().split("T")[0];
                if (diaFecha >= primerDia && diaFecha <= ultimoDiaStr) {
                  const dayEntry = calendarioMap.get(diaFecha) || { km: 0, litros: 0, cargas: 0, rendimiento_sum: 0, rendimiento_count: 0 };
                  dayEntry.km += kmPorDia;
                  calendarioMap.set(diaFecha, dayEntry);
                }
              }
            }

            // Rendimiento del período
            if (c.litros > 0 && kmDelta > 0) {
              const rend = kmDelta / c.litros;
              if (rend > 0.5 && rend < 8) {
                existing.rendimiento_sum += rend;
                existing.rendimiento_count += 1;
              }
            }
          }
        }

        calendarioMap.set(fecha, existing);
      }

      // ─── FUENTE 2: Viajes Aprendizaje (complemento, 19 mar+) ───
      const viajesResult = await pool.query(`
        SELECT va.fecha_inicio, va.km_ecu::float as km, va.litros_consumidos_ecu::float as litros,
               va.rendimiento_real::float as rendimiento, va.duracion_minutos
        FROM viajes_aprendizaje va
        WHERE va.camion_id = $1
        AND va.fecha_inicio >= $2::timestamp AND va.fecha_inicio < ($3::date + interval '1 day')
        ORDER BY va.fecha_inicio
      `, [camionId || -1, primerDia, ultimoDiaStr]);

      // Enriquecer calendario con datos de viajes donde existan
      const viajesPorDia = new Map<string, { viajes: number; horasRuta: number; kmEcu: number; litrosEcu: number }>();
      for (const v of viajesResult.rows) {
        const fecha = new Date(v.fecha_inicio).toISOString().split("T")[0];
        const e = viajesPorDia.get(fecha) || { viajes: 0, horasRuta: 0, kmEcu: 0, litrosEcu: 0 };
        e.viajes += 1;
        e.horasRuta += (v.duracion_minutos || 0) / 60;
        e.kmEcu += v.km || 0;
        e.litrosEcu += v.litros || 0;
        viajesPorDia.set(fecha, e);
      }

      // ─── Construir calendario final ───
      const calendario = [];
      for (let d = 1; d <= diasEnMes; d++) {
        const fechaStr = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const sigetra = calendarioMap.get(fechaStr);
        const volvo = viajesPorDia.get(fechaStr);

        // Prefer Volvo ECU data when available, fallback to Sigetra-derived
        const km = volvo && volvo.kmEcu > 0 ? volvo.kmEcu : (sigetra?.km || 0);
        const litros = volvo && volvo.litrosEcu > 0 ? volvo.litrosEcu : (sigetra?.litros || 0);
        const activo = km > 5 || (sigetra?.cargas || 0) > 0 || (volvo?.viajes || 0) > 0;
        const rendimiento = litros > 0 ? km / litros : (sigetra?.rendimiento_count ? sigetra.rendimiento_sum / sigetra.rendimiento_count : 0);

        // Fuente de datos para este día
        let fuente: "volvo" | "sigetra" | "sin_datos" = "sin_datos";
        if (volvo && volvo.viajes > 0) fuente = "volvo";
        else if (sigetra && (sigetra.cargas > 0 || sigetra.km > 0)) fuente = "sigetra";

        calendario.push({
          fecha: fechaStr,
          dia: d,
          km: Math.round(km * 10) / 10,
          rendimiento: Math.round(rendimiento * 100) / 100,
          viajes: volvo?.viajes || sigetra?.cargas || 0,
          horas_ruta: Math.round((volvo?.horasRuta || 0) * 10) / 10,
          activo,
          fuente,
          cargas_dia: sigetra?.cargas || 0,
          litros_dia: Math.round((sigetra?.litros || 0) * 10) / 10,
        });
      }

      // ─── Acumulado del mes ───
      const totalKm = calendario.reduce((s, d) => s + d.km, 0);
      const totalLitros = cargas.reduce((s: number, c: any) => s + (c.litros || 0), 0);
      const diasActivos = calendario.filter(d => d.activo).length;
      const diasConVolvo = calendario.filter(d => d.fuente === "volvo").length;
      const diasConSigetra = calendario.filter(d => d.fuente === "sigetra").length;

      // Dias laborales = L-V hasta hoy
      let diasLaborales = 0;
      for (let d = 1; d <= Math.min(diasEnMes, now.getDate()); d++) {
        const dt = new Date(anio, mes - 1, d);
        if (dt.getDay() >= 1 && dt.getDay() <= 5) diasLaborales++;
      }

      const acumulado = {
        km_mes: Math.round(totalKm),
        litros_mes: Math.round(totalLitros),
        rendimiento_promedio: totalLitros > 0 ? Math.round((totalKm / totalLitros) * 100) / 100 : 0,
        viajes_mes: viajesResult.rows.length,
        cargas_mes: cargas.length,
        dias_activos: diasActivos,
        dias_mes: diasLaborales,
        dias_volvo: diasConVolvo,
        dias_sigetra: diasConSigetra,
        conductor,
      };

      // ─── Rendimiento diario (solo días con datos reales) ───
      const rendimiento_diario = calendario
        .filter(d => d.activo && d.rendimiento > 0.5 && d.rendimiento < 8)
        .map(d => ({
          fecha: d.fecha,
          km_L: d.rendimiento,
          km: d.km,
          viajes: d.viajes,
          fuente: d.fuente,
        }));

      // ─── Promedio histórico (Sigetra + Volvo) ───
      const promedioResult = await pool.query(`
        SELECT AVG(rend) as promedio FROM (
          SELECT rend_real::float as rend FROM cargas
          WHERE patente = $1 AND rend_real IS NOT NULL AND rend_real::float > 0.5 AND rend_real::float < 8
          AND fecha::text >= ($2::date - interval '90 days')::text AND fecha::text <= $3
          UNION ALL
          SELECT rendimiento_real::float as rend FROM viajes_aprendizaje
          WHERE camion_id = $4 AND rendimiento_real IS NOT NULL AND rendimiento_real::float > 0.5
          AND fecha_inicio >= (NOW() - interval '90 days')
        ) sub
      `, [patente, primerDia, ultimoDiaStr, camionId || -1]);
      const promedioHistorico = promedioResult.rows[0]?.promedio
        ? Math.round(promedioResult.rows[0].promedio * 100) / 100
        : 2.5;

      res.json({
        patente,
        mes,
        anio,
        calendario,
        acumulado,
        cargas,
        rendimiento_diario,
        promedio_historico: promedioHistorico,
      });
    } catch (err: any) {
      console.error("[MES-COMPLETO] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════
  // GET /api/camion/detalle-dia/:patente
  // Detalle de un día específico: KPIs, viajes, combustible, comparativas
  // ═══════════════════════════════════════════════════
  app.get("/api/camion/detalle-dia/:patente", async (req, res) => {
    try {
      const { patente } = req.params;
      const fecha = req.query.fecha as string || new Date().toISOString().split("T")[0];

      const camionResult = await pool.query(`SELECT id FROM camiones WHERE patente = $1 LIMIT 1`, [patente]);
      const camionId = camionResult.rows[0]?.id;

      // Viajes del día (viajes_aprendizaje)
      const viajesResult = await pool.query(`
        SELECT va.origen_nombre, va.destino_nombre,
               va.km_ecu::float as km, va.litros_consumidos_ecu::float as litros,
               va.rendimiento_real::float as rendimiento,
               va.duracion_minutos, va.conductor, va.contrato
        FROM viajes_aprendizaje va
        WHERE va.camion_id = $1
          AND DATE(va.fecha_inicio) = $2::date
        ORDER BY va.fecha_inicio
      `, [camionId || -1, fecha]);

      // Cargas del día (sigetra)
      const cargasResult = await pool.query(`
        SELECT fecha, litros_surtidor::float as litros, lugar_consumo as estacion,
               EXTRACT(HOUR FROM fecha::timestamp) || ':' || LPAD(EXTRACT(MINUTE FROM fecha::timestamp)::text, 2, '0') as hora
        FROM cargas
        WHERE patente = $1 AND DATE(fecha::timestamp) = $2::date
        ORDER BY fecha
      `, [patente, fecha]);

      // Cargas del día (also compute km from delta)
      const cargasKmResult = await pool.query(`
        SELECT km_anterior::float, km_actual::float, litros_surtidor::float as litros, rend_real::float as rendimiento
        FROM cargas
        WHERE patente = $1 AND DATE(fecha::timestamp) = $2::date
        ORDER BY fecha
      `, [patente, fecha]);

      // Build KPIs - prefer viajes data, fallback to cargas
      let totalKm = 0, totalLitros = 0, totalViajes = 0, totalHoras = 0;
      const viajesList: any[] = [];

      if (viajesResult.rows.length > 0) {
        for (const v of viajesResult.rows) {
          totalKm += v.km || 0;
          totalLitros += v.litros || 0;
          totalViajes++;
          totalHoras += (v.duracion_minutos || 0) / 60;
          viajesList.push({
            numero: viajesList.length + 1,
            origen: v.origen_nombre || "Punto desconocido",
            destino: v.destino_nombre || "Punto desconocido",
            km: Math.round((v.km || 0) * 10) / 10,
            rendimiento: v.rendimiento ? Math.round(v.rendimiento * 100) / 100 : 0,
            duracion_horas: Math.round((v.duracion_minutos || 0) / 60 * 10) / 10,
          });
        }
      } else {
        // Fallback: use cargas to estimate
        for (const c of cargasKmResult.rows) {
          const km = c.km_actual && c.km_anterior ? c.km_actual - c.km_anterior : 0;
          if (km > 0) { totalKm += km; totalViajes++; }
          totalLitros += c.litros || 0;
        }
      }

      const rendimiento = totalLitros > 0 ? totalKm / totalLitros : 0;

      // Resumen texto
      let resumen_texto = "SIN ACTIVIDAD";
      let resumen_color = "#3a6080";
      if (totalKm < 5 && totalViajes === 0) { resumen_texto = "SIN ACTIVIDAD"; resumen_color = "#3a6080"; }
      else if (totalKm < 100) { resumen_texto = "DIA CORTO"; resumen_color = "#00d4ff"; }
      else if (rendimiento < 2.3) { resumen_texto = "RENDIMIENTO BAJO"; resumen_color = "#ff2244"; }
      else if (rendimiento >= 2.85 && totalKm > 300) { resumen_texto = "DIA PRODUCTIVO"; resumen_color = "#00ff88"; }
      else { resumen_texto = "DIA NORMAL"; resumen_color = "#ffcc00"; }

      // Comparativas: vs ayer
      const ayerFecha = new Date(new Date(fecha).getTime() - 86400000).toISOString().split("T")[0];
      const ayerResult = await pool.query(`
        SELECT SUM(km_actual::float - km_anterior::float) as km, AVG(rend_real::float) as rend
        FROM cargas WHERE patente = $1 AND DATE(fecha::timestamp) = $2::date
        AND km_actual IS NOT NULL AND km_anterior IS NOT NULL AND (km_actual::float - km_anterior::float) > 0
      `, [patente, ayerFecha]);

      // vs promedio del mes
      const mesResult = await pool.query(`
        SELECT AVG(rend_real::float) as rend_prom, AVG(km_actual::float - km_anterior::float) as km_prom
        FROM cargas WHERE patente = $1
        AND fecha >= DATE_TRUNC('month', $2::date)::text AND fecha < ($2::date)::text
        AND rend_real IS NOT NULL AND rend_real::float > 0.5
        AND km_actual IS NOT NULL AND km_anterior IS NOT NULL AND (km_actual::float - km_anterior::float) > 0
      `, [patente, fecha]);

      const ayerRend = ayerResult.rows[0]?.rend || 0;
      const ayerKm = ayerResult.rows[0]?.km || 0;
      const mesRend = mesResult.rows[0]?.rend_prom || 0;

      const conductores = [...new Set(viajesResult.rows.map((v: any) => v.conductor).filter(Boolean))];
      const contrato = viajesResult.rows[0]?.contrato || cargasResult.rows[0]?.contrato || "";

      // Format fecha
      const fechaDate = new Date(fecha + "T12:00:00");
      const diasSemana = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
      const mesesNombre = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      const fechaTexto = `${diasSemana[fechaDate.getDay()]} ${fechaDate.getDate()} de ${mesesNombre[fechaDate.getMonth()]}`;

      res.json({
        patente,
        fecha,
        fecha_texto: fechaTexto,
        contrato,
        conductores,
        resumen_texto,
        resumen_color,
        kpis: {
          km: Math.round(totalKm),
          rendimiento: Math.round(rendimiento * 100) / 100,
          viajes: totalViajes,
          horas_ruta: Math.round(totalHoras * 10) / 10,
        },
        viajes: viajesList,
        combustible: cargasResult.rows.map((c: any) => ({
          litros: Math.round(c.litros),
          estacion: c.estacion || "Desconocida",
          hora: c.hora || "",
        })),
        comparativas: {
          vs_ayer_rendimiento: ayerRend > 0 ? Math.round((rendimiento - ayerRend) * 100) / 100 : null,
          vs_mes_rendimiento: mesRend > 0 ? Math.round((rendimiento - mesRend) * 100) / 100 : null,
          vs_ayer_km: ayerKm > 0 ? Math.round(totalKm - ayerKm) : null,
        },
      });
    } catch (err: any) {
      console.error("[DETALLE-DIA] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════
  // GET /api/camion/conductores/:patente
  // Conductores asociados a un camión (BETA - fuente: cargas Sigetra)
  // ═══════════════════════════════════════════════════
  app.get("/api/camion/conductores/:patente", async (req, res) => {
    try {
      const { patente } = req.params;
      const dias = parseInt(req.query.dias as string || "30");
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      const desdeStr = desde.toISOString().split("T")[0];

      // Conductores desde cargas (100% cobertura)
      const conductoresResult = await pool.query(`
        SELECT
          conductor,
          COUNT(*) as cargas,
          SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 3000
                   THEN km_actual::float - km_anterior::float ELSE 0 END) as km_total,
          MAX(fecha) as ultimo_viaje,
          MIN(fecha) as primer_viaje,
          COUNT(DISTINCT DATE(fecha::timestamp)) as dias_activo
        FROM cargas
        WHERE patente = $1
          AND fecha >= $2
          AND conductor IS NOT NULL
          AND conductor != ''
        GROUP BY conductor
        ORDER BY cargas DESC
      `, [patente, desdeStr]);

      const conductores = conductoresResult.rows.map((c: any, i: number) => ({
        conductor: c.conductor,
        fuente: "cargas",
        cargas: parseInt(c.cargas),
        km_total: Math.round(parseFloat(c.km_total || "0")),
        ultimo_viaje: c.ultimo_viaje,
        primer_viaje: c.primer_viaje,
        dias_activo: parseInt(c.dias_activo || "0"),
        es_principal: i === 0,
      }));

      // Cobertura
      const totalResult = await pool.query(`
        SELECT COUNT(*) as total, COUNT(conductor) as con_conductor
        FROM cargas WHERE patente = $1 AND fecha >= $2
      `, [patente, desdeStr]);

      const total = parseInt(totalResult.rows[0]?.total || "0");
      const conConductor = parseInt(totalResult.rows[0]?.con_conductor || "0");
      const pctCobertura = total > 0 ? Math.round(conConductor / total * 100) : 0;

      res.json({
        patente,
        conductores,
        total_conductores: conductores.length,
        tiene_multiples: conductores.length > 1,
        pct_cobertura_datos: pctCobertura,
        advertencia: pctCobertura < 70
          ? "Datos incompletos — menos del 70% de cargas tienen conductor registrado"
          : null,
      });
    } catch (err: any) {
      console.error("[CONDUCTORES] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════
  // GET /api/resumen-mes
  // Resumen mensual acumulado de toda la flota
  // ═══════════════════════════════════════════════════
  app.get("/api/resumen-mes", async (req, res) => {
    try {
      const now = new Date();
      const mes = parseInt(req.query.mes as string || String(now.getMonth() + 1));
      const anio = parseInt(req.query.anio as string || String(now.getFullYear()));
      const contratoParam = req.query.contrato as string || "TODOS";
      const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mes, 0);
      const ultimoDiaStr = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia.getDate()).padStart(2, "0")}`;

      // Build dynamic contrato filter
      let faenaFilter = "";
      const baseParams: any[] = [primerDia, ultimoDiaStr];
      if (contratoParam !== "TODOS") {
        faenaFilter = " AND faena = $3";
        baseParams.push(contratoParam);
      }

      // KPIs globales desde cargas
      const kpisResult = await pool.query(`
        SELECT
          COUNT(DISTINCT patente) as camiones,
          COUNT(*) as total_cargas,
          ROUND(SUM(litros_surtidor)::numeric) as litros_total,
          ROUND(SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 5000
            THEN km_actual::float - km_anterior::float ELSE 0 END)::numeric) as km_total,
          COUNT(DISTINCT DATE(fecha::timestamp)) as dias_operacion,
          COUNT(DISTINCT conductor) FILTER (WHERE conductor IS NOT NULL AND conductor != '') as conductores
        FROM cargas
        WHERE fecha::text >= $1 AND fecha::text <= ($2 || 'T23:59:59')
          ${faenaFilter}
      `, baseParams);

      const k = kpisResult.rows[0] || {};
      const kmTotal = parseFloat(k.km_total || "0");
      const litrosTotal = parseFloat(k.litros_total || "0");
      const rendPromedio = litrosTotal > 0 ? Math.round((kmTotal / litrosTotal) * 100) / 100 : 0;

      // Top 10 camiones por km
      const topCamionesResult = await pool.query(`
        SELECT patente,
          COUNT(*) as cargas,
          ROUND(SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 5000
            THEN km_actual::float - km_anterior::float ELSE 0 END)::numeric) as km,
          ROUND(SUM(litros_surtidor)::numeric) as litros,
          COUNT(DISTINCT DATE(fecha::timestamp)) as dias
        FROM cargas
        WHERE fecha::text >= $1 AND fecha::text <= ($2 || 'T23:59:59')
          ${faenaFilter}
        GROUP BY patente
        ORDER BY km DESC
        LIMIT 10
      `, baseParams);

      const topCamiones = topCamionesResult.rows.map((c: any) => {
        const km = parseFloat(c.km || "0");
        const lt = parseFloat(c.litros || "0");
        return { patente: c.patente, km: Math.round(km), litros: Math.round(lt), rendimiento: lt > 0 ? Math.round((km / lt) * 100) / 100 : 0, cargas: parseInt(c.cargas), dias: parseInt(c.dias) };
      });

      // Top 10 conductores por km
      const topConductoresResult = await pool.query(`
        SELECT conductor,
          COUNT(DISTINCT patente) as camiones,
          COUNT(*) as cargas,
          ROUND(SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 5000
            THEN km_actual::float - km_anterior::float ELSE 0 END)::numeric) as km,
          ROUND(SUM(litros_surtidor)::numeric) as litros
        FROM cargas
        WHERE fecha::text >= $1 AND fecha::text <= ($2 || 'T23:59:59')
          ${faenaFilter}
          AND conductor IS NOT NULL AND conductor != ''
        GROUP BY conductor
        ORDER BY km DESC
        LIMIT 10
      `, baseParams);

      const topConductores = topConductoresResult.rows.map((c: any) => {
        const km = parseFloat(c.km || "0");
        const lt = parseFloat(c.litros || "0");
        return { conductor: c.conductor, camiones: parseInt(c.camiones), km: Math.round(km), rendimiento: lt > 0 ? Math.round((km / lt) * 100) / 100 : 0, cargas: parseInt(c.cargas) };
      });

      // Por contrato
      const porContratoResult = await pool.query(`
        SELECT faena as contrato,
          COUNT(DISTINCT patente) as camiones,
          COUNT(*) as cargas,
          ROUND(SUM(litros_surtidor)::numeric) as litros,
          ROUND(SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 5000
            THEN km_actual::float - km_anterior::float ELSE 0 END)::numeric) as km
        FROM cargas
        WHERE fecha::text >= $1 AND fecha::text <= ($2 || 'T23:59:59')
          ${faenaFilter}
        GROUP BY faena ORDER BY km DESC
      `, baseParams);

      const porContrato = porContratoResult.rows.map((c: any) => {
        const km = parseFloat(c.km || "0");
        const lt = parseFloat(c.litros || "0");
        return { contrato: c.contrato, camiones: parseInt(c.camiones), km: Math.round(km), litros: Math.round(lt), rendimiento: lt > 0 ? Math.round((km / lt) * 100) / 100 : 0, cargas: parseInt(c.cargas) };
      });

      // Acumulado por dia
      const porDiaResult = await pool.query(`
        SELECT DATE(fecha::timestamp) as dia,
          COUNT(DISTINCT patente) as camiones,
          COUNT(*) as cargas,
          ROUND(SUM(litros_surtidor)::numeric) as litros,
          ROUND(SUM(CASE WHEN km_actual > km_anterior AND (km_actual::float - km_anterior::float) < 5000
            THEN km_actual::float - km_anterior::float ELSE 0 END)::numeric) as km
        FROM cargas
        WHERE fecha::text >= $1 AND fecha::text <= ($2 || 'T23:59:59')
          ${faenaFilter}
        GROUP BY DATE(fecha::timestamp) ORDER BY dia
      `, baseParams);

      const porDia = porDiaResult.rows.map((d: any) => ({
        fecha: d.dia, camiones: parseInt(d.camiones), cargas: parseInt(d.cargas),
        km: Math.round(parseFloat(d.km || "0")), litros: Math.round(parseFloat(d.litros || "0")),
      }));

      const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

      res.json({
        mes, anio,
        mes_nombre: meses[mes - 1],
        kpis: {
          camiones: parseInt(k.camiones || "0"),
          cargas: parseInt(k.total_cargas || "0"),
          km_total: Math.round(kmTotal),
          litros_total: Math.round(litrosTotal),
          rendimiento_promedio: rendPromedio,
          dias_operacion: parseInt(k.dias_operacion || "0"),
          conductores: parseInt(k.conductores || "0"),
        },
        top_camiones: topCamiones,
        top_conductores: topConductores,
        por_contrato: porContrato,
        por_dia: porDia,
      });
    } catch (err: any) {
      console.error("[RESUMEN-MES] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════
  // IRREGULARIDADES DE COMBUSTIBLE
  // ═══════════════════════════════════════════════
  // GESTIÓN DE IRREGULARIDADES
  // ═══════════════════════════════════════════════
  app.post("/api/estaciones/irregularidades/gestionar", async (req, res) => {
    try {
      const { carga_id, patente, tipo, decision, nota } = req.body;
      // decision: "OK" | "FRAUDE" | "ERROR_DATO" | "REVISAR"
      await pool.query(`
        CREATE TABLE IF NOT EXISTS irregularidades_gestionadas (
          id serial PRIMARY KEY,
          carga_id int,
          patente text,
          tipo text NOT NULL,
          decision text NOT NULL,
          nota text,
          fecha_gestion timestamp DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO irregularidades_gestionadas (carga_id, patente, tipo, decision, nota)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [carga_id || null, patente, tipo, decision, nota || null]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/estaciones/irregularidades/gestionadas", async (_req, res) => {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS irregularidades_gestionadas (id serial PRIMARY KEY, carga_id int, patente text, tipo text NOT NULL, decision text NOT NULL, nota text, fecha_gestion timestamp DEFAULT NOW())`);
      const r = await pool.query(`
        SELECT ig.*, c.proveedor as estacion, c.conductor, c.fecha::text as fecha_carga,
          c.litros_surtidor::float as litros, c.km_anterior::float as km_ant, c.km_actual::float as km_act
        FROM irregularidades_gestionadas ig
        LEFT JOIN cargas c ON c.id = ig.carga_id
        ORDER BY ig.fecha_gestion DESC LIMIT 200
      `);
      const resumen = { total: r.rows.length, ok: r.rows.filter((x: any) => x.decision === "OK").length, fraude: r.rows.filter((x: any) => x.decision === "FRAUDE").length, error_dato: r.rows.filter((x: any) => x.decision === "ERROR_DATO").length, revisar: r.rows.filter((x: any) => x.decision === "REVISAR").length };
      res.json({ resumen, gestionadas: r.rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════
  app.get("/api/estaciones/irregularidades", async (req: any, res: any) => {
    try {
      const contrato = req.query.contrato as string || "TODOS";
      const dias = parseInt(req.query.dias as string || "30");
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      let cf = ""; const params: any[] = [desde];
      if (contrato !== "TODOS") { cf = "AND c.faena = $2"; params.push(contrato); }

      // Traer todas las cargas ordenadas por camion+fecha para análisis secuencial
      const allR = await pool.query(`
        SELECT c.id, c.patente, c.conductor, c.proveedor as estacion, c.fecha::text as fecha,
          c.km_anterior::float as km_ant, c.km_actual::float as km_act,
          c.litros_surtidor::float as litros, c.faena as contrato, c.num_guia
        FROM cargas c WHERE c.fecha >= $1 ${cf}
        ORDER BY c.patente, c.fecha
      `, params);

      const irregularidades: Record<string, any[]> = {
        error_digitacion: [], rend_sospechoso: [], doble_carga: [],
        litros_excesivo: [], km_no_avanza: [], km_cero: [],
      };
      const camMap = new Map<string, any>();

      for (let i = 0; i < allR.rows.length; i++) {
        const r = allR.rows[i];
        const km_entre = (r.km_act > r.km_ant && r.km_ant > 0) ? Math.round(r.km_act - r.km_ant) : null;
        const rend = (km_entre && km_entre > 0 && r.litros > 0) ? km_entre / r.litros : null;
        const base = { id: r.id, patente: r.patente, conductor: r.conductor, estacion: r.estacion, fecha: r.fecha, km_ant: Math.round(r.km_ant || 0), km_act: Math.round(r.km_act || 0), litros: Math.round(r.litros), contrato: r.contrato, km_entre, rendimiento: rend ? Math.round(rend * 100) / 100 : null };

        if (!camMap.has(r.patente)) camMap.set(r.patente, { patente: r.patente, contrato: r.contrato, total_cargas: 0, litros_total: 0, error_digitacion: 0, rend_sospechoso: 0, doble_carga: 0, litros_excesivo: 0, km_cero: 0, km_no_avanza: 0 });
        const cam = camMap.get(r.patente)!;
        cam.total_cargas++; cam.litros_total += r.litros;

        // ERROR DIGITACION: km retrocede O salta >50,000
        if (r.km_ant > 100 && r.km_act > 100) {
          if (r.km_act < r.km_ant) {
            const ratio = r.km_ant / r.km_act;
            irregularidades.error_digitacion.push({ ...base, tipo_error: ratio > 5 ? "Digito faltante" : "Retroceso", diferencia: Math.round(r.km_ant - r.km_act) });
            cam.error_digitacion++;
          } else if (km_entre && km_entre > 50000) {
            irregularidades.error_digitacion.push({ ...base, tipo_error: "Salto excesivo", diferencia: km_entre });
            cam.error_digitacion++;
          }
        }

        // RENDIMIENTO SOSPECHOSO: solo si km válido (50-3000), excluye errores de dígito
        if (km_entre && km_entre >= 50 && km_entre <= 3000 && rend) {
          if (rend > 6) {
            irregularidades.rend_sospechoso.push({ ...base, razon: rend.toFixed(1) + " km/L — muy alto, posible carga parcial" });
            cam.rend_sospechoso++;
          } else if (rend < 0.3 && r.litros > 50) {
            irregularidades.rend_sospechoso.push({ ...base, razon: rend.toFixed(2) + " km/L — muy bajo, posible error de litros" });
            cam.rend_sospechoso++;
          }
        }

        // DOBLE CARGA: mismo camión <60min, excluye duplicados (mismo km = registro duplicado)
        if (i > 0 && allR.rows[i - 1].patente === r.patente) {
          const prev = allR.rows[i - 1];
          const diffSec = Math.abs(new Date(r.fecha).getTime() - new Date(prev.fecha).getTime()) / 1000;
          if (diffSec < 3600 && diffSec >= 1800) {
            const mismoKm = prev.km_act === r.km_act && prev.km_ant === r.km_ant;
            const mismoLt = Math.abs(prev.litros - r.litros) < 0.01;
            if (!mismoKm && !mismoLt) {
              const mismaEst = prev.estacion === r.estacion;
              const ltTotal = prev.litros + r.litros;
              // Clasificar automáticamente
              let clasificacion: "PROBABLE_LLENADO_2_ETAPAS" | "SOSPECHOSO" | "REVISAR" = "REVISAR";
              let severidad: "BAJA" | "MEDIA" | "ALTA" = "MEDIA";
              if (mismaEst && ltTotal <= 600) {
                clasificacion = "PROBABLE_LLENADO_2_ETAPAS";
                severidad = "BAJA";
              } else if (!mismaEst || ltTotal > 600) {
                clasificacion = "SOSPECHOSO";
                severidad = "ALTA";
              }
              irregularidades.doble_carga.push({
                id: r.id, patente: r.patente, conductor: r.conductor || prev.conductor, contrato: r.contrato,
                est1: prev.estacion, fecha1: prev.fecha, litros1: Math.round(prev.litros),
                est2: r.estacion, fecha2: r.fecha, litros2: Math.round(r.litros),
                minutos_entre: Math.round(diffSec / 60), litros_total: Math.round(ltTotal),
                guia1: prev.num_guia, guia2: r.num_guia,
                misma_estacion: mismaEst, clasificacion, severidad,
              });
              cam.doble_carga++;
            }
          }
        }

        // LITROS EXCESIVO (>600 en 1 carga)
        if (r.litros > 600) { irregularidades.litros_excesivo.push(base); cam.litros_excesivo++; }

        // KM NO AVANZA: cargó >50lt pero hizo <5km
        if (r.km_ant > 100 && r.km_act > 100 && km_entre !== null && km_entre >= 0 && km_entre < 5 && r.litros > 50) {
          irregularidades.km_no_avanza.push({ ...base, razon: Math.round(r.litros) + " litros pero " + km_entre + " km" });
          cam.km_no_avanza++;
        }

        // SIN ODOMETRO
        if ((r.km_act === 0 || r.km_ant === 0) && r.litros > 20) { irregularidades.km_cero.push(base); cam.km_cero++; }
      }

      for (const k of Object.keys(irregularidades)) irregularidades[k] = irregularidades[k].slice(0, 80);

      const camiones = Array.from(camMap.values())
        .map(c => ({ ...c, litros_total: Math.round(c.litros_total), irregularidades: c.error_digitacion + c.rend_sospechoso + c.doble_carga + c.litros_excesivo + c.km_no_avanza }))
        .filter(c => c.irregularidades > 0).sort((a, b) => b.irregularidades - a.irregularidades).slice(0, 30);

      res.json({
        resumen: {
          error_digitacion: irregularidades.error_digitacion.length, rend_sospechoso: irregularidades.rend_sospechoso.length,
          doble_carga: irregularidades.doble_carga.length, litros_excesivo: irregularidades.litros_excesivo.length,
          km_no_avanza: irregularidades.km_no_avanza.length, km_cero: irregularidades.km_cero.length,
          camiones_irregulares: camiones.length,
          total: Object.values(irregularidades).reduce((s, arr) => s + arr.length, 0),
        },
        irregularidades, camiones_irregulares: camiones,
      });
    } catch (e: any) { console.error("[IRREGULARIDADES]", e.message); res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════
  // ESTACIONES — Dashboard completo de bencineras
  // ═══════════════════════════════════════════════
  app.get("/api/estaciones/dashboard", async (req, res) => {
    try {
      const contrato = req.query.contrato as string || "TODOS";
      const dias = parseInt(req.query.dias as string || "30");
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

      let cFilter = "";
      const params: any[] = [desde];
      if (contrato !== "TODOS") { cFilter = "AND c.faena = $2"; params.push(contrato); }

      // Estaciones con stats
      const estR = await pool.query(`
        SELECT c.proveedor as nombre, COUNT(*) as cargas, COUNT(DISTINCT c.patente) as camiones,
          COUNT(DISTINCT c.conductor) FILTER (WHERE c.conductor IS NOT NULL AND c.conductor != '') as conductores,
          ROUND(SUM(c.litros_surtidor)::numeric) as litros,
          ROUND(AVG(c.litros_surtidor)::numeric) as litros_prom,
          MIN(c.fecha)::text as primera, MAX(c.fecha)::text as ultima,
          gb.lat::float as lat, gb.lng::float as lng
        FROM cargas c
        LEFT JOIN geo_bases gb ON LOWER(gb.nombre) = LOWER(c.proveedor)
        WHERE c.fecha >= $1 ${cFilter}
        GROUP BY c.proveedor, gb.lat, gb.lng
        ORDER BY cargas DESC
      `, params);

      // Conductores con stats
      const condR = await pool.query(`
        SELECT c.conductor, COUNT(*) as cargas, COUNT(DISTINCT c.patente) as camiones,
          COUNT(DISTINCT c.proveedor) as estaciones, ROUND(SUM(c.litros_surtidor)::numeric) as litros,
          ROUND(AVG(c.litros_surtidor)::numeric) as litros_prom,
          MAX(c.fecha)::text as ultima,
          ARRAY_AGG(DISTINCT c.proveedor ORDER BY c.proveedor) as estaciones_lista
        FROM cargas c
        WHERE c.fecha >= $1 AND c.conductor IS NOT NULL AND c.conductor != '' ${cFilter}
        GROUP BY c.conductor ORDER BY cargas DESC
      `, params);

      // Por día
      const diaR = await pool.query(`
        SELECT DATE(c.fecha::timestamp) as fecha, COUNT(*) as cargas,
          ROUND(SUM(c.litros_surtidor)::numeric) as litros, COUNT(DISTINCT c.patente) as camiones
        FROM cargas c WHERE c.fecha >= $1 ${cFilter}
        GROUP BY DATE(c.fecha::timestamp) ORDER BY fecha
      `, params);

      // Resumen
      const totalCargas = estR.rows.reduce((s: number, r: any) => s + parseInt(r.cargas), 0);
      const totalLitros = estR.rows.reduce((s: number, r: any) => s + parseInt(r.litros || "0"), 0);
      const conGeo = estR.rows.filter((r: any) => r.lat && r.lng).length;

      res.json({
        resumen: { cargas: totalCargas, litros: totalLitros, estaciones: estR.rows.length, con_geo: conGeo, conductores: condR.rows.length },
        estaciones: estR.rows.map((r: any) => ({
          nombre: r.nombre, cargas: parseInt(r.cargas), camiones: parseInt(r.camiones),
          conductores: parseInt(r.conductores), litros: parseInt(r.litros || "0"),
          litros_prom: parseInt(r.litros_prom || "0"), lat: r.lat, lng: r.lng,
          primera: r.primera, ultima: r.ultima,
        })),
        conductores: condR.rows.map((r: any) => ({
          conductor: r.conductor, cargas: parseInt(r.cargas), camiones: parseInt(r.camiones),
          estaciones: parseInt(r.estaciones), litros: parseInt(r.litros || "0"),
          litros_prom: parseInt(r.litros_prom || "0"), ultima: r.ultima,
          estaciones_lista: r.estaciones_lista || [],
        })),
        por_dia: diaR.rows.map((r: any) => ({ fecha: r.fecha, cargas: parseInt(r.cargas), litros: parseInt(r.litros || "0"), camiones: parseInt(r.camiones) })),
      });
    } catch (e: any) { console.error("[ESTACIONES-DASH]", e.message); res.status(500).json({ error: e.message }); }
  });

  // Detalle estación
  app.get("/api/estaciones/detalle/:nombre", async (req, res) => {
    try {
      const nombre = req.params.nombre;
      const cargas = await pool.query(`
        SELECT c.id, c.patente, c.conductor, c.fecha::text as fecha, c.litros_surtidor as litros,
          c.km_anterior::float as km_ant, c.km_actual::float as km_act, c.faena as contrato, c.num_guia
        FROM cargas c WHERE c.proveedor = $1 AND c.fecha >= NOW() - INTERVAL '30 days'
        ORDER BY c.fecha DESC LIMIT 100
      `, [nombre]);
      // Conductores en esta estación
      const conds = await pool.query(`
        SELECT conductor, COUNT(*) as cargas, COUNT(DISTINCT patente) as camiones,
          ROUND(SUM(litros_surtidor)::numeric) as litros, MAX(fecha)::text as ultima
        FROM cargas WHERE proveedor = $1 AND conductor IS NOT NULL AND conductor != '' AND fecha >= NOW() - INTERVAL '30 days'
        GROUP BY conductor ORDER BY cargas DESC
      `, [nombre]);
      res.json({ nombre, total: cargas.rows.length, cargas: cargas.rows, conductores: conds.rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Detalle conductor
  app.get("/api/estaciones/conductor/:nombre", async (req, res) => {
    try {
      const nombre = decodeURIComponent(req.params.nombre);
      const cargas = await pool.query(`
        SELECT c.id, c.patente, c.proveedor as estacion, c.fecha::text as fecha, c.litros_surtidor as litros,
          c.km_anterior::float as km_ant, c.km_actual::float as km_act, c.faena as contrato
        FROM cargas c WHERE c.conductor = $1 AND c.fecha >= NOW() - INTERVAL '30 days'
        ORDER BY c.fecha DESC LIMIT 100
      `, [nombre]);
      res.json({ conductor: nombre, total: cargas.rows.length, cargas: cargas.rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════
  // ACUMULACION — Viajes agrupados por ruta similar
  // ═══════════════════════════════════════════════
  app.get("/api/rutas/acumulacion", async (req, res) => {
    try {
      const contrato = req.query.contrato as string || "TODOS";
      const dias = parseInt(req.query.dias as string || "30");
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

      let contratoFilter = "";
      const params: any[] = [desde];
      if (contrato !== "TODOS") {
        contratoFilter = "AND va.contrato = $2";
        params.push(contrato);
      }

      // Rutas agrupadas por origen-destino (nombre) con stats
      const rutasR = await pool.query(`
        SELECT
          COALESCE(NULLIF(va.origen_nombre, 'Punto desconocido'), ROUND(va.origen_lat::numeric, 2) || ',' || ROUND(va.origen_lng::numeric, 2)) as origen,
          COALESCE(NULLIF(va.destino_nombre, 'Punto desconocido'), ROUND(va.destino_lat::numeric, 2) || ',' || ROUND(va.destino_lng::numeric, 2)) as destino,
          va.contrato,
          COUNT(*) as viajes,
          COUNT(DISTINCT va.camion_id) as camiones,
          COUNT(DISTINCT DATE(va.fecha_inicio)) as dias_activos,
          ROUND(AVG(va.km_ecu::float)::numeric) as km_promedio,
          ROUND(STDDEV(va.km_ecu::float)::numeric) as km_desviacion,
          ROUND(AVG(va.rendimiento_real::float) FILTER (WHERE va.rendimiento_real::float > 0.5)::numeric, 2) as rend_promedio,
          ROUND(MIN(va.rendimiento_real::float) FILTER (WHERE va.rendimiento_real::float > 0.5)::numeric, 2) as rend_min,
          ROUND(MAX(va.rendimiento_real::float) FILTER (WHERE va.rendimiento_real::float > 0.5 AND va.rendimiento_real::float < 10)::numeric, 2) as rend_max,
          ROUND(AVG(va.duracion_minutos::float) FILTER (WHERE va.duracion_minutos::float > 0)::numeric) as duracion_prom_min,
          MIN(va.fecha_inicio)::text as primer_viaje,
          MAX(va.fecha_inicio)::text as ultimo_viaje,
          AVG(va.origen_lat::float) as origen_lat,
          AVG(va.origen_lng::float) as origen_lng,
          AVG(va.destino_lat::float) as destino_lat,
          AVG(va.destino_lng::float) as destino_lng,
          -- Consistencia: % de viajes dentro de +-20% del km promedio
          ROUND(
            COUNT(*) FILTER (WHERE ABS(va.km_ecu::float - (SELECT AVG(v2.km_ecu::float) FROM viajes_aprendizaje v2 WHERE v2.origen_nombre = va.origen_nombre AND v2.destino_nombre = va.destino_nombre AND v2.contrato = va.contrato)) < (SELECT AVG(v3.km_ecu::float) FROM viajes_aprendizaje v3 WHERE v3.origen_nombre = va.origen_nombre AND v3.destino_nombre = va.destino_nombre AND v3.contrato = va.contrato) * 0.2)::numeric
            / NULLIF(COUNT(*), 0) * 100, 0
          ) as consistencia_pct
        FROM viajes_aprendizaje va
        WHERE va.fecha_inicio >= $1
          AND va.km_ecu::float > 20
          AND va.origen_lat IS NOT NULL AND va.destino_lat IS NOT NULL
          ${contratoFilter}
        GROUP BY origen, destino, va.contrato
        HAVING COUNT(*) >= 2
        ORDER BY viajes DESC
      `, params);

      // Resumen global
      const totalViajes = rutasR.rows.reduce((s: number, r: any) => s + parseInt(r.viajes), 0);
      const totalRutas = rutasR.rows.length;
      const rutasConNombre = rutasR.rows.filter((r: any) => !r.origen.includes(",") && !r.destino.includes(",")).length;

      // Top camiones por ruta
      const topCamR = await pool.query(`
        SELECT c.patente, va.contrato, COUNT(*) as viajes,
          COUNT(DISTINCT (COALESCE(NULLIF(va.origen_nombre,'Punto desconocido'),'?') || '>' || COALESCE(NULLIF(va.destino_nombre,'Punto desconocido'),'?'))) as rutas_distintas,
          ROUND(AVG(va.rendimiento_real::float) FILTER (WHERE va.rendimiento_real::float > 0.5)::numeric, 2) as rend
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= $1 AND va.km_ecu::float > 20
          ${contratoFilter}
        GROUP BY c.patente, va.contrato
        ORDER BY viajes DESC LIMIT 20
      `, params);

      // Viajes por día para gráfico
      const porDiaR = await pool.query(`
        SELECT DATE(fecha_inicio) as fecha, COUNT(*) as viajes, COUNT(DISTINCT camion_id) as camiones,
          ROUND(AVG(km_ecu::float)::numeric) as km_prom,
          ROUND(AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0.5)::numeric, 2) as rend_prom
        FROM viajes_aprendizaje
        WHERE fecha_inicio >= $1 AND km_ecu::float > 20
          ${contratoFilter}
        GROUP BY DATE(fecha_inicio) ORDER BY fecha
      `, params);

      res.json({
        periodo: { desde, hasta: new Date().toISOString().slice(0, 10), dias },
        resumen: { total_viajes: totalViajes, rutas_unicas: totalRutas, rutas_con_nombre: rutasConNombre, pct_nombre: totalRutas > 0 ? Math.round(rutasConNombre / totalRutas * 100) : 0 },
        rutas: rutasR.rows.map((r: any) => ({
          origen: r.origen, destino: r.destino, contrato: r.contrato,
          viajes: parseInt(r.viajes), camiones: parseInt(r.camiones), dias_activos: parseInt(r.dias_activos),
          km_promedio: parseInt(r.km_promedio || "0"), km_desviacion: parseInt(r.km_desviacion || "0"),
          rend_promedio: parseFloat(r.rend_promedio || "0"), rend_min: parseFloat(r.rend_min || "0"), rend_max: parseFloat(r.rend_max || "0"),
          duracion_prom_min: parseInt(r.duracion_prom_min || "0"),
          primer_viaje: r.primer_viaje, ultimo_viaje: r.ultimo_viaje,
          origen_lat: parseFloat(r.origen_lat), origen_lng: parseFloat(r.origen_lng),
          destino_lat: parseFloat(r.destino_lat), destino_lng: parseFloat(r.destino_lng),
          consistencia_pct: parseInt(r.consistencia_pct || "0"),
          es_circular: r.origen === r.destino,
        })),
        camiones: topCamR.rows.map((r: any) => ({
          patente: r.patente, contrato: r.contrato, viajes: parseInt(r.viajes),
          rutas_distintas: parseInt(r.rutas_distintas), rend: parseFloat(r.rend || "0"),
        })),
        por_dia: porDiaR.rows.map((r: any) => ({
          fecha: r.fecha, viajes: parseInt(r.viajes), camiones: parseInt(r.camiones),
          km_prom: parseInt(r.km_prom || "0"), rend_prom: parseFloat(r.rend_prom || "0"),
        })),
      });
    } catch (e: any) { console.error("[ACUMULACION]", e.message); res.status(500).json({ error: e.message }); }
  });

  // Detalle de una ruta específica
  app.get("/api/rutas/acumulacion/detalle", async (req, res) => {
    try {
      const { origen, destino, contrato } = req.query;
      if (!origen || !destino || !contrato) return res.status(400).json({ error: "origen, destino, contrato requeridos" });

      const viajes = await pool.query(`
        SELECT va.id, c.patente, va.contrato, va.fecha_inicio::text as fecha, va.fecha_fin::text as fecha_fin,
          va.km_ecu::float as km, va.rendimiento_real::float as rendimiento, va.duracion_minutos::int as duracion,
          va.origen_nombre, va.destino_nombre, va.origen_lat::float as o_lat, va.origen_lng::float as o_lng,
          va.destino_lat::float as d_lat, va.destino_lng::float as d_lng, va.snap_count::int as snaps
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        WHERE COALESCE(NULLIF(va.origen_nombre, 'Punto desconocido'), ROUND(va.origen_lat::numeric, 2) || ',' || ROUND(va.origen_lng::numeric, 2)) = $1
          AND COALESCE(NULLIF(va.destino_nombre, 'Punto desconocido'), ROUND(va.destino_lat::numeric, 2) || ',' || ROUND(va.destino_lng::numeric, 2)) = $2
          AND va.contrato = $3 AND va.km_ecu::float > 20
        ORDER BY va.fecha_inicio DESC
      `, [origen, destino, contrato]);

      res.json({ origen, destino, contrato, total: viajes.rows.length, viajes: viajes.rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  console.log("[RUTAS-GPS] Rutas GPS routes registered");
}
