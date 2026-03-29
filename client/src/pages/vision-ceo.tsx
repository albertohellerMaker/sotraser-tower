import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, RefreshCw, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
}

interface DiagnosticoIA {
  texto: string;
  generadoHaceMin: number;
  cached: boolean;
  error?: string;
}

type Periodo = "1d" | "7d" | "30d";

export default function VisionCEO({ onClose }: { onClose: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const periodoLabel = periodo === "1d" ? "HOY" : periodo === "7d" ? "7D" : "30D";
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

  const { data: diagnostico, isLoading: loadingDiag, refetch: refetchDiag } = useQuery<DiagnosticoIA>({
    queryKey: ["/api/ceo/diagnostico-ia"],
    refetchInterval: 1800000,
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

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const estadoBadge = (() => {
    const c = kpis?.alertasCriticas ?? 0;
    if (c === 0) return { label: "OPERACION NORMAL", color: "#00ff88", blink: false };
    if (c <= 3) return { label: "ATENCION REQUERIDA", color: "#ffcc00", blink: false };
    return { label: "ALERTA ACTIVA", color: "#ff2244", blink: true };
  })();

  const fechaHoy = new Date().toLocaleDateString("es-CL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  function parseDiagnostico(texto: string) {
    const lines = texto.split("\n").filter(l => l.trim());
    const result: { icon: string; label: string; text: string }[] = [];
    for (const line of lines) {
      if (line.startsWith("ESTADO:")) {
        result.push({ icon: "\ud83d\udfe2", label: "ESTADO", text: line.replace("ESTADO:", "").trim() });
      } else if (line.startsWith("POSITIVO:")) {
        result.push({ icon: "\u2705", label: "POSITIVO", text: line.replace("POSITIVO:", "").trim() });
      } else if (line.startsWith("ATENCION:") || line.startsWith("ATENCI\u00d3N:")) {
        result.push({ icon: "\u26a0\ufe0f", label: "ATENCION", text: line.replace(/ATENCI[OÓ]N:/, "").trim() });
      } else if (line.startsWith("ACCION:") || line.startsWith("ACCI\u00d3N:")) {
        result.push({ icon: "\u25b6\ufe0f", label: "ACCION", text: line.replace(/ACCI[OÓ]N:/, "").trim() });
      }
    }
    return result;
  }

  const estadoColors: Record<string, string> = { NORMAL: "#00ff88", ATENCION: "#ffcc00", CRITICO: "#ff2244" };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: "rgba(2,5,8,0.98)" }}
      data-testid="ceo-panel">
      <div className="max-w-[1400px] mx-auto px-5 py-5 space-y-5">

        {/* ZONA 1 — HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3" data-testid="ceo-header">
          <div>
            <div className="font-space text-[20px] font-bold tracking-[0.2em]" style={{ color: "#c8e8ff" }}>
              SOTRASER &middot; VISION CEO
            </div>
            <div className="font-exo text-[11px] capitalize" style={{ color: "#3a6080" }}>{fechaHoy}</div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{
              background: estadoBadge.color,
              boxShadow: `0 0 8px ${estadoBadge.color}`,
              animation: estadoBadge.blink ? "blinkFast 0.6s infinite" : undefined,
            }} />
            <span className="font-space text-[11px] font-bold tracking-[0.1em]" style={{ color: estadoBadge.color }}>
              {estadoBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(["1d", "7d", "30d"] as Periodo[]).map(p => (
                <button key={p} onClick={() => setPeriodo(p)}
                  data-testid={`ceo-periodo-${p}`}
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
              Actualizado hace {minAgo < 1 ? "<1" : minAgo} min
            </span>
            <button onClick={handleRefreshAll} className="p-1.5 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.1)] rounded"
              data-testid="ceo-refresh-all">
              <RefreshCw className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
            </button>
            <button onClick={onClose}
              className="font-space text-[11px] font-bold px-4 py-1.5 cursor-pointer transition-all border hover:bg-[rgba(255,255,255,0.05)]"
              style={{ color: "#c8e8ff", borderColor: "#0d2035" }}
              data-testid="ceo-close">
              VOLVER AL DASHBOARD
            </button>
          </div>
        </div>

        {/* ZONA 2 — 4 KPIs GRANDES */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="ceo-kpis">
          <KpiCard
            label="FLOTA ACTIVA"
            value={kpis ? String(kpis.camionesActivos) : "--"}
            sub={kpis ? `de ${kpis.camionesTotal} CENCOSUD` : ""}
            progress={kpis ? Math.round((kpis.camionesActivos / Math.max(kpis.camionesTotal, 1)) * 100) : 0}
            color="#00d4ff"
            loading={loadingKpis}
          />
          <KpiCard
            label="RENDIMIENTO FLOTA"
            value={kpis ? String(kpis.rendPromedio) : "--"}
            sub={kpis ? `${kpis.rendCambioPct >= 0 ? "\u2191" : "\u2193"} ${kpis.rendCambioPct >= 0 ? "+" : ""}${kpis.rendCambioPct}% vs periodo anterior` : ""}
            color={kpis ? (kpis.rendCambioPct >= 0 ? "#00ff88" : "#ff2244") : "#3a6080"}
            unit="km/L"
            loading={loadingKpis}
          />
          <KpiCard
            label="LITROS PERIODO"
            value={kpis ? kpis.litrosPeriodo.toLocaleString() : "--"}
            sub={kpis ? `${kpis.litrosCambioPct >= 0 ? "\u2191" : "\u2193"} ${kpis.litrosCambioPct >= 0 ? "+" : ""}${kpis.litrosCambioPct}% vs periodo anterior` : ""}
            color="#ffcc00"
            loading={loadingKpis}
          />
          <KpiCard
            label="ALERTAS ACTIVAS"
            value={kpis ? String(kpis.alertasCriticas) : "--"}
            sub={kpis?.alertasCriticas ? `${kpis.alertasCriticas} requieren accion hoy` : "Sin alertas criticas"}
            color={kpis?.alertasCriticas ? "#ff2244" : "#00ff88"}
            loading={loadingKpis}
          />
        </div>

        {/* ZONA 3 — SEMAFORO POR CONTRATO */}
        <div data-testid="ceo-contratos">
          <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: "#c8e8ff" }}>
            ESTADO POR CONTRATO
          </div>
          {loadingContratos ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando contratos...</span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {contratos.map((c, i) => (
                <div key={i} className="flex-shrink-0 min-w-[180px] p-4 rounded-sm" style={{
                  background: "#091018",
                  borderTop: `3px solid ${estadoColors[c.estado] || "#3a6080"}`,
                  border: "1px solid #0d2035",
                  borderTopColor: estadoColors[c.estado] || "#3a6080",
                }} data-testid={`ceo-contrato-${i}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: estadoColors[c.estado] }} />
                    <span className="font-space text-[11px] font-bold tracking-[0.1em]" style={{ color: estadoColors[c.estado] }}>
                      {c.estado}
                    </span>
                  </div>
                  <div className="font-space text-[13px] font-bold mb-1" style={{ color: "#c8e8ff" }}>{c.nombre}</div>
                  <div className="font-exo text-xs" style={{ color: "#3a6080" }}>{c.camionesTotal} camiones</div>
                  <div className="font-space text-[11px] font-bold mt-1" style={{ color: c.rendPromedio >= 2.5 ? "#00ff88" : "#ffcc00" }}>
                    {c.rendPromedio > 0 ? `${c.rendPromedio} km/L` : "N/D"}
                  </div>
                  <div className="font-exo text-xs mt-1" style={{ color: c.alertasCriticas > 0 ? "#ff2244" : "#3a6080" }}>
                    {c.alertasCriticas} alertas
                  </div>
                </div>
              ))}
              {contratos.length === 0 && (
                <div className="font-exo text-[11px] py-4" style={{ color: "#3a6080" }}>Sin contratos con camiones asignados</div>
              )}
            </div>
          )}
        </div>

        {/* ZONA 4+5 — TENDENCIA + ALERTAS */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          <div className="p-4 rounded-sm" style={{ background: "#091018", border: "1px solid #0d2035" }} data-testid="ceo-tendencia">
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: "#c8e8ff" }}>
              TENDENCIA &middot; {periodoLabel}
            </div>
            {loadingTendencia ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00d4ff" }} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
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
                  <Tooltip
                    contentStyle={{ background: "#091018", border: "1px solid #0d2035", fontFamily: "Exo 2", fontSize: 11, color: "#c8e8ff" }}
                    labelFormatter={(v: string) => new Date(v).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="litrosDia" name="Litros" stroke="#00d4ff" strokeWidth={2} dot={{ r: 3, fill: "#00d4ff" }} />
                  <Line yAxisId="right" type="monotone" dataKey="rendimientoDia" name="km/L" stroke="#00ff88" strokeWidth={2} dot={{ r: 3, fill: "#00ff88" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="p-4 rounded-sm" style={{ background: "#091018", border: "1px solid #0d2035" }} data-testid="ceo-alertas">
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: "#c8e8ff" }}>
              REQUIERE ATENCION
            </div>
            {loadingAlertas ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00d4ff" }} />
              </div>
            ) : alertas.length === 0 ? (
              <div className="py-8 text-center">
                <div className="font-exo text-[13px]" style={{ color: "#00ff88" }}>Sin alertas criticas</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {alertas.map((a, i) => (
                  <div key={i} className="p-3 rounded-sm transition-all hover:bg-[rgba(0,212,255,0.03)]"
                    style={{ background: "rgba(2,5,8,0.5)", border: "1px solid #0d2035" }}
                    data-testid={`ceo-alerta-${i}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-[12px] mt-0.5 flex-shrink-0">
                        {a.nivel === "CRITICO" ? "\ud83d\udd34" : "\ud83d\udfe1"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{a.titulo}</div>
                        <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>{a.detalle}</div>
                        <div className="font-exo text-[11px] mt-1" style={{ color: "#1a3550" }}>{a.hace}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ZONA 6 — DIAGNOSTICO IA */}
        <div className="p-5 rounded-sm" style={{ background: "#091018", border: "1px solid #0d2035", borderLeft: "3px solid #00d4ff" }}
          data-testid="ceo-diagnostico">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[16px]">{"\ud83e\udd16"}</span>
              <span className="font-space text-[11px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
                DIAGNOSTICO EJECUTIVO &middot; IA
              </span>
            </div>
            <div className="flex items-center gap-3">
              {diagnostico && (
                <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
                  Actualizado hace {diagnostico.generadoHaceMin < 1 ? "<1" : diagnostico.generadoHaceMin} min
                  {diagnostico.cached && " (cache)"}
                </span>
              )}
              <button onClick={handleRefreshDiag} className="flex items-center gap-1.5 px-2.5 py-1 cursor-pointer transition-all border hover:bg-[rgba(0,212,255,0.05)]"
                style={{ borderColor: "rgba(0,212,255,0.2)", color: "#00d4ff" }}
                data-testid="ceo-refresh-diag">
                <RefreshCw className="w-3 h-3" />
                <span className="font-exo text-[11px]">Actualizar diagnostico</span>
              </button>
            </div>
          </div>

          {loadingDiag ? (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Generando diagnostico con IA...</span>
            </div>
          ) : diagnostico?.texto ? (
            <div className="space-y-2">
              {parseDiagnostico(diagnostico.texto).map((line, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5">
                  <span className="text-[14px] flex-shrink-0">{line.icon}</span>
                  <div>
                    <span className="font-space text-xs font-bold tracking-[0.1em] mr-2" style={{ color: "#00d4ff" }}>
                      {line.label}:
                    </span>
                    <span className="font-exo text-[12px]" style={{ color: "#c8e8ff" }}>{line.text}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-exo text-[11px] py-4" style={{ color: "#3a6080" }}>
              No se pudo generar el diagnostico. Intente nuevamente.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, unit, progress, loading }: {
  label: string; value: string; sub: string; color: string; unit?: string; progress?: number; loading: boolean;
}) {
  return (
    <div className="p-5 rounded-sm" style={{ background: "#091018", border: "1px solid #0d2035" }}>
      <div className="font-exo text-xs tracking-[0.2em] uppercase mb-3" style={{ color: "#3a6080" }}>{label}</div>
      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3a6080" }} />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-space text-[32px] font-bold leading-none" style={{ color }}>{value}</span>
            {unit && <span className="font-exo text-[12px]" style={{ color: "#3a6080" }}>{unit}</span>}
          </div>
          <div className="font-exo text-xs mt-2" style={{ color: "#3a6080" }}>{sub}</div>
          {progress != null && (
            <div className="mt-3 h-1.5 rounded-sm overflow-hidden" style={{ background: "#0d2035" }}>
              <div className="h-full rounded-sm transition-all duration-1000" style={{ width: `${progress}%`, background: color }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
