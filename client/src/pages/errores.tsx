import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertOctagon, Search, Bug, ChevronDown, ChevronUp, Gauge, Fuel,
  MapPin, ArrowDownUp, Download
} from "lucide-react";

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

type ErrorType = "REND_IMPOSIBLE" | "KM_NEGATIVO" | "ODO_SALTO" | "MICRO_CARGA" | "REND_NEGATIVO" | "KM_EXTREMO" | "CUADRATURA_BAJA";

interface ErrorRecord {
  truck: FusionTruck;
  carga: FusionCarga | null;
  errorType: ErrorType;
  errorLabel: string;
  detail: string;
}

const ERROR_LABELS: Record<ErrorType, string> = {
  REND_IMPOSIBLE: "Rendimiento imposible",
  KM_NEGATIVO: "KM negativos",
  ODO_SALTO: "Salto de odometro",
  MICRO_CARGA: "Micro-carga sospechosa",
  REND_NEGATIVO: "Rendimiento negativo",
  KM_EXTREMO: "KM extremos",
  CUADRATURA_BAJA: "Cuadratura baja",
};

const ERROR_COLORS: Record<ErrorType, string> = {
  REND_IMPOSIBLE: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  KM_NEGATIVO: "text-red-400 bg-red-500/10 border-red-500/30",
  ODO_SALTO: "text-red-400 bg-red-500/10 border-red-500/30",
  MICRO_CARGA: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  REND_NEGATIVO: "text-red-400 bg-red-500/10 border-red-500/30",
  KM_EXTREMO: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  CUADRATURA_BAJA: "text-amber-400 bg-amber-500/10 border-amber-500/30",
};

function fN(n: number): string {
  return n.toLocaleString("es-CL");
}

function formatDateTime(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type PeriodOption = "7D" | "14D" | "30D";

const DATA_START_DATE = "2026-03-01";

function getDateRange(period: PeriodOption): { from: string; to: string } {
  const days = period === "7D" ? 7 : period === "14D" ? 14 : 30;
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const minDate = new Date(DATA_START_DATE + "T00:00:00");
  const effectiveFrom = from < minDate ? minDate : from;
  return { from: effectiveFrom.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function detectErrors(t: FusionTruck): ErrorRecord[] {
  const errors: ErrorRecord[] = [];

  for (const c of t.cargas) {
    if (c.rendimiento != null && c.rendimiento > 15) {
      errors.push({
        truck: t, carga: c, errorType: "REND_IMPOSIBLE",
        errorLabel: ERROR_LABELS.REND_IMPOSIBLE,
        detail: `Rendimiento de ${c.rendimiento.toFixed(1)} km/L es fisicamente imposible para un camion (max real ~3.5 km/L). Posible error en odometro o litros registrados.`,
      });
    }

    if (c.rendimiento != null && c.rendimiento < 0) {
      errors.push({
        truck: t, carga: c, errorType: "REND_NEGATIVO",
        errorLabel: ERROR_LABELS.REND_NEGATIVO,
        detail: `Rendimiento negativo (${c.rendimiento.toFixed(1)} km/L) indica que el odometro retrocedio entre cargas. Error de digitacion o cruce de datos.`,
      });
    }

    if (c.kmRecorrido != null && c.kmRecorrido < 0) {
      errors.push({
        truck: t, carga: c, errorType: "KM_NEGATIVO",
        errorLabel: ERROR_LABELS.KM_NEGATIVO,
        detail: `KM recorridos negativos (${fN(c.kmRecorrido)} km). El odometro actual es menor que el anterior, lo que es fisicamente imposible.`,
      });
    }

    if (c.kmRecorrido != null && c.kmRecorrido > 50000) {
      errors.push({
        truck: t, carga: c, errorType: "KM_EXTREMO",
        errorLabel: ERROR_LABELS.KM_EXTREMO,
        detail: `KM recorridos extremos (${fN(c.kmRecorrido)} km) entre cargas. Probablemente un error de digitacion en el odometro.`,
      });
    }

    if (c.litros > 0 && c.litros < 0.5 && c.kmRecorrido != null && c.kmRecorrido > 100) {
      errors.push({
        truck: t, carga: c, errorType: "MICRO_CARGA",
        errorLabel: ERROR_LABELS.MICRO_CARGA,
        detail: `Carga de ${c.litros.toFixed(2)}L con ${fN(c.kmRecorrido!)} km recorridos. Posible test de tarjeta o error de surtidor.`,
      });
    }
  }

  const odos = t.cargas
    .filter(c => c.odometro != null && c.odometro > 0)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .map(c => ({ odo: c.odometro!, fecha: c.fecha, carga: c }));

  for (let i = 1; i < odos.length; i++) {
    const prev = odos[i - 1];
    const curr = odos[i];
    const diff = Math.abs(curr.odo - prev.odo);
    if (diff > 100000) {
      errors.push({
        truck: t, carga: curr.carga, errorType: "ODO_SALTO",
        errorLabel: ERROR_LABELS.ODO_SALTO,
        detail: `Salto de odometro de ${fN(diff)} km entre ${formatDateTime(prev.fecha)} (${fN(prev.odo)}) y ${formatDateTime(curr.fecha)} (${fN(curr.odo)}). Probable error de digitacion.`,
      });
    }
  }

  if (t.litrosVolvoPeriodo != null && t.litrosVolvoPeriodo > 0 && t.totalLitrosSigetra > 0) {
    const volvo = t.litrosVolvoPeriodo;
    const sigetra = t.totalLitrosSigetra;
    const cuadratura = (Math.min(volvo, sigetra) / Math.max(volvo, sigetra)) * 100;
    if (cuadratura < 95) {
      const diff = Math.abs(volvo - sigetra);
      errors.push({
        truck: t, carga: null, errorType: "CUADRATURA_BAJA",
        errorLabel: ERROR_LABELS.CUADRATURA_BAJA,
        detail: `Cuadratura ${cuadratura.toFixed(1)}% — Volvo: ${fN(Math.round(volvo))} L vs Sigetra: ${fN(Math.round(sigetra))} L. Diferencia de ${fN(Math.round(diff))} L. Los litros reportados por Volvo y Sigetra no coinciden (umbral: 95%).`,
      });
    }
  }

  return errors;
}

export function getErrorFleetNums(trucks: FusionTruck[]): Set<string> {
  const errorNums = new Set<string>();
  for (const t of trucks) {
    const errors = detectErrors(t);
    if (errors.length > 0) {
      const hasCuadraturaBaja = errors.some(e => e.errorType === "CUADRATURA_BAJA");
      const hasSerious = errors.some(e =>
        e.errorType === "ODO_SALTO" || e.errorType === "KM_NEGATIVO" || e.errorType === "KM_EXTREMO"
      );
      const rendErrors = errors.filter(e => e.errorType === "REND_IMPOSIBLE");
      const validCargas = t.cargas.length - rendErrors.length;
      if (hasCuadraturaBaja || hasSerious || (rendErrors.length > 0 && validCargas === 0)) {
        errorNums.add(t.fleetNum);
      }
    }
  }
  return errorNums;
}

export function isErrorCarga(c: FusionCarga): boolean {
  if (c.rendimiento != null && (c.rendimiento > 15 || c.rendimiento < 0)) return true;
  if (c.kmRecorrido != null && (c.kmRecorrido < 0 || c.kmRecorrido > 50000)) return true;
  if (c.litros > 0 && c.litros < 0.5 && c.kmRecorrido != null && c.kmRecorrido > 100) return true;
  return false;
}

function exportErrorsToCSV(errors: ErrorRecord[]) {
  const header = "Patente,Fecha,Tipo Error,Valor,Descripcion\n";
  const rows = errors.map(e => {
    const patente = e.truck.patenteReal || e.truck.fleetNum;
    const fecha = e.carga ? formatDateTime(e.carga.fecha) : "\u2014";
    const tipoError = e.errorLabel;
    let valor = "";
    if (e.errorType === "REND_IMPOSIBLE" || e.errorType === "REND_NEGATIVO") {
      valor = e.carga?.rendimiento != null ? `${e.carga.rendimiento.toFixed(1)} km/L` : "";
    } else if (e.errorType === "KM_NEGATIVO" || e.errorType === "KM_EXTREMO") {
      valor = e.carga?.kmRecorrido != null ? `${fN(e.carga.kmRecorrido)} km` : "";
    } else if (e.errorType === "ODO_SALTO") {
      valor = e.carga?.odometro != null ? `${fN(e.carga.odometro)} km` : "";
    } else if (e.errorType === "MICRO_CARGA") {
      valor = e.carga ? `${e.carga.litros.toFixed(2)} L` : "";
    } else if (e.errorType === "CUADRATURA_BAJA") {
      const v = e.truck.litrosVolvoPeriodo;
      const s = e.truck.totalLitrosSigetra;
      if (v != null && v > 0 && s > 0) {
        valor = `${((Math.min(v, s) / Math.max(v, s)) * 100).toFixed(1)}%`;
      }
    }
    const desc = e.detail.replace(/,/g, ";").replace(/\n/g, " ");
    return `"${patente}","${fecha}","${tipoError}","${valor}","${desc}"`;
  }).join("\n");

  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `errores_datos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Errores() {
  const [busq, setBusq] = useState("");
  const [expandedTruck, setExpandedTruck] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<ErrorType | "all" | "odo_group" | "CUADRATURA_BAJA">("all");
  const [period, setPeriod] = useState<PeriodOption>("7D");

  const range = useMemo(() => getDateRange(period), [period]);

  const { data: fusion, isLoading } = useQuery<FusionResponse>({
    queryKey: [`/api/sigetra/fusion?from=${range.from}&to=${range.to}`],
    refetchInterval: 600000,
  });

  const allErrors = useMemo(() => {
    if (!fusion?.trucks) return [];
    const errors: ErrorRecord[] = [];
    for (const t of fusion.trucks) {
      errors.push(...detectErrors(t));
    }
    return errors;
  }, [fusion]);

  const errorsByTruck = useMemo(() => {
    const map = new Map<string, ErrorRecord[]>();
    for (const e of allErrors) {
      const existing = map.get(e.truck.fleetNum) || [];
      existing.push(e);
      map.set(e.truck.fleetNum, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length);
  }, [allErrors]);

  const filtered = useMemo(() => {
    let list = errorsByTruck;

    if (filterType === "odo_group") {
      const odoTypes: ErrorType[] = ["KM_NEGATIVO", "ODO_SALTO", "KM_EXTREMO"];
      list = list.map(([num, errs]) => [num, errs.filter(e => odoTypes.includes(e.errorType))] as [string, ErrorRecord[]])
        .filter(([, errs]) => errs.length > 0);
    } else if (filterType !== "all") {
      list = list.map(([num, errs]) => [num, errs.filter(e => e.errorType === filterType)] as [string, ErrorRecord[]])
        .filter(([, errs]) => errs.length > 0);
    }

    if (busq.trim()) {
      const q = busq.toLowerCase();
      list = list.filter(([num, errs]) =>
        num.includes(q) ||
        errs[0]?.truck.patenteReal?.toLowerCase().includes(q) ||
        errs[0]?.truck.faenaSigetra?.toLowerCase().includes(q) ||
        errs[0]?.truck.conductorSigetra?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [errorsByTruck, busq, filterType]);

  const stats = useMemo(() => {
    const byType = new Map<ErrorType, number>();
    for (const e of allErrors) {
      byType.set(e.errorType, (byType.get(e.errorType) || 0) + 1);
    }
    return {
      total: allErrors.length,
      trucks: errorsByTruck.length,
      byType,
    };
  }, [allErrors, errorsByTruck]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="errores-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="errores-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-amber-400" />
            <h1 className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground" data-testid="text-errores-title">
              Errores de Datos
            </h1>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            Registros con datos imposibles o inconsistentes en Sigetra — ultimos {period === "7D" ? "7" : period === "14D" ? "14" : "30"} dias
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            {(["7D", "14D", "30D"] as PeriodOption[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                data-testid={`btn-period-${p.toLowerCase()}`}
                className={`px-3 py-1.5 text-xs font-mono font-bold transition-colors ${period === p ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportErrorsToCSV(allErrors)}
            disabled={allErrors.length === 0}
            data-testid="btn-export-csv"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            <span className="text-xs font-mono">CSV</span>
          </Button>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 p-3 flex items-center gap-2">
        <AlertOctagon className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-xs font-mono text-amber-400">
          Estos registros tienen datos que no son fisicamente posibles (rendimiento &gt;15 km/L, odometros que retroceden, saltos de 100.000+ km, micro-cargas con miles de km) o cuadratura baja (&lt;95% match entre litros Volvo y Sigetra). Son excluidos del analisis de Fusion, Desviaciones y Performance IA.
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button onClick={() => setFilterType("all")}
          data-testid="btn-err-filter-all"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${filterType === "all" ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <Bug className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">TOTAL ERRORES</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400" data-testid="text-err-total">{stats.total}</div>
          <div className="text-xs font-mono text-muted-foreground">{stats.trucks} camiones</div>
        </button>
        <button onClick={() => setFilterType("CUADRATURA_BAJA")}
          data-testid="btn-err-filter-cuadratura"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${filterType === "CUADRATURA_BAJA" ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownUp className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">CUADRATURA BAJA</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400" data-testid="text-err-cuadratura">{stats.byType.get("CUADRATURA_BAJA") || 0}</div>
          <div className="text-xs font-mono text-muted-foreground">&lt;95% Volvo vs Sigetra</div>
        </button>
        <button onClick={() => setFilterType("REND_IMPOSIBLE")}
          data-testid="btn-err-filter-rend"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${filterType === "REND_IMPOSIBLE" ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">REND. IMPOSIBLE</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400">{stats.byType.get("REND_IMPOSIBLE") || 0}</div>
          <div className="text-xs font-mono text-muted-foreground">&gt;15 km/L</div>
        </button>
        <button onClick={() => setFilterType("odo_group")}
          data-testid="btn-err-filter-km-neg"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${filterType === "odo_group" ? "border-red-500 bg-red-500/10" : "border-border hover:border-red-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownUp className="w-4 h-4 text-red-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">ODOMETRO CORRUPTO</span>
          </div>
          <div className="text-2xl font-mono font-bold text-red-400">{(stats.byType.get("KM_NEGATIVO") || 0) + (stats.byType.get("ODO_SALTO") || 0) + (stats.byType.get("KM_EXTREMO") || 0)}</div>
          <div className="text-xs font-mono text-muted-foreground">km neg / salto / extremo</div>
        </button>
        <button onClick={() => setFilterType("MICRO_CARGA")}
          data-testid="btn-err-filter-micro"
          className={`bg-card border p-3 text-left cursor-pointer transition-colors ${filterType === "MICRO_CARGA" ? "border-blue-500 bg-blue-500/10" : "border-border hover:border-blue-500/30"}`}>
          <div className="flex items-center gap-2 mb-1">
            <Fuel className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">MICRO-CARGAS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-blue-400">{stats.byType.get("MICRO_CARGA") || 0}</div>
          <div className="text-xs font-mono text-muted-foreground">&lt;0.5L sospechosas</div>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar tracto, patente, faena..."
            className="pl-8 font-mono text-xs bg-card"
            data-testid="input-err-search" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">{filtered.length} camiones</span>
      </div>

      <div className="border border-border bg-card overflow-hidden">
        <div className="bg-background border-b border-border px-3 py-2">
          <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">
            REGISTROS CON ERRORES DE DATOS
          </span>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {filtered.map(([fleetNum, errors]) => {
            const t = errors[0].truck;
            const isExpanded = expandedTruck === fleetNum;

            return (
              <div key={fleetNum}>
                <div
                  onClick={() => setExpandedTruck(isExpanded ? null : fleetNum)}
                  className="px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors hover:bg-primary/5"
                  style={{ borderLeftWidth: 3, borderLeftColor: "#FFB020" }}
                  data-testid={`row-err-${fleetNum}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-foreground">{fleetNum}</span>
                      <span className="text-xs font-mono text-muted-foreground">{t.patenteReal || ""}</span>
                      <span className="text-xs font-mono text-muted-foreground">{t.faenaSigetra || ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-amber-400">{errors.length} error{errors.length > 1 ? "es" : ""}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(errors.map(e => e.errorType))).map(type => (
                      <span key={type} className={`text-xs font-mono px-1.5 py-0.5 border ${ERROR_COLORS[type]}`}>
                        {ERROR_LABELS[type]}
                      </span>
                    ))}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-background border-b border-border p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="text-[11px] font-mono">
                        <span className="text-muted-foreground">Modelo:</span> <span className="text-foreground">{t.modeloVolvo}</span>
                      </div>
                      <div className="text-[11px] font-mono">
                        <span className="text-muted-foreground">Conductor:</span> <span className="text-foreground">{t.conductorSigetra || "\u2014"}</span>
                      </div>
                      <div className="text-[11px] font-mono">
                        <span className="text-muted-foreground">Total cargas:</span> <span className="text-foreground">{t.totalCargas} ({fN(Math.round(t.totalLitrosSigetra))} L)</span>
                      </div>
                    </div>

                    {errors.map((e, i) => (
                      <div key={i} className={`border p-3 ${ERROR_COLORS[e.errorType]}`}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <AlertOctagon className="w-3.5 h-3.5" />
                          <span className="text-xs font-mono font-bold">{e.errorLabel}</span>
                          <span className="text-[11px] font-mono opacity-70" data-testid={`text-err-patente-${i}`}>{e.truck.patenteReal || e.truck.fleetNum}</span>
                          {e.carga && <span className="text-[11px] font-mono opacity-70" data-testid={`text-err-fecha-${i}`}>{formatDateTime(e.carga.fecha)}</span>}
                          {e.carga && <span className="text-[11px] font-mono opacity-70">Guia #{e.carga.numGuia}</span>}
                        </div>
                        {e.carga ? (
                          <div className="grid grid-cols-[1fr_70px_80px_80px_70px] gap-0 mb-2 text-xs font-mono">
                            <div>
                              <span className="text-muted-foreground">Fecha: </span>
                              <span>{formatDateTime(e.carga.fecha)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Litros: </span>
                              <span className="text-amber-400 font-bold">{e.carga.litros.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Odo: </span>
                              <span>{e.carga.odometro != null ? fN(e.carga.odometro) : "\u2014"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">KM: </span>
                              <span className={e.carga.kmRecorrido != null && e.carga.kmRecorrido < 0 ? "text-red-400" : ""}>{e.carga.kmRecorrido != null ? fN(e.carga.kmRecorrido) : "\u2014"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Rend: </span>
                              <span className={e.carga.rendimiento != null && (e.carga.rendimiento > 15 || e.carga.rendimiento < 0) ? "text-red-400 font-bold" : ""}>{e.carga.rendimiento != null ? e.carga.rendimiento.toFixed(1) : "\u2014"}</span>
                            </div>
                          </div>
                        ) : e.errorType === "CUADRATURA_BAJA" && (
                          <div className="grid grid-cols-3 gap-4 mb-2 text-xs font-mono">
                            <div>
                              <span className="text-muted-foreground">Volvo: </span>
                              <span className="text-amber-400 font-bold">{e.truck.litrosVolvoPeriodo != null ? fN(Math.round(e.truck.litrosVolvoPeriodo)) : "\u2014"} L</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Sigetra: </span>
                              <span className="text-amber-400 font-bold">{fN(Math.round(e.truck.totalLitrosSigetra))} L</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Cuadratura: </span>
                              <span className="text-red-400 font-bold">
                                {e.truck.litrosVolvoPeriodo != null && e.truck.litrosVolvoPeriodo > 0 && e.truck.totalLitrosSigetra > 0
                                  ? ((Math.min(e.truck.litrosVolvoPeriodo, e.truck.totalLitrosSigetra) / Math.max(e.truck.litrosVolvoPeriodo, e.truck.totalLitrosSigetra)) * 100).toFixed(1)
                                  : "\u2014"}%
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="text-[11px] font-mono opacity-80">{e.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="p-8 text-center text-[11px] font-mono text-muted-foreground" data-testid="err-empty">
              {busq ? "Sin resultados para la busqueda" : `No se detectaron errores de datos en los ultimos ${period === "7D" ? "7" : period === "14D" ? "14" : "30"} dias`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
