import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { cruzarSigetra } from "./auto-cierre-brecha";

const MIN_DWELL_CD = 15;
const MIN_DWELL_OTHER = 10;
const MIN_TRIP_KM = 30;
const RADIO_FALLBACK_KM = 0.5;

function ayerChile(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

interface GpsPoint {
  lat: number;
  lng: number;
  timestamp_gps: Date;
  velocidad: number;
  odometro: number | null;
}

interface Geocerca {
  nombre: string;
  nombre_contrato: string | null;
  lat: number;
  lng: number;
  poligono: [number, number][] | null;
  tipo: "CD" | "BASE" | "PARADA" | "DESTINO";
}

interface Visita {
  geocerca_nombre: string;
  nombre_contrato: string | null;
  llegada: Date;
  salida: Date;
  duracion_min: number;
  lat: number;
  lng: number;
  tipo: "CD" | "BASE" | "PARADA" | "DESTINO";
}

interface ViajeT1 {
  camion_id: number;
  patente: string;
  origen: string;
  destino: string;
  origen_geo: string;
  destino_geo: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  km_estimado: number;
  duracion_min: number;
  es_round_trip: boolean;
  paradas_intermedias: any[];
  visitas_secuencia: string[];
  origen_lat?: number;
  origen_lng?: number;
  destino_lat?: number;
  destino_lng?: number;
}

const PARADA_PATTERNS = [
  "copec", "es copec", "shell", "servicentro", "estacionamiento",
  "hosteria", "hostería", "zona de descanso", "t.vpv", "peaje",
  "plaza pesaje", "plaza de pesaje", "taller gallardo", "luengo",
];

function esParadaIntermedia(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return PARADA_PATTERNS.some(p => lower.includes(p));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function puntoEnPoligono(lat: number, lng: number, poligono: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const yi = poligono[i][0], xi = poligono[i][1];
    const yj = poligono[j][0], xj = poligono[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function puntoEnGeocerca(lat: number, lng: number, geo: Geocerca): boolean {
  if (geo.poligono && geo.poligono.length >= 3) {
    return puntoEnPoligono(lat, lng, geo.poligono);
  }
  return haversineKm(lat, lng, geo.lat, geo.lng) < RADIO_FALLBACK_KM;
}

async function cargarGeocercas(): Promise<Geocerca[]> {
  const kmlRows = await pool.query(`
    SELECT nombre, lat, lng, poligono FROM cencosud_geocercas_kml 
    WHERE lat IS NOT NULL AND lat != 0
  `);

  const opRows = await pool.query(`
    SELECT nombre, lat, lng FROM geocercas_operacionales WHERE lat != 0 AND lng != 0
  `);

  const aliasRows = await pool.query(`
    SELECT geocerca_nombre, nombre_contrato 
    FROM geocerca_alias_contrato 
    WHERE contrato = 'CENCOSUD' AND confirmado = true
  `);
  const aliasMap = new Map<string, string>();
  for (const a of aliasRows.rows) {
    aliasMap.set((a as any).geocerca_nombre.toLowerCase(), (a as any).nombre_contrato);
  }

  const basesSOTRASER = new Set([
    "base sotraser antofagasta", "base sotraser calama",
    "base sotraser lo boza", "base sotraser los angeles",
  ]);

  const seen = new Set<string>();
  const geocercas: Geocerca[] = [];
  let kmlConPoligono = 0;

  for (const row of kmlRows.rows as any[]) {
    const key = row.nombre.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const esParada = esParadaIntermedia(row.nombre);
    const esCD = row.nombre.startsWith("CD ") || row.nombre.startsWith("CT ") ||
      row.nombre.includes("BODEGA") || row.nombre.includes("Centro de distribución");
    const esBase = basesSOTRASER.has(key);

    let tipo: Geocerca["tipo"] = "DESTINO";
    if (esCD) tipo = "CD";
    else if (esBase) tipo = "BASE";
    else if (esParada) tipo = "PARADA";

    let poligono: [number, number][] | null = null;
    if (row.poligono && Array.isArray(row.poligono) && row.poligono.length >= 3) {
      poligono = row.poligono as [number, number][];
      kmlConPoligono++;
    }

    geocercas.push({
      nombre: row.nombre,
      nombre_contrato: aliasMap.get(key) || null,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      poligono,
      tipo,
    });
  }

  for (const row of opRows.rows as any[]) {
    const key = row.nombre.toLowerCase();
    if (seen.has(key)) continue;
    if (/^auto[\s\-_]+\-?\d+\.\d+/.test(key) || /^-?\d+\.\d+,-?\d+\.\d+/.test(key)) continue;
    seen.add(key);

    const esParada = esParadaIntermedia(row.nombre);
    const esCD = row.nombre.startsWith("CD ") || row.nombre.startsWith("CT ");
    const esBase = basesSOTRASER.has(key);

    let tipo: Geocerca["tipo"] = "DESTINO";
    if (esCD) tipo = "CD";
    else if (esBase) tipo = "BASE";
    else if (esParada) tipo = "PARADA";

    geocercas.push({
      nombre: row.nombre,
      nombre_contrato: aliasMap.get(key) || null,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      poligono: null,
      tipo,
    });
  }

  const conAlias = geocercas.filter(g => g.nombre_contrato).length;
  const opUsadas = geocercas.length - kmlRows.rows.length;
  console.log(`[T1] ${geocercas.length} geocercas (${kmlConPoligono} con polígono KML, ${opUsadas} oper con radio fallback), ${conAlias} con alias`);
  return geocercas;
}

function identificarVisitas(puntos: GpsPoint[], geocercas: Geocerca[]): Visita[] {
  if (puntos.length < 5) return [];

  const visitas: Visita[] = [];
  let enGeocerca: { geo: Geocerca; desde: Date; lat: number; lng: number } | null = null;

  for (const p of puntos) {
    let geocercaCercana: Geocerca | null = null;
    let mejorScore = -Infinity;

    for (const g of geocercas) {
      if (puntoEnGeocerca(p.lat, p.lng, g)) {
        const d = haversineKm(p.lat, p.lng, g.lat, g.lng);
        let score = 0;
        if (g.nombre_contrato) score += 1000;
        if (g.tipo === "CD" || g.tipo === "BASE") score += 500;
        if (g.poligono) score += 300;
        if (!g.poligono && !g.nombre_contrato && g.tipo === "DESTINO") score -= 400;
        score -= d * 50;
        if (score > mejorScore) {
          mejorScore = score;
          geocercaCercana = g;
        }
      }
    }

    if (geocercaCercana) {
      const mismaGeo = enGeocerca && (
        enGeocerca.geo.nombre === geocercaCercana.nombre ||
        (enGeocerca.geo.nombre_contrato && enGeocerca.geo.nombre_contrato === geocercaCercana.nombre_contrato)
      );

      if (!mismaGeo) {
        if (enGeocerca) {
          const dur = (p.timestamp_gps.getTime() - enGeocerca.desde.getTime()) / 60000;
          const minDwell = enGeocerca.geo.tipo === "CD" ? MIN_DWELL_CD : MIN_DWELL_OTHER;
          if (dur >= minDwell) {
            visitas.push({
              geocerca_nombre: enGeocerca.geo.nombre,
              nombre_contrato: enGeocerca.geo.nombre_contrato,
              llegada: enGeocerca.desde,
              salida: new Date(p.timestamp_gps),
              duracion_min: Math.round(dur),
              lat: enGeocerca.lat,
              lng: enGeocerca.lng,
              tipo: enGeocerca.geo.tipo,
            });
          }
        }
        enGeocerca = { geo: geocercaCercana, desde: new Date(p.timestamp_gps), lat: p.lat, lng: p.lng };
      }
    } else {
      if (enGeocerca) {
        const dur = (p.timestamp_gps.getTime() - enGeocerca.desde.getTime()) / 60000;
        const minDwell = enGeocerca.geo.tipo === "CD" ? MIN_DWELL_CD : MIN_DWELL_OTHER;
        if (dur >= minDwell) {
          visitas.push({
            geocerca_nombre: enGeocerca.geo.nombre,
            nombre_contrato: enGeocerca.geo.nombre_contrato,
            llegada: enGeocerca.desde,
            salida: new Date(p.timestamp_gps),
            duracion_min: Math.round(dur),
            lat: enGeocerca.lat,
            lng: enGeocerca.lng,
            tipo: enGeocerca.geo.tipo,
          });
        }
        enGeocerca = null;
      }
    }
  }

  if (enGeocerca) {
    const ultimoPunto = puntos[puntos.length - 1];
    const dur = (ultimoPunto.timestamp_gps.getTime() - enGeocerca.desde.getTime()) / 60000;
    const minDwell = enGeocerca.geo.tipo === "CD" ? MIN_DWELL_CD : MIN_DWELL_OTHER;
    if (dur >= minDwell) {
      visitas.push({
        geocerca_nombre: enGeocerca.geo.nombre,
        nombre_contrato: enGeocerca.geo.nombre_contrato,
        llegada: enGeocerca.desde,
        salida: ultimoPunto.timestamp_gps,
        duracion_min: Math.round(dur),
        lat: enGeocerca.lat,
        lng: enGeocerca.lng,
        tipo: enGeocerca.geo.tipo,
      });
    }
  }

  return visitas;
}

function deduplicarVisitas(visitas: Visita[]): Visita[] {
  if (visitas.length <= 1) return visitas;
  const result: Visita[] = [visitas[0]];
  for (let i = 1; i < visitas.length; i++) {
    const prev = result[result.length - 1];
    const misma = visitas[i].geocerca_nombre === prev.geocerca_nombre ||
      (visitas[i].nombre_contrato && visitas[i].nombre_contrato === prev.nombre_contrato);
    if (misma) {
      prev.salida = visitas[i].salida;
      prev.duracion_min += visitas[i].duracion_min;
    } else {
      result.push({ ...visitas[i] });
    }
  }
  return result;
}

const basesSOTRASERSet = new Set([
  "base sotraser antofagasta", "base sotraser calama",
  "base sotraser lo boza", "base sotraser los angeles",
]);

function esCD(visita: Visita): boolean {
  if (visita.tipo === "CD") return true;
  const n = visita.geocerca_nombre.toLowerCase();
  if (n.startsWith("cd ") || n.includes("centro distribu")) return true;
  return false;
}

function esBaseSotraser(visita: Visita): boolean {
  return visita.tipo === "BASE" || basesSOTRASERSet.has(visita.geocerca_nombre.toLowerCase());
}

function construirViajes(
  camion_id: number,
  patente: string,
  visitas: Visita[],
  puntos: GpsPoint[],
  ultimoCDPrevio: Visita | null = null
): ViajeT1[] {
  const visitasReales = visitas.filter(v => v.tipo !== "PARADA");
  if (visitasReales.length === 0) return [];

  const viajes: ViajeT1[] = [];
  let ultimoCD: Visita | null = ultimoCDPrevio;
  let entregasDelTramo: Visita[] = [];

  const nombreVisita = (v: Visita) => v.nombre_contrato || v.geocerca_nombre;

  const cerrarTramo = (cdRetorno: Visita | null) => {
    if (!ultimoCD) { entregasDelTramo = []; return; }

    const origenCDNombre = nombreVisita(ultimoCD);
    let prevSalida: Date = ultimoCD.salida;
    let ultimaEntrega: Visita | null = null;

    for (const entrega of entregasDelTramo) {
      const destinoNombre = nombreVisita(entrega);
      if (destinoNombre === origenCDNombre) {
        ultimaEntrega = entrega;
        prevSalida = entrega.salida;
        continue;
      }

      const kmDesdeCD = estimarKm(puntos, ultimoCD.salida, entrega.llegada);
      if (kmDesdeCD < MIN_TRIP_KM) {
        ultimaEntrega = entrega;
        prevSalida = entrega.salida;
        continue;
      }

      viajes.push({
        camion_id, patente,
        origen: origenCDNombre, destino: destinoNombre,
        origen_geo: ultimoCD.geocerca_nombre, destino_geo: entrega.geocerca_nombre,
        fecha_inicio: prevSalida, fecha_fin: entrega.llegada,
        km_estimado: kmDesdeCD,
        duracion_min: Math.round((entrega.llegada.getTime() - ultimoCD.salida.getTime()) / 60000),
        es_round_trip: false, paradas_intermedias: [],
        visitas_secuencia: [origenCDNombre, destinoNombre],
        origen_lat: ultimoCD.lat, origen_lng: ultimoCD.lng,
        destino_lat: entrega.lat, destino_lng: entrega.lng,
      });

      ultimaEntrega = entrega;
      prevSalida = entrega.salida;
    }

    if (cdRetorno) {
      const desde = ultimaEntrega || ultimoCD;
      const desdeNombre = nombreVisita(desde);
      const cdRetornoNombre = nombreVisita(cdRetorno);
      const desdeSalida = desde === ultimoCD ? ultimoCD.salida : desde.salida;
      const km = estimarKm(puntos, desdeSalida, cdRetorno.llegada);
      if (km >= MIN_TRIP_KM && desdeNombre !== cdRetornoNombre) {
        viajes.push({
          camion_id, patente,
          origen: desdeNombre, destino: cdRetornoNombre,
          origen_geo: desde.geocerca_nombre, destino_geo: cdRetorno.geocerca_nombre,
          fecha_inicio: desdeSalida, fecha_fin: cdRetorno.llegada,
          km_estimado: km,
          duracion_min: Math.round((cdRetorno.llegada.getTime() - desdeSalida.getTime()) / 60000),
          es_round_trip: true, paradas_intermedias: [],
          visitas_secuencia: [desdeNombre, cdRetornoNombre],
          origen_lat: desde.lat, origen_lng: desde.lng,
          destino_lat: cdRetorno.lat, destino_lng: cdRetorno.lng,
        });
      }
    }

    entregasDelTramo = [];
  };

  for (const v of visitasReales) {
    if (esCD(v)) {
      cerrarTramo(v);
      ultimoCD = v;
    } else if (esBaseSotraser(v)) {
      cerrarTramo(null);
      ultimoCD = null;
    } else {
      if (ultimoCD) entregasDelTramo.push(v);
    }
  }

  cerrarTramo(null);
  return viajes;
}

async function buscarUltimoCDPrevio(patente: string, fechaInicio: Date): Promise<Visita | null> {
  try {
    const r = await pool.query(`
      SELECT origen_nombre, destino_nombre, fecha_inicio, fecha_fin,
             origen_lat, origen_lng, destino_lat, destino_lng
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      WHERE c.patente = $1
        AND va.fecha_inicio < $2::timestamp
        AND va.fecha_inicio >= $2::timestamp - interval '36 hours'
        AND (va.origen_nombre ILIKE 'CD %' OR va.origen_nombre ILIKE 'CT %' 
             OR va.destino_nombre ILIKE 'CD %' OR va.destino_nombre ILIKE 'CT %')
      ORDER BY va.fecha_fin DESC
      LIMIT 1
    `, [patente, fechaInicio.toISOString()]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0] as any;
    const esCDDestino = /^(CD |CT )/.test(row.destino_nombre || "");
    const cdNombre = esCDDestino ? row.destino_nombre : row.origen_nombre;
    const cdLat = esCDDestino ? row.destino_lat : row.origen_lat;
    const cdLng = esCDDestino ? row.destino_lng : row.origen_lng;
    return {
      geocerca_nombre: cdNombre,
      nombre_contrato: cdNombre,
      llegada: new Date(row.fecha_fin),
      salida: new Date(row.fecha_fin),
      duracion_min: 0,
      lat: parseFloat(cdLat || "0"),
      lng: parseFloat(cdLng || "0"),
      tipo: "CD",
    };
  } catch { return null; }
}

function estimarKm(puntos: GpsPoint[], desde: Date, hasta: Date): number {
  let km = 0;
  let prev: GpsPoint | null = null;
  for (const p of puntos) {
    if (p.timestamp_gps < desde || p.timestamp_gps > hasta) continue;
    if (prev) {
      const segKm = haversineKm(prev.lat, prev.lng, p.lat, p.lng);
      if (segKm < 10) {
        km += segKm;
      }
    }
    prev = p;
  }
  return Math.round(km);
}

async function cargarTarifas(): Promise<Map<string, number>> {
  const rows = await pool.query(`
    SELECT origen, destino, tarifa::int as tarifa, clase
    FROM contrato_rutas_tarifas
    WHERE contrato = 'CENCOSUD' AND activo = true
    ORDER BY clase ASC
  `);
  const tarifas = new Map<string, number>();
  for (const r of rows.rows as any[]) {
    const key = `${r.origen}→${r.destino}`;
    if (!tarifas.has(key)) {
      tarifas.set(key, r.tarifa);
    }
  }
  return tarifas;
}

const EQUIVALENCIAS: Record<string, string[]> = {
  "Chillán": ["CD Chillán", "CD LTS CHILLAN camino Nahueltoro 230"],
  "CD Chillán": ["Chillán"],
  "CD LTS CHILLAN camino Nahueltoro 230": ["CD Chillán", "Chillán"],
  "CT Concepción": ["Concepción"],
  "Concepción": ["CT Concepción", "CD Concepción"],
  "CD Concepción": ["Concepción", "CT Concepción"],
  "Coquimbo": ["CT Coquimbo", "La Serena"],
  "CT Coquimbo": ["Coquimbo", "La Serena"],
  "La Serena": ["Coquimbo", "CT Coquimbo"],
  "CD Noviciado": ["Noviciado"],
  "Noviciado": ["CD Noviciado"],
  "CD Vespucio": ["Vespucio"],
  "Vespucio": ["CD Vespucio"],
  "CD Lo Aguirre": ["Lo Aguirre"],
  "Lo Aguirre": ["CD Lo Aguirre"],
  "Osorno": ["CT Osorno", "CD Osorno"],
  "CT Osorno": ["Osorno"],
  "CD Osorno": ["Osorno"],
  "Temuco": ["CT Temuco", "CD Temuco"],
  "CT Temuco": ["Temuco"],
  "CD Temuco": ["Temuco"],
  "Los Ángeles": ["Los Angeles", "CT Los Ángeles", "Base Sotraser Los Angeles"],
  "Los Angeles": ["Los Ángeles"],
  "Puerto Montt": ["CT Puerto Montt", "CD Puerto Montt"],
  "CT Puerto Montt": ["Puerto Montt"],
  "Talca": ["CT Talca", "CD Talca"],
  "CT Talca": ["Talca"],
  "Curicó": ["Curico", "CT Curicó"],
  "Curico": ["Curicó"],
  "Linares": ["CT Linares"],
  "Mulchén": ["Mulchen"],
  "Mulchen": ["Mulchén"],
  "Victoria": ["CT Victoria"],
  "Valdivia": ["CT Valdivia", "CD Valdivia"],
  "CT Valdivia": ["Valdivia"],
  "Rancagua": ["CT Rancagua", "CD Rancagua"],
  "CT Rancagua": ["Rancagua"],
  "Antofagasta": ["Base Sotraser Antofagasta", "CT Antofagasta", "CD Antofagasta"],
  "Base Sotraser Antofagasta": ["Antofagasta"],
  "Calama": ["Base Sotraser Calama", "CT Calama"],
  "Base Sotraser Calama": ["Calama"],
  "Iquique": ["CT Iquique", "CD Iquique"],
  "Arica": ["CT Arica"],
  "Copiapó": ["Copiapo", "CT Copiapó"],
  "Copiapo": ["Copiapó"],
  "Vallenar": ["CT Vallenar"],
  "Ovalle": ["CT Ovalle"],
  "San Antonio": ["CT San Antonio", "Puerto San Antonio"],
  "Quilpué": ["Quilpue", "CT Quilpué"],
  "Quilpue": ["Quilpué"],
  "Viña del Mar": ["Vina del Mar", "CT Viña del Mar"],
  "Valparaíso": ["Valparaiso", "CT Valparaíso"],
  "Valparaiso": ["Valparaíso"],
  "Quillota": ["CT Quillota"],
  "Los Andes": ["CT Los Andes"],
  "San Fernando": ["CT San Fernando"],
  "Angol": ["CT Angol"],
  "Castro": ["CT Castro"],
  "Coyhaique": ["CT Coyhaique"],
  "Punta Arenas": ["CT Punta Arenas"],
  "CD Pudahuel": ["Pudahuel", "CD CENCOSUD Pudahuel"],
};

function buscarTarifaFlexible(origen: string, destino: string, tarifas: Map<string, number>): number | null {
  const directa = tarifas.get(`${origen}→${destino}`);
  if (directa) return directa;

  const reversa = tarifas.get(`${destino}→${origen}`);
  if (reversa) return reversa;

  const origenAlts = [origen, ...(EQUIVALENCIAS[origen] || [])];
  const destinoAlts = [destino, ...(EQUIVALENCIAS[destino] || [])];

  for (const o of origenAlts) {
    for (const d of destinoAlts) {
      const t = tarifas.get(`${o}→${d}`) || tarifas.get(`${d}→${o}`);
      if (t) return t;
    }
  }

  return null;
}

interface RoundTripBilling {
  mode: "SINGLE" | "SPLIT";
  tarifa_ida: number | null;
  tarifa_vuelta: number | null;
  tarifa_total: number | null;
}

function evaluarBillingRoundTrip(origen: string, destino: string, tarifas: Map<string, number>): RoundTripBilling {
  const tarifaIda = buscarTarifaFlexible(origen, destino, tarifas);
  const tarifaVuelta = buscarTarifaFlexible(destino, origen, tarifas);

  const origenAlts = [origen, ...(EQUIVALENCIAS[origen] || [])];
  const destinoAlts = [destino, ...(EQUIVALENCIAS[destino] || [])];

  let idaExplicita = false;
  let vueltaExplicita = false;
  for (const o of origenAlts) {
    for (const d of destinoAlts) {
      if (tarifas.has(`${o}→${d}`)) idaExplicita = true;
      if (tarifas.has(`${d}→${o}`)) vueltaExplicita = true;
    }
  }

  if (idaExplicita && vueltaExplicita && tarifaIda && tarifaVuelta) {
    return {
      mode: "SPLIT",
      tarifa_ida: tarifaIda,
      tarifa_vuelta: tarifaVuelta,
      tarifa_total: tarifaIda + tarifaVuelta,
    };
  }

  const tarifaUnica = tarifaIda || tarifaVuelta;
  return {
    mode: "SINGLE",
    tarifa_ida: tarifaUnica,
    tarifa_vuelta: null,
    tarifa_total: tarifaUnica,
  };
}

export async function reconstruirDiaT1(fecha: string): Promise<{
  camiones_procesados: number;
  viajes_creados: number;
  viajes_round_trip: number;
  viajes_ida: number;
  viajes_retorno: number;
  viajes_facturados: number;
  viajes_pendientes: number;
  pct_facturable: number;
  camiones_descanso: number;
  camiones_sin_geocerca: string[];
  errores: string[];
}> {
  const inicio = Date.now();
  console.log(`[T1] ═══ Reconstrucción T-1 v2 para ${fecha} ═══`);

  const geocercas = await cargarGeocercas();
  const tarifas = await cargarTarifas();
  console.log(`[T1] ${tarifas.size} rutas tarifadas cargadas`);

  const camionesResult = await pool.query(`
    SELECT DISTINCT patente, 
           (SELECT id FROM camiones WHERE REPLACE(camiones.patente, '-', '') = REPLACE(wp.patente, '-', '') LIMIT 1) as camion_id
    FROM wisetrack_posiciones wp
    WHERE fecha >= $1::date
      AND fecha < ($1::date + interval '1 day')
      AND grupo1 = 'CENCOSUD'
    ORDER BY patente
  `, [fecha]);

  const camiones = camionesResult.rows as any[];
  console.log(`[T1] ${camiones.length} camiones Cencosud con GPS el ${fecha}`);

  let totalViajes = 0;
  let totalRoundTrip = 0;
  let totalIda = 0;
  let totalRetorno = 0;
  let totalFacturados = 0;
  let totalPendientes = 0;
  let camionesDescanso = 0;
  const camionesSinGeocerca: string[] = [];
  const errores: string[] = [];
  const allInserts: any[] = [];

  for (const cam of camiones) {
    if (!cam.camion_id) continue;

    try {
      const puntosResult = await pool.query(`
        SELECT lat, lng, fecha as timestamp_gps, velocidad, kms_total as odometro
        FROM wisetrack_posiciones
        WHERE patente = $1
          AND fecha >= $2::date
          AND fecha < ($2::date + interval '1 day')
        ORDER BY fecha ASC
      `, [cam.patente, fecha]);

      const puntos: GpsPoint[] = (puntosResult.rows as any[]).map((r: any) => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),
        timestamp_gps: new Date(r.timestamp_gps),
        velocidad: parseFloat(r.velocidad || "0"),
        odometro: r.odometro ? parseFloat(r.odometro) : null,
      }));

      if (puntos.length < 10) continue;

      const kmTotal = estimarKm(puntos, puntos[0].timestamp_gps, puntos[puntos.length - 1].timestamp_gps);
      if (kmTotal < 20) {
        camionesDescanso++;
        continue;
      }

      const visitasRaw = identificarVisitas(puntos, geocercas);
      const visitas = deduplicarVisitas(visitasRaw);

      if (visitas.length === 0) {
        if (kmTotal > 50) {
          camionesSinGeocerca.push(`${cam.patente} (${kmTotal}km, ${puntos.length}pts)`);
        }
        continue;
      }

      if (visitas.length === 1 && (visitas[0].tipo === "BASE" || visitas[0].tipo === "CD")) {
        camionesDescanso++;
        continue;
      }

      const cdPrevio = await buscarUltimoCDPrevio(cam.patente, puntos[0].timestamp_gps);
      const viajes = construirViajes(cam.camion_id, cam.patente, visitas, puntos, cdPrevio);

      for (const v of viajes) {
        const oLat = v.origen_lat || 0;
        const oLng = v.origen_lng || 0;
        const dLat = v.destino_lat || 0;
        const dLng = v.destino_lng || 0;

        let tarifaFinal: number | null = null;
        let tarifaBreakdown: any = null;
        if (v.es_round_trip) {
          const rt = evaluarBillingRoundTrip(v.origen, v.destino, tarifas);
          tarifaFinal = rt.tarifa_total;
          tarifaBreakdown = { mode: rt.mode, ida: rt.tarifa_ida, vuelta: rt.tarifa_vuelta };
        } else {
          tarifaFinal = buscarTarifaFlexible(v.origen, v.destino, tarifas);
        }

        allInserts.push({
          camion_id: cam.camion_id,
          fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin,
          origen: v.origen, destino: v.destino,
          origen_geo: v.origen_geo, destino_geo: v.destino_geo,
          origen_lat: oLat, origen_lng: oLng,
          destino_lat: dLat, destino_lng: dLng,
          km: v.km_estimado, duracion: v.duracion_min,
          es_round_trip: v.es_round_trip,
          paradas_intermedias: v.paradas_intermedias,
          visitas_secuencia: v.visitas_secuencia,
          tarifa: tarifaFinal,
          tarifa_breakdown: tarifaBreakdown,
        });

        totalViajes++;
        if (v.es_round_trip) totalRetorno++;
        else totalIda++;
        if (tarifaFinal && tarifaFinal > 0) totalFacturados++;
        else totalPendientes++;

        console.log(`[T1] ${cam.patente}: ${v.origen}→${v.destino} ${v.es_round_trip ? "(VUELTA)" : "(IDA)"} ${v.km_estimado}km $${tarifaFinal || 0}${tarifaBreakdown && tarifaBreakdown.mode === "SPLIT" ? ` [ida=${tarifaBreakdown.ida} vuelta=${tarifaBreakdown.vuelta}]` : ""}`);
      }
    } catch (err: any) {
      errores.push(`${cam.patente}: ${err.message}`);
    }
  }

  if (allInserts.length === 0) {
    console.log(`[T1] Sin viajes nuevos para ${fecha} — preservando datos existentes`);
    return {
      camiones_procesados: camiones.length,
      viajes_creados: 0, viajes_round_trip: 0, viajes_ida: 0, viajes_retorno: 0,
      viajes_facturados: 0, viajes_pendientes: 0, pct_facturable: 0,
      camiones_descanso: camionesDescanso,
      camiones_sin_geocerca: camionesSinGeocerca, errores
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      DELETE FROM viajes_aprendizaje 
      WHERE contrato = 'CENCOSUD' 
        AND fuente_viaje = 'T1_RECONSTRUCTOR'
        AND fecha_inicio >= $1::date 
        AND fecha_inicio < ($1::date + interval '1 day')
    `, [fecha]);

    for (const v of allInserts) {
      await client.query(`
        INSERT INTO viajes_aprendizaje (
          camion_id, contrato, fecha_inicio, fecha_fin,
          origen_lat, origen_lng, origen_nombre,
          destino_lat, destino_lng, destino_nombre,
          km_ecu, duracion_minutos, conductor, paradas,
          fuente_viaje, estado, procesado_aprendizaje
        ) VALUES ($1, 'CENCOSUD', $2, $3, $10, $11, $4, $12, $13, $5, $6, $7, NULL, $8, 'T1_RECONSTRUCTOR', $9, true)
        ON CONFLICT (camion_id, fecha_inicio) DO UPDATE SET
          fecha_fin = EXCLUDED.fecha_fin,
          origen_nombre = EXCLUDED.origen_nombre,
          destino_nombre = EXCLUDED.destino_nombre,
          origen_lat = EXCLUDED.origen_lat,
          origen_lng = EXCLUDED.origen_lng,
          destino_lat = EXCLUDED.destino_lat,
          destino_lng = EXCLUDED.destino_lng,
          km_ecu = EXCLUDED.km_ecu,
          duracion_minutos = EXCLUDED.duracion_minutos,
          paradas = EXCLUDED.paradas,
          estado = EXCLUDED.estado,
          fuente_viaje = EXCLUDED.fuente_viaje
      `, [
        v.camion_id, v.fecha_inicio, v.fecha_fin,
        v.origen, v.destino,
        v.km, v.duracion,
        JSON.stringify({
          tipo: v.es_round_trip ? "ROUND_TRIP" : "IDA",
          paradas: v.paradas_intermedias,
          secuencia: v.visitas_secuencia,
          tarifa_encontrada: v.tarifa,
          origen_geocerca: v.origen_geo,
          destino_geocerca: v.destino_geo,
        }),
        v.tarifa && v.tarifa > 0 ? 'FACTURADO' : v.tarifa === 0 ? 'TRANSITO' : 'PENDIENTE',
        v.origen_lat, v.origen_lng,
        v.destino_lat, v.destino_lng,
      ]);
    }

    await client.query("COMMIT");
  } catch (txErr: any) {
    await client.query("ROLLBACK");
    throw new Error(`T1 transaction failed: ${txErr.message}`);
  } finally {
    client.release();
  }

  // ═══ Auto-cruce Sigetra: enlaza cargas combustible con viajes recién creados ═══
  let cruceSigetra = { cruces: 0, litros: 0, km: 0 };
  try {
    cruceSigetra = await cruzarSigetra({ fechaDesde: fecha, fechaHasta: fecha });
    if (cruceSigetra.cruces > 0) {
      console.log(`[T1] ⛽ Cruzados ${cruceSigetra.cruces} viajes con Sigetra: ${Math.round(cruceSigetra.litros)}L, ${Math.round(cruceSigetra.km)}km declarados`);
    }
  } catch (cErr: any) {
    console.error(`[T1] auto-cruce Sigetra falló: ${cErr.message}`);
  }

  const durSeg = Math.round((Date.now() - inicio) / 1000);
  const pct = totalViajes > 0 ? Math.round(totalFacturados * 100 / totalViajes) : 0;
  console.log(`[T1] ═══ Completado en ${durSeg}s: ${totalViajes} viajes (${totalRoundTrip} RT, ${totalIda} ida, ${totalRetorno} retorno), ${totalFacturados}/${totalViajes} facturables (${pct}%), ${totalPendientes} pendientes, ${camionesDescanso} descanso ═══`);
  if (camionesSinGeocerca.length > 0) {
    console.log(`[T1] ⚠ Camiones con km pero sin geocerca detectada: ${camionesSinGeocerca.join(", ")}`);
  }
  if (errores.length > 0) {
    console.log(`[T1] ⚠ Errores: ${errores.join(", ")}`);
  }

  return {
    camiones_procesados: camiones.length,
    viajes_creados: totalViajes,
    viajes_round_trip: totalRoundTrip,
    viajes_ida: totalIda,
    viajes_retorno: totalRetorno,
    viajes_facturados: totalFacturados,
    viajes_pendientes: totalPendientes,
    pct_facturable: pct,
    camiones_descanso: camionesDescanso,
    camiones_sin_geocerca: camionesSinGeocerca,
    errores,
  };
}

export async function reconstruirAyer(): Promise<any> {
  return reconstruirDiaT1(ayerChile());
}

export async function reconstruirRango(desde: string, hasta: string): Promise<any[]> {
  const resultados = [];
  const d = new Date(desde);
  const h = new Date(hasta);

  while (d <= h) {
    const fecha = d.toISOString().split("T")[0];
    const r = await reconstruirDiaT1(fecha);
    resultados.push({ fecha, ...r });
    d.setDate(d.getDate() + 1);
  }

  return resultados;
}
