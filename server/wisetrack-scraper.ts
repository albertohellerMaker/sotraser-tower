import { pool } from "./db";
import https from "https";
import { parse as parseUrl } from "url";

const API_URL = "https://ei.wisetrack.cl/Sotraser/TelemetriaDetalle";
const PORTAL_URL = "https://telemetria.wisetrack.cl/Portal";

interface WiseTrackSession {
  cookies: string;
  loginTime: number;
}

let cachedSession: WiseTrackSession | null = null;
const SESSION_TTL = 25 * 60 * 1000;

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
      "X-Requested-With": "XMLHttpRequest",
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

async function loginPortal(): Promise<WiseTrackSession> {
  if (cachedSession && Date.now() - cachedSession.loginTime < SESSION_TTL) {
    return cachedSession;
  }

  const user = process.env.WISETRACK_USER;
  const pass = process.env.WISETRACK_PASS;
  const company = process.env.WISETRACK_COMPANY || "Sotraser";

  if (!user || !pass) throw new Error("WISETRACK_USER/WISETRACK_PASS not set");

  const page = await httpRequest("GET", `${PORTAL_URL}/`);
  const cookies = page.cookies.join("; ");

  const vs = page.data.match(/__VIEWSTATE.*?value="([^"]+)"/)?.[1] || "";
  const ev = page.data.match(/__EVENTVALIDATION.*?value="([^"]+)"/)?.[1] || "";
  const vg = page.data.match(/__VIEWSTATEGENERATOR.*?value="([^"]+)"/)?.[1] || "";

  const loginResp = await httpRequest(
    "POST",
    `${PORTAL_URL}/`,
    {
      TextBox1: user,
      TextBox2: pass,
      TextBox3: company,
      Button1: "Ingresar",
      __VIEWSTATE: vs,
      __VIEWSTATEGENERATOR: vg,
      __EVENTVALIDATION: ev,
    },
    cookies
  );

  if (loginResp.status !== 302) {
    throw new Error(`WiseTrack portal login failed: status ${loginResp.status}`);
  }

  const allCookies = [...cookies.split("; "), ...loginResp.cookies].join("; ");
  cachedSession = { cookies: allCookies, loginTime: Date.now() };
  console.log("[WISETRACK] Portal login OK");
  return cachedSession;
}

export function invalidateSession() {
  cachedSession = null;
}

export interface WiseTrackVehicle {
  etiqueta: string;
  movil: string;
  patente: string;
  fecha: string;
  velocidad: number;
  lat: number;
  lng: number;
  direccion: number;
  ignicion: boolean;
  grupo1: string;
  grupo2: string;
  grupo3: string;
  grupo4: string;
  conductor: string;
  kms: number;
  kmsTotal: number;
  consumoLitros: number;
  tiempoConduccion: number;
  tiempoRalenti: number;
  nivelEstanque: number;
  rpm: number;
  tempMotor: number;
  estadoOperacion: string;
  fechaInicioUltViaje: string;
  fechaFinUltViaje: string;
}

export async function fetchSeguimiento(soloGrupo1?: string): Promise<WiseTrackVehicle[]> {
  const session = await loginPortal();

  const resp = await httpRequest(
    "POST",
    `${PORTAL_URL}/Ajaxpages/AjaxReport.aspx?Metodo=Seguimiento`,
    {},
    session.cookies
  );

  if (resp.status !== 200) {
    invalidateSession();
    throw new Error("WiseTrack: unable to fetch vehicle data");
  }

  let raw: any[];
  try {
    raw = JSON.parse(resp.data);
  } catch {
    invalidateSession();
    throw new Error("WiseTrack: unable to parse response");
  }

  let vehicles: WiseTrackVehicle[] = raw.map((v) => ({
    etiqueta: v.Etiqueta || "",
    movil: v.Movil || "",
    patente: v.MOV_PATENTE || "",
    fecha: v.Fecha || "",
    velocidad: parseFloat(v.Velocidad) || 0,
    lat: v.Latitud || 0,
    lng: v.Longitud || 0,
    direccion: v.Direccion || 0,
    ignicion: !!v.Ignicion,
    grupo1: v.MOV_GRUPO1 || "",
    grupo2: v.MOV_GRUPO2 || "",
    grupo3: v.MOV_GRUPO3 || "",
    grupo4: v.MOV_GRUPO4 || "",
    conductor: v.CONDUCTOR || "",
    kms: v.Kms || 0,
    kmsTotal: v.Kms_Total_Sincronizado || 0,
    consumoLitros: parseFloat(v.ConsumoLitros_Conduccion) || 0,
    tiempoConduccion: v.Tiempo_Conduccion || 0,
    tiempoRalenti: v.Tiempo_Ralenti || 0,
    nivelEstanque: parseFloat(v.NIVELESTANQUE) || 0,
    rpm: v.RPM || 0,
    tempMotor: parseFloat(v.TempMotor) || 0,
    estadoOperacion: v.EstadoOperacionCanStr || "",
    fechaInicioUltViaje: v.Fecha_Inicio_Ult_Viaje || "",
    fechaFinUltViaje: v.Fecha_Fin_Ult_Viaje || "",
  }));

  for (const v of vehicles) {
    if (v.etiqueta && v.patente) {
      vehiculoMap.set(v.etiqueta, { patente: v.patente, grupo1: v.grupo1, conductor: v.conductor });
    }
  }

  if (soloGrupo1) {
    vehicles = vehicles.filter(
      (v) => v.grupo1.toLowerCase() === soloGrupo1.toLowerCase()
    );
  }

  return vehicles;
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
              r.Kms_Total, r.ConsumoLitros_Conduccion,
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

export async function syncVehiculoMap(): Promise<number> {
  try {
    const vehicles = await fetchSeguimiento();
    const client = await pool.connect();
    try {
      let count = 0;
      for (const v of vehicles) {
        if (!v.etiqueta || !v.patente) continue;
        await client.query(
          `INSERT INTO wisetrack_vehiculos (movil, patente, grupo1, grupo2, conductor, actualizado_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (movil) DO UPDATE SET
             patente = $2, grupo1 = $3, grupo2 = $4, conductor = $5, actualizado_at = NOW()`,
          [v.etiqueta, v.patente, v.grupo1, v.grupo2, v.conductor]
        );
        vehiculoMap.set(v.etiqueta, { patente: v.patente, grupo1: v.grupo1, conductor: v.conductor });
        count++;
      }
      return count;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[WISETRACK] Vehicle map sync error:", err.message);
    return 0;
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

export function savePositions(vehicles: WiseTrackVehicle[]): Promise<number> {
  return saveLegacyPositions(vehicles);
}

async function saveLegacyPositions(vehicles: WiseTrackVehicle[]): Promise<number> {
  if (vehicles.length === 0) return 0;

  const client = await pool.connect();
  try {
    let saved = 0;
    for (const v of vehicles) {
      if (!v.patente || !v.lat || !v.lng) continue;
      try {
        await client.query(
          `INSERT INTO wisetrack_posiciones 
           (patente, etiqueta, fecha, lat, lng, velocidad, direccion, ignicion,
            grupo1, conductor, kms_total, consumo_litros, nivel_estanque,
            rpm, temp_motor, estado_operacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (patente, fecha) DO NOTHING`,
          [
            v.patente, v.etiqueta, v.fecha, v.lat, v.lng,
            v.velocidad, v.direccion, v.ignicion,
            v.grupo1, v.conductor, v.kmsTotal, v.consumoLitros,
            v.nivelEstanque, v.rpm, v.tempMotor, v.estadoOperacion,
          ]
        );
        saved++;
      } catch {
      }
    }
    return saved;
  } finally {
    client.release();
  }
}

let apiInterval: NodeJS.Timeout | null = null;
let portalInterval: NodeJS.Timeout | null = null;
let lastApiSyncAt: Date | null = null;
let lastApiSyncCount = 0;
let lastApiSyncError: string | null = null;
let lastPortalSyncAt: Date | null = null;
let lastPortalSyncCount = 0;
let totalApiRecords = 0;

export function getWiseTrackStatus() {
  return {
    api: {
      lastSyncAt: lastApiSyncAt,
      lastSyncCount: lastApiSyncCount,
      lastSyncError: lastApiSyncError,
      totalRecords: totalApiRecords,
    },
    portal: {
      lastSyncAt: lastPortalSyncAt,
      lastSyncCount: lastPortalSyncCount,
      sessionActive: !!cachedSession && Date.now() - cachedSession.loginTime < SESSION_TTL,
    },
    vehiculoMapSize: vehiculoMap.size,
    lastSyncAt: lastApiSyncAt || lastPortalSyncAt,
    lastSyncCount: lastApiSyncCount || lastPortalSyncCount,
    lastSyncError: lastApiSyncError,
    sessionActive: !!cachedSession && Date.now() - cachedSession.loginTime < SESSION_TTL,
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

async function doPortalSync() {
  try {
    const count = await syncVehiculoMap();
    lastPortalSyncAt = new Date();
    lastPortalSyncCount = count;
    console.log(`[WISETRACK] Portal sync OK: ${count} vehicles mapped`);

    const vehicles = await fetchSeguimiento("CENCOSUD");
    const saved = await saveLegacyPositions(vehicles);
    console.log(`[WISETRACK] Sync OK: ${vehicles.length} Cencosud vehicles, ${saved} new positions saved`);
  } catch (err: any) {
    console.error(`[WISETRACK] Portal sync error: ${err.message}`);
  }
}

export function startWiseTrackSync(apiIntervalMs = 60_000, portalIntervalMs = 300_000) {
  if (apiInterval) return;

  console.log(`[WISETRACK] Starting API sync every ${apiIntervalMs / 1000}s, portal sync every ${portalIntervalMs / 1000}s`);

  loadVehiculoMapFromDB().then(() => {
    doPortalSync().then(() => {
      doApiSync();
    });
  });

  apiInterval = setInterval(doApiSync, apiIntervalMs);
  portalInterval = setInterval(doPortalSync, portalIntervalMs);
}

export function stopWiseTrackSync() {
  if (apiInterval) {
    clearInterval(apiInterval);
    apiInterval = null;
  }
  if (portalInterval) {
    clearInterval(portalInterval);
    portalInterval = null;
  }
}
