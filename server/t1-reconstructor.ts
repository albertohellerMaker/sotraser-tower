import { db, pool } from "./db";
import { sql } from "drizzle-orm";

const MIN_DWELL_MINUTES = 30;
const MIN_TRIP_KM = 40;

function fechaChile(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

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
  nombre_contrato: string;
  lat: number;
  lng: number;
  radio_km: number;
  es_cd: boolean;
  es_base_sotraser: boolean;
  es_parada: boolean;
}

interface Visita {
  geocerca: string;
  llegada: Date;
  salida: Date;
  duracion_min: number;
  lat: number;
  lng: number;
  es_cd: boolean;
  es_base: boolean;
  es_parada: boolean;
}

const PARADA_PATTERNS = [
  "copec", "es copec", "shell", "servicentro", "estacionamiento",
  "hosteria", "hostería", "zona de descanso", "t.vpv", "peaje",
  "plaza pesaje", "plaza de pesaje", "taller gallardo",
];

function esParadaIntermedia(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return PARADA_PATTERNS.some(p => lower.includes(p));
}

const CENCOSUD_LAT_MIN = -43.0;
const CENCOSUD_LAT_MAX = -27.0;

interface ViajeT1 {
  camion_id: number;
  patente: string;
  origen: string;
  destino: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  km_estimado: number;
  duracion_min: number;
  es_round_trip: boolean;
  paradas_intermedias: any[];
  visitas_secuencia: string[];
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

async function cargarGeocercasTarifa(): Promise<Geocerca[]> {
  const nombresContrato = await db.execute(sql`
    SELECT DISTINCT nombre_contrato, 
           AVG(lat) as lat_avg, AVG(lng) as lng_avg
    FROM (
      SELECT gac.nombre_contrato,
             COALESCE(kml.lat, go2.lat) as lat,
             COALESCE(kml.lng, go2.lng) as lng
      FROM geocerca_alias_contrato gac
      LEFT JOIN cencosud_geocercas_kml kml ON LOWER(kml.nombre) = LOWER(gac.geocerca_nombre)
      LEFT JOIN geocercas_operacionales go2 ON LOWER(go2.nombre) = LOWER(gac.geocerca_nombre)
      WHERE gac.contrato = 'CENCOSUD' AND gac.confirmado = true
        AND COALESCE(kml.lat, go2.lat) IS NOT NULL
    ) sub
    GROUP BY nombre_contrato
  `);

  const tarifasNombres = await db.execute(sql`
    SELECT DISTINCT origen as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
    UNION
    SELECT DISTINCT destino as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
  `);
  const nombresValidos = new Set((tarifasNombres.rows || []).map((r: any) => r.nombre));

  const basesSOTRASER = ["Sotraser Antofagasta", "Sotraser Copiapó", "Sotraser Llay Llay", "SOTRASER CALAMA"];
  const basesSet = new Set(basesSOTRASER.map(b => b.toLowerCase()));

  const geocercas: Geocerca[] = [];
  for (const row of (nombresContrato.rows || []) as any[]) {
    const nombre = row.nombre_contrato;
    const lat = parseFloat(row.lat_avg);
    const lng = parseFloat(row.lng_avg);
    if (!lat || !lng) continue;

    const esTarifa = nombresValidos.has(nombre);
    const esCD = nombre.startsWith("CD ") || nombre.startsWith("CT ");
    const esBase = basesSet.has(nombre.toLowerCase());
    const esParada = esParadaIntermedia(nombre);
    const radioKm = esCD ? 5 : esParada ? 3 : 15;

    geocercas.push({
      nombre_contrato: nombre,
      lat, lng,
      radio_km: radioKm,
      es_cd: esCD,
      es_base_sotraser: esBase || esCD,
      es_parada: esParada,
    });
  }

  console.log(`[T1] ${geocercas.length} geocercas cargadas (${[...nombresValidos].length} en tarifario)`);
  return geocercas;
}

function identificarVisitas(puntos: GpsPoint[], geocercas: Geocerca[]): Visita[] {
  if (puntos.length < 5) return [];

  const visitas: Visita[] = [];
  let enGeocerca: { geo: Geocerca; desde: Date; lat: number; lng: number } | null = null;
  let ultimaSalida: Date | null = null;

  for (const p of puntos) {
    let geocercaCercana: Geocerca | null = null;
    let distMin = Infinity;

    for (const g of geocercas) {
      const d = haversineKm(p.lat, p.lng, g.lat, g.lng);
      if (d < g.radio_km && d < distMin) {
        distMin = d;
        geocercaCercana = g;
      }
    }

    if (geocercaCercana) {
      if (!enGeocerca || enGeocerca.geo.nombre_contrato !== geocercaCercana.nombre_contrato) {
        if (enGeocerca) {
          const dur = (p.timestamp_gps.getTime() - enGeocerca.desde.getTime()) / 60000;
          if (dur >= MIN_DWELL_MINUTES) {
            visitas.push({
              geocerca: enGeocerca.geo.nombre_contrato,
              llegada: enGeocerca.desde,
              salida: new Date(p.timestamp_gps),
              duracion_min: Math.round(dur),
              lat: enGeocerca.lat,
              lng: enGeocerca.lng,
              es_cd: enGeocerca.geo.es_cd,
              es_base: enGeocerca.geo.es_base_sotraser,
              es_parada: enGeocerca.geo.es_parada,
            });
          }
          ultimaSalida = new Date(p.timestamp_gps);
        }
        enGeocerca = { geo: geocercaCercana, desde: new Date(p.timestamp_gps), lat: p.lat, lng: p.lng };
      }
    } else {
      if (enGeocerca) {
        const dur = (p.timestamp_gps.getTime() - enGeocerca.desde.getTime()) / 60000;
        if (dur >= MIN_DWELL_MINUTES) {
          visitas.push({
            geocerca: enGeocerca.geo.nombre_contrato,
            llegada: enGeocerca.desde,
            salida: new Date(p.timestamp_gps),
            duracion_min: Math.round(dur),
            lat: enGeocerca.lat,
            lng: enGeocerca.lng,
            es_cd: enGeocerca.geo.es_cd,
            es_base: enGeocerca.geo.es_base_sotraser,
            es_parada: enGeocerca.geo.es_parada,
          });
        }
        ultimaSalida = new Date(p.timestamp_gps);
        enGeocerca = null;
      }
    }
  }

  if (enGeocerca) {
    const ultimoPunto = puntos[puntos.length - 1];
    const dur = (ultimoPunto.timestamp_gps.getTime() - enGeocerca.desde.getTime()) / 60000;
    if (dur >= MIN_DWELL_MINUTES) {
      visitas.push({
        geocerca: enGeocerca.geo.nombre_contrato,
        llegada: enGeocerca.desde,
        salida: ultimoPunto.timestamp_gps,
        duracion_min: Math.round(dur),
        lat: enGeocerca.lat,
        lng: enGeocerca.lng,
        es_cd: enGeocerca.geo.es_cd,
        es_base: enGeocerca.geo.es_base_sotraser,
        es_parada: enGeocerca.geo.es_parada,
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
    if (visitas[i].geocerca === prev.geocerca) {
      prev.salida = visitas[i].salida;
      prev.duracion_min += visitas[i].duracion_min;
    } else {
      result.push({ ...visitas[i] });
    }
  }
  return result;
}

async function cargarTarifas(): Promise<Map<string, number>> {
  const rows = await db.execute(sql`
    SELECT origen, destino, tarifa, clase
    FROM contrato_rutas_tarifas
    WHERE contrato = 'CENCOSUD' AND activo = true
    ORDER BY clase ASC
  `);
  const tarifas = new Map<string, number>();
  for (const r of (rows.rows || []) as any[]) {
    const key = `${r.origen}→${r.destino}`;
    if (!tarifas.has(key)) {
      tarifas.set(key, parseFloat(r.tarifa));
    }
  }
  return tarifas;
}

function filtrarParadas(visitas: Visita[]): Visita[] {
  const result: Visita[] = [];
  for (const v of visitas) {
    if (v.es_parada) continue;
    result.push(v);
  }
  return result.length >= 2 ? result : result;
}

function construirViajes(
  camion_id: number,
  patente: string,
  visitas: Visita[],
  puntos: GpsPoint[],
  tarifas: Map<string, number>
): ViajeT1[] {
  const visitasLimpias = filtrarParadas(visitas);
  if (visitasLimpias.length < 2) return [];

  const viajes: ViajeT1[] = [];
  let i = 0;

  while (i < visitasLimpias.length - 1) {
    const origen = visitasLimpias[i];
    const destino = visitasLimpias[i + 1];

    if (origen.geocerca === destino.geocerca) {
      i++;
      continue;
    }

    const kmEntrePuntos = estimarKm(puntos, origen.salida, destino.llegada);

    if (kmEntrePuntos < MIN_TRIP_KM) {
      i++;
      continue;
    }

    const paradasEnMedio = visitas.filter(v =>
      v.es_parada && v.llegada >= origen.salida && v.salida <= destino.llegada
    ).map(v => ({ nombre: v.geocerca, llegada: v.llegada, salida: v.salida, duracion_min: v.duracion_min }));

    let esRoundTrip = false;
    let roundTripDestIdx = -1;
    if (origen.es_cd && i + 2 < visitasLimpias.length && visitasLimpias[i + 2].geocerca === origen.geocerca) {
      esRoundTrip = true;
      roundTripDestIdx = i + 2;
    }

    if (esRoundTrip) {
      const vuelta = visitasLimpias[roundTripDestIdx];
      const kmTotal = estimarKm(puntos, origen.salida, vuelta.llegada);
      const durTotal = Math.round((vuelta.llegada.getTime() - origen.salida.getTime()) / 60000);

      const paradasRT = visitas.filter(v =>
        v.es_parada && v.llegada >= origen.salida && v.salida <= vuelta.llegada
      ).map(v => ({ nombre: v.geocerca, llegada: v.llegada, salida: v.salida, duracion_min: v.duracion_min }));

      const allParadas = [];
      for (let j = i + 1; j < roundTripDestIdx; j++) {
        allParadas.push({
          nombre: visitasLimpias[j].geocerca,
          llegada: visitasLimpias[j].llegada,
          salida: visitasLimpias[j].salida,
          duracion_min: visitasLimpias[j].duracion_min,
        });
      }
      allParadas.push(...paradasRT);

      viajes.push({
        camion_id,
        patente,
        origen: origen.geocerca,
        destino: destino.geocerca,
        fecha_inicio: origen.salida,
        fecha_fin: vuelta.llegada,
        km_estimado: kmTotal,
        duracion_min: durTotal,
        es_round_trip: true,
        paradas_intermedias: allParadas,
        visitas_secuencia: visitasLimpias.slice(i, roundTripDestIdx + 1).map(v => v.geocerca),
      });

      i = roundTripDestIdx;
    } else {
      const dur = Math.round((destino.llegada.getTime() - origen.salida.getTime()) / 60000);

      const esRetorno = !origen.es_cd && destino.es_cd;

      viajes.push({
        camion_id,
        patente,
        origen: origen.geocerca,
        destino: destino.geocerca,
        fecha_inicio: origen.salida,
        fecha_fin: destino.llegada,
        km_estimado: kmEntrePuntos,
        duracion_min: dur,
        es_round_trip: false,
        paradas_intermedias: paradasEnMedio,
        visitas_secuencia: [origen.geocerca, destino.geocerca],
        es_retorno: esRetorno,
      } as any);

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
      km += haversineKm(prev.lat, prev.lng, p.lat, p.lng);
    }
    prev = p;
  }
  return Math.round(km);
}

const EQUIVALENCIAS: Record<string, string[]> = {
  "Chillán": ["CD Chillán", "CD LTS CHILLAN camino Nahueltoro 230"],
  "CD Chillán": ["Chillán"],
  "CD LTS CHILLAN camino Nahueltoro 230": ["CD Chillán", "Chillán"],
  "CT Concepción": ["Concepción", "CENTRO DE TRANSFERENCIA CENCOSUD CONCEPCIÓN"],
  "Concepción": ["CT Concepción"],
  "CENTRO DE TRANSFERENCIA CENCOSUD CONCEPCIÓN": ["CT Concepción", "Concepción"],
  "Coquimbo": ["CT Coquimbo"],
  "CT Coquimbo": ["Coquimbo"],
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
      const t = tarifas.get(`${o}→${d}`);
      if (t) return t;
    }
  }

  for (const o of origenAlts) {
    for (const d of destinoAlts) {
      const t = tarifas.get(`${d}→${o}`);
      if (t) return t;
    }
  }

  return null;
}

export async function reconstruirDiaT1(fecha: string): Promise<{
  camiones_procesados: number;
  viajes_creados: number;
  viajes_round_trip: number;
  viajes_ida: number;
  viajes_retorno_descartados: number;
  viajes_facturados: number;
  pct_facturable: number;
  camiones_descanso: number;
  errores: string[];
}> {
  const inicio = Date.now();
  console.log(`[T1] ═══ Reconstrucción T-1 para ${fecha} ═══`);

  const geocercas = await cargarGeocercasTarifa();
  const tarifas = await cargarTarifas();
  console.log(`[T1] ${tarifas.size} rutas tarifadas cargadas`);

  const camionesResult = await db.execute(sql`
    SELECT DISTINCT patente, 
           (SELECT id FROM camiones WHERE camiones.patente = gps_unificado.patente LIMIT 1) as camion_id
    FROM gps_unificado
    WHERE contrato = 'CENCOSUD'
      AND timestamp_gps >= ${fecha}::date
      AND timestamp_gps < (${fecha}::date + interval '1 day')
    ORDER BY patente
  `);

  const camiones = (camionesResult.rows || []) as any[];
  console.log(`[T1] ${camiones.length} camiones Cencosud con GPS el ${fecha}`);

  let totalViajes = 0;
  let totalRoundTrip = 0;
  let totalIda = 0;
  let totalRetorno = 0;
  let totalNoCencosud = 0;
  let totalSinTarifa = 0;
  let camionesDescanso = 0;
  const errores: string[] = [];

  const nombresValidosResult = await db.execute(sql`
    SELECT DISTINCT origen as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
    UNION
    SELECT DISTINCT destino as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
  `);
  const nombresValidos = new Set((nombresValidosResult.rows || []).map((r: any) => r.nombre));

  const allInserts: any[] = [];

  for (const cam of camiones) {
    if (!cam.camion_id) continue;

    try {
      const puntosResult = await db.execute(sql`
        SELECT lat, lng, timestamp_gps, velocidad, odometro
        FROM gps_unificado
        WHERE patente = ${cam.patente}
          AND timestamp_gps >= ${fecha}::date
          AND timestamp_gps < (${fecha}::date + interval '1 day')
        ORDER BY timestamp_gps ASC
      `);

      const puntos: GpsPoint[] = ((puntosResult.rows || []) as any[]).map((r: any) => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),
        timestamp_gps: new Date(r.timestamp_gps),
        velocidad: parseFloat(r.velocidad || "0"),
        odometro: r.odometro ? parseFloat(r.odometro) : null,
      }));

      if (puntos.length < 10) continue;

      let visitasRaw = identificarVisitas(puntos, geocercas);
      const visitas = deduplicarVisitas(visitasRaw);

      if (visitas.length === 0) {
        continue;
      }

      if (visitas.length === 1 && visitas[0].es_base) {
        camionesDescanso++;
        continue;
      }

      const viajes = construirViajes(cam.camion_id, cam.patente, visitas, puntos, tarifas);

      for (const v of viajes) {
        const esRetorno = (v as any).es_retorno === true;

        if (esRetorno) {
          totalRetorno++;
          continue;
        }

        const tarifaFinal = buscarTarifaFlexible(v.origen, v.destino, tarifas);

        if (!tarifaFinal) {
          const oEnTarifario = nombresValidos.has(v.origen) || EQUIVALENCIAS[v.origen]?.some(eq => nombresValidos.has(eq));
          const dEnTarifario = nombresValidos.has(v.destino) || EQUIVALENCIAS[v.destino]?.some(eq => nombresValidos.has(eq));

          if (!oEnTarifario || !dEnTarifario) {
            totalNoCencosud++;
            continue;
          }

          totalSinTarifa++;
          continue;
        }

        allInserts.push({
          camion_id: cam.camion_id,
          fecha_inicio: v.fecha_inicio,
          fecha_fin: v.fecha_fin,
          origen: v.origen,
          destino: v.destino,
          km: v.km_estimado,
          duracion: v.duracion_min,
          es_round_trip: v.es_round_trip,
          paradas_intermedias: v.paradas_intermedias,
          visitas_secuencia: v.visitas_secuencia,
          tarifa: tarifaFinal,
        });

        totalViajes++;
        if (v.es_round_trip) totalRoundTrip++;
        else totalIda++;
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
        ) VALUES ($1, 'CENCOSUD', $2, $3, 0, 0, $4, 0, 0, $5, $6, $7, NULL, $8, 'T1_RECONSTRUCTOR', $9, true)
        ON CONFLICT (camion_id, fecha_inicio) DO UPDATE SET
          fecha_fin = EXCLUDED.fecha_fin,
          origen_nombre = EXCLUDED.origen_nombre,
          destino_nombre = EXCLUDED.destino_nombre,
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
        }),
        v.tarifa ? 'FACTURADO' : 'PENDIENTE',
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
  const facturados = allInserts.filter(v => v.tarifa).length;
  const pct = totalViajes > 0 ? Math.round(facturados * 100 / totalViajes) : 0;
  console.log(`[T1] ═══ Completado en ${durSeg}s: ${totalViajes} viajes (${totalRoundTrip} RT, ${totalIda} ida), ${facturados}/${totalViajes} facturables (${pct}%), descartados: ${totalRetorno} retornos + ${totalNoCencosud} no-cencosud + ${totalSinTarifa} sin-tarifa, ${camionesDescanso} descanso, ${errores.length} errores ═══`);

  return {
    camiones_procesados: camiones.length,
    viajes_creados: totalViajes,
    viajes_round_trip: totalRoundTrip,
    viajes_ida: totalIda,
    viajes_retorno_descartados: totalRetorno,
    viajes_facturados: facturados,
    pct_facturable: pct,
    camiones_descanso: camionesDescanso,
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
