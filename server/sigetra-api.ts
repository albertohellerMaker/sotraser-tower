const SIGETRA_BASE = process.env.SIGETRA_URL || "http://sigetraweb.sotraser.cl";

export interface SigetraFuelRecord {
  numGuia: number;
  fechaConsumo: string;
  patente: string;
  numVeh: number | null;
  grupoVeh: string | null;
  tipoVeh: string | null;
  marca: string | null;
  modelo: string | null;
  yearFab: number | null;
  faena: string | null;
  subfaena: string | null;
  runConductor: string | null;
  nombreConductor: string | null;
  tipoTarjeta: string | null;
  numTarjeta: number | null;
  lugarConsumo: string | null;
  cantidadLt: number;
  odometroActual: number | null;
  odometroPrevio: number | null;
  kmRecorrido: number | null;
  factorAjuste: number | null;
  kmAjustado: number | null;
  rendReal: number | null;
  rendEsperado: number | null;
  desviacion: number | null;
  tipoRend: string | null;
  producto: string | null;
  observacion: string | null;
  difdia: number | null;
}

export interface SigetraFuelSummary {
  patente: string;
  numVeh: number | null;
  grupoVeh: string | null;
  tipoVeh: string | null;
  marca: string | null;
  modelo: string | null;
  yearFab: number | null;
  faenaPri: string | null;
  cantidadLt: number;
  odometroMin: number | null;
  odometroMax: number | null;
  kmRecorrido: number | null;
  kmAjustado: number | null;
  rendReal: number | null;
  rendEsperado: number | null;
  desviacion: number | null;
  tipoRend: string | null;
  producto: string | null;
  cantidadLtAdb: number | null;
}

let sessionCookie: string | null = null;
let sessionExpiry = 0;
const SESSION_TTL = 30 * 60 * 1000;

async function sigetraLogin(): Promise<string> {
  const user = process.env.SIGETRA_USER;
  const pass = process.env.SIGETRA_PASSWORD;
  if (!user || !pass) throw new Error("Sigetra credentials not configured");

  console.log("[sigetra] Authenticating...");

  const validateRes = await fetch(
    `${SIGETRA_BASE}/modulos/seguridad/ui_seg_login_backend.aspx/ValidateUser`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ username: user, password: pass }),
    }
  );

  if (!validateRes.ok) throw new Error(`Sigetra login failed: ${validateRes.status}`);

  const validateData: any = await validateRes.json();
  const parsed = JSON.parse(validateData.d);
  if (parsed.State !== "OK") throw new Error(`Sigetra auth rejected: ${parsed.Message}`);

  const redirectRes = await fetch(
    `${SIGETRA_BASE}/modulos/seguridad/ui_seg_login_redirect.aspx`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(user)}&returnurl=../../ui_menu.aspx`,
      redirect: "manual",
    }
  );

  let authCookie = "";
  const redirectCookies = redirectRes.headers.getSetCookie?.() || [];
  for (const c of redirectCookies) {
    if (c.includes(".ASPXAUTH")) {
      authCookie = c.split(";")[0];
      break;
    }
  }

  if (!authCookie) {
    const rawHeader = redirectRes.headers.get("set-cookie") || "";
    const match = rawHeader.match(/\.ASPXAUTH=([^;]+)/);
    if (match && match[1].length > 10) authCookie = `.ASPXAUTH=${match[1]}`;
  }

  if (!authCookie || authCookie.length < 20) throw new Error("Sigetra: no auth cookie received");

  console.log("[sigetra] Authenticated successfully");
  return authCookie;
}

async function getSession(): Promise<string> {
  if (sessionCookie && Date.now() < sessionExpiry) return sessionCookie;
  sessionCookie = await sigetraLogin();
  sessionExpiry = Date.now() + SESSION_TTL;
  return sessionCookie;
}

async function sigetraPost<T>(url: string, data: Record<string, string>): Promise<T> {
  const cookie = await getSession();

  const res = await fetch(`${SIGETRA_BASE}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Cookie: cookie,
    },
    body: JSON.stringify(data),
  });

  if (res.status === 302 || res.status === 401) {
    console.log("[sigetra] Session expired, re-authenticating...");
    sessionCookie = null;
    sessionExpiry = 0;
    const newCookie = await getSession();
    const retryRes = await fetch(`${SIGETRA_BASE}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Cookie: newCookie,
      },
      body: JSON.stringify(data),
    });
    if (!retryRes.ok) throw new Error(`Sigetra retry failed: ${retryRes.status}`);
    const retryData: any = await retryRes.json();
    return JSON.parse(retryData.d) as T;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sigetra request failed: ${res.status} - ${text.slice(0, 200)}`);
  }

  const responseData: any = await res.json();
  return JSON.parse(responseData.d) as T;
}

function formatSigetraDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

interface RawFuelRecord {
  num_guia: number;
  fechahr_consumo: string;
  patente: string;
  num_veh: number | null;
  grupo_veh: string | null;
  tipo_veh: string | null;
  marca: string | null;
  modelo: string | null;
  year_fab: number | null;
  faena: string | null;
  subfaena: string | null;
  run_conductor: string | null;
  nombre_conductor: string | null;
  tipo_tarjeta: string | null;
  num_tarjeta: number | null;
  lugar_consumo: string | null;
  cantidad_lt: number;
  odometro_actual: number | null;
  odometro_previo: number | null;
  km_recorrido: number | null;
  factor_ajuste: number | null;
  km_ajustado: number | null;
  rend_real: number | null;
  rend_esperado: number | null;
  desviacion: number | null;
  tipo_rend: string | null;
  producto: string | null;
  observacion: string | null;
  difdia: number | null;
}

interface RawFuelSummary {
  patente: string;
  num_veh: number | null;
  grupo_veh: string | null;
  tipo_veh: string | null;
  marca: string | null;
  modelo: string | null;
  year_fab: number | null;
  faena_pri: string | null;
  cantidad_lt: number;
  odometro_min: number | null;
  odometro_max: number | null;
  km_recorrido: number | null;
  km_ajustado: number | null;
  rend_real: number | null;
  rend_esperado: number | null;
  desviacion: number | null;
  tipo_rend: string | null;
  producto: string | null;
  cantidad_lt_adb: number | null;
}

function mapFuelRecord(r: RawFuelRecord): SigetraFuelRecord {
  return {
    numGuia: r.num_guia,
    fechaConsumo: r.fechahr_consumo,
    patente: r.patente,
    numVeh: r.num_veh,
    grupoVeh: r.grupo_veh,
    tipoVeh: r.tipo_veh,
    marca: r.marca,
    modelo: r.modelo,
    yearFab: r.year_fab,
    faena: r.faena,
    subfaena: r.subfaena,
    runConductor: r.run_conductor,
    nombreConductor: r.nombre_conductor,
    tipoTarjeta: r.tipo_tarjeta,
    numTarjeta: r.num_tarjeta,
    lugarConsumo: r.lugar_consumo,
    cantidadLt: r.cantidad_lt,
    odometroActual: r.odometro_actual,
    odometroPrevio: r.odometro_previo,
    kmRecorrido: r.km_recorrido,
    factorAjuste: r.factor_ajuste,
    kmAjustado: r.km_ajustado,
    rendReal: r.rend_real,
    rendEsperado: r.rend_esperado,
    desviacion: r.desviacion,
    tipoRend: r.tipo_rend,
    producto: r.producto,
    observacion: r.observacion,
    difdia: r.difdia,
  };
}

function mapFuelSummary(r: RawFuelSummary): SigetraFuelSummary {
  return {
    patente: r.patente,
    numVeh: r.num_veh,
    grupoVeh: r.grupo_veh,
    tipoVeh: r.tipo_veh,
    marca: r.marca,
    modelo: r.modelo,
    yearFab: r.year_fab,
    faenaPri: r.faena_pri,
    cantidadLt: r.cantidad_lt,
    odometroMin: r.odometro_min,
    odometroMax: r.odometro_max,
    kmRecorrido: r.km_recorrido,
    kmAjustado: r.km_ajustado,
    rendReal: r.rend_real,
    rendEsperado: r.rend_esperado,
    desviacion: r.desviacion,
    tipoRend: r.tipo_rend,
    producto: r.producto,
    cantidadLtAdb: r.cantidad_lt_adb,
  };
}

export async function getSigetraFuelData(
  from: Date,
  to: Date,
  filters?: { codVeh?: string; codFaena?: string; producto?: string }
): Promise<SigetraFuelRecord[]> {
  const fechaIni = formatSigetraDate(from) + " 00:00";
  const fechaFin = formatSigetraDate(to) + " 23:59";

  console.log(`[sigetra] Fetching fuel data ${fechaIni} - ${fechaFin}`);

  const raw = await sigetraPost<RawFuelRecord[]>(
    "/modulos/combustible/ui_cmb_consumo_combustible_backend.aspx/RetrieveConsultaConsumo",
    {
      fechaIni,
      fechaFin,
      codVeh: filters?.codVeh || "",
      grupoVeh: "0",
      tipoVeh: "0",
      codFaena: filters?.codFaena || "0",
      conductor: "",
      producto: filters?.producto || "DIESEL",
      tipoConsumo: "",
    }
  );

  console.log(`[sigetra] Got ${raw.length} fuel records`);
  return raw.map(mapFuelRecord);
}

export async function getSigetraFuelSummary(
  from: Date,
  to: Date,
  filters?: { codVeh?: string; codFaena?: string; producto?: string }
): Promise<SigetraFuelSummary[]> {
  const fechaIni = formatSigetraDate(from) + " 00:00";
  const fechaFin = formatSigetraDate(to) + " 23:59";

  console.log(`[sigetra] Fetching fuel summary ${fechaIni} - ${fechaFin}`);

  const raw = await sigetraPost<RawFuelSummary[]>(
    "/modulos/combustible/ui_cmb_consumo_combustible_resumen_backend.aspx/RetrieveConsultaConsumoResumen",
    {
      fechaIni,
      fechaFin,
      codVeh: filters?.codVeh || "",
      grupoVeh: "0",
      tipoVeh: "0",
      codFaena: filters?.codFaena || "0",
      producto: filters?.producto || "DIESEL",
    }
  );

  console.log(`[sigetra] Got ${raw.length} summary records`);
  return raw.map(mapFuelSummary);
}

export async function checkSigetraConnection(): Promise<{ connected: boolean; message: string; user: string }> {
  try {
    const user = process.env.SIGETRA_USER;
    if (!user || !process.env.SIGETRA_PASSWORD) {
      return { connected: false, message: "Credenciales Sigetra no configuradas", user: "" };
    }
    await getSession();
    return { connected: true, message: "Conectado a Sigetra Web", user: user };
  } catch (err: any) {
    return { connected: false, message: err.message || "Error de conexion", user: process.env.SIGETRA_USER || "" };
  }
}

let fuelDataCache: { data: SigetraFuelRecord[]; from: string; to: string; timestamp: number } | null = null;
const FUEL_CACHE_TTL = 10 * 60 * 1000;

export async function getCachedFuelData(from: Date, to: Date): Promise<SigetraFuelRecord[]> {
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  if (fuelDataCache && fuelDataCache.from === fromStr && fuelDataCache.to === toStr && Date.now() - fuelDataCache.timestamp < FUEL_CACHE_TTL) {
    return fuelDataCache.data;
  }

  const data = await getSigetraFuelData(from, to);
  fuelDataCache = { data, from: fromStr, to: toStr, timestamp: Date.now() };
  return data;
}

import { pool } from "./db";
import { getVehicles } from "./volvo-api";

export async function syncVolvoVinsToCamiones(): Promise<number> {
  try {
    const volvoVehicles = await getVehicles();
    console.log(`[vin-sync] Got ${volvoVehicles.length} vehicles from Volvo`);

    let linked = 0;
    for (const v of volvoVehicles) {
      const name = (v.CustomerVehicleName || "").trim().toUpperCase();
      if (!name || !v.VIN) continue;
      const modelo = [v.Brand, v.Model].filter(Boolean).join(" ") || null;

      const r1 = await pool.query(
        "UPDATE camiones SET vin = $1, modelo = COALESCE(NULLIF(modelo, 'N/D'), $3) WHERE UPPER(patente) = $2 AND (vin IS NULL OR vin != $1) RETURNING id",
        [v.VIN, name, modelo]
      );
      if (r1.rowCount && r1.rowCount > 0) { linked++; continue; }

      const r2 = await pool.query(
        "UPDATE camiones SET vin = $1, modelo = COALESCE(NULLIF(modelo, 'N/D'), $3) WHERE num_veh = $2 AND (vin IS NULL OR vin != $1) RETURNING id, patente",
        [v.VIN, name, modelo]
      );
      if (r2.rowCount && r2.rowCount > 0) {
        linked++;
        console.log(`[vin-sync] Linked ${r2.rows[0].patente} via numVeh=${name} -> VIN=${v.VIN}`);
      }
    }
    console.log(`[vin-sync] Linked ${linked} camiones with Volvo VINs`);
    return linked;
  } catch (err: any) {
    console.error("[vin-sync] Error:", err.message);
    return 0;
  }
}

export async function syncSigetraToCargas(from: Date, to: Date): Promise<{ inserted: number; skipped: number; noMatch: number; camionesCreated: number }> {
  const records = await getCachedFuelData(from, to);
  console.log(`[sigetra-sync] Syncing ${records.length} records to cargas table`);

  const faenasRes = await pool.query("SELECT id, nombre FROM faenas");
  const faenaNameToId = new Map<string, number>();
  for (const f of faenasRes.rows) {
    faenaNameToId.set(f.nombre.toUpperCase(), f.id);
  }

  const camionesRes = await pool.query("SELECT id, patente FROM camiones");
  const patenteToId = new Map<string, number>();
  for (const row of camionesRes.rows) {
    patenteToId.set(row.patente, row.id);
  }

  let camionesCreated = 0;
  const uniquePatentes = new Map<string, { faena: string | null; modelo: string | null; numVeh: string | null }>();
  for (const r of records) {
    const p = r.patente;
    if (p && !patenteToId.has(p) && !uniquePatentes.has(p)) {
      uniquePatentes.set(p, { faena: r.faena, modelo: r.marca ? `${r.marca} ${r.modelo || ""}`.trim() : null, numVeh: r.numVeh ? String(r.numVeh) : null });
    }
  }

  for (const [pat, info] of uniquePatentes) {
    let faenaId = 1;
    if (info.faena) {
      const upper = info.faena.toUpperCase();
      if (upper.includes("CENCOSUD")) faenaId = faenaNameToId.get("CENCOSUD") || 1;
      else {
        for (const [name, id] of faenaNameToId) {
          if (upper.includes(name)) { faenaId = id; break; }
        }
      }
    }
    try {
      const res = await pool.query(
        "INSERT INTO camiones (patente, modelo, faena_id, num_veh) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id",
        [pat, info.modelo || "N/D", faenaId, info.numVeh]
      );
      if (res.rows.length > 0) {
        patenteToId.set(pat, res.rows[0].id);
        camionesCreated++;
      } else if (info.numVeh) {
        await pool.query(
          "UPDATE camiones SET num_veh = $1 WHERE patente = $2 AND num_veh IS NULL",
          [info.numVeh, pat]
        ).catch(() => {});
      }
    } catch (err: any) {
      console.error(`[sigetra-sync] Error creating camion ${pat}:`, err.message);
    }
  }

  if (camionesCreated > 0) {
    console.log(`[sigetra-sync] Created ${camionesCreated} new camiones from Sigetra data`);
  }

  let inserted = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const r of records) {
    if (!r.numGuia) { skipped++; continue; }
    if (r.cantidadLt == null || r.cantidadLt <= 0) { skipped++; continue; }

    const camionId = patenteToId.get(r.patente) || patenteToId.get(String(r.numVeh || ""));
    if (!camionId) { noMatch++; continue; }

    try {
      await pool.query(
        `INSERT INTO cargas (camion_id, fecha, litros_surtidor, litros_ecu, km_anterior, km_actual, proveedor, num_guia, patente, conductor, lugar_consumo, faena, rend_real, desviacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (num_guia) WHERE num_guia IS NOT NULL DO NOTHING`,
        [
          camionId,
          r.fechaConsumo,
          r.cantidadLt,
          0,
          r.odometroPrevio || 0,
          r.odometroActual || 0,
          r.lugarConsumo || "SIGETRA",
          r.numGuia,
          r.patente,
          r.nombreConductor,
          r.lugarConsumo,
          r.faena,
          r.rendReal,
          r.desviacion,
        ]
      );
      inserted++;
    } catch (err: any) {
      if (!err.message?.includes("duplicate")) {
        console.error(`[sigetra-sync] Error inserting guia ${r.numGuia}:`, err.message);
      }
      skipped++;
    }
  }

  console.log(`[sigetra-sync] Done: ${inserted} inserted, ${skipped} skipped, ${noMatch} no camion match, ${camionesCreated} camiones created`);
  return { inserted, skipped, noMatch, camionesCreated };
}
