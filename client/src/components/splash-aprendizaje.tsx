import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Send, ArrowRight, Loader2, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SplashAprendizajeProps {
  onEntrar: () => void;
  showEntrar?: boolean;
}

export default function SplashAprendizaje({ onEntrar, showEntrar = true }: SplashAprendizajeProps) {
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState<string | null>(null);

  const { data: estadoData, isLoading: loadingEstado } = useQuery<any>({
    queryKey: ["/api/sistema/estado"],
  });

  const { data: resumenData, isLoading: loadingResumen } = useQuery<any>({
    queryKey: ["/api/sistema/resumen-ia"],
  });

  const consultaMut = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/sistema/consulta", { pregunta: q });
      return res.json();
    },
    onSuccess: (data: any) => {
      setRespuesta(data.respuesta);
    },
  });

  const estado = resumenData?.estado || estadoData;
  const resumen = resumenData?.resumen;

  const handleConsulta = () => {
    if (!pregunta.trim()) return;
    setRespuesta(null);
    consultaMut.mutate(pregunta.trim());
  };

  const confianzaColor: Record<string, string> = {
    BAJA: "#3a6080",
    MEDIA: "#ffcc00",
    ALTA: "#00d4ff",
    EXPERTA: "#00ff88",
  };

  const conf = estado?.confianza_global || "BAJA";
  const borderColor = confianzaColor[conf] || "#3a6080";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(2,5,8,0.95)", backdropFilter: "blur(20px)" }}>
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto px-6 py-8 relative" data-testid="splash-aprendizaje">
        {!showEntrar && (
          <button onClick={onEntrar} className="absolute top-3 right-3 p-1 cursor-pointer transition-all hover:opacity-70" data-testid="button-cerrar-splash" title="Cerrar">
            <X className="w-4 h-4" style={{ color: "#4a7090" }} />
          </button>
        )}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-[60px] h-[60px] flex items-center justify-center mb-3" style={{
            background: "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)",
            border: `1px solid ${borderColor}`,
            borderRadius: "8px",
          }}>
            <span className="text-2xl" style={{ lineHeight: 1 }}>&#9981;</span>
          </div>
          <div className="font-rajdhani text-[14px] mb-1" style={{ color: "#4a7090" }} data-testid="text-saludo">
            {(() => {
              const h = new Date().getHours();
              return h < 12 ? "Buenos dias" : h < 20 ? "Buenas tardes" : "Buenas noches";
            })()}
          </div>
          <div className="font-space text-xl font-bold tracking-[0.3em]" style={{ color: "#00d4ff" }} data-testid="text-splash-title">SOTRASER</div>
          <div className="font-exo text-xs tracking-[0.25em] font-extralight mt-0.5" style={{ color: "#4a7090" }}>SISTEMA ADAPTATIVO</div>
        </div>

        <div className="mb-5 p-4" style={{ background: "rgba(0,212,255,0.03)", border: `1px solid ${borderColor}33`, borderRadius: "4px" }}>
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-3.5 h-3.5" style={{ color: borderColor }} />
            <span className="font-exo text-xs tracking-[0.15em] font-bold" style={{ color: borderColor }}>QUE HA APRENDIDO EL SISTEMA</span>
          </div>
          {loadingResumen ? (
            <div className="space-y-2">
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "90%", animation: "pulse 1.5s infinite" }} />
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "75%", animation: "pulse 1.5s infinite" }} />
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "80%", animation: "pulse 1.5s infinite" }} />
            </div>
          ) : (
            <div className="font-rajdhani text-[13px] leading-relaxed" style={{ color: "#c8e8ff" }} data-testid="text-resumen-ia">
              {resumen || estado?.estado_mensaje || "Cargando datos del sistema..."}
            </div>
          )}
        </div>

        <div className="mb-1">
          <div className="font-exo text-[11px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>KPIS DE APRENDIZAJE</div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { val: estado?.dias_aprendiendo ?? "-", label: "DIA" + (estado?.dias_aprendiendo !== 1 ? "S" : ""), sub: "activo" + (estado?.dias_aprendiendo !== 1 ? "s" : "") },
              { val: estado?.total_viajes_procesados ?? "-", label: "VIAJES", sub: "procesados" },
              { val: estado?.total_corredores_conocidos ?? "-", label: "RUTAS", sub: "conocidas" },
            ].map((k, i) => (
              <div key={i} className="text-center p-3" style={{ background: "#091018", border: "1px solid #0d2035", borderRadius: "3px" }}>
                <div className="font-space text-xl font-bold" style={{ color: "#00d4ff" }} data-testid={`text-kpi-${i}`}>
                  {loadingEstado ? <Loader2 className="w-4 h-4 animate-spin mx-auto" style={{ color: "#3a6080" }} /> : k.val}
                </div>
                <div className="font-exo text-[11px] tracking-wider font-bold" style={{ color: "#c8e8ff" }}>{k.label}</div>
                <div className="font-rajdhani text-xs" style={{ color: "#3a6080" }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { val: estado?.total_conductores_analizados ?? "-", label: "CONDUCT.", sub: "perfilados" },
              { val: estado?.total_snapshots_volvo ?? "-", label: "SNAPSHOTS", sub: "VOLVO" },
              { val: conf, label: "CONFIANZA", sub: "global", color: borderColor },
            ].map((k, i) => (
              <div key={i} className="text-center p-3" style={{ background: "#091018", border: "1px solid #0d2035", borderRadius: "3px" }}>
                <div className="font-space text-xl font-bold" style={{ color: k.color || "#00d4ff" }} data-testid={`text-kpi-${i + 3}`}>
                  {loadingEstado ? <Loader2 className="w-4 h-4 animate-spin mx-auto" style={{ color: "#3a6080" }} /> : (typeof k.val === "number" ? k.val.toLocaleString() : k.val)}
                </div>
                <div className="font-exo text-[11px] tracking-wider font-bold" style={{ color: "#c8e8ff" }}>{k.label}</div>
                <div className="font-rajdhani text-xs" style={{ color: "#3a6080" }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="font-exo text-[11px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>MADUREZ DEL SISTEMA</div>
          <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
            <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{
              width: `${estado?.madurez_pct || 0}%`,
              background: `linear-gradient(90deg, ${borderColor}, ${borderColor}cc)`,
              boxShadow: `0 0 8px ${borderColor}44`,
            }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="font-space text-[11px] font-bold" style={{ color: borderColor }}>{estado?.madurez_pct || 0}%</span>
            <span className="font-rajdhani text-xs" style={{ color: "#3a6080" }}>
              {(() => {
                const pct = estado?.madurez_pct || 0;
                const nextLevel = pct < 25 ? 25 : pct < 50 ? 50 : pct < 75 ? 75 : 100;
                const diasEstimados = Math.max(1, Math.ceil((nextLevel - pct) * 0.8));
                if (pct >= 100) return "Calibracion completa";
                return `~${diasEstimados} dias hasta ${nextLevel}%`;
              })()}
            </span>
          </div>
        </div>

        <div className="mb-6 p-3" style={{ background: "#091018", border: "1px solid #0d2035", borderRadius: "4px" }}>
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-3 h-3" style={{ color: "#4a7090" }} />
            <span className="font-exo text-[11px] tracking-[0.15em]" style={{ color: "#4a7090" }}>QUE QUIERES SABER?</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConsulta()}
              placeholder="Ej: Que ruta consume mas?"
              className="flex-1 px-3 py-1.5 font-rajdhani text-[13px] outline-none"
              style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff", borderRadius: "3px" }}
              data-testid="input-consulta-splash"
            />
            <button
              onClick={handleConsulta}
              disabled={consultaMut.isPending || !pregunta.trim()}
              className="px-3 py-1.5 flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
              style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", borderRadius: "3px" }}
              data-testid="button-enviar-consulta"
            >
              {consultaMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#00d4ff" }} />
              ) : (
                <Send className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
              )}
            </button>
          </div>
          {consultaMut.isPending && (
            <div className="mt-3 space-y-1.5">
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "85%", animation: "pulse 1.5s infinite" }} />
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "70%", animation: "pulse 1.5s infinite" }} />
            </div>
          )}
          {respuesta && (
            <div className="mt-3 p-3" style={{ background: "rgba(0,212,255,0.03)", border: "1px solid #0d203566", borderRadius: "3px" }}>
              <div className="font-rajdhani text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }} data-testid="text-respuesta-consulta">
                {respuesta}
              </div>
            </div>
          )}
        </div>

        {showEntrar && (
          <div className="flex justify-center">
            <button
              onClick={onEntrar}
              className="flex items-center gap-2 px-6 py-2.5 cursor-pointer transition-all hover:opacity-80"
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.3)",
                borderRadius: "4px",
              }}
              data-testid="button-entrar-sistema"
            >
              <span className="font-exo text-[11px] font-bold tracking-[0.2em]" style={{ color: "#00d4ff" }}>ENTRAR AL SISTEMA</span>
              <ArrowRight className="w-4 h-4" style={{ color: "#00d4ff" }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConsultaRapidaPanel({ onClose }: { onClose: () => void }) {
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState<string | null>(null);

  const consultaMut = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/sistema/consulta", { pregunta: q });
      return res.json();
    },
    onSuccess: (data: any) => {
      setRespuesta(data.respuesta);
    },
  });

  const handleConsulta = (q: string) => {
    if (!q.trim()) return;
    setPregunta(q);
    setRespuesta(null);
    consultaMut.mutate(q.trim());
  };

  const sugerencias = [
    "Que aprendio hoy?",
    "Mejor ruta CENCOSUD?",
    "Camiones bajo meta?",
    "Patrones sospechosos?",
    "Resumen operacional",
    "Ranking conductores",
  ];

  return (
    <div className="fixed inset-0 z-[150]" onClick={onClose}>
      <div
        className="absolute right-4 w-[360px] consulta-rapida"
        style={{
          top: "44px",
          background: "rgba(9,16,24,0.98)",
          backdropFilter: "blur(16px)",
          border: "1px solid #0d2035",
          borderRadius: "6px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="panel-consulta-rapida"
      >
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
            <span className="font-exo text-xs tracking-[0.15em] font-bold" style={{ color: "#00d4ff" }}>CONSULTAR AL SISTEMA</span>
          </div>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConsulta(pregunta)}
              placeholder="Que quieres saber?"
              className="flex-1 px-3 py-1.5 font-rajdhani text-[13px] outline-none"
              style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff", borderRadius: "3px" }}
              autoFocus
              data-testid="input-consulta-rapida"
            />
            <button
              onClick={() => handleConsulta(pregunta)}
              disabled={consultaMut.isPending || !pregunta.trim()}
              className="px-2.5 py-1.5 cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
              style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", borderRadius: "3px" }}
              data-testid="button-enviar-rapida"
            >
              {consultaMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#00d4ff" }} />
              ) : (
                <Send className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
              )}
            </button>
          </div>

          <div className="mb-3">
            <div className="font-exo text-[11px] tracking-wider mb-2" style={{ color: "#3a6080" }}>SUGERENCIAS RAPIDAS:</div>
            <div className="flex flex-wrap gap-1.5">
              {sugerencias.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleConsulta(s)}
                  className="px-2 py-1 font-rajdhani text-[11px] cursor-pointer transition-all hover:opacity-70"
                  style={{ background: "#091018", border: "1px solid #0d2035", color: "#4a7090", borderRadius: "3px" }}
                  data-testid={`button-sugerencia-${i}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {consultaMut.isPending && (
            <div className="p-3 space-y-1.5" style={{ background: "#020508", borderRadius: "3px" }}>
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "85%", animation: "pulse 1.5s infinite" }} />
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "70%", animation: "pulse 1.5s infinite" }} />
              <div className="h-3 rounded" style={{ background: "#0d2035", width: "78%", animation: "pulse 1.5s infinite" }} />
            </div>
          )}

          {respuesta && (
            <div className="p-3" style={{ background: "rgba(0,212,255,0.03)", border: "1px solid #0d203566", borderRadius: "3px" }}>
              <div className="font-rajdhani text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }} data-testid="text-respuesta-rapida">
                {respuesta}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
