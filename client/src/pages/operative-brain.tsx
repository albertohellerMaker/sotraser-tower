import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, AlertTriangle, TrendingUp, Activity, Fuel, MapPin, Send, Route, Truck, X, RefreshCw } from "lucide-react";

function getRendColor(r: number): string {
  if (r >= 2.85) return "#00ff88";
  if (r >= 2.3) return "#ffcc00";
  return "#ff2244";
}

// ═══════════════════════════════════════════════════
// OPERATIVE BRAIN v2
// ═══════════════════════════════════════════════════

export default function OperativeBrain() {
  const [contrato, setContrato] = useState("TODOS");
  const [mensajeChat, setMensajeChat] = useState("");
  const [historialChat, setHistorialChat] = useState<any[]>([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Dynamic contratos from viajes data
  const { data: contratosData } = useQuery<any>({ queryKey: ["/api/rutas/contratos-disponibles"], queryFn: () => fetch("/api/rutas/contratos-disponibles").then(r => r.json()), staleTime: 600000 });
  const getContColor = (c: string): string => {
    if (c === "TODOS") return "#a855f7";
    if (c?.includes("ANGLO-COCU")) return "#00ff88";
    if (c?.includes("ANGLO-CAL")) return "#ff6b35";
    if (c?.includes("ANGLO")) return "#00d4ff";
    if (c?.includes("CENCOSUD") || c?.includes("WALMART")) return "#00bfff";
    if (c?.includes("GLENCORE") || c?.includes("ACIDO")) return "#ff8c00";
    const hash = c?.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) || 0;
    return ["#a855f7", "#06b6d4", "#f97316", "#84cc16", "#ec4899"][hash % 5];
  };
  const CONTRATOS = useMemo(() => {
    if (!contratosData?.contratos) return [{ id: "TODOS", label: "TODOS", color: "#a855f7" }];
    return contratosData.contratos.map((c: any) => ({ id: c.id, label: c.label || c.id, color: getContColor(c.id) }));
  }, [contratosData]);
  const color = getContColor(contrato);

  const { data: estado } = useQuery<any>({ queryKey: ["/api/brain/estado-sistema"], queryFn: () => fetch("/api/brain/estado-sistema").then(r => r.json()), refetchInterval: 60000 });
  const { data: pred } = useQuery<any>({ queryKey: ["/api/brain/predicciones", contrato], queryFn: () => fetch(`/api/brain/predicciones/${contrato}`).then(r => r.json()), refetchInterval: 300000 });
  const { data: anomalias } = useQuery<any>({ queryKey: ["/api/brain/anomalias-macro", contrato], queryFn: () => fetch(`/api/brain/anomalias-macro?contrato=${contrato}`).then(r => r.json()), refetchInterval: 900000 });
  const { data: kpis } = useQuery<any>({ queryKey: ["/api/brain/kpis-administrador", contrato], queryFn: () => fetch(`/api/brain/kpis-administrador/${contrato}`).then(r => r.json()), refetchInterval: 300000 });

  const sugerencias = useMemo(() => {
    const base = ["Resumen del dia", "Que camion deberia revisar?", "Proyeccion fin de mes", "Hay algo inusual?"];
    if ((anomalias || []).length > 0) base.unshift("Que anomalias hay hoy?");
    return base.slice(0, 4);
  }, [anomalias]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [historialChat]);

  const enviarMensaje = async (texto?: string) => {
    const msg = texto || mensajeChat.trim();
    if (!msg) return;
    const nuevo = [...historialChat, { role: "user", content: msg }];
    setHistorialChat(nuevo);
    setMensajeChat("");
    setCargandoChat(true);
    try {
      const r = await fetch("/api/brain/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: msg, contrato, historial: historialChat }) });
      const data = await r.json();
      setHistorialChat([...nuevo, { role: "assistant", content: data.respuesta }]);
    } catch { setHistorialChat([...nuevo, { role: "assistant", content: "Error al conectar con la IA." }]); }
    finally { setCargandoChat(false); }
  };

  return (
    <div className="min-h-screen p-4 space-y-4" style={{ background: "#020508" }}>
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5" style={{ color }} />
            <span className="font-space text-[16px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>OPERATIVE BRAIN</span>
            <span className="font-exo text-[9px] px-2 py-0.5 rounded" style={{ color, border: `1px solid ${color}40` }}>v2</span>
          </div>
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            Administrador de Contrato · Sotraser · {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <div className="flex gap-1">
          {CONTRATOS.map(c => (
            <button key={c.id} onClick={() => setContrato(c.id)}
              className="px-3 py-2 font-space text-[9px] font-bold tracking-wider cursor-pointer"
              style={{ background: contrato === c.id ? `${c.color}15` : "transparent", border: `1px solid ${contrato === c.id ? `${c.color}40` : "#0d2035"}`, borderTop: `2px solid ${contrato === c.id ? c.color : "transparent"}`, color: contrato === c.id ? c.color : "#3a6080", borderRadius: 4 }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* FILA 1: Estado + Predicciones + Anomalías */}
      <div className="grid grid-cols-3 gap-3">
        {/* Estado Sistema */}
        <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>ESTADO DEL SISTEMA</div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Cobertura Volvo</span>
                <span className="font-space text-[12px] font-bold" style={{ color: (estado?.cobertura_volvo?.pct || 0) >= 70 ? "#00ff88" : "#ff2244" }}>
                  {estado?.cobertura_volvo?.pct || 0}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                <div className="h-full rounded-full" style={{ width: `${estado?.cobertura_volvo?.pct || 0}%`, background: (estado?.cobertura_volvo?.pct || 0) >= 70 ? "#00ff88" : "#ff2244" }} />
              </div>
              <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>{estado?.cobertura_volvo?.activos || 0} de {estado?.cobertura_volvo?.total || 0} camiones</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Datos ECU</span>
                <span className="font-space text-[12px] font-bold" style={{ color: (estado?.datos_ecu?.pct || 0) >= 50 ? "#00d4ff" : "#ffcc00" }}>
                  {estado?.datos_ecu?.pct || 0}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                <div className="h-full rounded-full" style={{ width: `${estado?.datos_ecu?.pct || 0}%`, background: "#00d4ff" }} />
              </div>
              <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>{estado?.datos_ecu?.con_ecu || 0} de {estado?.datos_ecu?.total || 0} viajes verificados</div>
            </div>
            <div className="pt-2" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Sync Volvo: {estado?.ultimo_sync_volvo ? new Date(estado.ultimo_sync_volvo).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--"}</div>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Sync Sigetra: {estado?.ultimo_sync_sigetra ? new Date(estado.ultimo_sync_sigetra).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--"}</div>
            </div>
          </div>
        </div>

        {/* Predicciones */}
        <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>PREDICCION FIN DE MES</div>
          {pred ? (
            <div className="space-y-3">
              <div>
                <div className="font-exo text-[9px] mb-1" style={{ color: "#3a6080" }}>KM PROYECTADOS</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-space text-[20px] font-bold" style={{ color: "#00d4ff" }}>{(pred.km_proyectado || 0).toLocaleString()}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>km</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden mt-1" style={{ background: "#0d2035" }}>
                  <div className="h-full rounded-full" style={{ width: `${pred.km_proyectado > 0 ? Math.min(100, Math.round(pred.km_mes_actual / pred.km_proyectado * 100)) : 0}%`, background: color }} />
                </div>
                <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>
                  {(pred.km_mes_actual || 0).toLocaleString()} actuales · {pred.dias_restantes} dias restantes
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Tendencia semanal</span>
                <span className="font-space text-[11px] font-bold" style={{ color: (pred.tendencia_semanal_pct || 0) >= 0 ? "#00ff88" : "#ff2244" }}>
                  {(pred.tendencia_semanal_pct || 0) >= 0 ? "+" : ""}{pred.tendencia_semanal_pct || 0}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Rendimiento proy.</span>
                <span className="font-space text-[11px] font-bold" style={{ color: getRendColor(parseFloat(pred.rendimiento_proyectado || "0")) }}>{pred.rendimiento_proyectado || "--"} km/L</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Camiones hoy vs hist.</span>
                <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{pred.camiones_activos_hoy} / {pred.camiones_promedio_historico}</span>
              </div>
            </div>
          ) : <Loader2 className="w-4 h-4 animate-spin mx-auto mt-4" style={{ color: "#3a6080" }} />}
        </div>

        {/* Anomalías Macro */}
        <div className="rounded-lg p-4" style={{ background: "#060d14", border: `1px solid ${(anomalias || []).length > 0 ? "#ff224430" : "#0d2035"}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>ANOMALIAS MACRO</span>
            <span className="font-space text-[11px] font-bold" style={{ color: (anomalias || []).length > 0 ? "#ff2244" : "#00ff88" }}>
              {(anomalias || []).length}
            </span>
          </div>
          {(anomalias || []).length === 0 ? (
            <div className="text-center py-4">
              <div className="font-exo text-[10px]" style={{ color: "#00ff88" }}>Sin anomalias detectadas</div>
              <div className="font-exo text-[8px] mt-1" style={{ color: "#3a6080" }}>Ultimas 48h analizadas</div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {(anomalias || []).slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${a.severidad === "ALTA" ? "#ff2244" : "#ffcc00"}` }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                    <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: a.severidad === "ALTA" ? "#ff2244" : "#ffcc00", border: `1px solid ${a.severidad === "ALTA" ? "#ff224430" : "#ffcc0030"}` }}>{a.severidad}</span>
                  </div>
                  <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                    {a.tipo === "RUTA_ANOMALA" ? `Ruta ${a.detalle.diff_km_pct}% diferente · ${a.detalle.destino_habitual} → ${a.detalle.destino_actual}` : `Velocidad ${a.detalle?.diff_pct || 0}% anómala`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPIs ADMINISTRADOR */}
      {kpis && (
        <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>KPIs TECNICOS · MARZO 2026</div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "VIAJES VERIF.", value: kpis.viajes, color: "#00d4ff" },
              { label: "KM/L REAL ECU", value: kpis.rend_prom?.toFixed(2) || "--", color: getRendColor(kpis.rend_prom || 0) },
              { label: "CAMIONES", value: kpis.camiones, color: "#c8e8ff" },
              { label: "KM TOTAL", value: (kpis.km_total || 0).toLocaleString(), color: "#c8e8ff" },
            ].map(k => (
              <div key={k.label} className="text-center px-3 py-2.5 rounded" style={{ background: "#0a1520", borderTop: `2px solid ${k.color}` }}>
                <div className="font-space text-[18px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
                <div className="font-exo text-[7px] tracking-[0.12em] uppercase mt-1" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Top */}
            <div>
              <div className="font-exo text-[8px] tracking-[0.1em] uppercase mb-2" style={{ color: "#00ff88" }}>TOP 5 CAMIONES KM/L</div>
              {(kpis.top_camiones || []).map((c: any, i: number) => (
                <div key={c.patente} className="flex items-center justify-between px-2 py-1 rounded mb-0.5" style={{ background: "#0a1520" }}>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[9px] w-3" style={{ color: "#3a6080" }}>{i + 1}</span>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[10px] font-bold" style={{ color: "#00ff88" }}>{c.rend} km/L</span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.viajes}v</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Bottom */}
            <div>
              <div className="font-exo text-[8px] tracking-[0.1em] uppercase mb-2" style={{ color: "#ff2244" }}>REQUIEREN ATENCION</div>
              {(kpis.bottom_camiones || []).map((c: any, i: number) => (
                <div key={c.patente} className="flex items-center justify-between px-2 py-1 rounded mb-0.5" style={{ background: "#0a1520", borderLeft: "2px solid #ff2244" }}>
                  <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[10px] font-bold" style={{ color: "#ff2244" }}>{c.rend} km/L</span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.viajes}v</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CHAT IA */}
      <div className="rounded-lg" style={{ background: "#060d14", border: `1px solid ${color}30`, borderTop: `2px solid ${color}` }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #0d2035" }}>
          <Brain className="w-4 h-4" style={{ color }} />
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color }}>CHAT IA</span>
          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>· Datos reales del sistema · Pregunta lo que quieras</span>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[300px] overflow-y-auto">
          {historialChat.length === 0 && (
            <div className="text-center py-4">
              <Brain className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
              <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Tengo acceso a todos los datos de la operacion en tiempo real.</div>
            </div>
          )}
          {historialChat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%] px-3 py-2 rounded-lg"
                style={{ background: msg.role === "user" ? `${color}15` : "#0a1520", border: `1px solid ${msg.role === "user" ? `${color}30` : "#0d2035"}` }}>
                <div className="font-exo text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{msg.content}</div>
              </div>
            </div>
          ))}
          {cargandoChat && (
            <div className="flex justify-start"><div className="px-3 py-2 rounded-lg" style={{ background: "#0a1520", border: "1px solid #0d2035" }}><Loader2 className="w-4 h-4 animate-spin" style={{ color }} /></div></div>
          )}
          <div ref={chatEndRef} />
        </div>

        {historialChat.length < 2 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {sugerencias.map((s, i) => (
              <button key={i} onClick={() => enviarMensaje(s)} className="font-exo text-[8px] px-2 py-1.5 cursor-pointer rounded-md hover:opacity-80"
                style={{ color: "#3a6080", border: "1px solid #0d2035" }}>{s}</button>
            ))}
          </div>
        )}

        <div className="px-4 pb-4 flex gap-2">
          <input value={mensajeChat} onChange={e => setMensajeChat(e.target.value)} onKeyDown={e => e.key === "Enter" && enviarMensaje()}
            placeholder="Pregunta sobre la operacion..." className="flex-1 px-4 py-2.5 font-exo text-[11px] outline-none rounded-md"
            style={{ background: "#0a1520", border: `1px solid ${color}30`, color: "#c8e8ff" }} />
          <button onClick={() => enviarMensaje()} disabled={cargandoChat || !mensajeChat.trim()}
            className="px-4 py-2.5 font-space text-[10px] font-bold cursor-pointer rounded-md hover:opacity-80 disabled:opacity-30 flex items-center gap-1.5"
            style={{ background: `${color}20`, border: `1px solid ${color}40`, color }}>
            <Send className="w-3.5 h-3.5" /> ENVIAR
          </button>
        </div>
      </div>
      {/* Panel Multi-Agente */}
      <PanelAgentes />
      {/* Gerente de Operaciones */}
      <PanelGerenteOps />
      {/* Chat Arquitecto */}
      <PanelArquitecto />
    </div>
  );
}

function PanelAgentes() {
  const { data } = useQuery<any>({ queryKey: ["/api/agentes/estado"], queryFn: () => fetch("/api/agentes/estado").then(r => r.json()), refetchInterval: 60000 });
  const { data: msgsData, refetch } = useQuery<any>({ queryKey: ["/api/agentes/mensajes"], queryFn: () => fetch("/api/agentes/mensajes?limite=10").then(r => r.json()), refetchInterval: 30000 });
  const msgs = msgsData?.mensajes || [];
  const pendientes = msgs.filter((m: any) => !m.leido).length;
  const colorTipo = (t: string) => ({ MONITOR: "#00d4ff", ANALISTA: "#a855f7", PREDICTOR: "#ff6b35", REPORTERO: "#00ff88", GESTOR: "#ffcc00", CEO: "#ff2244", ARQUITECTO: "#34d399" }[t] || "#3a6080");

  return (
    <div style={{ background: "#060d14", border: "1px solid #a855f730", borderTop: "2px solid #a855f7", borderRadius: 8, marginTop: 12 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#a855f7" }}>SISTEMA MULTI-AGENTE</span>
          {pendientes > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{pendientes} nuevos</span>}
        </div>
        <button onClick={() => { fetch("/api/agentes/mensajes/leer-todos", { method: "POST" }).then(() => refetch()); }} className="font-exo text-[8px] cursor-pointer" style={{ color: "#3a6080" }}>Marcar leído</button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 p-3" style={{ borderBottom: "1px solid #0d2035" }}>
        {(data?.agentes || []).map((a: any) => {
          const min = a.ultimo_ciclo ? Math.round((Date.now() - new Date(a.ultimo_ciclo).getTime()) / 60000) : null;
          const ok = min !== null && min < 20;
          return (
            <div key={a.id} className="text-center p-1.5" style={{ background: "#0a1520", borderTop: `2px solid ${ok ? colorTipo(a.tipo) : "#3a6080"}`, borderRadius: 4 }}>
              <div className="font-exo text-[7px] uppercase" style={{ color: ok ? colorTipo(a.tipo) : "#3a6080" }}>{a.nombre.split(" ")[0]}</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{min !== null ? `${min}m` : "-"}</div>
            </div>
          );
        })}
      </div>
      <div className="overflow-auto" style={{ maxHeight: 200 }}>
        {msgs.slice(0, 5).map((m: any) => (
          <div key={m.id} onClick={() => { fetch(`/api/agentes/mensajes/${m.id}/leer`, { method: "POST" }).then(() => refetch()); }}
            className="px-4 py-2 border-b cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]" style={{ borderColor: "#0a1520", borderLeft: !m.leido ? "3px solid #a855f7" : "3px solid transparent" }}>
            <div className="flex items-center gap-2">
              <span className="font-exo text-[8px] font-bold px-1.5 py-0.5" style={{ color: colorTipo(m.nombre_agente?.split(" ")[1]?.toUpperCase() || "MONITOR"), border: `1px solid ${colorTipo(m.nombre_agente?.split(" ")[1]?.toUpperCase() || "MONITOR")}30`, borderRadius: 3 }}>{m.nombre_agente || m.de_agente}</span>
              {m.prioridad === "CRITICA" && <span className="font-exo text-[7px] font-bold" style={{ color: "#ff2244" }}>CRÍTICO</span>}
            </div>
            <div className="font-exo text-[9px] font-bold mt-1 truncate" style={{ color: "#c8e8ff" }}>{m.titulo}</div>
            <div className="font-exo text-[8px] mt-0.5 line-clamp-1" style={{ color: "#3a6080" }}>{m.contenido?.substring(0, 80)}</div>
          </div>
        ))}
        {msgs.length === 0 && <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin mensajes</div>}
      </div>
    </div>
  );
}

function PanelGerenteOps() {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/gerente/estado"], queryFn: () => fetch("/api/gerente/estado").then(r => r.json()), staleTime: 5 * 60000 });
  const { data: puntos } = useQuery<any>({ queryKey: ["/api/gerente/puntos-resueltos"], queryFn: () => fetch("/api/gerente/puntos-resueltos").then(r => r.json()), staleTime: 10 * 60000 });
  const aprendizaje = estado?.aprendizaje || [];
  const parametros = estado?.parametros || [];
  const totalMejorado = aprendizaje.reduce((s: number, a: any) => s + parseInt(a.viajes_mejorados || 0), 0);

  return (
    <div style={{ background: "#060d14", border: "1px solid #fbbf2430", borderTop: "2px solid #fbbf24", borderRadius: 8, marginTop: 12 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="text-[14px]">⚙️</span>
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#fbbf24" }}>GERENTE DE OPERACIONES</span>
          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>· Auto-aprendizaje · Resuelve puntos · Ajusta parámetros</span>
        </div>
        <button onClick={() => fetch("/api/gerente/ejecutar", { method: "POST" })} className="font-exo text-[8px] px-3 py-1 cursor-pointer" style={{ color: "#fbbf24", border: "1px solid #fbbf2430", borderRadius: 4 }}>▶ Ejecutar</button>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3" style={{ borderBottom: "1px solid #0d2035" }}>
        {[
          { l: "VIAJES MEJORADOS", v: totalMejorado, c: "#00ff88" },
          { l: "RUTAS RESUELTAS", v: puntos?.pct_completamente_resuelto ? `${puntos.pct_completamente_resuelto}%` : "--", c: "#00d4ff" },
          { l: "LUGARES", v: estado?.lugares?.reduce((s: number, l: any) => s + parseInt(l.total), 0) || 0, c: "#fbbf24" },
          { l: "PARÁMETROS", v: parametros.length, c: "#a78bfa" },
        ].map(k => (
          <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", borderRadius: 6 }}>
            <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 p-3" style={{ borderBottom: "1px solid #0d2035" }}>
        {parametros.slice(0, 6).map((p: any) => (
          <div key={p.clave} className="flex items-center justify-between px-3 py-1.5" style={{ background: "#0a1520", borderRadius: 4, border: p.modificado_por === "GERENTE_BOT" ? "1px solid #fbbf2430" : "1px solid #0d2035" }}>
            <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{p.descripcion?.substring(0, 28) || p.clave}</span>
            <div className="flex items-center gap-1">
              <span className="font-space text-[12px] font-bold" style={{ color: "#fbbf24" }}>{p.valor}</span>
              {p.modificado_por === "GERENTE_BOT" && <span className="font-exo text-[6px]" style={{ color: "#fbbf24" }}>BOT</span>}
            </div>
          </div>
        ))}
      </div>
      {aprendizaje.length > 0 && (
        <div className="px-4 py-2">
          <div className="font-exo text-[7px] uppercase mb-1" style={{ color: "#3a6080" }}>APRENDIZAJE RECIENTE</div>
          {aprendizaje.map((a: any) => (
            <div key={a.tipo} className="flex items-center justify-between py-1">
              <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{a.tipo.replace(/_/g, " ")}</span>
              <span className="font-space text-[10px] font-bold" style={{ color: "#fbbf24" }}>×{a.total} {parseInt(a.viajes_mejorados) > 0 ? `(+${a.viajes_mejorados} viajes)` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PanelArquitecto() {
  const [msg, setMsg] = useState("");
  const [hist, setHist] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load history on mount
  useEffect(() => {
    fetch("/api/agentes/arquitecto/historial").then(r => r.json()).then(d => {
      setHist((d.historial || []).map((h: any) => ({ rol: h.rol, texto: h.mensaje })));
    }).catch(() => {});
  }, []);

  const enviar = async () => {
    if (!msg.trim()) return;
    const texto = msg; setMsg(""); setLoading(true);
    setHist(h => [...h, { rol: "CEO", texto }]);
    try {
      const r = await fetch("/api/agentes/arquitecto/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: texto }) });
      const d = await r.json();
      setHist(h => [...h, { rol: "ARQUITECTO", texto: d.respuesta }]);
    } catch { setHist(h => [...h, { rol: "ARQUITECTO", texto: "Error de conexión" }]); }
    setLoading(false);
  };

  return (
    <div style={{ background: "#060d14", border: "1px solid #34d39930", borderTop: "2px solid #34d399", borderRadius: 8, marginTop: 12 }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <span className="text-[14px]">🏗️</span>
        <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#34d399" }}>AGENTE ARQUITECTO</span>
        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>· Jefe técnico · Conoce todo el sistema</span>
      </div>
      <div className="overflow-auto px-4 py-3 space-y-2" style={{ maxHeight: 250 }}>
        {hist.length === 0 && (
          <div className="text-center py-3">
            <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Pregúntale sobre el sistema</div>
            <div className="flex gap-2 justify-center mt-2 flex-wrap">
              {["¿Cómo está el sistema?", "¿Qué detectaron los agentes?", "¿Qué mejoras propones?"].map(s => (
                <button key={s} onClick={() => setMsg(s)} className="font-exo text-[8px] px-2 py-1 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {hist.map((h, i) => (
          <div key={i} className={`flex ${h.rol === "CEO" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] px-3 py-2" style={{ background: h.rol === "CEO" ? "rgba(52,211,153,0.1)" : "#0a1520", border: `1px solid ${h.rol === "CEO" ? "#34d39930" : "#0d2035"}`, borderRadius: 8 }}>
              <div className="font-exo text-[7px] uppercase mb-1" style={{ color: h.rol === "CEO" ? "#34d399" : "#3a6080" }}>{h.rol === "CEO" ? "TÚ" : "🏗️ ARQUITECTO"}</div>
              <div className="font-exo text-[10px] leading-relaxed" style={{ color: "#c8e8ff" }}>{h.texto}</div>
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="px-3 py-2" style={{ background: "#0a1520", borderRadius: 8 }}><Loader2 className="w-4 h-4 animate-spin" style={{ color: "#34d399" }} /></div></div>}
      </div>
      <div className="px-4 pb-4 flex gap-2" style={{ borderTop: "1px solid #0d2035", paddingTop: 12 }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Habla con el Arquitecto..."
          className="flex-1 px-3 py-2 font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #34d39930", borderRadius: 6, color: "#c8e8ff" }} />
        <button onClick={enviar} disabled={loading || !msg.trim()} className="px-4 py-2 font-space text-[9px] font-bold cursor-pointer disabled:opacity-30"
          style={{ background: "rgba(52,211,153,0.1)", border: "1px solid #34d39930", color: "#34d399", borderRadius: 6 }}>ENVIAR</button>
      </div>
    </div>
  );
}
