import { useState, useMemo, useEffect, useRef } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Cerebro from "@/pages/cerebro";
import Contratos from "@/pages/contratos";
import GeoValidator from "@/pages/geovalidator";
import Aprendizaje from "@/pages/aprendizaje";
import Asistente from "@/pages/asistente";
import Configuration from "@/pages/configuration";
import Control from "@/pages/control";
import OperativeBrain from "@/pages/operative-brain";
import SistemaInteligente from "@/pages/sistema-inteligente";
import SplashAprendizaje, { ConsultaRapidaPanel } from "@/components/splash-aprendizaje";
import { X, HelpCircle, Truck, Settings, Zap, Search, LayoutDashboard, MessageSquare, Send, Loader2, Map as MapIcon, TrendingUp, Shield, Activity, Fuel, Route, Brain, ArrowLeft, ChevronRight, AlertTriangle } from "lucide-react";

type AppSection = "launcher" | "tower" | "brain" | "sistema";
type AppMode = "tower" | "control";

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [textIdx, setTextIdx] = useState(0);
  const texts = ["Conectando Volvo Connect...", "Leyendo GPS...", "Procesando flota...", "Sistema listo"];

  useEffect(() => {
    const dur = 2500;
    const interval = 30;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      setProgress(Math.min((elapsed / dur) * 100, 100));
      const idx = Math.min(Math.floor((elapsed / dur) * texts.length), texts.length - 1);
      setTextIdx(idx);
      if (elapsed >= dur) {
        clearInterval(timer);
        setTimeout(onDone, 500);
      }
    }, interval);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center" style={{ background: '#020508' }} data-testid="splash-screen">
      <div className="octagonal w-[80px] h-[80px] flex items-center justify-center mb-6" style={{
        background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
        border: '1px solid rgba(0,212,255,0.3)',
        animation: 'glowPulse 2s ease-in-out infinite'
      }}>
        <span className="text-3xl">&#9981;</span>
      </div>
      <div className="font-space text-[32px] font-bold tracking-[0.3em] mb-1" style={{ color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.3)' }}>
        SOTRASER
      </div>
      <div className="font-exo text-[11px] tracking-[0.3em] font-extralight mb-8" style={{ color: '#4a7090' }}>
        CONTROL OPERACIONAL DE FLOTA
      </div>
      <div className="w-64 h-1 overflow-hidden mb-4" style={{ background: '#0d2035' }}>
        <div className="h-full transition-all duration-100" style={{ width: `${progress}%`, background: '#00d4ff' }} />
      </div>
      <div className="font-exo text-[11px] tracking-wider h-5" style={{ color: '#4a7090' }}>
        {texts[textIdx]}
      </div>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
      const m = months[now.getMonth()];
      const d = now.getDate();
      const h = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      setTime(`${m} ${d} \u00b7 ${h}:${min}`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  return <span className="font-space text-[11px]" style={{ color: '#4a7090' }}>{time}</span>;
}

type Tab = "cerebro" | "contratos" | "mapa" | "aprendizaje" | "asistente" | "ajustes" | "control";

const TOWER_TABS: { id: Tab; tooltip: string; icon: typeof LayoutDashboard }[] = [
  { id: "cerebro", tooltip: "Torre de Control", icon: LayoutDashboard },
  { id: "contratos", tooltip: "Contratos", icon: Truck },
  { id: "mapa", tooltip: "Mapa en Vivo", icon: MapIcon as any },
  { id: "aprendizaje", tooltip: "Aprendizaje", icon: TrendingUp },
  { id: "asistente", tooltip: "SOTRA IA", icon: MessageSquare },
];

function SidebarNav({ tab, setTab, criticos, onLogoClick, mode, setMode, onBackToLauncher }: {
  tab: Tab; setTab: (t: Tab) => void; criticos: number; onLogoClick?: () => void;
  mode: AppMode; setMode: (m: AppMode) => void; onBackToLauncher?: () => void;
}) {
  return (
    <div className="fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center py-3" style={{
      width: '56px',
      background: '#010306',
      borderRight: '1px solid #0d2035',
    }} data-testid="sidebar-nav">
      <button onClick={onBackToLauncher} className="octagonal w-9 h-9 flex items-center justify-center mb-1 cursor-pointer transition-all hover:opacity-80" style={{
        border: '1px solid rgba(0,212,255,0.4)',
        background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
      }} data-testid="btn-back-launcher-tower" title="Volver al inicio">
        <ArrowLeft className="w-4 h-4" style={{ color: '#00d4ff' }} />
      </button>

      <button onClick={onLogoClick} className="octagonal w-9 h-9 flex items-center justify-center mb-3 cursor-pointer transition-all hover:opacity-80" style={{
        border: '1px solid rgba(0,212,255,0.4)',
        background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
        animation: 'glowPulse 3s ease-in-out infinite'
      }} data-testid="btn-logo-splash" title="Estado del sistema">
        <span className="text-sm">&#9981;</span>
      </button>

      <div className="flex flex-col items-center gap-0.5 mb-3 w-full px-1.5">
        <div className="relative group w-full">
          <button
            onClick={() => { setMode("tower"); setTab("cerebro"); }}
            data-testid="mode-tower"
            className="w-full flex items-center justify-center gap-1 py-1.5 px-1 cursor-pointer transition-all"
            style={{
              background: mode === "tower" ? "rgba(0,212,255,0.1)" : "transparent",
              border: `1px solid ${mode === "tower" ? "rgba(0,212,255,0.3)" : "transparent"}`,
              borderLeft: mode === "tower" ? "2px solid #00d4ff" : "2px solid transparent",
            }}
          >
            <Shield className="w-3 h-3" style={{ color: mode === "tower" ? "#00d4ff" : "#3a6080" }} />
            <span className="font-space text-[6px] font-bold tracking-wider" style={{ color: mode === "tower" ? "#00d4ff" : "#3a6080" }}>TOWER</span>
          </button>
        </div>
        <div className="relative group w-full">
          <button
            onClick={() => { setMode("control"); setTab("control"); }}
            data-testid="mode-control"
            className="w-full flex items-center justify-center gap-1 py-1.5 px-1 cursor-pointer transition-all"
            style={{
              background: mode === "control" ? "rgba(0,255,136,0.1)" : "transparent",
              border: `1px solid ${mode === "control" ? "rgba(0,255,136,0.3)" : "transparent"}`,
              borderLeft: mode === "control" ? "2px solid #00ff88" : "2px solid transparent",
            }}
          >
            <Activity className="w-3 h-3" style={{ color: mode === "control" ? "#00ff88" : "#3a6080" }} />
            <span className="font-space text-[6px] font-bold tracking-wider" style={{ color: mode === "control" ? "#00ff88" : "#3a6080" }}>CTRL</span>
          </button>
        </div>
      </div>

      <div className="w-8 h-px mb-2" style={{ background: '#0d2035' }} />

      {mode === "tower" && (
        <div className="flex flex-col items-center gap-1 flex-1">
          {TOWER_TABS.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <div key={t.id} className="relative group">
                <button
                  onClick={() => setTab(t.id)}
                  data-testid={`tab-${t.id}`}
                  className="w-10 h-10 flex items-center justify-center cursor-pointer transition-all relative"
                  style={{
                    background: isActive ? 'rgba(0,212,255,0.08)' : 'transparent',
                    borderLeft: isActive ? '2px solid #00d4ff' : '2px solid transparent',
                  }}
                >
                  <Icon className="w-[18px] h-[18px]" style={{
                    color: isActive ? '#00d4ff' : '#3a6080',
                    filter: isActive ? 'drop-shadow(0 0 4px rgba(0,212,255,0.4))' : 'none',
                  }} />
                  {t.id === "cerebro" && criticos > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full"
                      style={{ background: '#ff2244', color: '#fff', animation: 'blinkFast 0.6s infinite' }}>
                      {criticos}
                    </span>
                  )}
                </button>
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
                  style={{ background: '#091018', border: '1px solid #0d2035' }}>
                  <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>{t.tooltip}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === "control" && (
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="relative group">
            <button
              onClick={() => setTab("control")}
              data-testid="tab-control"
              className="w-10 h-10 flex items-center justify-center cursor-pointer transition-all"
              style={{
                background: tab === "control" ? 'rgba(0,255,136,0.08)' : 'transparent',
                borderLeft: tab === "control" ? '2px solid #00ff88' : '2px solid transparent',
              }}
            >
              <Activity className="w-[18px] h-[18px]" style={{
                color: tab === "control" ? '#00ff88' : '#3a6080',
                filter: tab === "control" ? 'drop-shadow(0 0 4px rgba(0,255,136,0.4))' : 'none',
              }} />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
              style={{ background: '#091018', border: '1px solid #0d2035' }}>
              <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>Panel de Control</span>
            </div>
          </div>
        </div>
      )}

      <div className="w-8 h-px mb-2" style={{ background: '#0d2035' }} />
      <div className="relative group">
        <button
          onClick={() => setTab("ajustes")}
          data-testid="tab-ajustes"
          className="w-10 h-10 flex items-center justify-center cursor-pointer transition-all"
          style={{
            background: tab === "ajustes" ? 'rgba(0,212,255,0.08)' : 'transparent',
            borderLeft: tab === "ajustes" ? '2px solid #00d4ff' : '2px solid transparent',
          }}
        >
          <Settings className="w-[18px] h-[18px]" style={{
            color: tab === "ajustes" ? '#00d4ff' : '#3a6080',
          }} />
        </button>
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
          style={{ background: '#091018', border: '1px solid #0d2035' }}>
          <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>Ajustes</span>
        </div>
      </div>
    </div>
  );
}

function TopBar({ kpiData, criticos, onAnalizar, onHelp, onSearch, mode }: {
  kpiData: any;
  criticos: number;
  onAnalizar: () => void;
  onHelp: () => void;
  onSearch: () => void;
  mode: AppMode;
}) {
  const modeColor = mode === "tower" ? "#00d4ff" : "#00ff88";
  const modeLabel = mode === "tower" ? "SOTRASER TOWER" : "SOTRASER CONTROL";
  return (
    <div className="fixed top-0 z-40" style={{
      left: '56px',
      right: 0,
      height: '36px',
      background: 'rgba(2,5,8,0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #0d2035',
    }} data-testid="topbar">
      <div className="h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="font-space text-[10px] font-bold tracking-[0.2em] px-2 py-0.5" style={{ color: modeColor, background: modeColor + "10", border: `1px solid ${modeColor}30` }} data-testid="text-mode-label">
            {modeLabel}
          </span>
          <span className="font-space text-[10px] ml-1" style={{ color: '#0d2035' }}>&middot;</span>
          <span className="w-2 h-2 rounded-full" style={{ background: '#00ff88', animation: 'blink 2s infinite', boxShadow: '0 0 6px #00ff88' }} />
          <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#00ff88' }} data-testid="text-live-status">EN VIVO</span>
          <span className="font-space text-[10px] ml-2" style={{ color: '#0d2035' }}>&middot;</span>
          <span className="font-space text-[11px] font-bold ml-1" style={{ color: '#c8e8ff' }} data-testid="text-topbar-activos">
            {kpiData?.camiones_activos ?? '-'} activos
          </span>
          <span className="font-space text-[10px]" style={{ color: '#0d2035' }}>&middot;</span>
          <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }} data-testid="text-topbar-rend">
            {kpiData?.rendimiento_promedio ? `${kpiData.rendimiento_promedio} km/L` : '-'}
          </span>
          <span className="font-space text-[10px]" style={{ color: '#0d2035' }}>&middot;</span>
          <span className="font-space text-[11px] font-bold" style={{ color: criticos > 0 ? '#ff2244' : '#c8e8ff' }} data-testid="text-topbar-alertas">
            {kpiData?.alertas_criticas ?? 0} alertas
          </span>
        </div>

        <div className="flex items-center gap-4">
          <LiveClock />

          <button onClick={onSearch} className="p-1 cursor-pointer transition-all hover:opacity-70" data-testid="btn-consulta-rapida" title="Consulta rapida">
            <Search className="w-3.5 h-3.5" style={{ color: '#4a7090' }} />
          </button>

          {criticos > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5" style={{ background: 'rgba(255,34,68,0.12)', border: '1px solid rgba(255,34,68,0.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff2244', animation: 'blinkFast 0.6s infinite' }} />
              <span className="font-space text-[10px] font-bold" style={{ color: '#ff2244' }}>{criticos}</span>
            </span>
          )}

          <button onClick={onAnalizar} className="flex items-center gap-1 px-2 py-1 cursor-pointer transition-all hover:opacity-80" style={{
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.25)',
          }} data-testid="btn-analizar">
            <Zap className="w-3 h-3" style={{ color: '#00d4ff' }} />
            <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#00d4ff' }}>ANALIZAR</span>
          </button>

          <button onClick={onHelp} className="p-1 cursor-pointer hover:opacity-70" data-testid="btn-help" title="Ayuda">
            <HelpCircle className="w-3.5 h-3.5" style={{ color: '#4a7090' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/sistema/consulta", { pregunta: q });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.respuesta || "Sin respuesta" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Error al consultar" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-[55] w-[52px] h-[52px] flex items-center justify-center cursor-pointer transition-all hover:scale-105"
        style={{
          bottom: 24, right: 24,
          background: 'rgba(0,212,255,0.12)',
          border: '1px solid rgba(0,212,255,0.4)',
          borderRadius: '50%',
          boxShadow: '0 0 24px rgba(0,212,255,0.15)',
        }}
        data-testid="btn-chat-flotante"
      >
        <MessageSquare className="w-5 h-5" style={{ color: '#00d4ff' }} />
      </button>

      {open && (
        <div className="fixed z-[56] panel-lateral" style={{
          bottom: 88, right: 24,
          width: 380, height: 520,
          background: 'rgba(6,13,20,0.98)',
          border: '1px solid #0d2035',
          display: 'flex', flexDirection: 'column',
        }} data-testid="panel-chat-flotante">
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #0d2035' }}>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
              <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: '#00d4ff' }}>SOTRA IA</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-0.5 cursor-pointer hover:opacity-70" data-testid="btn-cerrar-chat">
              <X className="w-3.5 h-3.5" style={{ color: '#4a7090' }} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="w-6 h-6 mx-auto mb-2" style={{ color: '#0d2035' }} />
                <div className="font-rajdhani text-[12px]" style={{ color: '#3a6080' }}>Preguntale al sistema sobre tu flota</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] px-3 py-2" style={{
                  background: m.role === 'user' ? 'rgba(0,212,255,0.08)' : '#091018',
                  border: `1px solid ${m.role === 'user' ? 'rgba(0,212,255,0.2)' : '#0d2035'}`,
                }}>
                  <div className="font-rajdhani text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: '#c8e8ff' }}>{m.text}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2" style={{ background: '#091018', border: '1px solid #0d2035' }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#00d4ff' }} />
                </div>
              </div>
            )}
          </div>

          <div className="p-3" style={{ borderTop: '1px solid #0d2035' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Pregunta..."
                className="flex-1 px-3 py-1.5 font-rajdhani text-[13px] outline-none"
                style={{ background: '#020508', border: '1px solid #0d2035', color: '#c8e8ff' }}
                data-testid="input-chat-flotante"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="px-2.5 py-1.5 cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
                style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)' }}
                data-testid="btn-enviar-chat"
              >
                <Send className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const slides = [
    {
      content: (
        <div className="flex flex-col items-center text-center py-6">
          <div className="octagonal w-[80px] h-[80px] flex items-center justify-center mb-4" style={{
            background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
            border: '1px solid rgba(0,212,255,0.3)',
            animation: 'glowPulse 3s ease-in-out infinite'
          }}>
            <span className="text-3xl">&#9981;</span>
          </div>
          <div className="font-space text-2xl font-bold tracking-[0.3em] mb-1" style={{ color: '#00d4ff' }}>SOTRASER</div>
          <div className="font-exo text-[11px] tracking-[0.3em] font-extralight mb-4" style={{ color: '#4a7090' }}>Tu torre de control operacional</div>
        </div>
      ),
      button: "Siguiente"
    },
    {
      content: (
        <div className="space-y-3 py-4">
          {[
            { icon: "\ud83e\udde0", label: "CEREBRO", desc: "Dashboard principal con estado de la flota" },
            { icon: "\ud83d\ude9b", label: "CONTRATOS", desc: "Camiones por contrato con datos Volvo" },
            { icon: "\ud83d\uddfa\ufe0f", label: "MAPA", desc: "GPS en vivo y validacion de rutas" },
            { icon: "\ud83d\udcca", label: "APRENDIZAJE", desc: "Analisis historico de viajes" },
            { icon: "\ud83e\udd16", label: "ASISTENTE", desc: "Chat IA sobre tu flota" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 p-3" style={{ border: '1px solid #0d2035', background: '#091018' }}>
              <span className="text-xl">{item.icon}</span>
              <div>
                <div className="font-space text-[11px] font-bold tracking-wider" style={{ color: '#00d4ff' }}>{item.label}</div>
                <div className="font-rajdhani text-[12px]" style={{ color: '#4a7090' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
      button: "Siguiente"
    },
    {
      content: (
        <div className="flex flex-col items-center text-center py-6">
          <div className="text-3xl mb-3">&#9989;</div>
          <div className="font-space text-lg font-bold tracking-wider mb-2" style={{ color: '#00d4ff' }}>Todo listo</div>
          <div className="font-rajdhani text-sm" style={{ color: '#4a7090' }}>
            Flota conectada via Volvo Connect<br />
            Empieza por la pestana CEREBRO
          </div>
        </div>
      ),
      button: "Entrar"
    }
  ];

  const next = () => {
    if (page < slides.length - 1) setPage(page + 1);
    else {
      localStorage.setItem("sotraser_onboarded", "true");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85" data-testid="modal-onboarding">
      <div className="w-full max-w-md mx-4 relative" style={{ background: '#020508', border: '1px solid rgba(0,212,255,0.15)' }}>
        <button onClick={() => { localStorage.setItem("sotraser_onboarded", "true"); onClose(); }}
          className="absolute top-3 right-3 p-1 cursor-pointer hover:opacity-70 z-10" data-testid="btn-close-onboarding">
          <X className="w-4 h-4" style={{ color: '#4a7090' }} />
        </button>
        <div className="p-6">
          {slides[page].content}
          <button onClick={next} className="w-full mt-4 py-2.5 font-space text-xs font-bold tracking-[0.15em] cursor-pointer transition-all octagonal" style={{
            background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff'
          }} data-testid="btn-onboarding-next">
            {slides[page].button} &rarr;
          </button>
          <div className="flex justify-center gap-2 mt-4">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setPage(i)} className="w-2 h-2 rounded-full cursor-pointer transition-all" style={{
                background: i === page ? '#00d4ff' : '#0d2035'
              }} data-testid={`onboarding-dot-${i}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Launcher({ onSelect }: { onSelect: (section: AppSection) => void }) {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/cerebro/estado-general"], refetchInterval: 120000 });
  const { data: alertas } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 120000 });
  const { data: sistemaEstado } = useQuery<any>({ queryKey: ["/api/sistema/estado"], refetchInterval: 300000 });
  const { data: aprendizaje } = useQuery<any>({ queryKey: ["/api/estaciones/aprendizaje"], refetchInterval: 600000 });
  const criticos = useMemo(() => alertas?.filter((a: any) => a.severidad === "CRITICA").length || 0, [alertas]);
  const anomaliasActivas = sistemaEstado?.alertas_patron_activas || 0;
  const calibracionPct = aprendizaje?.resumen?.madurez_pct || 0;
  const totalPatrones = aprendizaje?.resumen?.total_patrones || 0;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center" style={{ background: "#020508" }} data-testid="launcher-screen">
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.2), rgba(168,85,247,0.2), rgba(255,107,53,0.2), transparent)" }} />

      <div className="mb-10 text-center">
        <div className="octagonal w-[60px] h-[60px] flex items-center justify-center mx-auto mb-4" style={{
          background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
          border: "1px solid rgba(0,212,255,0.25)",
          animation: "glowPulse 3s ease-in-out infinite"
        }}>
          <span className="text-2xl">&#9981;</span>
        </div>
        <div className="font-space text-[28px] font-bold tracking-[0.35em] mb-1" style={{ color: "#c8e8ff" }}>SOTRASER</div>
        <div className="font-exo text-[10px] tracking-[0.3em] font-extralight" style={{ color: "#4a7090" }}>PLATAFORMA INTEGRADA DE FLOTA</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 px-6">
        <button
          onClick={() => onSelect("tower")}
          className="group relative rounded cursor-pointer transition-all hover:scale-[1.02]"
          style={{ background: "#091018", border: "1px solid rgba(0,212,255,0.15)" }}
          data-testid="btn-launch-tower"
        >
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, #00d4ff, #00ff88)" }} />
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}>
                <Shield className="w-5 h-5" style={{ color: "#00d4ff" }} />
              </div>
              <div>
                <div className="font-space text-[13px] font-bold tracking-[0.15em]" style={{ color: "#00d4ff" }}>TOWER CONTROL</div>
                <div className="font-exo text-[9px] tracking-wider" style={{ color: "#4a7090" }}>CONTROL OPERACIONAL</div>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#00d4ff" }} />
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Torre de control y dashboard operativo</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Gestion de contratos y flota</span>
              </div>
              <div className="flex items-center gap-2">
                <MapIcon className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Mapa GPS en vivo y estaciones</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Panel de control operativo</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-3" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#00ff88", animation: "blink 2s infinite" }} />
                <span className="font-space text-[9px] font-bold" style={{ color: "#00ff88" }}>{estado?.camiones_activos || 0} activos</span>
              </div>
              <span className="font-space text-[9px]" style={{ color: "#0d2035" }}>|</span>
              <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>{(estado?.km_hoy || 0).toLocaleString("es-CL")} km</span>
              <span className="font-space text-[9px]" style={{ color: "#0d2035" }}>|</span>
              {criticos > 0 ? (
                <span className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>{criticos} alertas</span>
              ) : (
                <span className="font-space text-[9px]" style={{ color: "#00ff88" }}>Sin alertas</span>
              )}
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect("brain")}
          className="group relative rounded cursor-pointer transition-all hover:scale-[1.02]"
          style={{ background: "#091018", border: "1px solid rgba(168,85,247,0.15)" }}
          data-testid="btn-launch-brain"
        >
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, #a855f7, #ec4899)" }} />
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                <Brain className="w-5 h-5" style={{ color: "#a855f7" }} />
              </div>
              <div>
                <div className="font-space text-[13px] font-bold tracking-[0.15em]" style={{ color: "#a855f7" }}>OPERATIVE BRAIN</div>
                <div className="font-exo text-[9px] tracking-wider" style={{ color: "#4a7090" }}>INTELIGENCIA OPERATIVA</div>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#a855f7" }} />
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <Brain className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Resumen operativo inteligente</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Rendimiento por contrato y metas</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Deteccion de anomalias de combustible</span>
              </div>
              <div className="flex items-center gap-2">
                <Route className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Patrones aprendidos y predicciones</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-3" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="flex items-center gap-1">
                <Brain className="w-3 h-3" style={{ color: "#a855f7" }} />
                <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>Sistema adaptativo</span>
              </div>
              <span className="font-space text-[9px]" style={{ color: "#0d2035" }}>|</span>
              <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>Analisis en tiempo real</span>
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect("sistema")}
          className="group relative rounded cursor-pointer transition-all hover:scale-[1.02]"
          style={{ background: "#091018", border: "1px solid rgba(255,107,53,0.15)" }}
          data-testid="btn-launch-sistema"
        >
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, #ff6b35, #ffcc00)" }} />
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.2)" }}>
                <Zap className="w-5 h-5" style={{ color: "#ff6b35" }} />
              </div>
              <div>
                <div className="font-space text-[13px] font-bold tracking-[0.15em]" style={{ color: "#ff6b35" }}>SISTEMA INTELIGENTE</div>
                <div className="font-exo text-[9px] tracking-wider" style={{ color: "#4a7090" }}>CALIBRACION Y DIALOGO</div>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#ff6b35" }} />
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Deteccion de inconsistencias</span>
              </div>
              <div className="flex items-center gap-2">
                <Settings className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Calibracion de parametros</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Dialogo directo con el sistema</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-3 h-3" style={{ color: "#3a6080" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Reporte semanal automatizado</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-3" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ color: "#ff6b35" }} />
                <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>
                  {anomaliasActivas > 0 ? `${anomaliasActivas} anomalias` : "Sin anomalias"}
                </span>
              </div>
              <span className="font-space text-[9px]" style={{ color: "#0d2035" }}>|</span>
              <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>
                {totalPatrones > 0 ? `${totalPatrones} patrones (${calibracionPct}%)` : "Calibrando..."}
              </span>
            </div>
          </div>
        </button>
      </div>

      <div className="font-rajdhani text-[10px]" style={{ color: "#3a6080" }}>
        {estado?.total_camiones || 0} camiones registrados -- {estado?.por_contrato?.length || 0} contratos activos
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.1), rgba(168,85,247,0.1), transparent)" }} />
    </div>
  );
}

function AppShell() {
  const [section, setSection] = useState<AppSection>("launcher");
  const [mode, setMode] = useState<AppMode>("tower");
  const [tab, setTab] = useState<Tab>("cerebro");
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSplashAprendizaje, setShowSplashAprendizaje] = useState(false);
  const [splashShowEntrar, setSplashShowEntrar] = useState(true);
  const [showConsulta, setShowConsulta] = useState(false);
  const [contratoInicial, setContratoInicial] = useState<string | undefined>();
  const [patenteInicial, setPatenteInicial] = useState<string | undefined>();
  const [geoInitialTab, setGeoInitialTab] = useState<string | undefined>();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab === "geo") {
        setGeoInitialTab(detail.subtab || undefined);
        setTab("mapa");
      }
    };
    window.addEventListener("sotraser-navigate", handler);
    return () => window.removeEventListener("sotraser-navigate", handler);
  }, []);

  // Polling is handled by Launcher; these just subscribe to the cache
  const { data: kpiData } = useQuery<any>({
    queryKey: ["/api/cerebro/estado-general"],
  });

  const { data: alertasData } = useQuery<any[]>({
    queryKey: ["/api/cerebro/camiones-alerta"],
  });

  const criticos = useMemo(() => {
    if (!alertasData || !Array.isArray(alertasData)) return 0;
    return alertasData.filter((a: any) => a.severidad === "CRITICA").length;
  }, [alertasData]);

  useEffect(() => {
    if (!showSplash && !localStorage.getItem("sotraser_onboarded")) {
      setShowOnboarding(true);
    }
  }, [showSplash]);

  useEffect(() => {
    if (!showSplash) {
      const ultimaApertura = localStorage.getItem("sotraser_ultima_apertura");
      const horasDesdeUltima = ultimaApertura
        ? (Date.now() - parseInt(ultimaApertura)) / 3600000
        : 999;
      if (horasDesdeUltima > 8) {
        setTimeout(() => {
          setShowSplashAprendizaje(true);
          localStorage.setItem("sotraser_ultima_apertura", Date.now().toString());
        }, 3000);
      }
    }
  }, [showSplash]);

  const handleVerContrato = (contrato: string) => {
    setContratoInicial(contrato);
    setTab("contratos");
  };

  const handleOpenSplashAprendizaje = (withEntrar: boolean = true) => {
    setSplashShowEntrar(withEntrar);
    setShowSplashAprendizaje(true);
    localStorage.setItem("sotraser_ultima_apertura", Date.now().toString());
  };

  const handleLogoClick = () => {
    setTab("cerebro");
    const ultimaApertura = localStorage.getItem("sotraser_ultima_apertura");
    const horasDesdeUltima = ultimaApertura
      ? (Date.now() - parseInt(ultimaApertura)) / 3600000
      : 999;
    if (horasDesdeUltima > 8) {
      handleOpenSplashAprendizaje(true);
    }
  };

  const handleSectionSelect = (s: AppSection) => {
    setSection(s);
    if (s === "tower") {
      setMode("tower");
      setTab("cerebro");
    }
  };

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (section === "launcher") {
    return <Launcher onSelect={handleSectionSelect} />;
  }

  if (section === "sistema") {
    return (
      <div className="min-h-screen flex" style={{ background: '#020508', color: '#c8e8ff' }}>
        <div className="fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center py-3" style={{
          width: '56px', background: '#010306', borderRight: '1px solid #0d2035',
        }} data-testid="sidebar-sistema">
          <button onClick={() => setSection("launcher")} className="octagonal w-9 h-9 flex items-center justify-center mb-4 cursor-pointer transition-all hover:opacity-80" style={{
            border: '1px solid rgba(255,107,53,0.4)',
            background: 'radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 70%)',
          }} data-testid="btn-back-launcher-sistema" title="Volver al inicio">
            <ArrowLeft className="w-4 h-4" style={{ color: '#ff6b35' }} />
          </button>

          <div className="relative group">
            <button className="w-10 h-10 flex items-center justify-center cursor-pointer" style={{
              background: 'rgba(255,107,53,0.08)', borderLeft: '2px solid #ff6b35',
            }} data-testid="tab-sistema">
              <Zap className="w-[18px] h-[18px]" style={{ color: '#ff6b35', filter: 'drop-shadow(0 0 4px rgba(255,107,53,0.4))' }} />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
              style={{ background: '#091018', border: '1px solid #0d2035' }}>
              <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>Sistema Inteligente</span>
            </div>
          </div>

          <div className="flex-1" />
          <div className="relative group">
            <button onClick={() => { setSection("tower"); setTab("ajustes"); }} className="w-10 h-10 flex items-center justify-center cursor-pointer transition-all" data-testid="tab-ajustes-sistema">
              <Settings className="w-[18px] h-[18px]" style={{ color: '#3a6080' }} />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
              style={{ background: '#091018', border: '1px solid #0d2035' }}>
              <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>Ajustes</span>
            </div>
          </div>
        </div>

        <div className="flex-1" style={{ marginLeft: '56px' }}>
          <SistemaInteligente />
        </div>
      </div>
    );
  }

  if (section === "brain") {
    return (
      <div className="min-h-screen flex" style={{ background: '#020508', color: '#c8e8ff' }}>
        <div className="fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center py-3" style={{
          width: '56px', background: '#010306', borderRight: '1px solid #0d2035',
        }} data-testid="sidebar-brain">
          <button onClick={() => setSection("launcher")} className="octagonal w-9 h-9 flex items-center justify-center mb-4 cursor-pointer transition-all hover:opacity-80" style={{
            border: '1px solid rgba(168,85,247,0.4)',
            background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)',
          }} data-testid="btn-back-launcher" title="Volver al inicio">
            <ArrowLeft className="w-4 h-4" style={{ color: '#a855f7' }} />
          </button>

          <div className="relative group">
            <button className="w-10 h-10 flex items-center justify-center cursor-pointer" style={{
              background: 'rgba(168,85,247,0.08)', borderLeft: '2px solid #a855f7',
            }} data-testid="tab-brain">
              <Brain className="w-[18px] h-[18px]" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.4))' }} />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
              style={{ background: '#091018', border: '1px solid #0d2035' }}>
              <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>Operative Brain</span>
            </div>
          </div>

          <div className="flex-1" />
          <div className="relative group">
            <button onClick={() => { setSection("tower"); setTab("ajustes"); }} className="w-10 h-10 flex items-center justify-center cursor-pointer transition-all" data-testid="tab-ajustes-brain">
              <Settings className="w-[18px] h-[18px]" style={{ color: '#3a6080' }} />
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[60]"
              style={{ background: '#091018', border: '1px solid #0d2035' }}>
              <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>Ajustes</span>
            </div>
          </div>
        </div>

        <div className="fixed top-0 z-40" style={{
          left: '56px', right: 0, height: '36px',
          background: 'rgba(2,5,8,0.95)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #0d2035',
        }} data-testid="topbar-brain">
          <div className="h-full flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="font-space text-[10px] font-bold tracking-[0.2em] px-2 py-0.5" style={{ color: "#a855f7", background: "#a855f710", border: "1px solid #a855f730" }}>
                OPERATIVE BRAIN
              </span>
              <span className="font-space text-[10px] ml-1" style={{ color: '#0d2035' }}>&middot;</span>
              <span className="w-2 h-2 rounded-full" style={{ background: '#a855f7', animation: 'blink 2s infinite', boxShadow: '0 0 6px #a855f7' }} />
              <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#a855f7' }}>ACTIVO</span>
              <span className="font-space text-[10px] ml-2" style={{ color: '#0d2035' }}>&middot;</span>
              <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>
                {kpiData?.camiones_activos ?? '-'} activos
              </span>
              <span className="font-space text-[10px]" style={{ color: '#0d2035' }}>&middot;</span>
              <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>
                {kpiData?.rendimiento_promedio ? `${kpiData.rendimiento_promedio} km/L` : '-'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <LiveClock />
              <button onClick={() => setSection("launcher")} className="flex items-center gap-1 px-2 py-1 cursor-pointer transition-all hover:opacity-80" style={{
                background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)',
              }} data-testid="btn-back-home">
                <ArrowLeft className="w-3 h-3" style={{ color: '#a855f7' }} />
                <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: '#a855f7' }}>INICIO</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1" style={{ marginLeft: '56px', paddingTop: '36px' }}>
          <div className="p-5 max-w-[1400px] mx-auto">
            <OperativeBrain />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#020508', color: '#c8e8ff' }}>
      <SidebarNav tab={tab} setTab={setTab} criticos={criticos} onLogoClick={handleLogoClick} mode={mode} setMode={setMode} onBackToLauncher={() => setSection("launcher")} />

      <TopBar
        kpiData={kpiData}
        criticos={criticos}
        onAnalizar={() => setTab("asistente")}
        onHelp={() => setShowOnboarding(true)}
        onSearch={() => setShowConsulta(true)}
        mode={mode}
      />

      <div className="flex-1" style={{ marginLeft: '56px', paddingTop: '36px' }}>
        <div className="p-5 max-w-[1400px] mx-auto">
          {tab === "cerebro" && <Cerebro onVerContrato={handleVerContrato} onOpenIA={() => setTab("asistente")} onInvestigar={(patente: string) => { setContratoInicial(undefined); setPatenteInicial(patente); setTab("contratos"); }} onOpenSplash={() => handleOpenSplashAprendizaje(false)} onNavigateFlota={() => setTab("mapa")} />}
          {tab === "contratos" && <Contratos initialContrato={contratoInicial} initialPatente={patenteInicial} />}
          {tab === "mapa" && <GeoValidator initialTab={geoInitialTab as any} key={geoInitialTab || "default"} />}
          {tab === "aprendizaje" && <Aprendizaje />}
          {tab === "asistente" && <Asistente />}
          {tab === "control" && <Control />}
          {tab === "ajustes" && <Configuration />}
        </div>
      </div>

      <FloatingChat />

      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      {showSplashAprendizaje && (
        <SplashAprendizaje
          onEntrar={() => setShowSplashAprendizaje(false)}
          showEntrar={splashShowEntrar}
        />
      )}

      {showConsulta && (
        <ConsultaRapidaPanel onClose={() => setShowConsulta(false)} />
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
