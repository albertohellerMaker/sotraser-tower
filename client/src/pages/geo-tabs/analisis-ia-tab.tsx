import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Cpu, RefreshCw } from "lucide-react";

export default function AnalisisIATab() {
  const [analizando, setAnalizando] = useState(false);
  const [progreso, setProgreso] = useState<{ paso: string; progreso: number; total: number; detalles?: string } | null>(null);

  const { data: analisis, isLoading } = useQuery<any>({
    queryKey: ["/api/geo/analisis-ia"],
  });

  const generarMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/geo/analisis-ia/generar"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geo/analisis-ia"] });
    },
  });

  const handleAnalizarHistorico = async () => {
    setAnalizando(true);
    setProgreso({ paso: "Iniciando...", progreso: 0, total: 1 });
    try {
      const res = await fetch("/api/geo/analizar-historico", { method: "POST" });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) {
            const text = decoder.decode(value);
            const lines = text.split("\n").filter(l => l.startsWith("data: "));
            for (const line of lines) {
              try {
                const data = JSON.parse(line.replace("data: ", ""));
                setProgreso(data);
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setAnalizando(false);
      queryClient.invalidateQueries({ queryKey: ["/api/geo/lugares"] });
      queryClient.invalidateQueries({ queryKey: ["/api/geo/lugares/stats"] });
    }
  };

  const secciones = useMemo(() => {
    if (!analisis?.resumenTexto) return [];
    const text = analisis.resumenTexto as string;
    const titles = ["PATRONES DE RUTA:", "LOCALES CENCOSUD DETECTADOS:", "TIEMPOS DE PERMANENCIA:", "ANOMALIAS DETECTADAS:", "RECOMENDACIONES:"];
    const parts: { titulo: string; contenido: string }[] = [];
    let rest = text;

    for (let i = 0; i < titles.length; i++) {
      const idx = rest.indexOf(titles[i]);
      if (idx >= 0) {
        const nextIdx = i + 1 < titles.length ? rest.indexOf(titles[i + 1]) : rest.length;
        const contenido = rest.substring(idx + titles[i].length, nextIdx > idx ? nextIdx : rest.length).trim();
        parts.push({ titulo: titles[i].replace(":", ""), contenido });
        if (nextIdx > idx) rest = rest.substring(nextIdx);
      }
    }
    if (parts.length === 0 && text.length > 0) {
      parts.push({ titulo: "ANALISIS", contenido: text });
    }
    return parts;
  }, [analisis]);

  const haceMinutos = analisis?.generadoAt
    ? Math.round((Date.now() - new Date(analisis.generadoAt).getTime()) / 60000)
    : null;

  const seccionColors = ["#00d4ff", "#00c97a", "#ffcc00", "#ff2244", "#c8e8ff"];

  return (
    <div data-testid="geo-ia">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-space text-[16px] font-bold tracking-[0.12em]" style={{ color: "#c8e8ff" }}>
            ANALISIS INTELIGENTE DE OPERACION
          </h2>
          <p className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Basado en GPS historico desde 01-03-2026
          </p>
        </div>
        <div className="flex items-center gap-3">
          {haceMinutos !== null && (
            <span className="font-exo text-xs" style={{ color: "#3a6080" }}>
              Ultimo analisis: {haceMinutos < 60 ? `hace ${haceMinutos}min` : haceMinutos < 1440 ? `hace ${Math.floor(haceMinutos / 60)}h` : `hace ${Math.floor(haceMinutos / 1440)}d`}
            </span>
          )}
          <button onClick={() => generarMutation.mutate()}
            disabled={generarMutation.isPending}
            className="font-exo text-xs font-bold px-3 py-2 rounded cursor-pointer"
            style={{ background: "#00d4ff20", border: "1px solid #00d4ff", color: "#00d4ff" }}
            data-testid="btn-generar-ia">
            <Cpu className={`w-3 h-3 inline mr-1 ${generarMutation.isPending ? "animate-spin" : ""}`} />
            {generarMutation.isPending ? "Generando..." : "Generar nuevo analisis"}
          </button>
        </div>
      </div>

      <div className="dash-card p-4 mb-4" style={{ borderLeft: "3px solid #00d4ff" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-space text-[12px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>
            ANALIZAR HISTORIAL COMPLETO
          </span>
        </div>
        <p className="font-exo text-[11px] mb-3" style={{ color: "#3a6080" }}>
          Procesa todos los puntos GPS desde 01-03-2026, detecta paradas, identifica locales CENCOSUD via OpenStreetMap, y reconstruye viajes historicos.
        </p>
        <button onClick={handleAnalizarHistorico}
          disabled={analizando}
          className="font-exo text-[11px] font-bold px-4 py-2 rounded cursor-pointer"
          style={{ background: analizando ? "#3a608020" : "#00c97a20", border: `1px solid ${analizando ? "#3a6080" : "#00c97a"}`, color: analizando ? "#3a6080" : "#00c97a" }}
          data-testid="btn-analizar-historico">
          <RefreshCw className={`w-3 h-3 inline mr-1 ${analizando ? "animate-spin" : ""}`} />
          {analizando ? "Analizando..." : "Analizar historial desde 01-03-2026"}
        </button>
        {progreso && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{progreso.paso}</span>
              <span className="font-space text-xs" style={{ color: "#3a6080" }}>{progreso.progreso}/{progreso.total}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${progreso.total > 0 ? (progreso.progreso / progreso.total) * 100 : 0}%`,
                background: "#00c97a",
              }} />
            </div>
            {progreso.detalles && (
              <span className="font-exo text-[11px] mt-1 block" style={{ color: "#3a6080" }}>{progreso.detalles}</span>
            )}
          </div>
        )}
      </div>

      {generarMutation.isPending && (
        <div className="text-center py-12 dash-card mb-4">
          <Cpu className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#00d4ff" }} />
          <div className="font-space text-[13px] font-bold" style={{ color: "#00d4ff" }}>Generando analisis con IA...</div>
          <div className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>Procesando datos de viajes, lugares y anomalias</div>
        </div>
      )}

      {secciones.length > 0 ? (
        <div className="space-y-3">
          {secciones.map((s, i) => (
            <div key={i} className="dash-card p-4" style={{ borderLeft: `3px solid ${seccionColors[i % seccionColors.length]}` }}
              data-testid={`ia-seccion-${i}`}>
              <div className="font-space text-[12px] font-bold tracking-wider mb-2" style={{ color: seccionColors[i % seccionColors.length] }}>
                {s.titulo}
              </div>
              <div className="font-exo text-[11px] leading-relaxed whitespace-pre-line" style={{ color: "#c8e8ff" }}>
                {s.contenido}
              </div>
            </div>
          ))}
        </div>
      ) : !generarMutation.isPending && (
        <div className="text-center py-12 dash-card">
          <Cpu className="w-8 h-8 mx-auto mb-3" style={{ color: "#3a6080" }} />
          <div className="font-space text-[13px] font-bold" style={{ color: "#3a6080" }}>Sin analisis generado</div>
          <div className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>
            Presiona "Generar nuevo analisis" para crear un reporte con IA
          </div>
        </div>
      )}

      {analisis?.resultadoJson && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="dash-card px-4 py-3">
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>VIAJES ANALIZADOS</div>
            <div className="font-space text-xl font-bold" style={{ color: "#00d4ff" }}>{analisis.resultadoJson.totalViajes || 0}</div>
          </div>
          <div className="dash-card px-4 py-3">
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>KM GPS TOTAL</div>
            <div className="font-space text-xl font-bold" style={{ color: "#00c97a" }}>{(analisis.resultadoJson.totalKmGps || 0).toLocaleString()}</div>
          </div>
          <div className="dash-card px-4 py-3">
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CAMIONES</div>
            <div className="font-space text-xl font-bold" style={{ color: "#c8e8ff" }}>{analisis.resultadoJson.camionesAnalizados || 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}
