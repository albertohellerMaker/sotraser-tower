import pg from "pg";

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const r1 = await client.query(`SELECT count(*) as c FROM viajes_aprendizaje WHERE origen_nombre = 'Punto desconocido' OR origen_nombre IS NULL`);
  console.log("Viajes aún sin origen:", r1.rows[0].c);

  const r2 = await client.query(`SELECT count(*) as c FROM viajes_aprendizaje WHERE destino_nombre = 'Punto desconocido' OR destino_nombre IS NULL`);
  console.log("Viajes aún sin destino:", r2.rows[0].c);

  const r3 = await client.query("SELECT count(*) as c FROM viajes_aprendizaje");
  console.log("Total viajes:", r3.rows[0].c);

  const r4 = await client.query(`SELECT count(*) as c FROM viajes_aprendizaje WHERE origen_nombre != 'Punto desconocido' AND origen_nombre IS NOT NULL`);
  console.log("Viajes con origen resuelto:", r4.rows[0].c);

  // Muestra 5 viajes no resueltos con distancia a geocerca más cercana
  const r5 = await client.query(`
    SELECT va.id, va.origen_lat, va.origen_lng, va.origen_nombre, va.destino_nombre,
      (SELECT min(
        6371 * 2 * asin(sqrt(
          power(sin(radians(va.origen_lat::float - gb.lat::float)/2), 2) +
          cos(radians(va.origen_lat::float)) * cos(radians(gb.lat::float)) *
          power(sin(radians(va.origen_lng::float - gb.lng::float)/2), 2)
        ))
      ) FROM geo_bases gb WHERE gb.activa = true) as dist_min_km
    FROM viajes_aprendizaje va
    WHERE va.origen_nombre = 'Punto desconocido'
    ORDER BY va.id DESC
    LIMIT 10
  `);
  console.log("\nEjemplos no resueltos (dist a geocerca más cercana):");
  for (const r of r5.rows) {
    console.log(`  id=${r.id} lat=${r.origen_lat} lng=${r.origen_lng} dist_min=${parseFloat(r.dist_min_km).toFixed(2)}km`);
  }

  await client.end();
}

main().catch(console.error);
