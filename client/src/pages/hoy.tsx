import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Loader2, ChevronRight, ChevronLeft, Info, Search, X, Brain, Fuel, Truck, Shield, AlertTriangle, TrendingUp, TrendingDown, Activity, Zap, MapPin, Phone, Eye, Star, BarChart3, Route } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KPIs {
  camionesTotal: number;
  camionesActivos: number;
  rendPromedio: number;
  rendCambioPct: number;
  litrosPeriodo: number;
  litrosCambioPct: number;
  alertasCriticas: number;
  excesosVel: number;
  microSospechas: number;
}

interface ContratoEstado {
  nombre: string;
  color: string;
  camionesTotal: number;
  camionesActivos?: number;
  rendPromedio: number;
  alertasCriticas: number;
  estado: "NORMAL" | "ATENCION" | "CRITICO";
}

interface TendenciaDay {
  fecha: string;
  litrosDia: number;
  rendimientoDia: number;
}

interface Alerta {
  tipo: string;
  nivel: string;
  titulo: string;
  detalle: string;
  hace: string;
  gravedad: number;
  patente?: string;
  contrato?: string;
}

interface InvestigacionData {
  camion: { patente: string; vin: string; modelo: string; ano: number; contrato: string; ultimaSync: string };
  conductores: string[];
  cargas: { fecha: string; litros: number; odometro: number; odometroPrevio: number; conductor: string; estacion: string; ciudad: string }[];
  viajes: { fecha_inicio: string; fecha_fin: string; origen_nombre: string; destino_nombre: string; km_ecu: number; litros_ecu: number; litros_sigetra: number; rendimiento: number; conductor: string; score: number; estado: string; duracion_min: number; vel_max: number }[];
  gpsUltimo: { lat: number; lng: number; vel: number; timestamp_punto: string } | null;
  snapshotEcu: { litrosAcumulados: number; kmAcumulados: number; litrosDelta: number; kmDelta: number; ultimaCaptura: string } | null;
  resumen: { totalCargas: number; totalLitrosCargados: number; totalViajes: number; rendimientoPromedio: number | null };
}

interface DiagnosticoIA {
  texto: string;
  generadoHaceMin: number;
  cached: boolean;
  error?: string;
}


type Periodo = "1d" | "7d" | "30d";

const estadoColors: Record<string, string> = { NORMAL: "#00ff88", ATENCION: "#ffcc00", CRITICO: "#ff2244" };
const estadoCamColors: Record<string, string> = { NORMAL: "#00ff88", ALERTA: "#ffcc00", CRITICO: "#ff2244" };

const alertaIcons: Record<string, { icon: string; texto: string }> = {
  desviacion: { icon: "\ud83d\udd34", texto: "Odometro alterado" },
  micro_carga: { icon: "\ud83d\udd34", texto: "Posible robo combustible" },
  exceso_velocidad: { icon: "\ud83d\udd34", texto: "Velocidad peligrosa" },
  offline: { icon: "\ud83d\udfe1", texto: "Sin senal prolongada" },
  rendimiento_bajo: { icon: "\ud83d\udfe1", texto: "Consumo anormal" },
  detenido_prolongado: { icon: "\ud83d\udd34", texto: "Detenido +12h — verificar" },
};

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help ml-1 align-middle">
          <Info className="w-3 h-3" style={{ color: "#3a6080" }} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs font-exo" style={{ background: "#1a2a3a", color: "#ffffff", border: "1px solid #2a4a5a" }}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function WidgetAprendizajeEstaciones() {
  const { data } = useQuery<any>({
    queryKey: ["/api/estaciones/aprendizaje"],
    refetchInterval: 10 * 60 * 1000,
  });

  if (!data?.resumen) return null;
  const r = data.resumen;

  const colorMadurez =
    r.madurez_pct >= 80 ? "#00ff88" :
    r.madurez_pct >= 50 ? "#00d4ff" :
    r.madurez_pct >= 20 ? "#ffcc00" :
    "#3a6080";

  return (
    <div className="border" style={{ borderColor: "#0d2035", background: "#060d14", borderTop: `2px solid ${colorMadurez}` }}
      data-testid="widget-aprendizaje-hoy">
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          <span className="font-space text-xs font-bold tracking-[0.15em]" style={{ color: "#00d4ff" }}>
            APRENDIZAJE - ESTACIONES
          </span>
        </div>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("sotraser-navigate", { detail: { tab: "geo", subtab: "estaciones" } }));
          }}
          className="font-exo text-[11px] px-2 py-1 border cursor-pointer transition-all hover:border-[#00d4ff]"
          style={{ borderColor: "#0d2035", color: "#3a6080" }}
          data-testid="btn-ver-detalle-aprendizaje">
          VER DETALLE <ChevronRight className="w-3 h-3 inline" />
        </button>
      </div>

      <div className="p-4">
        <div className="font-rajdhani text-[11px] mb-3 leading-relaxed" style={{ color: "#c8e8ff" }}>
          "{r.mensaje}"
        </div>

        <div className="mb-3">
          <div className="flex justify-between mb-1">
            <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Calibracion del sistema</span>
            <span className="font-space text-[11px] font-bold" style={{ color: colorMadurez }}>{r.madurez_pct}%</span>
          </div>
          <div className="h-1" style={{ background: "#0d2035" }}>
            <div className="h-full transition-all" style={{ width: `${r.madurez_pct}%`, background: colorMadurez }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2" style={{ background: "#0a1520" }}>
            <div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }} data-testid="hoy-stat-patrones">{r.total_patrones}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Patrones</div>
          </div>
          <div className="text-center p-2" style={{ background: "#0a1520" }}>
            <div className="font-space text-[18px] font-bold" style={{ color: "#00ff88" }} data-testid="hoy-stat-camiones">{r.camiones_con_patron}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Camiones</div>
          </div>
          <div className="text-center p-2" style={{ background: "#0a1520" }}>
            <div className="font-space text-[18px] font-bold" style={{ color: "#ffcc00" }} data-testid="hoy-stat-cargas">{r.cargas_historicas.toLocaleString("es-CL")}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Cargas</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Confianza:</span>
          {[
            { k: "experta", c: "#00ff88", l: "EXP" },
            { k: "alta", c: "#00d4ff", l: "ALTA" },
            { k: "media", c: "#ffcc00", l: "MED" },
            { k: "baja", c: "#3a6080", l: "BAJA" },
          ].map(n => (
            <div key={n.k} className="flex items-center gap-1">
              <span className="font-space text-xs font-bold" style={{ color: n.c }}>{r.por_confianza[n.k]}</span>
              <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{n.l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Hoy({ onNavigateFlota, onOpenIA }: { onNavigateFlota?: (contrato?: string) => void; onOpenIA?: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const alertasRef = useRef<HTMLDivElement>(null);
  const [contratoDetalle, setContratoDetalle] = useState<{ nombre: string; color: string } | null>(null);
  const [investigarPatente, setInvestigarPatente] = useState<string | null>(null);
  const [investigarTab, setInvestigarTab] = useState<"resumen" | "cargas" | "viajes">("resumen");

  const diasTendencia = periodo === "1d" ? 1 : periodo === "7d" ? 7 : 30;

  async function safeFetch<T>(url: string): Promise<T> {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json();
  }

  const { data: kpis, isLoading: loadingKpis } = useQuery<KPIs>({
    queryKey: ["/api/ceo/kpis", periodo],
    queryFn: () => safeFetch<KPIs>(`/api/ceo/kpis?periodo=${periodo}`),
    refetchInterval: 120000,
  });

  const { data: contratos = [], isLoading: loadingContratos } = useQuery<ContratoEstado[]>({
    queryKey: ["/api/ceo/contratos-estado"],
    refetchInterval: 120000,
  });

  const { data: tendencia = [], isLoading: loadingTendencia } = useQuery<TendenciaDay[]>({
    queryKey: ["/api/ceo/tendencia", diasTendencia],
    queryFn: () => safeFetch<TendenciaDay[]>(`/api/ceo/tendencia?dias=${diasTendencia}`),
    refetchInterval: 120000,
  });

  const { data: alertas = [], isLoading: loadingAlertas } = useQuery<Alerta[]>({
    queryKey: ["/api/ceo/alertas"],
    queryFn: () => safeFetch<Alerta[]>("/api/ceo/alertas?limite=5"),
    refetchInterval: 120000,
  });

  const { data: diagnostico, isLoading: loadingDiag } = useQuery<DiagnosticoIA>({
    queryKey: ["/api/ceo/diagnostico-ia"],
    refetchInterval: 1800000,
  });

  const { data: investigacion, isLoading: loadingInvestigacion } = useQuery<InvestigacionData>({
    queryKey: ["/api/ceo/investigar", investigarPatente],
    queryFn: () => safeFetch<InvestigacionData>(`/api/ceo/investigar/${investigarPatente}`),
    enabled: !!investigarPatente,
  });

  const minAgo = Math.round((Date.now() - lastRefresh) / 60000);

  function handleRefreshAll() {
    setLastRefresh(Date.now());
    queryClient.invalidateQueries({ queryKey: ["/api/ceo/kpis"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ceo/contratos-estado"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ceo/tendencia"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ceo/alertas"] });
  }

  function handleRefreshDiag() {
    queryClient.invalidateQueries({ queryKey: ["/api/ceo/diagnostico-ia"] });
    queryClient.fetchQuery({
      queryKey: ["/api/ceo/diagnostico-ia"],
      queryFn: () => fetch("/api/ceo/diagnostico-ia?force=true").then(r => { if (!r.ok) throw new Error("Error"); return r.json(); }),
    });
  }

  function scrollToAlertas() {
    alertasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const estadoBadge = (() => {
    const c = kpis?.alertasCriticas ?? 0;
    if (c === 0) return { label: "OPERACION NORMAL", color: "#00ff88", blink: false };
    if (c <= 3) return { label: "ATENCION REQUERIDA", color: "#ffcc00", blink: true };
    return { label: "ALERTA ACTIVA", color: "#ff2244", blink: true };
  })();

  function parseDiagnostico(texto: string) {
    const lines = texto.split("\n").filter(l => l.trim());
    const result: { icon: string; label: string; text: string; color: string }[] = [];
    for (const line of lines) {
      if (line.startsWith("ESTADO:")) {
        result.push({ icon: "\ud83d\udfe2", label: "ESTADO", text: line.replace("ESTADO:", "").trim(), color: "#00ff88" });
      } else if (line.startsWith("POSITIVO:")) {
        result.push({ icon: "\u2705", label: "POSITIVO", text: line.replace("POSITIVO:", "").trim(), color: "#00ff88" });
      } else if (line.startsWith("ATENCION:") || line.startsWith("ATENCI\u00d3N:")) {
        result.push({ icon: "\u26a0\ufe0f", label: "ATENCION", text: line.replace(/ATENCI[O\u00d3]N:/, "").trim(), color: "#ffcc00" });
      } else if (line.startsWith("ACCION:") || line.startsWith("ACCI\u00d3N:")) {
        result.push({ icon: "\u25b6\ufe0f", label: "ACCION", text: line.replace(/ACCI[O\u00d3]N:/, "").trim(), color: "#00d4ff" });
      }
    }
    return result;
  }

  const totalCamiones = useMemo(() => contratos.reduce((s, c) => s + c.camionesTotal, 0), [contratos]);
  const totalActivos = useMemo(() => contratos.reduce((s, c) => s + (c.camionesActivos || 0), 0), [contratos]);
  const totalAlertas = useMemo(() => contratos.reduce((s, c) => s + c.alertasCriticas, 0), [contratos]);

  const contratosColors: Record<string, string> = {
    CENCOSUD: "#00d4ff",
    "ANGLO-COCU": "#1A8FFF",
    "ANGLO-CARGAS VARIAS": "#FF6B35",
    "ANGLO-CAL": "#00C49A",
  };

  return (<>
    <div className="space-y-5" data-testid="page-hoy">

      {/* BLOQUE A — STATUS BANNER */}
      <div className="p-4 flex items-center justify-between"
        style={{
          background: `linear-gradient(135deg, ${estadoBadge.color}08, #091018)`,
          borderTop: `1px solid ${estadoBadge.color}30`,
          borderRight: `1px solid ${estadoBadge.color}30`,
          borderBottom: `1px solid ${estadoBadge.color}30`,
          borderLeft: `4px solid ${estadoBadge.color}`,
        }}
        data-testid="hoy-status-banner">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {kpis?.alertasCriticas ? (
              <AlertTriangle className="w-5 h-5" style={{ color: estadoBadge.color }} />
            ) : (
              <Shield className="w-5 h-5" style={{ color: estadoBadge.color }} />
            )}
            <div>
              <div className="font-space text-[14px] font-bold tracking-[0.15em]" style={{ color: estadoBadge.color }}>
                {estadoBadge.label}
              </div>
              <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
                {totalActivos}/{totalCamiones} camiones en linea
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(["1d", "7d", "30d"] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                data-testid={`hoy-periodo-${p}`}
                className="font-space text-xs font-bold px-3 py-1 cursor-pointer transition-all border"
                style={{
                  color: periodo === p ? "#020508" : "#3a6080",
                  background: periodo === p ? "#00d4ff" : "transparent",
                  borderColor: periodo === p ? "#00d4ff" : "#0d2035",
                }}>
                {p === "1d" ? "HOY" : p.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            hace {minAgo < 1 ? "<1" : minAgo} min
          </span>
          <button onClick={handleRefreshAll} className="p-1.5 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.1)] rounded"
            data-testid="hoy-refresh">
            <RefreshCw className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          </button>
        </div>
      </div>

      {/* BLOQUE B — 4 KPIs */}
      <div data-testid="hoy-kpis">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="FLOTA ACTIVA"
            value={kpis ? String(kpis.camionesActivos) : "--"}
            sub={kpis ? `de ${kpis.camionesTotal} camiones` : ""}
            progress={kpis ? Math.round((kpis.camionesActivos / Math.max(kpis.camionesTotal, 1)) * 100) : 0}
            color="#00d4ff"
            loading={loadingKpis}
            icon={<Truck className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="RENDIMIENTO"
            value={kpis ? `${kpis.rendPromedio}` : "--"}
            sub={kpis ? `${kpis.rendCambioPct >= 0 ? "+" : ""}${kpis.rendCambioPct}% vs periodo ant.` : ""}
            color={kpis ? (kpis.rendCambioPct >= 0 ? "#00ff88" : "#ff2244") : "#3a6080"}
            loading={loadingKpis}
            tooltip="Kilometros recorridos por litro de combustible. Mayor = mas eficiente."
            icon={kpis && kpis.rendCambioPct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            unit="km/L"
          />
          <KpiCard
            label="CONSUMO"
            value={kpis?.litrosPeriodo != null ? kpis.litrosPeriodo.toLocaleString() : "--"}
            sub={kpis ? `${kpis.litrosCambioPct >= 0 ? "+" : ""}${kpis.litrosCambioPct}% vs periodo ant.` : ""}
            color="#ffcc00"
            loading={loadingKpis}
            icon={<Fuel className="w-3.5 h-3.5" />}
            unit="L"
          />
          <KpiCard
            label="ALERTAS"
            value={kpis ? String(kpis.alertasCriticas) : "--"}
            sub={kpis?.alertasCriticas ? `${kpis.excesosVel} velocidad / ${kpis.microSospechas} micro-cargas` : "Sin alertas criticas"}
            color={kpis?.alertasCriticas ? "#ff2244" : "#00ff88"}
            loading={loadingKpis}
            onClick={kpis?.alertasCriticas ? scrollToAlertas : undefined}
            icon={<Zap className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* BLOQUE C — CONTRATOS */}
      <div data-testid="hoy-contratos">
        <div className="flex items-center justify-between mb-3">
          <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: "#c8e8ff" }}>
            ESTADO POR CONTRATO
          </div>
          {totalAlertas > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" style={{ color: "#ff2244" }} />
              <span className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>
                {totalAlertas} alertas activas en flota
              </span>
            </div>
          )}
        </div>
        {loadingContratos ? (
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00d4ff" }} />
            <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando contratos...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {contratos.map((c, i) => {
              const col = contratosColors[c.nombre] || c.color || "#00d4ff";
              const pctActivos = c.camionesTotal > 0 ? Math.round(((c.camionesActivos || 0) / c.camionesTotal) * 100) : 0;
              return (
                <div key={i} className="p-4 transition-all hover:bg-[rgba(0,212,255,0.02)]"
                  style={{
                    background: "#091018",
                    borderTop: "1px solid #0d2035",
                    borderRight: "1px solid #0d2035",
                    borderBottom: "1px solid #0d2035",
                    borderLeft: `3px solid ${col}`,
                  }}
                  data-testid={`hoy-contrato-${i}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[12px] font-bold tracking-[0.1em]" style={{ color: col }}>
                        {c.nombre}
                      </span>
                      <span className="font-space text-xs font-bold px-1.5 py-0.5 rounded"
                        style={{
                          color: estadoColors[c.estado],
                          background: `${estadoColors[c.estado]}15`,
                          border: `1px solid ${estadoColors[c.estado]}30`,
                        }}>
                        {c.estado}
                      </span>
                    </div>
                    <button onClick={() => setContratoDetalle({ nombre: c.nombre, color: col })}
                      className="p-1.5 cursor-pointer transition-all border hover:border-[#00d4ff] hover:shadow-[0_0_8px_rgba(0,212,255,0.2)] rounded"
                      style={{ borderColor: "#0d2035", background: "rgba(0,212,255,0.04)" }}
                      title={`Ver detalle de ${c.nombre}`}
                      data-testid={`hoy-contrato-lupa-${i}`}>
                      <Search className="w-3 h-3" style={{ color: "#00d4ff" }} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <div className="font-exo text-xs uppercase tracking-wider mb-0.5" style={{ color: "#3a6080" }}>Camiones</div>
                      <div className="font-space text-[16px] font-bold leading-none" style={{ color: "#c8e8ff" }}>
                        {c.camionesActivos != null ? c.camionesActivos : c.camionesTotal}
                        <span className="text-xs font-normal" style={{ color: "#3a6080" }}>/{c.camionesTotal}</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-exo text-xs uppercase tracking-wider mb-0.5" style={{ color: "#3a6080" }}>Rend.</div>
                      <div className="font-space text-[16px] font-bold leading-none" style={{ color: c.rendPromedio >= 3.0 ? "#00ff88" : c.rendPromedio >= 2.0 ? "#ffcc00" : "#ff2244" }}>
                        {c.rendPromedio > 0 ? c.rendPromedio.toFixed(1) : "N/D"}
                        {c.rendPromedio > 0 && <span className="text-[11px] font-normal" style={{ color: "#3a6080" }}> km/L</span>}
                      </div>
                    </div>
                    <div>
                      <div className="font-exo text-xs uppercase tracking-wider mb-0.5" style={{ color: "#3a6080" }}>Alertas</div>
                      <div className="font-space text-[16px] font-bold leading-none" style={{ color: c.alertasCriticas > 0 ? "#ff2244" : "#00ff88" }}>
                        {c.alertasCriticas}
                      </div>
                    </div>
                  </div>

                  <div className="h-1 rounded overflow-hidden mb-3" style={{ background: "#0d2035" }}>
                    <div className="h-full transition-all duration-700 rounded" style={{ width: `${pctActivos}%`, background: col }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setContratoDetalle({ nombre: c.nombre, color: col })}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 font-space text-xs font-bold tracking-[0.1em] cursor-pointer transition-all border hover:border-[#00d4ff] hover:shadow-[0_0_10px_rgba(0,212,255,0.15)]"
                      style={{ background: "rgba(0,212,255,0.06)", borderColor: "rgba(0,212,255,0.25)", color: "#00d4ff" }}
                      data-testid={`hoy-contrato-dia-${i}`}>
                      <Activity className="w-3 h-3" /> DIA (24h)
                    </button>
                    <button
                      onClick={() => onNavigateFlota?.(c.nombre)}
                      className="flex items-center gap-1 px-3 py-2 font-exo text-xs font-bold cursor-pointer transition-all hover:text-[#00d4ff] border"
                      style={{ color: "#3a6080", borderColor: "#0d2035" }}
                      data-testid={`hoy-contrato-detalle-${i}`}>
                      FLOTA <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            {contratos.length === 0 && (
              <div className="font-exo text-[11px] py-4" style={{ color: "#3a6080" }}>Sin contratos con camiones asignados</div>
            )}
          </div>
        )}
      </div>

      {/* BLOQUE D — REQUIERE ATENCION */}
      <div ref={alertasRef} data-testid="hoy-alertas">
        {loadingAlertas ? (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00d4ff" }} />
          </div>
        ) : !Array.isArray(alertas) || alertas.length === 0 ? (
          <div className="p-4 flex items-center gap-3" style={{ background: "#091018", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "3px solid #00ff88" }}>
            <Shield className="w-4 h-4" style={{ color: "#00ff88" }} />
            <span className="font-exo text-[12px] font-bold" style={{ color: "#00ff88" }}>Todo en orden — sin alertas activas</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
                <span className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: "#c8e8ff" }}>
                  REQUIERE TU ATENCION
                </span>
                <span className="font-space text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#ff2244", color: "#020508" }}>
                  {Array.isArray(alertas) ? alertas.length : 0}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {(Array.isArray(alertas) ? alertas : []).slice(0, 5).map((a, i) => {
                const info = alertaIcons[a.tipo] || { icon: a.nivel === "CRITICO" ? "\ud83d\udd34" : "\ud83d\udfe1", texto: a.tipo };
                const borderCol = a.nivel === "CRITICO" ? "#ff224440" : "#ffcc0030";
                return (
                  <div key={i} className="p-3 flex items-start gap-3 transition-all hover:bg-[rgba(0,212,255,0.03)]"
                    style={{ background: "#091018", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: `3px solid ${borderCol}` }}
                    data-testid={`hoy-alerta-${i}`}>
                    <span className="text-[14px] mt-0.5 flex-shrink-0">{info.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{a.titulo}</div>
                      <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>{a.detalle}</div>
                      <div className="font-exo text-[11px] mt-1" style={{ color: "#1a3550" }}>{a.hace}</div>
                    </div>
                    <button
                      onClick={() => {
                        if (a.patente) {
                          setInvestigarPatente(a.patente);
                          setInvestigarTab("resumen");
                        } else {
                          onNavigateFlota?.();
                        }
                      }}
                      className="font-exo text-[11px] font-bold px-2.5 py-1.5 cursor-pointer transition-all border hover:border-[#00d4ff] hover:text-[#00d4ff] flex-shrink-0 rounded"
                      style={{ borderColor: "#0d2035", color: "#3a6080" }}
                      data-testid={`hoy-alerta-investigar-${i}`}>
                      <Search className="w-3 h-3 inline mr-0.5" />Investigar
                    </button>
                  </div>
                );
              })}
              {Array.isArray(alertas) && alertas.length > 5 && (
                <button onClick={scrollToAlertas}
                  className="font-exo text-xs font-bold cursor-pointer px-3 py-2 w-full text-center transition-all hover:text-[#00d4ff]"
                  style={{ color: "#3a6080" }}
                  data-testid="hoy-alertas-mas">
                  Ver {(Array.isArray(alertas) ? alertas.length : 0) - 5} alertas mas <ChevronRight className="w-3 h-3 inline" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* BLOQUE E — TENDENCIA + DIAGNOSTICO IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="hoy-bottom">
        <div className="p-4" style={{ background: "#091018", border: "1px solid #0d2035" }} data-testid="hoy-tendencia">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
              <span className="font-space text-xs font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
                TENDENCIA {periodo === "1d" ? "HOY" : periodo.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-[2px] rounded" style={{ background: "#00d4ff" }} />
                <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Litros</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-[2px] rounded" style={{ background: "#00ff88" }} />
                <span className="font-exo text-xs" style={{ color: "#3a6080" }}>km/L</span>
              </div>
            </div>
          </div>
          {loadingTendencia ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00d4ff" }} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={tendencia} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#0d2035" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: "#3a6080", fontSize: 11, fontFamily: "Space Mono" }}
                  tickFormatter={(v: string) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                  stroke="#0d2035"
                />
                <YAxis yAxisId="left" tick={{ fill: "#3a6080", fontSize: 11 }} stroke="#0d2035" />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#00ff88", fontSize: 11 }} stroke="#0d2035" />
                <ReTooltip
                  contentStyle={{ background: "#091018", border: "1px solid #0d2035", fontFamily: "Exo 2", fontSize: 11, color: "#c8e8ff" }}
                  labelFormatter={(v: string) => new Date(v).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                />
                <Line yAxisId="left" type="monotone" dataKey="litrosDia" name="Litros" stroke="#00d4ff" strokeWidth={2} dot={{ r: 3, fill: "#00d4ff" }} />
                <Line yAxisId="right" type="monotone" dataKey="rendimientoDia" name="km/L" stroke="#00ff88" strokeWidth={2} dot={{ r: 3, fill: "#00ff88" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="p-4" style={{ background: "#091018", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "3px solid #00d4ff" }}
          data-testid="hoy-diagnostico">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
              <span className="font-space text-xs font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
                DIAGNOSTICO IA
              </span>
            </div>
            <div className="flex items-center gap-2">
              {diagnostico && (
                <span className="font-exo text-xs" style={{ color: "#3a6080" }}>
                  hace {diagnostico.generadoHaceMin < 1 ? "<1" : diagnostico.generadoHaceMin} min
                </span>
              )}
              <button onClick={handleRefreshDiag} className="p-1 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.1)] rounded"
                data-testid="hoy-refresh-diag">
                <RefreshCw className="w-3 h-3" style={{ color: "#00d4ff" }} />
              </button>
            </div>
          </div>

          {loadingDiag ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Generando diagnostico...</span>
            </div>
          ) : diagnostico?.texto ? (
            <div className="space-y-2">
              {parseDiagnostico(diagnostico.texto).map((line, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="text-[12px] flex-shrink-0">{line.icon}</span>
                  <div className="min-w-0">
                    <span className="font-space text-[11px] font-bold tracking-[0.1em] mr-1" style={{ color: line.color }}>
                      {line.label}:
                    </span>
                    <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{line.text}</span>
                  </div>
                </div>
              ))}
              {onOpenIA && (
                <button onClick={onOpenIA}
                  className="mt-2 font-exo text-xs font-bold cursor-pointer transition-all hover:text-[#00d4ff] flex items-center gap-1"
                  style={{ color: "#3a6080" }}
                  data-testid="hoy-consultar-ia">
                  Consultar mas <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="font-exo text-[11px] py-4" style={{ color: "#3a6080" }}>
              No se pudo generar el diagnostico.
            </div>
          )}
        </div>
      </div>

      <WidgetAprendizajeEstaciones />

      {contratoDetalle && (
        <ContratoPage nombre={contratoDetalle.nombre} color={contratoDetalle.color} onClose={() => setContratoDetalle(null)} />
      )}

    </div>

    {investigarPatente && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}
        onClick={(e) => { if (e.target === e.currentTarget) setInvestigarPatente(null); }}>
        <div className="w-full max-w-[800px] max-h-[85vh] overflow-y-auto mx-4 rounded-lg"
          style={{ background: "#091018", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "3px solid #00d4ff" }}
          data-testid="modal-investigacion">
          <div className="flex items-center justify-between px-5 py-3 sticky top-0 z-10" style={{ background: "#091018", borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4" style={{ color: "#00d4ff" }} />
              <div>
                <span className="font-exo text-[11px] tracking-[0.2em] uppercase" style={{ color: "#3a6080" }}>INVESTIGACION</span>
                <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>
                  {investigarPatente}
                  {investigacion?.camion && (
                    <span className="font-exo text-xs font-normal ml-2" style={{ color: "#3a6080" }}>
                      {investigacion.camion.contrato} {investigacion.camion.modelo && `/ ${investigacion.camion.modelo}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setInvestigarPatente(null)} className="cursor-pointer p-1 rounded hover:bg-[#0d2035]" data-testid="btn-cerrar-investigacion">
              <X className="w-5 h-5" style={{ color: "#3a6080" }} />
            </button>
          </div>

          {loadingInvestigacion ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[11px] ml-2" style={{ color: "#3a6080" }}>Cargando datos del camion...</span>
            </div>
          ) : investigacion ? (
            <>
              <div className="flex gap-1 px-5 pt-3" data-testid="investigacion-tabs">
                {(["resumen", "cargas", "viajes"] as const).map(tab => (
                  <button key={tab} onClick={() => setInvestigarTab(tab)}
                    className="font-exo text-xs font-bold px-4 py-2 cursor-pointer transition-all rounded-t"
                    style={{
                      background: investigarTab === tab ? "#0d2035" : "transparent",
                      color: investigarTab === tab ? "#00d4ff" : "#3a6080",
                      borderTop: investigarTab === tab ? "1px solid #00d4ff" : "1px solid transparent",
                      borderRight: investigarTab === tab ? "1px solid #0d2035" : "1px solid transparent",
                      borderLeft: investigarTab === tab ? "1px solid #0d2035" : "1px solid transparent",
                    }}
                    data-testid={`tab-investigacion-${tab}`}>
                    {tab === "resumen" ? "RESUMEN" : tab === "cargas" ? `CARGAS (${investigacion.cargas.length})` : `VIAJES (${investigacion.viajes.length})`}
                  </button>
                ))}
              </div>

              <div className="px-5 py-4">
                {investigarTab === "resumen" && (
                  <div className="space-y-4" data-testid="investigacion-resumen">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                        <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CARGAS</div>
                        <div className="font-space text-[20px] font-bold" style={{ color: "#ffcc00" }}>{investigacion.resumen.totalCargas}</div>
                        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{investigacion.resumen.totalLitrosCargados} L total</div>
                      </div>
                      <div className="p-3 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                        <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>VIAJES ECU</div>
                        <div className="font-space text-[20px] font-bold" style={{ color: "#00d4ff" }}>{investigacion.resumen.totalViajes}</div>
                        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>registrados</div>
                      </div>
                      <div className="p-3 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                        <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>RENDIMIENTO</div>
                        <div className="font-space text-[20px] font-bold" style={{ color: investigacion.resumen.rendimientoPromedio && investigacion.resumen.rendimientoPromedio >= 3 ? "#00c97a" : "#ffcc00" }}>
                          {investigacion.resumen.rendimientoPromedio?.toFixed(2) || "N/D"}
                        </div>
                        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>km/L promedio</div>
                      </div>
                      <div className="p-3 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                        <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>VIN</div>
                        <div className="font-space text-[11px] font-bold mt-1 break-all" style={{ color: "#c8e8ff" }}>
                          {investigacion.camion.vin || "Sin VIN"}
                        </div>
                        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{investigacion.camion.ano || ""}</div>
                      </div>
                    </div>

                    {investigacion.conductores.length > 0 && (
                      <div>
                        <div className="font-exo text-[11px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>CONDUCTORES ASOCIADOS</div>
                        <div className="flex flex-wrap gap-2">
                          {investigacion.conductores.map((c, ci) => (
                            <span key={ci} className="font-space text-xs px-3 py-1.5 rounded" style={{ background: "#0d2035", color: "#c8e8ff" }}>{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {investigacion.snapshotEcu && (
                      <div>
                        <div className="font-exo text-[11px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>DATOS ECU (VOLVO CONNECT)</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-2.5 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                            <div className="flex justify-between">
                              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Km acumulados</span>
                              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{investigacion.snapshotEcu.kmAcumulados.toLocaleString()} km</span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Delta ultimo</span>
                              <span className="font-space text-xs" style={{ color: "#00d4ff" }}>+{investigacion.snapshotEcu.kmDelta} km</span>
                            </div>
                          </div>
                          <div className="p-2.5 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                            <div className="flex justify-between">
                              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Litros acumulados</span>
                              <span className="font-space text-[11px] font-bold" style={{ color: "#ffcc00" }}>{investigacion.snapshotEcu.litrosAcumulados.toLocaleString()} L</span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Delta ultimo</span>
                              <span className="font-space text-xs" style={{ color: "#ffcc00" }}>+{investigacion.snapshotEcu.litrosDelta} L</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {investigacion.gpsUltimo && (
                      <div>
                        <div className="font-exo text-[11px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>ULTIMA POSICION GPS</div>
                        <div className="p-2.5 rounded flex items-center justify-between" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: "1px solid #0d2035" }}>
                          <div>
                            <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>
                              {investigacion.gpsUltimo.lat.toFixed(4)}, {investigacion.gpsUltimo.lng.toFixed(4)}
                            </span>
                            <span className="font-exo text-[11px] ml-3" style={{ color: "#3a6080" }}>
                              {new Date(investigacion.gpsUltimo.timestamp_punto).toLocaleString("es-CL")}
                            </span>
                          </div>
                          <span className="font-space text-[11px] font-bold" style={{ color: investigacion.gpsUltimo.vel > 5 ? "#00c97a" : "#3a6080" }}>
                            {investigacion.gpsUltimo.vel?.toFixed(0) || 0} km/h
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {investigarTab === "cargas" && (
                  <div data-testid="investigacion-cargas">
                    {investigacion.cargas.length === 0 ? (
                      <div className="text-center py-8">
                        <Fuel className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
                        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin cargas registradas</div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr style={{ borderBottom: "1px solid #0d2035" }}>
                              {["FECHA", "LITROS", "KM ODO", "CONDUCTOR", "ESTACION", "CIUDAD"].map(h => (
                                <th key={h} className="font-exo text-[11px] tracking-[0.15em] text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {investigacion.cargas.map((c, ci) => {
                              const kmDelta = c.odometro > 0 && c.odometroPrevio > 0 ? c.odometro - c.odometroPrevio : null;
                              return (
                                <tr key={ci} style={{ borderBottom: "1px solid #0d203530" }} data-testid={`carga-row-${ci}`}>
                                  <td className="font-space text-xs px-3 py-2" style={{ color: "#c8e8ff" }}>
                                    {c.fecha ? new Date(c.fecha).toLocaleDateString("es-CL") : "--"}
                                  </td>
                                  <td className="font-space text-[11px] font-bold px-3 py-2" style={{ color: "#ffcc00" }}>
                                    {c.litros.toFixed(1)} L
                                  </td>
                                  <td className="font-space text-xs px-3 py-2" style={{ color: "#c8e8ff" }}>
                                    {c.odometro > 0 ? c.odometro.toLocaleString() : "--"}
                                    {kmDelta != null && kmDelta > 0 && (
                                      <span className="font-exo text-xs ml-1" style={{ color: "#3a6080" }}>({kmDelta.toLocaleString()} km)</span>
                                    )}
                                  </td>
                                  <td className="font-exo text-xs px-3 py-2" style={{ color: "#c8e8ff" }}>{c.conductor || "--"}</td>
                                  <td className="font-exo text-xs px-3 py-2" style={{ color: "#c8e8ff" }}>{c.estacion || "--"}</td>
                                  <td className="font-exo text-xs px-3 py-2" style={{ color: "#3a6080" }}>{c.ciudad || "--"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {investigarTab === "viajes" && (
                  <div data-testid="investigacion-viajes">
                    {investigacion.viajes.length === 0 ? (
                      <div className="text-center py-8">
                        <Truck className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
                        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin viajes ECU registrados</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {investigacion.viajes.map((v, vi) => {
                          const rendColor = v.rendimiento >= 3.5 ? "#00c97a" : v.rendimiento >= 2.5 ? "#ffcc00" : "#ff2244";
                          const estadoColor = v.estado === "ANOMALIA" ? "#ff2244" : v.estado === "REVISAR" ? "#ffcc00" : "#00c97a";
                          return (
                            <div key={vi} className="p-3 rounded" style={{ background: "#0a1520", borderTop: "1px solid #0d2035", borderRight: "1px solid #0d2035", borderBottom: "1px solid #0d2035", borderLeft: `3px solid ${estadoColor}` }}
                              data-testid={`viaje-inv-${vi}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>
                                    {v.fecha_inicio ? new Date(v.fecha_inicio).toLocaleDateString("es-CL") : ""}
                                  </span>
                                  <span className="font-exo text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: estadoColor + "20", color: estadoColor }}>
                                    {v.estado}
                                  </span>
                                  {v.score > 20 && (
                                    <span className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>SCORE {v.score}</span>
                                  )}
                                </div>
                                <span className="font-space text-[12px] font-bold" style={{ color: rendColor }}>{v.rendimiento?.toFixed(2)} km/L</span>
                              </div>
                              <div className="font-exo text-xs font-bold mb-1.5" style={{ color: "#c8e8ff" }}>
                                {v.origen_nombre || "?"} → {v.destino_nombre || "?"}
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                <div>
                                  <span className="font-exo text-xs" style={{ color: "#3a6080" }}>KM ECU</span>
                                  <div className="font-space text-xs font-bold" style={{ color: "#c8e8ff" }}>{v.km_ecu?.toFixed(0)} km</div>
                                </div>
                                <div>
                                  <span className="font-exo text-xs" style={{ color: "#3a6080" }}>L ECU</span>
                                  <div className="font-space text-xs font-bold" style={{ color: "#ffcc00" }}>{v.litros_ecu?.toFixed(1)} L</div>
                                </div>
                                <div>
                                  <span className="font-exo text-xs" style={{ color: "#3a6080" }}>CONDUCTOR</span>
                                  <div className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{v.conductor || "--"}</div>
                                </div>
                                <div>
                                  <span className="font-exo text-xs" style={{ color: "#3a6080" }}>DURACION</span>
                                  <div className="font-space text-xs" style={{ color: "#c8e8ff" }}>
                                    {v.duracion_min ? `${Math.floor(v.duracion_min / 60)}h ${v.duracion_min % 60}m` : "--"}
                                  </div>
                                </div>
                              </div>
                              {/* OCULTO TEMPORALMENTE: litros_sigetra / cruce Sigetra */}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-16">
              <AlertTriangle className="w-5 h-5" style={{ color: "#ff2244" }} />
              <span className="font-exo text-[11px] ml-2" style={{ color: "#ff2244" }}>No se encontraron datos para este camion</span>
            </div>
          )}
        </div>
      </div>
    )}
  </>);
}

export function ContratoPage({ nombre, color, onClose }: { nombre: string; color: string; onClose: () => void }) {
    const [camionSeleccionado, setCamionSeleccionado] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery<any>({
      queryKey: ["/api/contratos/cuadratura-mensual", nombre],
      queryFn: async () => {
        const r = await fetch(`/api/contratos/cuadratura-mensual?contrato=${encodeURIComponent(nombre)}`);
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      },
    });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={onClose}
        data-testid="contrato-page-overlay">
        <div className="absolute inset-0"
          style={{ background: "rgba(2,5,8,0.9)", backdropFilter: "blur(8px)" }} />

        <div className="relative w-full max-w-[860px] max-h-[90vh] overflow-y-auto m-4"
          style={{ background: "#020508", border: `1px solid ${color}30`, borderTop: `3px solid ${color}` }}
          onClick={e => e.stopPropagation()}
          data-testid="contrato-page-panel">

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color }} />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20">
              <span className="font-exo text-[12px]" style={{ color: "#ff2244" }}>Error al cargar datos</span>
            </div>
          ) : data && (
            <>
              <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
                style={{ background: "#020508", borderBottom: "1px solid #0d2035" }}>
                <div>
                  <div className="font-space text-[20px] font-bold tracking-[0.2em]" style={{ color }}
                    data-testid="text-contrato-nombre">
                    {nombre}
                  </div>
                  <div className="font-exo text-xs tracking-wider" style={{ color: "#3a6080" }}>
                    CUADRATURA · {data.resumen?.periodo?.desde} → {data.resumen?.periodo?.hasta} · {data.resumen?.periodo?.dias} dias
                  </div>
                </div>
                <button onClick={onClose} className="p-2 cursor-pointer hover:opacity-70"
                  data-testid="btn-cerrar-contrato">
                  <X className="w-5 h-5" style={{ color: "#3a6080" }} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-4 gap-3" data-testid="contrato-kpis">
                  {[
                    {
                      label: "OPERACIONES\nVERIFICADAS",
                      value: data.resumen?.total_operaciones ?? 0,
                      sub: `${data.resumen?.camiones_activos ?? 0} camiones`,
                      kpiColor: "#00d4ff",
                    },
                    {
                      label: "KM TOTALES\nECU",
                      value: (data.resumen?.km_total ?? 0).toLocaleString("es-CL"),
                      sub: "kilometros reales",
                      kpiColor: "#c8e8ff",
                    },
                    {
                      label: "RENDIMIENTO\nPROMEDIO",
                      value: data.resumen?.rendimiento_promedio ? `${data.resumen.rendimiento_promedio} km/L` : "N/D",
                      sub: "operaciones verificadas",
                      kpiColor: "#00ff88",
                    },
                    {
                      label: "BALANCE\nMENSUAL",
                      value: `${(data.resumen?.balance_total ?? 0) > 0 ? "+" : ""}${(data.resumen?.balance_total ?? 0).toLocaleString("es-CL")}L`,
                      sub: "Sigetra vs ECU",
                      kpiColor: Math.abs(data.resumen?.balance_total ?? 0) < 500 ? "#00ff88" : Math.abs(data.resumen?.balance_total ?? 0) < 2000 ? "#ffcc00" : "#ff2244",
                    },
                  ].map((kpi, idx) => (
                    <div key={idx} className="p-4"
                      style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${kpi.kpiColor}` }}
                      data-testid={`kpi-${idx}`}>
                      <div className="font-exo text-[7px] tracking-[0.2em] uppercase whitespace-pre mb-2" style={{ color: "#3a6080" }}>
                        {kpi.label}
                      </div>
                      <div className="font-space text-[22px] font-bold" style={{ color: kpi.kpiColor }}>
                        {kpi.value}
                      </div>
                      <div className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>
                        {kpi.sub}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="font-exo text-xs tracking-[0.2em] uppercase mb-2" style={{ color: "#3a6080" }}>
                    CALIDAD DE CIERRE
                  </div>
                  <div className="flex gap-3">
                    {[
                      { k: "perfectas", l: "PERFECTA", c: "#00ff88", desc: "Dif < 5%" },
                      { k: "buenas", l: "BUENA", c: "#00d4ff", desc: "Dif < 15%" },
                      { k: "aceptables", l: "ACEPTABLE", c: "#ffcc00", desc: "Dif < 25%" },
                    ].map(q => (
                      <div key={q.k} className="flex-1 p-3 text-center"
                        style={{ background: "#0a1520", border: `1px solid ${q.c}20` }}
                        data-testid={`calidad-${q.k}`}>
                        <div className="font-space text-[22px] font-bold" style={{ color: q.c }}>
                          {data.resumen?.calidad_distribucion?.[q.k] ?? 0}
                        </div>
                        <div className="font-exo text-xs font-bold" style={{ color: q.c }}>{q.l}</div>
                        <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{q.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-exo text-xs tracking-[0.2em] uppercase mb-3" style={{ color: "#3a6080" }}>
                    CAMIONES · CLICK PARA VER CUADRATURA INDIVIDUAL
                  </div>

                  <div className="grid grid-cols-7 px-3 py-2 mb-1" style={{ background: "#0a1520" }}>
                    {["CAMION", "CONDUCTOR", "OPS", "KM ECU", "L ECU", "REND", "BALANCE"].map(h => (
                      <div key={h} className="font-exo text-xs tracking-wider uppercase" style={{ color: "#3a6080" }}>{h}</div>
                    ))}
                  </div>

                  {(!data.camiones || data.camiones.length === 0) && (
                    <div className="py-8 text-center font-exo text-[11px]" style={{ color: "#3a6080" }}
                      data-testid="text-sin-operaciones">
                      Sin operaciones verificadas este mes. Las operaciones aparecen cuando el sistema cierra periodos entre cargas con ECU.
                    </div>
                  )}

                  {data.camiones?.map((cam: any) => (
                    <button key={cam.patente}
                      onClick={() => setCamionSeleccionado(cam.patente)}
                      className="w-full grid grid-cols-7 px-3 py-3 border-b cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.04)] text-left"
                      style={{ borderColor: "#0d2035" }}
                      data-testid={`camion-row-${cam.patente}`}>
                      <div className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{cam.patente}</div>
                      <div className="font-exo text-xs truncate" style={{ color: "#c8e8ff" }}>{cam.conductor}</div>
                      <div className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>
                        {cam.operaciones?.length ?? 0}
                        <span className="font-exo text-xs ml-1" style={{ color: "#3a6080" }}>ops</span>
                      </div>
                      <div className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>
                        {Math.round(cam.km_total).toLocaleString("es-CL")}
                      </div>
                      <div className="font-space text-[11px]" style={{ color: "#ffcc00" }}>
                        {Math.round(cam.litros_ecu_total).toLocaleString("es-CL")}L
                      </div>
                      <div className="font-space text-[11px] font-bold"
                        style={{ color: !cam.rendimiento_promedio ? "#3a6080" : cam.rendimiento_promedio >= 2.5 ? "#00ff88" : "#ffcc00" }}>
                        {cam.rendimiento_promedio ? `${cam.rendimiento_promedio} km/L` : "--"}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-space text-[11px] font-bold"
                          style={{ color: Math.abs(cam.balance_total) < 100 ? "#00ff88" : Math.abs(cam.balance_total) < 500 ? "#ffcc00" : "#ff2244" }}>
                          {cam.balance_total > 0 ? "+" : ""}{cam.balance_total}L
                        </span>
                        <span style={{ color: cam.tendencia === "MEJORANDO" ? "#00ff88" : cam.tendencia === "EMPEORANDO" ? "#ff2244" : "#3a6080" }}>
                          {cam.tendencia === "MEJORANDO" ? String.fromCharCode(8599) : cam.tendencia === "EMPEORANDO" ? String.fromCharCode(8600) : String.fromCharCode(8594)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {camionSeleccionado && (
          <MiniCuadroOperacional patente={camionSeleccionado} onClose={() => setCamionSeleccionado(null)} />
        )}
      </div>
    );
  }

  function MiniCuadroOperacional({ patente, onClose }: { patente: string; onClose: () => void }) {
    const { data, isLoading, error } = useQuery<any>({
      queryKey: ["/api/contratos/cuadratura-camion", patente],
      queryFn: async () => {
        const r = await fetch(`/api/contratos/cuadratura-camion?patente=${encodeURIComponent(patente)}`);
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      },
    });

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center"
        onClick={onClose}>
        <div className="absolute inset-0" style={{ background: "rgba(2,5,8,0.7)" }} />

        <div className="relative w-full max-w-[640px] max-h-[85vh] overflow-y-auto m-4"
          style={{ background: "#020508", border: "1px solid #0d2035", borderTop: "3px solid #00d4ff" }}
          onClick={e => e.stopPropagation()}
          data-testid="mini-cuadro-panel">

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00d4ff" }} />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16">
              <span className="font-exo text-[12px]" style={{ color: "#ff2244" }}>Error al cargar datos</span>
            </div>
          ) : data && (
            <>
              <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "#0d2035" }}>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}
                      data-testid="text-camion-patente">{patente}</span>
                    <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{data.conductor}</span>
                    <span className="font-exo text-[11px] px-2 py-0.5"
                      style={{ color: "#00d4ff", border: "1px solid #00d4ff30" }}>
                      {data.contrato}
                    </span>
                  </div>
                  <div className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>
                    CUADRO OPERACIONAL · MES ACTUAL HASTA T-1
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 cursor-pointer hover:opacity-70"
                  data-testid="btn-cerrar-cuadro">
                  <X className="w-4 h-4" style={{ color: "#3a6080" }} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 col-span-1" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: "2px solid #00d4ff" }}>
                    <div className="font-exo text-[7px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>OPERACIONES</div>
                    <div className="font-space text-[28px] font-bold" style={{ color: "#00d4ff" }}>
                      {data.resumen_mes?.operaciones_verificadas ?? 0}
                    </div>
                    <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>verificadas este mes</div>
                    {(data.resumen_mes?.operaciones_con_alerta ?? 0) > 0 && (
                      <div className="font-exo text-[11px] mt-1" style={{ color: "#ff2244" }}>
                        +{data.resumen_mes.operaciones_con_alerta} con alerta
                      </div>
                    )}
                  </div>
                  <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: "2px solid #c8e8ff" }}>
                    <div className="font-exo text-[7px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>KM RECORRIDOS ECU</div>
                    <div className="font-space text-[28px] font-bold" style={{ color: "#c8e8ff" }}>
                      {(data.resumen_mes?.km_total ?? 0).toLocaleString("es-CL")}
                    </div>
                    <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>kilometros verificados</div>
                  </div>
                  <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: "2px solid #ffcc00" }}>
                    <div className="font-exo text-[7px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>LITROS ECU</div>
                    <div className="font-space text-[28px] font-bold" style={{ color: "#ffcc00" }}>
                      {(data.resumen_mes?.litros_ecu_total ?? 0).toLocaleString("es-CL")}L
                    </div>
                    <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>consumo real verificado</div>
                  </div>
                </div>

                <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-exo text-xs tracking-wider uppercase" style={{ color: "#3a6080" }}>RENDIMIENTO vs META</div>
                    {data.resumen_mes?.vs_meta != null && (
                      <span className="font-space text-[11px] font-bold"
                        style={{ color: data.resumen_mes.vs_meta >= 0 ? "#00ff88" : "#ff2244" }}>
                        {data.resumen_mes.vs_meta >= 0 ? "+" : ""}{data.resumen_mes.vs_meta}% vs meta
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-4">
                    <div>
                      <div className="font-space text-[36px] font-bold"
                        style={{ color: !data.resumen_mes?.rendimiento_promedio ? "#3a6080" : data.resumen_mes.rendimiento_promedio >= data.meta_kmL ? "#00ff88" : "#ffcc00" }}>
                        {data.resumen_mes?.rendimiento_promedio ? `${data.resumen_mes.rendimiento_promedio}` : "--"}
                      </div>
                      <div className="font-exo text-xs" style={{ color: "#3a6080" }}>km/L promedio del mes</div>
                    </div>
                    <div className="mb-1">
                      <div className="font-exo text-xs" style={{ color: "#3a6080" }}>meta: {data.meta_kmL} km/L</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="h-2 w-full" style={{ background: "#0d2035" }}>
                      <div className="h-full transition-all" style={{
                        width: `${Math.min(100, data.resumen_mes?.rendimiento_promedio ? (data.resumen_mes.rendimiento_promedio / (data.meta_kmL * 1.3)) * 100 : 0)}%`,
                        background: (data.resumen_mes?.rendimiento_promedio ?? 0) >= data.meta_kmL ? "#00ff88" : "#ffcc00",
                      }} />
                    </div>
                    <div className="relative h-1">
                      <div className="absolute top-0 w-0.5 h-2"
                        style={{ left: `${(data.meta_kmL / (data.meta_kmL * 1.3)) * 100}%`, background: "#ff2244" }} />
                    </div>
                  </div>
                </div>

                <div className="p-4"
                  style={{
                    background: "#060d14",
                    border: `1px solid ${Math.abs(data.resumen_mes?.balance_litros ?? 0) < 200 ? "#0d2035" : Math.abs(data.resumen_mes?.balance_litros ?? 0) < 1000 ? "#ffcc0040" : "#ff224440"}`,
                  }}>
                  <div className="font-exo text-xs tracking-wider uppercase mb-3" style={{ color: "#3a6080" }}>
                    CUADRATURA — SIGETRA vs ECU
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="font-space text-[20px] font-bold" style={{ color: "#ffcc00" }}>
                        {(data.resumen_mes?.litros_sigetra_total ?? 0).toLocaleString("es-CL")}L
                      </div>
                      <div className="font-exo text-xs" style={{ color: "#3a6080" }}>Sigetra (cargado)</div>
                    </div>
                    <div className="text-center">
                      <div className="font-space text-[20px] font-bold" style={{ color: "#00d4ff" }}>
                        {(data.resumen_mes?.litros_ecu_total ?? 0).toLocaleString("es-CL")}L
                      </div>
                      <div className="font-exo text-xs" style={{ color: "#3a6080" }}>ECU (consumido real)</div>
                    </div>
                    <div className="text-right">
                      <div className="font-space text-[20px] font-bold"
                        style={{ color: Math.abs(data.resumen_mes?.balance_litros ?? 0) < 200 ? "#00ff88" : Math.abs(data.resumen_mes?.balance_litros ?? 0) < 1000 ? "#ffcc00" : "#ff2244" }}>
                        {(data.resumen_mes?.balance_litros ?? 0) > 0 ? "+" : ""}{data.resumen_mes?.balance_litros ?? 0}L
                      </div>
                      <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
                        balance · {data.resumen_mes?.balance_pct ?? 0}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 font-rajdhani text-[11px]" style={{ color: "#c8e8ff" }}>
                    {Math.abs(data.resumen_mes?.balance_pct ?? 0) < 10
                      ? "Cuadratura dentro del rango normal"
                      : (data.resumen_mes?.balance_litros ?? 0) > 0
                      ? `Sigetra registra ${data.resumen_mes?.balance_litros}L mas de lo consumido por ECU`
                      : "ECU registra mas consumo que cargas Sigetra — posible gap de datos"
                    }
                  </div>
                </div>

                {data.tendencia_semanal && data.tendencia_semanal.length > 0 && (
                  <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                    <div className="font-exo text-xs tracking-wider uppercase mb-3" style={{ color: "#3a6080" }}>
                      RENDIMIENTO SEMANAL
                    </div>
                    <div className="space-y-2">
                      {data.tendencia_semanal.map((s: any) => {
                        const pct = s.rendimiento ? Math.min(100, (s.rendimiento / (data.meta_kmL * 1.3)) * 100) : 0;
                        const barColor = s.rendimiento >= data.meta_kmL ? "#00ff88" : "#ffcc00";
                        return (
                          <div key={s.semana} className="flex items-center gap-3">
                            <div className="font-exo text-[11px] w-6" style={{ color: "#3a6080" }}>{s.semana}</div>
                            <div className="flex-1 h-1.5" style={{ background: "#0d2035" }}>
                              <div className="h-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                            </div>
                            <div className="font-space text-xs font-bold w-16 text-right" style={{ color: barColor }}>
                              {s.rendimiento ? `${s.rendimiento} km/L` : "--"}
                            </div>
                            <div className="font-exo text-xs w-8" style={{ color: "#3a6080" }}>{s.operaciones} op</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {data.perfil_aprendido && (
                  <div className="p-3 flex items-center justify-between"
                    style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                    <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
                      Perfil aprendido · {data.perfil_aprendido.total_jornadas} jornadas · Confianza: {data.perfil_aprendido.confianza}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[14px] font-bold"
                        style={{ color: data.perfil_aprendido.score >= 70 ? "#00ff88" : "#ffcc00" }}>
                        {data.perfil_aprendido.score}
                      </span>
                      <span className="font-exo text-xs" style={{ color: "#3a6080" }}>score</span>
                    </div>
                  </div>
                )}

                {data.operaciones && data.operaciones.length > 0 && (
                  <div>
                    <div className="font-exo text-xs tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>
                      OPERACIONES DEL MES ({data.operaciones.length})
                    </div>
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {data.operaciones.map((op: any) => {
                        const calidadColor = op.calidad === "PERFECTA" ? "#00ff88" : op.calidad === "BUENA" ? "#00d4ff" : op.calidad === "ACEPTABLE" ? "#ffcc00" : op.calidad === "CON_ALERTA" ? "#ff2244" : "#3a6080";
                        return (
                          <div key={op.id} className="flex items-center gap-3 px-3 py-2"
                            style={{ background: "#060d14", border: "1px solid #0d2035" }}
                            data-testid={`operacion-row-${op.id}`}>
                            <span className="font-space text-xs font-bold px-1.5 py-0.5"
                              style={{ color: calidadColor, background: `${calidadColor}15`, border: `1px solid ${calidadColor}30` }}>
                              {op.calidad}
                            </span>
                            <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
                              {op.fecha ? new Date(op.fecha).toLocaleDateString("es-CL") : "--"}
                            </span>
                            <span className="font-exo text-[11px] truncate flex-1" style={{ color: "#c8e8ff" }}>
                              {op.origen || "--"} → {op.destino || "--"}
                            </span>
                            <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>
                              {Math.round(op.km_ecu)} km
                            </span>
                            <span className="font-space text-xs" style={{ color: "#ffcc00" }}>
                              {Math.round(op.litros_ecu)}L
                            </span>
                            <span className="font-space text-xs font-bold"
                              style={{ color: op.rendimiento >= (data.meta_kmL ?? 2.85) ? "#00ff88" : "#ffcc00" }}>
                              {op.rendimiento > 0 ? `${op.rendimiento} km/L` : "--"}
                            </span>
                            {op.balance != null && (
                              <span className="font-space text-[11px]"
                                style={{ color: Math.abs(op.balance) < 50 ? "#00ff88" : Math.abs(op.balance) < 200 ? "#ffcc00" : "#ff2244" }}>
                                {op.balance > 0 ? "+" : ""}{op.balance}L
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }


function KpiCard({ label, value, sub, color, progress, loading, tooltip, onClick, icon, unit }: {
  label: string; value: string; sub: string; color: string; progress?: number; loading: boolean; tooltip?: string; onClick?: () => void; icon?: React.ReactNode; unit?: string;
}) {
  return (
    <div className={`p-4 ${onClick ? "cursor-pointer hover:bg-[rgba(0,212,255,0.03)]" : ""}`}
      style={{ background: "#091018", border: "1px solid #0d2035" }}
      onClick={onClick}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span style={{ color: "#3a6080" }}>{icon}</span>}
        <span className="font-exo text-xs tracking-[0.2em] uppercase" style={{ color: "#3a6080" }}>{label}</span>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <div className="font-space text-[28px] font-bold leading-none" style={{ color }}>{value}</div>
            {unit && <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{unit}</span>}
          </div>
          <div className="font-exo text-xs mt-1.5" style={{ color: "#3a6080" }}>{sub}</div>
          {progress != null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded" style={{ background: "#0d2035" }}>
              <div className="h-full transition-all duration-1000 rounded" style={{ width: `${progress}%`, background: color }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { InfoTip };
