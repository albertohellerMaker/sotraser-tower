/**
 * Script para importar geocercas desde CSV a tabla geo_bases.
 * Uso: DATABASE_URL=... npx tsx server/scripts/importar-geocercas.ts
 */
import fs from "fs";
import pg from "pg";

const CSV_PATH = "/Users/albertoheller/Downloads/geocercas_get.csv";

// --- Clasificación por nombre ---
function inferirTipo(nombre: string): string {
  const n = nombre.toUpperCase();
  if (n.includes("BASE") || n.includes("SOTRASER")) return "BASE";
  if (
    n.includes("WALMART") || n.includes("JUMBO") || n.includes("LIDER") ||
    n.includes("SANTA ISABEL") || n.includes("SUPERBODEGA") ||
    n.includes("EKONO") || n.includes("UNIMARC") || n.includes("ACUENTA") ||
    n.includes("CENCOSUD") || n.includes("CENTRAL ABASTOS")
  ) return "CD";
  if (
    n.includes("MINA") || n.includes("ANGLO") || n.includes("LOS BRONCES") ||
    n.includes("EL SOLDADO") || n.includes("CHUQUICAMATA") ||
    n.includes("MINISTRO") || n.includes("GLENCORE") || n.includes("KPIAC") ||
    n.includes("KPIAN") || n.includes("CODELCO")
  ) return "MINA";
  if (
    n.includes("COPEC") || n.includes("SHELL") || n.includes("PETROBRAS") ||
    n.includes("EVC") || n.includes("ENEX") || n.includes("TERPEL")
  ) return "ESTACION";
  return "GENERAL";
}

const RADIO_POR_TIPO: Record<string, number> = {
  BASE: 500,
  CD: 300,
  MINA: 1000,
  ESTACION: 200,
  GENERAL: 500,
};

// --- Parsear CSV con campos multiline ---
function parseCsv(raw: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const lines = raw.split("\n");

  // Parse header
  const headerLine = lines[0];
  const headers = headerLine.split(",").map(h => h.replace(/"/g, "").trim());

  let currentRow = "";
  for (let i = 1; i < lines.length; i++) {
    currentRow += (currentRow ? "\n" : "") + lines[i];
    // Count quotes - if odd, the row is incomplete (multiline field)
    const quoteCount = (currentRow.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) continue;

    // Parse complete row
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (const ch of currentRow) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());

    if (fields.length >= headers.length) {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = fields[idx] || ""; });
      rows.push(obj);
    }
    currentRow = "";
  }
  return rows;
}

// --- Extraer lat/lng del centroide POINT(lng lat) ---
function parseCentroide(point: string): { lat: number; lng: number } | null {
  const match = point.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
  if (!match) return null;
  const lng = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL no definida");
    process.exit(1);
  }

  console.log("Leyendo CSV...");
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(raw);
  console.log(`CSV parseado: ${rows.length} filas`);

  // Parsear y clasificar
  const geocercas: Array<{
    nombre: string; lat: number; lng: number;
    tipo: string; radio: number; contrato: string;
  }> = [];

  const sinCentroide: string[] = [];
  const duplicados = new Set<string>();

  for (const row of rows) {
    const nombre = (row.nombre || "").trim();
    if (!nombre) continue;

    // Deduplicar por nombre
    const key = nombre.toUpperCase();
    if (duplicados.has(key)) continue;
    duplicados.add(key);

    const coords = parseCentroide(row.centroide_gm || "");
    if (!coords) {
      sinCentroide.push(nombre);
      continue;
    }

    const tipo = inferirTipo(nombre);
    geocercas.push({
      nombre,
      lat: coords.lat,
      lng: coords.lng,
      tipo,
      radio: RADIO_POR_TIPO[tipo],
      contrato: "GENERAL",
    });
  }

  console.log(`\nGeocercas válidas: ${geocercas.length}`);
  console.log(`Sin centroide (descartadas): ${sinCentroide.length}`);
  if (sinCentroide.length > 0) {
    console.log(`  Ejemplos: ${sinCentroide.slice(0, 5).join(", ")}`);
  }

  // Contar por tipo
  const porTipo: Record<string, number> = {};
  for (const g of geocercas) {
    porTipo[g.tipo] = (porTipo[g.tipo] || 0) + 1;
  }
  console.log("\nDistribución por tipo:");
  for (const [tipo, count] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tipo.padEnd(10)} ${count}`);
  }

  // Conectar a DB
  console.log("\nConectando a base de datos...");
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Verificar cuántas geocercas hay antes
  const antes = await client.query("SELECT count(*) as c FROM geo_bases");
  console.log(`Geocercas existentes en DB: ${antes.rows[0].c}`);

  // Upsert: insertar o actualizar por nombre
  let insertadas = 0;
  let actualizadas = 0;
  let errores = 0;

  for (const g of geocercas) {
    try {
      const existe = await client.query(
        "SELECT id FROM geo_bases WHERE nombre = $1 LIMIT 1",
        [g.nombre]
      );

      if (existe.rows.length > 0) {
        await client.query(
          `UPDATE geo_bases SET lat = $1, lng = $2, radio_metros = $3, contrato = $4, activa = true
           WHERE nombre = $5`,
          [g.lat.toFixed(7), g.lng.toFixed(7), g.radio, g.contrato, g.nombre]
        );
        actualizadas++;
      } else {
        await client.query(
          `INSERT INTO geo_bases (nombre, lat, lng, radio_metros, contrato, activa)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [g.nombre, g.lat.toFixed(7), g.lng.toFixed(7), g.radio, g.contrato]
        );
        insertadas++;
      }
    } catch (err: any) {
      errores++;
      if (errores <= 3) console.error(`  Error en "${g.nombre}": ${err.message}`);
    }
  }

  // Verificar después
  const despues = await client.query("SELECT count(*) as c FROM geo_bases");

  console.log("\n════════════════════════════════════");
  console.log("  RESUMEN DE IMPORTACIÓN");
  console.log("════════════════════════════════════");
  console.log(`  Insertadas:   ${insertadas}`);
  console.log(`  Actualizadas: ${actualizadas}`);
  console.log(`  Errores:      ${errores}`);
  console.log(`  DB antes:     ${antes.rows[0].c}`);
  console.log(`  DB después:   ${despues.rows[0].c}`);
  console.log("════════════════════════════════════");

  // Resumen final por tipo desde DB
  const porTipoDB = await client.query(
    `SELECT
       CASE
         WHEN UPPER(nombre) LIKE '%BASE%' OR UPPER(nombre) LIKE '%SOTRASER%' THEN 'BASE'
         WHEN UPPER(nombre) LIKE '%WALMART%' OR UPPER(nombre) LIKE '%JUMBO%' OR UPPER(nombre) LIKE '%LIDER%'
              OR UPPER(nombre) LIKE '%SANTA ISABEL%' OR UPPER(nombre) LIKE '%SUPERBODEGA%'
              OR UPPER(nombre) LIKE '%EKONO%' OR UPPER(nombre) LIKE '%UNIMARC%'
              OR UPPER(nombre) LIKE '%ACUENTA%' OR UPPER(nombre) LIKE '%CENCOSUD%' THEN 'CD'
         WHEN UPPER(nombre) LIKE '%MINA%' OR UPPER(nombre) LIKE '%ANGLO%' OR UPPER(nombre) LIKE '%LOS BRONCES%'
              OR UPPER(nombre) LIKE '%EL SOLDADO%' OR UPPER(nombre) LIKE '%CHUQUICAMATA%'
              OR UPPER(nombre) LIKE '%MINISTRO%' OR UPPER(nombre) LIKE '%GLENCORE%'
              OR UPPER(nombre) LIKE '%KPIAC%' OR UPPER(nombre) LIKE '%KPIAN%' OR UPPER(nombre) LIKE '%CODELCO%' THEN 'MINA'
         WHEN UPPER(nombre) LIKE '%COPEC%' OR UPPER(nombre) LIKE '%SHELL%' OR UPPER(nombre) LIKE '%PETROBRAS%'
              OR UPPER(nombre) LIKE '%EVC%' OR UPPER(nombre) LIKE '%ENEX%' OR UPPER(nombre) LIKE '%TERPEL%' THEN 'ESTACION'
         ELSE 'GENERAL'
       END as tipo,
       count(*) as cantidad,
       round(avg(radio_metros)) as radio_prom
     FROM geo_bases WHERE activa = true
     GROUP BY tipo ORDER BY cantidad DESC`
  );

  console.log("\n  GEOCERCAS ACTIVAS POR TIPO:");
  console.log("  ─────────────────────────────");
  for (const r of porTipoDB.rows) {
    console.log(`  ${r.tipo.padEnd(10)} ${String(r.cantidad).padStart(4)} geocercas  (radio: ${r.radio_prom}m)`);
  }

  await client.end();
  console.log("\nListo.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
