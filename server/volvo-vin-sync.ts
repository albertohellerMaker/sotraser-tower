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
