import { db } from "../db";
import { camiones } from "../../shared/schema";
import { isNotNull } from "drizzle-orm";

let _vinAPatente: Map<string, string> | null = null;
let _patenteAVin: Map<string, string> | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000;

export async function getVinPatente(): Promise<Map<string, string>> {
  await refreshCacheIfNeeded();
  return _vinAPatente!;
}

export async function getPatenteVin(): Promise<Map<string, string>> {
  await refreshCacheIfNeeded();
  return _patenteAVin!;
}

async function refreshCacheIfNeeded() {
  if (_vinAPatente && Date.now() - _cacheTime < CACHE_TTL) return;

  const todos = await db.select().from(camiones).where(isNotNull(camiones.vin));

  const porVin: Record<string, typeof todos> = {};
  for (const c of todos) {
    if (!c.vin) continue;
    if (!porVin[c.vin]) porVin[c.vin] = [];
    porVin[c.vin].push(c);
  }

  const vinAPatenteMap = new Map<string, string>();
  const patenteAVinMap = new Map<string, string>();

  for (const [vin, registros] of Object.entries(porVin)) {
    const alfanumerica = registros.find(r => /^[A-Z]{4}[0-9]{2}$/.test(r.patente || ""));
    const conLetras = registros.find(r => /[A-Z]/.test(r.patente || ""));
    const cualquiera = registros[0];

    const elegida = alfanumerica || conLetras || cualquiera;

    if (elegida?.patente) {
      vinAPatenteMap.set(vin, elegida.patente);
      patenteAVinMap.set(elegida.patente, vin);

      for (const r of registros) {
        if (r.patente && r.patente !== elegida.patente) {
          patenteAVinMap.set(r.patente, vin);
        }
      }
    }
  }

  _vinAPatente = vinAPatenteMap;
  _patenteAVin = patenteAVinMap;
  _cacheTime = Date.now();

  console.log(
    `[VIN-PATENTE] Cache actualizado: ${vinAPatenteMap.size} VINs resueltos, ${patenteAVinMap.size} patentes mapeadas`
  );
}

export async function resolverVinAPatente(vin: string): Promise<string | null> {
  const map = await getVinPatente();
  return map.get(vin) || null;
}

export async function resolverPatenteAVin(patente: string): Promise<string | null> {
  const map = await getPatenteVin();
  return map.get(patente) || null;
}

export async function diagnosticoVinPatente() {
  const map = await getVinPatente();
  const pMap = await getPatenteVin();
  const todos = await db.select().from(camiones).where(isNotNull(camiones.vin));

  const totalVins = new Set(todos.map(c => c.vin)).size;
  const resueltos = map.size;
  const totalPatentes = pMap.size;

  const duplicados = Object.entries(
    todos.reduce((acc, c) => {
      if (!c.vin) return acc;
      if (!acc[c.vin]) acc[c.vin] = [];
      acc[c.vin].push(c.patente);
      return acc;
    }, {} as Record<string, string[]>)
  ).filter(([, pats]) => pats.length > 1);

  return {
    total_vins: totalVins,
    vins_resueltos: resueltos,
    patentes_mapeadas: totalPatentes,
    vins_con_duplicados: duplicados.length,
    cobertura_pct: Math.round((resueltos / totalVins) * 100),
    muestra_mapeo: Array.from(map.entries()).slice(0, 10).map(([vin, pat]) => ({ vin, patente: pat })),
    muestra_duplicados: duplicados.slice(0, 5).map(([vin, pats]) => ({ vin, patentes: pats })),
  };
}

export function invalidarCache() {
  _vinAPatente = null;
  _patenteAVin = null;
  _cacheTime = 0;
}
