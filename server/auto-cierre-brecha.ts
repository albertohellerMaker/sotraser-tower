import { pool } from "./db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface AutoCierreResult {
  fecha: string;
  cruces_aplicados: number;
  litros_cruzados: number;
  km_cruzado: number;
  geocercas_propuestas: Array<{ nombre: string; lat: number; lng: number; confianza: number; visitas: number; camiones: number }>;
  geocercas_creadas: number;
  duracion_seg: number;
}

/**
 * Cruza cargas Sigetra con viajes en un rango de fechas.
 * Asigna cada carga al viaje de la misma patente cuya fecha_fin sea más cercana (±12h).
 * Si solo se pasa fecha sin desde/hasta, procesa esa fecha + buffer ±2 días para cubrir timezone.
 */
export async function cruzarSigetra(opts: {
  fechaDesde: string;  // YYYY-MM-DD inclusivo
  fechaHasta: string;  // YYYY-MM-DD inclusivo
}): Promise<{ cruces: number; litros: number; km: number }> {
  const r = await pool.query(`
    WITH carga_match AS (
      SELECT
        c.id AS carga_id,
        v.id AS viaje_id,
        c.litros_surtidor,
        GREATEST(0, c.km_actual - c.km_anterior) AS km_carga,
        ROW_NUMBER() OVER (
          PARTITION BY c.id
          ORDER BY ABS(EXTRACT(EPOCH FROM v.fecha_fin - c.fecha::timestamp))
        ) AS rn
      FROM cargas c
      JOIN camiones cam ON REPLACE(cam.patente, '-', '') = REPLACE(c.patente, '-', '')
      JOIN viajes_aprendizaje v ON v.camion_id = cam.id
        AND v.contrato = 'CENCOSUD'
        AND ABS(EXTRACT(EPOCH FROM (v.fecha_fin - c.fecha::timestamp))) < 43200
      WHERE c.fecha::date BETWEEN $1::date AND $2::date
        AND v.fecha_inicio::date BETWEEN ($1::date - 1) AND ($2::date + 1)
        AND c.litros_surtidor > 0
    ),
    agregado AS (
      SELECT viaje_id,
        SUM(litros_surtidor)::numeric AS litros,
        SUM(km_carga)::numeric AS km,
        COUNT(*)::int AS n
      FROM carga_match
      WHERE rn = 1
      GROUP BY viaje_id
    ),
    upd AS (
      UPDATE viajes_aprendizaje v SET
        sigetra_cruzado = true,
        litros_cargados_sigetra = a.litros,
        km_declarado_sigetra = a.km,
        delta_cuadratura = CASE
          WHEN a.km > 0 THEN ROUND(((v.km_ecu - a.km) * 100.0 / a.km)::numeric, 2)
          ELSE NULL END,
        rendimiento_real = CASE
          WHEN a.litros > 0 THEN ROUND((v.km_ecu / a.litros)::numeric, 3)
          ELSE NULL END
      FROM agregado a
      WHERE v.id = a.viaje_id
      RETURNING v.id, a.litros, a.km
    )
    SELECT
      COUNT(*)::int AS cruces,
      COALESCE(SUM(litros), 0)::numeric AS litros,
      COALESCE(SUM(km), 0)::numeric AS km
    FROM upd
  `, [opts.fechaDesde, opts.fechaHasta]);

  return {
    cruces: Number(r.rows[0]?.cruces) || 0,
    litros: Number(r.rows[0]?.litros) || 0,
    km: Number(r.rows[0]?.km) || 0,
  };
}

/**
 * Detecta clusters de paradas recurrentes (≥3 camiones distintos paran ≥20min
 * en un radio de ~200m) que NO coinciden con geocerca existente.
 * Devuelve candidatos para nombrar.
 */
export async function detectarParadasHuerfanas(diasAtras: number = 14): Promise<Array<{
  lat: number; lng: number; visitas: number; camiones: number;
  duracion_promedio_min: number; ultima_visita: string;
}>> {
  // 1) Detecta paradas (gap-and-island por patente y día)
  // 2) Agrupa paradas cercanas (<200m) usando rounding a ~3 decimales (~110m)
  // 3) Filtra solo las que NO tienen geocerca dentro de 300m
  const r = await pool.query(`
    WITH paradas_raw AS (
      SELECT patente, fecha::date AS dia,
        SUM(CASE WHEN velocidad > 8 THEN 1 ELSE 0 END)
          OVER (PARTITION BY patente, fecha::date ORDER BY fecha) AS island_id,
        fecha, lat, lng, velocidad
      FROM wisetrack_posiciones
      WHERE grupo1 = 'CENCOSUD'
        AND fecha::date >= CURRENT_DATE - $1::int
        AND lat IS NOT NULL AND lng IS NOT NULL
    ),
    paradas AS (
      SELECT patente, dia, island_id,
        AVG(lat) AS lat, AVG(lng) AS lng,
        MIN(fecha) AS desde, MAX(fecha) AS hasta,
        EXTRACT(EPOCH FROM (MAX(fecha) - MIN(fecha)))/60 AS duracion_min
      FROM paradas_raw
      WHERE velocidad <= 8
      GROUP BY patente, dia, island_id
      HAVING EXTRACT(EPOCH FROM (MAX(fecha) - MIN(fecha)))/60 >= 20
    ),
    -- Cluster por bucket espacial ~110m (3 decimales)
    clusters AS (
      SELECT
        ROUND(lat::numeric, 3) AS lat_b,
        ROUND(lng::numeric, 3) AS lng_b,
        AVG(lat) AS lat, AVG(lng) AS lng,
        COUNT(*) AS visitas,
        COUNT(DISTINCT patente) AS camiones,
        AVG(duracion_min) AS dur_avg,
        MAX(hasta) AS ultima
      FROM paradas
      GROUP BY ROUND(lat::numeric, 3), ROUND(lng::numeric, 3)
      HAVING COUNT(DISTINCT patente) >= 3
        AND COUNT(*) >= 5
    ),
    -- Excluye los que ya tienen geocerca cerca (<300m via haversine)
    huerfanas AS (
      SELECT c.* FROM clusters c
      WHERE NOT EXISTS (
        SELECT 1 FROM geo_bases gb
        WHERE gb.lat IS NOT NULL AND gb.lng IS NOT NULL AND gb.activa = true
          AND (6371000 * acos(LEAST(1, GREATEST(-1,
            cos(radians(c.lat)) * cos(radians(gb.lat)) *
            cos(radians(gb.lng) - radians(c.lng)) +
            sin(radians(c.lat)) * sin(radians(gb.lat))
          )))) < 300
      )
    )
    SELECT lat, lng, visitas::int, camiones::int,
           ROUND(dur_avg::numeric)::int AS duracion_promedio_min,
           ultima AS ultima_visita
    FROM huerfanas
    ORDER BY camiones DESC, visitas DESC
    LIMIT 30
  `, [diasAtras]);

  return r.rows.map((row: any) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    visitas: Number(row.visitas),
    camiones: Number(row.camiones),
    duracion_promedio_min: Number(row.duracion_promedio_min),
    ultima_visita: row.ultima_visita,
  }));
}

/**
 * Usa Claude para sugerir nombres de geocercas basado en el contexto:
 * coordenadas, ciudad cercana, lugares comerciales típicos del contrato CENCOSUD
 * (JUMBO, Santa Isabel, CD VESPUCIO, CD NOVICIADO, etc).
 */
export async function nombrarParadasConIA(
  paradas: Array<{ lat: number; lng: number; visitas: number; camiones: number; duracion_promedio_min: number }>
): Promise<Array<{ lat: number; lng: number; nombre_sugerido: string; confianza: number; razon: string }>> {
  if (!anthropic || paradas.length === 0) return [];

  // Top 10 para no gastar tokens en exceso
  const top = paradas.slice(0, 10);

  // Para cada parada, busco geocerca CENCOSUD más cercana (aunque esté >300m) como pista
  const enriquecidas = await Promise.all(top.map(async (p) => {
    const cercana = await pool.query(`
      SELECT nombre, lat, lng,
        (6371000 * acos(LEAST(1, GREATEST(-1,
          cos(radians($1)) * cos(radians(lat)) *
          cos(radians(lng) - radians($2)) +
          sin(radians($1)) * sin(radians(lat))
        )))) AS dist_m
      FROM geo_bases
      WHERE lat IS NOT NULL AND lng IS NOT NULL AND activa = true
      ORDER BY dist_m ASC LIMIT 3
    `, [p.lat, p.lng]);
    return { ...p, vecinas: cercana.rows };
  }));

  const prompt = `Eres analista de logística de SOTRASER (transporte para CENCOSUD en Chile).
Tu tarea: nombrar paradas GPS recurrentes de camiones CENCOSUD para crear geocercas.

CONTEXTO DEL CONTRATO CENCOSUD:
- Centros de distribución (CD): CD VESPUCIO (Santiago), CD NOVICIADO, CD CHILLÁN, CD CONCEPCIÓN
- Tiendas JUMBO, Santa Isabel, Easy en distintas ciudades de Chile
- Rutas típicas: Santiago → sur (Chillán, Concepción, Temuco, Valdivia, Osorno, Puerto Montt) y norte (La Serena, Coquimbo)
- Estaciones de servicio (Copec, Petrobras, Enex) — paradas cortas
- Bases Sotraser: SOTRASER SANTIAGO, SOTRASER CONCEPCIÓN

Para cada parada propón un nombre conciso y técnico. Si no estás seguro, marca confianza baja.

PARADAS A NOMBRAR (en JSON):
${JSON.stringify(enriquecidas, null, 2)}

Responde EXCLUSIVAMENTE con JSON válido, array de objetos con esta forma:
[
  {"lat": -33.44, "lng": -70.78, "nombre_sugerido": "Estación Servicio Copec Ruta 5", "confianza": 0.85, "razon": "cerca de Copec Los Vilos Sur a 600m, parada media 30min típica de carga combustible"},
  ...
]
- nombre_sugerido: máximo 50 caracteres, en MAYÚSCULAS si es CD/JUMBO, formato natural si es otro
- confianza: 0.0 a 1.0
- razon: 1 frase explicando por qué`;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]);
    return arr.filter((x: any) => x.lat && x.lng && x.nombre_sugerido);
  } catch (e: any) {
    console.error("[auto-cierre] IA error:", e.message);
    return [];
  }
}

/**
 * Pipeline completo: cruza Sigetra + detecta + nombra + (opcional) crea geocercas
 */
export async function ejecutarAutoCierre(opts: {
  fecha: string;
  diasAtras?: number;
  autoCrearGeocercas?: boolean;   // si true crea geocercas con confianza ≥ 0.85
  umbralConfianza?: number;
}): Promise<AutoCierreResult> {
  const t0 = Date.now();
  const cruce = await cruzarSigetra({ fechaDesde: opts.fecha, fechaHasta: opts.fecha });
  const huerfanas = await detectarParadasHuerfanas(opts.diasAtras || 14);
  const sugerencias = await nombrarParadasConIA(huerfanas);

  const propuestas = huerfanas.map((p) => {
    const sug = sugerencias.find((s) =>
      Math.abs(s.lat - p.lat) < 0.001 && Math.abs(s.lng - p.lng) < 0.001
    );
    return {
      lat: p.lat,
      lng: p.lng,
      nombre: sug?.nombre_sugerido || `Parada (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`,
      confianza: sug?.confianza || 0,
      visitas: p.visitas,
      camiones: p.camiones,
    };
  });

  let creadas = 0;
  if (opts.autoCrearGeocercas) {
    const umbral = opts.umbralConfianza ?? 0.85;
    for (const p of propuestas) {
      if (p.confianza >= umbral) {
        try {
          await pool.query(
            `INSERT INTO geo_bases (nombre, lat, lng, radio_metros, contrato, activa)
             VALUES ($1, $2, $3, 200, 'CENCOSUD', true)`,
            [p.nombre, p.lat, p.lng]
          );
          creadas++;
        } catch (e: any) {
          if (!String(e.message).includes("duplicate")) console.error("[auto-cierre] insert error:", e.message);
        }
      }
    }
  }

  const dur = Math.round((Date.now() - t0) / 1000);
  console.log(`[auto-cierre] ${opts.fecha}: ${cruce.cruces} cruces (${Math.round(cruce.litros)}L, ${Math.round(cruce.km)}km), ${propuestas.length} paradas huérfanas, ${creadas} geocercas creadas, ${dur}s`);

  return {
    fecha: opts.fecha,
    cruces_aplicados: cruce.cruces,
    litros_cruzados: Math.round(cruce.litros),
    km_cruzado: Math.round(cruce.km),
    geocercas_propuestas: propuestas,
    geocercas_creadas: creadas,
    duracion_seg: dur,
  };
}
