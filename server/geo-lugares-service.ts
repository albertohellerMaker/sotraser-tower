import { db, DATA_START, getDefaultDesde } from "./db";
import { geoLugares, geoVisitas, geoPuntos, geoViajes, camiones } from "@shared/schema";
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

const CENCOSUD_BRANDS = [
  { pattern: /jumbo/i, tipo: "LOCAL_JUMBO", confianza: 90 },
  { pattern: /santa\s*isabel/i, tipo: "LOCAL_SANTA_ISABEL", confianza: 90 },
  { pattern: /easy/i, tipo: "LOCAL_EASY", confianza: 85 },
  { pattern: /paris/i, tipo: "LOCAL_PARIS", confianza: 85 },
  { pattern: /johnson/i, tipo: "LOCAL_PARIS", confianza: 85 },
  { pattern: /cencosud/i, tipo: "LOCAL_CENCOSUD", confianza: 85 },
];

async function queryOverpass(lat: number, lng: number): Promise<{ name: string; tipo: string; confianza: number } | null> {
  const query = `[out:json];(node["name"~"Jumbo|Santa Isabel|Cencosud|Easy|Paris|Johnson|Disco",i](around:500,${lat},${lng});way["name"~"Jumbo|Santa Isabel|Cencosud|Easy|Paris|Johnson|Disco",i](around:500,${lat},${lng}););out body;`;
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "GEOVALIDATOR-Sotraser/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!data.elements || data.elements.length === 0) return null;

    for (const el of data.elements) {
      const name = el.tags?.name || "";
      for (const brand of CENCOSUD_BRANDS) {
        if (brand.pattern.test(name)) {
          return { name, tipo: brand.tipo, confianza: brand.confianza };
        }
      }
    }
    return null;
  } catch (e) {
    console.log("[geo-lugares] Overpass error:", (e as Error).message);
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<{ display: string; road: string; city: string; region: string; comuna: string }> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`, {
      headers: { "User-Agent": "GEOVALIDATOR-Sotraser/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return {
      display: data.display_name?.split(",").slice(0, 3).join(",").trim() || "",
      road: data.address?.road || "",
      city: data.address?.city || data.address?.town || data.address?.village || "",
      region: data.address?.state || "",
      comuna: data.address?.suburb || data.address?.city_district || data.address?.town || "",
    };
  } catch {
    return { display: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, road: "", city: "", region: "", comuna: "" };
  }
}

export async function detectarLugar(lat: number, lng: number, minutosDetenido: number): Promise<{ lugarId: number; nombre: string; tipo: string; nuevo: boolean }> {
  const allLugares = await db.select().from(geoLugares).where(eq(geoLugares.activo, true));

  for (const lugar of allLugares) {
    const dist = haversineKm(lat, lng, parseFloat(lugar.lat), parseFloat(lugar.lng));
    const radioKm = (lugar.radioMetros || 500) / 1000;
    if (dist <= radioKm) {
      await db.update(geoLugares).set({
        vecesVisitado: (lugar.vecesVisitado || 0) + 1,
        ultimaVisita: new Date().toISOString().split("T")[0],
      }).where(eq(geoLugares.id, lugar.id));
      return { lugarId: lugar.id, nombre: lugar.nombreConfirmado || lugar.nombre || "Sin nombre", tipo: lugar.tipo || "OTRO", nuevo: false };
    }
  }

  const geo = await reverseGeocode(lat, lng);

  await new Promise(r => setTimeout(r, 1200));

  const osm = await queryOverpass(lat, lng);

  let tipo = "PUNTO_FRECUENTE";
  let nombre = `Punto frecuente · ${geo.city || geo.comuna}${geo.road ? ", " + geo.road : ""}`;
  let confianza = 50;
  let detectadoVia = "COMPORTAMIENTO";

  if (osm) {
    tipo = osm.tipo;
    nombre = `${osm.name} · ${geo.city || geo.comuna}`;
    confianza = osm.confianza;
    detectadoVia = "OSM";
  } else if (minutosDetenido < 120) {
    tipo = "PUNTO_FRECUENTE";
    confianza = 40;
  }

  const [inserted] = await db.insert(geoLugares).values({
    nombre,
    tipo,
    lat: String(lat),
    lng: String(lng),
    radioMetros: 500,
    direccion: geo.display,
    comuna: geo.comuna,
    region: geo.region,
    detectadoVia,
    confianzaPct: confianza,
    vecesVisitado: 1,
    primeraVisita: new Date().toISOString().split("T")[0],
    ultimaVisita: new Date().toISOString().split("T")[0],
    confirmado: false,
    activo: true,
  }).returning();

  return { lugarId: inserted.id, nombre, tipo, nuevo: true };
}

export async function registrarVisita(params: {
  lugarId: number;
  camionId: number;
  patente: string;
  viajeId?: number;
  llegada: Date;
  salida?: Date;
  minutosDetenido: number;
  lat: number;
  lng: number;
}) {
  await db.insert(geoVisitas).values({
    lugarId: params.lugarId,
    camionId: params.camionId,
    patente: params.patente,
    viajeId: params.viajeId || null,
    llegada: params.llegada,
    salida: params.salida || null,
    minutosDetenido: params.minutosDetenido,
    latExacta: String(params.lat),
    lngExacta: String(params.lng),
  });
}

interface ProgressCallback {
  (msg: { paso: string; progreso: number; total: number; detalles?: string }): void;
}

export async function analizarHistoricoCompleto(onProgress?: ProgressCallback) {
  const faenaId = await getCencosudFaenaId();
  const cencosudCamiones = await db.select().from(camiones).where(eq(camiones.faenaId, faenaId));
  const total = cencosudCamiones.length;
  let lugaresDetectados = 0;
  let viajesReconstruidos = 0;
  let puntosAnalizados = 0;

  for (let i = 0; i < cencosudCamiones.length; i++) {
    const cam = cencosudCamiones[i];
    onProgress?.({
      paso: `Procesando ${cam.patente}`,
      progreso: i + 1,
      total,
      detalles: `Camion ${i + 1}/${total}`,
    });

    const puntos = await db.select().from(geoPuntos)
      .where(and(
        eq(geoPuntos.camionId, cam.id),
        gte(geoPuntos.timestampPunto, DATA_START),
      ))
      .orderBy(asc(geoPuntos.timestampPunto));

    puntosAnalizados += puntos.length;
    if (puntos.length === 0) continue;

    const paradas = detectarParadasConsecutivas(puntos, cam.id, cam.patente);

    for (const parada of paradas) {
      if (parada.minutosDetenido >= 60) {
        try {
          const result = await detectarLugar(parada.lat, parada.lng, parada.minutosDetenido);
          if (result.nuevo) lugaresDetectados++;

          await registrarVisita({
            lugarId: result.lugarId,
            camionId: cam.id,
            patente: cam.patente,
            llegada: parada.inicio,
            salida: parada.fin,
            minutosDetenido: parada.minutosDetenido,
            lat: parada.lat,
            lng: parada.lng,
          });

          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.log(`[geo-lugares] Error detectando lugar para ${cam.patente}:`, (e as Error).message);
        }
      }
    }
  }

  onProgress?.({
    paso: "Completado",
    progreso: total,
    total,
    detalles: `Lugares detectados: ${lugaresDetectados} · Puntos analizados: ${puntosAnalizados}`,
  });

  return { lugaresDetectados, viajesReconstruidos, puntosAnalizados, camionesAnalizados: total };
}

interface Parada {
  lat: number;
  lng: number;
  inicio: Date;
  fin: Date;
  minutosDetenido: number;
  puntoCount: number;
}

function detectarParadasConsecutivas(
  puntos: any[],
  camionId: number,
  patente: string,
): Parada[] {
  const paradas: Parada[] = [];
  if (puntos.length === 0) return paradas;

  let grupoInicio = 0;
  let grupoLats: number[] = [];
  let grupoLngs: number[] = [];

  for (let i = 0; i < puntos.length; i++) {
    const vel = parseFloat(puntos[i].velocidadKmh || "0");
    const lat = parseFloat(puntos[i].lat);
    const lng = parseFloat(puntos[i].lng);

    if (vel < 5) {
      if (grupoLats.length === 0) grupoInicio = i;
      grupoLats.push(lat);
      grupoLngs.push(lng);
    } else {
      if (grupoLats.length >= 2) {
        const centroLat = grupoLats.reduce((a, b) => a + b, 0) / grupoLats.length;
        const centroLng = grupoLngs.reduce((a, b) => a + b, 0) / grupoLngs.length;

        const spread = Math.max(
          ...grupoLats.map(l => haversineKm(l, centroLng, centroLat, centroLng))
        );

        if (spread < 0.3) {
          const inicio = new Date(puntos[grupoInicio].timestampPunto);
          const fin = new Date(puntos[i - 1].timestampPunto);
          const minutosDetenido = Math.round((fin.getTime() - inicio.getTime()) / 60000);

          if (minutosDetenido >= 30) {
            paradas.push({
              lat: centroLat,
              lng: centroLng,
              inicio,
              fin,
              minutosDetenido,
              puntoCount: grupoLats.length,
            });
          }
        }
      }
      grupoLats = [];
      grupoLngs = [];
    }
  }

  if (grupoLats.length >= 2) {
    const centroLat = grupoLats.reduce((a, b) => a + b, 0) / grupoLats.length;
    const centroLng = grupoLngs.reduce((a, b) => a + b, 0) / grupoLngs.length;
    const inicio = new Date(puntos[grupoInicio].timestampPunto);
    const fin = new Date(puntos[puntos.length - 1].timestampPunto);
    const minutosDetenido = Math.round((fin.getTime() - inicio.getTime()) / 60000);
    if (minutosDetenido >= 30) {
      paradas.push({ lat: centroLat, lng: centroLng, inicio, fin, minutosDetenido, puntoCount: grupoLats.length });
    }
  }

  return paradas;
}

export async function generarAnalisisIA(): Promise<{ resumen: string; datos: any }> {
  const faenaId = await getCencosudFaenaId();
  const cencosudCamiones = await db.select().from(camiones).where(eq(camiones.faenaId, faenaId));
  const camionIds = cencosudCamiones.map(c => c.id);

  const lugares = await db.select().from(geoLugares).where(eq(geoLugares.activo, true));
  const viajes = await db.select().from(geoViajes).where(gte(geoViajes.creadoAt, DATA_START));
  const cencosudViajes = viajes.filter(v => camionIds.includes(v.camionId || 0));

  const visitas = await db.select().from(geoVisitas);
  const cencosudVisitas = visitas.filter(v => camionIds.includes(v.camionId || 0));

  const lugarStats = lugares.map(l => ({
    nombre: l.nombreConfirmado || l.nombre,
    tipo: l.tipo,
    vecesVisitado: l.vecesVisitado,
    caminonesDistintos: new Set(cencosudVisitas.filter(v => v.lugarId === l.id).map(v => v.camionId)).size,
    tiempoPromedioMin: Math.round(
      cencosudVisitas.filter(v => v.lugarId === l.id).reduce((s, v) => s + (v.minutosDetenido || 0), 0) /
      Math.max(1, cencosudVisitas.filter(v => v.lugarId === l.id).length)
    ),
  })).filter(l => (l.vecesVisitado || 0) > 0).sort((a, b) => (b.vecesVisitado || 0) - (a.vecesVisitado || 0));

  const anomaliasKm = cencosudViajes
    .filter(v => v.sigetraKmDeltaPct && Math.abs(parseFloat(v.sigetraKmDeltaPct)) > 10)
    .map(v => ({
      patente: v.patente,
      fecha: v.origenTimestamp,
      kmGps: v.kmGps,
      deltaPct: v.sigetraKmDeltaPct,
    }));

  const validacionResumen = {
    total: cencosudViajes.length,
    validados: cencosudViajes.filter(v => v.validacionEstado === "VALIDADO").length,
    revisar: cencosudViajes.filter(v => v.validacionEstado === "REVISAR").length,
    anomalia: cencosudViajes.filter(v => v.validacionEstado === "ANOMALIA").length,
    pendiente: cencosudViajes.filter(v => v.validacionEstado === "PENDIENTE").length,
  };

  const datos = {
    periodo: "01-03-2026 a hoy",
    camionesAnalizados: cencosudCamiones.length,
    totalViajes: cencosudViajes.length,
    totalKmGps: Math.round(cencosudViajes.reduce((s, v) => s + (parseFloat(v.kmGps || "0") || 0), 0)),
    lugaresDetectados: lugarStats.slice(0, 15),
    anomaliasKm: anomaliasKm.slice(0, 10),
    lugaresTotal: lugares.length,
    lugaresSinIdentificar: lugares.filter(l => l.tipo === "PUNTO_FRECUENTE" && !l.confirmado).length,
    validacionResumen,
  };

  const prompt = `Eres analista de operaciones de SOTRASER, empresa de transporte para CENCOSUD en Chile. Analiza estos datos de movimiento GPS de la flota desde 01-03-2026:
${JSON.stringify(datos, null, 2)}

Genera analisis en espanol con estas secciones:

PATRONES DE RUTA:
Que rutas se repiten mas? Hay patrones claros de dias y horarios?

LOCALES CENCOSUD DETECTADOS:
Que locales/CDs visitan con mas frecuencia? Hay alguno que recibe mas visitas de lo esperado?

TIEMPOS DE PERMANENCIA:
Hay locales donde los camiones pasan demasiado tiempo? Cual es el tiempo normal?

ANOMALIAS DETECTADAS:
Hay viajes con km muy distintos entre GPS y Sigetra? Hay patrones sospechosos?

RECOMENDACIONES:
3 acciones concretas para optimizar la operacion basadas en los datos.

Maximo 5 parrafos totales. Sin markdown. Solo texto directo con los titulos indicados.`;

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const resumen = (response.content[0] as any).text || "";

  await db.insert(geoAnalisisIa).values({
    tipo: "LUGARES",
    periodoDesde: DATA_START.toISOString().slice(0,10),
    periodoHasta: new Date().toISOString().split("T")[0],
    resultadoJson: datos,
    resumenTexto: resumen,
  });

  return { resumen, datos };
}
