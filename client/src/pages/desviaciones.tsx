import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Search, Shield, ShieldAlert, ShieldX,
  ArrowRightLeft, X, CheckCircle2, Circle, Gauge, MapPin, BarChart3
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

interface DesviacionCheck {
  id: number;
  fleetNum: string;
  tipo: string;
  gestionado: boolean;
  gestionadoAt: string | null;
  nota: string | null;
}

interface KmDeviation {
  truck: FusionTruck;
  absDelta: number;
  severity: "critico" | "alerta";
  faena: string;
}

interface RendDeviation {
  truck: FusionTruck;
  faena: string;
  rendimiento: number;
  faenaAvg: number;
  pctDesv: number;
  direction: "sobre" | "bajo";
}

function fN(n: number): string {
  return n.toLocaleString("es-CL");
}

function formatDateTime(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const DATA_START_DATE = "2026-03-01";

function getDateRange7d(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const minDate = new Date(DATA_START_DATE + "T00:00:00");
  const effectiveFrom = from < minDate ? minDate : from;
  return { from: effectiveFrom.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function Desviaciones() {
  const [busq, setBusq] = useState("");
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | "critico" | "alerta">("all");
  const [showGestionado, setShowGestionado] = useState(false);
  const [devMode, setDevMode] = useState<"km" | "rend">("km");

  const range = useMemo(() => getDateRange7d(), []);

  const { data: fusion, isLoading, isError } = useQuery<FusionResponse>({
    queryKey: [`/api/sigetra/fusion?from=${range.from}&to=${range.to}`],
    refetchInterval: 600000,
  });

  const { data: checks = [] } = useQuery<DesviacionCheck[]>({
    queryKey: ["/api/desviaciones/checks"],
  });

  const checkMutation = useMutation({
    mutationFn: async (params: { fleetNum: string; tipo: string; gestionado: boolean }) => {
      return apiRequest("POST", "/api/desviaciones/check", params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/desviaciones/checks"] });
    },
  });

  const isGestionado = useCallback((fleetNum: string, tipo: string) => {
    return checks.some(c => c.fleetNum === fleetNum && c.tipo === tipo && c.gestionado);
  }, [checks]);

  const getCheckInfo = useCallback((fleetNum: string, tipo: string) => {
    return checks.find(c => c.fleetNum === fleetNum && c.tipo === tipo && c.gestionado);
  }, [checks]);

  const errorNums = useMemo(() => {
    if (!fusion?.trucks) return new Set<string>();
    return getErrorFleetNums(fusion.trucks);
  }, [fusion]);

  const kmDeviations = useMemo((): KmDeviation[] => {
    if (!fusion?.trucks) return [];
    const results: KmDeviation[] = [];
    for (const t of fusion.trucks) {
      if (errorNums.has(t.fleetNum)) continue;
      if (t.deltaOdometro == null) continue;
      const absDelta = Math.abs(t.deltaOdometro);
      if (absDelta <= 1000) continue;
      const severity = absDelta > 5000 ? "critico" as const : "alerta" as const;
      results.push({ truck: t, absDelta, severity, faena: t.faenaSigetra || "Sin faena" });
    }
    results.sort((a, b) => {
      const sevOrder = a.severity === "critico" ? 0 : 1;
      const sevOrderB = b.severity === "critico" ? 0 : 1;
      if (sevOrder !== sevOrderB) return sevOrder - sevOrderB;
      return b.absDelta - a.absDelta;
    });
    return results;
  }, [fusion, errorNums]);

  const rendDeviations = useMemo((): RendDeviation[] => {
    if (!fusion?.trucks) return [];
    const cleanTrucks = fusion.trucks
      .filter(t => !errorNums.has(t.fleetNum))
      .map(t => {
        const validCargas = t.cargas.filter(c => !isErrorCarga(c));
        const totalLitros = validCargas.reduce((s, c) => s + c.litros, 0);
        const totalKm = validCargas.reduce((s, c) => s + (c.kmRecorrido != null && c.kmRecorrido > 0 ? c.kmRecorrido : 0), 0);
        const rendPromedio = totalLitros > 0 ? totalKm / totalLitros : 0;
        return { ...t, cargas: validCargas, totalLitrosSigetra: totalLitros, totalCargas: validCargas.length, rendPromedio };
      });

    type CleanTruck = typeof cleanTrucks[number];
    const byFaena = new Map<string, CleanTruck[]>();
    for (const t of cleanTrucks) {
      const faena = t.faenaSigetra || "Sin Faena";
      const existing = byFaena.get(faena) || [];
      existing.push(t);
      byFaena.set(faena, existing);
    }

    const results: RendDeviation[] = [];
    const faenaEntries = Array.from(byFaena.entries());
    for (const [faena, trucks] of faenaEntries) {
      const withRend = trucks.filter((t: CleanTruck) => t.rendPromedio > 0);
      if (withRend.length < 2) continue;
      const avg = withRend.reduce((s: number, t: CleanTruck) => s + t.rendPromedio, 0) / withRend.length;
      if (avg <= 0) continue;
      for (const t of withRend) {
        const pctDesv = ((t.rendPromedio - avg) / avg) * 100;
        if (Math.abs(pctDesv) > 15) {
          results.push({
            truck: t,
            faena,
            rendimiento: t.rendPromedio,
            faenaAvg: avg,
            pctDesv,
            direction: pctDesv > 0 ? "sobre" : "bajo",
          });
        }
      }
    }
    results.sort((a, b) => Math.abs(b.pctDesv) - Math.abs(a.pctDesv));
    return results;
  }, [fusion, errorNums]);

  const filteredKm = useMemo(() => {
    let list = kmDeviations;

    if (severityFilter !== "all") {
      list = list.filter(d => d.severity === severityFilter);
    }

    if (showGestionado) {
      list = list.filter(d => isGestionado(d.truck.fleetNum, "ODO_KM"));
    } else {
      list = list.filter(d => !isGestionado(d.truck.fleetNum, "ODO_KM"));
    }

    if (busq.trim()) {
      const q = busq.toLowerCase();
      list = list.filter(d =>
        d.truck.fleetNum.includes(q) ||
        d.truck.patenteReal?.toLowerCase().includes(q) ||
        d.truck.vin?.toLowerCase().includes(q) ||
        d.faena.toLowerCase().includes(q) ||
        d.truck.conductorSigetra?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [kmDeviations, busq, severityFilter, showGestionado, isGestionado]);

  const filteredRend = useMemo(() => {
    let list = rendDeviations;

    if (severityFilter === "critico") {
      list = list.filter(d => Math.abs(d.pctDesv) > 30);
    } else if (severityFilter === "alerta") {
      list = list.filter(d => Math.abs(d.pctDesv) <= 30);
    }

    if (showGestionado) {
      list = list.filter(d => isGestionado(d.truck.fleetNum, "REND_DESV"));
    } else {
      list = list.filter(d => !isGestionado(d.truck.fleetNum, "REND_DESV"));
    }

    if (busq.trim()) {
      const q = busq.toLowerCase();
      list = list.filter(d =>
        d.truck.fleetNum.includes(q) ||
        d.truck.patenteReal?.toLowerCase().includes(q) ||
        d.faena.toLowerCase().includes(q) ||
        d.truck.conductorSigetra?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [rendDeviations, busq, severityFilter, showGestionado, isGestionado]);

  const faenaGroups = useMemo(() => {
    const groups = new Map<string, KmDeviation[]>();
    for (const d of filteredKm) {
      const existing = groups.get(d.faena) || [];
      existing.push(d);
      groups.set(d.faena, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const aCrit = a[1].filter(d => d.severity === "critico").length;
      const bCrit = b[1].filter(d => d.severity === "critico").length;
      if (aCrit !== bCrit) return bCrit - aCrit;
      return b[1].length - a[1].length;
    });
  }, [filteredKm]);

  const rendFaenaGroups = useMemo(() => {
    const groups = new Map<string, RendDeviation[]>();
    for (const d of filteredRend) {
      const existing = groups.get(d.faena) || [];
      existing.push(d);
      groups.set(d.faena, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredRend]);

  const stats = useMemo(() => {
    if (devMode === "km") {
      const total = kmDeviations.length;
      const criticos = kmDeviations.filter(d => d.severity === "critico").length;
      const alertas = kmDeviations.filter(d => d.severity === "alerta").length;
      const gestionados = kmDeviations.filter(d => isGestionado(d.truck.fleetNum, "ODO_KM")).length;
      const pendientes = total - gestionados;
      return { total, criticos, alertas, gestionados, pendientes };
    } else {
      const total = rendDeviations.length;
      const criticos = rendDeviations.filter(d => Math.abs(d.pctDesv) > 30).length;
      const alertas = total - criticos;
      const gestionados = rendDeviations.filter(d => isGestionado(d.truck.fleetNum, "REND_DESV")).length;
      const pendientes = total - gestionados;
      return { total, criticos, alertas, gestionados, pendientes };
    }
  }, [kmDeviations, rendDeviations, isGestionado, devMode]);

  const selectedKm = devMode === "km" && selectedTruck ? kmDeviations.find(d => d.truck.fleetNum === selectedTruck) : null;
  const selectedRend = devMode === "rend" && selectedTruck ? rendDeviations.find(d => d.truck.fleetNum === selectedTruck) : null;

  const handleToggleCheck = (fleetNum: string, currentlyChecked: boolean) => {
    const tipo = devMode === "km" ? "ODO_KM" : "REND_DESV";
    checkMutation.mutate({ fleetNum, tipo, gestionado: !currentlyChecked });
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="desviaciones-loading">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="desviaciones-page">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <h1 className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground" data-testid="text-desviaciones-title">
            Desviaciones
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { setDevMode("km"); setSelectedTruck(null); setSeverityFilter("all"); setShowGestionado(false); }}
            data-testid="btn-mode-km"
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              devMode === "km" ? "bg-primary/20 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            KILOMETRAJE
          </button>
          <button onClick={() => { setDevMode("rend"); setSelectedTruck(null); setSeverityFilter("all"); setShowGestionado(false); }}
            data-testid="btn-mode-rend"
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              devMode === "rend" ? "bg-primary/20 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            RENDIMIENTO
          </button>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {devMode === "km" ? "Diferencias odometro Sigetra vs Volvo ECU" : "Camiones con rendimiento >15% sobre/bajo promedio faena"} — ultimos 7 dias
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button onClick={() => { setSeverityFilter("all"); setShowGestionado(false); }}
          data-testid="btn-filter-all"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${severityFilter === "all" && !showGestionado ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">PENDIENTES</span>
          </div>
          <div className="text-2xl font-mono font-bold text-primary" data-testid="text-desv-pendientes">{stats.pendientes}</div>
          <div className="text-xs font-mono text-muted-foreground">por gestionar</div>
        </button>
        <button onClick={() => { setSeverityFilter("critico"); setShowGestionado(false); }}
          data-testid="btn-filter-critico"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${severityFilter === "critico" ? "border-red-500 bg-red-500/10" : "border-border hover:border-red-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldX className="w-4 h-4 text-red-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">CRITICOS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-red-400" data-testid="text-desv-criticos">{stats.criticos}</div>
          <div className="text-xs font-mono text-red-400/70">{devMode === "km" ? ">5.000 km dif" : ">30% desv"}</div>
        </button>
        <button onClick={() => { setSeverityFilter("alerta"); setShowGestionado(false); }}
          data-testid="btn-filter-alerta"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${severityFilter === "alerta" ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">ALERTAS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400" data-testid="text-desv-alertas">{stats.alertas}</div>
          <div className="text-xs font-mono text-amber-400/70">{devMode === "km" ? "1.000-5.000 km" : "15-30% desv"}</div>
        </button>
        <button onClick={() => { setSeverityFilter("all"); setShowGestionado(true); }}
          data-testid="btn-filter-gestionados"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${showGestionado ? "border-emerald-500 bg-emerald-500/10" : "border-border hover:border-emerald-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">GESTIONADOS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400" data-testid="text-desv-gestionados">{stats.gestionados}</div>
          <div className="text-xs font-mono text-emerald-400/70">revisados</div>
        </button>
        <div className="bg-card border border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">TOTAL</span>
          </div>
          <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-desv-total">{stats.total}</div>
          <div className="text-xs font-mono text-muted-foreground">{devMode === "km" ? "desviaciones km" : "desv. rendimiento"}</div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="desv-error">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] font-mono text-red-400">
            Error al obtener datos de fusion. Verifique la conexion con Sigetra y Volvo.
          </span>
        </div>
      )}

      {!isError && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={busq} onChange={e => setBusq(e.target.value)}
                placeholder="Buscar tracto, patente, faena..."
                className="pl-8 font-mono text-xs bg-card"
                data-testid="input-desv-search" />
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {devMode === "km" ? filteredKm.length : filteredRend.length} desviaciones
            </span>
          </div>

          <div className="flex gap-4">
            <div className={`border border-border bg-card overflow-hidden ${(selectedKm || selectedRend) ? "w-[45%]" : "w-full"} transition-all`}>
              <div className="bg-background border-b border-border px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">
                  {devMode === "km" ? "DESVIACIONES KILOMETRAJE POR FAENA" : "DESVIACIONES RENDIMIENTO POR FAENA"}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  7 dias
                </span>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {devMode === "km" && faenaGroups.map(([faena, devs]) => {
                  const critCount = devs.filter(d => d.severity === "critico").length;
                  const gestCount = devs.filter(d => isGestionado(d.truck.fleetNum, "ODO_KM")).length;

                  return (
                    <div key={faena}>
                      <div className="bg-background/50 border-b border-border px-3 py-2 flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-primary" />
                          <span className="text-xs font-mono font-bold text-foreground">{faena}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">({devs.length} camiones)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {critCount > 0 && (
                            <span className="text-xs font-mono px-1.5 py-0.5 bg-red-500/10 border border-red-500/30 text-red-400">
                              {critCount} CRIT
                            </span>
                          )}
                          {gestCount > 0 && (
                            <span className="text-xs font-mono px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              {gestCount} OK
                            </span>
                          )}
                        </div>
                      </div>

                      {devs.map(d => {
                        const t = d.truck;
                        const checked = isGestionado(t.fleetNum, "ODO_KM");
                        const isActive = selectedTruck === t.fleetNum;

                        return (
                          <div key={t.fleetNum}
                            className={`px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors hover:bg-primary/5 ${isActive ? "bg-primary/10" : ""} ${checked ? "opacity-60" : ""}`}
                            style={{ borderLeftWidth: 3, borderLeftColor: d.severity === "critico" ? "#FF2D4A" : "#FFB020" }}
                            data-testid={`row-desv-${t.fleetNum}`}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleCheck(t.fleetNum, checked); }}
                                className="flex-shrink-0 cursor-pointer"
                                data-testid={`btn-check-${t.fleetNum}`}
                              >
                                {checked
                                  ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                                  : <Circle className="w-4.5 h-4.5 text-muted-foreground hover:text-primary" />
                                }
                              </button>

                              <div className="flex-1 min-w-0" onClick={() => setSelectedTruck(isActive ? null : t.fleetNum)}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-mono font-bold ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.fleetNum}</span>
                                    <span className="text-xs font-mono text-muted-foreground">{t.patenteReal || ""}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${d.severity === "critico" ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
                                    <span className={`text-[11px] font-mono font-bold ${d.severity === "critico" ? "text-red-400" : "text-amber-400"}`}>
                                      {d.severity === "critico" ? "CRITICO" : "ALERTA"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-xs font-mono">
                                  <span className="text-muted-foreground">{t.conductorSigetra || "\u2014"}</span>
                                  <span className="text-muted-foreground">{t.totalCargas} cargas</span>
                                  <span className={`font-bold ${d.severity === "critico" ? "text-red-400" : "text-amber-400"}`}>
                                    {t.deltaOdometro! > 0 ? "+" : ""}{fN(t.deltaOdometro!)} km
                                  </span>
                                </div>
                                {checked && (() => {
                                  const info = getCheckInfo(t.fleetNum, "ODO_KM");
                                  return info?.gestionadoAt ? (
                                    <div className="text-[11px] font-mono text-emerald-400/70 mt-0.5">
                                      Gestionado: {info.gestionadoAt}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {devMode === "rend" && rendFaenaGroups.map(([faena, devs]) => {
                  const sobreCount = devs.filter(d => d.direction === "sobre").length;
                  const bajoCount = devs.filter(d => d.direction === "bajo").length;
                  const avg = devs[0]?.faenaAvg || 0;

                  return (
                    <div key={faena}>
                      <div className="bg-background/50 border-b border-border px-3 py-2 flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-primary" />
                          <span className="text-xs font-mono font-bold text-foreground">{faena}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">({devs.length} camiones)</span>
                          <span className="text-[11px] font-mono text-muted-foreground">prom: {avg.toFixed(2)} km/L</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {sobreCount > 0 && (
                            <span className="text-xs font-mono px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              {sobreCount} SOBRE
                            </span>
                          )}
                          {bajoCount > 0 && (
                            <span className="text-xs font-mono px-1.5 py-0.5 bg-red-500/10 border border-red-500/30 text-red-400">
                              {bajoCount} BAJO
                            </span>
                          )}
                        </div>
                      </div>

                      {devs.map(d => {
                        const t = d.truck;
                        const checked = isGestionado(t.fleetNum, "REND_DESV");
                        const isActive = selectedTruck === t.fleetNum;
                        const isCritico = Math.abs(d.pctDesv) > 30;

                        return (
                          <div key={t.fleetNum}
                            className={`px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors hover:bg-primary/5 ${isActive ? "bg-primary/10" : ""} ${checked ? "opacity-60" : ""}`}
                            style={{ borderLeftWidth: 3, borderLeftColor: d.direction === "bajo" ? (isCritico ? "#FF2D4A" : "#FFB020") : "#10B981" }}
                            data-testid={`row-rend-desv-${t.fleetNum}`}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleCheck(t.fleetNum, checked); }}
                                className="flex-shrink-0 cursor-pointer"
                                data-testid={`btn-rend-check-${t.fleetNum}`}
                              >
                                {checked
                                  ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                                  : <Circle className="w-4.5 h-4.5 text-muted-foreground hover:text-primary" />
                                }
                              </button>

                              <div className="flex-1 min-w-0" onClick={() => setSelectedTruck(isActive ? null : t.fleetNum)}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-mono font-bold ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.fleetNum}</span>
                                    <span className="text-xs font-mono text-muted-foreground">{t.patenteReal || ""}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${d.direction === "bajo" ? (isCritico ? "bg-red-500 animate-pulse" : "bg-amber-500") : "bg-emerald-500"}`} />
                                    <span className={`text-[11px] font-mono font-bold ${d.direction === "bajo" ? (isCritico ? "text-red-400" : "text-amber-400") : "text-emerald-400"}`}>
                                      {d.direction === "sobre" ? "SOBRE PROMEDIO" : isCritico ? "CRITICO BAJO" : "BAJO PROMEDIO"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-xs font-mono">
                                  <span className="text-muted-foreground">{t.conductorSigetra || "\u2014"}</span>
                                  <span className="text-foreground font-bold">{d.rendimiento.toFixed(2)} km/L</span>
                                  <span className={`font-bold ${d.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`}>
                                    {d.pctDesv > 0 ? "+" : ""}{d.pctDesv.toFixed(1)}%
                                  </span>
                                  <span className="text-muted-foreground">vs {d.faenaAvg.toFixed(2)} prom</span>
                                </div>
                                {checked && (() => {
                                  const info = getCheckInfo(t.fleetNum, "REND_DESV");
                                  return info?.gestionadoAt ? (
                                    <div className="text-[11px] font-mono text-emerald-400/70 mt-0.5">
                                      Gestionado: {info.gestionadoAt}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {devMode === "km" && filteredKm.length === 0 && (
                  <div className="p-8 text-center text-[11px] font-mono text-muted-foreground" data-testid="desv-empty">
                    {busq ? "Sin resultados para la busqueda" : showGestionado ? "No hay desviaciones gestionadas" : "No se detectaron desviaciones de km en los ultimos 7 dias"}
                  </div>
                )}

                {devMode === "rend" && filteredRend.length === 0 && (
                  <div className="p-8 text-center text-[11px] font-mono text-muted-foreground" data-testid="desv-rend-empty">
                    {busq ? "Sin resultados para la busqueda" : showGestionado ? "No hay desviaciones gestionadas" : "No se detectaron desviaciones de rendimiento en los ultimos 7 dias"}
                  </div>
                )}
              </div>
            </div>

            {selectedKm && (
              <div className="w-[55%] border border-border bg-card overflow-hidden" data-testid="desv-detail-panel">
                <div className="bg-background border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-4 h-4 ${selectedKm.severity === "critico" ? "text-red-400" : "text-amber-400"}`} />
                    <span className="text-xs font-mono font-bold text-foreground">
                      TRACTO {selectedKm.truck.fleetNum}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {selectedKm.truck.patenteReal}
                    </span>
                  </div>
                  <button onClick={() => setSelectedTruck(null)} className="p-1 hover:bg-primary/10 cursor-pointer" data-testid="btn-close-detail">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="max-h-[570px] overflow-y-auto">
                  <div className="p-4 border-b border-border/50">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1.5">CAMION</div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div><span className="text-muted-foreground">Interno:</span> <span className="text-foreground font-bold">{selectedKm.truck.fleetNum}</span></div>
                          <div><span className="text-muted-foreground">Patente:</span> <span className="text-foreground">{selectedKm.truck.patenteReal || "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">VIN:</span> <span className="text-foreground text-xs">{selectedKm.truck.vin || "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Modelo:</span> <span className="text-foreground">{selectedKm.truck.modeloVolvo}</span></div>
                          <div><span className="text-muted-foreground">Faena:</span> <span className="text-foreground">{selectedKm.faena}</span></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1.5">SIGETRA</div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div><span className="text-muted-foreground">Odometro:</span> <span className="text-amber-400 font-bold">{selectedKm.truck.odometroSigetra != null ? `${fN(selectedKm.truck.odometroSigetra)} km` : "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Total litros:</span> <span className="text-foreground">{fN(Math.round(selectedKm.truck.totalLitrosSigetra))} L</span></div>
                          <div><span className="text-muted-foreground">Cargas:</span> <span className="text-foreground">{selectedKm.truck.totalCargas}</span></div>
                          <div><span className="text-muted-foreground">Rendimiento:</span> <span className="text-foreground">{selectedKm.truck.rendPromedio > 0 ? `${selectedKm.truck.rendPromedio.toFixed(2)} km/L` : "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Conductor:</span> <span className="text-foreground">{selectedKm.truck.conductorSigetra || "\u2014"}</span></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1.5">VOLVO ECU</div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div><span className="text-muted-foreground">Odometro:</span> <span className="text-blue-400 font-bold">{selectedKm.truck.odometroVolvo != null ? `${fN(selectedKm.truck.odometroVolvo)} km` : "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Nivel tanque:</span> <span className={`font-bold ${selectedKm.truck.fuelLevelVolvo != null ? (selectedKm.truck.fuelLevelVolvo < 15 ? "text-red-400" : selectedKm.truck.fuelLevelVolvo < 30 ? "text-amber-400" : "text-emerald-400") : "text-muted-foreground"}`}>{selectedKm.truck.fuelLevelVolvo != null ? `${selectedKm.truck.fuelLevelVolvo}%` : "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Fuel ECU (periodo):</span> <span className="text-blue-400 font-bold">{selectedKm.truck.litrosVolvoPeriodo != null ? `${fN(selectedKm.truck.litrosVolvoPeriodo)} L` : "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Horas motor:</span> <span className="text-foreground">{selectedKm.truck.engineHoursVolvo != null ? `${fN(selectedKm.truck.engineHoursVolvo)} h` : "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">GPS:</span> <span className="text-foreground">{selectedKm.truck.gpsVolvo?.latitude != null ? `${selectedKm.truck.gpsVolvo.latitude.toFixed(4)}, ${selectedKm.truck.gpsVolvo.longitude?.toFixed(4)}` : "\u2014"}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-b border-border/50">
                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-2">COMPARACION ODOMETROS</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-[11px] font-mono text-muted-foreground mb-1">SIGETRA</div>
                        <div className="text-lg font-mono font-bold text-amber-400">{fN(selectedKm.truck.odometroSigetra!)} km</div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <ArrowRightLeft className={`w-5 h-5 ${selectedKm.severity === "critico" ? "text-red-400" : "text-amber-400"}`} />
                        <div className={`text-xs font-mono font-bold ${selectedKm.severity === "critico" ? "text-red-400" : "text-amber-400"}`}>
                          {selectedKm.truck.deltaOdometro! > 0 ? "+" : ""}{fN(selectedKm.truck.deltaOdometro!)} km
                        </div>
                      </div>
                      <div className="flex-1 text-right">
                        <div className="text-[11px] font-mono text-muted-foreground mb-1">VOLVO ECU</div>
                        <div className="text-lg font-mono font-bold text-blue-400">{fN(selectedKm.truck.odometroVolvo!)} km</div>
                      </div>
                    </div>
                    <div className={`mt-3 p-2 border text-xs font-mono ${
                      selectedKm.severity === "critico" ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    }`}>
                      {selectedKm.severity === "critico"
                        ? `Desviacion critica de ${fN(selectedKm.absDelta)} km. Diferencia superior a 5.000 km indica posible manipulacion del odometro, error grave en Sigetra, o falla del sensor ECU. Requiere investigacion inmediata.`
                        : `Desviacion moderada de ${fN(selectedKm.absDelta)} km. Puede deberse a retraso en actualizacion Sigetra, carga sin lectura de odometro, o acumulacion de errores. Monitorear en proximas cargas.`
                      }
                    </div>
                  </div>

                  <div className="p-4 border-b border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-mono text-muted-foreground tracking-[0.15em]">GESTION</div>
                    </div>
                    {(() => {
                      const checked = isGestionado(selectedKm.truck.fleetNum, "ODO_KM");
                      const info = getCheckInfo(selectedKm.truck.fleetNum, "ODO_KM");
                      return (
                        <button
                          onClick={() => handleToggleCheck(selectedKm.truck.fleetNum, checked)}
                          data-testid={`btn-detail-check-${selectedKm.truck.fleetNum}`}
                          className={`w-full flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                            checked
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-card border-border hover:border-primary/30"
                          }`}
                        >
                          {checked
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            : <Circle className="w-5 h-5 text-muted-foreground" />
                          }
                          <div className="text-left">
                            <div className={`text-xs font-mono font-bold ${checked ? "text-emerald-400" : "text-foreground"}`}>
                              {checked ? "GESTIONADO" : "MARCAR COMO GESTIONADO"}
                            </div>
                            {checked && info?.gestionadoAt && (
                              <div className="text-[11px] font-mono text-emerald-400/70">{info.gestionadoAt}</div>
                            )}
                            {!checked && (
                              <div className="text-[11px] font-mono text-muted-foreground">Click para marcar como revisado</div>
                            )}
                          </div>
                        </button>
                      );
                    })()}
                  </div>

                  <div className="p-4">
                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-2">
                      HISTORIAL DE CARGAS ({selectedKm.truck.cargas.length})
                    </div>
                    <div className="border border-border/50 max-h-[200px] overflow-y-auto">
                      <div className="grid grid-cols-[1fr_70px_80px_80px_70px_1fr] gap-0 bg-card/50 px-2 py-1.5 border-b border-border/30 sticky top-0">
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">FECHA</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">LITROS</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">ODOMETRO</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">KM REC.</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">REND.</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">CONDUCTOR</span>
                      </div>
                      {selectedKm.truck.cargas.map((c, i) => (
                        <div key={i} className="grid grid-cols-[1fr_70px_80px_80px_70px_1fr] gap-0 px-2 py-1.5 border-b border-border/20 text-xs font-mono">
                          <span className="text-muted-foreground">{formatDateTime(c.fecha)}</span>
                          <span className="text-amber-400 font-bold">{c.litros.toFixed(1)}</span>
                          <span className="text-foreground">{c.odometro != null ? fN(c.odometro) : "\u2014"}</span>
                          <span className={`${c.kmRecorrido != null && c.kmRecorrido < 0 ? "text-red-400" : "text-foreground"}`}>{c.kmRecorrido != null ? fN(c.kmRecorrido) : "\u2014"}</span>
                          <span className="text-foreground">{c.rendimiento != null ? c.rendimiento.toFixed(1) : "\u2014"}</span>
                          <span className="text-muted-foreground truncate">{c.conductor || "\u2014"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedRend && (
              <div className="w-[55%] border border-border bg-card overflow-hidden" data-testid="desv-rend-detail-panel">
                <div className="bg-background border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className={`w-4 h-4 ${selectedRend.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`} />
                    <span className="text-xs font-mono font-bold text-foreground">
                      TRACTO {selectedRend.truck.fleetNum}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {selectedRend.truck.patenteReal}
                    </span>
                  </div>
                  <button onClick={() => setSelectedTruck(null)} className="p-1 hover:bg-primary/10 cursor-pointer" data-testid="btn-close-rend-detail">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="max-h-[570px] overflow-y-auto">
                  <div className="p-4 border-b border-border/50">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1.5">CAMION</div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div><span className="text-muted-foreground">Interno:</span> <span className="text-foreground font-bold">{selectedRend.truck.fleetNum}</span></div>
                          <div><span className="text-muted-foreground">Patente:</span> <span className="text-foreground">{selectedRend.truck.patenteReal || "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Faena:</span> <span className="text-foreground">{selectedRend.faena}</span></div>
                          <div><span className="text-muted-foreground">Conductor:</span> <span className="text-foreground">{selectedRend.truck.conductorSigetra || "\u2014"}</span></div>
                          <div><span className="text-muted-foreground">Cargas:</span> <span className="text-foreground">{selectedRend.truck.totalCargas}</span></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1.5">RENDIMIENTO</div>
                        <div className="space-y-1 text-[11px] font-mono">
                          <div><span className="text-muted-foreground">Rendimiento:</span> <span className={`font-bold ${selectedRend.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`}>{selectedRend.rendimiento.toFixed(2)} km/L</span></div>
                          <div><span className="text-muted-foreground">Promedio faena:</span> <span className="text-foreground font-bold">{selectedRend.faenaAvg.toFixed(2)} km/L</span></div>
                          <div><span className="text-muted-foreground">Desviacion:</span> <span className={`font-bold ${selectedRend.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`}>{selectedRend.pctDesv > 0 ? "+" : ""}{selectedRend.pctDesv.toFixed(1)}%</span></div>
                          <div><span className="text-muted-foreground">Litros periodo:</span> <span className="text-amber-400">{fN(Math.round(selectedRend.truck.totalLitrosSigetra))} L</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-b border-border/50">
                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-2">COMPARACION RENDIMIENTO</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-[11px] font-mono text-muted-foreground mb-1">CAMION</div>
                        <div className={`text-lg font-mono font-bold ${selectedRend.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`}>{selectedRend.rendimiento.toFixed(2)} km/L</div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <ArrowRightLeft className={`w-5 h-5 ${selectedRend.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`} />
                        <div className={`text-xs font-mono font-bold ${selectedRend.direction === "bajo" ? "text-red-400" : "text-emerald-400"}`}>
                          {selectedRend.pctDesv > 0 ? "+" : ""}{selectedRend.pctDesv.toFixed(1)}%
                        </div>
                      </div>
                      <div className="flex-1 text-right">
                        <div className="text-[11px] font-mono text-muted-foreground mb-1">PROM. FAENA</div>
                        <div className="text-lg font-mono font-bold text-foreground">{selectedRend.faenaAvg.toFixed(2)} km/L</div>
                      </div>
                    </div>
                    <div className={`mt-3 p-2 border text-xs font-mono ${
                      selectedRend.direction === "bajo"
                        ? (Math.abs(selectedRend.pctDesv) > 30 ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400")
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    }`}>
                      {selectedRend.direction === "bajo"
                        ? `Rendimiento ${Math.abs(selectedRend.pctDesv).toFixed(1)}% por debajo del promedio de la faena (${selectedRend.faenaAvg.toFixed(2)} km/L). ${Math.abs(selectedRend.pctDesv) > 30 ? "Desviacion critica: verificar estado mecanico, habitos de conduccion, o posible fuga de combustible." : "Desviacion moderada: monitorear tendencia y comparar con periodos anteriores."}`
                        : `Rendimiento ${selectedRend.pctDesv.toFixed(1)}% sobre el promedio de la faena (${selectedRend.faenaAvg.toFixed(2)} km/L). Este camion puede ser referencia de eficiencia para la faena.`
                      }
                    </div>
                  </div>

                  <div className="p-4 border-b border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-mono text-muted-foreground tracking-[0.15em]">GESTION</div>
                    </div>
                    {(() => {
                      const checked = isGestionado(selectedRend.truck.fleetNum, "REND_DESV");
                      const info = getCheckInfo(selectedRend.truck.fleetNum, "REND_DESV");
                      return (
                        <button
                          onClick={() => handleToggleCheck(selectedRend.truck.fleetNum, checked)}
                          data-testid={`btn-detail-rend-check-${selectedRend.truck.fleetNum}`}
                          className={`w-full flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                            checked
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-card border-border hover:border-primary/30"
                          }`}
                        >
                          {checked
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            : <Circle className="w-5 h-5 text-muted-foreground" />
                          }
                          <div className="text-left">
                            <div className={`text-xs font-mono font-bold ${checked ? "text-emerald-400" : "text-foreground"}`}>
                              {checked ? "GESTIONADO" : "MARCAR COMO GESTIONADO"}
                            </div>
                            {checked && info?.gestionadoAt && (
                              <div className="text-[11px] font-mono text-emerald-400/70">{info.gestionadoAt}</div>
                            )}
                            {!checked && (
                              <div className="text-[11px] font-mono text-muted-foreground">Click para marcar como revisado</div>
                            )}
                          </div>
                        </button>
                      );
                    })()}
                  </div>

                  <div className="p-4">
                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-2">
                      HISTORIAL DE CARGAS ({selectedRend.truck.cargas.length})
                    </div>
                    <div className="border border-border/50 max-h-[200px] overflow-y-auto">
                      <div className="grid grid-cols-[1fr_70px_80px_80px_70px_1fr] gap-0 bg-card/50 px-2 py-1.5 border-b border-border/30 sticky top-0">
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">FECHA</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">LITROS</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">ODOMETRO</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">KM REC.</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">REND.</span>
                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">CONDUCTOR</span>
                      </div>
                      {selectedRend.truck.cargas.map((c, i) => (
                        <div key={i} className="grid grid-cols-[1fr_70px_80px_80px_70px_1fr] gap-0 px-2 py-1.5 border-b border-border/20 text-xs font-mono">
                          <span className="text-muted-foreground">{formatDateTime(c.fecha)}</span>
                          <span className="text-amber-400 font-bold">{c.litros.toFixed(1)}</span>
                          <span className="text-foreground">{c.odometro != null ? fN(c.odometro) : "\u2014"}</span>
                          <span className={`${c.kmRecorrido != null && c.kmRecorrido < 0 ? "text-red-400" : "text-foreground"}`}>{c.kmRecorrido != null ? fN(c.kmRecorrido) : "\u2014"}</span>
                          <span className={`font-bold ${c.rendimiento != null && c.rendimiento > 0 ? (c.rendimiento >= selectedRend.faenaAvg * 0.85 ? "text-foreground" : "text-red-400") : "text-foreground"}`}>{c.rendimiento != null ? c.rendimiento.toFixed(1) : "\u2014"}</span>
                          <span className="text-muted-foreground truncate">{c.conductor || "\u2014"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
