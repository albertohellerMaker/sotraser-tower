import { pool } from "./db";

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
  confianza: "EXACTO" | "CONFIRMADO" | "ASOCIADO" | "NUEVO" | "DOBLE_VALIDADO" | "KML_POLIGONO" | "CARGA_COMBUSTIBLE";
  descripcion: string;
  fuente?: "KML" | "OPERACIONAL";
  es_combustible?: boolean;
}

let _cache: any[] = [];
let _cacheTs = 0;

async function getGeocercas(): Promise<any[]> {
  if (Date.now() - _cacheTs < 5 * 60 * 1000 && _cache.length > 0) return _cache;
  const r = await pool.query(`SELECT id, nombre, lat, lng, radio_metros, tipo, nivel, contrato FROM geocercas_operacionales WHERE activa = true`);
  _cache = r.rows;
  _cacheTs = Date.now();
  return _cache;
}

let _kmlCache: any[] = [];
let _kmlCacheTs = 0;
const DWELL_MINUTOS_CENCOSUD = 10;

const CONTRATOS_CENCOSUD = ["CENCOSUD", "cencosud", "Cencosud"];

function esCencosud(contrato?: string): boolean {
  if (!contrato) return false;
  return CONTRATOS_CENCOSUD.some(c => contrato.toUpperCase().includes(c.toUpperCase()));
}

const TIPOS_COMBUSTIBLE = ["COPEC", "SHELL", "SERVICENTRO", "ESTACION", "GASOLINERA", "BENCINERA"];

function esEstacionCombustible(tipo: string, nombre: string): boolean {
  const tipoUp = (tipo || "").toUpperCase();
  const nombreUp = (nombre || "").toUpperCase();
  if (TIPOS_COMBUSTIBLE.some(t => tipoUp.includes(t))) return true;
  if (TIPOS_COMBUSTIBLE.some(t => nombreUp.includes(t))) return true;
  if (nombreUp.includes("SHELL") || nombreUp.includes("PETROBRAS") || nombreUp.includes("TERPEL")) return true;
  return false;
}

async function getGeocercasKml(): Promise<any[]> {
  if (Date.now() - _kmlCacheTs < 5 * 60 * 1000 && _kmlCache.length > 0) return _kmlCache;
  try {
    const r = await pool.query(`
      SELECT id, kml_id, nombre, tipo, lat::float, lng::float, radio_m, poligono, nombre_contrato
      FROM cencosud_geocercas_kml WHERE activa = true
    `);
    _kmlCache = r.rows;
    _kmlCacheTs = Date.now();
  } catch { _kmlCache = []; }
  return _kmlCache;
}

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function resolverMejorKml(
  lat: number, lng: number, kmlGeocercas: any[]
): { geo: any; dist: number; dentroPoligono: boolean } | null {
  let best: { geo: any; dist: number; dentroPoligono: boolean } | null = null;

  for (const g of kmlGeocercas) {
    const poly: [number, number][] = g.poligono;
    if (!poly || poly.length < 3) continue;

    const dentroPoligono = pointInPolygon(lat, lng, poly);
    const dist = haversineM(lat, lng, g.lat, g.lng);

    if (dentroPoligono) {
      if (!best || !best.dentroPoligono || dist < best.dist) {
        best = { geo: g, dist, dentroPoligono: true };
      }
    }
  }

  return best;
}

export async function resolverGeocerca(
  lat: number, lng: number, minutosDetenido: number = 0, contrato?: string
): Promise<GeoResult> {
  if (esCencosud(contrato)) {
    const kmlGeocercas = await getGeocercasKml();
    if (kmlGeocercas.length > 0) {
      const mejor = resolverMejorKml(lat, lng, kmlGeocercas);

      if (mejor && mejor.dentroPoligono) {
        if (esEstacionCombustible(mejor.geo.tipo, mejor.geo.nombre)) {
          return {
            nivel: 5, nombre: mejor.geo.nombre, geocerca_id: mejor.geo.id,
            distancia_metros: Math.round(mejor.dist),
            confianza: "CARGA_COMBUSTIBLE",
            descripcion: `Parada de carga combustible: ${mejor.geo.nombre} (${mejor.geo.tipo}). ${minutosDetenido}min detenido.`,
            fuente: "KML",
            es_combustible: true,
          };
        }

        if (minutosDetenido >= DWELL_MINUTOS_CENCOSUD) {
          return {
            nivel: 5, nombre: mejor.geo.nombre, geocerca_id: mejor.geo.id,
            distancia_metros: Math.round(mejor.dist),
            confianza: "KML_POLIGONO",
            descripcion: `KML Cencosud: ${mejor.geo.nombre} (${mejor.geo.tipo}). Dentro del polígono exacto, ${minutosDetenido}min detenido (≥${DWELL_MINUTOS_CENCOSUD}min requerido).`,
            fuente: "KML",
            es_combustible: false,
          };
        }
      }
    }
  }

  const geocercas = await getGeocercas();

  let closest: { geo: any; dist: number } | null = null;

  for (const g of geocercas) {
    const dist = haversineM(lat, lng, g.lat, g.lng);

    if (!closest || dist < closest.dist) {
      closest = { geo: g, dist };
    }

    if (dist <= 5) {
      return {
        nivel: 5, nombre: g.nombre, geocerca_id: g.id, distancia_metros: Math.round(dist),
        confianza: "DOBLE_VALIDADO",
        descripcion: `Match exacto a ${Math.round(dist)}m de ${g.nombre}. Doble validación confirmada.`,
        fuente: "OPERACIONAL",
      };
    }

    if (g.nivel === 1 && dist <= g.radio_metros) {
      return {
        nivel: 1, nombre: g.nombre, geocerca_id: g.id, distancia_metros: Math.round(dist),
        confianza: "CONFIRMADO",
        descripcion: `Dentro de ${g.nombre} (${Math.round(dist)}m del centro, radio ${g.radio_metros}m)`,
        fuente: "OPERACIONAL",
      };
    }

    if (g.nivel === 2 && dist <= g.radio_metros) {
      return {
        nivel: 2, nombre: g.nombre, geocerca_id: g.id, distancia_metros: Math.round(dist),
        confianza: "EXACTO",
        descripcion: `Punto exacto ${g.nombre} (${Math.round(dist)}m)`,
        fuente: "OPERACIONAL",
      };
    }
  }

  if (closest && closest.dist <= 10000 && minutosDetenido >= 10) {
    return {
      nivel: 3, nombre: closest.geo.nombre, geocerca_id: closest.geo.id,
      distancia_metros: Math.round(closest.dist),
      confianza: "ASOCIADO",
      descripcion: `Asociado a ${closest.geo.nombre} (${Math.round(closest.dist)}m, detenido ${minutosDetenido}min). No tocó geocerca pero es el punto conocido más cercano.`,
      fuente: "OPERACIONAL",
    };
  }

  if (closest && closest.dist <= 5000) {
    return {
      nivel: 3, nombre: closest.geo.nombre + " (probable)", geocerca_id: closest.geo.id,
      distancia_metros: Math.round(closest.dist),
      confianza: "ASOCIADO",
      descripcion: `Probable ${closest.geo.nombre} (${Math.round(closest.dist)}m). Sin tiempo de detención confirmado.`,
      fuente: "OPERACIONAL",
    };
  }

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
      _cacheTs = 0;
      console.log(`[GEOCERCA] ${promovidos} puntos nuevos promovidos a geocercas de 50m`);
    }

    return promovidos;
  } catch (e) { return 0; }
}

export async function resolverNombreViaje(
  lat: number, lng: number, minutosDetenido: number = 0, contrato?: string
): Promise<string> {
  const result = await resolverGeocerca(lat, lng, minutosDetenido, contrato);
  return result.nombre;
}

export function invalidarCacheKml() {
  _kmlCacheTs = 0;
  _kmlCache = [];
}
