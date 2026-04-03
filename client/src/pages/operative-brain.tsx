import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, Truck, MapPin, TrendingUp, BarChart3, Activity, Heart, Zap, Send } from "lucide-react";

export default function OperativeBrain() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/brain/resumen-ejecutivo"],
    queryFn: () => fetch("/api/brain/resumen-ejecutivo").then(r => r.json()),
    refetchInterval: 5 * 60000,
  });

  const t = data?.totales || {};
  const contratos = data?.contratos || [];
  const tendencia = data?.tendencia_7d || [];

  const maxKm = Math.max(...tendencia.map((d: any) => parseInt(d.km || 0)), 1);

  return (
    <div className="min-h-screen p-4 space-y-4" style={{ background: "#020508" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5" style={{ color: "#a855f7" }} />
            <span className="font-space text-[16px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>RESUMEN EJECUTIVO</span>
          </div>
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            Multi-contrato · {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#a855f7" }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3">
            {[
              { icon: Activity, label: "GPS ACTIVOS", value: `${t.camiones_activos || 0}/${t.camiones_total || 0}`, color: "#00d4ff" },
              { icon: MapPin, label: "VIAJES HOY", value: t.viajes_hoy || 0, color: "#a855f7" },
              { icon: BarChart3, label: "VIAJES MES", value: (t.viajes_mes || 0).toLocaleString(), color: "#00ff88" },
              { icon: TrendingUp, label: "KM MES", value: (t.km_mes || 0).toLocaleString(), color: "#fbbf24" },
              { icon: Truck, label: "CONTRATOS", value: t.contratos_activos || 0, color: "#f97316" },
            ].map(k => (
              <div key={k.label} className="text-center p-4 rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.color}` }}>
                <k.icon className="w-4 h-4 mx-auto mb-2" style={{ color: k.color, opacity: 0.5 }} />
                <div className="font-space text-[22px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
                <div className="font-exo text-[7px] tracking-[0.12em] uppercase mt-2" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {tendencia.length > 1 && (
            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#a855f7" }}>ACTIVIDAD ÚLTIMOS 7 DÍAS</div>
              <div className="flex items-end gap-1" style={{ height: 80 }}>
                {tendencia.map((d: any, i: number) => {
                  const km = parseInt(d.km || 0);
                  const h = Math.max(4, (km / maxKm) * 70);
                  const dia = new Date(d.dia).toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
                  const isToday = i === tendencia.length - 1;
                  return (
                    <div key={d.dia} className="flex-1 flex flex-col items-center gap-1">
                      <span className="font-space text-[7px]" style={{ color: "#3a6080" }}>{parseInt(d.viajes)}</span>
                      <div className="w-full rounded-t" style={{
                        height: h,
                        background: isToday ? "linear-gradient(to top, #a855f7, #c084fc)" : "linear-gradient(to top, #0d2035, #1a3a55)",
                        border: isToday ? "1px solid #a855f7" : "1px solid #0d203580",
                      }} />
                      <span className="font-exo text-[6px] uppercase" style={{ color: isToday ? "#a855f7" : "#3a6080" }}>{dia}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>viajes/día</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>
                  Promedio: {Math.round(tendencia.reduce((s: number, d: any) => s + parseInt(d.viajes || 0), 0) / tendencia.length)} viajes · {Math.round(tendencia.reduce((s: number, d: any) => s + parseInt(d.km || 0), 0) / tendencia.length).toLocaleString()} km/día
                </span>
              </div>
            </div>
          )}

          <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
              <span className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#a855f7" }}>CONTRATOS ACTIVOS</span>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ background: "#0d2035" }}>
                  {["CONTRATO", "CAM", "HOY", "SEMANA", "MES", "KM TOTAL", "KM PROM", "FACTURACIÓN"].map(h => (
                    <th key={h} className="font-exo text-[7px] tracking-wider font-bold text-left px-3 py-2" style={{ color: "#a855f7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contratos.map((c: any, i: number) => (
                    <tr key={c.contrato} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                      <td className="px-3 py-2">
                        <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.contrato}</span>
                      </td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.camiones}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-space text-[10px] font-bold" style={{ color: c.viajes_hoy > 0 ? "#00ff88" : "#3a6080" }}>{c.viajes_hoy}</span>
                        </div>
                      </td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.viajes_semana}</td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.viajes_mes}</td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{(c.km_total || 0).toLocaleString()}</td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.km_prom}</td>
                      <td className="px-3 py-2">
                        {c.billing ? (
                          <div className="flex items-center gap-2">
                            <span className="font-space text-[10px] font-bold" style={{ color: c.billing.facturables > 0 ? "#00ff88" : "#ffcc00" }}>
                              {c.billing.facturables}/{c.billing.total}
                            </span>
                            {c.billing.monto > 0 && (
                              <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#00ff88", background: "#00ff8810" }}>
                                ${(c.billing.monto / 1000000).toFixed(1)}M
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-exo text-[8px]" style={{ color: "#3a608060" }}>—</span>
                        )}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>

            <div className="px-4 py-2 flex justify-between" style={{ background: "#0a1520", borderTop: "1px solid #0d2035" }}>
              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                {contratos.length} contratos · {contratos.reduce((s: number, c: any) => s + c.camiones, 0)} camiones
              </span>
              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                {(contratos.reduce((s: number, c: any) => s + c.km_total, 0)).toLocaleString()} km totales este mes
              </span>
            </div>
          </div>

          {contratos.filter((c: any) => c.billing).length > 0 && (
            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #00ff8830" }}>
              <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#00ff88" }}>FACTURACIÓN T-1</div>
              <div className="grid grid-cols-2 gap-3">
                {contratos.filter((c: any) => c.billing).map((c: any) => {
                  const pct = c.billing.total > 0 ? Math.round(c.billing.facturables / c.billing.total * 100) : 0;
                  const pctColor = pct >= 90 ? "#00ff88" : pct >= 70 ? "#fbbf24" : pct >= 50 ? "#f97316" : "#ff2244";
                  return (
                    <div key={c.contrato} className="p-3 rounded-lg" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.contrato}</span>
                        <span className="font-space text-[14px] font-bold" style={{ color: pctColor }}>{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pctColor }} />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.billing.facturables} de {c.billing.total} viajes</span>
                        {c.billing.monto > 0 && (
                          <span className="font-exo text-[8px] font-bold" style={{ color: "#00ff88" }}>${(c.billing.monto).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <PanelAgentes />
      <PanelGerenteOps />
      <PanelArquitecto />
    </div>
  );
}

function PanelAgentes() {
  const [filtroAgente, setFiltroAgente] = useState<string | null>(null);
  const [filtroPrioridad, setFiltroPrioridad] = useState<string | null>(null);
  const [verConversacion, setVerConversacion] = useState<string | null>(null);
  const [msgExpandido, setMsgExpandido] = useState<number | null>(null);

  const { data } = useQuery<any>({ queryKey: ["/api/agentes/estado"], queryFn: () => fetch("/api/agentes/estado").then(r => r.json()), refetchInterval: 60000 });

  const queryParams = new URLSearchParams({ limite: "30" });
  if (filtroAgente) queryParams.set("de", filtroAgente);
  if (filtroPrioridad) queryParams.set("prioridad", filtroPrioridad);
  if (!filtroAgente) queryParams.set("para", "");
  const { data: msgsData, refetch } = useQuery<any>({
    queryKey: ["/api/agentes/mensajes", filtroAgente, filtroPrioridad],
    queryFn: () => fetch(`/api/agentes/mensajes?${queryParams.toString()}`).then(r => r.json()),
    refetchInterval: 30000
  });

  const { data: convData } = useQuery<any>({
    queryKey: ["/api/agentes/conversacion", verConversacion],
    queryFn: () => fetch(`/api/agentes/conversacion/${verConversacion}/agente-ceo`).then(r => r.json()),
    enabled: !!verConversacion, staleTime: 30000
  });

  const msgs = msgsData?.mensajes || [];
  const stats = msgsData?.stats || {};
  const colorTipo = (t: string) => ({ MONITOR: "#00d4ff", ANALISTA: "#a855f7", PREDICTOR: "#ff6b35", REPORTERO: "#00ff88", GESTOR: "#ffcc00", CEO: "#ff2244", ARQUITECTO: "#34d399", CONTRATO: "#fbbf24" }[t] || "#3a6080");
  const colorAgente = (id: string) => {
    if (id?.includes("monitor")) return "#00d4ff";
    if (id?.includes("analista")) return "#a855f7";
    if (id?.includes("predictor")) return "#ff6b35";
    if (id?.includes("gestor")) return "#ffcc00";
    if (id?.includes("ceo")) return "#ff2244";
    if (id?.includes("gerente")) return "#fbbf24";
    if (id?.includes("admin") || id?.includes("cencosud")) return "#00d4ff";
    if (id?.includes("contrato")) return "#fbbf24";
    if (id?.includes("reportero")) return "#00ff88";
    return "#3a6080";
  };

  return (
    <div style={{ background: "#060d14", border: "1px solid #00d4ff30", borderTop: "2px solid #00d4ff", borderRadius: 8 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>CENTRO DE COMUNICACIONES</span>
          {stats.no_leidos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{stats.no_leidos}</span>}
          {stats.criticos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{stats.criticos} CRIT</span>}
          {stats.altos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ffcc0020", color: "#ffcc00" }}>{stats.altos} ALTA</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{stats.total_72h || 0} mensajes 72h</span>
          <button onClick={() => { fetch("/api/agentes/mensajes/leer-todos", { method: "POST" }).then(() => refetch()); }} className="font-exo text-[8px] cursor-pointer px-2 py-1 rounded" style={{ color: "#3a6080", border: "1px solid #0d2035" }}>Leer todos</button>
        </div>
      </div>

      <div className="grid grid-cols-11 gap-1 p-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <button onClick={() => { setFiltroAgente(null); setVerConversacion(null); }} className="text-center p-1 cursor-pointer rounded" style={{ background: !filtroAgente ? "#00d4ff10" : "#0a1520", border: !filtroAgente ? "1px solid #00d4ff30" : "1px solid transparent" }}>
          <div className="font-exo text-[6px] uppercase font-bold" style={{ color: !filtroAgente ? "#00d4ff" : "#3a6080" }}>TODOS</div>
        </button>
        {(data?.agentes || []).map((a: any) => {
          const min = a.ultimo_ciclo ? Math.round((Date.now() - new Date(a.ultimo_ciclo).getTime()) / 60000) : null;
          const ok = min !== null && min < 60;
          const selected = filtroAgente === a.id;
          return (
            <button key={a.id} onClick={() => { setFiltroAgente(selected ? null : a.id); setVerConversacion(selected ? null : a.id); }}
              className="text-center p-1 cursor-pointer rounded transition-all" style={{ background: selected ? `${colorTipo(a.tipo)}10` : "#0a1520", borderTop: `2px solid ${ok ? colorTipo(a.tipo) : "#3a6080"}`, border: selected ? `1px solid ${colorTipo(a.tipo)}40` : "1px solid transparent" }}>
              <div className="font-exo text-[6px] uppercase font-bold truncate" style={{ color: ok ? colorTipo(a.tipo) : "#3a6080" }}>{a.nombre?.split(" ").slice(-1)[0]?.substring(0, 8)}</div>
              <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{min !== null ? `${min}m` : "-"} · {a.ciclos_completados}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5" style={{ borderBottom: "1px solid #0d2035" }}>
        <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Filtrar:</span>
        {[null, "CRITICA", "ALTA", "NORMAL"].map(p => (
          <button key={p || "ALL"} onClick={() => setFiltroPrioridad(p)} className="font-exo text-[7px] px-2 py-0.5 cursor-pointer rounded"
            style={{ color: filtroPrioridad === p ? (p === "CRITICA" ? "#ff2244" : p === "ALTA" ? "#ffcc00" : "#00d4ff") : "#3a6080",
              background: filtroPrioridad === p ? (p === "CRITICA" ? "#ff224410" : p === "ALTA" ? "#ffcc0010" : "#00d4ff10") : "transparent",
              border: `1px solid ${filtroPrioridad === p ? "#0d2035" : "transparent"}` }}>
            {p || "TODOS"}
          </button>
        ))}
        {filtroAgente && (
          <span className="font-exo text-[7px] ml-2" style={{ color: colorAgente(filtroAgente) }}>
            De: {(data?.agentes || []).find((a: any) => a.id === filtroAgente)?.nombre || filtroAgente}
          </span>
        )}
      </div>

      {verConversacion && convData?.mensajes?.length > 0 && (
        <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035", background: "#0a151830" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-exo text-[7px] uppercase tracking-wider" style={{ color: colorAgente(verConversacion) }}>
              Conversacion con {(data?.agentes || []).find((a: any) => a.id === verConversacion)?.nombre}
            </span>
            <button onClick={() => setVerConversacion(null)} className="font-exo text-[7px] cursor-pointer" style={{ color: "#3a6080" }}>cerrar</button>
          </div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {convData.mensajes.slice(0, 8).reverse().map((m: any) => (
              <div key={m.id} className={`flex ${m.de_agente === verConversacion ? "justify-start" : "justify-end"}`}>
                <div className="max-w-[85%] px-2 py-1 rounded" style={{ background: m.de_agente === verConversacion ? "#0a1520" : `${colorAgente(verConversacion)}10`, border: `1px solid ${m.de_agente === verConversacion ? "#0d2035" : colorAgente(verConversacion) + "30"}` }}>
                  <div className="font-exo text-[7px]" style={{ color: m.de_agente === verConversacion ? colorAgente(verConversacion) : "#3a6080" }}>
                    {m.nombre_agente || m.de_agente} · {new Date(m.created_at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit" })}
                  </div>
                  <div className="font-exo text-[8px] font-bold" style={{ color: "#c8e8ff" }}>{m.titulo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-auto" style={{ maxHeight: verConversacion ? 200 : 280 }}>
        {msgs.map((m: any) => (
          <div key={m.id} onClick={() => { fetch(`/api/agentes/mensajes/${m.id}/leer`, { method: "POST" }).then(() => refetch()); setMsgExpandido(msgExpandido === m.id ? null : m.id); }}
            className="px-4 py-2 border-b cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]"
            style={{ borderColor: "#0a1520", borderLeft: `3px solid ${!m.leido ? (m.prioridad === "CRITICA" ? "#ff2244" : m.prioridad === "ALTA" ? "#ffcc00" : "#00d4ff") : "transparent"}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-exo text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ color: colorAgente(m.de_agente), border: `1px solid ${colorAgente(m.de_agente)}30` }}>{m.nombre_agente || m.de_agente}</span>
                <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>→ {m.nombre_destino || m.para_agente}</span>
                {m.prioridad === "CRITICA" && <span className="font-exo text-[6px] font-bold px-1 rounded" style={{ color: "#ff2244", background: "#ff224415" }}>CRITICO</span>}
                {m.prioridad === "ALTA" && <span className="font-exo text-[6px] font-bold px-1 rounded" style={{ color: "#ffcc00", background: "#ffcc0015" }}>ALTA</span>}
              </div>
              <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{new Date(m.created_at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
            </div>
            <div className="font-exo text-[9px] font-bold mt-1 truncate" style={{ color: "#c8e8ff" }}>{m.titulo}</div>
            {msgExpandido === m.id ? (
              <div className="font-exo text-[8px] mt-1 whitespace-pre-wrap" style={{ color: "#c8e8ff", opacity: 0.8 }}>{m.contenido}</div>
            ) : (
              <div className="font-exo text-[8px] mt-0.5 line-clamp-1" style={{ color: "#3a6080" }}>{m.contenido?.substring(0, 120)}</div>
            )}
          </div>
        ))}
        {msgs.length === 0 && <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin mensajes</div>}
      </div>
    </div>
  );
}

function PanelGerenteOps() {
  const [vista, setVista] = useState<"kpis" | "memoria" | "decisiones">("kpis");
  const { data: estado } = useQuery<any>({ queryKey: ["/api/gerente/estado"], queryFn: () => fetch("/api/gerente/estado").then(r => r.json()), staleTime: 5 * 60000 });
  const { data: puntos } = useQuery<any>({ queryKey: ["/api/gerente/puntos-resueltos"], queryFn: () => fetch("/api/gerente/puntos-resueltos").then(r => r.json()), staleTime: 10 * 60000 });
  const { data: salud } = useQuery<any>({ queryKey: ["/api/gerente/salud"], queryFn: () => fetch("/api/gerente/salud").then(r => r.json()), refetchInterval: 120000 });
  const { data: memoriaData } = useQuery<any>({ queryKey: ["/api/gerente/memoria"], queryFn: () => fetch("/api/gerente/memoria").then(r => r.json()), staleTime: 5 * 60000, enabled: vista === "memoria" });
  const { data: decisionesData } = useQuery<any>({ queryKey: ["/api/gerente/decisiones"], queryFn: () => fetch("/api/gerente/decisiones").then(r => r.json()), staleTime: 2 * 60000, enabled: vista === "decisiones" });

  const aprendizaje = estado?.aprendizaje || [];
  const parametros = estado?.parametros || [];
  const totalMejorado = aprendizaje.reduce((s: number, a: any) => s + parseInt(a.viajes_mejorados || 0), 0);
  const saludColor = (salud?.salud || 0) >= 80 ? "#00ff88" : (salud?.salud || 0) >= 50 ? "#ffcc00" : "#ff2244";

  return (
    <div style={{ background: "#060d14", border: "1px solid #fbbf2430", borderTop: "2px solid #fbbf24", borderRadius: 8 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#fbbf24" }}>GERENTE DE OPERACIONES v2</span>
          {salud && (
            <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${saludColor}15`, color: saludColor, border: `1px solid ${saludColor}30` }}>
              <Heart className="w-2.5 h-2.5" /> {salud.salud}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {(["kpis", "memoria", "decisiones"] as const).map(v => (
              <button key={v} onClick={() => setVista(v)} className="font-exo text-[7px] uppercase px-2 py-1 cursor-pointer"
                style={{ color: vista === v ? "#fbbf24" : "#3a6080", background: vista === v ? "#fbbf2410" : "transparent", border: `1px solid ${vista === v ? "#fbbf2430" : "#0d2035"}`, borderRadius: 3 }}>
                {v === "kpis" ? "KPIs" : v === "memoria" ? "Memoria" : "Decisiones"}
              </button>
            ))}
          </div>
          <button onClick={() => fetch("/api/gerente/ejecutar", { method: "POST" })} className="font-exo text-[8px] px-3 py-1 cursor-pointer" style={{ color: "#fbbf24", border: "1px solid #fbbf2430", borderRadius: 4 }}>Ejecutar</button>
        </div>
      </div>

      {salud && salud.problemas?.length > 0 && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035", background: `${saludColor}05` }}>
          {salud.problemas.slice(0, 3).map((p: string, i: number) => (
            <div key={i} className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>• {p}</div>
          ))}
        </div>
      )}

      {vista === "kpis" && (
        <>
          <div className="grid grid-cols-6 gap-2 p-3" style={{ borderBottom: "1px solid #0d2035" }}>
            {[
              { l: "VIAJES MEJORADOS", v: totalMejorado, c: "#00ff88" },
              { l: "RUTAS RESUELTAS", v: puntos?.pct_completamente_resuelto ? `${puntos.pct_completamente_resuelto}%` : "--", c: "#00d4ff" },
              { l: "LUGARES", v: estado?.lugares?.reduce((s: number, l: any) => s + parseInt(l.total), 0) || 0, c: "#fbbf24" },
              { l: "PARAMETROS", v: parametros.length, c: "#a78bfa" },
              { l: "MEMORIA", v: salud?.memoria_total || 0, c: "#34d399" },
              { l: "DECISIONES 24H", v: salud?.decisiones_24h || 0, c: "#f97316" },
            ].map(k => (
              <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {parametros.slice(0, 6).map((p: any) => (
              <div key={p.clave} className="flex items-center justify-between px-3 py-1.5" style={{ background: "#0a1520", borderRadius: 4, border: p.modificado_por === "GERENTE_BOT" ? "1px solid #fbbf2430" : "1px solid #0d2035" }}>
                <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{p.descripcion?.substring(0, 28) || p.clave}</span>
                <div className="flex items-center gap-1">
                  <span className="font-space text-[11px] font-bold" style={{ color: "#fbbf24" }}>{p.valor}</span>
                  {p.modificado_por === "GERENTE_BOT" && <span className="font-exo text-[6px]" style={{ color: "#fbbf24" }}>BOT</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {vista === "memoria" && (
        <div className="p-3 space-y-2 max-h-[250px] overflow-y-auto">
          {(memoriaData?.memoria || []).map((m: any) => (
            <div key={m.id} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${m.categoria === "CONTEXTO" ? "#00d4ff" : m.categoria === "REGLA" ? "#fbbf24" : m.categoria === "ERROR" ? "#ff2244" : "#00ff88"}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#fbbf24", border: "1px solid #fbbf2430" }}>{m.categoria}</span>
                  <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{m.clave}</span>
                </div>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{(m.confianza * 100).toFixed(0)}%</span>
              </div>
              <div className="font-exo text-[8px] mt-1" style={{ color: "#3a6080" }}>
                {typeof m.valor === "object" ? (m.valor.desc || JSON.stringify(m.valor).substring(0, 80)) : String(m.valor).substring(0, 80)}
              </div>
            </div>
          ))}
        </div>
      )}

      {vista === "decisiones" && (
        <div className="p-3 space-y-1.5 max-h-[250px] overflow-y-auto">
          {(decisionesData?.decisiones || []).map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${d.exito ? "#00ff88" : "#ff2244"}` }}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3" style={{ color: "#fbbf24" }} />
                  <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{d.tipo}</span>
                </div>
                <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>{d.descripcion}</div>
              </div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{new Date(d.created_at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</div>
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
    } catch { setHist(h => [...h, { rol: "ARQUITECTO", texto: "Error de conexion" }]); }
    setLoading(false);
  };

  return (
    <div style={{ background: "#060d14", border: "1px solid #34d39930", borderTop: "2px solid #34d399", borderRadius: 8 }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#34d399" }}>AGENTE ARQUITECTO</span>
        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>· Jefe tecnico · Conoce todo el sistema</span>
      </div>
      <div className="overflow-auto px-4 py-3 space-y-2" style={{ maxHeight: 220 }}>
        {hist.length === 0 && (
          <div className="text-center py-3">
            <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Preguntale sobre el sistema</div>
            <div className="flex gap-2 justify-center mt-2 flex-wrap">
              {["Como esta el sistema?", "Que detectaron los agentes?", "Que mejoras propones?"].map(s => (
                <button key={s} onClick={() => setMsg(s)} className="font-exo text-[8px] px-2 py-1 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {hist.map((h, i) => (
          <div key={i} className={`flex ${h.rol === "CEO" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] px-3 py-2" style={{ background: h.rol === "CEO" ? "rgba(52,211,153,0.1)" : "#0a1520", border: `1px solid ${h.rol === "CEO" ? "#34d39930" : "#0d2035"}`, borderRadius: 8 }}>
              <div className="font-exo text-[7px] uppercase mb-1" style={{ color: h.rol === "CEO" ? "#34d399" : "#3a6080" }}>{h.rol === "CEO" ? "TU" : "ARQUITECTO"}</div>
              <div className="font-exo text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{h.texto}</div>
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="px-3 py-2" style={{ background: "#0a1520", borderRadius: 8 }}><Loader2 className="w-4 h-4 animate-spin" style={{ color: "#34d399" }} /></div></div>}
      </div>
      <div className="px-4 pb-3 flex gap-2" style={{ borderTop: "1px solid #0d2035", paddingTop: 12 }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Habla con el Arquitecto..."
          className="flex-1 px-3 py-2 font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #34d39930", borderRadius: 6, color: "#c8e8ff" }} />
        <button onClick={enviar} disabled={loading || !msg.trim()} className="px-4 py-2 font-space text-[9px] font-bold cursor-pointer disabled:opacity-30"
          style={{ background: "rgba(52,211,153,0.1)", border: "1px solid #34d39930", color: "#34d399", borderRadius: 6 }}>ENVIAR</button>
      </div>
    </div>
  );
}
