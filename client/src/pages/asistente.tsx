import { useState, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send, RotateCcw, Brain, User, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
}

const SUGERENCIA_GROUPS = [
  {
    label: "OPERACION",
    items: [
      "Resumen operacional del dia",
      "Hay camiones sin GPS ahora mismo?",
    ],
  },
  {
    label: "RENDIMIENTO",
    items: [
      "Que contrato tiene mejor rendimiento hoy?",
      "Cual es el camion mas eficiente esta semana?",
      "Que camiones estan bajo su meta de rendimiento?",
    ],
  },
  {
    label: "SEGURIDAD",
    items: [
      "Algun camion supero 105 km/h hoy?",
    ],
  },
];

function getTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function Asistente() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const enviar = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim(), time: getTimeStr() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await apiRequest("POST", "/api/ia/chat", {
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response || data.respuesta || "Sin respuesta", time: getTimeStr() }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}`, time: getTimeStr() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }} data-testid="asistente-page">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6" style={{ background: "#00d4ff" }} />
          <Brain className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <span className="font-rajdhani text-xl font-bold" style={{ color: "#c8e8ff" }} data-testid="text-asistente-title">
            SOTRA IA
          </span>
          <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Asistente de flota Volvo Connect</span>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            data-testid="btn-reset-chat"
            className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-[11px] font-bold tracking-wider cursor-pointer transition-all hover:bg-[#0d1e30]"
            style={{ border: "1px solid #0d2035", color: "#3a6080" }}>
            <RotateCcw className="w-3 h-3" /> NUEVA CONVERSACION
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 flex items-center justify-center mb-5" style={{
              border: "1px solid rgba(0,212,255,0.15)",
              background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
            }}>
              <Sparkles className="w-8 h-8" style={{ color: "#00d4ff" }} />
            </div>
            <div className="font-space text-[15px] font-bold tracking-wider mb-1" style={{ color: "#c8e8ff" }}>
              Pregunta sobre tu flota
            </div>
            <div className="font-exo text-[11px] mb-8" style={{ color: "#3a6080" }}>
              Datos en tiempo real desde Volvo Connect
            </div>

            <div className="w-full max-w-xl space-y-4">
              {SUGERENCIA_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="font-exo text-xs font-bold tracking-[0.2em] mb-2 px-1" style={{ color: "#4a7090" }}>
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((s, i) => (
                      <button key={i}
                        onClick={() => { setInput(s); enviar(s); }}
                        data-testid={`chip-sugerencia-${group.label}-${i}`}
                        className="px-3 py-2 font-exo text-xs cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.06)]"
                        style={{ border: "1px solid #0d2035", color: "#6a90aa" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}
            data-testid={`msg-${msg.role}-${i}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center mt-1" style={{
                background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)",
              }}>
                <Brain className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
              </div>
            )}
            <div className="max-w-[70%]">
              <div className="px-4 py-3" style={{
                background: msg.role === "user" ? "rgba(0,212,255,0.08)" : "rgba(6,13,20,0.8)",
                border: `1px solid ${msg.role === "user" ? "rgba(0,212,255,0.2)" : "#0d2035"}`,
              }}>
                <div className="font-rajdhani text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>
                  {msg.content}
                </div>
              </div>
              <div className="font-space text-[11px] mt-1 px-1" style={{ color: "#3a608060" }}>
                {msg.time}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center mt-1" style={{
                background: "rgba(200,232,255,0.06)", border: "1px solid rgba(200,232,255,0.1)",
              }}>
                <User className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start gap-2">
            <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center" style={{
              background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)",
            }}>
              <Brain className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
            </div>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(6,13,20,0.8)", border: "1px solid #0d2035" }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Analizando datos...</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2" data-testid="chat-input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && enviar(input)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Pregunta sobre tu flota..."
          className="flex-1 px-4 py-3 font-rajdhani text-sm bg-transparent outline-none transition-all"
          style={{
            border: `1px solid ${inputFocused ? "#00d4ff" : "#0d2035"}`,
            color: "#c8e8ff",
            boxShadow: inputFocused ? "0 0 12px rgba(0,212,255,0.1)" : undefined,
          }}
          data-testid="input-chat"
          disabled={loading}
        />
        <button
          onClick={() => enviar(input)}
          disabled={loading || !input.trim()}
          className="px-5 py-3 font-space text-sm font-bold cursor-pointer disabled:opacity-40 transition-all"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}
          data-testid="btn-enviar-chat"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
