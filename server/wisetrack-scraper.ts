import { pool } from "./db";
import https from "https";
import { parse as parseUrl } from "url";

const BASE_URL = "https://telemetria.wisetrack.cl/Portal";

interface WiseTrackSession {
  cookies: string;
  loginTime: number;
}

let cachedSession: WiseTrackSession | null = null;
const SESSION_TTL = 25 * 60 * 1000;

function httpRequest(
  method: string,
  urlStr: string,
  body?: Record<string, string> | null,
  cookies?: string
): Promise<{ data: string; status: number; cookies: string[]; headers: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    const opts: any = parseUrl(urlStr);
    opts.method = method;
    opts.headers = {
      Cookie: cookies || "",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "X-Requested-With": "XMLHttpRequest",
    };
    let payload: string | undefined;
    if (body) {
      payload = new URLSearchParams(body).toString();
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.headers["Content-Length"] = Buffer.byteLength(payload).toString();
    }
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

async function login(): Promise<WiseTrackSession> {
  if (cachedSession && Date.now() - cachedSession.loginTime < SESSION_TTL) {
    return cachedSession;
  }

  const user = process.env.WISETRACK_USER;
  const pass = process.env.WISETRACK_PASS;
  const company = process.env.WISETRACK_COMPANY || "Sotraser";

  if (!user || !pass) throw new Error("WISETRACK_USER/WISETRACK_PASS not set");

  const page = await httpRequest("GET", `${BASE_URL}/`);
  const cookies = page.cookies.join("; ");

  const vs = page.data.match(/__VIEWSTATE.*?value="([^"]+)"/)?.[1] || "";
  const ev = page.data.match(/__EVENTVALIDATION.*?value="([^"]+)"/)?.[1] || "";
  const vg = page.data.match(/__VIEWSTATEGENERATOR.*?value="([^"]+)"/)?.[1] || "";

  const loginResp = await httpRequest(
    "POST",
    `${BASE_URL}/`,
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
    throw new Error(`WiseTrack login failed: status ${loginResp.status}`);
  }

  const allCookies = [...cookies.split("; "), ...loginResp.cookies].join("; ");
  cachedSession = { cookies: allCookies, loginTime: Date.now() };
  console.log("[WISETRACK] Login OK");
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
  const session = await login();

  const resp = await httpRequest(
    "POST",
    `${BASE_URL}/Ajaxpages/AjaxReport.aspx?Metodo=Seguimiento`,
    {},
    session.cookies
  );

  if (resp.status !== 200) {
    invalidateSession();
    throw new Error(`WiseTrack Seguimiento failed: ${resp.status}`);
  }

  let raw: any[];
  try {
    raw = JSON.parse(resp.data);
  } catch {
    invalidateSession();
    throw new Error("WiseTrack: invalid JSON response");
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

  if (soloGrupo1) {
    vehicles = vehicles.filter(
      (v) => v.grupo1.toLowerCase() === soloGrupo1.toLowerCase()
    );
  }

  return vehicles;
}

export async function savePositions(vehicles: WiseTrackVehicle[]): Promise<number> {
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
            v.patente,
            v.etiqueta,
            v.fecha,
            v.lat,
            v.lng,
            v.velocidad,
            v.direccion,
            v.ignicion,
            v.grupo1,
            v.conductor,
            v.kmsTotal,
            v.consumoLitros,
            v.nivelEstanque,
            v.rpm,
            v.tempMotor,
            v.estadoOperacion,
          ]
        );
        saved++;
      } catch {
        // skip duplicates silently
      }
    }
    return saved;
  } finally {
    client.release();
  }
}

let syncInterval: NodeJS.Timeout | null = null;
let lastSyncAt: Date | null = null;
let lastSyncCount = 0;
let lastSyncError: string | null = null;

export function getWiseTrackStatus() {
  return {
    lastSyncAt,
    lastSyncCount,
    lastSyncError,
    sessionActive: !!cachedSession && Date.now() - cachedSession.loginTime < SESSION_TTL,
  };
}

async function doSync() {
  try {
    const vehicles = await fetchSeguimiento("CENCOSUD");
    const saved = await savePositions(vehicles);
    lastSyncAt = new Date();
    lastSyncCount = vehicles.length;
    lastSyncError = null;
    console.log(`[WISETRACK] Sync OK: ${vehicles.length} Cencosud vehicles, ${saved} new positions saved`);
  } catch (err: any) {
    lastSyncError = err.message;
    console.error(`[WISETRACK] Sync error: ${err.message}`);
  }
}

export function startWiseTrackSync(intervalMs = 120_000) {
  if (syncInterval) return;
  console.log(`[WISETRACK] Starting sync every ${intervalMs / 1000}s`);
  doSync();
  syncInterval = setInterval(doSync, intervalMs);
}

export function stopWiseTrackSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
