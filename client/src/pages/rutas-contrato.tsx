import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Route, TrendingUp, TrendingDown, Fuel, Truck, ChevronDown, ChevronUp,
  MapPin, Target, AlertTriangle, Info
} from "lucide-react";
import { getErrorFleetNums, isErrorCarga } from "@/pages/errores";

interface FusionCarga {
  numGuia: number;
  fecha: string;
  litros: number;
  odometro: number | null;
  kmRecorrido: number | null;
  rendimiento: number | null;
  lugar: string | null;
  tarjeta: string | null;
  conductor: string | null;
}

interface FusionTruck {
  fleetNum: string;
  patenteReal: string | null;
  vin: string | null;
  modeloVolvo: string;
  faenaSigetra: string | null;
  conductorSigetra: string | null;
  totalLitrosSigetra: number;
  totalCargas: number;
  rendPromedio: number;
  odometroSigetra: number | null;
  odometroVolvo: number | null;
  deltaOdometro: number | null;
  fuelLevelVolvo: number | null;
  totalFuelUsedVolvo: number | null;
  litrosVolvoPeriodo: number | null;
  engineHoursVolvo: number | null;
  gpsVolvo: { latitude: number | null; longitude: number | null } | null;
  alertLevel: "ok" | "alerta" | "critico";
  cargas: FusionCarga[];
}

interface FusionResponse {
  from: string;
  to: string;
  totalTrucksMatched: number;
  totalLitros: number;
  totalCargas: number;
  alertCount: number;
  trucks: FusionTruck[];
}

interface SectorAnalysis {
  sector: string;
  totalLitros: number;
  totalKm: number;
  totalCargas: number;
  rendimiento: number;
  trucks: Set<string>;
  conductores: Set<string>;
  bestRend: { fleetNum: string; rend: number } | null;
  worstRend: { fleetNum: string; rend: number } | null;
}

interface FaenaRouteAnalysis {
  faena: string;
  sectors: SectorAnalysis[];
  globalRendimiento: number;
  totalLitros: number;
  totalKm: number;
  totalCargas: number;
  truckCount: number;
}

function fN(n: number): string {
  return n.toLocaleString("es-CL");
}

const DATA_START_DATE = "2026-03-01";

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const minDate = new Date(DATA_START_DATE + "T00:00:00");
  const effectiveFrom = from < minDate ? minDate : from;
  return { from: effectiveFrom.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function RendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
      <div className={`h-full rounded-md ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function rendColor(r: number): string {
  if (r >= 1.8) return "text-emerald-400";
  if (r >= 1.2) return "text-amber-400";
  return "text-red-400";
}

function rendBgColor(r: number): string {
  if (r >= 1.8) return "bg-emerald-500";
  if (r >= 1.2) return "bg-amber-500";
  return "bg-red-500";
}

function SectorCard({ sector, faenaRend, globalMax, rank, total }: {
  sector: SectorAnalysis;
  faenaRend: number;
  globalMax: number;
  rank: number;
  total: number;
}) {
  const vsAvg = faenaRend > 0 ? ((sector.rendimiento - faenaRend) / faenaRend) * 100 : 0;
  const isTop = rank === 1;
  const isBottom = rank === total && total > 1;

  return (
    <div
      className={`border border-border p-3 ${
        isTop ? "bg-emerald-500/5 border-emerald-500/20" : isBottom ? "bg-red-500/5 border-red-500/20" : "bg-background"
      }`}
      data-testid={`sector-card-${sector.sector}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold ${
            isTop ? "bg-emerald-500/20 text-emerald-400" : isBottom ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"
          }`}>
            #{rank}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono font-bold text-foreground truncate" data-testid={`text-sector-name-${sector.sector}`}>
              {sector.sector}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              {sector.trucks.size} camiones · {sector.conductores.size} conductores · {sector.totalCargas} cargas
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-lg font-mono font-bold ${rendColor(sector.rendimiento)}`} data-testid={`text-sector-rend-${sector.sector}`}>
            {sector.rendimiento > 0 ? sector.rendimiento.toFixed(2) : "\u2014"}
          </div>
          <div className="text-xs font-mono text-muted-foreground">km/L</div>
        </div>
      </div>

      <div className="mb-2">
        <RendBar value={sector.rendimiento} max={globalMax} color={rendBgColor(sector.rendimiento)} />
      </div>

      <div className="grid grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <span className="text-muted-foreground">Litros:</span>
          <span className="ml-1 text-amber-400 font-bold">{fN(Math.round(sector.totalLitros))}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Km:</span>
          <span className="ml-1 text-foreground font-bold">{fN(Math.round(sector.totalKm))}</span>
        </div>
        <div>
          <span className="text-muted-foreground">vs Prom:</span>
          <span className={`ml-1 font-bold ${vsAvg >= 0 ? "text-emerald-400" : vsAvg >= -15 ? "text-amber-400" : "text-red-400"}`}>
            {vsAvg >= 0 ? "+" : ""}{vsAvg.toFixed(0)}%
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">L/100km:</span>
          <span className="ml-1 text-foreground font-bold">
            {sector.rendimiento > 0 ? (100 / sector.rendimiento).toFixed(1) : "\u2014"}
          </span>
        </div>
      </div>

      {(sector.bestRend || sector.worstRend) && (
        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/30">
          {sector.bestRend && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-muted-foreground">Mejor:</span>
              <span className="text-emerald-400 font-bold">N.{sector.bestRend.fleetNum}</span>
              <span className="text-emerald-400">{sector.bestRend.rend.toFixed(2)}</span>
            </div>
          )}
          {sector.worstRend && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span className="text-muted-foreground">Peor:</span>
              <span className="text-red-400 font-bold">N.{sector.worstRend.fleetNum}</span>
              <span className="text-red-400">{sector.worstRend.rend.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RutasContrato() {
  const [days, setDays] = useState(14);
  const [expandedFaena, setExpandedFaena] = useState<string | null>(null);

  const range = useMemo(() => getDateRange(days), [days]);

  const { data: fusion, isLoading, isError } = useQuery<FusionResponse>({
    queryKey: [`/api/sigetra/fusion?from=${range.from}&to=${range.to}`],
    refetchInterval: 600000,
  });

  const errorNums = useMemo(() => {
    if (!fusion?.trucks) return new Set<string>();
    return getErrorFleetNums(fusion.trucks);
  }, [fusion]);

  const faenaRoutes = useMemo(() => {
    if (!fusion?.trucks) return [];

    const cleanTrucks = fusion.trucks
      .filter(t => !errorNums.has(t.fleetNum))
      .map(t => {
        const validCargas = t.cargas.filter(c => !isErrorCarga(c));
        return { ...t, cargas: validCargas };
      });

    const byFaena = new Map<string, FusionTruck[]>();
    cleanTrucks.forEach(t => {
      const faena = t.faenaSigetra || "Sin Faena";
      if (!byFaena.has(faena)) byFaena.set(faena, []);
      byFaena.get(faena)!.push(t);
    });

    const analyses: FaenaRouteAnalysis[] = [];

    Array.from(byFaena.entries()).forEach(([faena, trucks]) => {
      const sectorMap = new Map<string, {
        litros: number;
        km: number;
        cargas: number;
        trucks: Set<string>;
        conductores: Set<string>;
        truckRends: { fleetNum: string; litros: number; km: number }[];
      }>();

      let faenaTotalLitros = 0;
      let faenaTotalKm = 0;
      let faenaTotalCargas = 0;

      trucks.forEach(t => {
        t.cargas.forEach(c => {
          const sector = c.lugar?.trim() || "Sin Lugar";
          if (c.litros <= 0) return;
          const km = c.kmRecorrido != null && c.kmRecorrido > 0 ? c.kmRecorrido : 0;

          if (!sectorMap.has(sector)) {
            sectorMap.set(sector, { litros: 0, km: 0, cargas: 0, trucks: new Set(), conductores: new Set(), truckRends: [] });
          }

          const s = sectorMap.get(sector)!;
          s.litros += c.litros;
          s.km += km;
          s.cargas += 1;
          s.trucks.add(t.fleetNum);
          if (c.conductor) s.conductores.add(c.conductor);
          s.truckRends.push({ fleetNum: t.fleetNum, litros: c.litros, km });

          faenaTotalLitros += c.litros;
          faenaTotalKm += km;
          faenaTotalCargas += 1;
        });
      });

      const sectors: SectorAnalysis[] = [];
      Array.from(sectorMap.entries()).forEach(([sector, data]) => {
        if (data.cargas < 2) return;

        const rendimiento = data.litros > 0 ? data.km / data.litros : 0;

        const truckAgg = new Map<string, { litros: number; km: number }>();
        data.truckRends.forEach(r => {
          if (!truckAgg.has(r.fleetNum)) truckAgg.set(r.fleetNum, { litros: 0, km: 0 });
          const a = truckAgg.get(r.fleetNum)!;
          a.litros += r.litros;
          a.km += r.km;
        });

        let bestRend: { fleetNum: string; rend: number } | null = null;
        let worstRend: { fleetNum: string; rend: number } | null = null;

        Array.from(truckAgg.entries()).forEach(([fleetNum, agg]) => {
          if (agg.litros <= 0 || agg.km <= 0) return;
          const rend = agg.km / agg.litros;
          if (rend <= 0 || rend > 15) return;
          if (!bestRend || rend > bestRend.rend) bestRend = { fleetNum, rend };
          if (!worstRend || rend < worstRend.rend) worstRend = { fleetNum, rend };
        });

        if (bestRend && worstRend && bestRend.fleetNum === worstRend.fleetNum) {
          worstRend = null;
        }

        sectors.push({
          sector,
          totalLitros: data.litros,
          totalKm: data.km,
          totalCargas: data.cargas,
          rendimiento,
          trucks: data.trucks,
          conductores: data.conductores,
          bestRend,
          worstRend,
        });
      });

      sectors.sort((a, b) => b.rendimiento - a.rendimiento);

      const faenaRend = faenaTotalLitros > 0 ? faenaTotalKm / faenaTotalLitros : 0;
      const uniqueTrucks = new Set<string>(trucks.map(t => t.fleetNum));

      analyses.push({
        faena,
        sectors,
        globalRendimiento: faenaRend,
        totalLitros: faenaTotalLitros,
        totalKm: faenaTotalKm,
        totalCargas: faenaTotalCargas,
        truckCount: uniqueTrucks.size,
      });
    });

    analyses.sort((a, b) => b.totalCargas - a.totalCargas);
    return analyses;
  }, [fusion, errorNums]);

  const globalMax = useMemo(() => {
    return faenaRoutes.reduce((max, f) => {
      return f.sectors.reduce((m, s) => Math.max(m, s.rendimiento), max);
    }, 0);
  }, [faenaRoutes]);

  const globalStats = useMemo(() => {
    const totalSectors = faenaRoutes.reduce((s, f) => s + f.sectors.length, 0);
    const allSectors = faenaRoutes.flatMap(f => f.sectors).filter(s => s.rendimiento > 0);
    const bestSector = allSectors.length > 0 ? allSectors.reduce((best, s) => s.rendimiento > best.rendimiento ? s : best, allSectors[0]) : null;
    const worstSector = allSectors.length > 0 ? allSectors.reduce((worst, s) => s.rendimiento < worst.rendimiento ? s : worst, allSectors[0]) : null;
    return { totalSectors, bestSector, worstSector };
  }, [faenaRoutes]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="rutas-loading">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="rutas-page">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Route className="w-5 h-5 text-cyan-400" />
          <h1 className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground" data-testid="text-rutas-title">
            Rutas por Contrato
          </h1>
        </div>
        <span className="text-xs font-mono text-muted-foreground">Analisis de consumo por sector dentro de cada faena</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">PERIODO:</span>
        {[7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)}
            data-testid={`btn-rutas-days-${d}`}
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              days === d
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {d}D
          </button>
        ))}
      </div>

      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="rutas-error">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] font-mono text-red-400">Error al obtener datos de fusion.</span>
        </div>
      )}

      {fusion && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">SECTORES</span>
              </div>
              <div className="text-2xl font-mono font-bold text-cyan-400" data-testid="text-rutas-sectors">{globalStats.totalSectors}</div>
              <div className="text-xs font-mono text-muted-foreground">con 2+ cargas</div>
            </div>
            {globalStats.bestSector && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">MEJOR SECTOR</span>
                </div>
                <div className="text-sm font-mono font-bold text-foreground truncate" data-testid="text-best-sector">
                  {globalStats.bestSector.sector}
                </div>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {globalStats.bestSector.rendimiento.toFixed(2)} km/L
                </div>
              </div>
            )}
            {globalStats.worstSector && (
              <div className="bg-red-500/5 border border-red-500/20 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">PEOR SECTOR</span>
                </div>
                <div className="text-sm font-mono font-bold text-foreground truncate" data-testid="text-worst-sector">
                  {globalStats.worstSector.sector}
                </div>
                <div className="text-lg font-mono font-bold text-red-400">
                  {globalStats.worstSector.rendimiento.toFixed(2)} km/L
                </div>
              </div>
            )}
          </div>

          <div className="bg-cyan-500/5 border border-cyan-500/20 p-3 flex items-start gap-2" data-testid="note-rutas">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-cyan-400/80">
              <span className="font-bold text-cyan-400">Rutas por contrato:</span> Cada faena (contrato) contiene multiples sectores de carga.
              El rendimiento por sector permite identificar que tramos de la ruta tienen mayor o menor eficiencia.
              Solo se muestran sectores con 2 o mas cargas. Los porcentajes "vs Prom" comparan contra el promedio de la faena.
            </div>
          </div>

          <div className="space-y-3">
            {faenaRoutes.map(fr => (
              <Card key={fr.faena} className="overflow-visible" data-testid={`card-ruta-${fr.faena}`}>
                <CardHeader
                  className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 cursor-pointer"
                  onClick={() => setExpandedFaena(expandedFaena === fr.faena ? null : fr.faena)}
                  data-testid={`btn-expand-ruta-${fr.faena}`}
                >
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <Target className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <CardTitle className="text-sm font-mono font-bold tracking-[0.1em] uppercase truncate" data-testid={`text-ruta-faena-${fr.faena}`}>
                      {fr.faena}
                    </CardTitle>
                    <span className="text-xs font-mono text-muted-foreground">
                      {fr.sectors.length} sectores · {fr.truckCount} camiones
                    </span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono text-muted-foreground tracking-[0.15em]">REND. FAENA</div>
                      <div className={`text-lg font-mono font-bold ${rendColor(fr.globalRendimiento)}`} data-testid={`text-ruta-rend-${fr.faena}`}>
                        {fr.globalRendimiento > 0 ? `${fr.globalRendimiento.toFixed(2)} km/L` : "\u2014"}
                      </div>
                    </div>
                    {expandedFaena === fr.faena ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-4 gap-3 mb-3 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground">Litros totales:</span>
                      <span className="ml-1 text-amber-400 font-bold">{fN(Math.round(fr.totalLitros))}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Km totales:</span>
                      <span className="ml-1 text-foreground font-bold">{fN(Math.round(fr.totalKm))}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cargas:</span>
                      <span className="ml-1 text-foreground font-bold">{fN(fr.totalCargas)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">L/100km:</span>
                      <span className="ml-1 text-foreground font-bold">
                        {fr.globalRendimiento > 0 ? (100 / fr.globalRendimiento).toFixed(1) : "\u2014"}
                      </span>
                    </div>
                  </div>

                  {expandedFaena === fr.faena && (
                    <div className="space-y-2 mt-3">
                      {fr.sectors.length > 0 ? (
                        fr.sectors.map((s, idx) => (
                          <SectorCard
                            key={s.sector}
                            sector={s}
                            faenaRend={fr.globalRendimiento}
                            globalMax={globalMax}
                            rank={idx + 1}
                            total={fr.sectors.length}
                          />
                        ))
                      ) : (
                        <div className="p-4 text-center text-[11px] font-mono text-muted-foreground border border-border">
                          Sin sectores con datos suficientes (se requieren 2+ cargas por sector)
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {faenaRoutes.length === 0 && (
            <div className="p-8 text-center text-[11px] font-mono text-muted-foreground border border-border bg-card" data-testid="rutas-empty">
              No se encontraron datos de rutas en el periodo seleccionado
            </div>
          )}
        </>
      )}
    </div>
  );
}
