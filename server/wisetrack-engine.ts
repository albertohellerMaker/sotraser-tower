/**
 * WISETRACK ENGINE — Réplica del motor de viajes de Volvo Connect
 * pero alimentado por snapshots de WiseTrack + Sigetra
 *
 * Pipeline: wisetrack_snapshots → wt_viajes → wt_productividad_diaria
 * Independiente del pipeline Volvo (viajes_aprendizaje)
 */

import { pool } from "./db";
import { getWisetrackFleet } from "./wisetrack-api";

// ── TABLES ──

export async function initWisetrackTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wt_viajes (
      id serial PRIMARY KEY,
      patente text NOT NULL,
      patente_norm text NOT NULL,
      movil text,
      contrato text,
      conductor text,
      fecha_inicio timestamp,
      fecha_fin timestamp,
      lat_inicio float,
      lng_inicio float,
      lat_fin float,
      lng_fin float,
      origen_nombre text,
      destino_nombre text,
      km_viaje float DEFAULT 0,
      km_total_inicio float DEFAULT 0,
      km_total_fin float DEFAULT 0,
      consumo_litros float DEFAULT 0,
      rendimiento float DEFAULT 0,
      velocidad_max float DEFAULT 0,
      velocidad_prom float DEFAULT 0,
      tiempo_conduccion int DEFAULT 0,
      tiempo_ralenti int DEFAULT 0,
      snap_count int DEFAULT 0,
      estado text DEFAULT 'ABIERTO',
      creado_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_wt_viajes_patente ON wt_viajes (patente_norm);
    CREATE INDEX IF NOT EXISTS idx_wt_viajes_fecha ON wt_viajes (fecha_inicio);
    CREATE INDEX IF NOT EXISTS idx_wt_viajes_contrato ON wt_viajes (contrato);

    CREATE TABLE IF NOT EXISTS wt_productividad_diaria (
      id serial PRIMARY KEY,
      patente_norm text NOT NULL,
      fecha date NOT NULL,
      contrato text,
      km_dia float DEFAULT 0,
      rendimiento_dia float DEFAULT 0,
      viajes_completados int DEFAULT 0,
      horas_conduccion float DEFAULT 0,
      horas_ralenti float DEFAULT 0,
      consumo_litros float DEFAULT 0,
      velocidad_max float DEFAULT 0,
      activo boolean DEFAULT false,
      creado_at timestamp DEFAULT now(),
      UNIQUE(patente_norm, fecha)
    );
    CREATE INDEX IF NOT EXISTS idx_wt_prod_fecha ON wt_productividad_diaria (fecha);
  `);
  console.log("[WT-ENGINE] Tables initialized");
}

// ── TRIP DETECTION ──
// WiseTrack already provides trip data per vehicle:
// Fecha_Inicio_Ult_Viaje, Fecha_Fin_Ult_Viaje, Kms, ConsumoLitros_Conduccion
// We just need to capture completed trips and avoid duplicates

export async function procesarViajesWisetrack(): Promise<{ viajes_creados: number; viajes_cerrados: number }> {
  const fleet = await getWisetrackFleet();
  if (!fleet.length) return { viajes_creados: 0, viajes_cerrados: 0 };

  let creados = 0;

  for (const v of fleet) {
    const patNorm = (v.MOV_PATENTE || "").replace(/-/g, "").toUpperCase();
    if (!patNorm) continue;

    const kmViaje = v.Kms || 0;
    const inicioViaje = v.Fecha_Inicio_Ult_Viaje;
    const finViaje = v.Fecha_Fin_Ult_Viaje;
    const consumo = parseFloat(v.ConsumoLitros_Conduccion) || 0;
    const vel = parseFloat(v.Velocidad) || 0;

    // Only process if trip has ended (fin exists and vel=0) and km >= 5
    if (!inicioViaje || !finViaje || kmViaje < 5) continue;

    const fechaInicio = new Date(inicioViaje.replace(/\//g, "-"));
    const fechaFin = new Date(finViaje.replace(/\//g, "-"));

    // Skip if trip is still active (start == end or very recent end)
    if (vel > 3) continue;

    // Check for duplicate - same vehicle + same start time
    const existing = await pool.query(`
      SELECT id FROM wt_viajes
      WHERE patente_norm = $1
        AND ABS(EXTRACT(EPOCH FROM (fecha_inicio - $2::timestamp))) < 120
      LIMIT 1
    `, [patNorm, fechaInicio]);

    if (existing.rows.length > 0) continue;

    // Calculate rendimiento
    const rendimiento = consumo > 0 ? Math.round(kmViaje / consumo * 100) / 100 : 0;

    // Get location names
    const origen = await buscarLugarWt(v.Latitud, v.Longitud);
    const destino = origen; // WT only gives current position

    try {
      await pool.query(`
        INSERT INTO wt_viajes (patente, patente_norm, movil, contrato, conductor,
          fecha_inicio, fecha_fin, lat_inicio, lng_inicio, lat_fin, lng_fin,
          km_viaje, km_total_inicio, km_total_fin, consumo_litros, rendimiento,
          velocidad_max, tiempo_conduccion, tiempo_ralenti, snap_count, estado,
          origen_nombre, destino_nombre)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,1,'CERRADO',$20,$21)
      `, [
        v.MOV_PATENTE, patNorm, v.Movil, v.MOV_GRUPO1 || "",
        v.CONDUCTOR !== "-" ? v.CONDUCTOR : null,
        fechaInicio, fechaFin,
        v.Latitud, v.Longitud, v.Latitud, v.Longitud,
        Math.round(kmViaje * 10) / 10,
        (v.Kms_Total_Sincronizado || 0) - kmViaje,
        v.Kms_Total_Sincronizado || 0,
        consumo, rendimiento,
        0, // velocidad_max not available per trip
        v.Tiempo_Conduccion || 0,
        v.Tiempo_Ralenti || 0,
        origen, destino,
      ]);
      creados++;
    } catch (e: any) {
      // Skip duplicates
    }
  }

  if (creados > 0) {
    console.log(`[WT-ENGINE] Viajes: ${creados} nuevos cerrados`);
  }

  // Also run productivity
  if (creados > 0) {
    await procesarProductividadWt();
  }

  return { viajes_creados: creados, viajes_cerrados: creados };
}

// ── LOCATION LOOKUP ──

async function buscarLugarWt(lat: number, lng: number): Promise<string> {
  if (!lat || !lng) return "Punto desconocido";

  // Try geo_bases first (fuel stations)
  const geo = await pool.query(`
    SELECT nombre,
      SQRT(POWER((lat::float - $1) * 111, 2) + POWER((lng::float - $2) * 111 * COS(RADIANS($1)), 2)) as dist_km
    FROM geo_bases
    WHERE ABS(lat::float - $1) < 0.5 AND ABS(lng::float - $2) < 0.5
    ORDER BY dist_km ASC LIMIT 1
  `, [lat, lng]);

  if (geo.rows.length > 0 && geo.rows[0].dist_km < 5) {
    return geo.rows[0].nombre;
  }

  return "Punto desconocido";
}

// ── PRODUCTIVITY ──

export async function procesarProductividadWt(): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10);

  const r = await pool.query(`
    INSERT INTO wt_productividad_diaria (patente_norm, fecha, contrato, km_dia, rendimiento_dia,
      viajes_completados, horas_conduccion, horas_ralenti, consumo_litros, velocidad_max, activo)
    SELECT
      patente_norm,
      DATE(fecha_inicio) as fecha,
      MAX(contrato) as contrato,
      COALESCE(SUM(km_viaje), 0) as km,
      CASE WHEN SUM(consumo_litros) > 0 THEN ROUND((SUM(km_viaje) / SUM(consumo_litros))::numeric, 2) ELSE 0 END as rend,
      COUNT(*) as viajes,
      ROUND(SUM(tiempo_conduccion)::numeric / 60, 1) as horas_cond,
      ROUND(SUM(tiempo_ralenti)::numeric / 60, 1) as horas_ral,
      COALESCE(SUM(consumo_litros), 0),
      MAX(velocidad_max),
      true
    FROM wt_viajes
    WHERE estado = 'CERRADO'
      AND DATE(fecha_inicio) >= CURRENT_DATE - INTERVAL '3 days'
    GROUP BY patente_norm, DATE(fecha_inicio)
    ON CONFLICT (patente_norm, fecha) DO UPDATE SET
      km_dia = EXCLUDED.km_dia,
      rendimiento_dia = EXCLUDED.rendimiento_dia,
      viajes_completados = EXCLUDED.viajes_completados,
      horas_conduccion = EXCLUDED.horas_conduccion,
      consumo_litros = EXCLUDED.consumo_litros,
      velocidad_max = EXCLUDED.velocidad_max,
      activo = true
    RETURNING id
  `);

  console.log(`[WT-ENGINE] Productividad: ${r.rowCount} registros`);
  return r.rowCount || 0;
}

// ── ROUTES FOR WT ENGINE ──

export function registerWtEngineRoutes(app: any) {
  // Viajes del día (replica /api/rutas/viajes-dia)
  app.get("/api/wt/viajes-dia", async (req: any, res: any) => {
    try {
      const fecha = req.query.fecha || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const contrato = req.query.contrato as string;

      let sql = `
        SELECT id, patente, patente_norm, movil, contrato, conductor,
          fecha_inicio, fecha_fin, lat_inicio, lng_inicio, lat_fin, lng_fin,
          origen_nombre, destino_nombre, km_viaje, consumo_litros, rendimiento,
          velocidad_max, velocidad_prom, tiempo_conduccion, tiempo_ralenti, snap_count, estado
        FROM wt_viajes
        WHERE DATE(fecha_inicio) = $1
          AND estado = 'CERRADO'
          AND km_viaje >= 5
      `;
      const params: any[] = [fecha];

      if (contrato && contrato !== "TODOS") {
        sql += ` AND contrato = $2`;
        params.push(contrato);
      }

      sql += ` ORDER BY fecha_inicio DESC`;

      const r = await pool.query(sql, params);

      // Get unique vehicles
      const camiones = new Map<string, any>();
      for (const v of r.rows) {
        if (!camiones.has(v.patente_norm)) {
          camiones.set(v.patente_norm, {
            patente: v.patente, patente_norm: v.patente_norm, movil: v.movil,
            contrato: v.contrato, conductor: v.conductor,
            viajes: 0, km_total: 0, rendimiento_prom: 0, consumo_total: 0,
          });
        }
        const c = camiones.get(v.patente_norm)!;
        c.viajes++;
        c.km_total += v.km_viaje || 0;
        c.consumo_total += v.consumo_litros || 0;
      }

      // Calculate avg rendimiento
      for (const c of camiones.values()) {
        c.rendimiento_prom = c.consumo_total > 0 ? Math.round(c.km_total / c.consumo_total * 100) / 100 : 0;
      }

      // Contratos for filters
      const contratos = new Map<string, number>();
      r.rows.forEach((v: any) => {
        const c = v.contrato || "SIN CONTRATO";
        contratos.set(c, (contratos.get(c) || 0) + 1);
      });

      res.json({
        fecha,
        total_viajes: r.rows.length,
        total_camiones: camiones.size,
        contratos: Array.from(contratos.entries()).map(([c, n]) => ({ contrato: c, viajes: n })).sort((a, b) => b.viajes - a.viajes),
        camiones: Array.from(camiones.values()).sort((a, b) => b.km_total - a.km_total),
        viajes: r.rows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Detalle mes de un camión (replica /api/camion/mes-completo)
  app.get("/api/wt/camion-mes/:patente", async (req: any, res: any) => {
    try {
      const patNorm = req.params.patente.replace(/-/g, "").toUpperCase();
      const mes = parseInt(req.query.mes as string) || new Date().getMonth() + 1;
      const anio = parseInt(req.query.anio as string) || new Date().getFullYear();

      const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const finMes = new Date(anio, mes, 0).toISOString().slice(0, 10);

      // Productividad diaria
      const prod = await pool.query(`
        SELECT fecha::text, km_dia, rendimiento_dia, viajes_completados,
          horas_conduccion, consumo_litros, velocidad_max, activo
        FROM wt_productividad_diaria
        WHERE patente_norm = $1 AND fecha >= $2 AND fecha <= $3
        ORDER BY fecha
      `, [patNorm, inicioMes, finMes]);

      // Cargas Sigetra
      const cargasR = await pool.query(`
        SELECT fecha::text, litros_surtidor, proveedor as estacion, conductor,
          km_anterior::float as km_ant, km_actual::float as km_act
        FROM cargas
        WHERE UPPER(REPLACE(patente, '-', '')) = $1
          AND fecha >= $2 AND fecha <= $3
        ORDER BY fecha
      `, [patNorm, inicioMes, finMes]);

      // Build calendar
      const diasMes = new Date(anio, mes, 0).getDate();
      const calendario = [];
      for (let d = 1; d <= diasMes; d++) {
        const fechaStr = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const prod_dia = prod.rows.find((p: any) => p.fecha === fechaStr);
        const cargas_dia = cargasR.rows.filter((c: any) => c.fecha?.startsWith(fechaStr));

        calendario.push({
          fecha: fechaStr,
          dia: d,
          km: prod_dia ? prod_dia.km_dia : 0,
          rendimiento: prod_dia ? prod_dia.rendimiento_dia : 0,
          viajes: prod_dia ? prod_dia.viajes_completados : 0,
          horas_ruta: prod_dia ? prod_dia.horas_conduccion : 0,
          activo: prod_dia?.activo || cargas_dia.length > 0,
          fuente: prod_dia ? "wisetrack" : cargas_dia.length > 0 ? "sigetra" : "sin_datos",
          cargas_dia: cargas_dia.length,
          litros_dia: cargas_dia.reduce((s: number, c: any) => s + (c.litros_surtidor || 0), 0),
        });
      }

      // Acumulado
      const acumulado = {
        km_mes: prod.rows.reduce((s: number, p: any) => s + (p.km_dia || 0), 0),
        litros_mes: cargasR.rows.reduce((s: number, c: any) => s + (c.litros_surtidor || 0), 0),
        viajes_mes: prod.rows.reduce((s: number, p: any) => s + (p.viajes_completados || 0), 0),
        dias_activos: prod.rows.filter((p: any) => p.activo).length,
        dias_mes: diasMes,
        rendimiento_promedio: 0,
      };
      acumulado.rendimiento_promedio = acumulado.litros_mes > 0
        ? Math.round(acumulado.km_mes / acumulado.litros_mes * 100) / 100 : 0;

      res.json({
        patente: patNorm, mes, anio,
        calendario, acumulado,
        cargas: cargasR.rows.map((c: any) => ({
          fecha: c.fecha, litros: c.litros_surtidor, estacion: c.estacion,
          conductor: c.conductor, km_ant: c.km_ant, km_act: c.km_act,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stats globales WT
  app.get("/api/wt/stats", async (_req: any, res: any) => {
    try {
      const [viajes, prod, snap] = await Promise.all([
        pool.query(`
          SELECT COUNT(*) as total, COUNT(DISTINCT patente_norm) as camiones,
            COUNT(DISTINCT contrato) as contratos,
            ROUND(AVG(km_viaje)::numeric, 0) as km_prom,
            ROUND(AVG(rendimiento) FILTER (WHERE rendimiento > 0 AND rendimiento < 10)::numeric, 2) as rend_prom
          FROM wt_viajes WHERE estado = 'CERRADO'
        `),
        pool.query(`
          SELECT COUNT(*) as total, COUNT(DISTINCT patente_norm) as camiones, MAX(fecha)::text as ultimo
          FROM wt_productividad_diaria
        `),
        pool.query(`SELECT COUNT(*) as total, MAX(captured_at)::text as ultimo FROM wisetrack_snapshots`),
      ]);

      res.json({
        viajes: viajes.rows[0],
        productividad: prod.rows[0],
        snapshots: snap.rows[0],
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Resumen mes (replica /api/resumen-mes)
  app.get("/api/wt/resumen-mes", async (req: any, res: any) => {
    try {
      const contrato = req.query.contrato as string;
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      let filtro = "";
      const params: any[] = [inicioMes];
      if (contrato && contrato !== "TODOS") {
        filtro = " AND contrato = $2";
        params.push(contrato);
      }

      const r = await pool.query(`
        SELECT
          COUNT(*) as viajes,
          COUNT(DISTINCT patente_norm) as camiones,
          ROUND(SUM(km_viaje)::numeric) as km_total,
          ROUND(AVG(rendimiento) FILTER (WHERE rendimiento > 0 AND rendimiento < 10)::numeric, 2) as rend_prom,
          ROUND(AVG(km_viaje)::numeric) as km_prom,
          COUNT(DISTINCT DATE(fecha_inicio)) as dias_activos
        FROM wt_viajes
        WHERE estado = 'CERRADO' AND fecha_inicio >= $1${filtro}
      `, params);

      // Por contrato
      const porContrato = await pool.query(`
        SELECT contrato, COUNT(*) as viajes, COUNT(DISTINCT patente_norm) as camiones,
          ROUND(SUM(km_viaje)::numeric) as km_total
        FROM wt_viajes
        WHERE estado = 'CERRADO' AND fecha_inicio >= $1
        GROUP BY contrato ORDER BY viajes DESC
      `, [inicioMes]);

      res.json({
        ...r.rows[0],
        por_contrato: porContrato.rows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── FLEET MANAGEMENT ENDPOINTS ──

  // 1. GET /api/wt/faenas - List all contracts/faenas with stats
  app.get("/api/wt/faenas", async (_req: any, res: any) => {
    try {
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [faenasR, liveR, cargasR] = await Promise.all([
        pool.query(`
          SELECT contrato,
            COUNT(DISTINCT patente_norm) as camiones,
            COUNT(*) as viajes,
            ROUND(SUM(km_viaje)::numeric) as km_total,
            ROUND(AVG(rendimiento) FILTER (WHERE rendimiento > 0 AND rendimiento < 10)::numeric, 2) as rend,
            COUNT(DISTINCT conductor) FILTER (WHERE conductor IS NOT NULL AND conductor != '') as conductores,
            ROUND(SUM(consumo_litros)::numeric) as litros_total,
            COUNT(DISTINCT DATE(fecha_inicio)) as dias_activos
          FROM wt_viajes
          WHERE estado='CERRADO' AND fecha_inicio >= $1
          GROUP BY contrato ORDER BY viajes DESC
        `, [inicioMes]),
        pool.query(`
          SELECT s.contrato, COUNT(DISTINCT s.patente_norm) as live_count
          FROM wisetrack_snapshots s
          WHERE s.captured_at >= (SELECT MAX(captured_at) - INTERVAL '10 minutes' FROM wisetrack_snapshots)
          GROUP BY s.contrato
        `),
        pool.query(`
          SELECT UPPER(REPLACE(c2.patente, '-', '')) as pat_norm, COUNT(*) as cargas_count
          FROM cargas c2
          WHERE c2.fecha >= $1
          GROUP BY UPPER(REPLACE(c2.patente, '-', ''))
        `, [inicioMes]),
      ]);

      const liveMap = new Map<string, number>();
      for (const r of liveR.rows) liveMap.set(r.contrato || "", parseInt(r.live_count) || 0);

      // Map cargas to contratos via wt_viajes patentes
      const patContratoMap = new Map<string, string>();
      const patContratoR = await pool.query(`
        SELECT DISTINCT patente_norm, contrato FROM wt_viajes WHERE contrato IS NOT NULL
      `);
      for (const r of patContratoR.rows) patContratoMap.set(r.patente_norm, r.contrato);

      const cargasPorContrato = new Map<string, number>();
      for (const c of cargasR.rows) {
        const ctr = patContratoMap.get(c.pat_norm) || "SIN CONTRATO";
        cargasPorContrato.set(ctr, (cargasPorContrato.get(ctr) || 0) + parseInt(c.cargas_count));
      }

      const faenas = faenasR.rows.map((f: any) => ({
        ...f,
        live_count: liveMap.get(f.contrato) || 0,
        cargas: cargasPorContrato.get(f.contrato) || 0,
      }));

      res.json({ faenas, mes: inicioMes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. GET /api/wt/faena/:contrato - Detail for one contract
  app.get("/api/wt/faena/:contrato", async (req: any, res: any) => {
    try {
      const contrato = decodeURIComponent(req.params.contrato);
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [camionesR, viajesR, cargasR, conductoresR] = await Promise.all([
        pool.query(`
          SELECT patente_norm, MAX(movil) as movil, MAX(patente) as patente,
            COUNT(*) as viajes, ROUND(SUM(km_viaje)::numeric) as km_total,
            ROUND(AVG(rendimiento) FILTER (WHERE rendimiento > 0 AND rendimiento < 10)::numeric, 2) as rend,
            ROUND(SUM(consumo_litros)::numeric) as litros
          FROM wt_viajes
          WHERE estado='CERRADO' AND contrato = $1 AND fecha_inicio >= $2
          GROUP BY patente_norm ORDER BY km_total DESC
        `, [contrato, inicioMes]),
        pool.query(`
          SELECT COUNT(*) as total, ROUND(SUM(km_viaje)::numeric) as km_total,
            ROUND(AVG(rendimiento) FILTER (WHERE rendimiento > 0 AND rendimiento < 10)::numeric, 2) as rend_prom,
            ROUND(SUM(consumo_litros)::numeric) as litros_total,
            COUNT(DISTINCT patente_norm) as camiones_activos,
            COUNT(DISTINCT DATE(fecha_inicio)) as dias_activos
          FROM wt_viajes WHERE estado='CERRADO' AND contrato = $1 AND fecha_inicio >= $2
        `, [contrato, inicioMes]),
        pool.query(`
          SELECT c2.fecha::text, c2.litros_surtidor, c2.proveedor as estacion,
            c2.conductor, UPPER(REPLACE(c2.patente, '-', '')) as pat_norm
          FROM cargas c2
          WHERE UPPER(REPLACE(c2.patente, '-', '')) IN (
            SELECT DISTINCT patente_norm FROM wt_viajes WHERE contrato = $1
          ) AND c2.fecha >= $2
          ORDER BY c2.fecha DESC
        `, [contrato, inicioMes]),
        pool.query(`
          SELECT conductor, COUNT(DISTINCT patente_norm) as camiones, COUNT(*) as viajes,
            ROUND(SUM(km_viaje)::numeric) as km_total
          FROM wt_viajes
          WHERE estado='CERRADO' AND contrato = $1 AND fecha_inicio >= $2
            AND conductor IS NOT NULL AND conductor != ''
          GROUP BY conductor ORDER BY viajes DESC
        `, [contrato, inicioMes]),
      ]);

      res.json({
        contrato,
        resumen: viajesR.rows[0],
        camiones: camionesR.rows,
        cargas: cargasR.rows,
        conductores: conductoresR.rows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. GET /api/wt/camion-detalle/:patente - Full detail for one vehicle
  app.get("/api/wt/camion-detalle/:patente", async (req: any, res: any) => {
    try {
      const patNorm = req.params.patente.replace(/-/g, "").toUpperCase();
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [liveR, viajesR, cargasR, prodR, conductoresR] = await Promise.all([
        // Latest WT snapshot
        pool.query(`
          SELECT s.movil, s.patente, s.contrato, s.conductor,
            s.lat, s.lng, s.velocidad,
            s.nivel_estanque, s.rpm,
            s.km_total, s.estado,
            s.temp_motor, s.captured_at
          FROM wisetrack_snapshots s
          WHERE s.patente_norm = $1
          ORDER BY s.captured_at DESC LIMIT 1
        `, [patNorm]),
        // Viajes del mes
        pool.query(`
          SELECT id, fecha_inicio, fecha_fin, origen_nombre, destino_nombre,
            km_viaje, consumo_litros, rendimiento, conductor, contrato
          FROM wt_viajes
          WHERE patente_norm = $1 AND estado='CERRADO' AND fecha_inicio >= $2
          ORDER BY fecha_inicio DESC
        `, [patNorm, inicioMes]),
        // Cargas Sigetra
        pool.query(`
          SELECT fecha::text, litros_surtidor, proveedor as estacion, conductor,
            km_anterior::float as km_ant, km_actual::float as km_act
          FROM cargas
          WHERE UPPER(REPLACE(patente, '-', '')) = $1 AND fecha >= $2
          ORDER BY fecha DESC
        `, [patNorm, inicioMes]),
        // Productividad diaria
        pool.query(`
          SELECT fecha::text, km_dia, rendimiento_dia, viajes_completados,
            horas_conduccion, consumo_litros, activo
          FROM wt_productividad_diaria
          WHERE patente_norm = $1 AND fecha >= $2
          ORDER BY fecha
        `, [patNorm, inicioMes]),
        // Conductor history
        pool.query(`
          SELECT conductor, COUNT(*) as viajes, MIN(fecha_inicio)::text as primera_vez,
            MAX(fecha_inicio)::text as ultima_vez
          FROM wt_viajes
          WHERE patente_norm = $1 AND conductor IS NOT NULL AND conductor != ''
          GROUP BY conductor ORDER BY ultima_vez DESC
        `, [patNorm]),
      ]);

      const viajes = viajesR.rows;
      const resumen = {
        viajes_mes: viajes.length,
        km_mes: viajes.reduce((s: number, v: any) => s + (v.km_viaje || 0), 0),
        litros_mes: viajes.reduce((s: number, v: any) => s + (v.consumo_litros || 0), 0),
        rend_prom: 0,
        cargas_mes: cargasR.rows.length,
        litros_sigetra: cargasR.rows.reduce((s: number, c: any) => s + (c.litros_surtidor || 0), 0),
      };
      resumen.rend_prom = resumen.litros_mes > 0
        ? Math.round(resumen.km_mes / resumen.litros_mes * 100) / 100 : 0;

      res.json({
        patente: patNorm,
        live: liveR.rows[0] || null,
        resumen,
        viajes,
        cargas: cargasR.rows,
        productividad: prodR.rows,
        conductores: conductoresR.rows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. GET /api/wt/conductores - All drivers with stats
  app.get("/api/wt/conductores", async (_req: any, res: any) => {
    try {
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [wtConductores, sigConductores] = await Promise.all([
        pool.query(`
          SELECT conductor as nombre,
            COUNT(DISTINCT patente_norm) as camiones,
            COUNT(*) as viajes,
            ROUND(SUM(km_viaje)::numeric) as km_total,
            ROUND(AVG(rendimiento) FILTER (WHERE rendimiento > 0 AND rendimiento < 10)::numeric, 2) as rend_prom,
            ROUND(SUM(consumo_litros)::numeric) as litros,
            MAX(contrato) as contrato_principal,
            MAX(fecha_inicio)::text as ultimo_viaje
          FROM wt_viajes
          WHERE estado='CERRADO' AND fecha_inicio >= $1
            AND conductor IS NOT NULL AND conductor != '' AND conductor != '-'
          GROUP BY conductor ORDER BY viajes DESC
        `, [inicioMes]),
        pool.query(`
          SELECT conductor as nombre, COUNT(*) as cargas,
            ROUND(SUM(litros_surtidor)::numeric) as litros_cargados,
            COUNT(DISTINCT UPPER(REPLACE(patente, '-', ''))) as camiones_cargados
          FROM cargas
          WHERE fecha >= $1 AND conductor IS NOT NULL AND conductor != ''
          GROUP BY conductor
        `, [inicioMes]),
      ]);

      // Merge: use WT as base, enrich with sigetra
      const sigMap = new Map<string, any>();
      for (const s of sigConductores.rows) sigMap.set(s.nombre?.toUpperCase(), s);

      const conductores = wtConductores.rows.map((c: any) => {
        const sig = sigMap.get(c.nombre?.toUpperCase());
        return {
          ...c,
          cargas: sig ? parseInt(sig.cargas) : 0,
          litros_cargados: sig ? parseFloat(sig.litros_cargados) : 0,
        };
      });

      // Add sigetra-only conductores
      for (const s of sigConductores.rows) {
        if (!wtConductores.rows.find((c: any) => c.nombre?.toUpperCase() === s.nombre?.toUpperCase())) {
          conductores.push({
            nombre: s.nombre,
            camiones: parseInt(s.camiones_cargados),
            viajes: 0, km_total: 0, rend_prom: null, litros: 0,
            contrato_principal: null, ultimo_viaje: null,
            cargas: parseInt(s.cargas),
            litros_cargados: parseFloat(s.litros_cargados),
          });
        }
      }

      res.json({ conductores, total: conductores.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 5. GET /api/wt/estaciones-wt - Fuel stations with WT vehicle proximity
  app.get("/api/wt/estaciones-wt", async (_req: any, res: any) => {
    try {
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [estacionesR, vehiculosR, cargasR] = await Promise.all([
        pool.query(`
          SELECT id, nombre, lat::float, lng::float, radio_metros as radio, contrato
          FROM geo_bases ORDER BY nombre
        `),
        pool.query(`
          SELECT s.patente_norm, s.movil, s.contrato,
            s.lat, s.lng, s.velocidad, s.estado
          FROM wisetrack_snapshots s
          WHERE s.captured_at >= (SELECT MAX(captured_at) - INTERVAL '10 minutes' FROM wisetrack_snapshots)
            AND s.lat IS NOT NULL AND s.lng IS NOT NULL
            AND s.lat != 0 AND s.lng != 0
        `),
        pool.query(`
          SELECT proveedor as estacion, COUNT(*) as cargas,
            ROUND(SUM(litros_surtidor)::numeric) as litros_total
          FROM cargas WHERE fecha >= $1
          GROUP BY proveedor
        `, [inicioMes]),
      ]);

      const cargasMap = new Map<string, any>();
      for (const c of cargasR.rows) cargasMap.set(c.estacion?.toUpperCase(), c);

      // For each station, find vehicles within 5km
      const estaciones = estacionesR.rows.map((est: any) => {
        const nearby = vehiculosR.rows.filter((v: any) => {
          if (!v.lat || !v.lng || !est.lat || !est.lng) return false;
          const dist = Math.sqrt(
            Math.pow((v.lat - est.lat) * 111, 2) +
            Math.pow((v.lng - est.lng) * 111 * Math.cos(est.lat * Math.PI / 180), 2)
          );
          return dist < 5;
        }).map((v: any) => ({
          patente: v.patente_norm,
          movil: v.movil,
          contrato: v.contrato,
          velocidad: v.velocidad,
          estado: v.estado,
        }));

        const cargasInfo = cargasMap.get(est.nombre?.toUpperCase());

        return {
          ...est,
          vehiculos_cerca: nearby,
          vehiculos_cerca_count: nearby.length,
          cargas_mes: cargasInfo ? parseInt(cargasInfo.cargas) : 0,
          litros_mes: cargasInfo ? parseFloat(cargasInfo.litros_total) : 0,
        };
      });

      res.json({
        estaciones,
        total_estaciones: estaciones.length,
        total_vehiculos: vehiculosR.rows.length,
        estaciones_con_vehiculos: estaciones.filter((e: any) => e.vehiculos_cerca_count > 0).length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log("[WT-ENGINE] Routes registered");
}
