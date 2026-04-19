import { pool } from "./server/db";
(async () => {
  // 1. WiseTrack health
  const wt = await pool.query(`
    SELECT ts::time as t, records_fetched as f, records_saved as s, latency_ms as ms,
           EXTRACT(EPOCH FROM (NOW() - newest_record_ts))::int as lag_s, mode, error
    FROM wisetrack_sync_log ORDER BY ts DESC LIMIT 5
  `);
  console.log("=== WISETRACK SYNC (últimos 5) ===");
  wt.rows.forEach((x: any) => console.log(`  ${x.t} | f=${String(x.f).padStart(4)} s=${String(x.s).padStart(4)} | ${String(x.ms).padStart(4)}ms | lag=${x.lag_s}s | ${x.mode}${x.error ? ' | ERR: '+x.error : ''}`));

  // 2. Posiciones recientes
  const pos = await pool.query(`
    SELECT COUNT(*) as total, COUNT(DISTINCT patente) as patentes,
           COUNT(*) FILTER (WHERE creado_at >= NOW() - interval '5 min') as ult_5min,
           COUNT(*) FILTER (WHERE creado_at >= NOW() - interval '1 hour') as ult_1h
    FROM wisetrack_posiciones
  `);
  console.log("\n=== POSICIONES GPS ===");
  console.log(`  Total: ${Number(pos.rows[0].total).toLocaleString()} | Patentes: ${pos.rows[0].patentes}`);
  console.log(`  Últimos 5min: ${pos.rows[0].ult_5min} | Última hora: ${pos.rows[0].ult_1h}`);

  // 3. Viajes T-1 últimos 7 días
  const v = await pool.query(`
    SELECT fecha::date as f, COUNT(*) as viajes,
           COUNT(*) FILTER (WHERE ingreso_tarifa > 0) as facturables,
           COALESCE(SUM(ingreso_tarifa), 0)::bigint as total
    FROM viajes_aprendizaje
    WHERE cliente='CENCOSUD' AND fecha >= CURRENT_DATE - 7
    GROUP BY f ORDER BY f DESC
  `);
  console.log("\n=== T-1 CENCOSUD (últimos 7 días) ===");
  let totalSemana = 0n;
  v.rows.forEach((x: any) => {
    const t = BigInt(x.total);
    totalSemana += t;
    console.log(`  ${x.f.toISOString().substring(0,10)} | ${String(x.viajes).padStart(3)} viajes | ${String(x.facturables).padStart(3)} facturables | $${Number(t).toLocaleString('es-CL')}`);
  });
  console.log(`  TOTAL 7d: $${Number(totalSemana).toLocaleString('es-CL')}`);

  // 4. Camiones CENCOSUD activos
  const flota = await pool.query(`
    WITH ult AS (SELECT patente, MAX(fecha) as ultimo FROM wisetrack_posiciones WHERE grupo1='CENCOSUD' GROUP BY patente)
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE ultimo >= NOW() - interval '30 min') as activos_30m,
           COUNT(*) FILTER (WHERE ultimo >= NOW() - interval '6 hours') as activos_6h,
           COUNT(*) FILTER (WHERE ultimo < NOW() - interval '24 hours') as inactivos_24h
    FROM ult
  `);
  console.log("\n=== FLOTA CENCOSUD ===");
  console.log(JSON.stringify(flota.rows[0], null, 2));

  await pool.end();
})();
