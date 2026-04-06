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

export async function saveTelemetria(records: WTTelemetriaRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  const client = await pool.connect();
  try {
    let saved = 0;
    for (const r of records) {
      if (!r.Lat || !r.Lon) continue;
      const patente = resolvePatente(r.Movil);
      try {
        await client.query(
          `INSERT INTO wisetrack_telemetria 
           (wt_id, movil, patente, fecha_hora, lat, lng, direccion, kms, kms_total,
            horometro, nivel_estanque, consumo_conduccion, consumo_ralenti, consumo_total,
            tiempo_conduccion, tiempo_ralenti, temp_motor, velocidad, rpm, torque,
            presion_aceite, id_energia, id_partida, fecha_insercion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           ON CONFLICT (wt_id) DO NOTHING`,
          [
            r.Id, r.Movil, patente, r.Fecha_Hora, r.Lat, r.Lon,
            r.Direccion, r.Kms, r.Kms_Total, r.Horometro,
            r.NivelEstanque, r.ConsumoLitros_Conduccion, r.ConsumoLitros_Ralenti,
            r.ConsumoLitros_Total, r.Tiempo_Conduccion, r.Tiempo_Ralenti,
            r.TempMotor, r.Velocidad, r.RPM, r.Torque,
            r.Presion_Aceite, r.Id_Energia, r.Id_Partida, r.Fecha_Insercion,
          ]
        );
        saved++;
      } catch {
      }

      if (patente) {
        try {
          await client.query(
            `INSERT INTO wisetrack_posiciones 
             (patente, etiqueta, fecha, lat, lng, velocidad, direccion, ignicion,
              grupo1, conductor, kms_total, consumo_litros, nivel_estanque,
              rpm, temp_motor, estado_operacion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (patente, fecha) DO NOTHING`,
            [
              patente, r.Movil, r.Fecha_Hora, r.Lat, r.Lon,
              r.Velocidad || 0, r.Direccion || 0, true,
              vehiculoMap.get(r.Movil)?.grupo1 || "",
              vehiculoMap.get(r.Movil)?.conductor || "",
              r.Kms_Total, r.ConsumoLitros_Total,
              r.NivelEstanque, r.RPM, r.TempMotor, "",
            ]
          );
        } catch {
        }
      }
    }
    return saved;
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

let apiInterval: NodeJS.Timeout | null = null;
let lastApiSyncAt: Date | null = null;
let lastApiSyncCount = 0;
let lastApiSyncError: string | null = null;
let totalApiRecords = 0;

export function getWiseTrackStatus() {
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
  };
}

async function doApiSync() {
  try {
    const records = await fetchTelemetriaAPI();
    if (records.length === 0) {
      lastApiSyncAt = new Date();
      lastApiSyncError = null;
      return;
    }
    const saved = await saveTelemetria(records);
    totalApiRecords += saved;
    lastApiSyncAt = new Date();
    lastApiSyncCount = records.length;
    lastApiSyncError = null;
    console.log(`[WISETRACK-API] Consumed ${records.length} records from buffer, ${saved} saved to DB`);
  } catch (err: any) {
    lastApiSyncError = err.message;
    console.error(`[WISETRACK-API] Sync error: ${err.message}`);
  }
}

export function startWiseTrackSync(apiIntervalMs = 60_000) {
  if (apiInterval) return;

  console.log(`[WISETRACK] Starting API sync every ${apiIntervalMs / 1000}s (official API only)`);

  loadVehiculoMapFromDB().then(() => {
    doApiSync();
  });

  apiInterval = setInterval(doApiSync, apiIntervalMs);
}

export function stopWiseTrackSync() {
  if (apiInterval) {
    clearInterval(apiInterval);
    apiInterval = null;
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

export async function fetchSeguimiento(_grupo?: string): Promise<SeguimientoVehicle[]> {
  const result = await pool.query(`
    SELECT DISTINCT ON (patente)
      patente, etiqueta, lat, lng, velocidad, direccion, ignicion,
      grupo1, conductor, kms_total, consumo_litros, nivel_estanque,
      rpm, temp_motor, estado_operacion, fecha
    FROM wisetrack_posiciones
    WHERE creado_at > NOW() - INTERVAL '4 hours'
    ORDER BY patente, creado_at DESC
  `);

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
    fecha: r.fecha || "",
    fechaInicioUltViaje: null,
    fechaFinUltViaje: null,
    kms: 0,
    tiempoConduccion: 0,
    tiempoRalenti: 0,
  }));
}
