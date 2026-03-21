import type { Express } from "express";
import { pool } from "./db";
import { buscarLugarCercano } from "./viajes-historico";

export function registerRutasGpsRoutes(app: Express) {

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
        WHERE g.timestamp_punto >= ($1::date) AND g.timestamp_punto < ($1::date + interval '1 day') ${whereContrato}
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

  console.log("[RUTAS-GPS] Rutas GPS routes registered");
}
