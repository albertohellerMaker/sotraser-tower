import pg from "pg";

const MAX_DIST_KM = 3.0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Cargar geocercas
  const basesRes = await client.query("SELECT nombre, lat, lng FROM geo_bases WHERE activa = true");
  const bases = basesRes.rows;
  console.log(`Geocercas activas: ${bases.length}`);

  // Cargar TODOS los viajes con Punto desconocido en origen O destino
  const viajesRes = await client.query(`
    SELECT id, origen_lat, origen_lng, origen_nombre, destino_lat, destino_lng, destino_nombre
    FROM viajes_aprendizaje
    WHERE origen_nombre = 'Punto desconocido' OR origen_nombre IS NULL
       OR destino_nombre = 'Punto desconocido' OR destino_nombre IS NULL
  `);
  console.log(`Viajes a recalibrar: ${viajesRes.rows.length}`);

  let actualizados = 0;

  for (const v of viajesRes.rows) {
    const necesitaOrigen = !v.origen_nombre || v.origen_nombre === 'Punto desconocido';
    const necesitaDestino = !v.destino_nombre || v.destino_nombre === 'Punto desconocido';

    let mejorOrigen: string | null = null;
    let mejorDestino: string | null = null;
    let menorDistO = 999;
    let menorDistD = 999;

    for (const base of bases) {
      if (necesitaOrigen && v.origen_lat && v.origen_lng) {
        const d = haversineKm(
          parseFloat(v.origen_lat), parseFloat(v.origen_lng),
          parseFloat(base.lat), parseFloat(base.lng)
        );
        if (d < menorDistO && d < MAX_DIST_KM) {
          menorDistO = d;
          mejorOrigen = base.nombre;
        }
      }
      if (necesitaDestino && v.destino_lat && v.destino_lng) {
        const d = haversineKm(
          parseFloat(v.destino_lat), parseFloat(v.destino_lng),
          parseFloat(base.lat), parseFloat(base.lng)
        );
        if (d < menorDistD && d < MAX_DIST_KM) {
          menorDistD = d;
          mejorDestino = base.nombre;
        }
      }
    }

    const updates: string[] = [];
    const vals: any[] = [];
    let paramIdx = 1;

    if (mejorOrigen) {
      updates.push(`origen_nombre = $${paramIdx++}`);
      vals.push(mejorOrigen);
    }
    if (mejorDestino) {
      updates.push(`destino_nombre = $${paramIdx++}`);
      vals.push(mejorDestino);
    }

    if (updates.length > 0) {
      vals.push(v.id);
      await client.query(
        `UPDATE viajes_aprendizaje SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
        vals
      );
      actualizados++;
    }
  }

  // Resumen final
  const r1 = await client.query(`SELECT count(*) as c FROM viajes_aprendizaje WHERE origen_nombre = 'Punto desconocido' OR origen_nombre IS NULL`);
  const r2 = await client.query(`SELECT count(*) as c FROM viajes_aprendizaje WHERE destino_nombre = 'Punto desconocido' OR destino_nombre IS NULL`);
  const r3 = await client.query("SELECT count(*) as c FROM viajes_aprendizaje");

  console.log("\n════════════════════════════════════");
  console.log("  RECALIBRACIÓN COMPLETA");
  console.log("════════════════════════════════════");
  console.log(`  Viajes actualizados: ${actualizados}`);
  console.log(`  Total viajes:        ${r3.rows[0].c}`);
  console.log(`  Sin origen:          ${r1.rows[0].c}`);
  console.log(`  Sin destino:         ${r2.rows[0].c}`);
  console.log(`  Radio usado:         ${MAX_DIST_KM}km`);
  console.log("════════════════════════════════════");

  await client.end();
}

main().catch(console.error);
