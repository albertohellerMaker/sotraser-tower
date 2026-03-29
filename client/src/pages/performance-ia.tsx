import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Cpu, TrendingUp, TrendingDown, Fuel, Truck, ChevronDown, ChevronUp,
  BarChart3, AlertTriangle, Info, MapPin, Target, Route, Navigation
} from "lucide-react";
import { getErrorFleetNums, isErrorCarga } from "@/pages/errores";
import { type Percentiles, getNivelPercentil, rendColorFlota } from "@/lib/fuel-utils";
import RutasContrato from "@/pages/rutas-contrato";
import CombustibleIA from "@/pages/combustible-ia";
import AnalizadorRutas from "@/pages/analizador-rutas";

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

interface FaenaAnalysis {
  faena: string;
  trucks: FusionTruck[];
  truckCount: number;
  avgRendimiento: number;
  optimo: number;
  totalLitros: number;
  totalLitrosVolvo: number;
  totalLitrosVolvoPeriodo: number;
  totalCargas: number;
  bestTruck: FusionTruck | null;
  worstTruck: FusionTruck | null;
  rendRange: { min: number; max: number };
}

function calcPercentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
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

function FaenaCard({ analysis, globalMax, expanded, onToggle }: {
  analysis: FaenaAnalysis;
  globalMax: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const trucksWithRend = analysis.trucks.filter(t => t.rendPromedio > 0).sort((a, b) => b.rendPromedio - a.rendPromedio);

  return (
    <Card className="overflow-visible" data-testid={`card-faena-${analysis.faena}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <CardTitle className="text-sm font-mono font-bold tracking-[0.1em] uppercase truncate" data-testid={`text-faena-name-${analysis.faena}`}>
            {analysis.faena}
          </CardTitle>
          <span className="text-xs font-mono text-muted-foreground">{analysis.truckCount} camiones</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap flex-shrink-0">
          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em]">REND. PROMEDIO</div>
            <div className={`text-lg font-mono font-bold ${
              analysis.avgRendimiento >= 1.8 ? "text-emerald-400" : analysis.avgRendimiento >= 1.2 ? "text-amber-400" : "text-red-400"
            }`} data-testid={`text-avg-rend-${analysis.faena}`}>
              {analysis.avgRendimiento > 0 ? `${analysis.avgRendimiento.toFixed(2)} km/L` : "\u2014"}
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 mb-3">
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">OPTIMO RUTA</div>
            <div className="text-sm font-mono font-bold text-cyan-400" data-testid={`text-optimo-${analysis.faena}`}>
              {analysis.optimo > 0 ? `${analysis.optimo.toFixed(2)} km/L` : "\u2014"}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">P75 referencia</div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">LITROS SIGETRA</div>
            <div className="text-sm font-mono font-bold text-amber-400" data-testid={`text-litros-sigetra-${analysis.faena}`}>{fN(Math.round(analysis.totalLitros))} L</div>
            <div className="text-[11px] font-mono text-muted-foreground">periodo</div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">LITROS VOLVO ECU</div>
            <div className="text-sm font-mono font-bold text-blue-400" data-testid={`text-litros-volvo-${analysis.faena}`}>
              {analysis.totalLitrosVolvoPeriodo > 0 ? `${fN(Math.round(analysis.totalLitrosVolvoPeriodo))} L` : "\u2014"}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">{analysis.totalLitrosVolvoPeriodo > 0 ? "periodo" : "sin historial"}</div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">CARGAS</div>
            <div className="text-sm font-mono font-bold text-foreground" data-testid={`text-cargas-${analysis.faena}`}>{fN(analysis.totalCargas)}</div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">RANGO REND.</div>
            <div className="text-sm font-mono font-bold text-foreground" data-testid={`text-range-${analysis.faena}`}>
              {analysis.rendRange.min > 0 ? `${analysis.rendRange.min.toFixed(1)} - ${analysis.rendRange.max.toFixed(1)}` : "\u2014"}
            </div>
          </div>
        </div>

        {analysis.bestTruck && analysis.worstTruck && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className="text-xs font-mono text-emerald-400 tracking-[0.15em]">MEJOR RENDIMIENTO</span>
              </div>
              <div className="text-xs font-mono font-bold text-foreground" data-testid={`text-best-truck-${analysis.faena}`}>
                N.{analysis.bestTruck.fleetNum} {analysis.bestTruck.patenteReal ? `(${analysis.bestTruck.patenteReal})` : ""}
              </div>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {analysis.bestTruck.rendPromedio.toFixed(2)} km/L
              </div>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3 h-3 text-red-400" />
                <span className="text-xs font-mono text-red-400 tracking-[0.15em]">MENOR RENDIMIENTO</span>
              </div>
              <div className="text-xs font-mono font-bold text-foreground" data-testid={`text-worst-truck-${analysis.faena}`}>
                N.{analysis.worstTruck.fleetNum} {analysis.worstTruck.patenteReal ? `(${analysis.worstTruck.patenteReal})` : ""}
              </div>
              <div className="text-sm font-mono font-bold text-red-400">
                {analysis.worstTruck.rendPromedio.toFixed(2)} km/L
              </div>
            </div>
          </div>
        )}

        <RendBar value={analysis.avgRendimiento} max={globalMax} color="bg-primary" />

        {expanded && trucksWithRend.length > 0 && (
          <div className="mt-4 border border-border bg-background">
            <div className="grid grid-cols-[55px_70px_1fr_95px_70px_80px_80px_55px] gap-0 bg-card px-3 py-2 border-b border-border">
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">N.INT</span>
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">PATENTE</span>
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">CONDUCTOR</span>
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">REND.</span>
              <span className="text-xs font-mono font-bold text-cyan-400/70 tracking-[0.15em]">vs OPT</span>
              <span className="text-xs font-mono font-bold text-amber-400/70 tracking-[0.15em]">L.SIGETRA</span>
              <span className="text-xs font-mono font-bold text-blue-400/70 tracking-[0.15em]">L.VOLVO ECU</span>
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">CARG.</span>
            </div>
            {trucksWithRend.map((t, idx) => {
              const isTop = idx === 0 && trucksWithRend.length > 1;
              const isBottom = idx === trucksWithRend.length - 1 && trucksWithRend.length > 1;
              const vsOptPct = analysis.optimo > 0 ? ((t.rendPromedio - analysis.optimo) / analysis.optimo) * 100 : 0;
              return (
                <div
                  key={t.fleetNum}
                  className={`grid grid-cols-[55px_70px_1fr_95px_70px_80px_80px_55px] gap-0 px-3 py-2 border-b border-border/30 ${
                    isTop ? "bg-emerald-500/5" : isBottom ? "bg-red-500/5" : ""
                  }`}
                  data-testid={`row-perf-${t.fleetNum}`}
                >
                  <span className="text-xs font-mono font-bold text-foreground">{t.fleetNum}</span>
                  <span className="text-xs font-mono text-muted-foreground">{t.patenteReal || "\u2014"}</span>
                  <span className="text-xs font-mono text-foreground truncate">{t.conductorSigetra || "\u2014"}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${
                      t.rendPromedio >= 1.8 ? "text-emerald-400" : t.rendPromedio >= 1.2 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {t.rendPromedio.toFixed(2)}
                    </span>
                    <div className="flex-1">
                      <RendBar value={t.rendPromedio} max={globalMax} color={
                        t.rendPromedio >= 1.8 ? "bg-emerald-500" : t.rendPromedio >= 1.2 ? "bg-amber-500" : "bg-red-500"
                      } />
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${vsOptPct >= 0 ? "text-emerald-400" : vsOptPct >= -15 ? "text-amber-400" : "text-red-400"}`} data-testid={`text-vs-opt-${t.fleetNum}`}>
                    {vsOptPct >= 0 ? "+" : ""}{vsOptPct.toFixed(0)}%
                  </span>
                  <span className="text-xs font-mono text-amber-400">{fN(Math.round(t.totalLitrosSigetra))} L</span>
                  <span className="text-xs font-mono text-blue-400">{t.litrosVolvoPeriodo != null ? `${fN(Math.round(t.litrosVolvoPeriodo))} L` : "\u2014"}</span>
                  <span className="text-xs font-mono text-muted-foreground">{t.totalCargas}</span>
                </div>
              );
            })}
          </div>
        )}

        {expanded && trucksWithRend.length === 0 && (
          <div className="mt-4 p-4 text-center text-[11px] font-mono text-muted-foreground border border-border">
            Sin datos de rendimiento para los camiones de esta faena
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PerformanceIA() {
  const [subTab, setSubTab] = useState<"rendimiento" | "rutas" | "combustible" | "analizador">("rendimiento");
  const [days, setDays] = useState(7);
  const [expandedFaena, setExpandedFaena] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"rend" | "litros" | "trucks">("rend");

  const range = useMemo(() => getDateRange(days), [days]);

  const { data: fusion, isLoading, isError } = useQuery<FusionResponse>({
    queryKey: [`/api/sigetra/fusion?from=${range.from}&to=${range.to}`],
    refetchInterval: 600000,
  });

  const errorNums = useMemo(() => {
    if (!fusion?.trucks) return new Set<string>();
    return getErrorFleetNums(fusion.trucks);
  }, [fusion]);

  const cleanTrucks = useMemo(() => {
    if (!fusion?.trucks) return [];
    return fusion.trucks
      .filter(t => !errorNums.has(t.fleetNum))
      .map(t => {
        const validCargas = t.cargas.filter(c => !isErrorCarga(c));
        const totalLitros = validCargas.reduce((s, c) => s + c.litros, 0);
        const totalKm = validCargas.reduce((s, c) => s + (c.kmRecorrido != null && c.kmRecorrido > 0 ? c.kmRecorrido : 0), 0);
        const rendPromedio = totalLitros > 0 ? totalKm / totalLitros : 0;
        return { ...t, cargas: validCargas, totalLitrosSigetra: totalLitros, totalCargas: validCargas.length, rendPromedio };
      });
  }, [fusion, errorNums]);

  const faenaAnalysis = useMemo(() => {
    if (cleanTrucks.length === 0) return [];

    const byFaena = new Map<string, FusionTruck[]>();
    for (const t of cleanTrucks) {
      const faena = t.faenaSigetra || "Sin Faena";
      const existing = byFaena.get(faena) || [];
      existing.push(t);
      byFaena.set(faena, existing);
    }

    const analyses: FaenaAnalysis[] = [];
    const entries = Array.from(byFaena.entries());
    for (const [faena, trucks] of entries) {
      const trucksWithRend = trucks.filter((t: FusionTruck) => t.rendPromedio > 0);
      const avgRendimiento = trucksWithRend.length > 0
        ? trucksWithRend.reduce((s: number, t: FusionTruck) => s + t.rendPromedio, 0) / trucksWithRend.length
        : 0;
      const totalLitros = trucks.reduce((s: number, t: FusionTruck) => s + t.totalLitrosSigetra, 0);
      const totalLitrosVolvo = trucks.reduce((s: number, t: FusionTruck) => s + (t.totalFuelUsedVolvo || 0), 0);
      const totalLitrosVolvoPeriodo = trucks.reduce((s: number, t: FusionTruck) => s + (t.litrosVolvoPeriodo || 0), 0);
      const totalCargas = trucks.reduce((s: number, t: FusionTruck) => s + t.totalCargas, 0);

      const sorted = [...trucksWithRend].sort((a, b) => b.rendPromedio - a.rendPromedio);
      const bestTruck = sorted[0] || null;
      const worstTruck = sorted.length > 1 ? sorted[sorted.length - 1] : null;

      const rendValues = trucksWithRend.map((t: FusionTruck) => t.rendPromedio);
      const rendRange = rendValues.length > 0
        ? { min: Math.min(...rendValues), max: Math.max(...rendValues) }
        : { min: 0, max: 0 };

      const optimo = rendValues.length >= 3 ? calcPercentile(rendValues, 75) : (rendValues.length > 0 ? Math.max(...rendValues) : 0);

      analyses.push({
        faena,
        trucks,
        truckCount: trucks.length,
        avgRendimiento,
        optimo,
        totalLitros,
        totalLitrosVolvo,
        totalLitrosVolvoPeriodo,
        totalCargas,
        bestTruck,
        worstTruck,
        rendRange,
      });
    }

    if (sortBy === "rend") analyses.sort((a, b) => b.avgRendimiento - a.avgRendimiento);
    else if (sortBy === "litros") analyses.sort((a, b) => b.totalLitros - a.totalLitros);
    else analyses.sort((a, b) => b.truckCount - a.truckCount);

    return analyses;
  }, [cleanTrucks, sortBy]);

  const globalMax = useMemo(() => {
    return faenaAnalysis.reduce((max, f) => {
      const fMax = f.trucks.reduce((m, t) => Math.max(m, t.rendPromedio), 0);
      return Math.max(max, fMax);
    }, 0);
  }, [faenaAnalysis]);

  const globalStats = useMemo(() => {
    if (cleanTrucks.length === 0) return { avgRend: 0, totalFaenas: 0, totalTrucks: 0, totalLitrosSigetra: 0, totalLitrosVolvo: 0, totalLitrosVolvoPeriodo: 0, bestFaena: "", worstFaena: "" };
    const withRend = faenaAnalysis.filter(f => f.avgRendimiento > 0);
    const sortedByRend = [...withRend].sort((a, b) => b.avgRendimiento - a.avgRendimiento);
    const totalLitrosSigetra = faenaAnalysis.reduce((s, f) => s + f.totalLitros, 0);
    const totalLitrosVolvo = faenaAnalysis.reduce((s, f) => s + f.totalLitrosVolvo, 0);
    const totalLitrosVolvoPeriodo = faenaAnalysis.reduce((s, f) => s + f.totalLitrosVolvoPeriodo, 0);
    return {
      avgRend: withRend.length > 0 ? withRend.reduce((s, f) => s + f.avgRendimiento, 0) / withRend.length : 0,
      totalFaenas: faenaAnalysis.length,
      totalTrucks: cleanTrucks.length,
      totalLitrosSigetra,
      totalLitrosVolvo,
      totalLitrosVolvoPeriodo,
      bestFaena: sortedByRend[0]?.faena || "",
      worstFaena: sortedByRend.length > 1 ? sortedByRend[sortedByRend.length - 1]?.faena || "" : "",
    };
  }, [cleanTrucks, faenaAnalysis]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="performance-loading">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const subTabs: { key: typeof subTab; label: string; icon: typeof Cpu; activeClass: string }[] = [
    { key: "rendimiento", label: "Rendimiento", icon: Cpu, activeClass: "border-primary text-primary" },
    { key: "combustible", label: "Combustible", icon: Fuel, activeClass: "border-amber-400 text-amber-400" },
    { key: "rutas", label: "Rutas Contrato", icon: Route, activeClass: "border-cyan-400 text-cyan-400" },
    { key: "analizador", label: "Analizador Rutas", icon: Navigation, activeClass: "border-violet-400 text-violet-400" },
  ];

  const renderTabBar = () => (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          <h1 className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground" data-testid="text-performance-title">
            Sotra IA
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto mb-1">
        {subTabs.map(tab => (
          <button key={tab.key} onClick={() => setSubTab(tab.key)} data-testid={`subtab-${tab.key}`}
            className={`px-4 py-2 text-xs font-mono font-bold tracking-[0.15em] uppercase border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
              subTab === tab.key ? tab.activeClass : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <tab.icon className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );

  if (subTab === "rutas") {
    return (
      <div className="space-y-4" data-testid="performance-page">
        {renderTabBar()}
        <RutasContrato />
      </div>
    );
  }

  if (subTab === "combustible") {
    return (
      <div className="space-y-4" data-testid="performance-page">
        {renderTabBar()}
        <CombustibleIA />
      </div>
    );
  }

  if (subTab === "analizador") {
    return (
      <div className="space-y-4" data-testid="performance-page">
        {renderTabBar()}
        <AnalizadorRutas />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="performance-page">
      {renderTabBar()}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">PERIODO:</span>
        {[3, 7, 14, 30, 60].map(d => (
          <button key={d} onClick={() => setDays(d)}
            data-testid={`btn-perf-days-${d}`}
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              days === d
                ? "bg-primary/20 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {d}D
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">ORDENAR:</span>
        {([["rend", "RENDIMIENTO"], ["litros", "LITROS"], ["trucks", "CAMIONES"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSortBy(key)}
            data-testid={`btn-sort-${key}`}
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              sortBy === key
                ? "bg-primary/20 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="performance-error">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] font-mono text-red-400">Error al obtener datos de fusion. Intente nuevamente.</span>
        </div>
      )}

      {fusion && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">FAENAS</span>
              </div>
              <div className="text-2xl font-mono font-bold text-primary" data-testid="text-perf-faenas">{globalStats.totalFaenas}</div>
              <div className="text-xs font-mono text-muted-foreground">con datos</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Truck className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">CAMIONES</span>
              </div>
              <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-perf-trucks">{globalStats.totalTrucks}</div>
              <div className="text-xs font-mono text-muted-foreground">en periodo</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">REND. GLOBAL</span>
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400" data-testid="text-perf-global-rend">
                {globalStats.avgRend > 0 ? `${globalStats.avgRend.toFixed(2)}` : "\u2014"}
              </div>
              <div className="text-xs font-mono text-muted-foreground">km/L promedio</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Fuel className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">L. SIGETRA</span>
              </div>
              <div className="text-2xl font-mono font-bold text-amber-400" data-testid="text-perf-litros-sigetra">{fN(Math.round(globalStats.totalLitrosSigetra))}</div>
              <div className="text-xs font-mono text-muted-foreground">litros tarjeta (periodo)</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Fuel className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">L. VOLVO ECU</span>
              </div>
              <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-perf-litros-volvo">
                {globalStats.totalLitrosVolvoPeriodo > 0 ? fN(Math.round(globalStats.totalLitrosVolvoPeriodo)) : "\u2014"}
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {globalStats.totalLitrosVolvoPeriodo > 0 ? "litros ECU (periodo)" : "sin historial ECU aun"}
              </div>
            </div>
          </div>

          {globalStats.bestFaena && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-mono text-emerald-400 tracking-[0.15em]">MEJOR FAENA</div>
                  <div className="text-sm font-mono font-bold text-foreground" data-testid="text-best-faena">{globalStats.bestFaena}</div>
                </div>
              </div>
              {globalStats.worstFaena && (
                <div className="bg-red-500/5 border border-red-500/20 p-3 flex items-center gap-3">
                  <TrendingDown className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-mono text-red-400 tracking-[0.15em]">FAENA CON MENOR REND.</div>
                    <div className="text-sm font-mono font-bold text-foreground" data-testid="text-worst-faena">{globalStats.worstFaena}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-blue-500/5 border border-blue-500/20 p-3 flex items-start gap-2" data-testid="note-rfms">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-blue-400/80">
              <span className="font-bold text-blue-400">Nota:</span> Los litros Volvo ECU se calculan como delta del totalFuelUsed (ECU) entre el inicio y fin del periodo seleccionado, haciendolos comparables con los litros Sigetra.
              Si un camion muestra "\u2014", es porque aun no hay historial ECU suficiente (se requieren al menos 2 lecturas en el periodo).
              Algunos camiones no reportan datos Volvo porque su suscripcion rFMS esta inactiva o el hardware no envia telemetria.
            </div>
          </div>

          <div className="bg-cyan-500/5 border border-cyan-500/20 p-3 flex items-start gap-2" data-testid="note-optimo">
            <Target className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-cyan-400/80">
              <span className="font-bold text-cyan-400">Optimo por ruta:</span> Se calcula como el percentil 75 (P75) de los rendimientos de la faena.
              Camiones sobre el optimo son referencia de eficiencia. Camiones bajo -15% del optimo requieren atencion.
              La columna "vs OPT" muestra la desviacion porcentual de cada camion respecto al optimo de su faena.
            </div>
          </div>

          <div className="space-y-3">
            {faenaAnalysis.map(analysis => (
              <FaenaCard
                key={analysis.faena}
                analysis={analysis}
                globalMax={globalMax}
                expanded={expandedFaena === analysis.faena}
                onToggle={() => setExpandedFaena(expandedFaena === analysis.faena ? null : analysis.faena)}
              />
            ))}
          </div>

          {faenaAnalysis.length === 0 && (
            <div className="p-8 text-center text-[11px] font-mono text-muted-foreground border border-border bg-card" data-testid="performance-empty">
              No se encontraron datos de rendimiento por faena en el periodo seleccionado
            </div>
          )}
        </>
      )}
    </div>
  );
}
