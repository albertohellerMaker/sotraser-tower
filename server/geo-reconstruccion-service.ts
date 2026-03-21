import { db } from "./db";
import { geoPuntos, geoViajes, geoGeocache, geoLugares, camiones, cargas } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { getCencosudFaenaId } from "./cencosud-filter";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const UMBRAL_PARADA_DEFAULT_MIN = 90;

interface LugarCercanoParaUmbral {
  tipo: string | null;
  lat: number;
  lng: number;
}

function getUmbralParada(
  lat: number | null,
  lng: number | null,
  lugaresCercanos: LugarCercanoParaUmbral[]
): number {
  if (!lat || !lng) return UMBRAL_PARADA_DEFAULT_MIN;

  const cercano = lugaresCercanos.find(g => {
    const dist = haversineKm(lat, lng, g.lat, g.lng);
    return dist < 1.0;
  });

  if (!cercano || !cercano.tipo) return UMBRAL_PARADA_DEFAULT_MIN;

  switch (cercano.tipo.toUpperCase()) {
    case 'BASE':
      return 480;
    case 'MINA':
      return 360;
    case 'CD':
      return 180;
    case 'ESTACION':
      return 45;
    case 'PATIO':
      return 240;
    default:
      return UMBRAL_PARADA_DEFAULT_MIN;
  }
}

interface PuntoGPS {
  lat: number;
  lng: number;
  ts: Date;
  velocidadKmh: number;
  kmOdometro: number | null;
}

interface ParadaDetectada {
  lat: number;
  lng: number;
  inicio: Date;
  fin: Date;
  minutos: number;
  nombre: string;
  tipo: string;
  lugarId: number | null;
}

interface ViajeReconstruido {
  origenLat: number;
  origenLng: number;
  origenNombre: string;
  origenTimestamp: Date;
  origenLugarId: number | null;
  destinoLat: number;
  destinoLng: number;
  destinoNombre: string;
  destinoTimestamp: Date;
  destinoLugarId: number | null;
  kmGps: number;
  kmOdometroInicio: number | null;
  kmOdometroFin: number | null;
  kmOdometroDelta: number | null;
  duracionMinutos: number;
  velocidadPromedio: number;
  velocidadMaxima: number;
  tiempoDetenidoMin: number;
  tiempoMovimientoMin: number;
  paradas: ParadaDetectada[];
  paradasLugares: any[];
  totalPuntos: number;
}

async function geocodificarPunto(lat: number, lng: number): Promise<string> {
  const roundLat = Math.round(lat * 1000) / 1000;
  const roundLng = Math.round(lng * 1000) / 1000;

  const cached = await db.select().from(geoGeocache)
    .where(and(
      eq(geoGeocache.lat, String(roundLat)),
      eq(geoGeocache.lng, String(roundLng))
    )).limit(1);

  if (cached.length > 0) {
    const c = cached[0];
    if (c.ciudad && c.region) return `${c.ciudad}, ${c.region}`;
    if (c.nombre) return c.nombre;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  try {
    await new Promise(r => setTimeout(r, 1100));
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=es`,
      { headers: { "User-Agent": "GEOVALIDATOR-Sotraser/1.0" } }
    );
    const data: any = await res.json();
    const ciudad = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
    const region = data.address?.state || "";
    const nombre = ciudad && region ? `${ciudad}, ${region}` : 
                   data.display_name?.split(",").slice(0, 2).join(",").trim() || 
                   `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    await db.insert(geoGeocache).values({
      lat: String(roundLat),
      lng: String(roundLng),
      nombre,
      ciudad,
      region,
    }).onConflictDoNothing();

    return ciudad && region ? `${ciudad}, ${region}` : nombre;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

async function buscarLugarCercano(lat: number, lng: number, radioKm: number = 1): Promise<{ id: number; nombre: string; tipo: string } | null> {
  const lugares = await db.select().from(geoLugares)
    .where(eq(geoLugares.activo, true));

  for (const lugar of lugares) {
    const dist = haversineKm(lat, lng, parseFloat(lugar.lat as string), parseFloat(lugar.lng as string));
    if (dist <= radioKm) {
      return {
        id: lugar.id,
        nombre: lugar.nombreConfirmado || lugar.nombre || "Lugar",
        tipo: lugar.tipo || "PUNTO_FRECUENTE"
      };
    }
  }
  return null;
}

export async function reconstruirViajesCamion(
  camionId: number,
  desde: Date,
  hasta: Date
): Promise<{ tieneGps: boolean; totalPuntos: number; viajes: ViajeReconstruido[] }> {

  const puntos = await db.select().from(geoPuntos)
    .where(and(
      eq(geoPuntos.camionId, camionId),
      gte(geoPuntos.timestampPunto, desde),
      lte(geoPuntos.timestampPunto, hasta),
      sql`${geoPuntos.lat} IS NOT NULL`,
      sql`${geoPuntos.lng} IS NOT NULL`
    ))
    .orderBy(asc(geoPuntos.timestampPunto));

  if (puntos.length === 0) {
    return { tieneGps: false, totalPuntos: 0, viajes: [] };
  }

  const pts: PuntoGPS[] = puntos.map(p => ({
    lat: parseFloat(p.lat as string),
    lng: parseFloat(p.lng as string),
    ts: new Date(p.timestampPunto),
    velocidadKmh: parseFloat(p.velocidadKmh as string) || 0,
    kmOdometro: p.kmOdometro ? parseFloat(p.kmOdometro as string) : null,
  }));

  const viajes = await detectarViajes(pts);

  const viajesFiltrados = viajes.filter(v =>
    v.kmGps > 30 &&
    v.duracionMinutos > 60 &&
    v.duracionMinutos < 7200 &&
    v.totalPuntos >= 5
  );

  for (const viaje of viajesFiltrados) {
    const lugarOrigen = await buscarLugarCercano(viaje.origenLat, viaje.origenLng);
    if (lugarOrigen) {
      viaje.origenNombre = lugarOrigen.nombre;
      viaje.origenLugarId = lugarOrigen.id;
    } else {
      viaje.origenNombre = await geocodificarPunto(viaje.origenLat, viaje.origenLng);
    }

    const lugarDestino = await buscarLugarCercano(viaje.destinoLat, viaje.destinoLng);
    if (lugarDestino) {
      viaje.destinoNombre = lugarDestino.nombre;
      viaje.destinoLugarId = lugarDestino.id;
    } else {
      viaje.destinoNombre = await geocodificarPunto(viaje.destinoLat, viaje.destinoLng);
    }

    for (const parada of viaje.paradas) {
      if (parada.minutos >= 60) {
        const lugarParada = await buscarLugarCercano(parada.lat, parada.lng);
        if (lugarParada) {
          parada.nombre = lugarParada.nombre;
          parada.tipo = lugarParada.tipo;
          parada.lugarId = lugarParada.id;
        } else {
          parada.nombre = await geocodificarPunto(parada.lat, parada.lng);
        }
      }
    }

    viaje.paradasLugares = viaje.paradas
      .filter(p => p.lugarId)
      .map(p => ({ lugarId: p.lugarId, nombre: p.nombre, minutos: p.minutos }));
  }

  return { tieneGps: true, totalPuntos: pts.length, viajes: viajesFiltrados };
}

async function cargarLugaresParaUmbral(): Promise<LugarCercanoParaUmbral[]> {
  try {
    const lugares = await db.select({
      tipo: geoLugares.tipo,
      lat: geoLugares.lat,
      lng: geoLugares.lng,
    })
    .from(geoLugares)
    .where(eq(geoLugares.activo, true));

    return lugares.map(l => ({
      tipo: l.tipo,
      lat: parseFloat(String(l.lat)),
      lng: parseFloat(String(l.lng)),
    }));
  } catch {
    return [];
  }
}

async function detectarViajes(pts: PuntoGPS[], contrato?: string): Promise<ViajeReconstruido[]> {
  if (pts.length < 5) return [];

  const lugaresRef = await cargarLugaresParaUmbral();

  const viajes: ViajeReconstruido[] = [];
  let viajeInicio: number | null = null;
  let detenidoDesde: number | null = null;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const enMovimiento = p.velocidadKmh > 5;

    if (viajeInicio === null) {
      if (enMovimiento) {
        const esPrimerPuntoDia = i === 0 ||
          (pts[i].ts.getDate() !== pts[i - 1].ts.getDate());

        let detenidoPrevio = false;
        if (i > 0) {
          let j = i - 1;
          while (j >= 0 && pts[j].velocidadKmh <= 5) j--;
          if (j < i - 1) {
            const minutosParado = (pts[i].ts.getTime() - pts[j + 1].ts.getTime()) / 60000;
            const umbralInicio = getUmbralParada(pts[j + 1].lat, pts[j + 1].lng, lugaresRef);
            detenidoPrevio = minutosParado >= umbralInicio;
          }
        }

        if (esPrimerPuntoDia || detenidoPrevio || i === 0) {
          viajeInicio = i;
          detenidoDesde = null;
        }
      }
      continue;
    }

    if (!enMovimiento) {
      if (detenidoDesde === null) detenidoDesde = i;
      const minutosDetenido = (p.ts.getTime() - pts[detenidoDesde].ts.getTime()) / 60000;

      const distOrigen = haversineKm(
        pts[viajeInicio].lat, pts[viajeInicio].lng,
        p.lat, p.lng
      );

      const sinPuntosFuturos = i === pts.length - 1 ||
        (i < pts.length - 1 && (pts[i + 1].ts.getTime() - p.ts.getTime()) > 4 * 3600000);

      const umbralFin = getUmbralParada(pts[detenidoDesde].lat, pts[detenidoDesde].lng, lugaresRef);

      if ((minutosDetenido >= umbralFin && distOrigen > 10) || sinPuntosFuturos) {
        const viaje = construirViaje(pts, viajeInicio, i);
        if (viaje) viajes.push(viaje);
        viajeInicio = null;
        detenidoDesde = null;
      }
    } else {
      detenidoDesde = null;
    }
  }

  if (viajeInicio !== null) {
    const viaje = construirViaje(pts, viajeInicio, pts.length - 1);
    if (viaje) viajes.push(viaje);
  }

  return viajes;
}

function construirViaje(pts: PuntoGPS[], inicio: number, fin: number): ViajeReconstruido | null {
  if (fin - inicio < 4) return null;

  const ptsViaje = pts.slice(inicio, fin + 1);
  let kmGps = 0;
  let velocidadMaxima = 0;
  let tiempoDetenido = 0;
  let tiempoMovimiento = 0;
  const paradas: ParadaDetectada[] = [];

  let detenidoDesdeIdx: number | null = null;

  for (let i = 1; i < ptsViaje.length; i++) {
    const prev = ptsViaje[i - 1];
    const curr = ptsViaje[i];
    const gapMin = (curr.ts.getTime() - prev.ts.getTime()) / 60000;

    if (curr.velocidadKmh > velocidadMaxima) velocidadMaxima = curr.velocidadKmh;

    if (curr.velocidadKmh > 5) {
      if (detenidoDesdeIdx !== null) {
        const minutosParada = (ptsViaje[i - 1].ts.getTime() - ptsViaje[detenidoDesdeIdx].ts.getTime()) / 60000;
        if (minutosParada >= 30) {
          const tipo = minutosParada >= 60 ? "PARADA_LARGA" : "PARADA";
          paradas.push({
            lat: ptsViaje[detenidoDesdeIdx].lat,
            lng: ptsViaje[detenidoDesdeIdx].lng,
            inicio: ptsViaje[detenidoDesdeIdx].ts,
            fin: ptsViaje[i - 1].ts,
            minutos: Math.round(minutosParada),
            nombre: "",
            tipo,
            lugarId: null,
          });
        }
        tiempoDetenido += minutosParada;
        detenidoDesdeIdx = null;
      }

      if (gapMin < 15) {
        kmGps += haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
      }
      tiempoMovimiento += gapMin;
    } else {
      if (detenidoDesdeIdx === null) detenidoDesdeIdx = i;
    }
  }

  if (detenidoDesdeIdx !== null) {
    const minutosParada = (ptsViaje[ptsViaje.length - 1].ts.getTime() - ptsViaje[detenidoDesdeIdx].ts.getTime()) / 60000;
    tiempoDetenido += minutosParada;
  }

  const duracionMinutos = Math.round((ptsViaje[ptsViaje.length - 1].ts.getTime() - ptsViaje[0].ts.getTime()) / 60000);
  const velocidadPromedio = duracionMinutos > 0 ? (kmGps / (duracionMinutos / 60)) : 0;

  const kmOdoInicio = ptsViaje[0].kmOdometro;
  const kmOdoFin = ptsViaje[ptsViaje.length - 1].kmOdometro;
  const kmOdoDelta = kmOdoInicio !== null && kmOdoFin !== null ? kmOdoFin - kmOdoInicio : null;

  return {
    origenLat: ptsViaje[0].lat,
    origenLng: ptsViaje[0].lng,
    origenNombre: "",
    origenTimestamp: ptsViaje[0].ts,
    origenLugarId: null,
    destinoLat: ptsViaje[ptsViaje.length - 1].lat,
    destinoLng: ptsViaje[ptsViaje.length - 1].lng,
    destinoNombre: "",
    destinoTimestamp: ptsViaje[ptsViaje.length - 1].ts,
    destinoLugarId: null,
    kmGps: Math.round(kmGps * 10) / 10,
    kmOdometroInicio: kmOdoInicio,
    kmOdometroFin: kmOdoFin,
    kmOdometroDelta: kmOdoDelta ? Math.round(kmOdoDelta * 10) / 10 : null,
    duracionMinutos,
    velocidadPromedio: Math.round(velocidadPromedio * 10) / 10,
    velocidadMaxima: Math.round(velocidadMaxima * 10) / 10,
    tiempoDetenidoMin: Math.round(tiempoDetenido),
    tiempoMovimientoMin: Math.round(tiempoMovimiento),
    paradas,
    paradasLugares: [],
    totalPuntos: ptsViaje.length,
  };
}

export async function guardarViajesReconstruidos(
  camionId: number,
  patente: string,
  viajes: ViajeReconstruido[]
): Promise<number> {
  let guardados = 0;

  for (const v of viajes) {
    const fechaViaje = v.origenTimestamp;
    const existing = await db.select({ id: geoViajes.id, kmGps: geoViajes.kmGps })
      .from(geoViajes)
      .where(and(
        eq(geoViajes.camionId, camionId),
        gte(geoViajes.origenTimestamp, new Date(fechaViaje.getTime() - 3600000)),
        lte(geoViajes.origenTimestamp, new Date(fechaViaje.getTime() + 3600000))
      ));

    const duplicado = existing.find(e => {
      const kmExist = parseFloat(e.kmGps as string) || 0;
      const delta = Math.abs(kmExist - v.kmGps) / Math.max(kmExist, v.kmGps, 1);
      return delta < 0.2;
    });

    if (duplicado) {
      await db.update(geoViajes)
        .set({
          origenLat: String(v.origenLat),
          origenLng: String(v.origenLng),
          origenNombre: v.origenNombre,
          origenTimestamp: v.origenTimestamp,
          origenLugarId: v.origenLugarId,
          destinoLat: String(v.destinoLat),
          destinoLng: String(v.destinoLng),
          destinoNombre: v.destinoNombre,
          destinoTimestamp: v.destinoTimestamp,
          destinoLugarId: v.destinoLugarId,
          kmGps: String(v.kmGps),
          kmOdometroInicio: v.kmOdometroInicio !== null ? String(v.kmOdometroInicio) : null,
          kmOdometroFin: v.kmOdometroFin !== null ? String(v.kmOdometroFin) : null,
          kmOdometroDelta: v.kmOdometroDelta !== null ? String(v.kmOdometroDelta) : null,
          duracionMinutos: v.duracionMinutos,
          velocidadPromedio: String(v.velocidadPromedio),
          velocidadMaxima: String(v.velocidadMaxima),
          tiempoDetenidoMin: v.tiempoDetenidoMin,
          tiempoMovimientoMin: v.tiempoMovimientoMin,
          paradas: v.paradas,
          paradasLugares: v.paradasLugares,
          actualizadoAt: new Date(),
        })
        .where(eq(geoViajes.id, duplicado.id));
    } else {
      await db.insert(geoViajes).values({
        camionId,
        patente,
        contrato: null,
        origenLat: String(v.origenLat),
        origenLng: String(v.origenLng),
        origenNombre: v.origenNombre,
        origenTimestamp: v.origenTimestamp,
        origenLugarId: v.origenLugarId,
        destinoLat: String(v.destinoLat),
        destinoLng: String(v.destinoLng),
        destinoNombre: v.destinoNombre,
        destinoTimestamp: v.destinoTimestamp,
        destinoLugarId: v.destinoLugarId,
        kmGps: String(v.kmGps),
        kmOdometroInicio: v.kmOdometroInicio !== null ? String(v.kmOdometroInicio) : null,
        kmOdometroFin: v.kmOdometroFin !== null ? String(v.kmOdometroFin) : null,
        kmOdometroDelta: v.kmOdometroDelta !== null ? String(v.kmOdometroDelta) : null,
        duracionMinutos: v.duracionMinutos,
        velocidadPromedio: String(v.velocidadPromedio),
        velocidadMaxima: String(v.velocidadMaxima),
        tiempoDetenidoMin: v.tiempoDetenidoMin,
        tiempoMovimientoMin: v.tiempoMovimientoMin,
        paradas: v.paradas,
        paradasLugares: v.paradasLugares,
        validacionEstado: "PENDIENTE",
      });
    }
    guardados++;
  }

  return guardados;
}

export async function obtenerHistorialCamion(patente: string, desde: Date, hasta: Date) {
  const [camion] = await db.select().from(camiones).where(eq(camiones.patente, patente)).limit(1);
  if (!camion) return null;

  const totalPuntos = await db.select({ count: sql<number>`count(*)::int` })
    .from(geoPuntos)
    .where(and(
      eq(geoPuntos.camionId, camion.id),
      gte(geoPuntos.timestampPunto, desde),
      lte(geoPuntos.timestampPunto, hasta)
    ));

  const puntosCount = totalPuntos[0]?.count || 0;

  let primerPunto: Date | null = null;
  let ultimoPunto: Date | null = null;
  if (puntosCount > 0) {
    const [first] = await db.select({ ts: geoPuntos.timestampPunto })
      .from(geoPuntos)
      .where(and(eq(geoPuntos.camionId, camion.id), gte(geoPuntos.timestampPunto, desde)))
      .orderBy(asc(geoPuntos.timestampPunto))
      .limit(1);
    const [last] = await db.select({ ts: geoPuntos.timestampPunto })
      .from(geoPuntos)
      .where(and(eq(geoPuntos.camionId, camion.id), lte(geoPuntos.timestampPunto, hasta)))
      .orderBy(desc(geoPuntos.timestampPunto))
      .limit(1);
    primerPunto = first?.ts || null;
    ultimoPunto = last?.ts || null;
  }

  let viajesDB = await db.select().from(geoViajes)
    .where(and(
      eq(geoViajes.camionId, camion.id),
      gte(geoViajes.origenTimestamp, desde),
      lte(geoViajes.origenTimestamp, hasta)
    ))
    .orderBy(desc(geoViajes.origenTimestamp));

  if (viajesDB.length === 0 && puntosCount > 0) {
    const result = await reconstruirViajesCamion(camion.id, desde, hasta);
    if (result.viajes.length > 0) {
      await guardarViajesReconstruidos(camion.id, camion.patente, result.viajes);
      viajesDB = await db.select().from(geoViajes)
        .where(and(
          eq(geoViajes.camionId, camion.id),
          gte(geoViajes.origenTimestamp, desde),
          lte(geoViajes.origenTimestamp, hasta)
        ))
        .orderBy(desc(geoViajes.origenTimestamp));
    }
  }

  let cargasSigetra: any[] = [];
  try {
    cargasSigetra = await db.select().from(cargas)
      .where(eq(cargas.camionId, camion.id));
  } catch {}

  const totalKmGps = viajesDB.reduce((sum, v) => sum + (parseFloat(v.kmGps as string) || 0), 0);
  const destinos = viajesDB.map(v => v.destinoNombre).filter(Boolean);
  const destinoFrecuencias = destinos.reduce((acc: Record<string, number>, d) => {
    acc[d!] = (acc[d!] || 0) + 1;
    return acc;
  }, {});
  const destinoMasFrecuente = Object.entries(destinoFrecuencias).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    camion: {
      id: camion.id,
      patente: camion.patente,
      modelo: camion.modelo,
      conductor: camion.conductor,
      contrato: null,
      tiene_gps: puntosCount > 0,
      total_puntos_gps: puntosCount,
      primer_punto: primerPunto,
      ultimo_punto: ultimoPunto,
    },
    viajes: viajesDB.map(v => ({
      id: v.id,
      fecha: v.origenTimestamp ? new Date(v.origenTimestamp).toISOString().split("T")[0] : null,
      origen_nombre: v.origenNombre,
      destino_nombre: v.destinoNombre,
      km_gps: parseFloat(v.kmGps as string) || 0,
      km_odometro: v.kmOdometroDelta ? parseFloat(v.kmOdometroDelta as string) : null,
      duracion_horas: v.duracionMinutos ? Math.round((v.duracionMinutos / 60) * 10) / 10 : 0,
      duracion_minutos: v.duracionMinutos || 0,
      velocidad_maxima: parseFloat(v.velocidadMaxima as string) || 0,
      velocidad_promedio: parseFloat(v.velocidadPromedio as string) || 0,
      tiempo_detenido_min: v.tiempoDetenidoMin || 0,
      paradas: v.paradas || [],
      validacion_estado: v.validacionEstado || "PENDIENTE",
      sigetra_match: v.sigetraCargaId ? {
        encontrado: true,
        litros: parseFloat(v.sigetraLitros as string) || 0,
        km_delta_pct: parseFloat(v.sigetraKmDeltaPct as string) || 0,
      } : { encontrado: false },
      origen_lat: parseFloat(v.origenLat as string),
      origen_lng: parseFloat(v.origenLng as string),
      destino_lat: parseFloat(v.destinoLat as string),
      destino_lng: parseFloat(v.destinoLng as string),
    })),
    sigetra: cargasSigetra.length > 0 ? {
      total_cargas: cargasSigetra.length,
      total_litros: cargasSigetra.reduce((s, c) => s + (c.litrosSurtidor || 0), 0),
      proveedores: [...new Set(cargasSigetra.map(c => c.proveedor).filter(Boolean))],
    } : null,
    resumen: {
      total_viajes: viajesDB.length,
      total_km_gps: Math.round(totalKmGps),
      km_promedio_por_viaje: viajesDB.length > 0 ? Math.round(totalKmGps / viajesDB.length) : 0,
      destino_mas_frecuente: destinoMasFrecuente,
      viajes_validados: viajesDB.filter(v => v.validacionEstado === "VALIDADO").length,
      viajes_anomalia: viajesDB.filter(v => v.validacionEstado === "ANOMALIA").length,
    },
    mensaje: puntosCount === 0 ? `Este camion no tiene registros GPS desde ${desde.toISOString().split("T")[0]}` : null,
  };
}

export async function procesarFlotaHistorico(
  desde: Date,
  patentes: string[],
  onProgress: (data: any) => void
) {
  const faenaId = await getCencosudFaenaId();
  const allCamiones = await db.select().from(camiones).where(eq(camiones.faenaId, faenaId));
  const hasta = new Date();

  const flotaFiltrada = patentes.length > 0
    ? allCamiones.filter(c => patentes.includes(c.patente))
    : allCamiones;

  let conGps = 0;
  let sinGps = 0;
  let totalViajes = 0;

  for (const cam of flotaFiltrada) {
    onProgress({
      patente: cam.patente,
      estado: "procesando",
      puntos: 0,
      viajes_detectados: 0,
    });

    const result = await reconstruirViajesCamion(cam.id, desde, hasta);

    if (!result.tieneGps) {
      sinGps++;
      onProgress({
        patente: cam.patente,
        estado: "sin_gps",
        puntos: 0,
        viajes_detectados: 0,
      });
      continue;
    }

    conGps++;
    let guardados = 0;
    if (result.viajes.length > 0) {
      guardados = await guardarViajesReconstruidos(cam.id, cam.patente, result.viajes);
    }
    totalViajes += guardados;

    onProgress({
      patente: cam.patente,
      estado: "listo",
      puntos: result.totalPuntos,
      viajes_detectados: guardados,
    });
  }

  onProgress({
    estado: "completo",
    total_camiones: flotaFiltrada.length,
    con_gps: conGps,
    sin_gps: sinGps,
    total_viajes: totalViajes,
  });
}

export async function obtenerResumenFlota(desde: Date) {
  const faenaId = await getCencosudFaenaId();
  const allCamiones = await db.select().from(camiones).where(eq(camiones.faenaId, faenaId));
  const hasta = new Date();

  const resumen = [];

  for (const cam of allCamiones) {
    const puntosResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(geoPuntos)
      .where(and(
        eq(geoPuntos.camionId, cam.id),
        gte(geoPuntos.timestampPunto, desde)
      ));
    const puntos = puntosResult[0]?.count || 0;

    const viajes = await db.select().from(geoViajes)
      .where(and(
        eq(geoViajes.camionId, cam.id),
        gte(geoViajes.origenTimestamp, desde),
        lte(geoViajes.origenTimestamp, hasta)
      ));

    const totalKm = viajes.reduce((s, v) => s + (parseFloat(v.kmGps as string) || 0), 0);
    const destinos = viajes.map(v => v.destinoNombre).filter(Boolean);
    const destinoFrec = destinos.reduce((acc: Record<string, number>, d) => {
      acc[d!] = (acc[d!] || 0) + 1;
      return acc;
    }, {});
    const topDestino = Object.entries(destinoFrec).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    let cargasSigetra = 0;
    let litrosSigetra = 0;
    try {
      const cResult = await db.select().from(cargas).where(eq(cargas.camionId, cam.id));
      cargasSigetra = cResult.length;
      litrosSigetra = cResult.reduce((s, c) => s + (c.litrosSurtidor || 0), 0);
    } catch {}

    resumen.push({
      patente: cam.patente,
      camionId: cam.id,
      conductor: cam.conductor,
      modelo: cam.modelo,
      tiene_gps: puntos > 0,
      puntos_gps: puntos,
      total_viajes: viajes.length,
      total_km: Math.round(totalKm),
      destino_top: topDestino,
      validados: viajes.filter(v => v.validacionEstado === "VALIDADO").length,
      anomalias: viajes.filter(v => v.validacionEstado === "ANOMALIA").length,
      sigetra_cargas: cargasSigetra,
      sigetra_litros: Math.round(litrosSigetra),
    });
  }

  const conGps = resumen.filter(r => r.tiene_gps).length;
  const sinGps = resumen.filter(r => !r.tiene_gps);
  const activos = resumen.filter(r => r.tiene_gps);
  const totalViajes = activos.reduce((s, r) => s + r.total_viajes, 0);
  const totalKm = activos.reduce((s, r) => s + r.total_km, 0);

  activos.sort((a, b) => b.total_viajes - a.total_viajes || b.puntos_gps - a.puntos_gps);

  return {
    kpis: {
      total_camiones: resumen.length,
      con_gps: conGps,
      sin_gps: sinGps.length,
      total_viajes: totalViajes,
      total_km: totalKm,
      ocultos_sin_gps: sinGps.length,
    },
    camiones: activos,
    camiones_sin_gps: sinGps.map(c => ({ patente: c.patente, camionId: c.camionId, modelo: c.modelo, conductor: c.conductor })),
  };
}
