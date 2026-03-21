import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

function SeccionInconsistencias({ data, onResolver }: { data: any; onResolver: () => void }) {
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const resolver = async (item: any, accion: string, nota?: string, valor_nuevo?: any) => {
    setResolviendo(item.id);
    try {
      const r = await fetch("/api/sistema/resolver-inconsistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, tipo: item.tipo, accion, nota, valor_nuevo, contrato: item.contrato }),
      });
      const result = await r.json();
      setCerrados(prev => new Set(prev).add(item.id));
      setFeedbackMsg(`Feedback guardado (${result.feedback_acumulado || 0} acumulados). Alerta cerrada.`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch {
      setFeedbackMsg("Error al guardar feedback");
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
    setResolviendo(null);
    onResolver();
  };

  if (!data?.items?.length) {
    return (
      <div className="py-20 text-center" data-testid="sin-inconsistencias">
        <div className="font-space text-[14px] tracking-wider mb-2" style={{ color: "#00ff88" }}>
          SIN INCONSISTENCIAS ACTIVAS
        </div>
        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
          El sistema opera dentro de parametros normales. Las nuevas inconsistencias apareceran aqui automaticamente.
        </div>
      </div>
    );
  }

  const colores: Record<string, string> = {
    CRITICO: "#ff2244",
    SOSPECHOSO: "#ff8c00",
    REVISAR: "#ffcc00",
    INFO: "#00d4ff",
  };

  const itemsVisibles = (data?.items || []).filter((i: any) => !cerrados.has(i.id));

  return (
    <div className="space-y-3">
      {feedbackMsg && (
        <div className="flex items-center gap-3 px-4 py-2 mb-2" style={{ background: "rgba(255,107,53,0.08)", borderLeft: "3px solid #ff6b35" }} data-testid="feedback-msg">
          <span className="font-exo text-[11px]" style={{ color: "#ff6b35" }}>{feedbackMsg}</span>
          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>El feedback se acumula sin aplicar cambios al sistema.</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "CRITICOS", n: itemsVisibles.filter((i: any) => i.nivel === "CRITICO").length, color: "#ff2244" },
          { label: "SOSPECHOSOS", n: itemsVisibles.filter((i: any) => i.nivel === "SOSPECHOSO").length, color: "#ff8c00" },
          { label: "REVISAR", n: itemsVisibles.filter((i: any) => i.nivel === "REVISAR").length, color: "#ffcc00" },
          { label: "INFORMATIVOS", n: itemsVisibles.filter((i: any) => i.nivel === "INFO").length, color: "#00d4ff" },
        ].map((s) => (
          <div key={s.label} className="p-3 text-center" style={{ background: "#060d14", border: `1px solid ${s.color}20`, borderTop: `2px solid ${s.color}` }}>
            <div className="font-space text-[24px] font-bold" style={{ color: s.color }}>{s.n}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {itemsVisibles.length === 0 && cerrados.size > 0 && (
        <div className="py-10 text-center">
          <div className="font-space text-[14px] tracking-wider mb-2" style={{ color: "#00ff88" }}>TODAS LAS INCONSISTENCIAS RESUELTAS</div>
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            {cerrados.size} feedback{cerrados.size > 1 ? 's' : ''} guardados como aprendizaje. Se acumulan para revision futura.
          </div>
        </div>
      )}

      {itemsVisibles.map((item: any) => {
        const color = colores[item.nivel] || "#3a6080";
        return (
          <div key={item.id} className="border p-4" style={{ borderColor: `${color}30`, background: `${color}05`, borderLeft: `3px solid ${color}` }} data-testid={`inconsistencia-${item.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-exo text-[8px] font-bold px-2 py-0.5" style={{ color, border: `1px solid ${color}40`, background: `${color}15` }}>{item.nivel}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{item.tipo.replace(/_/g, " ")}</span>
                  {item.contrato && (
                    <span className="font-exo text-[8px] px-1.5" style={{ color: "#00d4ff", border: "1px solid #00d4ff20" }}>{item.contrato}</span>
                  )}
                </div>
                <div className="font-space text-[12px] font-bold mb-1" style={{ color: "#c8e8ff" }}>{item.titulo}</div>
                <div className="font-rajdhani text-[12px]" style={{ color: "#3a6080" }}>{item.descripcion}</div>
              </div>
              {item.valor !== null && item.valor !== undefined && (
                <div className="text-right flex-shrink-0">
                  <div className="font-space text-[22px] font-bold" style={{ color }}>
                    {typeof item.valor === "number" ? (item.valor > 0 ? `+${item.valor}` : item.valor) : item.valor}
                    {item.tipo === "BALANCE_ANOMALO" ? "%" : ""}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              {item.acciones.map((accion: string) => (
                <button
                  key={accion}
                  onClick={() => {
                    if (accion === "FALSA_ALARMA" || accion === "CONFIRMAR_NORMAL") {
                      const nota = window.prompt("Motivo (opcional):");
                      resolver(item, accion, nota || undefined);
                    } else if (accion === "AJUSTAR" || accion === "ASIGNAR_NOMBRE") {
                      const valor = window.prompt("Nuevo valor:");
                      if (valor) resolver(item, accion, undefined, { valor });
                    } else {
                      resolver(item, accion);
                    }
                  }}
                  disabled={resolviendo === item.id}
                  className="font-exo text-[9px] font-bold px-3 py-1.5 border cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
                  style={{
                    borderColor:
                      accion === "CONFIRMAR" || accion === "CONFIRMAR_NORMAL" ? "#00ff8840" :
                      accion === "FALSA_ALARMA" || accion === "IGNORAR" ? "#3a608040" :
                      accion === "ESCALAR" || accion === "INVESTIGAR" ? "#ff224440" : "#ff6b3540",
                    color:
                      accion === "CONFIRMAR" || accion === "CONFIRMAR_NORMAL" ? "#00ff88" :
                      accion === "FALSA_ALARMA" || accion === "IGNORAR" ? "#3a6080" :
                      accion === "ESCALAR" || accion === "INVESTIGAR" ? "#ff2244" : "#ff6b35",
                  }}
                  data-testid={`btn-accion-${accion.toLowerCase()}`}
                >
                  {resolviendo === item.id ? "..." : accion.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SeccionCalibracion({ parametros }: { parametros: any }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoValor, setNuevoValor] = useState("");

  const aplicarAjuste = async (scopeTipo: string, scopeId: string, parametro: string) => {
    await fetch("/api/feedback/alerta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alertaTipo: "AJUSTE_MANUAL_CEO",
        entidadTipo: scopeTipo,
        entidadId: scopeId,
        contrato: "",
        decision: "AJUSTAR",
        parametroAfectado: parametro,
        ajusteManual: parseFloat(nuevoValor),
      }),
    });
    setEditando(null);
    setNuevoValor("");
  };

  if (!parametros) {
    return (
      <div className="py-10 text-center font-exo text-[11px]" style={{ color: "#3a6080" }}>
        Cargando parametros...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 border" style={{ borderColor: "#0d2035", background: "#060d14" }}>
        <div className="font-exo text-[8px] tracking-wider uppercase mb-3" style={{ color: "#3a6080" }}>ESTADO DE CALIBRACION GLOBAL</div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "EXPERTA", n: parametros.resumen?.confianza_experta || 0, color: "#00ff88", desc: "200+ muestras" },
            { label: "ALTA", n: parametros.resumen?.confianza_alta || 0, color: "#00d4ff", desc: "50+ muestras" },
            { label: "MEDIA", n: parametros.resumen?.confianza_media || 0, color: "#ffcc00", desc: "10+ muestras" },
            { label: "BAJA", n: parametros.resumen?.confianza_baja || 0, color: "#3a6080", desc: "<10 muestras" },
          ].map((c) => (
            <div key={c.label} className="text-center p-3" style={{ background: "#0a1520", border: `1px solid ${c.color}20` }}>
              <div className="font-space text-[22px] font-bold" style={{ color: c.color }}>{c.n}</div>
              <div className="font-exo text-[8px] font-bold" style={{ color: c.color }}>{c.label}</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border" style={{ borderColor: "#0d2035" }}>
        <div className="grid grid-cols-6 px-4 py-2" style={{ background: "#0a1520" }}>
          {["CORREDOR/ENTIDAD", "CONTRATO", "MUESTRAS", "CONFIANZA", "UMBRAL ACTUAL", "ACCION"].map((h) => (
            <div key={h} className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{h}</div>
          ))}
        </div>
        {(parametros.por_corredor || []).map((param: any) => {
          const confianzaColor: Record<string, string> = { EXPERTA: "#00ff88", ALTA: "#00d4ff", MEDIA: "#ffcc00", BAJA: "#3a6080" };
          const color = confianzaColor[param.confianza] || "#3a6080";
          const paramKey = `${param.scope_id}_${param.parametro}`;
          const estaEditando = editando === paramKey;

          return (
            <div key={paramKey} className="grid grid-cols-6 px-4 py-3 border-t items-center" style={{ borderColor: "#0d2035" }}>
              <div className="font-exo text-[10px] truncate pr-2" style={{ color: "#c8e8ff" }}>{param.nombre || param.scope_id}</div>
              <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{param.contrato || "--"}</div>
              <div className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{param.total_muestras}</div>
              <div>
                <span className="font-exo text-[9px] font-bold px-2 py-0.5" style={{ color, border: `1px solid ${color}30` }}>{param.confianza}</span>
              </div>
              <div>
                {estaEditando ? (
                  <input
                    type="number"
                    step="0.01"
                    value={nuevoValor}
                    onChange={(e) => setNuevoValor(e.target.value)}
                    className="w-20 px-2 py-1 font-space text-[10px] bg-transparent border outline-none"
                    style={{ borderColor: "#ff6b35", color: "#ff6b35" }}
                    autoFocus
                    data-testid="input-umbral"
                  />
                ) : (
                  <span className="font-space text-[11px] font-bold" style={{ color: "#ffcc00" }}>
                    {param.umbral_anomalia?.toFixed(2)} km/L
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {estaEditando ? (
                  <>
                    <button
                      onClick={() => aplicarAjuste(param.scope_tipo, param.scope_id, param.parametro)}
                      className="font-exo text-[9px] px-2 py-1 border cursor-pointer"
                      style={{ borderColor: "#00ff8840", color: "#00ff88" }}
                      data-testid="btn-confirmar-ajuste"
                    >OK</button>
                    <button
                      onClick={() => { setEditando(null); setNuevoValor(""); }}
                      className="font-exo text-[9px] px-2 py-1 border cursor-pointer"
                      style={{ borderColor: "#3a608040", color: "#3a6080" }}
                    >X</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditando(paramKey); setNuevoValor(param.umbral_anomalia?.toFixed(2) || ""); }}
                    className="font-exo text-[9px] px-2 py-1 border cursor-pointer transition-all hover:border-[#ff6b35]"
                    style={{ borderColor: "#0d2035", color: "#3a6080" }}
                    data-testid={`btn-ajustar-${paramKey}`}
                  >Ajustar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeccionDialogoIA({ inconsistencias }: { inconsistencias: any }) {
  const [mensajes, setMensajes] = useState<{ rol: "sistema" | "ceo"; texto: string; timestamp: Date }[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (mensajes.length === 0) {
      cargarMensajeInicial();
    }
  }, []);

  const cargarMensajeInicial = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/sistema/resumen-ia");
      if (!res.ok) throw new Error("Error");
      const data = await res.json();
      setMensajes([{ rol: "sistema", texto: data.resumen || "Sistema inicializando...", timestamp: new Date() }]);
    } catch {
      setMensajes([{ rol: "sistema", texto: "Sistema conectado. Puedes hacerme preguntas sobre el estado operativo.", timestamp: new Date() }]);
    }
    setCargando(false);
  };

  const enviar = async () => {
    if (!input.trim()) return;
    const pregunta = input;
    setInput("");
    setMensajes((prev) => [...prev, { rol: "ceo", texto: pregunta, timestamp: new Date() }]);
    setCargando(true);
    try {
      const res = await fetch("/api/sistema/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, contexto: "sistema_inteligente" }),
      });
      const data = await res.json();
      setMensajes((prev) => [...prev, { rol: "sistema", texto: data.respuesta, timestamp: new Date() }]);
    } catch {
      setMensajes((prev) => [...prev, { rol: "sistema", texto: "Error al conectar con el sistema.", timestamp: new Date() }]);
    }
    setCargando(false);
  };

  const sugerencias = [
    inconsistencias?.items?.find((i: any) => i.tipo === "BALANCE_ANOMALO")
      ? `Por que ${inconsistencias.items.find((i: any) => i.tipo === "BALANCE_ANOMALO")?.titulo}?`
      : null,
    "Que aprendiste esta semana?",
    "En que corredor tienes mas confianza?",
    "Que necesitas que yo revise?",
    "Cuales alertas fueron falsas alarmas?",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="border p-4 space-y-3 min-h-[300px] max-h-[400px] overflow-y-auto" style={{ borderColor: "#0d2035", background: "#060d14" }} data-testid="dialogo-mensajes">
        {cargando && mensajes.length === 0 && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#ff6b35" }} />
            <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>El sistema esta preparando su resumen...</span>
          </div>
        )}
        {mensajes.map((msg, i) => (
          <div key={i} className={`flex ${msg.rol === "ceo" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] p-3" style={{
              background: msg.rol === "ceo" ? "rgba(255,107,53,0.08)" : "#0a1520",
              borderLeft: msg.rol === "sistema" ? "2px solid #ff6b35" : "none",
              borderRight: msg.rol === "ceo" ? "2px solid #ff6b35" : "none",
            }}>
              <div className="font-exo text-[8px] mb-1" style={{ color: "#3a6080" }}>
                {msg.rol === "sistema" ? "SISTEMA ADAPTATIVO" : "CEO"}
                {" -- "}
                {msg.timestamp.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="font-rajdhani text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{msg.texto}</div>
            </div>
          </div>
        ))}
        {cargando && mensajes.length > 0 && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#ff6b35" }} />
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Analizando...</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {sugerencias.map((s, i) => (
          <button key={i} onClick={() => setInput(s)} className="font-exo text-[9px] px-3 py-1.5 border cursor-pointer transition-all hover:border-[#ff6b35]" style={{ borderColor: "#0d2035", color: "#3a6080" }} data-testid={`btn-sugerencia-${i}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Pregunta al sistema o pidele que explique algo..."
          className="flex-1 px-4 py-3 bg-transparent border outline-none font-rajdhani text-[13px] transition-all"
          style={{ borderColor: "#0d2035", color: "#c8e8ff" }}
          disabled={cargando}
          data-testid="input-dialogo"
        />
        <button
          onClick={enviar}
          disabled={cargando || !input.trim()}
          className="px-5 py-3 font-space text-[11px] font-bold cursor-pointer border transition-all hover:opacity-80 disabled:opacity-40"
          style={{ borderColor: "#ff6b35", color: "#ff6b35", background: "rgba(255,107,53,0.08)" }}
          data-testid="btn-enviar-dialogo"
        >ENVIAR</button>
      </div>
    </div>
  );
}

function SeccionReporte({ reporte }: { reporte: any }) {
  const [generando, setGenerando] = useState(false);

  const generarReporte = async () => {
    setGenerando(true);
    await fetch("/api/sistema/generar-reporte-semanal", { method: "POST" });
    setGenerando(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>REPORTE SEMANAL DEL SISTEMA</div>
          {reporte?.fecha && (
            <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
              Generado: {new Date(reporte.fecha).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          )}
        </div>
        <button
          onClick={generarReporte}
          disabled={generando}
          className="font-exo text-[10px] px-4 py-2 border cursor-pointer transition-all hover:border-[#ff6b35] disabled:opacity-40"
          style={{ borderColor: "#0d2035", color: "#3a6080" }}
          data-testid="btn-generar-reporte"
        >
          {generando ? (
            <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Generando...</span>
          ) : "Generar nuevo"}
        </button>
      </div>

      {!reporte ? (
        <div className="py-12 text-center border" style={{ borderColor: "#0d2035", background: "#060d14" }}>
          <div className="font-exo text-[11px] mb-2" style={{ color: "#3a6080" }}>Sin reporte generado esta semana</div>
          <button onClick={generarReporte} className="font-exo text-[10px] px-4 py-2 border cursor-pointer mt-2" style={{ borderColor: "#ff6b3540", color: "#ff6b35" }} data-testid="btn-generar-primer-reporte">
            Generar ahora
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {[
            { key: "aprendi", titulo: "QUE APRENDI ESTA SEMANA" },
            { key: "corregi", titulo: "QUE CORREGI" },
            { key: "preocupa", titulo: "QUE ME PREOCUPA" },
            { key: "necesito", titulo: "QUE NECESITO QUE REVISES" },
            { key: "proximos", titulo: "PROXIMOS PASOS" },
          ].map((seccion) =>
            reporte[seccion.key] && (
              <div key={seccion.key} className="p-4 border" style={{ borderColor: "#0d2035", background: "#060d14", borderLeft: "3px solid #ff6b35" }}>
                <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#ff6b35" }}>{seccion.titulo}</div>
                <div className="font-rajdhani text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{reporte[seccion.key]}</div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function SistemaInteligente() {
  const [seccionActiva, setSeccionActiva] = useState<"inconsistencias" | "calibracion" | "dialogo" | "reporte">("inconsistencias");

  const { data: inconsistencias, refetch } = useQuery<any>({
    queryKey: ["/api/sistema/inconsistencias"],
    queryFn: async () => {
      const r = await fetch("/api/sistema/inconsistencias");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
    refetchInterval: 60000,
  });

  const { data: parametros } = useQuery<any>({
    queryKey: ["/api/aprendizaje/parametros"],
    queryFn: async () => {
      const r = await fetch("/api/aprendizaje/parametros");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const { data: reporte } = useQuery<any>({
    queryKey: ["/api/sistema/reporte-semanal"],
    queryFn: async () => {
      const r = await fetch("/api/sistema/reporte-semanal");
      if (!r.ok) return null;
      return r.json();
    },
  });

  return (
    <div className="min-h-screen" style={{ background: "#020508" }} data-testid="sistema-inteligente-page">
      <div className="px-6 py-5 border-b" style={{ borderColor: "#0d2035", borderTop: "3px solid #ff6b35" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-space text-[22px] font-bold tracking-[0.2em]" style={{ color: "#ff6b35" }}>SISTEMA INTELIGENTE</div>
            <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Espacio de calibracion y dialogo CEO -- Sistema Adaptativo</div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="font-space text-[24px] font-bold" style={{
                color: (inconsistencias?.criticos || 0) > 0 ? "#ff2244" : "#00ff88",
                animation: (inconsistencias?.criticos || 0) > 0 ? "blinkFast 0.6s infinite" : undefined,
              }} data-testid="counter-criticos">
                {inconsistencias?.criticos || 0}
              </div>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>criticos</div>
            </div>
            <div className="text-center">
              <div className="font-space text-[24px] font-bold" style={{ color: "#ffcc00" }} data-testid="counter-pendientes">
                {inconsistencias?.total || 0}
              </div>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>pendientes</div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-4">
          {[
            { id: "inconsistencias" as const, label: "INCONSISTENCIAS", badge: inconsistencias?.total },
            { id: "calibracion" as const, label: "CALIBRACION", badge: null },
            { id: "dialogo" as const, label: "DIALOGO IA", badge: null },
            { id: "reporte" as const, label: "REPORTE SEMANAL", badge: null },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSeccionActiva(t.id)}
              className="flex items-center gap-2 font-exo text-[10px] font-bold px-4 py-2 border cursor-pointer transition-all"
              style={{
                borderColor: seccionActiva === t.id ? "#ff6b35" : "#0d2035",
                color: seccionActiva === t.id ? "#ff6b35" : "#3a6080",
                background: seccionActiva === t.id ? "rgba(255,107,53,0.08)" : "transparent",
              }}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
              {(t.badge ?? 0) > 0 && (
                <span className="font-space text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {seccionActiva === "inconsistencias" && <SeccionInconsistencias data={inconsistencias} onResolver={() => refetch()} />}
        {seccionActiva === "calibracion" && <SeccionCalibracion parametros={parametros} />}
        {seccionActiva === "dialogo" && <SeccionDialogoIA inconsistencias={inconsistencias} />}
        {seccionActiva === "reporte" && <SeccionReporte reporte={reporte} />}
      </div>
    </div>
  );
}
