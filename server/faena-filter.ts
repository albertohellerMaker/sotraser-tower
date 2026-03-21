import { storage } from "./storage";
import { pool } from "./db";

export const CONTRATOS_VOLVO_ACTIVOS = ["CENCOSUD", "ANGLO-CARGAS VARIAS", "ANGLO-CAL", "ANGLO-COCU"];

export function isContratoActivo(contrato: string): boolean {
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

  if (contractName.toUpperCase() === "ANGLO") {
    const angloFaenas = faenas.filter(f =>
      f.nombre.toUpperCase().includes("ANGLO")
    );
    return {
      name: "ANGLO",
      faenaIds: angloFaenas.map(f => f.id),
      faenaNames: angloFaenas.map(f => f.nombre),
    };
  }

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

  for (const contrato of CONTRATOS_VOLVO_ACTIVOS) {
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
