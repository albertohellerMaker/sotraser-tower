import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import WiseTrackApp from "@/pages/wisetrack-app";
import "leaflet/dist/leaflet.css";

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const dur = 2000;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 30;
      setProgress(Math.min((elapsed / dur) * 100, 100));
      if (elapsed >= dur) { clearInterval(timer); setTimeout(onDone, 300); }
    }, 30);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center" style={{ background: '#020508' }}>
      <div className="font-space text-[32px] font-bold tracking-[0.3em] mb-1" style={{ color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.3)' }}>
        SOTRASER
      </div>
      <div className="font-exo text-[11px] tracking-[0.3em] font-extralight mb-8" style={{ color: '#4a7090' }}>
        PLATAFORMA INTEGRADA DE FLOTA
      </div>
      <div className="w-64 h-1 overflow-hidden mb-4" style={{ background: '#0d2035' }}>
        <div className="h-full transition-all duration-100" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #00d4ff, #00ff88)' }} />
      </div>
      <div className="font-exo text-[11px] tracking-wider" style={{ color: '#4a7090' }}>
        Conectando sistemas...
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
      if (data.ok) {
        onLogin(data.usuario);
      } else {
        setError(data.error || "Error de autenticación");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#020508" }}>
      <form onSubmit={handleSubmit} className="w-[340px] p-8" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 12 }}>
        <div className="text-center mb-8">
          <div className="font-space text-[28px] font-bold tracking-[0.3em] mb-1" style={{ color: "#00d4ff", textShadow: "0 0 20px rgba(0,212,255,0.3)" }}>
            SOTRASER
          </div>
          <div className="font-exo text-[10px] tracking-[0.2em]" style={{ color: "#3a6080" }}>
            PLATAFORMA INTEGRADA DE FLOTA
          </div>
        </div>

        <div className="mb-4">
          <label className="block font-exo text-[9px] tracking-wider uppercase mb-1.5" style={{ color: "#3a6080" }}>USUARIO</label>
          <input
            type="text"
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
            className="w-full px-3 py-2.5 font-space text-[14px] outline-none"
            style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6, color: "#c8e8ff" }}
            autoFocus
          />
        </div>

        <div className="mb-6">
          <label className="block font-exo text-[9px] tracking-wider uppercase mb-1.5" style={{ color: "#3a6080" }}>CLAVE</label>
          <input
            type="password"
            value={clave}
            onChange={e => setClave(e.target.value)}
            className="w-full px-3 py-2.5 font-space text-[14px] outline-none"
            style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6, color: "#c8e8ff" }}
          />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 font-exo text-[10px] text-center" style={{ color: "#ff2244", background: "#ff224410", border: "1px solid #ff224430", borderRadius: 6 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !usuario || !clave}
          className="w-full py-3 font-space text-[12px] font-bold tracking-wider cursor-pointer transition-all"
          style={{
            background: loading ? "#0d2035" : "linear-gradient(135deg, #00d4ff, #00ff88)",
            color: "#020508",
            borderRadius: 6,
            border: "none",
            opacity: (!usuario || !clave) ? 0.4 : 1,
          }}
        >
          {loading ? "CONECTANDO..." : "ENTRAR"}
        </button>
      </form>
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
        <div className="font-space text-[14px] tracking-wider" style={{ color: "#3a6080" }}>Verificando sesión...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

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
