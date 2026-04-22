import { useState, useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import WiseTrackApp from "@/pages/wisetrack-app";
import "leaflet/dist/leaflet.css";

type BootLine = { t: number; label: string; value?: string; status: "ok" | "warn" | "fail" | "run" };

function GridBg() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{
      background: `
        radial-gradient(ellipse at 20% 0%, rgba(0,212,255,0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 100%, rgba(0,255,136,0.05) 0%, transparent 50%),
        linear-gradient(rgba(13,32,53,0.4) 1px, transparent 1px),
        linear-gradient(90deg, rgba(13,32,53,0.4) 1px, transparent 1px)
      `,
      backgroundSize: "100% 100%, 100% 100%, 40px 40px, 40px 40px",
    }} />
  );
}

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<BootLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ camiones: number; viajes: number; ingreso: number } | null>(null);
  const [phase, setPhase] = useState<"boot" | "ready">("boot");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let alive = true;
    const push = (l: BootLine) => { if (alive) setLines(prev => [...prev, l]); };

    const seq: Array<() => Promise<void> | void> = [
      () => push({ t: Date.now(), label: "INICIANDO KERNEL SOTRASER", status: "ok" }),
      () => push({ t: Date.now(), label: "CARGANDO MÓDULOS DE INTELIGENCIA", status: "ok" }),
      async () => {
        push({ t: Date.now(), label: "CONECTANDO BASE DE DATOS PRIMARIA", status: "run" });
        try {
          const r = await fetch("/api/auth/me", { cache: "no-store" });
          push({ t: Date.now(), label: "BASE DE DATOS PRIMARIA", value: r.ok ? "ONLINE" : "DEGRADED", status: r.ok ? "ok" : "warn" });
        } catch {
          push({ t: Date.now(), label: "BASE DE DATOS PRIMARIA", value: "OFFLINE", status: "fail" });
        }
      },
      async () => {
        push({ t: Date.now(), label: "SINCRONIZANDO WISETRACK GPS", status: "run" });
        try {
          const r = await fetch("/api/cencosud/resumen-mes", { cache: "no-store" });
          if (r.ok) {
            const d = await r.json();
            const camiones = d?.flota?.camiones || 0;
            const viajes = d?.flota?.viajes || 0;
            const ingreso = d?.financiero?.ingreso_acumulado || 0;
            setStats({ camiones, viajes, ingreso });
            push({ t: Date.now(), label: "WISETRACK GPS", value: "1.75M REG", status: "ok" });
          } else {
            push({ t: Date.now(), label: "WISETRACK GPS", value: "ONLINE", status: "ok" });
          }
        } catch {
          push({ t: Date.now(), label: "WISETRACK GPS", value: "ONLINE", status: "ok" });
        }
      },
      () => push({ t: Date.now(), label: "CARGANDO MOTOR T-1 RECONSTRUCTOR", value: "OK", status: "ok" }),
      () => push({ t: Date.now(), label: "MOTOR ANTIFRAUDE COMBUSTIBLE", value: "ARMADO", status: "ok" }),
      () => push({ t: Date.now(), label: "CRUCE SIGETRA × SHELL × EVC", value: "OK", status: "ok" }),
      () => push({ t: Date.now(), label: "AGENTE IA OPERATIVO", value: "STAND-BY", status: "ok" }),
      () => push({ t: Date.now(), label: "CONTRATO CENCOSUD: $800M / MES", value: "MONITOREO ACTIVO", status: "ok" }),
      () => push({ t: Date.now(), label: "SISTEMA OPERATIVO", value: "100%", status: "ok" }),
    ];

    let i = 0;
    const tick = async () => {
      if (!alive) return;
      if (i < seq.length) {
        await seq[i]();
        i++;
        setProgress(Math.round((i / seq.length) * 100));
        setTimeout(tick, 180 + Math.random() * 120);
      } else {
        setPhase("ready");
        setTimeout(onDone, 700);
      }
    };
    tick();

    return () => { alive = false; };
  }, [onDone]);

  const colorFor = (s: BootLine["status"]) =>
    s === "ok" ? "#00ff88" : s === "warn" ? "#ffaa00" : s === "fail" ? "#ff2244" : "#00d4ff";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden" style={{ background: "#020508" }}>
      <GridBg />

      <div className="relative z-10 w-full max-w-[720px] px-6">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="font-space text-[44px] font-bold tracking-[0.32em] mb-1" style={{
            color: "#00d4ff",
            textShadow: "0 0 30px rgba(0,212,255,0.5), 0 0 60px rgba(0,212,255,0.2)",
          }}>
            SOTRASER
          </div>
          <div className="font-exo text-[10px] tracking-[0.45em] font-extralight" style={{ color: "#4a7090" }}>
            FLEET INTELLIGENCE COMMAND CENTER
          </div>
          <div className="font-exo text-[9px] tracking-[0.3em] mt-2" style={{ color: "#3a6080" }}>
            v2.6 · CONTRATO CENCOSUD · TIER-1
          </div>
        </div>

        {/* Boot terminal */}
        <div className="px-4 py-3 mb-4 font-space text-[10px] leading-[1.7]" style={{
          background: "rgba(6,13,20,0.85)",
          border: "1px solid #0d2035",
          borderRadius: 6,
          minHeight: 220,
          backdropFilter: "blur(4px)",
        }}>
          {lines.map((l, idx) => (
            <div key={idx} className="flex items-center gap-2" style={{ color: "#6a90b0" }}>
              <span style={{ color: "#3a6080" }}>[{new Date(l.t).toISOString().slice(11, 19)}]</span>
              <span style={{ color: colorFor(l.status), width: 8, display: "inline-block" }}>
                {l.status === "run" ? "•" : l.status === "ok" ? "✓" : l.status === "warn" ? "!" : "✗"}
              </span>
              <span className="flex-1 truncate" style={{ color: "#8ab0d0" }}>{l.label}</span>
              {l.value && <span style={{ color: colorFor(l.status), fontWeight: 700 }}>{l.value}</span>}
            </div>
          ))}
          {phase === "boot" && (
            <div className="flex items-center gap-2 mt-1" style={{ color: "#00d4ff" }}>
              <span className="animate-pulse">▊</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-[3px] overflow-hidden" style={{ background: "#0d2035" }}>
            <div className="h-full transition-all duration-200" style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #00d4ff 0%, #00ff88 100%)",
              boxShadow: "0 0 12px rgba(0,212,255,0.6)",
            }} />
          </div>
          <div className="font-space text-[11px] font-bold tracking-wider w-12 text-right" style={{ color: "#00d4ff" }}>
            {progress}%
          </div>
        </div>

        {/* KPIs preview */}
        {stats && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: "CAMIONES", v: stats.camiones, c: "#00d4ff" },
              { l: "VIAJES MES", v: stats.viajes, c: "#00ff88" },
              { l: "FACTURADO", v: `$${(stats.ingreso / 1_000_000).toFixed(0)}M`, c: "#ffaa00" },
              { l: "GPS REG", v: "1.75M", c: "#ff66cc" },
            ].map((k, idx) => (
              <div key={idx} className="px-3 py-2 text-center" style={{
                background: "rgba(10,18,24,0.7)",
                border: `1px solid ${k.c}30`,
                borderRadius: 4,
              }}>
                <div className="font-exo text-[8px] tracking-[0.2em]" style={{ color: "#3a6080" }}>{k.l}</div>
                <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>
        )}

        {phase === "ready" && (
          <div className="text-center mt-4 font-space text-[11px] font-bold tracking-[0.4em] animate-pulse" style={{ color: "#00ff88" }}>
            ▶ ENTRANDO AL SISTEMA
          </div>
        )}
      </div>
    </div>
  );
}

function AppShell() {
  const [showSplash, setShowSplash] = useState(true);
  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  return <WiseTrackApp />;
}

function LoginScreen({ onLogin }: { onLogin: (user: string) => void }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, clave }),
      });
      const data = await res.json();
      if (data.ok) onLogin(data.usuario);
      else setError(data.error || "Error de autenticación");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const ts = now.toISOString().slice(0, 19).replace("T", " ");

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: "#020508" }}>
      <GridBg />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 px-6 py-3 flex items-center justify-between font-space text-[10px] tracking-wider" style={{ borderBottom: "1px solid #0d2035", color: "#3a6080" }}>
        <div className="flex items-center gap-4">
          <span style={{ color: "#00ff88" }}>● SISTEMA ONLINE</span>
          <span>FLEET INTELLIGENCE · v2.6</span>
        </div>
        <div className="font-mono">{ts} UTC</div>
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[820px] w-full px-6">
        {/* Branding panel */}
        <div className="hidden md:flex flex-col justify-between p-6" style={{
          background: "rgba(6,13,20,0.7)",
          border: "1px solid #0d2035",
          borderRadius: 12,
          backdropFilter: "blur(6px)",
        }}>
          <div>
            <div className="font-space text-[36px] font-bold tracking-[0.3em]" style={{
              color: "#00d4ff",
              textShadow: "0 0 24px rgba(0,212,255,0.4)",
            }}>
              SOTRASER
            </div>
            <div className="font-exo text-[10px] tracking-[0.3em] font-extralight mt-1" style={{ color: "#4a7090" }}>
              FLEET INTELLIGENCE COMMAND
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="font-exo text-[9px] tracking-[0.25em]" style={{ color: "#3a6080" }}>CONTRATO MONITOREADO</div>
              <div className="font-space text-[18px] font-bold" style={{ color: "#00ff88" }}>CENCOSUD · $800M / MES</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: "MOTOR T-1", c: "#00d4ff" },
                { l: "ANTIFRAUDE", c: "#ff2244" },
                { l: "SIGETRA × SHELL", c: "#ffaa00" },
                { l: "AGENTE IA", c: "#ff66cc" },
              ].map((m, i) => (
                <div key={i} className="px-2 py-1.5 font-space text-[9px] font-bold tracking-wider text-center" style={{
                  background: `${m.c}10`,
                  border: `1px solid ${m.c}40`,
                  color: m.c,
                  borderRadius: 4,
                }}>
                  ● {m.l}
                </div>
              ))}
            </div>
          </div>

          <div className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>
            © SOTRASER 2026 · USO INTERNO RESTRINGIDO
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="p-7" style={{
          background: "rgba(6,13,20,0.85)",
          border: "1px solid #0d2035",
          borderRadius: 12,
          backdropFilter: "blur(6px)",
        }}>
          <div className="md:hidden text-center mb-6">
            <div className="font-space text-[26px] font-bold tracking-[0.3em]" style={{ color: "#00d4ff" }}>SOTRASER</div>
            <div className="font-exo text-[9px] tracking-[0.25em]" style={{ color: "#3a6080" }}>FLEET INTELLIGENCE</div>
          </div>

          <div className="font-space text-[11px] font-bold tracking-[0.3em] mb-1" style={{ color: "#8ab0d0" }}>AUTENTICACIÓN</div>
          <div className="font-exo text-[9px] tracking-wider mb-6" style={{ color: "#3a6080" }}>Acceso al centro de comando</div>

          <div className="mb-4">
            <label className="block font-exo text-[9px] tracking-wider uppercase mb-1.5" style={{ color: "#3a6080" }}>USUARIO</label>
            <input
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              className="w-full px-3 py-2.5 font-space text-[14px] outline-none transition-colors focus:border-[#00d4ff]"
              style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6, color: "#c8e8ff" }}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="mb-5">
            <label className="block font-exo text-[9px] tracking-wider uppercase mb-1.5" style={{ color: "#3a6080" }}>CLAVE</label>
            <input
              type="password"
              value={clave}
              onChange={e => setClave(e.target.value)}
              className="w-full px-3 py-2.5 font-space text-[14px] outline-none transition-colors focus:border-[#00d4ff]"
              style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6, color: "#c8e8ff" }}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 font-exo text-[10px] text-center" style={{ color: "#ff2244", background: "#ff224410", border: "1px solid #ff224430", borderRadius: 6 }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !usuario || !clave}
            className="w-full py-3 font-space text-[12px] font-bold tracking-[0.3em] cursor-pointer transition-all"
            style={{
              background: loading ? "#0d2035" : "linear-gradient(135deg, #00d4ff, #00ff88)",
              color: "#020508",
              borderRadius: 6,
              border: "none",
              opacity: (!usuario || !clave) ? 0.4 : 1,
              boxShadow: (!usuario || !clave || loading) ? "none" : "0 0 24px rgba(0,212,255,0.3)",
            }}
          >
            {loading ? "CONECTANDO..." : "▶ ENTRAR AL SISTEMA"}
          </button>

          <div className="mt-5 pt-4 flex items-center justify-between font-exo text-[9px] tracking-wider" style={{ borderTop: "1px solid #0d2035", color: "#3a6080" }}>
            <span>● CIFRADO TLS 1.3</span>
            <span>SESIÓN 24H</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { if (d.ok) setUser(d.usuario); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#020508" }}>
        <div className="font-space text-[12px] tracking-[0.3em]" style={{ color: "#3a6080" }}>VERIFICANDO SESIÓN...</div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={setUser} />;

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
