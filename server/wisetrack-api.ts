import { pool } from "./db";
import https from "https";
import { parse as parseUrl } from "url";

const API_URL = "https://ei.wisetrack.cl/Sotraser/TelemetriaDetalle";

const vehiculoMap = new Map<string, { patente: string; grupo1: string; conductor: string }>();

function httpRequest(
  method: string,
  urlStr: string,
  body?: Record<string, string> | null,
  cookies?: string,
  headers?: Record<string, string>,
): Promise<{ data: string; status: number; cookies: string[]; headers: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const opts: any = parseUrl(urlStr);
    opts.method = method;
    opts.rejectAuthorized = false;
    opts.headers = {
      Cookie: cookies || "",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...headers,
    };
    let payload: string | undefined;
    if (body) {
      payload = new URLSearchParams(body).toString();
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.headers["Content-Length"] = Buffer.byteLength(payload).toString();
    }
    const agent = new https.Agent({ rejectUnauthorized: false });
    opts.agent = agent;
    const req = https.request(opts, (res: any) => {
      let data = "";
      res.on("data", (d: string) => (data += d));
      res.on("end", () =>
        resolve({
          data,
          status: res.statusCode,
          cookies: (res.headers["set-cookie"] || []).map((c: string) => c.split(";")[0]),
          headers: res.headers,
        })
      );
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("WiseTrack request timeout")); });
    if (payload) req.write(payload);
    req.end();
  });
}

export interface WTTelemetriaRecord {
  Id: number;
  Id_Energia: number;
  Id_Partida: number;
  Movil: string;
  Fecha_Hora: string;
  Lat: number;
  Lon: number;
  Direccion: number;
  Kms: number | null;
  Kms_Total: number | null;
  Horometro: number | null;
  Horometro2: number | null;
  NivelEstanque: number | null;
  ConsumoLitros_Conduccion: number | null;
  ConsumoLitros_Ralenti: number | null;
  ConsumoLitros_Crucero: number | null;
  ConsumoLitros_Total: number | null;
  Tiempo_Conduccion: number | null;
  Tiempo_Ralenti: number | null;
  Tiempo_Crucero: number | null;
  TempMotor: number | null;
  Velocidad: number | null;
  RPM: number | null;
  Torque: number | null;
  Presion_Aceite: number | null;
  Fecha_Insercion: string;
}

export async function fetchTelemetriaAPI(): Promise<WTTelemetriaRecord[]> {
  const token = process.env.WISETRACK_API_TOKEN;
  if (!token) throw new Error("WISETRACK_API_TOKEN not set");

  const resp = await httpRequest("GET", API_URL, null, undefined, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });

  if (resp.status !== 200) {
    throw new Error(`WiseTrack API error: HTTP ${resp.status}`);
  }

  if (!resp.data || resp.data.trim() === "") {
    return [];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(resp.data);
  } catch {
    throw new Error("WiseTrack API: unable to parse JSON response");
  }

  return parsed?.Telemetria?.Viajes || [];
}

function resolvePatente(movil: string): string | null {
  const cached = vehiculoMap.get(movil);
  if (cached) return cached.patente;
  return null;
}

/**
 * Bulk INSERT optimizado: una sola query con múltiples filas.
 * 10-50× más rápido que INSERT fila-por-fila.
 */
export async function saveTelemetria(records: WTTelemetriaRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  const valid = records.filter(r => r.Lat && r.Lon);
  if (valid.length === 0) return 0;

  const client = await pool.connect();
  try {
    // ── BULK INSERT 1: wisetrack_telemetria ──
    const telCols = 24;
    const telValues: any[] = [];
    const telPlaceholders: string[] = [];
    valid.forEach((r, i) => {
      const base = i * telCols;
      telPlaceholders.push(
        `(${Array.from({ length: telCols }, (_, k) => `$${base + k + 1}`).join(",")})`
      );
      telValues.push(
        r.Id, r.Movil, resolvePatente(r.Movil), r.Fecha_Hora, r.Lat, r.Lon,
        r.Direccion, r.Kms, r.Kms_Total, r.Horometro,
        r.NivelEstanque, r.ConsumoLitros_Conduccion, r.ConsumoLitros_Ralenti,
        r.ConsumoLitros_Total, r.Tiempo_Conduccion, r.Tiempo_Ralenti,
        r.TempMotor, r.Velocidad, r.RPM, r.Torque,
        r.Presion_Aceite, r.Id_Energia, r.Id_Partida, r.Fecha_Insercion,
      );
    });

    let savedTel = 0;
    try {
      const res = await client.query(
        `INSERT INTO wisetrack_telemetria
         (wt_id, movil, patente, fecha_hora, lat, lng, direccion, kms, kms_total,
          horometro, nivel_estanque, consumo_conduccion, consumo_ralenti, consumo_total,
          tiempo_conduccion, tiempo_ralenti, temp_motor, velocidad, rpm, torque,
          presion_aceite, id_energia, id_partida, fecha_insercion)
         VALUES ${telPlaceholders.join(",")}
         ON CONFLICT (wt_id) DO NOTHING`,
        telValues,
      );
      savedTel = res.rowCount || 0;
    } catch (e: any) {
      console.error(`[WISETRACK-SAVE] bulk telemetria error: ${e.message}`);
    }

    // ── BULK INSERT 2: wisetrack_posiciones (solo los que tienen patente) ──
    const validPos = valid.filter(r => resolvePatente(r.Movil));
    if (validPos.length > 0) {
      const posCols = 16;
      const posValues: any[] = [];
      const posPlaceholders: string[] = [];

      // dedupe in-batch por (patente, fecha) para evitar conflicts dentro de la misma query
      const seen = new Set<string>();
      const dedup = validPos.filter(r => {
        const key = `${resolvePatente(r.Movil)}|${r.Fecha_Hora}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      dedup.forEach((r, i) => {
        const base = i * posCols;
        posPlaceholders.push(
          `(${Array.from({ length: posCols }, (_, k) => `$${base + k + 1}`).join(",")})`
        );
        const patente = resolvePatente(r.Movil)!;
        const v = vehiculoMap.get(r.Movil);
        posValues.push(
          patente, r.Movil, r.Fecha_Hora, r.Lat, r.Lon,
          r.Velocidad || 0, r.Direccion || 0, true,
          v?.grupo1 || "",
          v?.conductor || "",
          r.Kms_Total, r.ConsumoLitros_Total,
          r.NivelEstanque, r.RPM, r.TempMotor, "",
        );
      });

      try {
        await client.query(
          `INSERT INTO wisetrack_posiciones
           (patente, etiqueta, fecha, lat, lng, velocidad, direccion, ignicion,
            grupo1, conductor, kms_total, consumo_litros, nivel_estanque,
            rpm, temp_motor, estado_operacion)
           VALUES ${posPlaceholders.join(",")}
           ON CONFLICT (patente, fecha) DO NOTHING`,
          posValues,
        );
      } catch (e: any) {
        console.error(`[WISETRACK-SAVE] bulk posiciones error: ${e.message}`);
      }
    }

    return savedTel;
  } finally {
    client.release();
  }
}

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS wisetrack_vehiculos (
        movil TEXT PRIMARY KEY,
        patente TEXT NOT NULL,
        grupo1 TEXT,
        grupo2 TEXT,
        conductor TEXT,
        actualizado_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS wisetrack_telemetria (
        id SERIAL PRIMARY KEY,
        wt_id INTEGER NOT NULL UNIQUE,
        movil TEXT NOT NULL,
        patente TEXT,
        fecha_hora TEXT NOT NULL,
        lat REAL, lng REAL,
        direccion INTEGER, kms REAL, kms_total REAL,
        horometro REAL, nivel_estanque REAL,
        consumo_conduccion REAL, consumo_ralenti REAL, consumo_total REAL,
        tiempo_conduccion INTEGER, tiempo_ralenti INTEGER,
        temp_motor REAL, velocidad REAL, rpm INTEGER,
        torque REAL, presion_aceite REAL,
        id_energia INTEGER, id_partida INTEGER,
        fecha_insercion TEXT,
        creado_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_wt_tel_movil ON wisetrack_telemetria (movil)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_wt_tel_fecha ON wisetrack_telemetria (fecha_hora)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS wisetrack_posiciones (
        id SERIAL PRIMARY KEY,
        patente TEXT NOT NULL,
        etiqueta TEXT,
        fecha TIMESTAMP NOT NULL,
        lat REAL, lng REAL,
        velocidad REAL DEFAULT 0,
        direccion INTEGER DEFAULT 0,
        ignicion BOOLEAN DEFAULT false,
        grupo1 TEXT DEFAULT '',
        conductor TEXT DEFAULT '',
        kms_total REAL,
        consumo_litros REAL,
        nivel_estanque REAL,
        rpm INTEGER,
        temp_motor REAL,
        estado_operacion TEXT DEFAULT '',
        creado_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(patente, fecha)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_wp_patente ON wisetrack_posiciones (patente)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_wp_fecha ON wisetrack_posiciones (fecha)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_wp_creado ON wisetrack_posiciones (creado_at)');

    // Estado persistente del sync (sobrevive a restarts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS wisetrack_sync_log (
        id SERIAL PRIMARY KEY,
        ts TIMESTAMP NOT NULL DEFAULT NOW(),
        records_fetched INTEGER NOT NULL DEFAULT 0,
        records_saved INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        newest_record_ts TIMESTAMP,
        mode TEXT NOT NULL DEFAULT 'realtime',
        error TEXT
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_wsl_ts ON wisetrack_sync_log (ts DESC)');
  } finally {
    client.release();
  }
}

async function loadVehiculoMapFromDB() {
  try {
    await ensureTables();
    const res = await pool.query("SELECT movil, patente, grupo1, conductor FROM wisetrack_vehiculos");
    for (const r of res.rows) {
      vehiculoMap.set(r.movil, { patente: r.patente, grupo1: r.grupo1 || "", conductor: r.conductor || "" });
    }
    console.log(`[WISETRACK] Vehicle map loaded: ${vehiculoMap.size} entries from DB`);
  } catch (err: any) {
    console.log("[WISETRACK] Vehicle map init error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SYNC ENGINE - Adaptive interval + watchdog + persistent state
// ═══════════════════════════════════════════════════════════════════

let apiInterval: NodeJS.Timeout | null = null;
let watchdogInterval: NodeJS.Timeout | null = null;
let lastApiSyncAt: Date | null = null;
let lastApiSyncCount = 0;
let lastApiSyncError: string | null = null;
let totalApiRecords = 0;
let lastNewestRecordAt: Date | null = null;
let currentIntervalMs = 30_000;
let syncInFlight = false;
let consecutiveErrors = 0;

const MIN_INTERVAL = 5_000;     // 5s cuando hay backlog
const MAX_INTERVAL = 60_000;    // 60s en steady-state
const TARGET_LAG_S = 90;        // queremos data ≤90s vieja
const WATCHDOG_STALL_MS = 3 * 60_000; // si no hay sync exitoso en 3min, alerta

export function getWiseTrackStatus() {
  const now = Date.now();
  const lagSec = lastNewestRecordAt
    ? Math.floor((now - lastNewestRecordAt.getTime()) / 1000)
    : null;
  const sinceSyncSec = lastApiSyncAt
    ? Math.floor((now - lastApiSyncAt.getTime()) / 1000)
    : null;
  return {
    api: {
      lastSyncAt: lastApiSyncAt,
      lastSyncCount: lastApiSyncCount,
      lastSyncError: lastApiSyncError,
      totalRecords: totalApiRecords,
    },
    vehiculoMapSize: vehiculoMap.size,
    lastSyncAt: lastApiSyncAt,
    lastSyncCount: lastApiSyncCount,
    lastSyncError: lastApiSyncError,
    // Nuevo: salud en tiempo real
    health: {
      lagSec,                       // antigüedad del último GPS recibido
      sinceLastSyncSec: sinceSyncSec,
      currentIntervalMs,
      consecutiveErrors,
      mode: bufferDrainMode ? "drain" : "realtime",
      ok: sinceSyncSec !== null && sinceSyncSec < 180 && consecutiveErrors < 5,
    },
  };
}

let bufferDrainMode = true;
let drainTotal = 0;

async function logSync(opts: {
  fetched: number; saved: number; latencyMs: number;
  newest: Date | null; mode: string; error: string | null;
}) {
  try {
    await pool.query(
      `INSERT INTO wisetrack_sync_log (records_fetched, records_saved, latency_ms, newest_record_ts, mode, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [opts.fetched, opts.saved, opts.latencyMs, opts.newest, opts.mode, opts.error],
    );
  } catch {
    // no bloquear el sync por fallo de logging
  }
}

function adaptInterval() {
  // si tenemos backlog (lag > target), aceleramos
  if (!lastNewestRecordAt) {
    currentIntervalMs = 15_000;
    return;
  }
  const lagSec = (Date.now() - lastNewestRecordAt.getTime()) / 1000;

  if (lagSec > 300) currentIntervalMs = MIN_INTERVAL;        // muy atrás: 5s
  else if (lagSec > 120) currentIntervalMs = 10_000;         // atrás: 10s
  else if (lagSec > TARGET_LAG_S) currentIntervalMs = 20_000; // ligero: 20s
  else currentIntervalMs = MAX_INTERVAL;                      // al día: 60s
}

async function doApiSync() {
  if (syncInFlight) return;
  syncInFlight = true;
  const t0 = Date.now();
  let fetched = 0;
  let saved = 0;
  let newest: Date | null = null;
  let mode = bufferDrainMode ? "drain" : "realtime";
  let errMsg: string | null = null;

  try {
    if (bufferDrainMode) {
      // En drain mode descartamos data >48h vieja, paramos al alcanzar presente.
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      let drained = 0;
      while (true) {
        const records = await fetchTelemetriaAPI();
        fetched += records.length;
        if (records.length === 0) {
          bufferDrainMode = false;
          mode = "realtime";
          console.log(`[WISETRACK-API] Buffer drenado: ${drainTotal} viejos descartados. Modo tiempo real activo.`);
          break;
        }
        const newestStr = records.reduce((max, r) => {
          const d = r.Fecha_Hora || "";
          return d > max ? d : max;
        }, "");
        const newestDate = new Date(newestStr.replace(" ", "T") + "-04:00");
        if (newestDate >= cutoff) {
          bufferDrainMode = false;
          mode = "realtime";
          saved += await saveTelemetria(records);
          newest = newestDate;
          console.log(`[WISETRACK-API] Buffer alcanzó presente. Descartados: ${drainTotal}. Guardados: ${saved}.`);
          break;
        }
        drained += records.length;
        drainTotal += records.length;
        if (drained % 10000 === 0 || drained <= 1000) {
          console.log(`[WISETRACK-API] Drenando: ${drainTotal} descartados | Fecha: ${newestStr}`);
        }
        if (drained >= 50000) break; // evita loop infinito en un solo ciclo
      }
    } else {
      const records = await fetchTelemetriaAPI();
      fetched = records.length;
      if (records.length > 0) {
        saved = await saveTelemetria(records);
        const newestStr = records.reduce((max, r) => {
          const d = r.Fecha_Hora || "";
          return d > max ? d : max;
        }, "");
        if (newestStr) newest = new Date(newestStr.replace(" ", "T") + "-04:00");
      }
    }

    if (newest) lastNewestRecordAt = newest;
    totalApiRecords += saved;
    lastApiSyncAt = new Date();
    lastApiSyncCount = fetched;
    lastApiSyncError = null;
    consecutiveErrors = 0;

    if (saved > 0 || fetched > 0) {
      const lag = lastNewestRecordAt
        ? Math.floor((Date.now() - lastNewestRecordAt.getTime()) / 1000)
        : -1;
      console.log(`[WISETRACK-API] sync: ${fetched} fetched / ${saved} saved | lag ${lag}s | next ${currentIntervalMs / 1000}s`);
    }
  } catch (err: any) {
    errMsg = err.message;
    lastApiSyncError = err.message;
    consecutiveErrors++;
    console.error(`[WISETRACK-API] Sync error #${consecutiveErrors}: ${err.message}`);
  } finally {
    syncInFlight = false;
    const latencyMs = Date.now() - t0;
    adaptInterval();
    rescheduleInterval();
    void logSync({ fetched, saved, latencyMs, newest, mode, error: errMsg });
  }
}

function rescheduleInterval() {
  if (apiInterval) {
    clearInterval(apiInterval);
  }
  apiInterval = setInterval(doApiSync, currentIntervalMs);
}

function startWatchdog() {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    const now = Date.now();
    const since = lastApiSyncAt ? now - lastApiSyncAt.getTime() : Infinity;
    if (since > WATCHDOG_STALL_MS) {
      console.error(`[WISETRACK-WATCHDOG] Sync detenido hace ${Math.floor(since / 1000)}s. Reactivando...`);
      // Forzar restart del interval
      if (apiInterval) clearInterval(apiInterval);
      apiInterval = null;
      currentIntervalMs = MIN_INTERVAL;
      rescheduleInterval();
      doApiSync();
    }
  }, 60_000); // chequea cada 60s
}

export function startWiseTrackSync(_apiIntervalMs = 60_000) {
  if (apiInterval) return;

  console.log(`[WISETRACK] Sync engine iniciando (adaptativo ${MIN_INTERVAL / 1000}s–${MAX_INTERVAL / 1000}s + watchdog)`);

  loadVehiculoMapFromDB().then(() => {
    doApiSync();
  });

  // Schedule inicial; doApiSync llamará rescheduleInterval con el intervalo adaptado
  apiInterval = setInterval(doApiSync, currentIntervalMs);
  startWatchdog();
}

export function stopWiseTrackSync() {
  if (apiInterval) {
    clearInterval(apiInterval);
    apiInterval = null;
  }
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

export interface SeguimientoVehicle {
  patente: string;
  etiqueta: string;
  lat: number;
  lng: number;
  velocidad: number;
  direccion: number;
  ignicion: boolean;
  grupo1: string;
  conductor: string;
  kmsTotal: number;
  consumoLitros: number;
  nivelEstanque: number;
  rpm: number;
  tempMotor: number;
  estadoOperacion: string;
  fecha: string;
  fechaInicioUltViaje: string | null;
  fechaFinUltViaje: string | null;
  kms: number;
  tiempoConduccion: number;
  tiempoRalenti: number;
}

export async function fetchSeguimiento(grupo?: string): Promise<SeguimientoVehicle[]> {
  const params: any[] = [];
  let whereClause = "WHERE creado_at > NOW() - INTERVAL '4 hours'";
  if (grupo) {
    params.push(grupo);
    whereClause += ` AND grupo1 = $${params.length}`;
  }
  const result = await pool.query(`
    SELECT DISTINCT ON (patente)
      patente, etiqueta, lat, lng, velocidad, direccion, ignicion,
      grupo1, conductor, kms_total, consumo_litros, nivel_estanque,
      rpm, temp_motor, estado_operacion, fecha
    FROM wisetrack_posiciones
    ${whereClause}
    ORDER BY patente, creado_at DESC
  `, params);

  return result.rows.map((r: any) => ({
    patente: r.patente || "",
    etiqueta: r.etiqueta || r.patente || "",
    lat: parseFloat(r.lat) || 0,
    lng: parseFloat(r.lng) || 0,
    velocidad: parseFloat(r.velocidad) || 0,
    direccion: parseInt(r.direccion) || 0,
    ignicion: !!r.ignicion,
    grupo1: r.grupo1 || "",
    conductor: r.conductor || "",
    kmsTotal: parseFloat(r.kms_total) || 0,
    consumoLitros: parseFloat(r.consumo_litros) || 0,
    nivelEstanque: parseFloat(r.nivel_estanque) || 0,
    rpm: parseInt(r.rpm) || 0,
    tempMotor: parseFloat(r.temp_motor) || 0,
    estadoOperacion: r.estado_operacion || "Sin Lectura",
    fecha: r.fecha instanceof Date ? r.fecha.toISOString().replace("T", " ").substring(0, 19) : (r.fecha || ""),
    fechaInicioUltViaje: null,
    fechaFinUltViaje: null,
    kms: 0,
    tiempoConduccion: 0,
    tiempoRalenti: 0,
  }));
}
