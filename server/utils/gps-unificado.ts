import { pool } from "../db";
import crypto from "crypto";

let _contratoCache = new Map<string, string>();
let _contratoCacheTs = 0;

async function getContratoByPatente(patente: string): Promise<string> {
  if (Date.now() - _contratoCacheTs > 5 * 60 * 1000 || _contratoCache.size === 0) {
    const r = await pool.query(`
      SELECT c.patente, f.nombre as contrato 
      FROM camiones c 
      JOIN faenas f ON f.id = c.faena_id 
      WHERE c.patente IS NOT NULL AND f.nombre IS NOT NULL
    `);
    _contratoCache = new Map();
    for (const row of r.rows as any[]) {
      _contratoCache.set(row.patente, row.contrato);
    }
    _contratoCacheTs = Date.now();
  }
  return _contratoCache.get(patente) || "";
}

export async function insertarGpsVolvo(
  patente: string, vin: string, lat: number, lng: number,
  velocidad: number, rumbo: number, timestamp: Date, odometro?: number, combustible?: number
): Promise<boolean> {
  if (!lat || !lng || lat === 0 || lng === 0) return false;
  const hash = crypto.createHash("md5").update(`${patente}_V_${timestamp.toISOString().substring(0, 16)}`).digest("hex");
  try {
    const contrato = await getContratoByPatente(patente);
    await pool.query(
      `INSERT INTO gps_unificado (patente, vin, lat, lng, velocidad, rumbo, timestamp_gps, fuente, es_principal, tiene_ecu, odometro, combustible_nivel, hash_dedup, contrato)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'VOLVO',true,true,$8,$9,$10,$11) ON CONFLICT (hash_dedup) DO NOTHING`,
      [patente, vin, lat, lng, velocidad, rumbo, timestamp, odometro || null, combustible || null, hash, contrato]
    );
    return true;
  } catch { return false; }
}

