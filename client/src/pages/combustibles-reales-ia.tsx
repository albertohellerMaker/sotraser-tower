import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Route, Fuel, X, Send } from "lucide-react";

interface ViajeDetail {
  id: number;
  codigo: string;
  fecha: string;
  kmRecorridos: number;
  litrosSigetra: number;
  litrosEcu: number;
  rendimiento: number;
  desviacionPct: number;
  esAnomalia: boolean;
}

interface RouteCluster {
  routeId: string;
  camionId: number;
  patente: string;
  faena: string;
  origenNombre: string;
  destinoNombre: string;
  viajes: ViajeDetail[];
  totalViajes: number;
  promedioRendimiento: number;
  promedioKm: number;
  promedioLitros: number;
  desviacionMax: number;
  anomalias: number;
}

interface Resumen {
  totalRutas: number;
  totalViajes: number;
  totalAnomalias: number;
  rutasConAnomalias: number;
  camionesAnalizados: number;
  toleranciaKm: number;
  umbralAnomaliaPct: number;
  minimoViajes: number;
}

interface CombustiblesData {
  rutas: RouteCluster[];
  resumen: Resumen;
}

const PREGUNTAS = [
  "Que camion tiene mas anomalias en sus rutas?",
  "Hay sospechas de robo de combustible?",
  "Que ruta consume mas combustible?",
  "Diferencia surtidor vs ECU por ruta?",
  "Camiones con peor rendimiento constante?",
  "Resumen de patrones sospechosos",
];

function ConsultaPanel({ onClose }: { onClose: () => void }) {
  const [pregunta, setPregunta] = useState("");
  const [loading, setLoading] = useState(false);
  const [respuesta, setRespuesta] = useState<string | null>(null);

  const handleAsk = async (q: string) => {
    const query = q || pregunta;
    if (!query.trim()) return;
    setPregunta(query);
    setLoading(true);
    setRespuesta(null);
    try {
      const res = await apiRequest("POST", "/api/ia/combustibles-reales/consulta", { pregunta: query });
      const data = await res.json();
      setRespuesta(data.respuesta);
    } catch {
      setRespuesta("Error al consultar. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="relative w-full max-w-2xl mx-4 rounded border overflow-hidden"
        style={{ background: "#0a1929", borderColor: "#0d2035", maxHeight: "85vh" }}
        data-testid="modal-consulta-combustibles"
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#0d2035" }}>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" style={{ color: "#00d4ff" }} />
            <span className="font-space text-sm font-bold" style={{ color: "#00d4ff" }}>CONSULTAR COMBUSTIBLES REALES</span>
          </div>
          <button onClick={onClose} className="p-1 hover:opacity-70" data-testid="btn-close-consulta-combustibles">
            <X className="w-4 h-4" style={{ color: "#3a6080" }} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(85vh - 140px)" }}>
          <div className="flex flex-wrap gap-2">
            {PREGUNTAS.map((p, i) => (
              <button
                key={i}
                onClick={() => handleAsk(p)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-rajdhani rounded border transition-all hover:border-[#00d4ff]"
                style={{ borderColor: "#0d2035", color: "#3a6080", background: "rgba(0,212,255,0.05)" }}
                data-testid={`btn-pregunta-sugerida-${i}`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={pregunta}
              onChange={e => setPregunta(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAsk("")}
              placeholder="Escribe tu pregunta sobre combustibles..."
              className="flex-1 px-3 py-2 rounded border text-sm font-rajdhani"
              style={{ background: "#020508", borderColor: "#0d2035", color: "#c8e8ff" }}
              disabled={loading}
              data-testid="input-pregunta-combustibles"
            />
            <button
              onClick={() => handleAsk("")}
              disabled={loading || !pregunta.trim()}
              className="px-4 py-2 rounded border font-space text-xs font-bold transition-all"
              style={{
                background: loading ? "#0d2035" : "rgba(0,212,255,0.15)",
                borderColor: "#00d4ff",
                color: "#00d4ff",
                opacity: loading || !pregunta.trim() ? 0.4 : 1,
              }}
              data-testid="btn-enviar-pregunta-combustibles"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-3 p-4 rounded border" style={{ borderColor: "#0d2035", background: "rgba(0,212,255,0.05)" }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00d4ff" }} />
              <span className="text-sm font-rajdhani" style={{ color: "#3a6080" }}>Analizando datos de combustible por ruta...</span>
            </div>
          )}

          {respuesta && (
            <div
              className="p-4 rounded border text-sm font-rajdhani leading-relaxed whitespace-pre-wrap"
              style={{ borderColor: "#0d2035", background: "rgba(0,212,255,0.03)", color: "#c8e8ff" }}
              data-testid="text-respuesta-combustibles"
            >
              {respuesta}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RouteCard({ cluster, isOpen, onToggle }: { cluster: RouteCluster; isOpen: boolean; onToggle: () => void }) {
  const hasAnomalias = cluster.anomalias > 0;

  return (
    <div
      className="rounded border overflow-hidden"
      style={{ borderColor: hasAnomalias ? "rgba(255,34,68,0.3)" : "#0d2035", background: "#0a1929" }}
      data-testid={`card-ruta-${cluster.routeId}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left transition-all hover:bg-[rgba(0,212,255,0.03)]"
        data-testid={`btn-toggle-ruta-${cluster.routeId}`}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
            style={{
              background: hasAnomalias ? "rgba(255,34,68,0.15)" : "rgba(0,255,136,0.1)",
              border: `1px solid ${hasAnomalias ? "rgba(255,34,68,0.3)" : "rgba(0,255,136,0.2)"}`,
            }}
          >
            {hasAnomalias ? (
              <AlertTriangle className="w-5 h-5" style={{ color: "#ff2244" }} />
            ) : (
              <CheckCircle className="w-5 h-5" style={{ color: "#00ff88" }} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-space text-sm font-bold" style={{ color: "#00d4ff" }} data-testid={`text-patente-ruta-${cluster.routeId}`}>
                {cluster.patente}
              </span>
              <span className="text-xs font-rajdhani px-2 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.1)", color: "#3a6080" }}>
                {cluster.faena}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Route className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} />
              <span className="text-xs font-rajdhani truncate" style={{ color: "#3a6080" }}>
                {cluster.origenNombre} &rarr; {cluster.destinoNombre}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
            <div className="text-center">
              <div className="font-space text-lg font-bold" style={{ color: "#c8e8ff" }}>{cluster.totalViajes}</div>
              <div className="text-xs font-rajdhani" style={{ color: "#3a6080" }}>VIAJES</div>
            </div>
            <div className="text-center">
              <div className="font-space text-lg font-bold" style={{ color: "#00d4ff" }}>{cluster.promedioRendimiento}</div>
              <div className="text-xs font-rajdhani" style={{ color: "#3a6080" }}>KM/L PROM</div>
            </div>
            <div className="text-center">
              <div className="font-space text-lg font-bold" style={{ color: hasAnomalias ? "#ff2244" : "#00ff88" }}>
                {cluster.anomalias}
              </div>
              <div className="text-xs font-rajdhani" style={{ color: "#3a6080" }}>ANOMALIAS</div>
            </div>
            <div className="text-center">
              <div className="font-space text-lg font-bold" style={{ color: cluster.desviacionMax > 20 ? "#ffcc00" : "#c8e8ff" }}>
                {cluster.desviacionMax}%
              </div>
              <div className="text-xs font-rajdhani" style={{ color: "#3a6080" }}>DESV MAX</div>
            </div>
          </div>
        </div>

        {isOpen ? (
          <ChevronUp className="w-5 h-5 flex-shrink-0 ml-2" style={{ color: "#3a6080" }} />
        ) : (
          <ChevronDown className="w-5 h-5 flex-shrink-0 ml-2" style={{ color: "#3a6080" }} />
        )}
      </button>

      {isOpen && (
        <div className="border-t px-4 pb-4" style={{ borderColor: "#0d2035" }}>
          <div className="sm:hidden flex gap-4 py-3 border-b" style={{ borderColor: "#0d2035" }}>
            <div className="text-center flex-1">
              <div className="font-space text-sm font-bold" style={{ color: "#c8e8ff" }}>{cluster.totalViajes}</div>
              <div className="text-[11px] font-rajdhani" style={{ color: "#3a6080" }}>VIAJES</div>
            </div>
            <div className="text-center flex-1">
              <div className="font-space text-sm font-bold" style={{ color: "#00d4ff" }}>{cluster.promedioRendimiento}</div>
              <div className="text-[11px] font-rajdhani" style={{ color: "#3a6080" }}>KM/L</div>
            </div>
            <div className="text-center flex-1">
              <div className="font-space text-sm font-bold" style={{ color: hasAnomalias ? "#ff2244" : "#00ff88" }}>{cluster.anomalias}</div>
              <div className="text-[11px] font-rajdhani" style={{ color: "#3a6080" }}>ANOMALIAS</div>
            </div>
          </div>

          <div className="mt-3 flex gap-4 flex-wrap mb-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded border" style={{ borderColor: "#0d2035", background: "rgba(0,212,255,0.03)" }}>
              <Fuel className="w-4 h-4" style={{ color: "#00d4ff" }} />
              <div>
                <div className="text-xs font-rajdhani" style={{ color: "#3a6080" }}>PROMEDIO LITROS</div>
                <div className="font-space text-sm font-bold" style={{ color: "#c8e8ff" }}>{cluster.promedioLitros} L</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded border" style={{ borderColor: "#0d2035", background: "rgba(0,212,255,0.03)" }}>
              <Route className="w-4 h-4" style={{ color: "#00d4ff" }} />
              <div>
                <div className="text-xs font-rajdhani" style={{ color: "#3a6080" }}>PROMEDIO KM</div>
                <div className="font-space text-sm font-bold" style={{ color: "#c8e8ff" }}>{cluster.promedioKm} km</div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-rajdhani" data-testid={`table-viajes-${cluster.routeId}`}>
              <thead>
                <tr style={{ borderBottom: "1px solid #0d2035" }}>
                  <th className="text-left py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>FECHA</th>
                  <th className="text-right py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>KM</th>
                  <th className="text-right py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>LT SURTIDOR</th>
                  <th className="text-right py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>LT ECU</th>
                  <th className="text-right py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>KM/L</th>
                  <th className="text-right py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>DESV</th>
                  <th className="text-center py-2 px-2 font-space text-xs font-bold" style={{ color: "#3a6080" }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {cluster.viajes.map(v => (
                  <tr
                    key={v.id}
                    className="transition-colors"
                    style={{
                      borderBottom: "1px solid rgba(13,32,53,0.5)",
                      background: v.esAnomalia ? "rgba(255,34,68,0.05)" : "transparent",
                    }}
                    data-testid={`row-viaje-${v.id}`}
                  >
                    <td className="py-2 px-2" style={{ color: "#c8e8ff" }}>{v.fecha}</td>
                    <td className="py-2 px-2 text-right font-space" style={{ color: "#c8e8ff" }}>{v.kmRecorridos}</td>
                    <td className="py-2 px-2 text-right font-space" style={{ color: "#ffcc00" }}>{v.litrosSigetra || "—"}</td>
                    <td className="py-2 px-2 text-right font-space" style={{ color: "#00d4ff" }}>{v.litrosEcu || "—"}</td>
                    <td className="py-2 px-2 text-right font-space font-bold" style={{ color: "#c8e8ff" }}>{v.rendimiento}</td>
                    <td className="py-2 px-2 text-right font-space font-bold" style={{
                      color: v.esAnomalia
                        ? (v.desviacionPct < 0 ? "#ff2244" : "#ffcc00")
                        : "#00ff88"
                    }}>
                      <span className="flex items-center justify-end gap-1">
                        {v.desviacionPct > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {v.desviacionPct > 0 ? "+" : ""}{v.desviacionPct}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {v.esAnomalia ? (
                        <span className="px-2 py-0.5 rounded text-xs font-space font-bold" style={{ background: "rgba(255,34,68,0.15)", color: "#ff2244" }}>
                          ANOMALIA
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-space font-bold" style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88" }}>
                          NORMAL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 p-3 rounded border" style={{ borderColor: "#0d2035", background: "rgba(0,212,255,0.03)" }}>
            <div className="text-xs font-space font-bold mb-1" style={{ color: "#3a6080" }}>BASELINE PROPIO</div>
            <div className="text-xs font-rajdhani" style={{ color: "#c8e8ff" }}>
              Basado en {cluster.totalViajes} viajes del mismo camion en la misma ruta.
              Rendimiento promedio: <span className="font-bold" style={{ color: "#00d4ff" }}>{cluster.promedioRendimiento} km/L</span>.
              {cluster.anomalias > 0 ? (
                <span style={{ color: "#ff2244" }}> Se detectaron {cluster.anomalias} viaje(s) con desviacion superior al 20% del baseline.</span>
              ) : (
                <span style={{ color: "#00ff88" }}> Sin anomalias detectadas.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CombustiblesRealesIA() {
  const [showConsulta, setShowConsulta] = useState(false);
  const [openRoutes, setOpenRoutes] = useState<Set<string>>(new Set());
  const [filterFaena, setFilterFaena] = useState<string>("todas");
  const [filterAnomalias, setFilterAnomalias] = useState(false);

  const { data, isLoading, error } = useQuery<CombustiblesData>({
    queryKey: ["/api/ia/combustibles-reales"],
  });

  const toggleRoute = (routeId: string) => {
    setOpenRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const faenas = data ? [...new Set(data.rutas.map(r => r.faena))].sort() : [];
  const filteredRutas = data?.rutas.filter(r => {
    if (filterFaena !== "todas" && r.faena !== filterFaena) return false;
    if (filterAnomalias && r.anomalias === 0) return false;
    return true;
  }) || [];

  const noData = !isLoading && data && data.resumen.totalRutas === 0;

  return (
    <div className="space-y-6" data-testid="page-combustibles-reales">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-space text-xl font-bold tracking-wider" style={{ color: "#00d4ff" }} data-testid="title-combustibles-reales">
            COMBUSTIBLES REALES IA
          </h1>
          <p className="text-sm font-rajdhani mt-1" style={{ color: "#3a6080" }}>
            Comparacion de consumo real por ruta &mdash; mismo camion, misma ruta, minimo 3 viajes
          </p>
        </div>
        <button
          onClick={() => setShowConsulta(true)}
          className="flex items-center gap-2 px-4 py-2 rounded border font-space text-xs font-bold transition-all hover:border-[#00d4ff] hover:bg-[rgba(0,212,255,0.1)]"
          style={{ borderColor: "#0d2035", color: "#00d4ff", background: "rgba(0,212,255,0.05)" }}
          data-testid="btn-consultar-combustibles"
        >
          <Search className="w-4 h-4" />
          CONSULTAR IA
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
          <span className="font-rajdhani text-sm" style={{ color: "#3a6080" }}>Analizando rutas y agrupando viajes por GPS...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded border text-sm font-rajdhani" style={{ borderColor: "rgba(255,34,68,0.3)", background: "rgba(255,34,68,0.05)", color: "#ff2244" }}>
          Error al cargar datos: {(error as Error).message}
        </div>
      )}

      {noData && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded border" style={{ borderColor: "#0d2035", background: "#0a1929" }} data-testid="empty-state-combustibles">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <Route className="w-8 h-8" style={{ color: "#00d4ff" }} />
          </div>
          <div className="text-center space-y-2">
            <h3 className="font-space text-sm font-bold" style={{ color: "#c8e8ff" }}>Analisis pendiente</h3>
            <p className="text-sm font-rajdhani max-w-md" style={{ color: "#3a6080" }}>
              Se necesitan viajes TMS detectados con coordenadas GPS para comparar rutas.
              Ve al tab TMS, selecciona un contrato y presiona "Detectar Viajes" para generar el historial.
              Se requieren minimo 3 viajes del mismo camion en la misma ruta.
            </p>
          </div>
        </div>
      )}

      {data && data.resumen.totalRutas > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="kpi-combustibles">
            <div className="p-4 rounded border" style={{ borderColor: "#0d2035", background: "#0a1929" }}>
              <div className="text-xs font-space font-bold" style={{ color: "#3a6080" }}>RUTAS ANALIZADAS</div>
              <div className="font-space text-2xl font-bold mt-1" style={{ color: "#00d4ff" }} data-testid="kpi-total-rutas">{data.resumen.totalRutas}</div>
            </div>
            <div className="p-4 rounded border" style={{ borderColor: "#0d2035", background: "#0a1929" }}>
              <div className="text-xs font-space font-bold" style={{ color: "#3a6080" }}>TOTAL VIAJES</div>
              <div className="font-space text-2xl font-bold mt-1" style={{ color: "#c8e8ff" }} data-testid="kpi-total-viajes">{data.resumen.totalViajes}</div>
            </div>
            <div className="p-4 rounded border" style={{ borderColor: data.resumen.totalAnomalias > 0 ? "rgba(255,34,68,0.3)" : "#0d2035", background: "#0a1929" }}>
              <div className="text-xs font-space font-bold" style={{ color: "#3a6080" }}>ANOMALIAS</div>
              <div className="font-space text-2xl font-bold mt-1" style={{ color: data.resumen.totalAnomalias > 0 ? "#ff2244" : "#00ff88" }} data-testid="kpi-anomalias">
                {data.resumen.totalAnomalias}
              </div>
            </div>
            <div className="p-4 rounded border" style={{ borderColor: "#0d2035", background: "#0a1929" }}>
              <div className="text-xs font-space font-bold" style={{ color: "#3a6080" }}>CAMIONES</div>
              <div className="font-space text-2xl font-bold mt-1" style={{ color: "#c8e8ff" }} data-testid="kpi-camiones">{data.resumen.camionesAnalizados}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterFaena}
              onChange={e => setFilterFaena(e.target.value)}
              className="px-3 py-2 rounded border text-sm font-rajdhani"
              style={{ background: "#020508", borderColor: "#0d2035", color: "#c8e8ff" }}
              data-testid="select-filter-faena"
            >
              <option value="todas">Todas las faenas</option>
              {faenas.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <button
              onClick={() => setFilterAnomalias(!filterAnomalias)}
              className="px-3 py-2 rounded border text-xs font-space font-bold transition-all"
              style={{
                borderColor: filterAnomalias ? "rgba(255,34,68,0.5)" : "#0d2035",
                background: filterAnomalias ? "rgba(255,34,68,0.1)" : "transparent",
                color: filterAnomalias ? "#ff2244" : "#3a6080",
              }}
              data-testid="btn-filter-anomalias"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                SOLO ANOMALIAS
              </span>
            </button>

            <span className="text-xs font-rajdhani ml-auto" style={{ color: "#3a6080" }}>
              {filteredRutas.length} ruta(s) &mdash; tolerancia {data.resumen.toleranciaKm}km, umbral {data.resumen.umbralAnomaliaPct}%
            </span>
          </div>

          <div className="space-y-3" data-testid="list-rutas">
            {filteredRutas.map(cluster => (
              <RouteCard
                key={cluster.routeId}
                cluster={cluster}
                isOpen={openRoutes.has(cluster.routeId)}
                onToggle={() => toggleRoute(cluster.routeId)}
              />
            ))}
            {filteredRutas.length === 0 && (
              <div className="text-center py-10">
                <span className="font-rajdhani text-sm" style={{ color: "#3a6080" }}>
                  No hay rutas que coincidan con los filtros seleccionados
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {showConsulta && <ConsultaPanel onClose={() => setShowConsulta(false)} />}
    </div>
  );
}
