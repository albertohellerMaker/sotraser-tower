import { pool } from "../db";
import crypto from "crypto";

export async function insertarGpsVolvo(
  patente: string, vin: string, lat: number, lng: number,
  velocidad: number, rumbo: number, timestamp: Date, odometro?: number, combustible?: number
): Promise<boolean> {
  if (!lat || !lng || lat === 0 || lng === 0) return false;
  const hash = crypto.createHash("md5").update(`${patente}_V_${timestamp.toISOString().substring(0, 16)}`).digest("hex");
  try {
    await pool.query(
      `INSERT INTO gps_unificado (patente, vin, lat, lng, velocidad, rumbo, timestamp_gps, fuente, es_principal, tiene_ecu, odometro, combustible_nivel, hash_dedup)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'VOLVO',true,true,$8,$9,$10) ON CONFLICT (hash_dedup) DO NOTHING`,
      [patente, vin, lat, lng, velocidad, rumbo, timestamp, odometro || null, combustible || null, hash]
    );
    return true;
  } catch { return false; }
}

export async function insertarGpsWisetrack(
  patente: string, lat: number, lng: number, velocidad: number, rumbo: number,
  timestamp: Date, rpm?: number, temp?: number, combustible?: number, conductor?: string, contrato?: string
): Promise<boolean> {
  if (!lat || !lng || lat === 0 || lng === 0) return false;
  const hash = crypto.createHash("md5").update(`${patente}_W_${timestamp.toISOString().substring(0, 16)}`).digest("hex");
  try {
    await pool.query(
      `INSERT INTO gps_unificado (patente, lat, lng, velocidad, rumbo, timestamp_gps, fuente, es_principal, tiene_ecu, rpm, temp_motor, combustible_nivel, conductor, contrato, hash_dedup)
       VALUES ($1,$2,$3,$4,$5,$6,'WISETRACK',
         NOT EXISTS (SELECT 1 FROM camion_identidades ci WHERE $1 = ANY(ci.ids_validos)),
         false,$7,$8,$9,$10,$11,$12) ON CONFLICT (hash_dedup) DO NOTHING`,
      [patente, lat, lng, velocidad, rumbo, timestamp, rpm || null, temp || null, combustible || null, conductor || null, contrato || null, hash]
    );
    return true;
  } catch { return false; }
}
