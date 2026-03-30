/**
 * IMPORTAR GEOCERCAS KML/TXT → BD CENCOSUD
 * ─────────────────────────────────────────────────────────────────
 * Uso:  npx tsx server/scripts/importar-kml-cencosud.ts [ruta]
 * Default: busca ~/Downloads/Geocercas_*.kml o Geocercas_*.txt
 *
 * Crea tabla cencosud_geocercas_kml y hace UPSERT.
 * Las geocercas KML son regla absoluta: el agente no las toca.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { pool } from "../db";

// ── Reparar encoding roto (UTF-8 leído como Latin-1) ─────────────
function repararEncoding(s: string): string {
  return s
    .replace(/Ã³/g, "ó").replace(/Ã¡/g, "á").replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í").replace(/Ãº/g, "ú").replace(/Ã±/g, "ñ")
    .replace(/Ã¼/g, "ü").replace(/Ã‰/g, "É").replace(/Ã"/g, "Ó")
    .replace(/Ã€/g, "À").replace(/Ã‡/g, "Ç").replace(/Ã¨/g, "è")
    .replace(/Ã²/g, "ò").replace(/Ã¹/g, "ù").replace(/Ã¢/g, "â")
    .replace(/Ã¦/g, "æ").replace(/ï»¿/g, ""); // quitar BOM
}

// ── Haversine (metros) ──────────────────────────────────────────
function distMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Tipo desde nombre ───────────────────────────────────────────
function detectarTipo(nombre: string): string {
  const n = nombre.toUpperCase();
  // Detectar CDs — incluso con encoding roto ("DISTRIBUCI" cubre distribución/distribuciÃ³n)
  if (n.includes("BODEGA") || n.startsWith("CD ") || n.includes(" CD ") ||
      n.includes("DISTRIBUCI") || n.includes("TRANSFERENCIA") || n.includes("BODEGAS SAN")) return "CD";
  if (n.includes("JUMBO")) return "JUMBO";
  if (n.includes("SANTA ISABEL") || n.startsWith("SISA ")) return "SANTA_ISABEL";
  if (n.includes("LIDER") || n.includes("LÍDER")) return "LIDER";
  if (n.includes("COPEC") || n.includes("SERVICENTRO") || n.includes("ES COPEC")) return "COPEC";
  if (n.includes("SOTRASER")) return "BASE";
  if (n.includes("HOSTERIA") || n.includes("HOSTERI") || n.includes("DESCANSO") ||
      n.includes("KEKO") || n.includes("PAILLACO") || n.includes("ESTACIONAMIENTO") || n.includes("LUENGO")) return "DESCANSO";
  if (n.includes("PEAJE") || n.includes("PESAJE")) return "PEAJE";
  if (n.includes("GEOCERCA ZONA")) return "ZONA";
  if (n.includes("SCANIA") || n.includes("KAUFMAN") || n.includes("GALLARDO") ||
      n.includes("WATTS") || n.includes("SOPROLE") || n.includes("PROLESUR") ||
      n.includes("PROTEIN") || n.includes("BORDACHAR")) return "CLIENTE";
  return "OTRO";
}

// ── Parsear coordenadas KML ─────────────────────────────────────
// Soporta dos formatos:
//   Normal:  "-70.885077,-33.461036,0"
//   Con espacio: "- 70.885077,-33.461036,0"  ← el archivo .txt tiene este formato
function parsearCoordenadas(raw: string): [number, number][] {
  // Normalizar "- NUMBER" → "-NUMBER" (espacio tras el signo menos)
  const normalizado = raw.replace(/- (\d)/g, "-$1");

  // Cada coordenada puede estar separada por salto de línea o espacio
  // Formato: "lng,lat,alt"
  const triplets = normalizado.trim().split(/[\s\n]+/).filter(t => t.includes(","));

  return triplets
    .map(t => {
      const partes = t.split(",");
      if (partes.length < 2) return null;
      const lng = parseFloat(partes[0]);
      const lat = parseFloat(partes[1]);
      return [lat, lng] as [number, number];
    })
    .filter((c): c is [number, number] => c !== null && !isNaN(c[0]) && !isNaN(c[1]));
}

// ── Centroide ────────────────────────────────────────────────────
function centroide(coords: [number, number][]): { lat: number; lng: number } {
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return { lat, lng };
}

// ── Radio: máx distancia centroide→vértice + 10% buffer ──────────
function calcularRadio(centro: { lat: number; lng: number }, coords: [number, number][]): number {
  const maxDist = Math.max(...coords.map(c => distMetros(centro.lat, centro.lng, c[0], c[1])));
  return Math.max(Math.ceil(maxDist * 1.1), 100); // mínimo 100m
}

// ── Tipos ────────────────────────────────────────────────────────
interface Geocerca {
  kml_id: number | null;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
  radio_m: number;
  poligono: [number, number][];
}

// ── Parsear un bloque <Placemark> ────────────────────────────────
function parsearPlacemark(bloque: string): Geocerca | null {
  const nombreMatch = bloque.match(/<name>\s*([\s\S]*?)\s*<\/name>/);
  const coordMatch  = bloque.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/);
  const idMatch     = bloque.match(/ID:\s*(\d+)/);

  if (!nombreMatch || !coordMatch) return null;

  const nombreRaw = nombreMatch[1].trim();
  const nombre    = repararEncoding(nombreRaw);
  const coords    = parsearCoordenadas(coordMatch[1]);

  if (coords.length < 3) {
    console.warn(`  ⚠ Skipped (${coords.length} vértices): ${nombre}`);
    return null;
  }

  const centro  = centroide(coords);
  const radio   = calcularRadio(centro, coords);
  const kml_id  = idMatch ? parseInt(idMatch[1]) : null;

  return {
    kml_id,
    nombre,
    tipo: detectarTipo(nombre),
    lat: parseFloat(centro.lat.toFixed(7)),
    lng: parseFloat(centro.lng.toFixed(7)),
    radio_m: radio,
    poligono: coords,
  };
}

// ── Crear tabla ──────────────────────────────────────────────────
async function crearTabla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cencosud_geocercas_kml (
      id              SERIAL PRIMARY KEY,
      kml_id          INTEGER,
      nombre          TEXT NOT NULL,
      tipo            VARCHAR(50),
      lat             NUMERIC(10,7) NOT NULL,
      lng             NUMERIC(10,7) NOT NULL,
      radio_m         INTEGER NOT NULL,
      poligono        JSONB NOT NULL,
      nombre_contrato TEXT,
      activa          BOOLEAN DEFAULT true,
      importado_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(nombre)
    )
  `);
  console.log("[KML] Tabla cencosud_geocercas_kml lista");
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  // Buscar archivo: argumento, o ~/Downloads/Geocercas_*.{kml,txt}
  let filePath = process.argv[2];
  if (!filePath) {
    const downloads = path.join(os.homedir(), "Downloads");
    const archivos = fs.readdirSync(downloads)
      .filter(f => f.startsWith("Geocercas_") && (f.endsWith(".kml") || f.endsWith(".txt")))
      .sort().reverse();
    if (archivos.length === 0) {
      console.error("[KML] No se encontró archivo en ~/Downloads. Pasa la ruta como argumento.");
      process.exit(1);
    }
    filePath = path.join(downloads, archivos[0]);
  }

  console.log(`[KML] Leyendo: ${filePath}`);
  const xml = fs.readFileSync(filePath, "utf-8");

  // Extraer Placemarks
  const placemarks = xml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || [];
  console.log(`[KML] ${placemarks.length} Placemarks encontrados`);

  // Parsear
  const geocercas: Geocerca[] = [];
  for (const bloque of placemarks) {
    const geo = parsearPlacemark(bloque);
    if (geo) geocercas.push(geo);
  }
  console.log(`[KML] ${geocercas.length} geocercas válidas\n`);

  // Preview primeras 5
  for (const g of geocercas.slice(0, 5)) {
    console.log(`  ✓ [${g.tipo.padEnd(12)}] ${g.nombre} — r=${g.radio_m}m, vértices=${g.poligono.length}`);
  }
  if (geocercas.length > 5) console.log(`  ... y ${geocercas.length - 5} más\n`);

  await crearTabla();

  // Upsert
  let insertadas = 0, actualizadas = 0;
  for (const g of geocercas) {
    const result = await pool.query(`
      INSERT INTO cencosud_geocercas_kml (kml_id, nombre, tipo, lat, lng, radio_m, poligono, importado_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (nombre) DO UPDATE SET
        kml_id = EXCLUDED.kml_id,
        tipo = EXCLUDED.tipo,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        radio_m = EXCLUDED.radio_m,
        poligono = EXCLUDED.poligono,
        activa = true,
        importado_at = NOW()
      RETURNING (xmax = 0) as es_nueva
    `, [g.kml_id, g.nombre, g.tipo, g.lat, g.lng, g.radio_m, JSON.stringify(g.poligono)]);

    if (result.rows[0]?.es_nueva) insertadas++;
    else actualizadas++;
  }

  // Aliases en geocerca_alias_contrato
  let aliases = 0;
  for (const g of geocercas) {
    try {
      await pool.query(`
        INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
        VALUES ($1, $2, 'CENCOSUD', true, 'KML_IMPORT')
        ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO UPDATE SET
          confirmado = true, creado_por = 'KML_IMPORT'
      `, [g.nombre, g.nombre]);
      aliases++;
    } catch { /* tabla puede no existir */ }
  }

  // Resumen
  console.log(`\n[KML] ✓ Importación completa:`);
  console.log(`  • ${insertadas} geocercas nuevas`);
  console.log(`  • ${actualizadas} geocercas actualizadas`);
  console.log(`  • ${aliases} aliases creados`);
  console.log(`\n[KML] Distribución por tipo:`);

  const conteo: Record<string, number> = {};
  for (const g of geocercas) conteo[g.tipo] = (conteo[g.tipo] || 0) + 1;
  for (const [tipo, n] of Object.entries(conteo).sort((a, b) => b[1] - a[1])) {
    console.log(`  • ${tipo.padEnd(15)} ${n}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
