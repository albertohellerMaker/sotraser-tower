import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle, Send } from "lucide-react";

const TEXT_DIM = "#3a6080";
const BORDER = "#0d2035";
const ORANGE = "#ff6b35";

export default function SistemaInteligente() {
  const { data: inconsistencias, refetch } = useQuery<any>({
    queryKey: ["/api/sistema/inconsistencias"],
    queryFn: async () => { const r = await fetch("/api/sistema/inconsistencias"); return r.ok ? r.json() : null; },
    refetchInterval: 60000,
  });

  // Backend ya filtra: solo BALANCE_ANOMALO con período cerrado, 24h+, 200km+, 20 snaps, balance >40%
  const pendientes = inconsistencias?.items || [];

  const hayPendientes = pendientes.length > 0;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }} data-testid="sistema-inteligente-page">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <span className="font-space text-[15px] font-bold tracking-[0.2em]" style={{ color: ORANGE }}>SISTEMA INTELIGENTE</span>
        </div>
        <span className="font-exo text-xs" style={{ color: TEXT_DIM }}>
          {hayPendientes ? `${pendientes.length} cosa${pendientes.length > 1 ? "s" : ""} necesita${pendientes.length > 1 ? "n" : ""} tu atencion` : "Sin pendientes"}
        </span>
      </div>

      {/* Contenido */}
      <div className="flex-1 flex items-center justify-center px-6">
        {hayPendientes
          ? <PendientesVista pendientes={pendientes} refetch={refetch} inconsistencias={inconsistencias} />
          : <ChatVista inconsistencias={inconsistencias} />
        }
      </div>
    </div>
  );
}

/* ── PENDIENTES: el principal arriba grande, 2 menores abajo ── */
function PendientesVista({ pendientes, refetch, inconsistencias }: { pendientes: any[]; refetch: () => void; inconsistencias: any }) {
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [resueltos, setResueltos] = useState<Set<string>>(new Set());

  const resolver = async (item: any, accion: string) => {
    setResolviendo(item.id);
    try {
      let nota: string | undefined;
      let valor_nuevo: any;
      if (accion === "FALSA_ALARMA" || accion === "CONFIRMAR_NORMAL") {
        nota = window.prompt("Motivo (opcional):") || undefined;
      } else if (accion === "AJUSTAR" || accion === "ASIGNAR_NOMBRE") {
        const v = window.prompt("Nuevo valor:");
        if (!v) { setResolviendo(null); return; }
        valor_nuevo = { valor: v };
      }
      await fetch("/api/sistema/resolver-inconsistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, tipo: item.tipo, accion, nota, valor_nuevo, contrato: item.contrato }),
      });
      setResueltos(prev => new Set(prev).add(item.id));
    } catch (e) { console.error(e); }
    setResolviendo(null);
    refetch();
  };

  const visibles = pendientes.filter(p => !resueltos.has(p.id)).slice(0, 3);
  const principal = visibles[0];
  const secundarios = visibles.slice(1, 3);

  if (!principal) {
    return <ChatVista inconsistencias={inconsistencias} />;
  }

  const colores: Record<string, string> = {
    CRITICO: "#ff2244", SOSPECHOSO: "#ff8c00", REVISAR: "#ffcc00", INFO: "#00d4ff",
  };
  const principalColor = colores[principal.nivel] || TEXT_DIM;

  return (
    <div className="w-full max-w-[600px]">
      {/* Principal — grande */}
      <div className="p-6 mb-4" style={{ background: `${principalColor}06`, border: `1px solid ${principalColor}30`, borderLeft: `3px solid ${principalColor}` }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="font-exo text-xs font-bold px-2 py-0.5"
            style={{ color: principalColor, border: `1px solid ${principalColor}40`, background: `${principalColor}12` }}>
            {principal.nivel}
          </span>
          {principal.contrato && (
            <span className="font-exo text-[11px]" style={{ color: "#00d4ff" }}>{principal.contrato}</span>
          )}
        </div>
        <div className="font-space text-[14px] font-bold mb-1" style={{ color: "#c8e8ff" }}>
          {principal.titulo}
        </div>
        <div className="font-rajdhani text-[13px] leading-relaxed mb-5" style={{ color: TEXT_DIM }}>
          {principal.descripcion}
        </div>
        {principal.valor !== null && principal.valor !== undefined && (
          <div className="font-space text-[24px] font-bold mb-4" style={{ color: principalColor }}>
            {typeof principal.valor === "number" ? (principal.valor > 0 ? `+${principal.valor}` : principal.valor) : principal.valor}
            {principal.tipo === "BALANCE_ANOMALO" ? "%" : ""}
          </div>
        )}
        <div className="flex items-center gap-3">
          {(principal.acciones || []).map((accion: string) => {
            const isConfirm = accion === "CONFIRMAR" || accion === "CONFIRMAR_NORMAL" || accion === "ES_NORMAL";
            const isReject = accion === "FALSA_ALARMA" || accion === "IGNORAR";
            const isDanger = accion === "ESCALAR" || accion === "INVESTIGAR";
            return (
              <button key={accion}
                onClick={() => resolver(principal, accion)}
                disabled={resolviendo === principal.id}
                className="px-5 py-2.5 font-exo text-xs font-bold cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
                style={{
                  border: `1px solid ${isConfirm ? "#00ff8840" : isDanger ? "#ff224440" : "#0d2035"}`,
                  color: isConfirm ? "#00ff88" : isDanger ? "#ff2244" : TEXT_DIM,
                  background: isConfirm ? "#00ff8808" : "transparent",
                }}>
                {resolviendo === principal.id ? "..." : accion.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Secundarios — compactos */}
      {secundarios.map((item: any) => {
        const ic = colores[item.nivel] || TEXT_DIM;
        return (
          <div key={item.id} className="flex items-center justify-between px-4 py-3 mb-2"
            style={{ background: "#091018", border: `1px solid ${BORDER}`, borderLeft: `3px solid ${ic}` }}>
            <div className="flex-1 mr-3">
              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{item.titulo}</span>
              {item.contrato && <span className="font-exo text-xs ml-2" style={{ color: TEXT_DIM }}>{item.contrato}</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(item.acciones || []).slice(0, 2).map((accion: string) => (
                <button key={accion}
                  onClick={() => resolver(item, accion)}
                  disabled={resolviendo === item.id}
                  className="px-3 py-1.5 font-exo text-[11px] font-bold cursor-pointer hover:opacity-80 disabled:opacity-40"
                  style={{ border: `1px solid ${BORDER}`, color: TEXT_DIM }}>
                  {accion.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── CHAT: cuando no hay pendientes ── */
function ChatVista({ inconsistencias }: { inconsistencias: any }) {
  const [mensajes, setMensajes] = useState<{ rol: "sistema" | "ceo"; texto: string }[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (mensajes.length === 0) iniciar();
  }, []);

  const iniciar = async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/sistema/resumen-ia");
      const d = await r.json();
      setMensajes([{ rol: "sistema", texto: d.resumen || "Sistema conectado." }]);
    } catch {
      setMensajes([{ rol: "sistema", texto: "Sistema conectado. Preguntame lo que necesites." }]);
    }
    setCargando(false);
  };

  const enviar = async (texto?: string) => {
    const pregunta = texto || input.trim();
    if (!pregunta) return;
    setInput("");
    setMensajes(prev => [...prev, { rol: "ceo", texto: pregunta }]);
    setCargando(true);
    try {
      const r = await fetch("/api/sistema/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, contexto: "sistema_inteligente" }),
      });
      const d = await r.json();
      setMensajes(prev => [...prev, { rol: "sistema", texto: d.respuesta }]);
    } catch {
      setMensajes(prev => [...prev, { rol: "sistema", texto: "Error al conectar." }]);
    }
    setCargando(false);
  };

  const sugerencias = [
    "Como estuvo la semana?",
    "Que corredor rinde mejor?",
    "Hay algo que deba revisar?",
  ];

  return (
    <div className="w-full max-w-[550px]">
      <div className="text-center mb-6">
        <CheckCircle className="w-8 h-8 mx-auto mb-3" style={{ color: "#00ff88", opacity: 0.5 }} />
        <div className="font-space text-[14px] font-bold tracking-wider mb-1" style={{ color: "#00ff88" }}>Sin pendientes</div>
      </div>

      {/* Mensajes */}
      <div className="space-y-3 mb-4 overflow-y-auto" style={{ maxHeight: 220 }}>
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.rol === "ceo" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] px-4 py-2.5" style={{
              background: m.rol === "ceo" ? `${ORANGE}08` : "#091018",
              borderLeft: m.rol === "sistema" ? `2px solid ${ORANGE}` : "none",
              borderRight: m.rol === "ceo" ? `2px solid ${ORANGE}` : "none",
            }}>
              <div className="font-exo text-[7px] mb-1" style={{ color: TEXT_DIM }}>
                {m.rol === "sistema" ? "SOTRA IA" : "TU"}
              </div>
              <div className="font-rajdhani text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{m.texto}</div>
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: ORANGE }} />
            <span className="font-exo text-[11px]" style={{ color: TEXT_DIM }}>Analizando...</span>
          </div>
        )}
      </div>

      {/* Sugerencias */}
      {mensajes.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3 justify-center">
          {sugerencias.map((s, i) => (
            <button key={i} onClick={() => enviar(s)}
              className="font-exo text-[11px] px-3 py-1.5 cursor-pointer transition-all hover:opacity-80"
              style={{ border: `1px solid ${BORDER}`, color: TEXT_DIM }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && enviar()}
          placeholder="Escribe aqui..."
          disabled={cargando}
          className="flex-1 px-4 py-3 font-rajdhani text-[13px] outline-none"
          style={{ background: "#091018", border: `1px solid ${BORDER}`, color: "#c8e8ff" }}
          data-testid="input-dialogo" />
        <button onClick={() => enviar()} disabled={cargando || !input.trim()}
          className="px-4 py-3 cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
          style={{ background: `${ORANGE}10`, border: `1px solid ${ORANGE}40`, color: ORANGE }}>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
