import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, ChevronRight, X } from "lucide-react";

const CC: Record<string, string> = {
  "ANGLO-COCU": "#00ff88", "ANGLO-CAL": "#ff6b35",
  "ANGLO-CARGAS VARIAS": "#00d4ff",
};

/* ── Modal detalle velocidad ── */
function DetalleVelocidadModal({ patente, onClose }: { patente: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/alertas/detalle-velocidad", patente],
    queryFn: () => fetch(`/api/alertas/detalle-velocidad/${patente}`).then(r => r.json()),
  });
  const { data: hist } = useQuery<any>({
    queryKey: ["/api/alertas/historial-velocidad", patente],
    queryFn: () => fetch(`/api/alertas/historial-velocidad/${patente}?dias=7`).then(r => r.json()),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(2,5,8,0.9)" }} />
      <div className="relative w-full max-w-[550px] m-4"
        style={{ background: "#020508", border: "1px solid #ff224430", borderTop: "3px solid #ff2244" }}
        onClick={e => e.stopPropagation()}>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#ff2244" }} />
          </div>
        ) : data && (
          <>
            {/* Header */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{data.patente}</span>
                  <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{data.conductor}</span>
                  <span className="font-exo text-[11px] px-2 py-0.5" style={{ color: "#ff2244", border: "1px solid #ff224430" }}>EXCESO VELOCIDAD</span>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 cursor-pointer hover:opacity-70">
                <X className="w-4 h-4" style={{ color: "#3a6080" }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #ff224420", borderTop: "2px solid #ff2244" }}>
                  <div className="font-space text-[28px] font-bold" style={{ color: "#ff2244" }}>{data.velocidad_maxima}</div>
                  <div className="font-exo text-xs" style={{ color: "#3a6080" }}>KM/H MAX</div>
                </div>
                <div className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[28px] font-bold" style={{ color: "#ffcc00" }}>+{data.exceso_kmh}</div>
                  <div className="font-exo text-xs" style={{ color: "#3a6080" }}>SOBRE LIMITE</div>
                </div>
                <div className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[28px] font-bold" style={{ color: "#c8e8ff" }}>{data.puntos_exceso}</div>
                  <div className="font-exo text-xs" style={{ color: "#3a6080" }}>REGISTROS</div>
                </div>
              </div>

              {/* Lugar y hora */}
              <div className="px-4 py-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-exo text-xs tracking-wider uppercase mb-1.5" style={{ color: "#3a6080" }}>DONDE Y CUANDO</div>
                <div className="font-rajdhani text-[14px]" style={{ color: "#c8e8ff" }}>{data.lugar_descripcion}</div>
                {data.hora_exceso && (
                  <div className="font-space text-[12px] mt-1" style={{ color: "#ff6b35" }}>
                    Hora del exceso maximo: {data.hora_exceso}
                  </div>
                )}
              </div>

              {/* Timeline de excesos */}
              {data.timeline && data.timeline.length > 1 && (
                <div className="px-4 py-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-xs tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>TIMELINE DE EXCESOS</div>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {data.timeline.slice(0, 8).map((t: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1" style={{ borderBottom: "1px solid #0d203520" }}>
                        <span className="font-space text-xs" style={{ color: "#3a6080" }}>{t.hora}</span>
                        <span className="font-space text-[11px] font-bold" style={{ color: t.velocidad > 105 ? "#ff2244" : "#ffcc00" }}>
                          {t.velocidad} km/h
                        </span>
                        {t.lugar && <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{t.lugar}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Historial 7 días */}
              {hist && hist.dias_con_exceso > 0 && (
                <div className="px-4 py-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-xs tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>ULTIMOS 7 DIAS</div>
                  <div className="flex items-center gap-4 mb-2">
                    <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>
                      {hist.dias_con_exceso} dia{hist.dias_con_exceso > 1 ? "s" : ""} con exceso
                    </span>
                    <span className="font-space text-[11px]" style={{ color: "#ff2244" }}>
                      Max: {hist.velocidad_max_periodo} km/h
                    </span>
                    <span className="font-space text-[11px]" style={{ color: "#3a6080" }}>
                      {hist.pct_tiempo_sobre_limite}% del tiempo
                    </span>
                  </div>
                  <div className="space-y-1">
                    {hist.historial.slice(0, 5).map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1" style={{ borderBottom: "1px solid #0d203520" }}>
                        <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{d.fecha}</span>
                        <span className="font-space text-xs font-bold" style={{ color: d.velocidad_max > 105 ? "#ff2244" : "#ffcc00" }}>
                          {d.velocidad_max} km/h
                        </span>
                        <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{d.puntos_exceso} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Componente principal ── */
interface CerebroProps {
  onVerContrato?: (contrato: string) => void;
  onOpenIA?: () => void;
  onInvestigar?: (patente: string) => void;
  onOpenSplash?: () => void;
  onNavigateFlota?: () => void;
}

export default function Cerebro({ onInvestigar, onOpenSplash }: CerebroProps) {
  const [alertaIdx, setAlertaIdx] = useState(0);
  const [detallePatente, setDetallePatente] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: estado, isLoading } = useQuery<any>({
    queryKey: ["/api/cerebro/estado-general"], refetchInterval: 60000,
  });
  const { data: alertas } = useQuery<any[]>({
    queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 60000,
  });
  const { data: sysEst } = useQuery<any>({
    queryKey: ["/api/sistema/estado"], refetchInterval: 300000,
  });

  const criticas = useMemo(() => {
    if (!alertas) return [];
    return alertas.filter((a: any) => a.nivel === "CRITICO" || a.tipo === "RENDIMIENTO" || a.severidad === "CRITICA");
  }, [alertas]);

  const revisar = useMemo(() => {
    if (!alertas) return [];
    return alertas.filter((a: any) => a.nivel === "REVISAR" || a.nivel === "SOSPECHOSO" || a.severidad === "ALTA");
  }, [alertas]);

  const [feedbackSent, setFeedbackSent] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);

  const enviarFeedback = useCallback(async (alerta: any, decision: string) => {
    setSending(true);
    try {
      const nota = decision === "FALSA_ALARMA" ? window.prompt("Motivo (opcional):") || undefined : undefined;
      await fetch("/api/feedback/alerta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertaTipo: alerta.tipo,
          entidadTipo: "CAMION",
          entidadId: alerta.patente,
          contrato: alerta.contrato,
          decision, nota,
          valorDetectado: alerta.valorReciente || alerta.dato,
          umbralUsado: alerta.valorHistorico,
          parametroAfectado: alerta.parametro || "rendimiento_kmL",
        }),
      });
      setFeedbackSent(prev => new Set(prev).add(alertaIdx));
      queryClient.invalidateQueries({ queryKey: ["/api/cerebro/camiones-alerta"] });
      if (alertaIdx < criticas.length - 1) {
        setTimeout(() => setAlertaIdx(i => i + 1), 600);
      }
    } catch (e) { console.error(e); }
    setSending(false);
  }, [alertaIdx, criticas.length, queryClient]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3a6080" }} /></div>;
  }

  const activos = estado?.camiones_activos || 0;
  const rend = estado?.rendimiento_promedio || 0;
  const hayCriticas = criticas.length > 0;
  const currentAlerta = criticas[alertaIdx];

  return (<>
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }} data-testid="cerebro-page">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ background: "#091018", borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-3">
          <span className="font-space text-[15px] font-bold tracking-[0.2em]" style={{ color: "#c8e8ff" }}>TOWER CONTROL</span>
          <span className="font-exo text-xs px-2 py-0.5"
            style={{ background: "#00ff8815", color: "#00ff88", border: "1px solid #00ff8830" }}>EN VIVO</span>
        </div>
        <div className="flex items-center gap-4 font-exo text-xs" style={{ color: "#3a6080" }}>
          <span>● GPS sync{sysEst?.ultimo_sync_hace ? ` hace ${sysEst.ultimo_sync_hace}` : ""}</span>
          <span>{activos} activos</span>
          <span>{rend > 0 ? `${rend} km/L` : ""}</span>
        </div>
      </div>

      {/* Semáforo */}
      <div className="flex items-center justify-center gap-8 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[20px] font-bold" style={{ color: "#ff2244" }}>{criticas.length}</span>
          <span className="font-exo text-[11px] tracking-wider" style={{ color: "#ff2244" }}>CRITICAS</span>
        </div>
        <span style={{ color: "#0d2035" }}>·</span>
        <div className="flex items-center gap-2">
          <span className="font-space text-[20px] font-bold" style={{ color: "#ffcc00" }}>{revisar.length}</span>
          <span className="font-exo text-[11px] tracking-wider" style={{ color: "#ffcc00" }}>REVISAR</span>
        </div>
        <span style={{ color: "#0d2035" }}>·</span>
        <div className="flex items-center gap-2">
          <span className="font-space text-[20px] font-bold" style={{ color: "#00ff88" }}>{Math.max(activos - criticas.length - revisar.length, 0)}</span>
          <span className="font-exo text-[11px] tracking-wider" style={{ color: "#00ff88" }}>NORMAL</span>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 flex items-center justify-center px-6">
        {hayCriticas && currentAlerta ? (
          <div className="w-full max-w-[600px]">
            <div className="p-6" style={{ background: "#ff224408", border: "1px solid #ff224430" }}>
              {/* Header alerta */}
              <div className="flex items-center gap-3 mb-4">
                <span className="font-exo text-[11px] font-bold px-2 py-0.5"
                  style={{ color: "#ff2244", background: "#ff224415", border: "1px solid #ff224430" }}>
                  {currentAlerta.tipo === "VELOCIDAD" ? "EXCESO VELOCIDAD" : "CRITICA"}
                </span>
                <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{currentAlerta.patente}</span>
                {currentAlerta.conductor && <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{currentAlerta.conductor}</span>}
                <span className="font-exo text-[11px] px-1.5 py-0.5"
                  style={{ color: CC[currentAlerta.contrato] || "#3a6080", border: `1px solid ${CC[currentAlerta.contrato] || "#0d2035"}30` }}>
                  {currentAlerta.contrato}
                </span>
              </div>

              {/* Descripción */}
              <div className="font-rajdhani text-[16px] leading-relaxed mb-1" style={{ color: "#c8e8ff" }}>
                {currentAlerta.descripcion}
              </div>
              <div className="font-space text-[13px] mb-4" style={{ color: "#ff6b35" }}>
                {currentAlerta.dato}
              </div>

              {/* Ver detalle (solo velocidad) */}
              {currentAlerta.tipo === "VELOCIDAD" && (
                <button onClick={() => setDetallePatente(currentAlerta.patente)}
                  className="mb-4 px-4 py-2 font-exo text-xs font-bold tracking-wider cursor-pointer transition-all hover:opacity-80"
                  style={{ background: "#ff224410", border: "1px solid #ff224430", color: "#ff2244" }}>
                  VER DETALLE · LUGAR Y HORARIO
                </button>
              )}

              {/* Botones */}
              {feedbackSent.has(alertaIdx) ? (
                <div className="font-exo text-[11px] py-2" style={{ color: "#00ff88" }}>
                  ✓ Registrado — el sistema ajusto sus parametros
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={() => enviarFeedback(currentAlerta, "CONFIRMADO")} disabled={sending}
                    className="px-6 py-2.5 font-exo text-[11px] font-bold cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
                    style={{ background: "#00ff8810", border: "1px solid #00ff8840", color: "#00ff88" }}>
                    ✓ CONFIRMAR
                  </button>
                  <button onClick={() => enviarFeedback(currentAlerta, "FALSA_ALARMA")} disabled={sending}
                    className="px-6 py-2.5 font-exo text-[11px] font-bold cursor-pointer transition-all hover:opacity-80 disabled:opacity-40"
                    style={{ background: "transparent", border: "1px solid #0d2035", color: "#3a6080" }}>
                    ✗ FALSA ALARMA
                  </button>
                </div>
              )}
            </div>

            {/* Navegación */}
            <div className="flex items-center justify-between mt-4">
              <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{alertaIdx + 1} de {criticas.length} criticas</span>
              <div className="flex items-center gap-2">
                {criticas.map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full cursor-pointer" onClick={() => setAlertaIdx(i)}
                    style={{ background: i === alertaIdx ? "#ff2244" : "#0d2035" }} />
                ))}
              </div>
              {alertaIdx < criticas.length - 1 ? (
                <button onClick={() => setAlertaIdx(i => i + 1)}
                  className="flex items-center gap-1 font-exo text-xs font-bold cursor-pointer hover:opacity-80"
                  style={{ color: "#ff2244" }}>
                  SIGUIENTE <ChevronRight className="w-3 h-3" />
                </button>
              ) : (
                <span className="font-exo text-xs" style={{ color: "#3a6080" }}>ultima</span>
              )}
            </div>
          </div>
        ) : (
          /* Todo normal */
          <div className="text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#00ff88", opacity: 0.6 }} />
            <div className="font-space text-[20px] font-bold tracking-[0.2em] mb-6" style={{ color: "#00ff88" }}>TODO NORMAL</div>
            <div className="flex items-center justify-center gap-12 mb-8">
              {[
                { value: activos, label: "activos" },
                { value: rend > 0 ? `${rend}` : "--", label: "km/L" },
                { value: `${estado?.km_hoy || 0}`, label: "km hoy" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="font-space text-[32px] font-bold" style={{ color: "#c8e8ff" }}>{s.value}</div>
                  <div className="font-exo text-xs tracking-wider" style={{ color: "#3a6080" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 mb-4">
              {[
                { label: "GPS sync", ok: sysEst?.gps_activo !== false, detail: sysEst?.ultimo_sync_hace },
                { label: "Aprendizaje", ok: sysEst?.aprendizaje_activo !== false },
                { label: "Sigetra", ok: sysEst?.sigetra_activo !== false },
              ].map(j => (
                <div key={j.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: j.ok ? "#00ff88" : "#ff2244" }} />
                  <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{j.label}{j.detail ? ` hace ${j.detail}` : ""}</span>
                </div>
              ))}
            </div>
            {revisar.length > 0 && (
              <div className="font-exo text-xs" style={{ color: "#ffcc00" }}>{revisar.length} en revisar — sin urgencia</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {hayCriticas && (
        <div className="flex items-center justify-center gap-4 py-2 flex-shrink-0" style={{ borderTop: "1px solid #0d2035" }}>
          <button onClick={() => onOpenSplash?.()} className="font-exo text-[11px] cursor-pointer hover:opacity-80" style={{ color: "#00d4ff" }}>
            Sistema Inteligente →
          </button>
        </div>
      )}
    </div>

    {/* Modal detalle velocidad */}
    {detallePatente && (
      <DetalleVelocidadModal patente={detallePatente} onClose={() => setDetallePatente(null)} />
    )}
  </>);
}
