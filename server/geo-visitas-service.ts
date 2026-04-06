import { db, pool, DATA_START } from "./db";
import { geoLugares, geoPuntos, geoViajes, camiones } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { getCencosudFaenaId } from "./cencosud-filter";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

interface DestinoCencosud {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
  radioMetros: number;
}

interface PuntoGPS {
  id: number;
  camionId: number;
  lat: number;
  lng: number;
  timestamp: Date;
  velocidadKmh: number | null;
  kmOdometro: number | null;
}

interface VisitaDetectada {
  camionId: number;
  patente: string;
  destinoId: number;
  destinoNombre: string;
  destinoLat: number;
  destinoLng: number;
  fechaVisita: Date;
  kmViaje: number;
  velocidadEnDestino: number | null;
  tiempoEnDestinoMin: number | null;
  confianza: "ALTA" | "MEDIA" | "SIN_DATOS";
  puntosEnRadio: number;
  origenNombre: string | null;
  origenLat: number | null;
  origenLng: number | null;
  metodo: "GPS" | "ODOMETRO" | "CARGA";
  tarifaClp: number | null;
  tmsViajeId: number | null;
}

const RADIO_DETECCION_KM = 1.0; // 1000m para todas las faenas
const VELOCIDAD_PARADA_KMH = 15;
const TIEMPO_MINIMO_MIN = 10; // Mínimo 10 minutos dentro de geocerca para validar
const DISTANCIA_VIAJE_MIN_KM = 50;

let destinosCencosud: DestinoCencosud[] = [];
let perfilGpsFlota: Map<number, { totalPuntos: number; desde: Date | null; hasta: Date | null; conCoords: number; kmDelta: number }> = new Map();
let fuenteGps: string = "geo_puntos";

const TARIFAS_POR_DESTINO: Record<string, number> = {
  "CD Cencosud La Serena": 810000,
  "CD Cencosud Coquimbo": 810000,
  "CD Cencosud Chillan": 610000,
  "CD Cencosud Chillán": 610000,
  "CD Cencosud Puerto Montt": 1400000,
  "CD Vespucio": 120000,
  "CD Lo Aguirre": 120000,
  "Base Santiago CENCOSUD": 0,
};

const DISTANCIAS_REFERENCIA_KM: Record<string, number> = {
  "CD Cencosud La Serena": 470,
  "CD Cencosud Coquimbo": 460,
  "CD Cencosud Chillan": 400,
  "CD Cencosud Chillán": 400,
  "CD Cencosud Puerto Montt": 1020,
  "CD Vespucio": 15,
  "CD Lo Aguirre": 25,
};

export async function inicializarPerfilGPS(): Promise<void> {
  try {
    const faenaId = await getCencosudFaenaId();

    const lugares = await db.select().from(geoLugares).where(
      sql`${geoLugares.activo} = true`
    );
    destinosCencosud = lugares
      .filter(l => l.tipo === "CD_CENCOSUD" || l.tipo === "BASE_ORIGEN")
      .map(l => ({
        id: l.id,
        nombre: l.nombre || "",
        lat: parseFloat(l.lat),
        lng: parseFloat(l.lng),
        radioMetros: l.radioMetros || 1000,
      }));

    const perfilResult = await pool.query(`
      SELECT c.id as camion_id, c.patente, COUNT(g.id) as total_puntos,
        MIN(g.timestamp_punto) as desde, MAX(g.timestamp_punto) as hasta,
        SUM(CASE WHEN g.lat IS NOT NULL AND g.lng IS NOT NULL THEN 1 ELSE 0 END) as puntos_con_coords,
        COALESCE(MAX(g.km_odometro) - MIN(g.km_odometro), 0) as km_delta_periodo
      FROM camiones c
      LEFT JOIN geo_puntos g ON g.camion_id = c.id AND g.timestamp_punto >= '${DATA_START.toISOString().slice(0,10)}'
      WHERE c.faena_id = $1
      GROUP BY c.id, c.patente
    `, [faenaId]);

    perfilGpsFlota.clear();
    for (const r of perfilResult.rows) {
      perfilGpsFlota.set(r.camion_id, {
        totalPuntos: parseInt(r.total_puntos) || 0,
        desde: r.desde ? new Date(r.desde) : null,
        hasta: r.hasta ? new Date(r.hasta) : null,
        conCoords: parseInt(r.puntos_con_coords) || 0,
        kmDelta: parseFloat(r.km_delta_periodo) || 0,
      });
    }

    console.log(`[visitas] Perfil GPS cargado: ${perfilGpsFlota.size} camiones, ${destinosCencosud.length} destinos CENCOSUD`);
    console.log(`[visitas] Fuente GPS: ${fuenteGps}`);
  } catch (err) {
    console.error("[visitas] Error inicializando perfil GPS:", err);
  }
}

async function obtenerPuntosGPS(camionId: number, desde: string, hasta: string): Promise<PuntoGPS[]> {
  const result = await pool.query(`
    SELECT id, camion_id, lat, lng, timestamp_punto, velocidad_kmh, km_odometro
    FROM geo_puntos
    WHERE camion_id = $1
      AND timestamp_punto >= $2
      AND timestamp_punto <= $3
      AND lat IS NOT NULL AND lng IS NOT NULL
    ORDER BY timestamp_punto ASC
  `, [camionId, desde, hasta]);

  return result.rows.map(r => ({
    id: r.id,
    camionId: r.camion_id,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lng),
    timestamp: new Date(r.timestamp_punto),
    velocidadKmh: r.velocidad_kmh !== null ? parseFloat(r.velocidad_kmh) : null,
    kmOdometro: r.km_odometro !== null ? parseFloat(r.km_odometro) : null,
  }));
}

function detectarVisitasGPS(
  puntos: PuntoGPS[],
  patente: string,
  camionId: number
): VisitaDetectada[] {
  if (puntos.length === 0) return [];

  const visitas: VisitaDetectada[] = [];

  for (const destino of destinosCencosud) {
    if (destino.nombre === "Base Santiago CENCOSUD") continue;

    const puntosEnRadio: PuntoGPS[] = [];

    for (const p of puntos) {
      const dist = haversineKm(p.lat, p.lng, destino.lat, destino.lng);
      if (dist <= RADIO_DETECCION_KM) {
        puntosEnRadio.push(p);
      }
    }

    if (puntosEnRadio.length === 0) continue;

    const grupos = agruparConsecutivos(puntosEnRadio, puntos);

    for (const grupo of grupos) {
      const resultado = evaluarVisita(grupo, puntos, destino, patente, camionId);
      if (resultado) {
        visitas.push(resultado);
      }
    }
  }

  return visitas;
}

function agruparConsecutivos(
  puntosEnRadio: PuntoGPS[],
  todosPuntos: PuntoGPS[]
): PuntoGPS[][] {
  if (puntosEnRadio.length === 0) return [];

  const grupos: PuntoGPS[][] = [];
  let grupoActual: PuntoGPS[] = [puntosEnRadio[0]];

  for (let i = 1; i < puntosEnRadio.length; i++) {
    const diffHoras = (puntosEnRadio[i].timestamp.getTime() - puntosEnRadio[i - 1].timestamp.getTime()) / (1000 * 60 * 60);
    if (diffHoras <= 6) {
      grupoActual.push(puntosEnRadio[i]);
    } else {
      grupos.push(grupoActual);
      grupoActual = [puntosEnRadio[i]];
    }
  }
  grupos.push(grupoActual);

  return grupos;
}

function evaluarVisita(
  grupo: PuntoGPS[],
  todosPuntos: PuntoGPS[],
  destino: DestinoCencosud,
  patente: string,
  camionId: number
): VisitaDetectada | null {
  const primerPunto = grupo[0];
  const ultimoPunto = grupo[grupo.length - 1];

  const velocidadEnDestino = grupo.reduce((min, p) =>
    p.velocidadKmh !== null ? Math.min(min, p.velocidadKmh) : min, 999);

  const criterio1 = true;

  const criterio2 = velocidadEnDestino <= VELOCIDAD_PARADA_KMH || velocidadEnDestino === 999;

  let criterio3 = false;
  let tiempoEnDestino = 0;

  if (grupo.length >= 2) {
    tiempoEnDestino = (ultimoPunto.timestamp.getTime() - primerPunto.timestamp.getTime()) / (1000 * 60);
    criterio3 = tiempoEnDestino >= TIEMPO_MINIMO_MIN;
  } else {
    const idx = todosPuntos.findIndex(p => p.id === primerPunto.id);
    const anterior = idx > 0 ? todosPuntos[idx - 1] : null;
    const siguiente = idx < todosPuntos.length - 1 ? todosPuntos[idx + 1] : null;

    const distAnterior = anterior ? haversineKm(anterior.lat, anterior.lng, primerPunto.lat, primerPunto.lng) : 0;
    const distSiguiente = siguiente ? haversineKm(primerPunto.lat, primerPunto.lng, siguiente.lat, siguiente.lng) : 0;

    if (distAnterior > DISTANCIA_VIAJE_MIN_KM && distSiguiente > DISTANCIA_VIAJE_MIN_KM) {
      criterio3 = true;
      tiempoEnDestino = -1;
    } else if (distAnterior > DISTANCIA_VIAJE_MIN_KM || distSiguiente > DISTANCIA_VIAJE_MIN_KM) {
      criterio3 = true;
      tiempoEnDestino = -1;
    }
  }

  let criterio4 = false;
  const idx = todosPuntos.findIndex(p => p.id === primerPunto.id);
  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i--) {
      const dist = haversineKm(todosPuntos[i].lat, todosPuntos[i].lng, destino.lat, destino.lng);
      if (dist > RADIO_DETECCION_KM) {
        criterio4 = dist > DISTANCIA_VIAJE_MIN_KM;
        break;
      }
    }
  } else {
    criterio4 = true;
  }

  const criteriosCumplidos = [criterio1, criterio2, criterio3, criterio4].filter(Boolean).length;

  if (criteriosCumplidos < 3) return null;

  const confianza: "ALTA" | "MEDIA" = criteriosCumplidos === 4 && grupo.length >= 2 ? "ALTA" : "MEDIA";

  let origenLat: number | null = null;
  let origenLng: number | null = null;
  let origenNombre: string | null = null;
  let kmViaje = 0;

  if (idx > 0) {
    const origenPunto = todosPuntos[0];
    origenLat = origenPunto.lat;
    origenLng = origenPunto.lng;
    kmViaje = haversineKm(origenLat, origenLng, destino.lat, destino.lng) * 1.15;
  } else {
    kmViaje = (DISTANCIAS_REFERENCIA_KM[destino.nombre] || 0) * 2;
  }

  if (primerPunto.kmOdometro && todosPuntos[0]?.kmOdometro) {
    const delta = Math.abs(primerPunto.kmOdometro - todosPuntos[0].kmOdometro);
    if (delta > 10) kmViaje = delta;
  }

  return {
    camionId,
    patente,
    destinoId: destino.id,
    destinoNombre: destino.nombre,
    destinoLat: destino.lat,
    destinoLng: destino.lng,
    fechaVisita: primerPunto.timestamp,
    kmViaje: Math.round(kmViaje * 10) / 10,
    velocidadEnDestino: velocidadEnDestino === 999 ? null : velocidadEnDestino,
    tiempoEnDestinoMin: tiempoEnDestino >= 0 ? Math.round(tiempoEnDestino) : null,
    confianza,
    puntosEnRadio: grupo.length,
    origenNombre,
    origenLat,
    origenLng,
    metodo: "GPS",
    tarifaClp: TARIFAS_POR_DESTINO[destino.nombre] || null,
    tmsViajeId: null,
  };
}

async function detectarVisitasPorOdometro(
  camionId: number,
  patente: string,
  desde: string,
  hasta: string
): Promise<VisitaDetectada[]> {
  const visitas: VisitaDetectada[] = [];

  const trips = await pool.query(`
    SELECT id, km_inicio, km_cierre, km_recorridos, fecha_salida, fecha_llegada,
      litros_sigetra, litros_ecu, rendimiento_real,
      destino_lat, destino_lng, destino_nombre
    FROM tms_viajes
    WHERE camion_id = $1 AND contrato_id = 2
      AND fecha_salida >= $2
    ORDER BY fecha_salida ASC
  `, [camionId, desde]);

  for (const trip of trips.rows) {
    const km = parseFloat(trip.km_recorridos) || 0;
    if (km < 30) continue;

    let mejorDestino: DestinoCencosud | null = null;
    let menorDiffKm = Infinity;

    for (const d of destinosCencosud) {
      if (d.nombre === "Base Santiago CENCOSUD") continue;
      const refKm = DISTANCIAS_REFERENCIA_KM[d.nombre] || 0;
      if (refKm === 0) continue;

      const refKmRoundTrip = refKm * 2;
      const tolerancia = refKmRoundTrip * 0.30;
      const diff = Math.abs(km - refKmRoundTrip);

      if (diff <= tolerancia && diff < menorDiffKm) {
        menorDiffKm = diff;
        mejorDestino = d;
      }
    }

    if (trip.destino_lat && trip.destino_lng) {
      const lat = parseFloat(trip.destino_lat);
      const lng = parseFloat(trip.destino_lng);
      for (const d of destinosCencosud) {
        const dist = haversineKm(lat, lng, d.lat, d.lng);
        if (dist <= 10) {
          mejorDestino = d;
          menorDiffKm = 0;
          break;
        }
      }
    }

    if (mejorDestino) {
      visitas.push({
        camionId,
        patente,
        destinoId: mejorDestino.id,
        destinoNombre: mejorDestino.nombre,
        destinoLat: mejorDestino.lat,
        destinoLng: mejorDestino.lng,
        fechaVisita: new Date(trip.fecha_salida),
        kmViaje: km,
        velocidadEnDestino: null,
        tiempoEnDestinoMin: null,
        confianza: menorDiffKm < (DISTANCIAS_REFERENCIA_KM[mejorDestino.nombre] || 999) * 0.15 ? "MEDIA" : "MEDIA",
        puntosEnRadio: 0,
        origenNombre: "Santiago (estimado)",
        origenLat: -33.4489,
        origenLng: -70.6693,
        metodo: "ODOMETRO",
        tarifaClp: TARIFAS_POR_DESTINO[mejorDestino.nombre] || null,
        tmsViajeId: trip.id,
      });
    }
  }

  return visitas;
}

export async function detectarVisitasFlota(
  desde: string,
  hasta: string,
  patentes: string[]
): Promise<{
  procesados: number;
  con_gps: number;
  sin_gps: number;
  visitas_detectadas: number;
  visitas_alta_confianza: number;
  visitas_media_confianza: number;
  por_destino: Record<string, number>;
  visitas: VisitaDetectada[];
}> {
  if (destinosCencosud.length === 0) {
    await inicializarPerfilGPS();
  }

  const faenaId = await getCencosudFaenaId();
  let camionesQuery: any[];

  if (patentes.length > 0) {
    const result = await pool.query(
      `SELECT id, patente FROM camiones WHERE faena_id = $1 AND patente = ANY($2)`,
      [faenaId, patentes]
    );
    camionesQuery = result.rows;
  } else {
    const result = await pool.query(
      `SELECT id, patente FROM camiones WHERE faena_id = $1`,
      [faenaId]
    );
    camionesQuery = result.rows;
  }

  let conGps = 0;
  let sinGps = 0;
  const todasVisitas: VisitaDetectada[] = [];

  for (const cam of camionesQuery) {
    const perfil = perfilGpsFlota.get(cam.id);
    const tieneDatosGPS = perfil && perfil.conCoords > 2;

    if (tieneDatosGPS) {
      conGps++;
      const puntos = await obtenerPuntosGPS(cam.id, desde, hasta);
      const visitasGPS = detectarVisitasGPS(puntos, cam.patente, cam.id);
      todasVisitas.push(...visitasGPS);

      if (visitasGPS.length === 0) {
        const visitasOdo = await detectarVisitasPorOdometro(cam.id, cam.patente, desde, hasta);
        todasVisitas.push(...visitasOdo);
      }
    } else {
      sinGps++;
      const visitasOdo = await detectarVisitasPorOdometro(cam.id, cam.patente, desde, hasta);
      todasVisitas.push(...visitasOdo);
    }
  }

  const porDestino: Record<string, number> = {};
  for (const v of todasVisitas) {
    const nombre = v.destinoNombre.replace("CD Cencosud ", "").replace("CD ", "");
    porDestino[nombre] = (porDestino[nombre] || 0) + 1;
  }

  await guardarVisitas(todasVisitas);

  return {
    procesados: camionesQuery.length,
    con_gps: conGps,
    sin_gps: sinGps,
    visitas_detectadas: todasVisitas.length,
    visitas_alta_confianza: todasVisitas.filter(v => v.confianza === "ALTA").length,
    visitas_media_confianza: todasVisitas.filter(v => v.confianza === "MEDIA").length,
    por_destino: porDestino,
    visitas: todasVisitas,
  };
}

async function guardarVisitas(visitas: VisitaDetectada[]): Promise<void> {
  if (visitas.length === 0) return;

  await pool.query(`DELETE FROM geo_viajes WHERE contrato = 'CENCOSUD'`);

  for (const v of visitas) {
    await pool.query(`
      INSERT INTO geo_viajes (
        camion_id, patente, contrato, 
        origen_lat, origen_lng, origen_nombre, origen_timestamp,
        destino_lat, destino_lng, destino_nombre, destino_timestamp,
        km_gps, validacion_estado, validacion_detalle,
        destino_lugar_id, creado_at
      ) VALUES (
        $1, $2, 'CENCOSUD',
        $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, NOW()
      )
    `, [
      v.camionId, v.patente,
      v.origenLat, v.origenLng, v.origenNombre || "Santiago", v.fechaVisita,
      v.destinoLat, v.destinoLng, v.destinoNombre, v.fechaVisita,
      v.kmViaje,
      v.confianza === "ALTA" ? "VALIDADO" : "PENDIENTE",
      JSON.stringify({
        confianza: v.confianza,
        metodo: v.metodo,
        puntosEnRadio: v.puntosEnRadio,
        velocidadEnDestino: v.velocidadEnDestino,
        tiempoEnDestinoMin: v.tiempoEnDestinoMin,
        tarifaClp: v.tarifaClp,
        tmsViajeId: v.tmsViajeId,
      }),
      v.destinoId,
    ]);
  }

  console.log(`[visitas] Guardadas ${visitas.length} visitas en geo_viajes`);
}

export async function obtenerResumenVisitas(desde: string, hasta: string): Promise<any> {
  const visitas = await pool.query(`
    SELECT gv.*, gl.nombre as lugar_nombre
    FROM geo_viajes gv
    LEFT JOIN geo_lugares gl ON gv.destino_lugar_id = gl.id
    WHERE gv.contrato = 'CENCOSUD'
      AND gv.origen_timestamp >= $1
    ORDER BY gv.destino_nombre, gv.origen_timestamp
  `, [desde]);

  const destinosMap = new Map<string, {
    nombre: string;
    lugarId: number | null;
    lat: number;
    lng: number;
    tarifaClp: number;
    kmReferencia: number;
    visitas: any[];
    visitasAltaConfianza: number;
    visitasMediaConfianza: number;
    camionesDistintos: Set<string>;
    ultimoViaje: string | null;
    kmTotal: number;
  }>();

  let sinDestinoDetectado = 0;

  for (const v of visitas.rows) {
    const nombre = v.destino_nombre || "Sin detectar";
    if (nombre === "Sin detectar") {
      sinDestinoDetectado++;
      continue;
    }

    if (!destinosMap.has(nombre)) {
      const destInfo = destinosCencosud.find(d => d.nombre === nombre);
      destinosMap.set(nombre, {
        nombre,
        lugarId: v.destino_lugar_id,
        lat: parseFloat(v.destino_lat) || destInfo?.lat || 0,
        lng: parseFloat(v.destino_lng) || destInfo?.lng || 0,
        tarifaClp: TARIFAS_POR_DESTINO[nombre] || 0,
        kmReferencia: (DISTANCIAS_REFERENCIA_KM[nombre] || 0) * 2,
        visitas: [],
        visitasAltaConfianza: 0,
        visitasMediaConfianza: 0,
        camionesDistintos: new Set(),
        ultimoViaje: null,
        kmTotal: 0,
      });
    }

    const dest = destinosMap.get(nombre)!;
    const detalle = typeof v.validacion_detalle === "string" ? JSON.parse(v.validacion_detalle) : v.validacion_detalle || {};

    const confianza = detalle.confianza || (v.validacion_estado === "VALIDADO" ? "ALTA" : "MEDIA");
    if (confianza === "ALTA") dest.visitasAltaConfianza++;
    else dest.visitasMediaConfianza++;

    dest.camionesDistintos.add(v.patente);
    const fechaStr = v.origen_timestamp ? new Date(v.origen_timestamp).toISOString().split("T")[0] : null;
    if (fechaStr && (!dest.ultimoViaje || fechaStr > dest.ultimoViaje)) {
      dest.ultimoViaje = fechaStr;
    }

    const km = parseFloat(v.km_gps) || 0;
    dest.kmTotal += km;

    dest.visitas.push({
      id: v.id,
      patente: v.patente,
      fecha: fechaStr,
      km: km,
      confianza,
      metodo: detalle.metodo || "GPS",
      tarifaClp: detalle.tarifaClp || TARIFAS_POR_DESTINO[nombre] || 0,
      velocidadEnDestino: detalle.velocidadEnDestino,
      tiempoEnDestinoMin: detalle.tiempoEnDestinoMin,
    });
  }

  const destinos = Array.from(destinosMap.values()).map(d => ({
    nombre: d.nombre.replace("CD Cencosud ", "").replace("CD ", ""),
    nombreCompleto: d.nombre,
    lugarId: d.lugarId,
    lat: d.lat,
    lng: d.lng,
    tarifaClp: d.tarifaClp,
    kmReferencia: d.kmReferencia,
    totalVisitas: d.visitas.length,
    visitasAltaConfianza: d.visitasAltaConfianza,
    visitasMediaConfianza: d.visitasMediaConfianza,
    camionesDistintos: d.camionesDistintos.size,
    ultimoViaje: d.ultimoViaje,
    kmPromedioReal: d.visitas.length > 0 ? Math.round(d.kmTotal / d.visitas.length) : 0,
    visitas: d.visitas,
  }));

  destinos.sort((a, b) => b.totalVisitas - a.totalVisitas);

  const totalVisitas = destinos.reduce((s, d) => s + d.totalVisitas, 0);

  return {
    desde,
    hasta,
    destinos,
    totalVisitas,
    sinDestinoDetectado,
    destinosSinVisitas: destinosCencosud
      .filter(d => d.nombre !== "Base Santiago CENCOSUD" && !destinosMap.has(d.nombre))
      .map(d => ({
        nombre: d.nombre.replace("CD Cencosud ", "").replace("CD ", ""),
        nombreCompleto: d.nombre,
        lat: d.lat,
        lng: d.lng,
        tarifaClp: TARIFAS_POR_DESTINO[d.nombre] || 0,
        kmReferencia: (DISTANCIAS_REFERENCIA_KM[d.nombre] || 0) * 2,
      })),
  };
}

export async function obtenerVisitasCamion(patente: string): Promise<any[]> {
  const result = await pool.query(`
    SELECT gv.*, gl.nombre as lugar_nombre
    FROM geo_viajes gv
    LEFT JOIN geo_lugares gl ON gv.destino_lugar_id = gl.id
    WHERE gv.patente = $1 AND gv.contrato = 'CENCOSUD'
    ORDER BY gv.origen_timestamp DESC
  `, [patente]);

  return result.rows.map(v => {
    const detalle = typeof v.validacion_detalle === "string" ? JSON.parse(v.validacion_detalle) : v.validacion_detalle || {};
    return {
      id: v.id,
      patente: v.patente,
      destino: v.destino_nombre,
      destinoCorto: (v.destino_nombre || "").replace("CD Cencosud ", "").replace("CD ", ""),
      destinoLat: parseFloat(v.destino_lat) || null,
      destinoLng: parseFloat(v.destino_lng) || null,
      origenNombre: v.origen_nombre,
      origenLat: parseFloat(v.origen_lat) || null,
      origenLng: parseFloat(v.origen_lng) || null,
      fecha: v.origen_timestamp ? new Date(v.origen_timestamp).toISOString().split("T")[0] : null,
      km: parseFloat(v.km_gps) || 0,
      confianza: detalle.confianza || (v.validacion_estado === "VALIDADO" ? "ALTA" : "MEDIA"),
      metodo: detalle.metodo || "GPS",
      tarifaClp: detalle.tarifaClp || 0,
      velocidadEnDestino: detalle.velocidadEnDestino,
      tiempoEnDestinoMin: detalle.tiempoEnDestinoMin,
      puntosEnRadio: detalle.puntosEnRadio || 0,
    };
  });
}

export function getPerfilGPS() {
  return perfilGpsFlota;
}

export function getDestinosCencosud() {
  return destinosCencosud;
}
