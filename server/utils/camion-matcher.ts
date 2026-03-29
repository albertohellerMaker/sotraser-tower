import { pool } from "../db";

/**
 * Resolver VIN desde cualquier identificador (patente numérica, alfanumérica, etc.)
 */
export async function resolverVinDesdeId(id: string): Promise<string | null> {
  if (!id) return null;
  const r = await pool.query(`SELECT vin FROM camion_identidades WHERE $1 = ANY(ids_validos) AND activo = true LIMIT 1`, [id]);
  if (r.rows[0]) return r.rows[0].vin;
  // Fallback directo
  const f = await pool.query(`SELECT vin FROM camiones WHERE patente = $1 AND vin IS NOT NULL LIMIT 1`, [id]);
  return f.rows[0]?.vin || null;
}

/**
 * Resolver ID de display desde VIN
 */
export async function resolverIdDisplayDesdeVin(vin: string): Promise<string> {
  const r = await pool.query(`SELECT id_display FROM camion_identidades WHERE vin = $1 LIMIT 1`, [vin]);
  return r.rows[0]?.id_display || vin.slice(-8);
}

/**
 * Resolver todas las patentes válidas desde VIN
 */
export async function resolverPatentesDesdeVin(vin: string): Promise<string[]> {
  const r = await pool.query(`SELECT ids_validos FROM camion_identidades WHERE vin = $1 LIMIT 1`, [vin]);
  return r.rows[0]?.ids_validos || [];
}
