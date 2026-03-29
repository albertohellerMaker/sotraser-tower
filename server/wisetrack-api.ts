import https from "https";
import { pool } from "./db";
import { insertarGpsWisetrack } from "./utils/gps-unificado";

const WT_BASE = "https://telemetria.wisetrack.cl/portal";
const WT_AJAX = `${WT_BASE}/Ajaxpages`;

let cachedCookies: string | null = null;
let cookieExpiry = 0;
let cachedFleet: any[] = [];
let fleetExpiry = 0;

function wtFetch(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; cookies: string[]; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, {
      method: opts.method || "GET",
      headers: opts.headers || {},
    }, (res) => {
      let data = "";
      res.on("data", (chunk: string) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode || 0, cookies: (res.headers["set-cookie"] || []) as string[], body: data }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export async function wisetrackLogin(): Promise<string> {
  if (cachedCookies && Date.now() < cookieExpiry) return cachedCookies;

  const user = process.env.WISETRACK_USER || "Rcaceres";
  const pass = process.env.WISETRACK_PASS || "$$123Abc.,";
  const company = process.env.WISETRACK_COMPANY || "Sotraser";

  // GET login page for tokens
  const page = await wtFetch(`${WT_BASE}/`);
  const vs = page.body.match(/name="__VIEWSTATE".*?value="([^"]*)"/)?.[1] || "";
  const vsg = page.body.match(/name="__VIEWSTATEGENERATOR".*?value="([^"]*)"/)?.[1] || "";
  const ev = page.body.match(/name="__EVENTVALIDATION".*?value="([^"]*)"/)?.[1] || "";
  const sessCookie = page.cookies.map(c => c.split(";")[0]).join("; ");

  // POST login
  const login = await wtFetch(`${WT_BASE}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": sessCookie,
      "Referer": `${WT_BASE}/`,
    },
    body: new URLSearchParams({
      "__VIEWSTATE": vs,
      "__VIEWSTATEGENERATOR": vsg,
      "__EVENTVALIDATION": ev,
      "TextBox1": user,
      "TextBox2": pass,
      "TextBox3": company,
      "Button1": "Ingresar",
    }).toString(),
  });

  if (login.status !== 302) {
    throw new Error("WiseTrack login failed - status " + login.status);
  }

  const allCookies = [...page.cookies, ...login.cookies].map(c => c.split(";")[0]).join("; ");
  cachedCookies = allCookies;
  cookieExpiry = Date.now() + 25 * 60 * 1000; // 25 min cache
  console.log("[WISETRACK] Login successful");
  return allCookies;
}

async function wtAjax(endpoint: string, method = "GET", body = ""): Promise<any> {
  const cookies = await wisetrackLogin();
  const url = endpoint.startsWith("http") ? endpoint : `${WT_AJAX}/${endpoint}`;
  const res = await wtFetch(url, {
    method,
    headers: {
      "Cookie": cookies,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${WT_BASE}/Seguimiento.aspx`,
    },
    body,
  });
  try {
    return JSON.parse(res.body);
  } catch {
    return res.body;
  }
}

// ── CORE DATA FUNCTIONS ──

export async function getWisetrackFleet(): Promise<any[]> {
  if (cachedFleet.length > 0 && Date.now() < fleetExpiry) return cachedFleet;

  const data = await wtAjax("AjaxReport.aspx?Metodo=Seguimiento", "POST");
  if (Array.isArray(data)) {
    cachedFleet = data;
    fleetExpiry = Date.now() + 15 * 1000; // 15 sec cache for 20s refresh
    console.log(`[WISETRACK] Fleet: ${data.length} vehicles`);
  }
  return cachedFleet;
}

export async function getWisetrackAlertas(): Promise<any[]> {
  const data = await wtAjax("AjaxCookieReport.aspx?Metodo=AlertasNoGestionadas");
  return Array.isArray(data) ? data : [];
}

export async function getWisetrackRendimiento(): Promise<any[]> {
  const data = await wtAjax("AjaxCookieReport.aspx?Metodo=GraficoRendimiento");
  return Array.isArray(data) ? data : [];
}

export async function getWisetrackRankingAlertas(): Promise<any[]> {
  const data = await wtAjax("AjaxCookieReport.aspx?Metodo=RankingMovilesAlerta");
  return Array.isArray(data) ? data : [];
}

// ── NORMALIZE PATENTE ──
// WiseTrack uses KZZX-34, our system uses KZZX34
function normalizePat(pat: string): string {
  return (pat || "").replace(/-/g, "").toUpperCase();
}

// ── SAVE TO DB ──

export async function syncWisetrackToDB(): Promise<{ vehicles: number; saved: number }> {
  const fleet = await getWisetrackFleet();
  if (!fleet.length) return { vehicles: 0, saved: 0 };

  // Create table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wisetrack_snapshots (
      id serial PRIMARY KEY,
      movil text,
      patente text,
      patente_norm text,
      lat float,
      lng float,
      velocidad float,
      direccion int,
      fecha timestamp,
      estado text,
      ignicion boolean,
      contrato text,
      conductor text,
      km_viaje float,
      km_total float,
      consumo_litros float,
      nivel_estanque float,
      rpm int,
      temp_motor float,
      tiempo_conduccion int,
      tiempo_ralenti int,
      captured_at timestamp DEFAULT now()
    )
  `);

  // Create index
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wt_snap_patente ON wisetrack_snapshots (patente_norm)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wt_snap_fecha ON wisetrack_snapshots (fecha)`);

  let saved = 0;
  for (const v of fleet) {
    const patNorm = normalizePat(v.MOV_PATENTE);
    if (!patNorm) continue;

    try {
      await pool.query(`
        INSERT INTO wisetrack_snapshots (
          movil, patente, patente_norm, lat, lng, velocidad, direccion, fecha, estado,
          ignicion, contrato, conductor, km_viaje, km_total, consumo_litros,
          nivel_estanque, rpm, temp_motor, tiempo_conduccion, tiempo_ralenti
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT DO NOTHING
      `, [
        v.Movil, v.MOV_PATENTE, patNorm, v.Latitud, v.Longitud,
        parseFloat(v.Velocidad) || 0, v.Direccion || 0,
        v.Fecha ? new Date(v.Fecha.replace(/\//g, "-")) : new Date(),
        v.EstadoOperacionCanStr || "Desconocido",
        v.Ignicion || false,
        v.MOV_GRUPO1 || "",
        v.CONDUCTOR !== "-" ? v.CONDUCTOR : null,
        v.Kms || 0, v.Kms_Total_Sincronizado || 0,
        parseFloat(v.ConsumoLitros_Conduccion) || 0,
        parseFloat(v.NIVELESTANQUE) || 0,
        v.RPM || 0, parseFloat(v.TempMotor) || 0,
        v.Tiempo_Conduccion || 0, v.Tiempo_Ralenti || 0,
      ]);
      saved++;
      // Also insert into unified GPS table
      if (v.Latitud && v.Longitud && v.Latitud !== 0 && v.Longitud !== 0) {
        await insertarGpsWisetrack(
          patNorm, v.Latitud, v.Longitud,
          parseFloat(v.Velocidad) || 0, v.Direccion || 0,
          v.Fecha ? new Date(v.Fecha.replace(/\//g, "-")) : new Date(),
          v.RPM || undefined, parseFloat(v.TempMotor) || undefined,
          parseFloat(v.NIVELESTANQUE) || undefined,
          v.CONDUCTOR !== "-" ? v.CONDUCTOR : undefined,
          v.MOV_GRUPO1 || undefined
        );
      }
    } catch (e: any) {
      // Skip duplicates silently
    }
  }

  console.log(`[WISETRACK] Synced: ${saved}/${fleet.length} vehicles`);
  return { vehicles: fleet.length, saved };
}
