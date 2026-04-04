import { pool } from "./db";
import { CONTRATOS_VOLVO_ACTIVOS } from "./faena-filter";
import { resolverGeocerca, resolverNombreViaje } from "./geocerca-inteligente";

interface LugarConocido {
  nombre: string;
  lat: number;
  lng: number;
  tipo: "base" | "descarga" | "carga" | "estacion" | "mina" | "puerto" | "cd";
  radio_km: number;
  contratos?: string[];
}

// Radio: 1km (1000m) para faenas normales, 3km para mineras
const LUGARES_CONOCIDOS: LugarConocido[] = [
  { nombre: "Base Sotraser Quilicura", lat: -33.3840, lng: -70.7520, tipo: "base", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "CD Cencosud Lo Espejo", lat: -33.4600, lng: -70.8800, tipo: "cd", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "CD Cencosud Maipu", lat: -33.4400, lng: -70.7900, tipo: "cd", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Los Angeles", lat: -37.5200, lng: -72.6400, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Sector Temuco", lat: -38.5000, lng: -72.4500, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Valdivia / Osorno", lat: -39.6100, lng: -72.9500, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Chillan / Linares", lat: -36.6900, lng: -72.2500, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Antofagasta / Mejillones", lat: -23.6100, lng: -70.2600, tipo: "descarga", radio_km: 1 },
  { nombre: "La Serena", lat: -30.4800, lng: -71.4800, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Estacion Quilicura", lat: -33.3583, lng: -70.7250, tipo: "estacion", radio_km: 1 },
  { nombre: "Estacion Lampa", lat: -33.2480, lng: -70.7170, tipo: "estacion", radio_km: 1 },
  { nombre: "Estacion Renca", lat: -33.3890, lng: -70.6650, tipo: "estacion", radio_km: 1 },
  { nombre: "Estacion Los Angeles", lat: -37.4695, lng: -72.3538, tipo: "estacion", radio_km: 1 },
  { nombre: "Villa Alegre / Linares Sur", lat: -35.8400, lng: -71.6900, tipo: "estacion", radio_km: 1 },
  { nombre: "Sector Lampa Norte", lat: -33.1500, lng: -70.6600, tipo: "descarga", radio_km: 1 },
  { nombre: "Collipulli / Victoria", lat: -37.7400, lng: -72.2400, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Angol / Renaico", lat: -37.5679, lng: -72.2915, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Copiapo", lat: -27.6876, lng: -70.4809, tipo: "descarga", radio_km: 1 },
  { nombre: "Vallenar", lat: -28.5999, lng: -70.7739, tipo: "descarga", radio_km: 1 },
  { nombre: "Ovalle / Illapel", lat: -31.8997, lng: -71.4892, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Puerto Montt", lat: -41.4700, lng: -72.9400, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Osorno Centro", lat: -40.5700, lng: -73.1000, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Valdivia", lat: -39.8134, lng: -73.2300, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Panguipulli / Lago Ranco", lat: -39.5171, lng: -72.8233, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Villarrica / Pucon", lat: -39.2700, lng: -72.2300, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Sector Padre Hurtado", lat: -33.4063, lng: -70.7279, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Sector San Bernardo", lat: -33.4261, lng: -70.8178, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Rancagua / Graneros", lat: -34.0490, lng: -70.7343, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Freire / Pitrufquen", lat: -38.7461, lng: -72.6086, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Sector Lautaro", lat: -38.4085, lng: -72.3937, tipo: "descarga", radio_km: 1, contratos: ["CENCOSUD"] },
  { nombre: "Chillan Viejo", lat: -36.8000, lng: -72.3263, tipo: "descarga", radio_km: 5, contratos: ["CENCOSUD"] },
  { nombre: "Rio Bueno", lat: -40.2932, lng: -73.0730, tipo: "descarga", radio_km: 5, contratos: ["CENCOSUD"] },
  { nombre: "Coquimbo / Tongoy", lat: -31.6956, lng: -71.5233, tipo: "descarga", radio_km: 6, contratos: ["CENCOSUD"] },
  { nombre: "Los Vilos / Pichidangui", lat: -32.0861, lng: -71.5136, tipo: "descarga", radio_km: 6, contratos: ["CENCOSUD"] },
  { nombre: "Sector Batuco", lat: -33.1441, lng: -70.8034, tipo: "descarga", radio_km: 4, contratos: ["CENCOSUD"] },
  { nombre: "Curacavi / Casablanca", lat: -33.3500, lng: -71.1000, tipo: "descarga", radio_km: 5, contratos: ["CENCOSUD"] },
  { nombre: "Rancagua Centro", lat: -33.9948, lng: -70.7014, tipo: "descarga", radio_km: 3, contratos: ["CENCOSUD"] },
  { nombre: "Loncoche / Gorbea", lat: -39.7918, lng: -72.9015, tipo: "descarga", radio_km: 5, contratos: ["CENCOSUD"] },
  { nombre: "Nueva Imperial", lat: -38.7149, lng: -72.5331, tipo: "descarga", radio_km: 4, contratos: ["CENCOSUD"] },
  { nombre: "Quillota / La Cruz", lat: -32.8800, lng: -71.2500, tipo: "descarga", radio_km: 5 },
];

// Cache geocercas from DB (refreshed every 5 min)
let _geocercasCache: LugarConocido[] = [];
let _geocercasCacheTs = 0;

async function cargarGeocercasOperacionales(): Promise<LugarConocido[]> {
  if (Date.now() - _geocercasCacheTs < 5 * 60 * 1000 && _geocercasCache.length > 0) return _geocercasCache;
  try {
    const r = await pool.query(`SELECT nombre, lat, lng, radio_metros, tipo, contrato FROM geocercas_operacionales WHERE activa = true AND confianza IN ('ALTA', 'MEDIA') ORDER BY confirmada DESC, camiones_frecuentes DESC`);
    _geocercasCache = r.rows.map((g: any) => ({
      nombre: g.nombre, lat: g.lat, lng: g.lng, tipo: (g.tipo || "general").toLowerCase() as any,
      radio_km: (g.radio_metros || 1000) / 1000, contratos: g.contrato ? [g.contrato] : undefined,
    }));
    // Also include hardcoded as fallback
    for (const lc of LUGARES_CONOCIDOS) {
      if (!_geocercasCache.some(g => haversineKm(g.lat, g.lng, lc.lat, lc.lng) < 0.5)) {
        _geocercasCache.push(lc);
      }
    }
    _geocercasCacheTs = Date.now();
    console.log(`[GEOCERCAS] Cache actualizado: ${_geocercasCache.length} geocercas operacionales`);
  } catch (e) {
    // Fallback to hardcoded
    if (_geocercasCache.length === 0) _geocercasCache = [...LUGARES_CONOCIDOS];
  }
  return _geocercasCache;
}

// Init cache on module load
cargarGeocercasOperacionales();

// Sync version for backward compat — uses cache + fallback to nearest
export function buscarLugarCercano(lat: number, lng: number, contrato?: string): LugarConocido | null {
  const lugares = _geocercasCache.length > 0 ? _geocercasCache : LUGARES_CONOCIDOS;

  // NIVEL 5 — exact match ≤5m
  let best5m: LugarConocido | null = null;
  let bestDist5m = Infinity;
  for (const lugar of lugares) {
    const dist = haversineKm(lat, lng, lugar.lat, lugar.lng);
    if (dist <= 0.005 && dist < bestDist5m) { best5m = lugar; bestDist5m = dist; }
  }
  if (best5m) return best5m;

  // NIVEL 1 — inside base radius
  for (const lugar of lugares) {
    if (contrato && lugar.contratos && !lugar.contratos.includes(contrato) && !lugar.contratos.includes("TODOS")) continue;
    const dist = haversineKm(lat, lng, lugar.lat, lugar.lng);
    if (dist <= lugar.radio_km) return lugar;
  }

  // NIVEL 2 — exact point 50m
  let best50: LugarConocido | null = null;
  let bestDist50 = Infinity;
  for (const lugar of lugares) {
    const dist = haversineKm(lat, lng, lugar.lat, lugar.lng);
    if (dist <= 0.05 && dist < bestDist50) { best50 = lugar; bestDist50 = dist; }
  }
  if (best50) return best50;

  // NIVEL 3 — associate nearest <10km
  let closest: LugarConocido | null = null;
  let closestDist = Infinity;
  for (const lugar of lugares) {
    const dist = haversineKm(lat, lng, lugar.lat, lugar.lng);
    if (dist < closestDist) { closest = lugar; closestDist = dist; }
  }
  if (closest && closestDist <= 10) {
    return { ...closest, nombre: closest.nombre + ` (${Math.round(closestDist * 1000)}m)` };
  }

  // NIVEL 4 — unknown
  return null;
}

// Async version with full 5-level system (for new code)
export async function buscarLugarInteligente(lat: number, lng: number, minutosDetenido: number = 0, contrato?: string): Promise<string> {
  return resolverNombreViaje(lat, lng, minutosDetenido, contrato);
}

export { LUGARES_CONOCIDOS, cargarGeocercasOperacionales };

interface SyncProgress {
  status: "idle" | "running" | "done" | "error";
  totalCamiones: number;
  procesados: number;
  viajesCreados: number;
  errores: string[];
  inicioAt: string | null;
  finAt: string | null;
}

let syncProgress: SyncProgress = {
  status: "idle",
  totalCamiones: 0,
  procesados: 0,
  viajesCreados: 0,
  errores: [],
  inicioAt: null,
  finAt: null,
};

export function getSyncProgress(): SyncProgress {
  return { ...syncProgress };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export async function syncViajesHistorico(diasAtras: number = 90): Promise<SyncProgress> {
  if (syncProgress.status === "running") {
    return syncProgress;
  }

  syncProgress = {
    status: "running",
    totalCamiones: 0,
    procesados: 0,
    viajesCreados: 0,
    errores: [],
    inicioAt: new Date().toISOString(),
    finAt: null,
  };

  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasAtras);
    const desdeStr = desde.toISOString().split("T")[0];
    const hastaStr = new Date().toISOString().split("T")[0];

    const faenaPlaceholders = CONTRATOS_VOLVO_ACTIVOS.map((_, i) => `$${i + 1}`).join(",");
    const camionesResult = await pool.query(`
      SELECT c.id, c.patente, c.vin, f.nombre as faena_nombre
      FROM camiones c
      JOIN faenas f ON c.faena_id = f.id
      WHERE c.vin IS NOT NULL AND c.vin != ''
        AND f.nombre IN (${faenaPlaceholders})
    `, CONTRATOS_VOLVO_ACTIVOS);
    const camiones = camionesResult.rows;
    syncProgress.totalCamiones = camiones.length;
    console.log(`[viajes-hist] Iniciando sync historico: ${camiones.length} camiones (solo CENCOSUD), desde ${desdeStr}`);

    const snapsResult = await pool.query(`
      SELECT vin, total_fuel_used, total_distance, captured_at
      FROM volvo_fuel_snapshots
      WHERE captured_at >= $1
      ORDER BY vin, captured_at
    `, [desdeStr]);

    const snapsByVin = new Map<string, any[]>();
    for (const snap of snapsResult.rows) {
      if (!snapsByVin.has(snap.vin)) snapsByVin.set(snap.vin, []);
      snapsByVin.get(snap.vin)!.push(snap);
    }

    let sigetraData: any[] = [];
    try {
      sigetraData = [];
    } catch (err: any) {
      console.error("[viajes-hist] Error cargando Sigetra:", err.message);
      syncProgress.errores.push("Error cargando datos Sigetra: " + err.message);
    }

    const numVehToPatente = new Map<string, string>();
    const allCamResult = await pool.query(`SELECT patente, num_veh FROM camiones WHERE num_veh IS NOT NULL`);
    for (const row of allCamResult.rows) {
      numVehToPatente.set(String(row.num_veh), row.patente);
    }

    const sigetraByPatente = new Map<string, any[]>();
    for (const carga of sigetraData) {
      const numVeh = String(carga.numVeh || "");
      const pat = carga.patente || numVehToPatente.get(numVeh) || numVeh;
      if (!sigetraByPatente.has(pat)) sigetraByPatente.set(pat, []);
      sigetraByPatente.get(pat)!.push(carga);
    }

    const geoResult = await pool.query(`
      SELECT camion_id, lat, lng, timestamp_punto, velocidad_kmh, km_odometro
      FROM geo_puntos
      WHERE timestamp_punto >= $1
      ORDER BY camion_id, timestamp_punto
    `, [desde]);

    const geoByCamion = new Map<number, any[]>();
    for (const p of geoResult.rows) {
      if (!geoByCamion.has(p.camion_id)) geoByCamion.set(p.camion_id, []);
      geoByCamion.get(p.camion_id)!.push(p);
    }

    for (const cam of camiones) {
      try {
        const snaps = snapsByVin.get(cam.vin) || [];
        if (snaps.length < 2) {
          syncProgress.procesados++;
          continue;
        }

        const viajes = buildViajesFromSnapshots(cam, snaps, sigetraByPatente.get(cam.patente) || [], geoByCamion.get(cam.id) || []);

        for (const viaje of viajes) {
          if (viaje.contrato === "CENCOSUD") continue;
          const result = await pool.query(`
            INSERT INTO viajes_aprendizaje (
              camion_id, vin, contrato, fecha_inicio, fecha_fin,
              origen_lat, origen_lng, origen_nombre,
              destino_lat, destino_lng, destino_nombre,
              km_ecu, km_declarado_sigetra,
              litros_consumidos_ecu, litros_cargados_sigetra,
              rendimiento_real, conductor, paradas,
              score_anomalia, estado, duracion_minutos,
              velocidad_promedio, velocidad_maxima, fuente_viaje
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8,
              $9, $10, $11,
              $12, $13,
              $14, $15,
              $16, $17, $18,
              $19, $20, $21,
              $22, $23, $24
            )
            ON CONFLICT (camion_id, fecha_inicio) DO NOTHING
          `, [
            cam.id, cam.vin, viaje.contrato, viaje.fechaInicio, viaje.fechaFin,
            viaje.origenLat, viaje.origenLng, viaje.origenNombre,
            viaje.destinoLat, viaje.destinoLng, viaje.destinoNombre,
            viaje.kmEcu, viaje.kmDeclaradoSigetra,
            viaje.litrosConsumidosEcu, viaje.litrosCargadosSigetra,
            viaje.rendimientoReal, viaje.conductor, JSON.stringify(viaje.paradas),
            viaje.scoreAnomalia, viaje.estado, viaje.duracionMinutos,
            viaje.velocidadPromedio, viaje.velocidadMaxima, "VOLVO_ECU",
          ]);

          if (result.rowCount && result.rowCount > 0) syncProgress.viajesCreados++;
        }

        syncProgress.procesados++;
        if (syncProgress.procesados % 20 === 0) {
          console.log(`[viajes-hist] Progreso: ${syncProgress.procesados}/${syncProgress.totalCamiones} camiones, ${syncProgress.viajesCreados} viajes creados`);
        }
      } catch (err: any) {
        syncProgress.errores.push(`${cam.patente}: ${err.message}`);
        syncProgress.procesados++;
      }
    }

    syncProgress.status = "done";
    syncProgress.finAt = new Date().toISOString();
    console.log(`[viajes-hist] Sync completo: ${syncProgress.viajesCreados} viajes creados de ${syncProgress.totalCamiones} camiones`);
  } catch (err: any) {
    syncProgress.status = "error";
    syncProgress.errores.push(err.message);
    syncProgress.finAt = new Date().toISOString();
    console.error("[viajes-hist] Error global:", err.message);
  }

  return syncProgress;
}

interface ViajeBuilt {
  contrato: string;
  fechaInicio: Date;
  fechaFin: Date;
  origenLat: number | null;
  origenLng: number | null;
  origenNombre: string | null;
  destinoLat: number | null;
  destinoLng: number | null;
  destinoNombre: string | null;
  kmEcu: number;
  kmDeclaradoSigetra: number;
  litrosConsumidosEcu: number;
  litrosCargadosSigetra: number;
  rendimientoReal: number | null;
  conductor: string | null;
  paradas: any[];
  scoreAnomalia: number;
  estado: string;
  duracionMinutos: number;
  velocidadPromedio: number | null;
  velocidadMaxima: number | null;
}

interface CorredorCluster {
  contrato: string;
  origenLat: number;
  origenLng: number;
  destinoLat: number;
  destinoLng: number;
  origenNombre: string;
  destinoNombre: string;
  viajes: Array<{ rendimiento: number; km: number; duracionMin: number }>;
  camiones: Set<string>;
}

const CLUSTER_RADIUS_KM_DEFAULT = 1; // 1km = 1000m default
const MIN_VIAJES_CORREDOR = 5;

// Faenas mineras con radio extendido (zonas remotas, accesos largos)
const FAENAS_MINERAS = ["ZALDIVAR", "GLENCORE", "CODELCO", "CENTINELA", "MANTOS COPPER", "SIERRA ATACAMA", "MINISTRO HALES"];

function esFaenaMinera(contrato: string): boolean {
  if (!contrato) return false;
  const c = contrato.toUpperCase();
  return FAENAS_MINERAS.some(f => c.includes(f));
}

function getClusterRadius(kmViaje: number, contrato: string): number {
  // Faenas mineras — radios amplios (zonas remotas, caminos largos a faena)
  if (esFaenaMinera(contrato)) {
    if (kmViaje < 100) return 5;
    if (kmViaje < 300) return 8;
    return 8;
  }
  // Todas las demás faenas — radio estándar 1km (1000m)
  return 1;
}

export async function clusterizarCorredores(): Promise<{ total: number; nuevos: number; actualizados: number }> {
  console.log("[corredores] Iniciando clusterizacion de corredores...");

  const fp = CONTRATOS_VOLVO_ACTIVOS.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(`
    SELECT va.id, va.contrato, va.origen_lat, va.origen_lng, va.destino_lat, va.destino_lng,
           va.km_ecu, va.litros_consumidos_ecu, va.rendimiento_real, va.duracion_minutos,
           c.patente
    FROM viajes_aprendizaje va
    JOIN camiones c ON va.camion_id = c.id
    WHERE va.contrato IN (${fp})
      AND va.origen_lat IS NOT NULL AND va.destino_lat IS NOT NULL
      AND va.km_ecu > 20 AND va.rendimiento_real > 0 AND va.rendimiento_real < 20
  `, CONTRATOS_VOLVO_ACTIVOS);

  const clusters = new Map<string, CorredorCluster>();

  for (const v of result.rows) {
    const oLat = parseFloat(v.origen_lat);
    const oLng = parseFloat(v.origen_lng);
    const dLat = parseFloat(v.destino_lat);
    const dLng = parseFloat(v.destino_lng);
    if (isNaN(oLat) || isNaN(dLat)) continue;

    let matched = false;
    for (const [key, corr] of clusters) {
      if (corr.contrato !== v.contrato) continue;
      const dOrigen = haversineKm(corr.origenLat, corr.origenLng, oLat, oLng);
      const dDestino = haversineKm(corr.destinoLat, corr.destinoLng, dLat, dLng);
      const radio = getClusterRadius(parseFloat(v.km_ecu) || 0, v.contrato || "");
      if (dOrigen <= radio && dDestino <= radio) {
        corr.viajes.push({
          rendimiento: parseFloat(v.rendimiento_real) || 0,
          km: parseFloat(v.km_ecu) || 0,
          duracionMin: parseInt(v.duracion_minutos) || 0,
        });
        corr.camiones.add(v.patente);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const oNombre = buscarLugarCercano(oLat, oLng, v.contrato)?.nombre || `${oLat.toFixed(2)}, ${oLng.toFixed(2)}`;
      const dNombre = buscarLugarCercano(dLat, dLng, v.contrato)?.nombre || `${dLat.toFixed(2)}, ${dLng.toFixed(2)}`;
      const key = `${v.contrato}-${oLat.toFixed(2)}_${oLng.toFixed(2)}_${dLat.toFixed(2)}_${dLng.toFixed(2)}`;
      clusters.set(key, {
        contrato: v.contrato,
        origenLat: oLat,
        origenLng: oLng,
        destinoLat: dLat,
        destinoLng: dLng,
        origenNombre: oNombre,
        destinoNombre: dNombre,
        viajes: [{
          rendimiento: parseFloat(v.rendimiento_real) || 0,
          km: parseFloat(v.km_ecu) || 0,
          duracionMin: parseInt(v.duracion_minutos) || 0,
        }],
        camiones: new Set([v.patente]),
      });
    }
  }

  let nuevos = 0;
  let actualizados = 0;

  for (const [, corr] of clusters) {
    if (corr.viajes.length < MIN_VIAJES_CORREDOR) continue;

    const rendimientos = corr.viajes.map(v => v.rendimiento).filter(r => r > 0);
    const kms = corr.viajes.map(v => v.km);
    const duraciones = corr.viajes.map(v => v.duracionMin).filter(d => d > 0);

    const rendPromedio = rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length;
    const rendDesviacion = Math.sqrt(rendimientos.reduce((sum, r) => sum + (r - rendPromedio) ** 2, 0) / rendimientos.length);
    const kmPromedio = kms.reduce((a, b) => a + b, 0) / kms.length;
    const durPromedio = duraciones.length > 0 ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null;
    const nombre = `${corr.origenNombre} → ${corr.destinoNombre}`;

    const existing = await pool.query(`
      SELECT id FROM corredores
      WHERE contrato = $1
        AND ABS(origen_lat::float - $2) < 0.1
        AND ABS(origen_lng::float - $3) < 0.1
        AND ABS(destino_lat::float - $4) < 0.1
        AND ABS(destino_lng::float - $5) < 0.1
      LIMIT 1
    `, [corr.contrato, corr.origenLat, corr.origenLng, corr.destinoLat, corr.destinoLng]);

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE corredores SET
          rendimiento_promedio = $1, rendimiento_desviacion = $2,
          km_promedio = $3, duracion_promedio_min = $4,
          total_viajes_base = $5, actualizado_at = NOW(), nombre = $6
        WHERE id = $7
      `, [
        Math.round(rendPromedio * 100) / 100,
        Math.round(rendDesviacion * 100) / 100,
        Math.round(kmPromedio * 10) / 10,
        durPromedio,
        corr.viajes.length,
        nombre,
        existing.rows[0].id,
      ]);
      actualizados++;
    } else {
      await pool.query(`
        INSERT INTO corredores (
          nombre, contrato, origen_nombre, destino_nombre,
          origen_lat, origen_lng, destino_lat, destino_lng,
          radio_tolerancia_km, rendimiento_promedio, rendimiento_desviacion,
          km_promedio, duracion_promedio_min, total_viajes_base
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        nombre, corr.contrato, corr.origenNombre, corr.destinoNombre,
        corr.origenLat, corr.origenLng, corr.destinoLat, corr.destinoLng,
        getClusterRadius(kmPromedio, corr.contrato),
        Math.round(rendPromedio * 100) / 100,
        Math.round(rendDesviacion * 100) / 100,
        Math.round(kmPromedio * 10) / 10,
        durPromedio,
        corr.viajes.length,
      ]);
      nuevos++;
    }
  }

  const corredoresDB = await pool.query(`SELECT id, contrato, origen_lat, origen_lng, destino_lat, destino_lng, radio_tolerancia_km FROM corredores WHERE activo = true`);
  let asignados = 0;
  for (const corr of corredoresDB.rows) {
    const radio = parseFloat(corr.radio_tolerancia_km) || CLUSTER_RADIUS_KM_DEFAULT;
    const updated = await pool.query(`
      UPDATE viajes_aprendizaje SET corredor_id = $1
      WHERE contrato = $2 AND corredor_id IS NULL
        AND origen_lat IS NOT NULL AND destino_lat IS NOT NULL
        AND ABS(origen_lat::float - $3) < $5 / 111.0
        AND ABS(origen_lng::float - $4) < $5 / 111.0
        AND ABS(destino_lat::float - $6) < $5 / 111.0
        AND ABS(destino_lng::float - $7) < $5 / 111.0
    `, [corr.id, corr.contrato, parseFloat(corr.origen_lat), parseFloat(corr.origen_lng), radio, parseFloat(corr.destino_lat), parseFloat(corr.destino_lng)]);
    asignados += updated.rowCount || 0;
  }

  console.log(`[corredores] Resultado: ${nuevos} nuevos, ${actualizados} actualizados, ${asignados} viajes asignados`);
  return { total: nuevos + actualizados, nuevos, actualizados };
}

export async function recalcularScoresConCorredor(): Promise<{ recalculados: number }> {
  console.log("[scoring] Recalculando scores con baseline de corredor...");

  const corredoresDB = await pool.query(`
    SELECT id, rendimiento_promedio, rendimiento_desviacion, km_promedio
    FROM corredores WHERE activo = true AND total_viajes_base >= ${MIN_VIAJES_CORREDOR}
  `);

  const corredorMap = new Map<number, { rendProm: number; rendDesv: number; kmProm: number }>();
  for (const c of corredoresDB.rows) {
    corredorMap.set(c.id, {
      rendProm: parseFloat(c.rendimiento_promedio) || 0,
      rendDesv: parseFloat(c.rendimiento_desviacion) || 0.5,
      kmProm: parseFloat(c.km_promedio) || 0,
    });
  }

  const contratosAvg = await pool.query(`
    SELECT contrato, AVG(rendimiento_real::float) as rend_avg
    FROM viajes_aprendizaje
    WHERE rendimiento_real > 0 AND rendimiento_real < 20
    GROUP BY contrato
  `);
  const contratoFallback = new Map<string, number>();
  for (const r of contratosAvg.rows) {
    contratoFallback.set(r.contrato, r.rend_avg);
  }

  const fp = CONTRATOS_VOLVO_ACTIVOS.map((_, i) => `$${i + 1}`).join(",");
  const viajes = await pool.query(`
    SELECT id, corredor_id, contrato, rendimiento_real, velocidad_maxima, km_ecu, duracion_minutos, score_anomalia, estado
    FROM viajes_aprendizaje
    WHERE contrato IN (${fp}) AND rendimiento_real > 0
  `, CONTRATOS_VOLVO_ACTIVOS);

  let recalculados = 0;
  for (const v of viajes.rows) {
    const rend = parseFloat(v.rendimiento_real) || 0;
    const velMax = parseFloat(v.velocidad_maxima) || 0;
    let score = 0;

    if (v.corredor_id && corredorMap.has(v.corredor_id)) {
      const corr = corredorMap.get(v.corredor_id)!;
      const desv = corr.rendDesv > 0 ? corr.rendDesv : 0.5;
      const zScore = (corr.rendProm - rend) / desv;

      if (zScore >= 3.0) score += 45;
      else if (zScore >= 2.0) score += 30;
      else if (zScore >= 1.5) score += 15;
      else if (zScore >= 1.0) score += 5;
    } else {
      const fallbackAvg = contratoFallback.get(v.contrato) || 3.0;
      const ratio = rend / fallbackAvg;
      if (ratio < 0.5) score += 40;
      else if (ratio < 0.65) score += 25;
      else if (ratio < 0.8) score += 10;
    }

    if (velMax > 105) score += 10;
    else if (velMax > 100) score += 5;

    score = Math.min(score, 100);
    const estado = score >= 50 ? "ANOMALIA" : score >= 20 ? "REVISAR" : "NORMAL";

    if (score !== (parseInt(v.score_anomalia) || 0)) {
      await pool.query(`UPDATE viajes_aprendizaje SET score_anomalia = $1, estado = $2 WHERE id = $3`, [score, estado, v.id]);
      recalculados++;
    }
  }

  console.log(`[scoring] ${recalculados} viajes recalculados con scoring de corredor`);
  return { recalculados };
}

export async function getCorredoresStats() {
  const fp = CONTRATOS_VOLVO_ACTIVOS.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(`
    SELECT c.id, c.nombre, c.contrato, c.origen_nombre, c.destino_nombre,
           c.rendimiento_promedio, c.rendimiento_desviacion,
           c.km_promedio, c.duracion_promedio_min, c.total_viajes_base,
           c.origen_lat, c.origen_lng, c.destino_lat, c.destino_lng,
           (SELECT COUNT(DISTINCT camion_id) FROM viajes_aprendizaje WHERE corredor_id = c.id) as camiones_unicos
    FROM corredores c
    WHERE c.activo = true AND c.contrato IN (${fp})
    ORDER BY c.total_viajes_base DESC
  `, CONTRATOS_VOLVO_ACTIVOS);

  return result.rows.map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    contrato: c.contrato,
    origenNombre: c.origen_nombre,
    destinoNombre: c.destino_nombre,
    rendimientoPromedio: parseFloat(c.rendimiento_promedio) || 0,
    rendimientoDesviacion: parseFloat(c.rendimiento_desviacion) || 0,
    kmPromedio: parseFloat(c.km_promedio) || 0,
    duracionPromedioMin: parseInt(c.duracion_promedio_min) || 0,
    totalViajes: parseInt(c.total_viajes_base) || 0,
    camionesUnicos: parseInt(c.camiones_unicos) || 0,
  }));
}

function buildViajesFromSnapshots(
  cam: any,
  snaps: any[],
  _sigetraCargas: any[],
  geoPuntos: any[]
): ViajeBuilt[] {
  const rawViajes: Array<{
    fechaInicio: Date;
    fechaFin: Date;
    litrosEcu: number;
    kmEcu: number;
    rendimiento: number;
    duracionMin: number;
  }> = [];

  const MIN_KM_SEGMENT = 2;
  const MAX_GAP_HOURS = 4;
  const MIN_TRIP_KM = 20;

  let tripStart: any = null;
  let tripEnd: any = null;

  function flushTrip() {
    if (!tripStart || !tripEnd || tripStart === tripEnd) return;
    const fuelS = tripStart.total_fuel_used;
    const fuelE = tripEnd.total_fuel_used;
    const distS = tripStart.total_distance;
    const distE = tripEnd.total_distance;
    if (fuelS == null || fuelE == null || distS == null || distE == null) return;
    const litrosEcu = (fuelE - fuelS) / 1000;
    const kmEcu = (distE - distS) / 1000;
    if (kmEcu < MIN_TRIP_KM || litrosEcu <= 0) return;
    if (kmEcu > 2500) return;
    const rendimiento = kmEcu / litrosEcu;
    if (rendimiento > 6 || rendimiento < 0.5) return;
    const fechaInicio = new Date(tripStart.captured_at);
    const fechaFin = new Date(tripEnd.captured_at);
    rawViajes.push({
      fechaInicio,
      fechaFin,
      litrosEcu,
      kmEcu,
      rendimiento,
      duracionMin: Math.round((fechaFin.getTime() - fechaInicio.getTime()) / 60000),
    });
  }

  for (let i = 0; i < snaps.length - 1; i++) {
    const snapA = snaps[i];
    const snapB = snaps[i + 1];
    if (snapA.total_distance == null || snapB.total_distance == null ||
        snapA.total_fuel_used == null || snapB.total_fuel_used == null) {
      flushTrip();
      tripStart = null;
      tripEnd = null;
      continue;
    }

    const deltaKm = (snapB.total_distance - snapA.total_distance) / 1000;
    const gapHours = (new Date(snapB.captured_at).getTime() - new Date(snapA.captured_at).getTime()) / 3600000;

    const continuityGap = tripEnd
      ? (new Date(snapA.captured_at).getTime() - new Date(tripEnd.captured_at).getTime()) / 3600000
      : 0;

    const isMoving = deltaKm >= MIN_KM_SEGMENT;
    const gapTooLong = gapHours > MAX_GAP_HOURS || continuityGap > MAX_GAP_HOURS;

    if (isMoving && !gapTooLong) {
      if (!tripStart) tripStart = snapA;
      tripEnd = snapB;
    } else {
      flushTrip();
      tripStart = null;
      tripEnd = null;
    }
  }
  flushTrip();

  const viajes: ViajeBuilt[] = [];

  for (const rv of rawViajes) {
    const puntosViaje = geoPuntos.filter(p => {
      const t = new Date(p.timestamp_punto);
      return t >= rv.fechaInicio && t <= rv.fechaFin;
    });

    let origenLat: number | null = null;
    let origenLng: number | null = null;
    let destinoLat: number | null = null;
    let destinoLng: number | null = null;
    let velMax = 0;
    let velSum = 0;
    let velCount = 0;

    if (puntosViaje.length > 0) {
      origenLat = parseFloat(puntosViaje[0].lat);
      origenLng = parseFloat(puntosViaje[0].lng);
      destinoLat = parseFloat(puntosViaje[puntosViaje.length - 1].lat);
      destinoLng = parseFloat(puntosViaje[puntosViaje.length - 1].lng);
      for (const p of puntosViaje) {
        const vel = parseFloat(p.velocidad_kmh || 0);
        if (vel > velMax) velMax = vel;
        if (vel > 0) { velSum += vel; velCount++; }
      }
    }

    let scoreAnomalia = 0;
    let estado = "NORMAL";

    if (rv.rendimiento < 1.5) { scoreAnomalia += 40; }
    else if (rv.rendimiento < 2.0) { scoreAnomalia += 25; }
    else if (rv.rendimiento < 2.5) { scoreAnomalia += 10; }

    

    if (velMax > 105) { scoreAnomalia += 10; }

    if (scoreAnomalia >= 50) estado = "ANOMALIA";
    else if (scoreAnomalia >= 20) estado = "REVISAR";

    viajes.push({
      contrato: cam.faena_nombre,
      fechaInicio: rv.fechaInicio,
      fechaFin: rv.fechaFin,
      origenLat,
      origenLng,
      origenNombre: origenLat && origenLng ? (buscarLugarCercano(origenLat, origenLng, cam.faena_nombre)?.nombre || null) : null,
      destinoLat,
      destinoLng,
      destinoNombre: destinoLat && destinoLng ? (buscarLugarCercano(destinoLat, destinoLng, cam.faena_nombre)?.nombre || null) : null,
      kmEcu: Math.round(rv.kmEcu * 10) / 10,
      kmDeclaradoSigetra: 0,
      litrosConsumidosEcu: Math.round(rv.litrosEcu * 100) / 100,
      litrosCargadosSigetra: 0,
      rendimientoReal: Math.round(rv.rendimiento * 100) / 100,
      conductor: null,
      paradas: [],
      scoreAnomalia: Math.min(scoreAnomalia, 100),
      estado,
      duracionMinutos: rv.duracionMin,
      velocidadPromedio: velCount > 0 ? Math.round(velSum / velCount * 10) / 10 : null,
      velocidadMaxima: velMax > 0 ? Math.round(velMax * 10) / 10 : null,
    });
  }

  return viajes;
}

export async function getViajesStats() {
  const fp = CONTRATOS_VOLVO_ACTIVOS.map((_, i) => `$${i + 1}`).join(",");
  const params = CONTRATOS_VOLVO_ACTIVOS;
  const whereActive = `WHERE contrato IN (${fp})`;
  const totalResult = await pool.query(`SELECT COUNT(*) as cnt FROM viajes_aprendizaje ${whereActive}`, params);
  const byEstado = await pool.query(`
    SELECT estado, COUNT(*) as cnt FROM viajes_aprendizaje ${whereActive} GROUP BY estado ORDER BY cnt DESC
  `, params);
  const byContrato = await pool.query(`
    SELECT contrato, COUNT(*) as cnt, 
           AVG(rendimiento_real::float) as rend_avg,
           AVG(km_ecu::float) as km_avg,
           AVG(litros_consumidos_ecu::float) as litros_avg
    FROM viajes_aprendizaje 
    ${whereActive}
    GROUP BY contrato ORDER BY cnt DESC
  `, params);
  const totalCamiones = await pool.query(`SELECT COUNT(DISTINCT camion_id) as cnt FROM viajes_aprendizaje ${whereActive}`, params);
  const anomalias = await pool.query(`
    SELECT va.id, c.patente, va.contrato, va.fecha_inicio, va.fecha_fin,
           va.km_ecu, va.litros_consumidos_ecu, va.litros_cargados_sigetra,
           va.rendimiento_real, va.score_anomalia, va.estado, va.conductor,
           va.origen_nombre, va.destino_nombre, va.corredor_id,
           va.sigetra_cruzado, va.delta_cuadratura,
           cor.nombre as corredor_nombre, cor.rendimiento_promedio as corredor_rend_promedio,
           cor.rendimiento_desviacion as corredor_rend_desv
    FROM viajes_aprendizaje va
    JOIN camiones c ON va.camion_id = c.id
    LEFT JOIN corredores cor ON va.corredor_id = cor.id
    WHERE va.contrato IN (${fp}) AND va.score_anomalia >= 20
    ORDER BY va.score_anomalia DESC
    LIMIT 50
  `, params);

  const cuadraturaR = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE sigetra_cruzado = true)::int as cruzados,
      COUNT(*) FILTER (WHERE sigetra_cruzado = false)::int as pendientes,
      COUNT(*) FILTER (WHERE delta_cuadratura IS NOT NULL AND delta_cuadratura > 15)::int as desvios
    FROM viajes_aprendizaje ${whereActive}
  `, params);
  const fechas = await pool.query(`
    SELECT MIN(fecha_inicio) as desde, MAX(fecha_fin) as hasta FROM viajes_aprendizaje ${whereActive}
  `, params);

  const corredoresCount = await pool.query(`SELECT COUNT(*) as cnt FROM corredores WHERE activo = true`);
  const viajesConCorredor = await pool.query(`SELECT COUNT(*) as cnt FROM viajes_aprendizaje ${whereActive} AND corredor_id IS NOT NULL`, params);

  const cuadData = cuadraturaR.rows[0] || {};

  return {
    totalViajes: parseInt(totalResult.rows[0]?.cnt) || 0,
    totalCamiones: parseInt(totalCamiones.rows[0]?.cnt) || 0,
    totalCorredores: parseInt(corredoresCount.rows[0]?.cnt) || 0,
    viajesConCorredor: parseInt(viajesConCorredor.rows[0]?.cnt) || 0,
    desde: fechas.rows[0]?.desde,
    hasta: fechas.rows[0]?.hasta,
    cuadratura: {
      cruzados: parseInt(cuadData.cruzados) || 0,
      pendientes: parseInt(cuadData.pendientes) || 0,
      desvios: parseInt(cuadData.desvios) || 0,
    },
    porEstado: byEstado.rows.map((r: any) => ({ estado: r.estado, count: parseInt(r.cnt) })),
    porContrato: byContrato.rows.map((r: any) => ({
      contrato: r.contrato,
      count: parseInt(r.cnt),
      rendimientoAvg: r.rend_avg ? Math.round(r.rend_avg * 100) / 100 : null,
      kmAvg: r.km_avg ? Math.round(r.km_avg * 10) / 10 : null,
      litrosAvg: r.litros_avg ? Math.round(r.litros_avg * 100) / 100 : null,
    })),
    anomalias: anomalias.rows,
  };
}
