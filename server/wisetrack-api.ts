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

export interface SaveResult {
  saved: number;        // filas insertadas en wisetrack_telemetria
  attempted: number;    // filas válidas que intentamos guardar
  failed: number;       // filas perdidas por errores de DB (no por conflict)
  failedBatches: number;
}

const BATCH_SIZE = 400; // 400 × 24 cols = 9,600 params (lejos del límite 65k de Postgres)

async function insertChunk(
  client: any,
  table: "telemetria" | "posiciones",
  rows: any[][],
  cols: string[],
  conflictClause: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const colCount = cols.length;
  const placeholders = rows.map((_, i) =>
    `(${Array.from({ length: colCount }, (_, k) => `$${i * colCount + k + 1}`).join(",")})`
  ).join(",");
  const flat = rows.flat();
  const sql = `INSERT INTO wisetrack_${table} (${cols.join(",")}) VALUES ${placeholders} ${conflictClause}`;
  const res = await client.query(sql, flat);
  return res.rowCount || 0;
}

async function insertWithFallback(
  client: any,
  table: "telemetria" | "posiciones",
  rows: any[][],
  cols: string[],
  conflictClause: string,
): Promise<{ saved: number; failed: number; failedBatches: number }> {
  if (rows.length === 0) return { saved: 0, failed: 0, failedBatches: 0 };
  let saved = 0;
  let failed = 0;
  let failedBatches = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    try {
      saved += await insertChunk(client, table, chunk, cols, conflictClause);
    } catch (e: any) {
      // Bisecar: si el chunk falla, reintentamos en pedazos más pequeños hasta aislar la fila mala
      console.error(`[WISETRACK-SAVE] bulk ${table} chunk ${chunk.length} falló: ${e.message}. Bisectando...`);
      failedBatches++;
      const result = await bisectInsert(client, table, chunk, cols, conflictClause);
      saved += result.saved;
      failed += result.failed;
    }
  }
  return { saved, failed, failedBatches };
}

async function bisectInsert(
  client: any,
  table: "telemetria" | "posiciones",
  rows: any[][],
  cols: string[],
  conflictClause: string,
): Promise<{ saved: number; failed: number }> {
  if (rows.length === 0) return { saved: 0, failed: 0 };
  if (rows.length === 1) {
    try {
      const n = await insertChunk(client, table, rows, cols, conflictClause);
      return { saved: n, failed: 0 };
    } catch (e: any) {
      console.error(`[WISETRACK-SAVE] fila descartada en ${table}: ${e.message}`);
      return { saved: 0, failed: 1 };
    }
  }
  const mid = Math.floor(rows.length / 2);
  const a = await bisectInsert(client, table, rows.slice(0, mid), cols, conflictClause);
  const b = await bisectInsert(client, table, rows.slice(mid), cols, conflictClause);
  return { saved: a.saved + b.saved, failed: a.failed + b.failed };
}

/**
 * Bulk INSERT con chunking de 400 filas + bisect-on-error.
 * Reporta saved/failed/failedBatches para señalización honesta de salud.
 */
export async function saveTelemetria(records: WTTelemetriaRecord[]): Promise<SaveResult> {
  if (records.length === 0) return { saved: 0, attempted: 0, failed: 0, failedBatches: 0 };

  const valid = records.filter(r => r.Lat && r.Lon);
  if (valid.length === 0) return { saved: 0, attempted: 0, failed: 0, failedBatches: 0 };

  const client = await pool.connect();
  try {
    // ── BULK INSERT 1: wisetrack_telemetria ──
    const telCols = [
      "wt_id", "movil", "patente", "fecha_hora", "lat", "lng", "direccion", "kms", "kms_total",
      "horometro", "nivel_estanque", "consumo_conduccion", "consumo_ralenti", "consumo_total",
      "tiempo_conduccion", "tiempo_ralenti", "temp_motor", "velocidad", "rpm", "torque",
      "presion_aceite", "id_energia", "id_partida", "fecha_insercion",
    ];
    const telRows = valid.map(r => [
      r.Id, r.Movil, resolvePatente(r.Movil), r.Fecha_Hora, r.Lat, r.Lon,
      r.Direccion, r.Kms, r.Kms_Total, r.Horometro,
      r.NivelEstanque, r.ConsumoLitros_Conduccion, r.ConsumoLitros_Ralenti,
      r.ConsumoLitros_Total, r.Tiempo_Conduccion, r.Tiempo_Ralenti,
      r.TempMotor, r.Velocidad, r.RPM, r.Torque,
      r.Presion_Aceite, r.Id_Energia, r.Id_Partida, r.Fecha_Insercion,
    ]);
    const telRes = await insertWithFallback(client, "telemetria", telRows, telCols, "ON CONFLICT (wt_id) DO NOTHING");

    // ── BULK INSERT 2: wisetrack_posiciones (dedup intra-batch) ──
    const posCols = [
      "patente", "etiqueta", "fecha", "lat", "lng", "velocidad", "direccion", "ignicion",
      "grupo1", "conductor", "kms_total", "consumo_litros", "nivel_estanque",
      "rpm", "temp_motor", "estado_operacion",
    ];
    const seen = new Set<string>();
    const posRows: any[][] = [];
    for (const r of valid) {
      const patente = resolvePatente(r.Movil);
      if (!patente) continue;
      const key = `${patente}|${r.Fecha_Hora}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = vehiculoMap.get(r.Movil);
      posRows.push([
        patente, r.Movil, r.Fecha_Hora, r.Lat, r.Lon,
        r.Velocidad || 0, r.Direccion || 0, true,
        v?.grupo1 || "",
        v?.conductor || "",
        r.Kms_Total, r.ConsumoLitros_Total,
        r.NivelEstanque, r.RPM, r.TempMotor, "",
      ]);
    }
    const posRes = await insertWithFallback(client, "posiciones", posRows, posCols, "ON CONFLICT (patente, fecha) DO NOTHING");

    return {
      saved: telRes.saved,
      attempted: valid.length,
      failed: telRes.failed + posRes.failed,
      failedBatches: telRes.failedBatches + posRes.failedBatches,
    };
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
  let totalFailed = 0;
  let newest: Date | null = null;
  let mode = bufferDrainMode ? "drain" : "realtime";
  let errMsg: string | null = null;

  try {
    if (bufferDrainMode) {
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
          const r = await saveTelemetria(records);
          saved += r.saved;
          totalFailed += r.failed;
          newest = newestDate;
          console.log(`[WISETRACK-API] Buffer alcanzó presente. Descartados: ${drainTotal}. Guardados: ${r.saved}/${r.attempted}.`);
          break;
        }
        drained += records.length;
        drainTotal += records.length;
        if (drained % 10000 === 0 || drained <= 1000) {
          console.log(`[WISETRACK-API] Drenando: ${drainTotal} descartados | Fecha: ${newestStr}`);
        }
        if (drained >= 50000) break;
      }
    } else {
      const records = await fetchTelemetriaAPI();
      fetched = records.length;
      if (records.length > 0) {
        const r = await saveTelemetria(records);
        saved = r.saved;
        totalFailed = r.failed;
        const newestStr = records.reduce((max, rr) => {
          const d = rr.Fecha_Hora || "";
          return d > max ? d : max;
        }, "");
        if (newestStr) newest = new Date(newestStr.replace(" ", "T") + "-04:00");
      }
    }

    if (newest) lastNewestRecordAt = newest;
    totalApiRecords += saved;
    lastApiSyncAt = new Date();
    lastApiSyncCount = fetched;

    // Señalización honesta: si tuvimos filas perdidas por DB error, marcamos como sync degradado
    if (totalFailed > 0) {
      errMsg = `${totalFailed} filas descartadas por errores de DB`;
      lastApiSyncError = errMsg;
      consecutiveErrors++;
      console.error(`[WISETRACK-API] sync DEGRADADO: ${fetched} fetched / ${saved} saved / ${totalFailed} FAILED | err#${consecutiveErrors}`);
    } else {
      lastApiSyncError = null;
      consecutiveErrors = 0;
      if (saved > 0 || fetched > 0) {
        const lag = lastNewestRecordAt
          ? Math.floor((Date.now() - lastNewestRecordAt.getTime()) / 1000)
          : -1;
        console.log(`[WISETRACK-API] sync OK: ${fetched} fetched / ${saved} saved | lag ${lag}s | next ${currentIntervalMs / 1000}s`);
      }
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
