import { useState, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send, RotateCcw, Brain } from "lucide-react";
import Inteligencia from "@/pages/inteligencia";
import RankingConductores from "@/pages/ranking-conductores";
import Tarifas from "@/pages/tarifas";

type IASub = "sotra-ia" | "inteligencia" | "ranking" | "tarifas";

const IA_TABS: { id: IASub; label: string }[] = [
  { id: "sotra-ia", label: "SOTRA IA" },
  { id: "inteligencia", label: "INTELIGENCIA" },
  { id: "ranking", label: "RANKING CONDUCTORES" },
  { id: "tarifas", label: "TARIFAS" },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGERENCIAS = [
  "Como esta la flota hoy?",
  "Que camion tiene el peor rendimiento?",
  "Que faena consume mas combustible?",
  "Hay alertas criticas activas?",
  "Resumen ejecutivo de la semana",
  "Patrones sospechosos detectados?",
];

function SotraIAChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await apiRequest("POST", "/api/ia/chat", { messages: newMessages });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.respuesta }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 180px)", minHeight: "500px" }} data-testid="sotra-ia-chat">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <span className="font-space text-[12px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
            SOTRA IA
          </span>
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Asistente inteligente de flota
          </span>
        </div>
        <button onClick={handleNewConversation}
          className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-xs font-bold cursor-pointer transition-all border hover:border-[#00d4ff] hover:text-[#00d4ff]"
          style={{ borderColor: "#0d2035", color: "#3a6080" }}
          data-testid="btn-nueva-conversacion">
          <RotateCcw className="w-3 h-3" />
          Nueva conversacion
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-3" style={{ scrollbarWidth: "thin", scrollbarColor: "#0d2035 transparent" }}>
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="octagonal w-16 h-16 flex items-center justify-center mb-4" style={{
              background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
              border: "1px solid rgba(0,212,255,0.2)",
            }}>
              <Brain className="w-7 h-7" style={{ color: "#00d4ff" }} />
            </div>
            <div className="font-space text-[14px] font-bold tracking-[0.15em] mb-1" style={{ color: "#c8e8ff" }}>
              SOTRA IA
            </div>
            <div className="font-exo text-[11px] mb-6" style={{ color: "#3a6080" }}>
              Pregunta lo que necesites sobre tu flota
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGERENCIAS.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)}
                  className="px-3 py-2 font-exo text-xs border cursor-pointer transition-all hover:border-[#00d4ff] hover:text-[#00d4ff] hover:shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                  style={{ borderColor: "#0d2035", color: "#3a6080" }}
                  data-testid={`sugerencia-${i}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`chat-msg-${i}`}>
            <div className={`max-w-[80%] p-3 ${msg.role === "user" ? "" : ""}`}
              style={msg.role === "user"
                ? { background: "#0d2035", border: "1px solid rgba(13,32,53,0.8)" }
                : { background: "#091018", border: "1px solid #0d2035", borderLeft: "3px solid #00d4ff" }
              }>
              {msg.role === "assistant" && (
                <div className="font-space text-xs font-bold tracking-[0.15em] mb-1.5" style={{ color: "#00d4ff" }}>
                  SOTRA IA
                </div>
              )}
              <div className="font-rajdhani text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{ color: msg.role === "user" ? "#c8e8ff" : "#c8e8ff" }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start" data-testid="chat-typing">
            <div className="p-3" style={{ background: "#091018", border: "1px solid #0d2035", borderLeft: "3px solid #00d4ff" }}>
              <div className="font-space text-xs font-bold tracking-[0.15em] mb-1.5" style={{ color: "#00d4ff" }}>
                SOTRA IA
              </div>
              <div className="flex items-center gap-1">
                <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
                  SOTRA IA esta escribiendo
                </span>
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#00d4ff", animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#00d4ff", animationDelay: "150ms" }} />
                  <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#00d4ff", animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Escribe tu pregunta..."
          className="flex-1 px-4 py-3 font-rajdhani text-sm bg-transparent border outline-none transition-all"
          style={{
            borderColor: inputFocused ? "#00d4ff" : "#0d2035",
            color: "#c8e8ff",
            boxShadow: inputFocused ? "0 0 12px rgba(0,212,255,0.15)" : undefined,
          }}
          data-testid="input-chat"
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="octagonal px-5 py-3 font-space text-sm font-bold cursor-pointer disabled:opacity-40 transition-all"
          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}
          data-testid="btn-enviar-chat"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function IATab() {
  const [activeSub, setActiveSub] = useState<IASub>("sotra-ia");

  return (
    <div data-testid="page-ia">
      <div className="flex items-center gap-1 mb-4 pb-2" style={{ borderBottom: "1px solid #0d2035" }}>
        {IA_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveSub(t.id)}
            data-testid={`ia-tab-${t.id}`}
            className={`px-4 py-2 font-exo text-xs font-bold tracking-[0.15em] cursor-pointer transition-all border-b-2 ${
              activeSub === t.id
                ? "border-[#00d4ff] text-[#00d4ff]"
                : "border-transparent text-[#3a6080] hover:text-[#c8e8ff]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeSub === "sotra-ia" && <SotraIAChat />}
      {activeSub === "inteligencia" && <Inteligencia />}
      {activeSub === "ranking" && <RankingConductores />}
      {activeSub === "tarifas" && <Tarifas />}
    </div>
  );
}
