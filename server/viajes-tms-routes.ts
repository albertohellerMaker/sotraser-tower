import { Router } from "express";
import { pool } from "./db";

const router = Router();

// Helper: base query joins camiones for patente
const BASE_SELECT = `
  SELECT c.patente, va.contrato, va.conductor,
    ROUND(SUM(va.km_ecu)::numeric, 0) as km_total,
    ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rendimiento,
    COUNT(*)::int as viajes,
    ROUND(SUM(va.duracion_minutos / 60.0)::numeric, 1) as horas_ruta,
    CASE
      WHEN AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) >= 2.85 THEN 'OK'
      WHEN AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) >= 2.3 THEN 'ALERTA'
      WHEN AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) IS NULL THEN 'SIN_ECU'
      ELSE 'CRITICO'
    END as estado,
    bool_or(va.validacion_doble) as doble_validado,
    bool_or(va.validado_wt) as tiene_wt,
    MAX(va.origen_nombre) as ultimo_origen,
    MAX(va.destino_nombre) as ultimo_destino
  FROM viajes_aprendizaje va
  JOIN camiones c ON c.id = va.camion_id
`;

function buildKpis(camiones: any[]) {
  return {
    total_viajes: camiones.reduce((s, r) => s + parseInt(r.viajes), 0),
    total_camiones: camiones.length,
    km_total: Math.round(camiones.reduce((s, r) => s + parseFloat(r.km_total || 0), 0)),
    rend_promedio: camiones.filter(r => r.rendimiento).length > 0
      ? Math.round(camiones.filter(r => r.rendimiento).reduce((s, r, _, a) => s + parseFloat(r.rendimiento) / a.length, 0) * 100) / 100
      : null,
  };
}

// ── Resumen del día
router.get("/resumen-dia", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const contrato = (req.query.contrato as string) || "TODOS";

    const result = await pool.query(`
      ${BASE_SELECT}
      WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        AND ($2 = 'TODOS' OR va.contrato = $2)
      GROUP BY c.patente, va.contrato, va.conductor
      ORDER BY km_total DESC NULLS LAST
    `, [fecha, contrato]);

    const camiones = result.rows;
    const contratos = [...new Set(camiones.map((c: any) => c.contrato).filter(Boolean))].sort();
    res.json({ fecha, kpis: buildKpis(camiones), camiones, contratos });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Acumulado del mes
router.get("/acumulado-mes", async (req, res) => {
  try {
    const contrato = (req.query.contrato as string) || "TODOS";
    const now = new Date();
    const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const diaActual = now.getDate();

    const result = await pool.query(`
      SELECT c.patente, va.contrato,
        ROUND(SUM(va.km_ecu)::numeric, 0) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
        COUNT(*)::int as viajes_mes,
        COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activos,
        ROUND(SUM(va.duracion_minutos / 60.0)::numeric, 0) as horas_mes,
        bool_or(va.validacion_doble) as doble_validado,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10 AND va.fecha_inicio >= NOW() - INTERVAL '7 days')::numeric, 2) as rend_reciente,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10 AND va.fecha_inicio >= NOW() - INTERVAL '14 days' AND va.fecha_inicio < NOW() - INTERVAL '7 days')::numeric, 2) as rend_anterior
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      WHERE va.fecha_inicio >= $1::date AND va.fecha_inicio < $1::date + INTERVAL '1 month'
        AND va.km_ecu > 0 AND ($2 = 'TODOS' OR va.contrato = $2)
      GROUP BY c.patente, va.contrato
      ORDER BY km_mes DESC NULLS LAST
    `, [inicioMes, contrato]);

    const camiones = result.rows.map((r: any) => ({
      ...r, dias_mes: diaActual,
      tendencia: !r.rend_reciente || !r.rend_anterior ? "ESTABLE"
        : parseFloat(r.rend_reciente) > parseFloat(r.rend_anterior) * 1.03 ? "MEJORANDO"
        : parseFloat(r.rend_reciente) < parseFloat(r.rend_anterior) * 0.97 ? "BAJANDO" : "ESTABLE",
    }));

    const contratos = [...new Set(camiones.map((c: any) => c.contrato).filter(Boolean))].sort();
    res.json({ mes: now.getMonth() + 1, anio: now.getFullYear(), dias_mes: diaActual, kpis: buildKpis(camiones), camiones, contratos });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Por contrato
router.get("/por-contrato", async (req, res) => {
  try {
    const contrato = (req.query.contrato as string) || "TODOS";
    if (!contrato || contrato === "TODOS") {
      const result = await pool.query(`
        SELECT va.contrato, COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric, 0) as km_total,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
        GROUP BY va.contrato ORDER BY km_total DESC
      `);
      return res.json({ contratos: result.rows });
    }

    const [kpis, cams] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric, 0) as km_total,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
      `, [contrato]),
      pool.query(`
        SELECT c.patente, ROUND(SUM(va.km_ecu)::numeric, 0) as km_mes,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
          COUNT(*)::int as viajes, COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activos
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
        GROUP BY c.patente ORDER BY rend_promedio DESC NULLS LAST
      `, [contrato]),
    ]);
    res.json({ contrato, kpis: kpis.rows[0], camiones: cams.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Ranking
router.get("/ranking", async (req, res) => {
  try {
    const periodo = (req.query.periodo as string) || "MES";
    const contrato = (req.query.contrato as string) || "TODOS";
    const desde = periodo === "HOY" ? "CURRENT_DATE" : periodo === "SEMANA" ? "NOW() - INTERVAL '7 days'" : "DATE_TRUNC('month', NOW())";

    const result = await pool.query(`
      SELECT c.patente, va.contrato,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
        ROUND(SUM(va.km_ecu)::numeric, 0) as km_total, COUNT(*)::int as viajes,
        COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activos,
        bool_or(va.validacion_doble) as doble_validado
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.fecha_inicio >= ${desde} AND va.km_ecu > 0 AND ($1 = 'TODOS' OR va.contrato = $1)
      GROUP BY c.patente, va.contrato HAVING COUNT(*) >= 2
      ORDER BY rend_promedio DESC NULLS LAST
    `, [contrato]);

    const todos = result.rows;
    res.json({
      periodo,
      top10: todos.slice(0, 10),
      bottom10: [...todos].filter((r: any) => r.rend_promedio).sort((a: any, b: any) => parseFloat(a.rend_promedio) - parseFloat(b.rend_promedio)).slice(0, 10),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Alertas
router.get("/alertas", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const contrato = (req.query.contrato as string) || "TODOS";

    const result = await pool.query(`
      SELECT c.patente, va.contrato,
        ROUND(SUM(va.km_ecu)::numeric, 0) as km_total,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rendimiento,
        COUNT(*)::int as viajes
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0 AND ($2 = 'TODOS' OR va.contrato = $2)
      GROUP BY c.patente, va.contrato
      HAVING AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) < 2.3
        OR AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) IS NULL
      ORDER BY rendimiento ASC NULLS LAST
    `, [fecha, contrato]);

    const alertas = result.rows.map((r: any) => ({
      ...r,
      severidad: !r.rendimiento ? "SIN_ECU" : parseFloat(r.rendimiento) < 2.0 ? "CRITICO" : parseFloat(r.rendimiento) < 2.3 ? "BAJO" : "ALERTA",
    }));

    res.json({ fecha, total_alertas: alertas.length, criticos: alertas.filter((a: any) => a.severidad === "CRITICO").length, alertas });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Detalle viajes de un camión en un día
router.get("/camion-dia/:patente", async (req, res) => {
  try {
    const { patente } = req.params;
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    const result = await pool.query(`
      SELECT va.id, c.patente, va.contrato, va.conductor,
        va.fecha_inicio::text as inicio, va.fecha_fin::text as fin,
        va.origen_nombre, va.destino_nombre,
        va.origen_lat::float as olat, va.origen_lng::float as olng,
        va.destino_lat::float as dlat, va.destino_lng::float as dlng,
        ROUND(va.km_ecu::numeric, 1) as km,
        ROUND(va.rendimiento_real::numeric, 2) as rendimiento,
        va.duracion_minutos as duracion,
        ROUND(va.velocidad_promedio::numeric, 1) as vel_prom,
        ROUND(va.velocidad_maxima::numeric, 1) as vel_max,
        va.validacion_doble, va.validado_wt, va.validado_volvo
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE c.patente = $1 AND DATE(va.fecha_inicio) = $2
      ORDER BY va.fecha_inicio ASC
    `, [patente, fecha]);

    res.json({ patente, fecha, viajes: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Alertas detalladas con contexto completo
router.get("/alertas-detalle", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const contrato = (req.query.contrato as string) || "TODOS";

    // Alertas de rendimiento bajo
    const rendBajo = await pool.query(`
      SELECT c.patente, va.contrato, va.conductor,
        va.fecha_inicio::text as hora_inicio, va.fecha_fin::text as hora_fin,
        va.origen_nombre, va.destino_nombre,
        va.origen_lat::float as olat, va.origen_lng::float as olng,
        va.destino_lat::float as dlat, va.destino_lng::float as dlng,
        ROUND(va.km_ecu::numeric, 1) as km, ROUND(va.rendimiento_real::numeric, 2) as rend,
        va.duracion_minutos as duracion, ROUND(va.velocidad_maxima::numeric) as vel_max,
        va.validacion_doble, va.validado_wt,
        -- Historico del camion
        (SELECT ROUND(AVG(v2.rendimiento_real)::numeric, 2) FROM viajes_aprendizaje v2
          WHERE v2.camion_id = va.camion_id AND v2.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND v2.rendimiento_real > 0 AND v2.rendimiento_real < 10
        ) as rend_historico,
        -- Cuantas alertas ha tenido este camion en el mes
        (SELECT COUNT(*) FROM viajes_aprendizaje v3
          WHERE v3.camion_id = va.camion_id AND v3.fecha_inicio >= DATE_TRUNC('month', NOW())
          AND v3.rendimiento_real > 0 AND v3.rendimiento_real < 2.3
        ) as alertas_mes_camion
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        AND ($2 = 'TODOS' OR va.contrato = $2)
        AND (va.rendimiento_real < 2.3 OR va.rendimiento_real IS NULL OR va.rendimiento_real = 0)
      ORDER BY va.rendimiento_real ASC NULLS LAST
    `, [fecha, contrato]);

    // Alertas de velocidad
    const velAltas = await pool.query(`
      SELECT c.patente, va.contrato, va.conductor,
        va.fecha_inicio::text as hora, va.origen_nombre, va.destino_nombre,
        ROUND(va.velocidad_maxima::numeric) as vel_max,
        ROUND(va.velocidad_promedio::numeric) as vel_prom,
        ROUND(va.km_ecu::numeric, 1) as km,
        va.origen_lat::float as olat, va.origen_lng::float as olng
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE DATE(va.fecha_inicio) = $1 AND va.velocidad_maxima > 105
        AND ($2 = 'TODOS' OR va.contrato = $2)
      ORDER BY va.velocidad_maxima DESC
    `, [fecha, contrato]);

    res.json({
      fecha,
      rendimiento_bajo: rendBajo.rows.map((r: any) => ({
        ...r, tipo: "RENDIMIENTO",
        severidad: !r.rend || parseFloat(r.rend) === 0 ? "SIN_ECU" : parseFloat(r.rend) < 2.0 ? "CRITICO" : "BAJO",
        desviacion_pct: r.rend_historico && r.rend ? Math.round((parseFloat(r.rend) - parseFloat(r.rend_historico)) / parseFloat(r.rend_historico) * 100) : null,
        recurrente: parseInt(r.alertas_mes_camion) >= 3,
      })),
      velocidad: velAltas.rows.map((r: any) => ({
        ...r, tipo: "VELOCIDAD",
        severidad: parseFloat(r.vel_max) > 120 ? "CRITICO" : "ALTO",
      })),
      total: rendBajo.rows.length + velAltas.rows.length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Detalle completo de un contrato
router.get("/contrato-detalle/:contrato", async (req, res) => {
  try {
    const { contrato } = req.params;
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);

    const [kpis, litros, porDia, camiones, conductores, alertasHoy, topEstaciones] = await Promise.all([
      // KPIs mes
      pool.query(`
        SELECT COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km_total, ROUND(SUM(va.duracion_minutos / 60.0)::numeric) as horas_total,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
          COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activos,
          COUNT(*) FILTER (WHERE va.validacion_doble)::int as doble_validados,
          COUNT(*) FILTER (WHERE va.conductor IS NOT NULL AND va.conductor != '')::int as con_conductor,
          ROUND(AVG(va.velocidad_maxima) FILTER (WHERE va.velocidad_maxima > 0)::numeric, 0) as vel_max_prom
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= $2 AND va.km_ecu > 0
      `, [contrato, inicioMes]),

      // Litros Sigetra
      pool.query(`
        SELECT COUNT(*)::int as cargas, ROUND(COALESCE(SUM(litros_surtidor),0)::numeric) as litros_total,
          COUNT(DISTINCT patente)::int as camiones_cargaron, COUNT(DISTINCT proveedor)::int as estaciones
        FROM cargas WHERE faena = $1 AND fecha >= $2::text
      `, [contrato, inicioMes.toISOString().slice(0,10)]),

      // Resumen por dia
      pool.query(`
        SELECT DATE(va.fecha_inicio)::text as fecha, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= $2 AND va.km_ecu > 0
        GROUP BY DATE(va.fecha_inicio) ORDER BY fecha DESC
      `, [contrato, inicioMes]),

      // Camiones del contrato
      pool.query(`
        SELECT c.patente, ROUND(SUM(va.km_ecu)::numeric) as km_mes,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          COUNT(*)::int as viajes, COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias,
          bool_or(va.validacion_doble) as doble,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.fecha_inicio >= NOW() - INTERVAL '7 days')::numeric, 2) as rend_reciente,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.fecha_inicio < NOW() - INTERVAL '7 days')::numeric, 2) as rend_anterior
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= $2 AND va.km_ecu > 0
        GROUP BY c.patente ORDER BY km_mes DESC
      `, [contrato, inicioMes]),

      // Conductores
      pool.query(`
        SELECT va.conductor, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(SUM(va.km_ecu)::numeric) as km
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= $2 AND va.conductor IS NOT NULL AND va.conductor != '' AND va.km_ecu > 0
        GROUP BY va.conductor ORDER BY viajes DESC LIMIT 15
      `, [contrato, inicioMes]),

      // Alertas hoy (rendimiento bajo)
      pool.query(`
        SELECT c.patente, va.conductor, ROUND(AVG(va.rendimiento_real)::numeric, 2) as rend, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, MAX(va.origen_nombre) as origen, MAX(va.destino_nombre) as destino
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = CURRENT_DATE AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor
        HAVING AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) < 2.3
          OR AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) IS NULL
        ORDER BY rend ASC NULLS LAST
      `, [contrato]),

      // Top estaciones
      pool.query(`
        SELECT proveedor as estacion, COUNT(*)::int as cargas, ROUND(SUM(litros_surtidor)::numeric) as litros
        FROM cargas WHERE faena = $1 AND fecha >= $2::text
        GROUP BY proveedor ORDER BY cargas DESC LIMIT 5
      `, [contrato, inicioMes.toISOString().slice(0,10)]),
    ]);

    // Rendimiento cruzado: km ECU / litros Sigetra
    const kmEcu = parseFloat(kpis.rows[0]?.km_total || 0);
    const ltSig = parseFloat(litros.rows[0]?.litros_total || 0);
    const rendCruzado = ltSig > 0 ? Math.round((kmEcu / ltSig) * 100) / 100 : null;

    res.json({
      contrato,
      kpis: { ...kpis.rows[0], dias_mes: new Date().getDate() },
      combustible: { ...litros.rows[0], rend_cruzado: rendCruzado },
      por_dia: porDia.rows,
      camiones: camiones.rows.map((c: any) => ({
        ...c,
        tendencia: !c.rend_reciente || !c.rend_anterior ? "ESTABLE"
          : parseFloat(c.rend_reciente) > parseFloat(c.rend_anterior) * 1.03 ? "MEJORANDO"
          : parseFloat(c.rend_reciente) < parseFloat(c.rend_anterior) * 0.97 ? "BAJANDO" : "ESTABLE",
      })),
      conductores: conductores.rows,
      alertas_hoy: alertasHoy.rows,
      estaciones: topEstaciones.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Puntos desconocidos (para georeferenciación manual)
router.get("/puntos-desconocidos", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT lat, lng, tipo, veces, camiones, contratos FROM (
        SELECT ROUND(origen_lat::float::numeric, 3)::float as lat, ROUND(origen_lng::float::numeric, 3)::float as lng,
          'ORIGEN' as tipo, COUNT(*)::int as veces, COUNT(DISTINCT camion_id)::int as camiones,
          STRING_AGG(DISTINCT contrato, ', ') as contratos
        FROM viajes_aprendizaje
        WHERE fecha_inicio >= '2026-03-01' AND (origen_nombre IS NULL OR origen_nombre = 'Punto desconocido')
          AND origen_lat IS NOT NULL AND origen_lat::float != 0
        GROUP BY ROUND(origen_lat::float::numeric, 3), ROUND(origen_lng::float::numeric, 3)
        UNION ALL
        SELECT ROUND(destino_lat::float::numeric, 3)::float, ROUND(destino_lng::float::numeric, 3)::float,
          'DESTINO', COUNT(*)::int, COUNT(DISTINCT camion_id)::int, STRING_AGG(DISTINCT contrato, ', ')
        FROM viajes_aprendizaje
        WHERE fecha_inicio >= '2026-03-01' AND (destino_nombre IS NULL OR destino_nombre = 'Punto desconocido')
          AND destino_lat IS NOT NULL AND destino_lat::float != 0
        GROUP BY ROUND(destino_lat::float::numeric, 3), ROUND(destino_lng::float::numeric, 3)
      ) sub ORDER BY veces DESC
    `);
    res.json({ total: r.rows.length, puntos: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Georefernciar punto desconocido manualmente
router.post("/georefernciar", async (req, res) => {
  try {
    const { lat, lng, nombre, contrato, radio_metros } = req.body;
    if (!lat || !lng || !nombre) return res.status(400).json({ error: "lat, lng, nombre requeridos" });

    // Crear geocerca
    const geo = await pool.query(
      `INSERT INTO geocercas_operacionales (nombre, lat, lng, radio_metros, tipo, contrato, confianza, confirmada, nivel)
       VALUES ($1, $2, $3, $4, 'MANUAL', $5, 'ALTA', true, 2)
       ON CONFLICT (lat_key, lng_key) DO UPDATE SET nombre = EXCLUDED.nombre, confirmada = true
       RETURNING id, nombre`,
      [nombre, lat, lng, radio_metros || 50, contrato || null]
    );

    // Actualizar viajes existentes con ese punto
    const rDeg = 0.005; // ~500m
    const updO = await pool.query(`
      UPDATE viajes_aprendizaje SET origen_nombre = $1
      WHERE (origen_nombre IS NULL OR origen_nombre = 'Punto desconocido')
        AND ABS(origen_lat::float - $2) < $4 AND ABS(origen_lng::float - $3) < $4
    `, [nombre, lat, lng, rDeg]);
    const updD = await pool.query(`
      UPDATE viajes_aprendizaje SET destino_nombre = $1
      WHERE (destino_nombre IS NULL OR destino_nombre = 'Punto desconocido')
        AND ABS(destino_lat::float - $2) < $4 AND ABS(destino_lng::float - $3) < $4
    `, [nombre, lat, lng, rDeg]);

    res.json({ geocerca: geo.rows[0], viajes_actualizados: { origenes: updO.rowCount, destinos: updD.rowCount } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Auto-geocodificar punto desconocido (Google Maps API)
router.post("/auto-geocode", async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: "lat, lng requeridos" });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY no configurada" });

    const https = require("https");
    const geoResult: any = await new Promise((resolve) => {
      https.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es&result_type=street_address|route|locality|sublocality`,
        (r: any) => {
        let data = ""; r.on("data", (c: string) => data += c);
        r.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }).on("error", () => resolve(null));
    });

    if (!geoResult || geoResult.status !== "OK" || !geoResult.results?.length) {
      return res.json({ nombre: null, error: "No se pudo geocodificar" });
    }

    const result = geoResult.results[0];
    const comps = result.address_components || [];
    const getComp = (type: string) => comps.find((c: any) => c.types.includes(type))?.long_name || "";

    const route = getComp("route");
    const number = getComp("street_number");
    const locality = getComp("locality") || getComp("administrative_area_level_3");
    const region = getComp("administrative_area_level_1");

    // Nombre inteligente: dirección + localidad
    let nombre = "";
    if (route) {
      nombre = route + (number ? " " + number : "");
      if (locality) nombre += " · " + locality;
    } else if (locality) {
      nombre = locality;
      if (region) nombre += " · " + region;
    } else {
      nombre = result.formatted_address?.split(",").slice(0, 2).join(",") || `${lat},${lng}`;
    }

    // Build multiple suggestions with confidence
    const sugerencias = geoResult.results.slice(0, 5).map((r: any, idx: number) => {
      const c = r.address_components || [];
      const g = (t: string) => c.find((x: any) => x.types.includes(t))?.long_name || "";
      const locType = r.geometry?.location_type || "APPROXIMATE";

      const confianza = locType === "ROOFTOP" ? 95
        : locType === "RANGE_INTERPOLATED" ? 85
        : locType === "GEOMETRIC_CENTER" ? 70
        : 40;

      const rt = g("route"); const nm = g("street_number");
      const loc = g("locality") || g("administrative_area_level_3");
      const sub = g("sublocality") || g("neighborhood");
      const reg = g("administrative_area_level_1");

      let label = "";
      if (rt) { label = rt + (nm ? " " + nm : ""); if (loc) label += " · " + loc; }
      else if (sub) { label = sub; if (loc) label += " · " + loc; }
      else if (loc) { label = loc; if (reg) label += " · " + reg; }
      else { label = r.formatted_address?.split(",").slice(0, 2).join(",") || ""; }

      return {
        nombre: label.substring(0, 60),
        address: r.formatted_address,
        confianza,
        tipo_precision: locType,
        locality: loc,
        region: reg,
      };
    }).filter((s: any) => s.nombre && s.nombre.length > 2);

    res.json({
      nombre: nombre.substring(0, 60),
      address: result.formatted_address,
      locality,
      region,
      lat, lng,
      fuente: "GOOGLE_MAPS",
      sugerencias,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Contratos resumen mes (para tab CONTRATOS)
router.get("/contratos-resumen", async (req, res) => {
  try {
    const gps = await pool.query(`
      SELECT va.contrato, COUNT(DISTINCT c.patente)::int as camiones, ROUND(SUM(va.km_ecu)::numeric) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as km_l,
        COUNT(*)::int as viajes, COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activos,
        MAX(va.fecha_inicio)::text as ultimo_viaje
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
      GROUP BY va.contrato ORDER BY km_mes DESC NULLS LAST
    `);
    const sinGps = await pool.query(`
      SELECT DISTINCT faena as contrato, COUNT(DISTINCT patente)::int as camiones
      FROM cargas WHERE fecha::timestamp >= DATE_TRUNC('month', NOW()) AND faena IS NOT NULL AND faena != ''
        AND faena NOT IN (SELECT DISTINCT contrato FROM viajes_aprendizaje WHERE fecha_inicio >= DATE_TRUNC('month', NOW()) AND km_ecu > 0)
      GROUP BY faena ORDER BY camiones DESC
    `);
    res.json({
      contratos: [
        ...gps.rows,
        ...sinGps.rows.map((r: any) => ({ ...r, km_mes: 0, km_l: null, viajes: 0, dias_activos: 0, litros_mes: 0, sin_gps: true })),
      ],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/contratos-detalle/:contrato", async (req, res) => {
  try {
    const { contrato } = req.params;
    const [camiones, tendencia] = await Promise.all([
      pool.query(`
        SELECT c.patente, ROUND(SUM(va.km_ecu)::numeric) as km_mes,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
          COUNT(*)::int as viajes, COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activos,
          MAX(va.fecha_inicio)::text as ultimo_viaje,
          CASE WHEN AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) >= 2.85 THEN 'OK'
            WHEN AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) >= 2.3 THEN 'ALERTA'
            WHEN AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) IS NULL THEN 'SIN_ECU'
            ELSE 'CRITICO' END as estado
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
        GROUP BY c.patente ORDER BY rend_promedio DESC NULLS LAST
      `, [contrato]),
      pool.query(`
        SELECT DATE(va.fecha_inicio)::text as dia,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_dia,
          ROUND(SUM(va.km_ecu)::numeric) as km_dia, COUNT(DISTINCT c.patente)::int as camiones_dia
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '14 days' AND va.km_ecu > 0
        GROUP BY DATE(va.fecha_inicio) ORDER BY dia ASC
      `, [contrato]),
    ]);
    res.json({ contrato, camiones: camiones.rows, tendencia: tendencia.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Circuitos por contrato (viajes del mismo camion en un dia = 1 circuito)
router.get("/circuitos-contrato/:contrato", async (req, res) => {
  try {
    const { contrato } = req.params;
    // Agrupar todos los fragmentos del mismo camion + dia como un circuito
    const result = await pool.query(`
      SELECT c.patente, DATE(va.fecha_inicio)::text as fecha, va.contrato, va.conductor,
        COUNT(*)::int as paradas,
        ROUND(SUM(va.km_ecu)::numeric) as km_total,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
        MIN(va.fecha_inicio)::text as hora_salida, MAX(va.fecha_fin)::text as hora_llegada,
        ROUND(EXTRACT(EPOCH FROM (MAX(va.fecha_fin) - MIN(va.fecha_inicio)))/3600::numeric, 1) as horas_total,
        -- Primer origen y ultimo destino = circuito real
        (SELECT origen_nombre FROM viajes_aprendizaje v2 WHERE v2.camion_id = va.camion_id AND DATE(v2.fecha_inicio) = DATE(va.fecha_inicio) AND v2.km_ecu > 0 ORDER BY v2.fecha_inicio ASC LIMIT 1) as origen_circuito,
        (SELECT destino_nombre FROM viajes_aprendizaje v2 WHERE v2.camion_id = va.camion_id AND DATE(v2.fecha_inicio) = DATE(va.fecha_inicio) AND v2.km_ecu > 0 ORDER BY v2.fecha_inicio DESC LIMIT 1) as destino_circuito,
        -- Todas las paradas intermedias
        STRING_AGG(DISTINCT COALESCE(va.destino_nombre, va.origen_nombre), ' → ' ORDER BY COALESCE(va.destino_nombre, va.origen_nombre)) as paradas_nombres,
        ROUND(MAX(va.velocidad_maxima)::numeric) as vel_max,
        bool_or(va.validacion_doble) as doble_validado
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
      GROUP BY c.patente, DATE(va.fecha_inicio), va.contrato, va.conductor, va.camion_id
      ORDER BY km_total DESC
    `, [contrato]);

    // Agrupar circuitos similares (mismo origen_circuito + destino_circuito)
    const circuitosMap = new Map<string, any>();
    for (const r of result.rows) {
      const key = `${r.origen_circuito || '?'} → ${r.destino_circuito || '?'}`;
      if (!circuitosMap.has(key)) {
        circuitosMap.set(key, { ruta: key, origen: r.origen_circuito, destino: r.destino_circuito, viajes: [], total: 0, km_sum: 0, rend_sum: 0, rend_n: 0, camiones: new Set() });
      }
      const g = circuitosMap.get(key)!;
      g.viajes.push(r);
      g.total++;
      g.km_sum += parseFloat(r.km_total || 0);
      if (r.rend_promedio) { g.rend_sum += parseFloat(r.rend_promedio); g.rend_n++; }
      g.camiones.add(r.patente);
    }

    const circuitos = [...circuitosMap.values()]
      .map(g => ({ ...g, km_promedio: Math.round(g.km_sum / g.total), rend_promedio: g.rend_n > 0 ? Math.round(g.rend_sum / g.rend_n * 100) / 100 : null, camiones: g.camiones.size, viajes: g.viajes.slice(0, 20) }))
      .sort((a, b) => b.total - a.total);

    res.json({ contrato, circuitos, total_circuitos: result.rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Rutas agrupadas por contrato (viajes similares)
router.get("/rutas-contrato/:contrato", async (req, res) => {
  try {
    const { contrato } = req.params;
    const result = await pool.query(`
      SELECT va.origen_nombre, va.destino_nombre,
        COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
        ROUND(AVG(va.km_ecu)::numeric) as km_promedio,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_promedio,
        ROUND(AVG(va.duracion_minutos)::numeric) as duracion_promedio,
        AVG(va.origen_lat::float) as origen_lat, AVG(va.origen_lng::float) as origen_lng,
        AVG(va.destino_lat::float) as destino_lat, AVG(va.destino_lng::float) as destino_lng,
        MAX(va.fecha_inicio)::text as ultimo_viaje
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
        AND va.origen_nombre IS NOT NULL AND va.origen_nombre != 'Punto desconocido'
        AND va.destino_nombre IS NOT NULL AND va.destino_nombre != 'Punto desconocido'
      GROUP BY va.origen_nombre, va.destino_nombre
      HAVING COUNT(*) >= 2
      ORDER BY viajes DESC
    `, [contrato]);

    res.json({ contrato, rutas: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Detalle de una ruta específica (viajes individuales)
router.get("/ruta-detalle", async (req, res) => {
  try {
    const { contrato, origen, destino } = req.query as any;
    const result = await pool.query(`
      SELECT va.id, c.patente, va.conductor, va.fecha_inicio::text as inicio, va.fecha_fin::text as fin,
        ROUND(va.km_ecu::numeric, 1) as km, ROUND(va.rendimiento_real::numeric, 2) as rendimiento,
        va.duracion_minutos as duracion, ROUND(va.velocidad_maxima::numeric) as vel_max,
        va.origen_lat::float as olat, va.origen_lng::float as olng,
        va.destino_lat::float as dlat, va.destino_lng::float as dlng,
        va.validacion_doble, va.validado_wt
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.origen_nombre = $2 AND va.destino_nombre = $3
        AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
      ORDER BY va.fecha_inicio DESC LIMIT 20
    `, [contrato, origen, destino]);

    res.json({ contrato, origen, destino, viajes: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Geocercas: listar, activar/desactivar, editar nombre
router.get("/geocercas", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nombre, lat, lng, radio_metros, tipo, contrato, nivel, confianza, confirmada,
        camiones_frecuentes, activa, auto_detectada, creado_at::text
      FROM geocercas_operacionales
      ORDER BY activa DESC, nivel ASC, camiones_frecuentes DESC
    `);
    const activas = r.rows.filter((g: any) => g.activa);
    const inactivas = r.rows.filter((g: any) => !g.activa);
    res.json({
      total: r.rows.length, activas: activas.length, inactivas: inactivas.length,
      geocercas: r.rows,
      por_nivel: {
        bases: activas.filter((g: any) => g.nivel === 1).length,
        puntos: activas.filter((g: any) => g.nivel === 2).length,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/geocercas/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query("UPDATE geocercas_operacionales SET activa = NOT activa WHERE id = $1 RETURNING id, nombre, activa", [id]);
    res.json(r.rows[0] || { error: "not found" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/geocercas/:id/rename", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: "nombre requerido" });
    const r = await pool.query("UPDATE geocercas_operacionales SET nombre = $1, confirmada = true WHERE id = $2 RETURNING id, nombre", [nombre, id]);
    res.json(r.rows[0] || { error: "not found" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/geocercas/:id/radio", async (req, res) => {
  try {
    const { id } = req.params;
    const { radio } = req.body;
    const r = await pool.query("UPDATE geocercas_operacionales SET radio_metros = $1 WHERE id = $2 RETURNING id, nombre, radio_metros", [radio, id]);
    res.json(r.rows[0] || { error: "not found" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/geocercas/crear", async (req, res) => {
  try {
    const { nombre, lat, lng, radio_metros, tipo, contrato } = req.body;
    if (!nombre || !lat || !lng) return res.status(400).json({ error: "nombre, lat, lng requeridos" });
    const r = await pool.query(
      `INSERT INTO geocercas_operacionales (nombre, lat, lng, radio_metros, tipo, contrato, confianza, confirmada, nivel)
       VALUES ($1, $2, $3, $4, $5, $6, 'ALTA', true, $7) RETURNING id, nombre`,
      [nombre, lat, lng, radio_metros || 50, tipo || "MANUAL", contrato || null, tipo === "BASE_ORIGEN" ? 1 : 2]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ RESUMEN EJECUTIVO: DIARIO / 3 DÍAS / SEMANAL ═══
router.get("/resumen-ejecutivo", async (req, res) => {
  try {
    const periodo = (req.query.periodo as string) || "DIA"; // DIA | 3DIAS | SEMANA
    const contrato = (req.query.contrato as string) || "TODOS";

    let diasAtras = 1;
    let diasCompara = 1;
    if (periodo === "3DIAS") { diasAtras = 3; diasCompara = 3; }
    else if (periodo === "SEMANA") { diasAtras = 7; diasCompara = 7; }

    const fc = contrato === "TODOS" ? "" : "AND va.contrato = $2";
    const p1 = contrato === "TODOS" ? [diasAtras] : [diasAtras, contrato];
    const fc3 = contrato === "TODOS" ? "" : "AND va.contrato = $3";
    const p2 = contrato === "TODOS" ? [diasAtras, diasCompara] : [diasAtras, diasCompara, contrato];

    // Periodo actual vs periodo anterior
    const [actual, anterior, porContrato, topCam, bottomCam, alertasResumen, tendenciaDiaria] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(SUM(va.litros_consumidos_ecu) FILTER (WHERE va.litros_consumidos_ecu > 0)::numeric) as litros,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          COUNT(*) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 2.0)::int as criticos,
          ROUND(AVG(va.velocidad_maxima) FILTER (WHERE va.velocidad_maxima > 0)::numeric) as vel_max_prom,
          COUNT(*) FILTER (WHERE va.velocidad_maxima > 100)::int as excesos_vel
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= CURRENT_DATE - $1::int AND va.km_ecu > 0 ${fc}
      `, p1),
      pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          COUNT(*) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 2.0)::int as criticos
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= CURRENT_DATE - ($1::int + $2::int) AND va.fecha_inicio < CURRENT_DATE - $1::int AND va.km_ecu > 0 ${fc3}
      `, p2),
      pool.query(`
        SELECT va.contrato, COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          COUNT(*) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 2.0)::int as criticos
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= CURRENT_DATE - $1::int AND va.km_ecu > 0 ${fc}
        GROUP BY va.contrato ORDER BY km DESC
      `, p1),
      pool.query(`
        SELECT c.patente, va.contrato, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= CURRENT_DATE - $1::int AND va.km_ecu > 0 AND va.rendimiento_real > 0 ${fc}
        GROUP BY c.patente, va.contrato
        HAVING AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) IS NOT NULL
        ORDER BY rend DESC LIMIT 5
      `, p1),
      pool.query(`
        SELECT c.patente, va.contrato, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= CURRENT_DATE - $1::int AND va.km_ecu > 0 AND va.rendimiento_real > 0 AND va.rendimiento_real < 10 ${fc}
        GROUP BY c.patente, va.contrato
        HAVING AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10) < 2.5
        ORDER BY rend ASC LIMIT 5
      `, p1),
      pool.query(`
        SELECT tipo, COUNT(*)::int as total
        FROM alertas_aprendizaje WHERE fecha >= CURRENT_DATE - $1::int ${contrato !== "TODOS" ? "AND contrato = $2" : ""}
        GROUP BY tipo ORDER BY total DESC
      `, contrato !== "TODOS" ? [diasAtras, contrato] : [diasAtras]),
      pool.query(`
        SELECT DATE(va.fecha_inicio)::text as dia, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          COUNT(DISTINCT c.patente)::int as camiones
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.fecha_inicio >= CURRENT_DATE - $1::int AND va.km_ecu > 0 ${fc}
        GROUP BY DATE(va.fecha_inicio) ORDER BY dia
      `, p1),
    ]);

    const act = actual.rows[0] || {};
    const ant = anterior.rows[0] || {};

    // Calcular deltas
    const delta = (a: number, b: number) => b > 0 ? Math.round((a - b) / b * 100) : 0;

    res.json({
      periodo,
      dias: diasAtras,
      actual: act,
      comparacion: {
        delta_viajes: delta(act.viajes || 0, ant.viajes || 0),
        delta_km: delta(parseFloat(act.km) || 0, parseFloat(ant.km) || 0),
        delta_rend: ant.rend ? Math.round((parseFloat(act.rend || 0) - parseFloat(ant.rend)) * 100) / 100 : 0,
        delta_criticos: (act.criticos || 0) - (ant.criticos || 0),
        anterior: ant,
      },
      por_contrato: porContrato.rows,
      top_camiones: topCam.rows,
      bottom_camiones: bottomCam.rows,
      alertas: alertasResumen.rows,
      tendencia: tendenciaDiaria.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/viaje-gps/:viajeId", async (req, res) => {
  try {
    const viajeId = parseInt(req.params.viajeId);
    if (!Number.isFinite(viajeId) || viajeId <= 0) {
      return res.status(400).json({ error: "ID de viaje inválido" });
    }

    const viaje = await pool.query(`
      SELECT va.id, va.camion_id, c.patente, va.contrato, va.conductor,
        va.fecha_inicio, va.fecha_fin,
        va.origen_nombre, va.destino_nombre,
        va.origen_lat::float as olat, va.origen_lng::float as olng,
        va.destino_lat::float as dlat, va.destino_lng::float as dlng,
        ROUND(va.km_ecu::numeric, 1) as km,
        ROUND(va.rendimiento_real::numeric, 2) as rendimiento,
        va.duracion_minutos as duracion,
        ROUND(va.velocidad_promedio::numeric, 1) as vel_prom,
        ROUND(va.velocidad_maxima::numeric, 1) as vel_max
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      WHERE va.id = $1
    `, [viajeId]);

    if (viaje.rows.length === 0) {
      return res.status(404).json({ error: "Viaje no encontrado" });
    }

    const v = viaje.rows[0];

    const puntos = await pool.query(`
      SELECT lat::float, lng::float, timestamp_punto as ts,
        velocidad_kmh::float as vel, rumbo_grados::float as rumbo
      FROM geo_puntos
      WHERE camion_id = $1
        AND timestamp_punto >= $2
        AND timestamp_punto <= $3
      ORDER BY timestamp_punto ASC
      LIMIT 10000
    `, [v.camion_id, v.fecha_inicio, v.fecha_fin]);

    let puntosGps = puntos.rows;

    if (puntosGps.length < 3 && v.olat && v.olng && v.dlat && v.dlng) {
      puntosGps = [
        { lat: v.olat, lng: v.olng, ts: v.fecha_inicio, vel: 0, rumbo: 0 },
        { lat: v.dlat, lng: v.dlng, ts: v.fecha_fin, vel: 0, rumbo: 0 },
      ];
    }

    res.json({
      viaje: v,
      puntos: puntosGps,
      total_puntos: puntosGps.length,
    });
  } catch (e: any) {
    console.error("[VIAJE-GPS] Error:", e.message);
    res.status(500).json({ error: "Error interno al obtener ruta GPS" });
  }
});

export default router;
