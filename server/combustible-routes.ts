import { Router } from "express";
import { pool } from "./db";

const router = Router();

// Resumen general
router.get("/resumen", async (req, res) => {
  try {
    const contrato = (req.query.contrato as string) || "TODOS";
    const [stats, alertas, alzas] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int as total, COUNT(CASE WHEN resultado = 'OK' THEN 1 END)::int as ok,
          COUNT(CASE WHEN resultado = 'SOSPECHOSO' THEN 1 END)::int as sospechosos,
          COUNT(CASE WHEN resultado LIKE 'ALERTA_FRAUDE%' THEN 1 END)::int as fraudes,
          COUNT(CASE WHEN resultado = 'CARGA_SIN_SUBIDA' THEN 1 END)::int as sin_subida,
          COUNT(CASE WHEN resultado = 'SIN_DATOS_ECU' THEN 1 END)::int as sin_ecu,
          ROUND(SUM(CASE WHEN resultado LIKE 'ALERTA%' THEN ABS(COALESCE(litros_diferencia,0)) ELSE 0 END)::numeric) as litros_sospechosos
        FROM validaciones_carga WHERE fecha_carga::timestamp >= NOW() - INTERVAL '30 days'
          AND ($1 = 'TODOS' OR contrato = $1)
      `, [contrato]),
      pool.query(`
        SELECT id, patente, contrato, fecha_carga::text as fecha, litros_declarados, litros_confirmados_ecu, litros_diferencia,
          diferencia_pct, nivel_antes_pct, nivel_despues_pct, resultado, conductor, estacion, gestionado
        FROM validaciones_carga WHERE resultado NOT IN ('OK','SIN_DATOS_ECU','CARGA_MINIMA_IGNORADA','SIN_VENTANA_ECU')
          AND NOT gestionado AND fecha_carga::timestamp >= NOW() - INTERVAL '30 days' AND ($1 = 'TODOS' OR contrato = $1)
        ORDER BY CASE resultado WHEN 'ALERTA_FRAUDE' THEN 1 WHEN 'CARGA_SIN_SUBIDA' THEN 2 WHEN 'SOSPECHOSO' THEN 3 ELSE 4 END, fecha_carga DESC LIMIT 50
      `, [contrato]),
      pool.query(`
        SELECT patente, contrato, fecha::text, nivel_antes_pct, nivel_despues_pct, litros_estimados
        FROM alzas_nivel_sin_carga WHERE NOT gestionado AND fecha >= NOW() - INTERVAL '30 days' AND ($1 = 'TODOS' OR contrato = $1)
        ORDER BY fecha DESC LIMIT 20
      `, [contrato]),
    ]);
    res.json({ stats: stats.rows[0], alertas: alertas.rows, alzas_sin_carga: alzas.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ADN por camion
router.get("/adn/:patente", async (req, res) => {
  try {
    const { patente } = req.params;
    const [adn, historial] = await Promise.all([
      pool.query("SELECT * FROM adn_combustible WHERE patente = $1", [patente]),
      pool.query(`
        SELECT vc.fecha_carga::text as fecha, vc.litros_declarados, vc.litros_confirmados_ecu, vc.diferencia_pct,
          vc.nivel_antes_pct, vc.nivel_despues_pct, vc.resultado, vc.estacion, vc.conductor
        FROM validaciones_carga vc WHERE vc.patente = $1 ORDER BY vc.fecha_carga DESC LIMIT 20
      `, [patente]),
    ]);
    res.json({ adn: adn.rows[0] || null, historial: historial.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Cargas del dia
router.get("/cargas-dia", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const contrato = (req.query.contrato as string) || "TODOS";
    const cargas = await pool.query(`
      SELECT c.id, c.patente, c.faena as contrato, c.fecha::text, c.litros_surtidor as litros, c.lugar_consumo as estacion, c.conductor,
        vc.resultado, vc.nivel_antes_pct, vc.nivel_despues_pct, vc.litros_confirmados_ecu, vc.diferencia_pct, vc.litros_diferencia,
        adn.rend_promedio, adn.estanque_estimado_litros, adn.confianza as adn_confianza
      FROM cargas c LEFT JOIN validaciones_carga vc ON vc.carga_id = c.id
        LEFT JOIN adn_combustible adn ON adn.patente = c.patente
      WHERE DATE(c.fecha::timestamp) = $1 AND c.litros_surtidor >= 20 AND ($2 = 'TODOS' OR c.faena = $2)
      ORDER BY CASE vc.resultado WHEN 'ALERTA_FRAUDE' THEN 1 WHEN 'CARGA_SIN_SUBIDA' THEN 2 WHEN 'SOSPECHOSO' THEN 3 ELSE 5 END, c.fecha DESC
    `, [fecha, contrato]);
    res.json({ fecha, total: cargas.rows.length, cargas: cargas.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Gestionar
router.post("/gestionar/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, nota } = req.body;
    await pool.query("UPDATE validaciones_carga SET gestionado = true, decision = $1, nota = $2, fecha_gestion = NOW() WHERE id = $3", [decision, nota, id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Ranking camiones
router.get("/ranking-camiones", async (req, res) => {
  try {
    const contrato = (req.query.contrato as string) || "TODOS";
    const r = await pool.query(`
      SELECT vc.patente, vc.contrato, COUNT(*)::int as total,
        COUNT(CASE WHEN resultado = 'OK' THEN 1 END)::int as ok,
        COUNT(CASE WHEN resultado IN ('SOSPECHOSO','ALERTA_FRAUDE','CARGA_SIN_SUBIDA') THEN 1 END)::int as alertas,
        ROUND(SUM(CASE WHEN resultado LIKE 'ALERTA%' THEN ABS(COALESCE(litros_diferencia,0)) ELSE 0 END)::numeric) as litros_sosp,
        adn.rend_promedio, adn.confianza as adn_confianza
      FROM validaciones_carga vc LEFT JOIN adn_combustible adn ON adn.patente = vc.patente
      WHERE vc.resultado NOT IN ('SIN_DATOS_ECU','CARGA_MINIMA_IGNORADA','SIN_VENTANA_ECU')
        AND vc.fecha_carga::timestamp >= NOW() - INTERVAL '30 days' AND ($1 = 'TODOS' OR vc.contrato = $1)
      GROUP BY vc.patente, vc.contrato, adn.rend_promedio, adn.confianza
      ORDER BY alertas DESC
    `, [contrato]);
    res.json({ camiones: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ANTIFRAUDE — cruces para detectar robos
router.get("/antifraude", async (req, res) => {
  try {
    const dias = parseInt((req.query.dias as string) || "30");
    const contrato = (req.query.contrato as string) || "TODOS";
    const PRECIO_DIESEL = parseFloat((req.query.precio as string) || "1100");

    const [duplicadas, surtidorVsEcu, sinMovimiento, sobreCapacidad, rendBajo] = await Promise.all([
      // A) Cargas duplicadas: misma patente, < 6h entre cargas
      pool.query(`
        SELECT c1.id as id1, c2.id as id2, c1.patente, c1.fecha::text as fecha1, c2.fecha::text as fecha2,
          c1.litros_surtidor as litros1, c2.litros_surtidor as litros2,
          c1.lugar_consumo as lugar1, c2.lugar_consumo as lugar2, c1.conductor,
          EXTRACT(EPOCH FROM (c2.fecha::timestamp - c1.fecha::timestamp))/3600 as horas_diff,
          (c1.litros_surtidor + c2.litros_surtidor) as litros_total
        FROM cargas c1 JOIN cargas c2 ON c2.patente = c1.patente AND c2.id > c1.id
          AND c2.fecha::timestamp > c1.fecha::timestamp
          AND c2.fecha::timestamp <= c1.fecha::timestamp + INTERVAL '6 hours'
        WHERE c1.fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND c1.litros_surtidor >= 30 AND c2.litros_surtidor >= 30
          AND ($2 = 'TODOS' OR c1.faena = $2)
        ORDER BY litros_total DESC LIMIT 100
      `, [dias, contrato]),

      // B) Surtidor >> ECU: combustible cargado al ticket pero no entró al estanque
      pool.query(`
        SELECT id, patente, fecha::text, litros_surtidor, litros_ecu,
          (litros_surtidor - litros_ecu) as diff_litros,
          ROUND(((litros_surtidor - litros_ecu) / NULLIF(litros_surtidor,0) * 100)::numeric, 1) as diff_pct,
          lugar_consumo, conductor, faena
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND litros_surtidor >= 50 AND litros_ecu > 0
          AND (litros_surtidor - litros_ecu) > 25
          AND ((litros_surtidor - litros_ecu) / NULLIF(litros_surtidor,0)) > 0.10
          AND ($2 = 'TODOS' OR faena = $2)
        ORDER BY (litros_surtidor - litros_ecu) DESC LIMIT 100
      `, [dias, contrato]),

      // C) Carga sin movimiento de km: cargó >100L pero camión casi no se movió
      pool.query(`
        SELECT id, patente, fecha::text, litros_surtidor, km_anterior, km_actual,
          (km_actual - km_anterior) as km_recorridos,
          lugar_consumo, conductor, faena
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND litros_surtidor >= 100
          AND (km_actual - km_anterior) BETWEEN 0 AND 30
          AND km_anterior > 0
          AND ($2 = 'TODOS' OR faena = $2)
        ORDER BY litros_surtidor DESC LIMIT 100
      `, [dias, contrato]),

      // D) Carga > capacidad típica (umbral 700L = camión sin estanque doble)
      pool.query(`
        SELECT id, patente, fecha::text, litros_surtidor,
          700 as capacidad,
          (litros_surtidor - 700) as exceso,
          lugar_consumo, conductor, faena
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND litros_surtidor > 700
          AND ($2 = 'TODOS' OR faena = $2)
        ORDER BY litros_surtidor DESC LIMIT 50
      `, [dias, contrato]),

      // E) Rendimiento real muy bajo vs promedio histórico del camión (consumo excesivo)
      pool.query(`
        WITH promedios AS (
          SELECT patente, AVG(rend_real) as rend_avg, COUNT(*) as n
          FROM cargas WHERE rend_real > 0 AND rend_real < 10
            AND fecha::timestamp >= NOW() - INTERVAL '180 days'
          GROUP BY patente HAVING COUNT(*) >= 5
        )
        SELECT c.id, c.patente, c.fecha::text, c.litros_surtidor, c.rend_real,
          ROUND(p.rend_avg::numeric, 2) as rend_adn,
          ROUND(((p.rend_avg - c.rend_real) / NULLIF(p.rend_avg,0) * 100)::numeric, 1) as caida_pct,
          (c.km_actual - c.km_anterior) as km_recorridos,
          (c.litros_surtidor - (c.km_actual - c.km_anterior) / NULLIF(p.rend_avg,0)) as litros_extra,
          c.lugar_consumo, c.conductor, c.faena
        FROM cargas c JOIN promedios p ON p.patente = c.patente
        WHERE c.fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND c.rend_real > 0 AND c.rend_real < p.rend_avg * 0.75
          AND (c.km_actual - c.km_anterior) >= 100
          AND ($2 = 'TODOS' OR c.faena = $2)
        ORDER BY (p.rend_avg - c.rend_real) DESC LIMIT 100
      `, [dias, contrato]),
    ]);

    const litrosDup = duplicadas.rows.reduce((s: number, r: any) => s + Math.min(parseFloat(r.litros1), parseFloat(r.litros2)), 0);
    const litrosSurtVsEcu = surtidorVsEcu.rows.reduce((s: number, r: any) => s + parseFloat(r.diff_litros), 0);
    const litrosSinMov = sinMovimiento.rows.reduce((s: number, r: any) => s + parseFloat(r.litros_surtidor), 0);
    const litrosSobreCap = sobreCapacidad.rows.reduce((s: number, r: any) => s + parseFloat(r.exceso), 0);
    const litrosRendBajo = rendBajo.rows.reduce((s: number, r: any) => s + Math.max(0, parseFloat(r.litros_extra) || 0), 0);

    const totalLitros = litrosDup + litrosSurtVsEcu + litrosSinMov + litrosSobreCap + litrosRendBajo;
    const totalCLP = Math.round(totalLitros * PRECIO_DIESEL);

    res.json({
      periodo_dias: dias,
      precio_diesel: PRECIO_DIESEL,
      resumen: {
        total_alertas: duplicadas.rows.length + surtidorVsEcu.rows.length + sinMovimiento.rows.length + sobreCapacidad.rows.length + rendBajo.rows.length,
        litros_perdidos_estimados: Math.round(totalLitros),
        clp_perdidos_estimados: totalCLP,
        por_categoria: {
          duplicadas: { casos: duplicadas.rows.length, litros: Math.round(litrosDup), clp: Math.round(litrosDup * PRECIO_DIESEL) },
          surtidor_vs_ecu: { casos: surtidorVsEcu.rows.length, litros: Math.round(litrosSurtVsEcu), clp: Math.round(litrosSurtVsEcu * PRECIO_DIESEL) },
          sin_movimiento: { casos: sinMovimiento.rows.length, litros: Math.round(litrosSinMov), clp: Math.round(litrosSinMov * PRECIO_DIESEL) },
          sobre_capacidad: { casos: sobreCapacidad.rows.length, litros: Math.round(litrosSobreCap), clp: Math.round(litrosSobreCap * PRECIO_DIESEL) },
          rendimiento_bajo: { casos: rendBajo.rows.length, litros: Math.round(litrosRendBajo), clp: Math.round(litrosRendBajo * PRECIO_DIESEL) },
        },
      },
      duplicadas: duplicadas.rows,
      surtidor_vs_ecu: surtidorVsEcu.rows,
      sin_movimiento: sinMovimiento.rows,
      sobre_capacidad: sobreCapacidad.rows,
      rendimiento_bajo: rendBajo.rows,
    });
  } catch (e: any) {
    console.error("[antifraude]", e);
    res.status(500).json({ error: e.message });
  }
});

// Geocoding heurístico de estaciones por nombre de lugar_consumo
// Bases conocidas + interpolación de Ruta 5 / Panamericana por KM
function geocodeLugar(raw: string | null): { lat: number; lng: number; tipo: string } | null {
  if (!raw) return null;
  const s = raw.toUpperCase().trim();

  const fixed: Record<string, [number, number, string]> = {
    "QUILICURA": [-33.3680, -70.7234, "EVC"],
    "LOS ANGELES 3": [-37.4730, -72.3470, "EVC"],
    "LOS ANGELES": [-37.4690, -72.3539, "EVC"],
    "OSORNO": [-40.5713, -73.1336, "EVC"],
    "TEMUCO": [-38.7397, -72.5984, "EVC"],
    "EVC COLORADO": [-33.4150, -70.6100, "EVC"],
    "EVC VESPUCIO": [-33.5150, -70.6850, "EVC"],
    "EVC SAN BERNARDO": [-33.5950, -70.7050, "EVC"],
    "EVC MAIPU": [-33.5100, -70.7580, "EVC"],
    "EVC CONCEPCION": [-36.8270, -73.0500, "EVC"],
    "EVC PUERTO MONTT": [-41.4720, -72.9360, "EVC"],
  };
  for (const [k, [lat, lng, tipo]] of Object.entries(fixed)) {
    if (s === k || s.startsWith(k + " ") || s.includes(k)) return { lat, lng, tipo };
  }

  // Ruta 5 / Panamericana — extraer KM
  const isNorte = /(NORTE|PANAM\.?\s*NORTE|PANAMERICANA NORTE|RUTA\s*5\s*NORTE)/.test(s);
  const isSur = /(SUR|PANAM\.?\s*SUR|PANAMERICANA SUR|RUTA\s*5\s*SUR)/.test(s);
  const km = (() => {
    const m = s.match(/KM\.?\s*(\d{1,4}(?:[.,]\d+)?)/);
    if (!m) return null;
    return parseFloat(m[1].replace(",", "."));
  })();

  if (km !== null && (isNorte || isSur || /RUTA\s*5|PANAM/.test(s))) {
    // Puntos de calibración Ruta 5 (km desde Santiago, lat, lng)
    const ptsNorte: Array<[number, number, number]> = [
      [0, -33.45, -70.65],
      [100, -32.85, -70.93],
      [200, -32.05, -71.10],
      [300, -31.05, -71.30],
      [400, -30.30, -71.40],
      [500, -29.55, -71.25],
      [700, -27.70, -70.40],
      [900, -26.00, -69.95],
      [1100, -24.00, -69.50],
      [1400, -22.50, -69.00],
      [1800, -19.50, -69.70],
      [2100, -18.50, -70.30],
    ];
    const ptsSur: Array<[number, number, number]> = [
      [0, -33.45, -70.65],
      [100, -34.20, -71.00],
      [200, -34.85, -71.25],
      [300, -35.55, -71.55],
      [400, -36.30, -72.10],
      [500, -37.20, -72.20],
      [600, -37.85, -72.45],
      [700, -38.74, -72.60],
      [800, -39.80, -73.00],
      [900, -40.57, -73.13],
      [1000, -41.00, -73.05],
      [1100, -41.47, -72.94],
      [1300, -42.50, -73.80],
    ];
    const pts = isSur ? ptsSur : ptsNorte;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1][0] < km) i++;
    if (i >= pts.length - 1) return { lat: pts[pts.length - 1][1], lng: pts[pts.length - 1][2], tipo: "RUTA" };
    const [k0, lat0, lng0] = pts[i];
    const [k1, lat1, lng1] = pts[i + 1];
    const t = (km - k0) / (k1 - k0);
    return { lat: lat0 + (lat1 - lat0) * t, lng: lng0 + (lng1 - lng0) * t, tipo: "RUTA" };
  }

  // Comunas conocidas en lugar_consumo (e.g. "LOS CARRERA, ESQ. LAUTARO" en Santiago, fallback aproximado)
  const comunas: Record<string, [number, number]> = {
    "QUILICURA": [-33.36, -70.72], "MAIPU": [-33.51, -70.76], "PUDAHUEL": [-33.44, -70.78],
    "SAN BERNARDO": [-33.59, -70.70], "ANTOFAGASTA": [-23.65, -70.40],
    "CALAMA": [-22.46, -68.93], "IQUIQUE": [-20.21, -70.15], "ARICA": [-18.48, -70.32],
    "VALPARAISO": [-33.05, -71.62], "RANCAGUA": [-34.17, -70.74],
    "TALCA": [-35.43, -71.66], "CHILLAN": [-36.61, -72.10], "CONCEPCION": [-36.83, -73.05],
    "PUERTO MONTT": [-41.47, -72.94], "VALDIVIA": [-39.81, -73.24],
    "COQUIMBO": [-29.95, -71.34], "LA SERENA": [-29.91, -71.25], "COPIAPO": [-27.36, -70.34],
  };
  for (const [c, [lat, lng]] of Object.entries(comunas)) {
    if (s.includes(c)) return { lat, lng, tipo: "COMUNA" };
  }

  return null;
}

// CRUCE TARJETAS — SIGETRA TST × SHELL CARD × EVC × otros
router.get("/cruce-tarjetas", async (req, res) => {
  try {
    const dias = parseInt((req.query.dias as string) || "30");
    const PRECIO = parseFloat((req.query.precio as string) || "1100");

    // Clasificación: EVC = red interna Sotraser; estaciones SHELL/Sigetra/Copec por nombre conocido
    const clasif = (col: string) => `
      CASE
        WHEN UPPER(${col}) LIKE 'EVC%' THEN 'EVC'
        WHEN UPPER(${col}) LIKE '%SHELL%' THEN 'SHELL'
        WHEN UPPER(${col}) LIKE '%SIGETRA%' OR UPPER(${col}) LIKE '%COPEC%' THEN 'SIGETRA'
        WHEN UPPER(${col}) LIKE '%PETROBRAS%' THEN 'PETROBRAS'
        WHEN UPPER(${col}) LIKE '%RUTA%' OR UPPER(${col}) LIKE '%PANAM%' OR UPPER(${col}) LIKE '%CARRETERA%' OR UPPER(${col}) LIKE '%KM%' THEN 'RUTA_EXTERNA'
        WHEN UPPER(${col}) IN ('QUILICURA','LOS ANGELES 3','LOS ANGELES','OSORNO','TEMUCO') THEN 'EVC'
        ELSE 'OTRO'
      END
    `;
    const SQL_CLASIF = clasif("lugar_consumo");
    const SQL_CLASIF_C = clasif("c.lugar_consumo");

    const [porSistema, porCamion, anomalias, sinGuia, guiaDuplicada, lugaresUnicos, bombasRaw, secuencia] = await Promise.all([
      // Resumen por sistema de pago
      pool.query(`
        SELECT ${SQL_CLASIF} as sistema,
          COUNT(*)::int as cargas,
          SUM(litros_surtidor)::int as litros,
          ROUND(AVG(litros_surtidor)::numeric, 1) as litros_avg,
          COUNT(DISTINCT patente)::int as camiones,
          COUNT(CASE WHEN num_guia IS NULL THEN 1 END)::int as sin_guia
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
        GROUP BY ${SQL_CLASIF} ORDER BY litros DESC
      `, [dias]),

      // Por camión: red preferente y fidelidad (% cargas en su red principal)
      pool.query(`
        WITH cls AS (
          SELECT patente, ${SQL_CLASIF} as sistema, litros_surtidor
          FROM cargas WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
        ),
        por_cam AS (
          SELECT patente, sistema, COUNT(*)::int as n_sis, SUM(litros_surtidor)::int as l_sis
          FROM cls GROUP BY patente, sistema
        ),
        principal AS (
          SELECT DISTINCT ON (patente) patente, sistema as sistema_principal, n_sis as n_principal, l_sis as l_principal
          FROM por_cam ORDER BY patente, n_sis DESC
        ),
        totales AS (
          SELECT patente, COUNT(*)::int as n_total, SUM(litros_surtidor)::int as l_total, COUNT(DISTINCT sistema)::int as redes_distintas
          FROM cls GROUP BY patente
        )
        SELECT t.patente, p.sistema_principal, t.n_total, t.l_total, p.n_principal,
          ROUND((p.n_principal::numeric / t.n_total * 100), 1) as fidelidad_pct,
          (t.n_total - p.n_principal) as cargas_fuera_red,
          (t.l_total - p.l_principal) as litros_fuera_red,
          t.redes_distintas
        FROM totales t JOIN principal p ON p.patente = t.patente
        WHERE t.n_total >= 3 AND p.n_principal::numeric / t.n_total < 0.85
        ORDER BY (t.l_total - p.l_principal) DESC LIMIT 50
      `, [dias]),

      // Saltos de red (mismo camión cambia de sistema en cargas consecutivas)
      pool.query(`
        WITH ord AS (
          SELECT id, patente, fecha, litros_surtidor, lugar_consumo, conductor,
            ${SQL_CLASIF} as sistema,
            LAG(${SQL_CLASIF}) OVER (PARTITION BY patente ORDER BY fecha) as sistema_prev,
            LAG(fecha) OVER (PARTITION BY patente ORDER BY fecha) as fecha_prev
          FROM cargas WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
        )
        SELECT patente, fecha::text, litros_surtidor, sistema, sistema_prev, lugar_consumo, conductor,
          EXTRACT(EPOCH FROM (fecha::timestamp - fecha_prev::timestamp))/3600 as horas_desde_anterior
        FROM ord WHERE sistema_prev IS NOT NULL AND sistema != sistema_prev
          AND fecha_prev::timestamp >= fecha::timestamp - INTERVAL '24 hours'
          AND litros_surtidor >= 50
        ORDER BY litros_surtidor DESC LIMIT 50
      `, [dias]),

      // Cargas sin número de guía (transacción no rastreable)
      pool.query(`
        SELECT id, patente, fecha::text, litros_surtidor, lugar_consumo, conductor, ${SQL_CLASIF} as sistema
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND num_guia IS NULL AND litros_surtidor >= 30
        ORDER BY litros_surtidor DESC LIMIT 50
      `, [dias]),

      // num_guia duplicada en el mismo proveedor (doble cobro)
      pool.query(`
        SELECT num_guia, COUNT(*)::int as veces, STRING_AGG(DISTINCT patente, ', ') as patentes,
          SUM(litros_surtidor)::int as litros_total, MIN(fecha)::text as primera, MAX(fecha)::text as ultima,
          ARRAY_AGG(DISTINCT lugar_consumo) as lugares
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND num_guia IS NOT NULL
        GROUP BY num_guia HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC, SUM(litros_surtidor) DESC LIMIT 30
      `, [dias]),

      // Estaciones visitadas solo 1 vez (fuera de red habitual = posible desvío)
      pool.query(`
        WITH freq AS (
          SELECT lugar_consumo, COUNT(*)::int as visitas, SUM(litros_surtidor)::int as litros
          FROM cargas WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          GROUP BY lugar_consumo
        )
        SELECT c.id, c.patente, c.fecha::text, c.litros_surtidor, c.lugar_consumo, c.conductor, ${SQL_CLASIF_C} as sistema
        FROM cargas c JOIN freq f ON f.lugar_consumo = c.lugar_consumo
        WHERE c.fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND f.visitas = 1 AND c.litros_surtidor >= 100
        ORDER BY c.litros_surtidor DESC LIMIT 30
      `, [dias]),

      // Bombas/estaciones agregadas (para mapa)
      pool.query(`
        SELECT lugar_consumo, ${SQL_CLASIF} as sistema,
          COUNT(*)::int as cargas, SUM(litros_surtidor)::int as litros,
          COUNT(DISTINCT patente)::int as camiones,
          MIN(fecha)::text as primera, MAX(fecha)::text as ultima
        FROM cargas
        WHERE fecha::timestamp >= NOW() - ($1::text || ' days')::interval
          AND lugar_consumo IS NOT NULL AND lugar_consumo != ''
        GROUP BY lugar_consumo, ${SQL_CLASIF}
        ORDER BY litros DESC
      `, [dias]),

      // Secuencia rendimiento por camión: km recorridos entre cargas vs rendimiento esperado
      pool.query(`
        WITH cargas_p AS (
          SELECT c.id, c.patente, c.fecha::timestamp as fecha, c.litros_surtidor,
            c.km_anterior, c.km_actual, c.lugar_consumo, c.conductor, c.rend_real,
            ${SQL_CLASIF_C} as sistema,
            (c.km_actual - c.km_anterior) as km_carga,
            LAG(c.km_actual) OVER (PARTITION BY c.patente ORDER BY c.fecha) as km_prev,
            LAG(c.fecha::timestamp) OVER (PARTITION BY c.patente ORDER BY c.fecha) as fecha_prev,
            LAG(c.lugar_consumo) OVER (PARTITION BY c.patente ORDER BY c.fecha) as lugar_prev
          FROM cargas c
          WHERE c.fecha::timestamp >= NOW() - ($1::text || ' days')::interval
            AND c.km_actual > 0
        ),
        hist AS (
          SELECT patente,
            ROUND(AVG(rend_real)::numeric, 2) as rend_avg,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY rend_real)::numeric, 2) as rend_median,
            COUNT(*)::int as n_hist
          FROM cargas
          WHERE rend_real > 0 AND rend_real < 10
            AND fecha::timestamp >= NOW() - INTERVAL '180 days'
          GROUP BY patente HAVING COUNT(*) >= 5
        )
        SELECT cp.id, cp.patente, cp.fecha::text as fecha, cp.litros_surtidor,
          cp.km_actual, cp.km_carga, cp.lugar_consumo, cp.conductor, cp.sistema,
          cp.rend_real,
          (cp.km_actual - cp.km_prev) as km_entre_cargas,
          EXTRACT(EPOCH FROM (cp.fecha - cp.fecha_prev))/3600 as horas_entre_cargas,
          cp.lugar_prev,
          h.rend_avg, h.rend_median,
          CASE WHEN h.rend_median > 0 THEN
            ROUND((cp.litros_surtidor - (cp.km_actual - cp.km_prev) / NULLIF(h.rend_median,0))::numeric, 1)
          END as litros_extra_estimado,
          CASE
            WHEN cp.km_prev IS NULL THEN 'PRIMERA'
            WHEN (cp.km_actual - cp.km_prev) <= 0 THEN 'KM_NO_AVANZA'
            WHEN (cp.km_actual - cp.km_prev) < 20 AND cp.litros_surtidor >= 100 THEN 'CARGA_GRANDE_SIN_KM'
            WHEN h.rend_median IS NULL THEN 'SIN_HISTORICO'
            WHEN cp.litros_surtidor > 0 AND ((cp.km_actual - cp.km_prev) / cp.litros_surtidor) < h.rend_median * 0.6 THEN 'CONSUMO_EXCESIVO'
            WHEN cp.litros_surtidor > 0 AND ((cp.km_actual - cp.km_prev) / cp.litros_surtidor) > h.rend_median * 1.6 THEN 'KM_FANTASMA'
            ELSE 'OK'
          END as flag
        FROM cargas_p cp LEFT JOIN hist h ON h.patente = cp.patente
        ORDER BY cp.patente, cp.fecha
      `, [dias]),
    ]);

    const totalLitros = porSistema.rows.reduce((s: number, r: any) => s + (r.litros || 0), 0);
    const litrosFueraRed = porCamion.rows.reduce((s: number, r: any) => s + (r.litros_fuera_red || 0), 0);
    const litrosSinGuia = sinGuia.rows.reduce((s: number, r: any) => s + parseFloat(r.litros_surtidor || 0), 0);
    const litrosGuiaDup = guiaDuplicada.rows.reduce((s: number, r: any) => s + (r.litros_total || 0), 0);

    // Sistema dominante de la flota (red Sotraser oficial)
    const dominante = porSistema.rows[0]?.sistema || "EVC";
    const cargasDominante = porSistema.rows[0]?.cargas || 0;
    const totalCargas = porSistema.rows.reduce((s: number, r: any) => s + (r.cargas || 0), 0);

    // Geocodificar bombas (para mapa)
    const bombas = (bombasRaw.rows || [])
      .map((b: any) => {
        const g = geocodeLugar(b.lugar_consumo);
        return g ? { ...b, lat: g.lat, lng: g.lng, geo_tipo: g.tipo, clp: Math.round((b.litros || 0) * PRECIO) } : null;
      })
      .filter(Boolean);

    // Anomalías de secuencia (rendimiento)
    const seqRows = secuencia.rows || [];
    const anomaliasSec = seqRows.filter((r: any) =>
      ["CONSUMO_EXCESIVO", "KM_FANTASMA", "CARGA_GRANDE_SIN_KM", "KM_NO_AVANZA"].includes(r.flag)
    );
    const litrosExtraTotal = anomaliasSec
      .filter((r: any) => r.flag === "CONSUMO_EXCESIVO" && r.litros_extra_estimado > 0)
      .reduce((s: number, r: any) => s + parseFloat(r.litros_extra_estimado || 0), 0);

    res.json({
      periodo_dias: dias,
      precio_diesel: PRECIO,
      resumen: {
        total_cargas: totalCargas,
        total_litros: totalLitros,
        total_clp: Math.round(totalLitros * PRECIO),
        red_dominante: dominante,
        fidelidad_red_pct: totalCargas > 0 ? Math.round(cargasDominante / totalCargas * 100) : 0,
        litros_fuera_red: Math.round(litrosFueraRed),
        clp_fuera_red: Math.round(litrosFueraRed * PRECIO),
        cargas_sin_guia: sinGuia.rows.length,
        litros_sin_guia: Math.round(litrosSinGuia),
        guias_duplicadas: guiaDuplicada.rows.length,
        litros_duplicados: litrosGuiaDup,
        clp_duplicados: Math.round(litrosGuiaDup * PRECIO),
        camiones_baja_fidelidad: porCamion.rows.length,
        saltos_red_24h: anomalias.rows.length,
        cargas_estacion_unica: lugaresUnicos.rows.length,
        bombas_geocodificadas: bombas.length,
        bombas_total: bombasRaw.rows.length,
        anomalias_rendimiento: anomaliasSec.length,
        litros_extra_estimado: Math.round(litrosExtraTotal),
        clp_extra_estimado: Math.round(litrosExtraTotal * PRECIO),
      },
      por_sistema: porSistema.rows,
      camiones_baja_fidelidad: porCamion.rows,
      saltos_red: anomalias.rows,
      sin_guia: sinGuia.rows,
      guias_duplicadas: guiaDuplicada.rows,
      estaciones_unicas: lugaresUnicos.rows,
      bombas,
      secuencia_anomalias: anomaliasSec.slice(0, 100),
    });
  } catch (e: any) {
    console.error("[cruce-tarjetas]", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
