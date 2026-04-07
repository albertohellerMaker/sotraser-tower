import { db, pool } from "./db";
import { sql } from "drizzle-orm";

const MIN_DWELL_CD = 15;
const MIN_DWELL_OTHER = 10;
const MIN_TRIP_KM = 30;
const RADIO_FALLBACK_KM = 0.15;

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
    let distMin = Infinity;

    for (const g of geocercas) {
      if (puntoEnGeocerca(p.lat, p.lng, g)) {
        const d = haversineKm(p.lat, p.lng, g.lat, g.lng);
        if (d < distMin) {
          distMin = d;
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

function construirViajes(
  camion_id: number,
  patente: string,
  visitas: Visita[],
  puntos: GpsPoint[]
): ViajeT1[] {
  const visitasDestino = visitas.filter(v => v.tipo !== "PARADA" && v.nombre_contrato !== null);
  if (visitasDestino.length < 2) return [];

  const viajes: ViajeT1[] = [];
  let i = 0;

  while (i < visitasDestino.length - 1) {
    const origen = visitasDestino[i];
    const destino = visitasDestino[i + 1];

    const origenNombre = origen.nombre_contrato || origen.geocerca_nombre;
    const destinoNombre = destino.nombre_contrato || destino.geocerca_nombre;

    if (origenNombre === destinoNombre) {
      i++;
      continue;
    }

    const kmEntrePuntos = estimarKm(puntos, origen.salida, destino.llegada);

    if (kmEntrePuntos < MIN_TRIP_KM) {
      i++;
      continue;
    }

    const paradasEnMedio = visitas.filter(v =>
      v.tipo === "PARADA" && v.llegada >= origen.salida && v.salida <= destino.llegada
    ).map(v => ({ nombre: v.geocerca_nombre, llegada: v.llegada, salida: v.salida, duracion_min: v.duracion_min }));

    let esRoundTrip = false;
    let roundTripDestIdx = -1;
    const origenEsBase = origen.tipo === "CD" || origen.tipo === "BASE";
    if (origenEsBase && i + 2 < visitasDestino.length) {
      const vueltaNombre = visitasDestino[i + 2].nombre_contrato || visitasDestino[i + 2].geocerca_nombre;
      if (vueltaNombre === origenNombre) {
        esRoundTrip = true;
        roundTripDestIdx = i + 2;
      }
    }

    if (esRoundTrip) {
      const vuelta = visitasDestino[roundTripDestIdx];
      const kmTotal = estimarKm(puntos, origen.salida, vuelta.llegada);
      const durTotal = Math.round((vuelta.llegada.getTime() - origen.salida.getTime()) / 60000);

      const allParadas = [];
      for (let j = i + 1; j < roundTripDestIdx; j++) {
        allParadas.push({
          nombre: visitasDestino[j].nombre_contrato || visitasDestino[j].geocerca_nombre,
          llegada: visitasDestino[j].llegada,
          salida: visitasDestino[j].salida,
          duracion_min: visitasDestino[j].duracion_min,
        });
      }
      const paradasRT = visitas.filter(v =>
        v.tipo === "PARADA" && v.llegada >= origen.salida && v.salida <= vuelta.llegada
      ).map(v => ({ nombre: v.geocerca_nombre, llegada: v.llegada, salida: v.salida, duracion_min: v.duracion_min }));
      allParadas.push(...paradasRT);

      viajes.push({
        camion_id, patente,
        origen: origenNombre,
        destino: destinoNombre,
        origen_geo: origen.geocerca_nombre,
        destino_geo: destino.geocerca_nombre,
        fecha_inicio: origen.salida,
        fecha_fin: vuelta.llegada,
        km_estimado: kmTotal,
        duracion_min: durTotal,
        es_round_trip: true,
        paradas_intermedias: allParadas,
        visitas_secuencia: visitasDestino.slice(i, roundTripDestIdx + 1).map(v => v.nombre_contrato || v.geocerca_nombre),
        origen_lat: origen.lat,
        origen_lng: origen.lng,
        destino_lat: destino.lat,
        destino_lng: destino.lng,
      });

      i = roundTripDestIdx;
    } else {
      const dur = Math.round((destino.llegada.getTime() - origen.salida.getTime()) / 60000);

      viajes.push({
        camion_id, patente,
        origen: origenNombre,
        destino: destinoNombre,
        origen_geo: origen.geocerca_nombre,
        destino_geo: destino.geocerca_nombre,
        fecha_inicio: origen.salida,
        fecha_fin: destino.llegada,
        km_estimado: kmEntrePuntos,
        duracion_min: dur,
        es_round_trip: false,
        paradas_intermedias: paradasEnMedio,
        visitas_secuencia: [origenNombre, destinoNombre],
        origen_lat: origen.lat,
        origen_lng: origen.lng,
        destino_lat: destino.lat,
        destino_lng: destino.lng,
      });

      i++;
    }
  }

  return viajes;
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
  "Concepción": ["CT Concepción"],
  "Coquimbo": ["CT Coquimbo"],
  "CT Coquimbo": ["Coquimbo"],
  "CD Noviciado": ["Noviciado"],
  "Noviciado": ["CD Noviciado"],
  "CD Vespucio": ["Vespucio"],
  "Vespucio": ["CD Vespucio"],
  "CD Lo Aguirre": ["Lo Aguirre"],
  "Lo Aguirre": ["CD Lo Aguirre"],
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
           (SELECT id FROM camiones WHERE camiones.patente = wp.patente LIMIT 1) as camion_id
    FROM wisetrack_posiciones wp
    WHERE creado_at >= $1::date
      AND creado_at < ($1::date + interval '1 day')
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
        SELECT lat, lng, creado_at as timestamp_gps, velocidad, kms_total as odometro
        FROM wisetrack_posiciones
        WHERE patente = $1
          AND creado_at >= $2::date
          AND creado_at < ($2::date + interval '1 day')
        ORDER BY creado_at ASC
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

      const viajes = construirViajes(cam.camion_id, cam.patente, visitas, puntos);

      for (const v of viajes) {
        const oLat = v.origen_lat || 0;
        const oLng = v.origen_lng || 0;
        const dLat = v.destino_lat || 0;
        const dLng = v.destino_lng || 0;

        if (v.es_round_trip) {
          const rtBilling = evaluarBillingRoundTrip(v.origen, v.destino, tarifas);

          if (rtBilling.mode === "SPLIT") {
            const kmIda = Math.round(v.km_estimado * 0.5);
            const kmVuelta = v.km_estimado - kmIda;
            const durIda = Math.round(v.duracion_min * 0.5);
            const durVuelta = v.duracion_min - durIda;
            const midTime = new Date((v.fecha_inicio.getTime() + v.fecha_fin.getTime()) / 2);

            allInserts.push({
              camion_id: cam.camion_id,
              fecha_inicio: v.fecha_inicio,
              fecha_fin: midTime,
              origen: v.origen, destino: v.destino,
              origen_geo: v.origen_geo, destino_geo: v.destino_geo,
              origen_lat: oLat, origen_lng: oLng,
              destino_lat: dLat, destino_lng: dLng,
              km: kmIda, duracion: durIda,
              es_round_trip: false,
              paradas_intermedias: v.paradas_intermedias,
              visitas_secuencia: [v.origen, v.destino],
              tarifa: rtBilling.tarifa_ida,
            });

            allInserts.push({
              camion_id: cam.camion_id,
              fecha_inicio: new Date(midTime.getTime() + 1000),
              fecha_fin: v.fecha_fin,
              origen: v.destino, destino: v.origen,
              origen_geo: v.destino_geo, destino_geo: v.origen_geo,
              origen_lat: dLat, origen_lng: dLng,
              destino_lat: oLat, destino_lng: oLng,
              km: kmVuelta, duracion: durVuelta,
              es_round_trip: false,
              paradas_intermedias: [],
              visitas_secuencia: [v.destino, v.origen],
              tarifa: rtBilling.tarifa_vuelta,
            });

            totalViajes += 2;
            totalRoundTrip++;
            totalFacturados += 2;
            console.log(`[T1] RT-SPLIT ${cam.patente}: ${v.origen}→${v.destino}→${v.origen} = $${rtBilling.tarifa_ida}+$${rtBilling.tarifa_vuelta}`);
            continue;
          }

          const tarifaFinal = rtBilling.tarifa_total;
          allInserts.push({
            camion_id: cam.camion_id,
            fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin,
            origen: v.origen, destino: v.destino,
            origen_geo: v.origen_geo, destino_geo: v.destino_geo,
            origen_lat: oLat, origen_lng: oLng,
            destino_lat: dLat, destino_lng: dLng,
            km: v.km_estimado, duracion: v.duracion_min,
            es_round_trip: true,
            paradas_intermedias: v.paradas_intermedias,
            visitas_secuencia: v.visitas_secuencia,
            tarifa: tarifaFinal,
          });
          totalViajes++;
          totalRoundTrip++;
          if (tarifaFinal) totalFacturados++;
          else totalPendientes++;
        } else {
          const tarifaFinal = buscarTarifaFlexible(v.origen, v.destino, tarifas);
          allInserts.push({
            camion_id: cam.camion_id,
            fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin,
            origen: v.origen, destino: v.destino,
            origen_geo: v.origen_geo, destino_geo: v.destino_geo,
            origen_lat: oLat, origen_lng: oLng,
            destino_lat: dLat, destino_lng: dLng,
            km: v.km_estimado, duracion: v.duracion_min,
            es_round_trip: false,
            paradas_intermedias: v.paradas_intermedias,
            visitas_secuencia: v.visitas_secuencia,
            tarifa: tarifaFinal,
          });
          totalViajes++;
          totalIda++;
          if (tarifaFinal) totalFacturados++;
          else totalPendientes++;
        }
      }
    } catch (err: any) {
      errores.push(`${cam.patente}: ${err.message}`);
    }
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
