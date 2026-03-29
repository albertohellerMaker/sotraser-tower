import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain,
  Truck,
  Loader2,
  AlertTriangle,
  Droplets,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Search,
  Fuel,
} from "lucide-react";
import type { Faena } from "@shared/schema";

interface CamionContratoResult {
  patente: string;
  modelo: string;
  conductor: string;
  metaKmL: number;
  online: boolean;
  rendPromedio: number | null;
  totalLitros: number;
  cargas: number;
  estado: string;
  weeklyData: { semana: string; litros: number; rendimiento: number | null; cargas: number }[];
}

interface ContratoIAResult {
  estado_general: string;
  resumen: string;
  rendimiento_contrato: string;
  camiones_problema: string[];
  camion_destacado: string;
  riesgos: string[];
  recomendaciones: string[];
  score_contrato: number;
}

interface ContratoAnalisis {
  faena: string;
  color: string;
  camionesTotal: number;
  camionesOnline: number;
  totalLitros: number;
  rendPromedio: number | null;
  criticos: number;
  camiones: CamionContratoResult[];
  ia: ContratoIAResult | null;
}

const estadoCamColors: Record<string, string> = { NORMAL: "#00ff88", ALERTA: "#ffcc00", CRITICO: "#ff2244" };

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#00ff88" : score >= 60 ? "#ffcc00" : score >= 40 ? "#FF8C00" : "#ff2244";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center" data-testid="gauge-score-contrato">
      <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#0d2035" strokeWidth="6" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="text-center">
        <div className="font-space text-[22px] font-bold" style={{ color }}>{score}</div>
        <div className="font-exo text-[7px] tracking-[0.15em]" style={{ color: "#3a6080" }}>SALUD</div>
      </div>
    </div>
  );
}

function CamionRow({ cam, expanded, onToggle }: { cam: CamionContratoResult; expanded: boolean; onToggle: () => void }) {
  const rendColor = cam.rendPromedio !== null
    ? (cam.rendPromedio >= cam.metaKmL ? "#00ff88" : cam.rendPromedio >= cam.metaKmL * 0.7 ? "#ffcc00" : "#ff2244")
    : "#3a6080";

  return (
    <div style={{ border: "1px solid #0d2035" }} data-testid={`contrato-camion-${cam.patente}`}>
      <button onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
        style={{ background: "#0a1520" }}
        data-testid={`btn-expand-${cam.patente}`}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: cam.online ? "#00ff88" : "#3a6080", boxShadow: cam.online ? "0 0 4px #00ff88" : undefined }} />
        <span className="font-space text-[12px] font-bold w-[70px]" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
        <span className="font-exo text-xs flex-1 min-w-0 truncate" style={{ color: "#3a6080" }}>{cam.conductor}</span>
        <span className="font-space text-[11px] font-bold" style={{ color: rendColor }}>
          {cam.rendPromedio !== null ? `${cam.rendPromedio} km/L` : "--"}
        </span>
        <span className="font-exo text-[11px]" style={{ color: "#ffcc00" }}>{cam.totalLitros}L</span>
        <span className="font-space text-xs font-bold px-1.5 py-0.5"
          style={{ color: estadoCamColors[cam.estado], background: `${estadoCamColors[cam.estado]}15`, border: `1px solid ${estadoCamColors[cam.estado]}30` }}>
          {cam.estado}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} />
          : <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} />}
      </button>

      {expanded && (
        <div className="p-3 space-y-3" style={{ background: "#091018", borderTop: "1px solid #0d2035" }}>
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[7px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>MODELO</div>
              <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{cam.modelo}</div>
            </div>
            <div className="p-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[7px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>META</div>
              <div className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{cam.metaKmL} km/L</div>
            </div>
            <div className="p-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[7px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CARGAS</div>
              <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{cam.cargas}</div>
            </div>
            <div className="p-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[7px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>LITROS</div>
              <div className="font-space text-[11px] font-bold" style={{ color: "#ffcc00" }}>{cam.totalLitros.toLocaleString()}</div>
            </div>
          </div>

          {cam.weeklyData.length > 0 && (
            <div>
              <div className="font-exo text-xs tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>
                RENDIMIENTO SEMANAL
              </div>
              <div className="flex items-end gap-1" style={{ height: 60 }}>
                {cam.weeklyData.map((w, i) => {
                  const maxLt = Math.max(...cam.weeklyData.map(d => d.litros), 1);
                  const h = Math.max((w.litros / maxLt) * 50, 2);
                  const barColor = w.rendimiento !== null
                    ? (w.rendimiento >= cam.metaKmL ? "#00ff88" : w.rendimiento >= cam.metaKmL * 0.7 ? "#ffcc00" : "#ff2244")
                    : "#0d2035";
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5 flex-1" title={`${w.semana}: ${w.litros}L / ${w.rendimiento ?? "N/A"} km/L`}>
                      {w.rendimiento !== null && (
                        <span className="font-space text-[7px]" style={{ color: barColor }}>{w.rendimiento}</span>
                      )}
                      <div style={{ height: h, background: barColor, width: "100%", minWidth: 8, opacity: 0.7 }} />
                      <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{w.semana}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Inteligencia() {
  const [selectedFaenaId, setSelectedFaenaId] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState<string>("56");
  const [result, setResult] = useState<ContratoAnalisis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCamion, setExpandedCamion] = useState<string | null>(null);

  const { data: faenas = [], isLoading: loadingFaenas } = useQuery<Faena[]>({ queryKey: ["/api/faenas"] });

  const analyze = async () => {
    if (!selectedFaenaId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/ia/contrato", {
        faenaId: selectedFaenaId,
        dias: parseInt(periodo),
      });
      const data: ContratoAnalisis = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingFaenas) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center" data-testid="inteligencia-loading">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00d4ff" }} />
        <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando contratos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="inteligencia-view">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4" style={{ color: "#00d4ff" }} />
        <span className="font-space text-[12px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
          INTELIGENCIA POR CONTRATO
        </span>
        <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
          Analisis profundo con IA por contrato, detalle por camion
        </span>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="font-exo text-xs tracking-[0.2em] uppercase mb-1.5" style={{ color: "#3a6080" }}>
            SELECCIONAR CONTRATO
          </div>
          <div className="flex gap-2 flex-wrap">
            {faenas.map(f => (
              <button key={f.id} onClick={() => setSelectedFaenaId(f.id)}
                className="px-4 py-2.5 font-space text-[11px] font-bold cursor-pointer transition-all border"
                style={{
                  background: selectedFaenaId === f.id ? `${f.color}15` : "rgba(9,16,24,0.8)",
                  borderColor: selectedFaenaId === f.id ? f.color : "#0d2035",
                  color: selectedFaenaId === f.id ? f.color : "#3a6080",
                  boxShadow: selectedFaenaId === f.id ? `0 0 10px ${f.color}20` : undefined,
                }}
                data-testid={`btn-faena-${f.id}`}>
                {f.nombre}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="font-exo text-xs tracking-[0.2em] uppercase mb-1.5" style={{ color: "#3a6080" }}>PERIODO</div>
          <div className="flex gap-1">
            {[{ val: "28", label: "4 sem" }, { val: "56", label: "8 sem" }, { val: "84", label: "12 sem" }].map(p => (
              <button key={p.val} onClick={() => setPeriodo(p.val)}
                className="px-3 py-2 font-space text-xs font-bold cursor-pointer transition-all border"
                style={{
                  background: periodo === p.val ? "#00d4ff" : "transparent",
                  color: periodo === p.val ? "#020508" : "#3a6080",
                  borderColor: periodo === p.val ? "#00d4ff" : "#0d2035",
                }}
                data-testid={`btn-periodo-${p.val}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={analyze} disabled={!selectedFaenaId || loading}
          className="flex items-center gap-2 px-6 py-2.5 font-space text-[11px] font-bold tracking-[0.1em] cursor-pointer transition-all border disabled:opacity-40 hover:shadow-[0_0_12px_rgba(0,212,255,0.15)]"
          style={{ background: "rgba(0,212,255,0.1)", borderColor: "rgba(0,212,255,0.3)", color: "#00d4ff" }}
          data-testid="btn-analizar-contrato">
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> ANALIZANDO...</>
          ) : (
            <><Brain className="w-4 h-4" /> ANALIZAR CONTRATO</>
          )}
        </button>
      </div>

      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
          <div className="octagonal w-16 h-16 flex items-center justify-center mb-4"
            style={{ background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)", border: "1px solid rgba(0,212,255,0.15)" }}>
            <Search className="w-7 h-7" style={{ color: "#0d2035" }} />
          </div>
          <div className="font-space text-[12px] font-bold mb-1" style={{ color: "#3a6080" }}>
            Selecciona un contrato y presiona "ANALIZAR CONTRATO"
          </div>
          <div className="font-exo text-xs" style={{ color: "#1a3550" }}>
            Analisis IA del contrato con detalle por cada camion asignado
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="loading-state">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
          <div className="font-space text-[12px]" style={{ color: "#c8e8ff" }}>Analizando contrato con IA...</div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>Evaluando cada camion del contrato</div>
        </div>
      )}

      {error && (
        <div className="p-4" style={{ background: "#091018", border: "1px solid rgba(255,34,68,0.3)" }} data-testid="error-state">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: "#ff2244" }} />
            <span className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>Error en el analisis</span>
          </div>
          <div className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{error}</div>
          <button onClick={analyze}
            className="mt-2 px-3 py-1.5 font-exo text-xs font-bold cursor-pointer border hover:border-[#00d4ff]"
            style={{ borderColor: "#0d2035", color: "#3a6080" }}
            data-testid="btn-retry">
            Reintentar
          </button>
        </div>
      )}

      {result && result.ia && (
        <div className="space-y-4" data-testid="resultado-contrato">
          <div className="p-4" style={{ background: "#091018", border: "1px solid #0d2035", borderTop: `3px solid ${result.color || "#00d4ff"}` }}>
            <div className="flex items-start gap-4">
              <ScoreGauge score={result.ia.score_contrato} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-space text-[14px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
                    {result.faena}
                  </span>
                  <span className="font-space text-[11px] font-bold px-2 py-0.5"
                    style={{
                      color: estadoCamColors[result.ia.estado_general] || "#00ff88",
                      background: `${estadoCamColors[result.ia.estado_general] || "#00ff88"}15`,
                      border: `1px solid ${estadoCamColors[result.ia.estado_general] || "#00ff88"}30`,
                    }}>
                    {result.ia.estado_general}
                  </span>
                </div>
                <div className="font-rajdhani text-[12px] leading-relaxed mb-3" style={{ color: "#c8e8ff" }}>
                  {result.ia.resumen}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MiniStat label="CAMIONES" value={`${result.camionesOnline}/${result.camionesTotal}`} color="#00d4ff"
                    icon={<Truck className="w-3 h-3" />} />
                  <MiniStat label="LITROS TOTAL" value={result.totalLitros.toLocaleString()} color="#ffcc00"
                    icon={<Fuel className="w-3 h-3" />} />
                  <MiniStat label="REND. PROM" value={result.rendPromedio !== null ? `${result.rendPromedio} km/L` : "N/D"} color="#00ff88"
                    icon={<Droplets className="w-3 h-3" />} />
                  <MiniStat label="CRITICOS" value={String(result.criticos)} color={result.criticos > 0 ? "#ff2244" : "#00ff88"}
                    icon={<AlertTriangle className="w-3 h-3" />} />
                </div>
              </div>
            </div>
          </div>

          {result.ia.rendimiento_contrato && (
            <div className="p-3" style={{ background: "#091018", border: "1px solid #0d2035", borderLeft: "3px solid #00d4ff" }}>
              <div className="font-space text-xs font-bold tracking-[0.15em] mb-1" style={{ color: "#00d4ff" }}>RENDIMIENTO CONTRATO</div>
              <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: "#c8e8ff" }}>
                {result.ia.rendimiento_contrato}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {result.ia.camiones_problema.length > 0 && (
              <div className="p-3" style={{ background: "#091018", border: "1px solid rgba(255,34,68,0.2)" }}>
                <div className="font-space text-xs font-bold tracking-[0.15em] mb-2" style={{ color: "#ff2244" }}>
                  CAMIONES CON PROBLEMAS
                </div>
                <div className="space-y-1">
                  {result.ia.camiones_problema.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#ff2244" }} />
                      <span className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.ia.riesgos.length > 0 && (
              <div className="p-3" style={{ background: "#091018", border: "1px solid rgba(255,204,0,0.2)" }}>
                <div className="font-space text-xs font-bold tracking-[0.15em] mb-2" style={{ color: "#ffcc00" }}>
                  RIESGOS DETECTADOS
                </div>
                <div className="space-y-1">
                  {result.ia.riesgos.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="font-exo text-xs" style={{ color: "#c8e8ff" }}>- {r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {result.ia.camion_destacado && (
            <div className="p-3" style={{ background: "#091018", border: "1px solid rgba(0,255,136,0.2)" }}>
              <div className="font-space text-xs font-bold tracking-[0.15em] mb-1" style={{ color: "#00ff88" }}>
                CAMION DESTACADO
              </div>
              <div className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{result.ia.camion_destacado}</div>
            </div>
          )}

          {result.ia.recomendaciones.length > 0 && (
            <div className="p-3" style={{ background: "#091018", border: "1px solid rgba(0,212,255,0.2)" }}>
              <div className="font-space text-xs font-bold tracking-[0.15em] mb-2" style={{ color: "#00d4ff" }}>
                RECOMENDACIONES
              </div>
              <div className="space-y-1.5">
                {result.ia.recomendaciones.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#00d4ff" }} />
                    <span className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold mb-2" style={{ color: "#c8e8ff" }}>
              DETALLE POR CAMION ({result.camiones.length})
            </div>
            <div className="space-y-1.5">
              {result.camiones.map(cam => (
                <CamionRow key={cam.patente} cam={cam}
                  expanded={expandedCamion === cam.patente}
                  onToggle={() => setExpandedCamion(expandedCamion === cam.patente ? null : cam.patente)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {result && !result.ia && (
        <div className="p-4 text-center" style={{ background: "#091018", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Sin camiones asignados a este contrato
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span style={{ color: "#3a6080" }}>{icon}</span>}
        <span className="font-exo text-[7px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>{label}</span>
      </div>
      <div className="font-space text-[13px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
