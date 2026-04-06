import { storage } from "./storage";
import { pool } from "./db";

// Dynamic — populated at startup from DB
export let CONTRATOS_ACTIVOS: string[] = ["CENCOSUD"];
export { CONTRATOS_ACTIVOS as CONTRATOS_VOLVO_ACTIVOS };
export const CONTRATO_DEFAULT = "CENCOSUD";

export async function inicializarContratos() {
  try {
    const r = await pool.query(`
      SELECT DISTINCT contrato FROM viajes_aprendizaje
      WHERE km_ecu::float > 20 AND fecha_inicio >= NOW() - INTERVAL '30 days' AND contrato IS NOT NULL
        AND contrato NOT LIKE 'ANGLO%'
      ORDER BY contrato
    `);
    if (r.rows.length > 0) {
      CONTRATOS_ACTIVOS = r.rows.map((row: any) => row.contrato);
    }
    if (!CONTRATOS_ACTIVOS.includes("CENCOSUD")) {
      CONTRATOS_ACTIVOS.unshift("CENCOSUD");
    }
    console.log("[CONFIG] Contratos activos:", CONTRATOS_ACTIVOS);
  } catch (e: any) {
    console.error("[CONFIG] Error cargando contratos:", e.message);
  }
}

export function isContratoActivo(contrato: string): boolean {
  if (!contrato) return false;
  const upper = contrato.toUpperCase();
  return CONTRATOS_VOLVO_ACTIVOS.some(c => upper.includes(c.toUpperCase()));
}

export interface ContractConfig {
  name: string;
  faenaIds: number[];
  faenaNames: string[];
}

let cachedFaenas: Map<number, string> = new Map();
let cachedCamiones: any[] = [];
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function ensureCache() {
  if (Date.now() - cacheTime < CACHE_TTL && cachedCamiones.length > 0) return;
  const faenas = await storage.getFaenas();
  cachedFaenas = new Map(faenas.map(f => [f.id, f.nombre]));
  cachedCamiones = await storage.getCamiones();
  cacheTime = Date.now();
}

export async function getContractConfig(contractName: string): Promise<ContractConfig> {
  await ensureCache();
  const faenas = await storage.getFaenas();

  const faena = faenas.find(f =>
    f.nombre.toUpperCase().includes(contractName.toUpperCase())
  );
  if (!faena) throw new Error(`Contrato ${contractName} no encontrado`);
  return {
    name: contractName.toUpperCase(),
    faenaIds: [faena.id],
    faenaNames: [faena.nombre],
  };
}

export async function getContractPatentes(contractName: string): Promise<Set<string>> {
  await ensureCache();
  const config = await getContractConfig(contractName);
  const faenaIdSet = new Set(config.faenaIds);
  return new Set(cachedCamiones.filter(c => faenaIdSet.has(c.faenaId)).map(c => c.patente));
}

export async function getContractCamiones(contractName: string): Promise<any[]> {
  await ensureCache();
  const config = await getContractConfig(contractName);
  const faenaIdSet = new Set(config.faenaIds);
  return cachedCamiones.filter(c => faenaIdSet.has(c.faenaId));
}

export async function getFaenaPatentes(faenaId: number): Promise<Set<string>> {
  await ensureCache();
  return new Set(cachedCamiones.filter(c => c.faenaId === faenaId).map(c => c.patente));
}

export async function getAllContracts(soloVolvo = false): Promise<{ name: string; faenas: { id: number; nombre: string }[]; camiones: number }[]> {
  await ensureCache();
  const faenas = await storage.getFaenas();
  const contracts: { name: string; faenas: { id: number; nombre: string }[]; camiones: number }[] = [];

  const contratosActivos = CONTRATOS_VOLVO_ACTIVOS.length > 0 ? CONTRATOS_VOLVO_ACTIVOS : faenas.map(f => f.nombre);
  for (const contrato of contratosActivos) {
    const matchedFaenas = faenas.filter(f => f.nombre.toUpperCase() === contrato.toUpperCase());
    if (matchedFaenas.length === 0) continue;
    const faenaIdSet = new Set(matchedFaenas.map(f => f.id));
    let camionesFiltered = cachedCamiones.filter(c => faenaIdSet.has(c.faenaId));
    if (soloVolvo) {
      camionesFiltered = camionesFiltered.filter(c => c.vin && c.vin.length > 0);
    }
    contracts.push({
      name: contrato,
      faenas: matchedFaenas.map(f => ({ id: f.id, nombre: f.nombre })),
      camiones: camionesFiltered.length,
    });
  }

  return contracts;
}

export function invalidateCache() {
  cacheTime = 0;
}
