import { storage } from "./storage";

const CENCOSUD_FAENA_NAME = "CENCOSUD";

let cachedFaenaId: number | null = null;
let cachedPatentes: Set<string> | null = null;
let cachedCamionIds: Set<number> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function ensureCache() {
  if (cachedFaenaId && Date.now() - cacheTime < CACHE_TTL) return;
  const faenas = await storage.getFaenas();
  const faena = faenas.find(f => f.nombre.toUpperCase().includes(CENCOSUD_FAENA_NAME));
  if (!faena) throw new Error("Faena CENCOSUD no encontrada");
  cachedFaenaId = faena.id;
  const camiones = await storage.getCamiones();
  const filtered = camiones.filter(c => c.faenaId === faena.id);
  cachedPatentes = new Set(filtered.map(c => c.patente));
  cachedCamionIds = new Set(filtered.map(c => c.id));
  cacheTime = Date.now();
}

export async function getCencosudFaenaId(): Promise<number> {
  await ensureCache();
  return cachedFaenaId!;
}

export async function getCencosudPatentes(): Promise<Set<string>> {
  await ensureCache();
  return cachedPatentes!;
}

export async function getCencosudCamionIds(): Promise<Set<number>> {
  await ensureCache();
  return cachedCamionIds!;
}

export function filterCamiones<T extends { faenaId: number | null }>(camiones: T[], faenaId: number): T[] {
  return camiones.filter(c => c.faenaId === faenaId);
}

export function filterFuelByPatentes(fuelData: any[], patentes: Set<string>): any[] {
  return fuelData.filter((r: any) => {
    return patentes.has(String(r.numVeh || ""));
  });
}

export function filterFleetByVins(fleet: any[], vins: Set<string>): any[] {
  return fleet.filter((v: any) => vins.has(v.vin));
}
