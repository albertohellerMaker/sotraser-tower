import type { Camion, Carga, Faena } from "@shared/schema";

export const PRECIO = 1180;

export interface CargaAnalizada extends Carga {
  km: number;
  dif: number;
  rend: number | null;
  estado: "CRITICO" | "ALERTA" | "OK";
}

export interface CamionStats extends Camion {
  cargasAnalizadas: CargaAnalizada[];
  criticos: number;
  litDesv: number;
  rendProm: number | null;
  pctRal: number | null;
  estado: "CRITICO" | "ALERTA" | "OK";
}

export function analizarCarga(c: Carga): CargaAnalizada {
  const km = c.kmActual - c.kmAnterior;
  const dif = c.litrosSurtidor - c.litrosEcu;
  const rend = km > 0 && c.litrosEcu > 0 ? +(km / c.litrosEcu).toFixed(2) : null;
  const estado: CargaAnalizada["estado"] = dif > 40 ? "CRITICO" : dif > 15 ? "ALERTA" : "OK";
  return { ...c, km, dif, rend, estado };
}

export function statsCamion(cam: Camion, cargasList: Carga[]): CamionStats {
  const cargasAnalizadas = cargasList.map(analizarCarga);
  const criticos = cargasAnalizadas.filter(c => c.estado === "CRITICO").length;
  const litDesv = cargasAnalizadas.filter(c => c.dif > 0).reduce((a, c) => a + c.dif, 0);
  const rends = cargasAnalizadas.filter(c => c.rend).map(c => c.rend!);
  const rendProm = rends.length ? +(rends.reduce((a, b) => a + b, 0) / rends.length).toFixed(2) : null;
  const pctRal = cam.horasMotor ? Math.round((cam.horasRalenti! / cam.horasMotor) * 100) : null;
  const estado: CamionStats["estado"] = criticos > 0 ? "CRITICO" : cargasAnalizadas.some(c => c.estado === "ALERTA") ? "ALERTA" : "OK";
  return { ...cam, cargasAnalizadas, criticos, litDesv, rendProm, pctRal, estado };
}

export const fN = (n: number | null | undefined, d = 0) =>
  n == null ? "\u2014" : Number(n).toLocaleString("es-CL", { maximumFractionDigits: d });
export const fL = (n: number | null | undefined) => n == null ? "\u2014" : `${fN(n)} L`;
export const fK = (n: number | null | undefined) => n == null ? "\u2014" : `${fN(n)} km`;
export const f$ = (n: number | null | undefined) => n == null ? "\u2014" : `$${fN(n)}`;

export const statusColor = (s: string) =>
  s === "CRITICO" ? "text-red-500" : s === "ALERTA" ? "text-amber-400" : "text-emerald-400";

export const statusBg = (s: string) =>
  s === "CRITICO" ? "bg-red-500/10 border-red-500/30 text-red-400" :
  s === "ALERTA" ? "bg-amber-400/10 border-amber-400/30 text-amber-400" :
  "bg-emerald-400/10 border-emerald-400/30 text-emerald-400";

export const rendColor = (r: number | null, meta: number) =>
  !r ? "text-muted-foreground" : r >= meta ? "text-emerald-400" : r >= meta * 0.9 ? "text-amber-400" : "text-red-400";

export interface Percentiles {
  p50: number;
  p75: number;
  p90: number;
  totalCamiones: number;
  fechaCalculo: string | null;
  calibrando: boolean;
}

export type NivelPercentil = "EXCELENTE" | "BUENO" | "NORMAL" | "BAJO" | "CRITICO";

export function getNivelPercentil(rend: number | null, p: Percentiles): NivelPercentil {
  if (!rend || rend <= 0 || p.calibrando) return "BAJO";
  if (rend >= p.p90) return "EXCELENTE";
  if (rend >= p.p75) return "BUENO";
  if (rend >= p.p50) return "NORMAL";
  if (rend < p.p50 * 0.7) return "CRITICO";
  return "BAJO";
}

export function rendColorPercentil(rend: number | null, p: Percentiles): string {
  if (!rend || rend <= 0) return "text-muted-foreground";
  if (p.calibrando) return rendColor(rend, 2.1);
  const nivel = getNivelPercentil(rend, p);
  if (nivel === "EXCELENTE") return "text-emerald-400";
  if (nivel === "BUENO") return "text-emerald-400/70";
  if (nivel === "NORMAL") return "text-blue-400";
  if (nivel === "BAJO") return "text-amber-400";
  return "text-red-400";
}

export function rendBgPercentil(rend: number | null, p: Percentiles): string {
  if (!rend || rend <= 0) return "";
  if (p.calibrando) return "";
  const nivel = getNivelPercentil(rend, p);
  if (nivel === "EXCELENTE") return "bg-emerald-400/10";
  if (nivel === "BUENO") return "bg-emerald-400/5";
  if (nivel === "NORMAL") return "bg-blue-400/5";
  if (nivel === "BAJO") return "bg-amber-400/5";
  return "bg-red-400/5";
}

export function getPercentilCamion(rend: number, allRends: number[]): number {
  if (allRends.length === 0) return 0;
  const below = allRends.filter(r => r < rend).length;
  return Math.round((below / allRends.length) * 100);
}

export function getPercentilLabel(percentil: number): { text: string; color: string } {
  if (percentil >= 90) return { text: `Top ${100 - percentil}% de la flota`, color: "text-emerald-400" };
  if (percentil >= 75) return { text: `Top ${100 - percentil}% de la flota`, color: "text-emerald-400/70" };
  if (percentil >= 50) return { text: `Top ${100 - percentil}% de la flota`, color: "text-blue-400" };
  return { text: "Bajo el promedio", color: "text-amber-400" };
}

export function rendColorFlota(avgRend: number, p: Percentiles): string {
  if (p.calibrando) return "#00C87A";
  if (avgRend >= p.p75) return "#00C87A";
  if (avgRend >= p.p50) return "#FFB020";
  return "#FF2D4A";
}
