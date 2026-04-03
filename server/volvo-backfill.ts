import { pool } from "./db";
import {
  getVehicleStatusesRange,
  getVehiclePositionsRange,
  type RfmsVehicleStatus,
  type RfmsVehiclePosition,
} from "./volvo-api";
import { insertarGpsVolvo } from "./utils/gps-unificado";

interface BackfillProgress {
  status: "idle" | "running" | "done" | "error";
  currentDay: string;
  totalDays: number;
  daysProcessed: number;
  positionsInserted: number;
  snapshotsInserted: number;
  errores: string[];
  inicioAt: string | null;
  finAt: string | null;
}

let backfillProgress: BackfillProgress = {
  status: "idle",
  currentDay: "",
  totalDays: 0,
  daysProcessed: 0,
  positionsInserted: 0,
  snapshotsInserted: 0,
  errores: [],
  inicioAt: null,
  finAt: null,
};

export function getBackfillProgress(): BackfillProgress {
  return { ...backfillProgress };
}

async function loadVinToCamion(): Promise<Map<string, { id: number; patente: string }>> {
  const r = await pool.query(`SELECT id, patente, vin FROM camiones WHERE vin IS NOT NULL AND vin != ''`);
  const map = new Map<string, { id: number; patente: string }>();
  for (const row of r.rows) {
    map.set(row.vin, { id: row.id, patente: row.patente });
  }
  return map;
}

async function storePositions(
  positions: RfmsVehiclePosition[],
  vinMap: Map<string, { id: number; patente: string }>
): Promise<number> {
  let inserted = 0;
  for (const pos of positions) {
    const cam = vinMap.get(pos.VIN);
    if (!cam) continue;
    const gps = pos.GNSSPosition;
    if (!gps?.Latitude || !gps?.Longitude) continue;
    const ts = gps.PositionDateTime || pos.CreatedDateTime;
    if (!ts) continue;

    try {
      const existing = await pool.query(
        `SELECT 1 FROM geo_puntos WHERE camion_id = $1 AND timestamp_punto = $2 LIMIT 1`,
        [cam.id, new Date(ts)]
      );
      if (existing.rows.length > 0) continue;

      await pool.query(
        `INSERT INTO geo_puntos (camion_id, patente, lat, lng, timestamp_punto, velocidad_kmh, rumbo_grados, km_odometro, fuente)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'VOLVO_BACKFILL')`,
        [
          cam.id, cam.patente,
          gps.Latitude, gps.Longitude,
          new Date(ts),
          gps.Speed ?? pos.WheelBasedSpeed ?? 0,
          gps.Heading ?? null,
        ]
      );

      await insertarGpsVolvo(
        cam.patente, pos.VIN, gps.Latitude, gps.Longitude,
        gps.Speed ?? pos.WheelBasedSpeed ?? 0,
        gps.Heading ?? 0, new Date(ts)
      );

      inserted++;
    } catch {}
  }
  return inserted;
}

async function storeSnapshots(
  statuses: RfmsVehicleStatus[]
): Promise<number> {
  let inserted = 0;
  for (const s of statuses) {
    if (s.EngineTotalFuelUsed == null || s.HRTotalVehicleDistance == null) continue;
    const ts = s.CreatedDateTime || s.ReceivedDateTime;
    if (!ts) continue;
    const hourKey = ts.slice(0, 13) + ":00:00";

    try {
      await pool.query(
        `INSERT INTO volvo_fuel_snapshots (vin, total_fuel_used, total_distance, captured_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (vin, captured_at) DO NOTHING`,
        [s.Vin, s.EngineTotalFuelUsed, s.HRTotalVehicleDistance, hourKey]
      );
      inserted++;
    } catch {}
  }
  return inserted;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function runBackfill(
  fromDate: string,
  toDate: string,
  chunkHours: number = 6
): Promise<BackfillProgress> {
  if (backfillProgress.status === "running") return backfillProgress;

  const from = new Date(fromDate + "T00:00:00Z");
  const to = new Date(toDate + "T23:59:59Z");
  const totalDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

  backfillProgress = {
    status: "running",
    currentDay: "",
    totalDays,
    daysProcessed: 0,
    positionsInserted: 0,
    snapshotsInserted: 0,
    errores: [],
    inicioAt: new Date().toISOString(),
    finAt: null,
  };

  try {
    const vinMap = await loadVinToCamion();
    console.log(`[backfill] Starting ${fromDate} → ${toDate} (${totalDays} days, ${vinMap.size} trucks)`);

    let current = new Date(from);
    while (current < to) {
      const dayStr = current.toISOString().slice(0, 10);
      backfillProgress.currentDay = dayStr;
      console.log(`[backfill] Processing ${dayStr}...`);

      const dayEnd = addDays(current, 1);
      const chunkMs = chunkHours * 60 * 60 * 1000;
      let chunkStart = new Date(current);

      while (chunkStart < dayEnd && chunkStart < to) {
        const chunkEnd = new Date(Math.min(chunkStart.getTime() + chunkMs, dayEnd.getTime(), to.getTime()));

        try {
          const positions = await getVehiclePositionsRange(chunkStart.toISOString(), chunkEnd.toISOString());
          await new Promise(r => setTimeout(r, 1200));
          const statuses = await getVehicleStatusesRange(chunkStart.toISOString(), chunkEnd.toISOString());

          const posIns = await storePositions(positions, vinMap);
          const snapIns = await storeSnapshots(statuses);
          backfillProgress.positionsInserted += posIns;
          backfillProgress.snapshotsInserted += snapIns;

          console.log(`[backfill]   ${chunkStart.toISOString().slice(11, 16)}-${chunkEnd.toISOString().slice(11, 16)}: ${positions.length} pos (${posIns} new), ${statuses.length} stat (${snapIns} new)`);
        } catch (err: any) {
          const msg = `${dayStr} ${chunkStart.toISOString().slice(11, 16)}: ${err.message}`;
          console.error(`[backfill] Error: ${msg}`);
          backfillProgress.errores.push(msg);
        }

        chunkStart = chunkEnd;
        await new Promise(r => setTimeout(r, 1500));
      }

      backfillProgress.daysProcessed++;
      current = dayEnd;
    }

    backfillProgress.status = "done";
    backfillProgress.finAt = new Date().toISOString();
    console.log(`[backfill] DONE: ${backfillProgress.positionsInserted} positions, ${backfillProgress.snapshotsInserted} snapshots (${backfillProgress.errores.length} errors)`);
  } catch (err: any) {
    backfillProgress.status = "error";
    backfillProgress.errores.push(err.message);
    backfillProgress.finAt = new Date().toISOString();
    console.error(`[backfill] Fatal error: ${err.message}`);
  }

  return backfillProgress;
}
