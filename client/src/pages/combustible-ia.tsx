import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Fuel, Truck, TrendingUp, TrendingDown, Calendar, BarChart3, AlertTriangle, ChevronDown, ChevronUp
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

type Granularity = "diario" | "semanal" | "mensual";

interface PeriodRow {
  sortKey: string;
  label: string;
  litros: number;
  km: number;
  cargas: number;
  trucks: Set<string>;
  rendimiento: number;
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

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function RendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
      <div className={`h-full rounded-md ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CombustibleIA() {
  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState<Granularity>("diario");
  const [showTrucks, setShowTrucks] = useState(false);

  const range = useMemo(() => getDateRange(days), [days]);

  const { data: fusion, isLoading, isError } = useQuery<FusionResponse>({
    queryKey: [`/api/sigetra/fusion?from=${range.from}&to=${range.to}`],
    refetchInterval: 600000,
  });

  const errorNums = useMemo(() => {
    if (!fusion?.trucks) return new Set<string>();
    return getErrorFleetNums(fusion.trucks);
  }, [fusion]);

  const allCargas = useMemo(() => {
    if (!fusion?.trucks) return [];
    return fusion.trucks
      .filter(t => !errorNums.has(t.fleetNum))
      .flatMap(t =>
        t.cargas
          .filter(c => !isErrorCarga(c) && c.litros > 0)
          .map(c => ({ ...c, fleetNum: t.fleetNum, patenteReal: t.patenteReal }))
      );
  }, [fusion, errorNums]);

  const periodRows = useMemo(() => {
    if (allCargas.length === 0) return [];

    const groups = new Map<string, { litros: number; km: number; cargas: number; trucks: Set<string> }>();

    allCargas.forEach(c => {
      const dateStr = c.fecha?.slice(0, 10) || "";
      if (!dateStr || dateStr.length < 10 || isNaN(new Date(dateStr + "T12:00:00").getTime())) return;
      let key: string;
      if (granularity === "diario") key = dateStr;
      else if (granularity === "semanal") key = getWeekKey(dateStr);
      else key = getMonthKey(dateStr);

      if (!groups.has(key)) groups.set(key, { litros: 0, km: 0, cargas: 0, trucks: new Set() });
      const g = groups.get(key)!;
      g.litros += c.litros;
      g.km += (c.kmRecorrido != null && c.kmRecorrido > 0 ? c.kmRecorrido : 0);
      g.cargas += 1;
      g.trucks.add(c.fleetNum);
    });

    const rows: PeriodRow[] = Array.from(groups.entries()).map(([key, data]) => {
      let label: string;
      if (granularity === "diario") {
        const d = new Date(key + "T12:00:00");
        const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
        label = `${dayNames[d.getDay()]} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
      } else if (granularity === "semanal") {
        const end = new Date(key);
        end.setDate(end.getDate() + 6);
        label = `Sem ${key.slice(8, 10)}/${key.slice(5, 7)} - ${end.toISOString().slice(8, 10)}/${end.toISOString().slice(5, 7)}`;
      } else {
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const m = parseInt(key.slice(5, 7)) - 1;
        label = `${monthNames[m]} ${key.slice(0, 4)}`;
      }

      return {
        sortKey: key,
        label,
        litros: data.litros,
        km: data.km,
        cargas: data.cargas,
        trucks: data.trucks,
        rendimiento: data.litros > 0 ? data.km / data.litros : 0,
      };
    });

    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return rows;
  }, [allCargas, granularity]);

  const truckSummary = useMemo(() => {
    if (!fusion?.trucks) return [];
    return fusion.trucks
      .filter(t => !errorNums.has(t.fleetNum))
      .map(t => {
        const validCargas = t.cargas.filter(c => !isErrorCarga(c) && c.litros > 0);
        const totalLitros = validCargas.reduce((s, c) => s + c.litros, 0);
        const totalKm = validCargas.reduce((s, c) => s + (c.kmRecorrido != null && c.kmRecorrido > 0 ? c.kmRecorrido : 0), 0);
        return {
          fleetNum: t.fleetNum,
          patente: t.patenteReal,
          faena: t.faenaSigetra,
          conductor: t.conductorSigetra,
          litros: totalLitros,
          km: totalKm,
          cargas: validCargas.length,
          rend: totalLitros > 0 ? totalKm / totalLitros : 0,
        };
      })
      .filter(t => t.litros > 0)
      .sort((a, b) => b.litros - a.litros);
  }, [fusion, errorNums]);

  const totals = useMemo(() => {
    const totalLitros = periodRows.reduce((s, r) => s + r.litros, 0);
    const totalKm = periodRows.reduce((s, r) => s + r.km, 0);
    const totalCargas = periodRows.reduce((s, r) => s + r.cargas, 0);
    const avgRendimiento = totalLitros > 0 ? totalKm / totalLitros : 0;
    const avgDailyLitros = periodRows.length > 0 ? totalLitros / periodRows.length : 0;
    const avgDailyKm = periodRows.length > 0 ? totalKm / periodRows.length : 0;
    const maxLitrosRow = periodRows.length > 0 ? periodRows.reduce((max, r) => r.litros > max.litros ? r : max, periodRows[0]) : null;
    const minLitrosRow = periodRows.length > 0 ? periodRows.reduce((min, r) => r.litros < min.litros ? r : min, periodRows[0]) : null;
    return { totalLitros, totalKm, totalCargas, avgRendimiento, avgDailyLitros, avgDailyKm, maxLitrosRow, minLitrosRow };
  }, [periodRows]);

  const maxLitros = useMemo(() => Math.max(...periodRows.map(r => r.litros), 1), [periodRows]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="combustible-loading">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="combustible-page">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Fuel className="w-5 h-5 text-amber-400" />
          <h1 className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground" data-testid="text-combustible-title">
            Combustible & Kilometraje
          </h1>
        </div>
        <span className="text-xs font-mono text-muted-foreground">Analisis de consumo y distancia</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">PERIODO:</span>
        {[7, 14, 30, 60].map(d => (
          <button key={d} onClick={() => setDays(d)}
            data-testid={`btn-comb-days-${d}`}
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              days === d ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {d}D
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">VISTA:</span>
        {(["diario", "semanal", "mensual"] as const).map(g => (
          <button key={g} onClick={() => setGranularity(g)}
            data-testid={`btn-gran-${g}`}
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              granularity === g ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {g.toUpperCase()}
          </button>
        ))}
      </div>

      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="combustible-error">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] font-mono text-red-400">Error al obtener datos.</span>
        </div>
      )}

      {fusion && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Fuel className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">LITROS TOTAL</span>
              </div>
              <div className="text-2xl font-mono font-bold text-amber-400" data-testid="text-comb-litros">{fN(Math.round(totals.totalLitros))}</div>
              <div className="text-xs font-mono text-muted-foreground">en {days} dias</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Truck className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">KM TOTAL</span>
              </div>
              <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-comb-km">{fN(Math.round(totals.totalKm))}</div>
              <div className="text-xs font-mono text-muted-foreground">{fN(totals.totalCargas)} cargas</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">REND. PROMEDIO</span>
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400" data-testid="text-comb-rend">
                {totals.avgRendimiento > 0 ? totals.avgRendimiento.toFixed(2) : "\u2014"}
              </div>
              <div className="text-xs font-mono text-muted-foreground">km/L global</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">PROMEDIO/{granularity === "diario" ? "DIA" : granularity === "semanal" ? "SEM" : "MES"}</span>
              </div>
              <div className="text-lg font-mono font-bold text-primary" data-testid="text-comb-avg">
                {fN(Math.round(totals.avgDailyLitros))} L
              </div>
              <div className="text-xs font-mono text-muted-foreground">{fN(Math.round(totals.avgDailyKm))} km</div>
            </div>
          </div>

          {totals.maxLitrosRow && totals.minLitrosRow && periodRows.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-500/5 border border-red-500/20 p-3 flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-mono text-red-400 tracking-[0.15em]">MAYOR CONSUMO</div>
                  <div className="text-sm font-mono font-bold text-foreground" data-testid="text-comb-max">{totals.maxLitrosRow.label}</div>
                  <div className="text-xs font-mono text-red-400">{fN(Math.round(totals.maxLitrosRow.litros))} L · {fN(Math.round(totals.maxLitrosRow.km))} km</div>
                </div>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-mono text-emerald-400 tracking-[0.15em]">MENOR CONSUMO</div>
                  <div className="text-sm font-mono font-bold text-foreground" data-testid="text-comb-min">{totals.minLitrosRow.label}</div>
                  <div className="text-xs font-mono text-emerald-400">{fN(Math.round(totals.minLitrosRow.litros))} L · {fN(Math.round(totals.minLitrosRow.km))} km</div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-background border border-border" data-testid="combustible-table">
            <div className="grid grid-cols-[1fr_6rem_6rem_4rem_4rem_5rem] gap-2 px-3 py-2 border-b border-border bg-card">
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">PERIODO</span>
              <span className="text-xs font-mono font-bold text-amber-400/70 tracking-[0.15em] text-right">LITROS</span>
              <span className="text-xs font-mono font-bold text-blue-400/70 tracking-[0.15em] text-right">KM</span>
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em] text-right">CARG.</span>
              <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em] text-right">CAM.</span>
              <span className="text-xs font-mono font-bold text-emerald-400/70 tracking-[0.15em] text-right">REND.</span>
            </div>
            <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
              {periodRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_6rem_6rem_4rem_4rem_5rem] gap-2 px-3 py-2 items-center" data-testid={`row-period-${idx}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">{row.label}</span>
                    <div className="flex-1">
                      <RendBar value={row.litros} max={maxLitros} color="bg-amber-500/60" />
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400 text-right">{fN(Math.round(row.litros))}</span>
                  <span className="text-xs font-mono text-blue-400 text-right">{fN(Math.round(row.km))}</span>
                  <span className="text-xs font-mono text-muted-foreground text-right">{row.cargas}</span>
                  <span className="text-xs font-mono text-muted-foreground text-right">{row.trucks.size}</span>
                  <span className={`text-xs font-mono font-bold text-right ${
                    row.rendimiento >= 1.8 ? "text-emerald-400" : row.rendimiento >= 1.2 ? "text-amber-400" : row.rendimiento > 0 ? "text-red-400" : "text-muted-foreground"
                  }`}>
                    {row.rendimiento > 0 ? row.rendimiento.toFixed(2) : "\u2014"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowTrucks(!showTrucks)}
              className="flex items-center gap-2 text-xs font-mono font-bold text-primary cursor-pointer mb-2"
              data-testid="btn-toggle-trucks"
            >
              {showTrucks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showTrucks ? "Ocultar detalle por camion" : `Ver detalle por camion (${truckSummary.length})`}
            </button>

            {showTrucks && truckSummary.length > 0 && (
              <div className="bg-background border border-border" data-testid="truck-detail-table">
                <div className="grid grid-cols-[3.5rem_4.5rem_1fr_6rem_6rem_3.5rem_5rem] gap-2 px-3 py-2 border-b border-border bg-card">
                  <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">N.INT</span>
                  <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">PATENTE</span>
                  <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">FAENA</span>
                  <span className="text-xs font-mono font-bold text-amber-400/70 tracking-[0.15em] text-right">LITROS</span>
                  <span className="text-xs font-mono font-bold text-blue-400/70 tracking-[0.15em] text-right">KM</span>
                  <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em] text-right">CARG.</span>
                  <span className="text-xs font-mono font-bold text-emerald-400/70 tracking-[0.15em] text-right">REND.</span>
                </div>
                <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                  {truckSummary.map((t, idx) => (
                    <div key={t.fleetNum} className="grid grid-cols-[3.5rem_4.5rem_1fr_6rem_6rem_3.5rem_5rem] gap-2 px-3 py-1.5 items-center" data-testid={`row-truck-comb-${idx}`}>
                      <span className="text-xs font-mono font-bold text-foreground">{t.fleetNum}</span>
                      <span className="text-xs font-mono text-muted-foreground">{t.patente || "\u2014"}</span>
                      <span className="text-xs font-mono text-foreground truncate">{t.faena || "\u2014"}</span>
                      <span className="text-xs font-mono font-bold text-amber-400 text-right">{fN(Math.round(t.litros))}</span>
                      <span className="text-xs font-mono text-blue-400 text-right">{fN(Math.round(t.km))}</span>
                      <span className="text-xs font-mono text-muted-foreground text-right">{t.cargas}</span>
                      <span className={`text-xs font-mono font-bold text-right ${
                        t.rend >= 1.8 ? "text-emerald-400" : t.rend >= 1.2 ? "text-amber-400" : t.rend > 0 ? "text-red-400" : "text-muted-foreground"
                      }`}>
                        {t.rend > 0 ? t.rend.toFixed(2) : "\u2014"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {periodRows.length === 0 && (
            <div className="p-8 text-center text-[11px] font-mono text-muted-foreground border border-border bg-card" data-testid="combustible-empty">
              Sin datos de combustible en el periodo seleccionado
            </div>
          )}
        </>
      )}
    </div>
  );
}
