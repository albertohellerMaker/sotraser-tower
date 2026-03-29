import { pool } from "./db";

// Haversine en metros
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GeoResult {
  nivel: 1 | 2 | 3 | 4 | 5;
  nombre: string;
  geocerca_id: number | null;
  distancia_metros: number;
  confianza: "EXACTO" | "CONFIRMADO" | "ASOCIADO" | "NUEVO" | "DOBLE_VALIDADO";
  descripcion: string;
}

// Cache geocercas
let _cache: any[] = [];
let _cacheTs = 0;

async function getGeocercas(): Promise<any[]> {
  if (Date.now() - _cacheTs < 5 * 60 * 1000 && _cache.length > 0) return _cache;
  const r = await pool.query(`SELECT id, nombre, lat, lng, radio_metros, tipo, nivel, contrato FROM geocercas_operacionales WHERE activa = true`);
  _cache = r.rows;
  _cacheTs = Date.now();
  return _cache;
}

/**
 * Sistema de 5 niveles para resolver geocerca de un punto GPS
 *
 * NIVEL 5 — DOBLE VALIDACIÓN (≤5m): Match exacto. 100% seguro es ese punto.
 * NIVEL 1 — BASE (≤radio base): Está dentro de una base Sotraser (3-5km).
 * NIVEL 2 — PUNTO EXACTO (≤50m): Tocó una geocerca de destino conocida.
 * NIVEL 3 — ASOCIACIÓN (≤10km): No tocó ninguna pero la más cercana está a <10km y estuvo detenido >10min.
 * NIVEL 4 — PUNTO NUEVO (>10km): No hay geocerca cercana. Si se repite 3+ veces se crea una nueva.
 */
export async function resolverGeocerca(
  lat: number, lng: number, minutosDetenido: number = 0, contrato?: string
): Promise<GeoResult> {
  const geocercas = await getGeocercas();

  let closest: { geo: any; dist: number } | null = null;

  for (const g of geocercas) {
    const dist = haversineM(lat, lng, g.lat, g.lng);

    // Track closest overall
    if (!closest || dist < closest.dist) {
      closest = { geo: g, dist };
    }

    // NIVEL 5 — DOBLE VALIDACIÓN: ≤5 metros = match perfecto
    if (dist <= 5) {
      return {
        nivel: 5, nombre: g.nombre, geocerca_id: g.id, distancia_metros: Math.round(dist),
        confianza: "DOBLE_VALIDADO",
        descripcion: `Match exacto a ${Math.round(dist)}m de ${g.nombre}. Doble validación confirmada.`,
      };
    }

    // NIVEL 1 — BASE: dentro del radio de una base
    if (g.nivel === 1 && dist <= g.radio_metros) {
      return {
        nivel: 1, nombre: g.nombre, geocerca_id: g.id, distancia_metros: Math.round(dist),
        confianza: "CONFIRMADO",
        descripcion: `Dentro de ${g.nombre} (${Math.round(dist)}m del centro, radio ${g.radio_metros}m)`,
      };
    }

    // NIVEL 2 — PUNTO EXACTO: dentro de 50m de una geocerca destino
    if (g.nivel === 2 && dist <= g.radio_metros) {
      return {
        nivel: 2, nombre: g.nombre, geocerca_id: g.id, distancia_metros: Math.round(dist),
        confianza: "EXACTO",
        descripcion: `Punto exacto ${g.nombre} (${Math.round(dist)}m)`,
      };
    }
  }

  // NIVEL 3 — ASOCIACIÓN: la geocerca más cercana está a <10km y estuvo detenido >10min
  if (closest && closest.dist <= 10000 && minutosDetenido >= 10) {
    return {
      nivel: 3, nombre: closest.geo.nombre, geocerca_id: closest.geo.id,
      distancia_metros: Math.round(closest.dist),
      confianza: "ASOCIADO",
      descripcion: `Asociado a ${closest.geo.nombre} (${Math.round(closest.dist)}m, detenido ${minutosDetenido}min). No tocó geocerca pero es el punto conocido más cercano.`,
    };
  }

  // NIVEL 3b — ASOCIACIÓN sin tiempo: la geocerca más cercana está a <5km (probablemente es ese punto)
  if (closest && closest.dist <= 5000) {
    return {
      nivel: 3, nombre: closest.geo.nombre + " (probable)", geocerca_id: closest.geo.id,
      distancia_metros: Math.round(closest.dist),
      confianza: "ASOCIADO",
      descripcion: `Probable ${closest.geo.nombre} (${Math.round(closest.dist)}m). Sin tiempo de detención confirmado.`,
    };
  }

  // NIVEL 4 — PUNTO NUEVO: no hay nada cerca
  // Registrar para auto-detección futura
  await registrarPuntoNuevo(lat, lng, contrato || null);

  return {
    nivel: 4, nombre: closest ? `Cerca de ${closest.geo.nombre} (${Math.round(closest.dist / 1000)}km)` : "Punto desconocido",
    geocerca_id: null, distancia_metros: closest ? Math.round(closest.dist) : 99999,
    confianza: "NUEVO",
    descripcion: closest
      ? `Sin geocerca. Más cercana: ${closest.geo.nombre} a ${Math.round(closest.dist / 1000)}km.`
      : "Sin geocerca cercana.",
  };
}

// Tabla para auto-crear puntos nuevos
async function registrarPuntoNuevo(lat: number, lng: number, contrato: string | null) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS geocerca_puntos_nuevos (
        id serial PRIMARY KEY,
        lat_key text NOT NULL,
        lng_key text NOT NULL,
        lat float NOT NULL, lng float NOT NULL,
        contrato text,
        veces int DEFAULT 1,
        primera_vez timestamp DEFAULT now(),
        ultima_vez timestamp DEFAULT now(),
        promovido boolean DEFAULT false,
        UNIQUE(lat_key, lng_key)
      )
    `);

    const latKey = (Math.round(lat * 1000) / 1000).toFixed(3);
    const lngKey = (Math.round(lng * 1000) / 1000).toFixed(3);

    await pool.query(`
      INSERT INTO geocerca_puntos_nuevos (lat_key, lng_key, lat, lng, contrato)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (lat_key, lng_key) DO UPDATE SET
        veces = geocerca_puntos_nuevos.veces + 1,
        ultima_vez = now()
    `, [latKey, lngKey, lat, lng, contrato]);
  } catch (e) { /* silent */ }
}

/**
 * Job: promover puntos nuevos que se repiten 3+ veces a geocercas de 50m
 * Correr cada 6 horas
 */
export async function promoverPuntosNuevos(): Promise<number> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS geocerca_puntos_nuevos (
        id serial PRIMARY KEY, lat_key text NOT NULL, lng_key text NOT NULL,
        lat float NOT NULL, lng float NOT NULL, contrato text,
        veces int DEFAULT 1, primera_vez timestamp DEFAULT now(), ultima_vez timestamp DEFAULT now(),
        promovido boolean DEFAULT false, UNIQUE(lat_key, lng_key)
      )
    `);

    const candidatos = await pool.query(`
      SELECT id, lat, lng, contrato, veces FROM geocerca_puntos_nuevos
      WHERE veces >= 3 AND promovido = false
    `);

    let promovidos = 0;
    for (const c of candidatos.rows) {
      try {
        await pool.query(`
          INSERT INTO geocercas_operacionales (nombre, lat, lng, radio_metros, tipo, contrato, confianza, auto_detectada, camiones_frecuentes, nivel)
          VALUES ($1, $2, $3, 50, 'AUTO_NUEVO', $4, 'MEDIA', true, $5, 2)
          ON CONFLICT (lat_key, lng_key) DO NOTHING
        `, [`Auto ${c.lat.toFixed(3)},${c.lng.toFixed(3)}`, c.lat, c.lng, c.contrato, c.veces]);

        await pool.query("UPDATE geocerca_puntos_nuevos SET promovido = true WHERE id = $1", [c.id]);
        promovidos++;
      } catch (e) { /* skip */ }
    }

    if (promovidos > 0) {
      _cacheTs = 0; // Invalidate cache
      console.log(`[GEOCERCA] ${promovidos} puntos nuevos promovidos a geocercas de 50m`);
    }

    return promovidos;
  } catch (e) { return 0; }
}

/**
 * Resolver nombre para viaje (usa el sistema de 5 niveles)
 * Reemplaza buscarLugarCercano para viajes
 */
export async function resolverNombreViaje(
  lat: number, lng: number, minutosDetenido: number = 0, contrato?: string
): Promise<string> {
  const result = await resolverGeocerca(lat, lng, minutosDetenido, contrato);
  return result.nombre;
}
