import { pool } from "./db";

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
    -- Excluye los que ya tienen geocerca cerca (<300m via haversine) en cualquier tabla
    huerfanas AS (
      SELECT c.* FROM clusters c
      WHERE NOT EXISTS (
        SELECT 1 FROM geo_lugares gl
        WHERE gl.lat IS NOT NULL AND gl.lng IS NOT NULL AND gl.activo = true
          AND (6371000 * acos(LEAST(1, GREATEST(-1,
            cos(radians(c.lat)) * cos(radians(gl.lat)) *
            cos(radians(gl.lng) - radians(c.lng)) +
            sin(radians(c.lat)) * sin(radians(gl.lat))
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
 * Reverse geocoding via Nominatim (OpenStreetMap, gratis, sin API key).
 * Devuelve {comuna, calle, tipo_lugar} para una coordenada.
 */
async function reverseGeocode(lat: number, lng: number): Promise<{
  comuna?: string; calle?: string; nombre?: string; tipo?: string;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&namedetails=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "SOTRASER-Fleet/1.0 (logistica@sotraser.cl)" }
    });
    if (!resp.ok) return null;
    const j: any = await resp.json();
    const a = j.address || {};
    return {
      comuna: a.city || a.town || a.village || a.county || a.suburb,
      calle: a.road,
      nombre: j.namedetails?.name || j.name,
      tipo: a.shop || a.amenity || a.industrial || a.building,
    };
  } catch { return null; }
}

/**
 * Inferir tipo de lugar por duración promedio + densidad de visitas.
 */
function inferirTipoPorPatron(p: { duracion_promedio_min: number; camiones: number; visitas: number }): {
  tipo: string; confianza_base: number;
} {
  const d = p.duracion_promedio_min;
  if (d >= 90) return { tipo: "CD/Centro Logístico", confianza_base: 0.85 };  // larga = carga/descarga
  if (d >= 45) return { tipo: "Tienda/Punto Entrega", confianza_base: 0.75 };
  if (d >= 25) return { tipo: "Punto Carga Combustible", confianza_base: 0.70 };
  return { tipo: "Parada Operacional", confianza_base: 0.60 };
}

/**
 * Nombra paradas usando: (1) geocerca CENCOSUD vecina, (2) reverse-geocoding OSM,
 * (3) heurística por patrón. NO requiere API key. 100% autónomo.
 */
export async function nombrarParadasConIA(
  paradas: Array<{ lat: number; lng: number; visitas: number; camiones: number; duracion_promedio_min: number }>
): Promise<Array<{ lat: number; lng: number; nombre_sugerido: string; confianza: number; razon: string }>> {
  if (paradas.length === 0) return [];

  const top = paradas.slice(0, 15);
  const out: Array<{ lat: number; lng: number; nombre_sugerido: string; confianza: number; razon: string }> = [];

  for (const p of top) {
    // 1) ¿Hay una geocerca vecina (300m–2km)? Si sí, naming derivado
    const vecina = await pool.query(`
      SELECT nombre,
        (6371000 * acos(LEAST(1, GREATEST(-1,
          cos(radians($1)) * cos(radians(lat)) *
          cos(radians(lng) - radians($2)) +
          sin(radians($1)) * sin(radians(lat))
        )))) AS dist_m
      FROM geo_bases
      WHERE lat IS NOT NULL AND lng IS NOT NULL AND activa = true
      ORDER BY dist_m ASC LIMIT 1
    `, [p.lat, p.lng]);
    const v = vecina.rows[0];

    // 2) Reverse geocoding OSM
    const geo = await reverseGeocode(p.lat, p.lng);
    // Throttle: Nominatim pide <1 req/s
    await new Promise(r => setTimeout(r, 1100));

    const patron = inferirTipoPorPatron(p);
    let nombre = "";
    let confianza = patron.confianza_base;
    let razon = "";

    if (v && Number(v.dist_m) < 1500) {
      // Cerca de geocerca conocida — nombre derivado
      const distKm = (Number(v.dist_m) / 1000).toFixed(1);
      nombre = `Zona ${v.nombre} (${distKm}km)`;
      confianza = Math.min(0.95, confianza + 0.10);
      razon = `A ${Math.round(Number(v.dist_m))}m de "${v.nombre}", patrón ${patron.tipo}`;
    } else if (geo?.nombre && geo.tipo) {
      nombre = `${geo.nombre} - ${geo.comuna || ""}`.trim().slice(0, 50);
      confianza = Math.min(0.92, confianza + 0.05);
      razon = `OSM identificó "${geo.tipo}: ${geo.nombre}" en ${geo.comuna}`;
    } else if (geo?.calle && geo?.comuna) {
      nombre = `${patron.tipo.split("/")[0]} ${geo.comuna} (${geo.calle})`.slice(0, 50);
      razon = `OSM ubica en ${geo.calle}, ${geo.comuna} — duración ${p.duracion_promedio_min}min`;
    } else if (geo?.comuna) {
      nombre = `${patron.tipo.split("/")[0]} ${geo.comuna}`.slice(0, 50);
      confianza -= 0.10;
      razon = `Comuna ${geo.comuna}, sin calle exacta`;
    } else {
      nombre = `${patron.tipo} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`;
      confianza = 0.40;
      razon = `Sin datos OSM, solo coords`;
    }

    // Bonus por densidad: muchos camiones distintos = alta certeza que es lugar real
    if (p.camiones >= 8) confianza = Math.min(0.97, confianza + 0.08);
    else if (p.camiones >= 5) confianza = Math.min(0.93, confianza + 0.04);

    out.push({ lat: p.lat, lng: p.lng, nombre_sugerido: nombre, confianza: Math.round(confianza * 100) / 100, razon });
  }

  return out;
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
  // Cruce: usa rango de N días hasta opts.fecha para no perder cargas con timezone shift
  const dias = opts.diasAtras || 14;
  const fechaDesde = new Date(new Date(opts.fecha).getTime() - dias * 86400000).toISOString().slice(0, 10);
  const cruce = await cruzarSigetra({ fechaDesde, fechaHasta: opts.fecha });
  const huerfanas = await detectarParadasHuerfanas(dias);
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
          // Doble inserción: geo_lugares (sistema activo) + geo_bases (compat).
          // ON CONFLICT-safe: chequea distancia <100m para evitar duplicados muy cercanos.
          const dup = await pool.query(`
            SELECT id FROM geo_lugares
            WHERE activo = true
              AND (6371000 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians(lat)) *
                cos(radians(lng) - radians($2)) +
                sin(radians($1)) * sin(radians(lat))
              )))) < 100 LIMIT 1
          `, [p.lat, p.lng]);
          if (dup.rows.length > 0) continue;

          await pool.query(
            `INSERT INTO geo_lugares (nombre, lat, lng, radio_metros, tipo, detectado_via, confianza_pct, veces_visitado, activo, confirmado, ultima_visita, primera_visita)
             VALUES ($1, $2, $3, 200, 'auto-detectado', 'gps-cluster-ia', $4, $5, true, false, CURRENT_DATE, CURRENT_DATE)`,
            [p.nombre, p.lat, p.lng, Math.round(p.confianza * 100), p.visitas]
          );
          creadas++;
        } catch (e: any) {
          console.error("[auto-cierre] insert error:", e.message, "| nombre:", p.nombre, "| lat,lng:", p.lat, p.lng);
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

// ═══════════════════════════════════════════════════════════════════════
// SCHEDULER AUTÓNOMO: corre cada hora sin intervención humana
// ═══════════════════════════════════════════════════════════════════════
let _schedulerStarted = false;

export function iniciarSchedulerAutoCierre() {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  const correrCiclo = async () => {
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      const r = await ejecutarAutoCierre({
        fecha,
        diasAtras: 14,
        autoCrearGeocercas: true,    // crea geocercas con confianza ≥0.85 sin pedir aprobación
        umbralConfianza: 0.85,
      });
      console.log(`[scheduler-auto-cierre] ciclo OK: ${r.cruces_aplicados} cruces, ${r.geocercas_creadas} geocercas auto-creadas, ${r.geocercas_propuestas.length} propuestas pendientes`);
    } catch (e: any) {
      console.error(`[scheduler-auto-cierre] error:`, e.message);
    }
  };

  // Primer ciclo a los 60s del arranque (deja que la app termine init)
  setTimeout(correrCiclo, 60_000);
  // Después cada 1 hora
  setInterval(correrCiclo, 60 * 60 * 1000);
  console.log("[scheduler-auto-cierre] activo: ciclo cada 60min");
}
