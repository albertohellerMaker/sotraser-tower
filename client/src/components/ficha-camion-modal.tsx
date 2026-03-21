import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusTag, getStatusVariant } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Faena } from "@shared/schema";
import { type CamionStats, type Percentiles, fN, fK, fL, f$, PRECIO, rendColor, statusColor, rendColorPercentil, getNivelPercentil, getPercentilCamion, getPercentilLabel } from "@/lib/fuel-utils";

function RutaPuntosTab({ camId, patente }: { camId: number; patente: string }) {
  const [puntos, setPuntos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/puntos-ruta?camionId=${camId}`)
      .then(r => r.json())
      .then(setPuntos)
      .catch(() => {});
  }, [camId]);

  const detectarPuntos = async () => {
    setDetecting(true);
    try {
      const res = await apiRequest("POST", "/api/ia/detectar-puntos", { camionId: camId });
      const data = await res.json();
      if (data.puntos) setPuntos(prev => [...prev, ...data.puntos]);
      if (data.resumen) setResumen(data.resumen);
    } catch (e: any) {
      console.error("Error detecting points:", e.message);
    } finally {
      setDetecting(false);
    }
  };

  const confirmarPunto = async (id: number) => {
    try {
      await apiRequest("POST", `/api/puntos-ruta/${id}/confirmar`, { confirmadoPor: "admin" });
      setPuntos(prev => prev.map(p => p.id === id ? { ...p, confirmado: true } : p));
    } catch {}
  };

  const tipoColors: Record<string, string> = {
    COMBUSTIBLE: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    CARGA: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    ENTREGA: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    DESCANSO: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  };

  return (
    <div className="space-y-4" data-testid="ruta-puntos-tab">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-mono text-primary tracking-[0.15em] uppercase">
          RUTA Y PUNTOS — {patente}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={detectarPuntos}
          disabled={detecting}
          data-testid="btn-detectar-puntos"
        >
          {detecting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <MapPin className="w-3 h-3 mr-1" />}
          Detectar puntos automatico
        </Button>
      </div>

      {resumen && (
        <div className="p-3 border bg-primary/5 border-primary/20">
          <div className="text-[8px] font-mono text-primary tracking-[0.2em] mb-1">RESUMEN RUTA</div>
          <div className="text-[11px] leading-relaxed" style={{ color: "#D4E4F4" }}>{resumen}</div>
        </div>
      )}

      {puntos.length === 0 && !detecting && (
        <div className="py-8 text-center text-muted-foreground font-mono text-xs" data-testid="text-no-puntos">
          Sin puntos de ruta detectados. Use "Detectar puntos automatico" para analizar.
        </div>
      )}

      {detecting && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-mono" style={{ color: "#5A7A9A" }}>Analizando datos de ruta con IA...</span>
        </div>
      )}

      {puntos.length > 0 && (
        <div className="bg-background border border-border">
          <div className="grid grid-cols-[100px_1fr_80px_80px_80px] px-3 py-1.5 border-b border-border text-[8px] font-mono text-muted-foreground tracking-[0.15em]">
            <div>TIPO</div><div>NOMBRE INFERIDO</div><div>FRECUENCIA</div><div>L. PROM</div><div>CONFIRMADO</div>
          </div>
          {puntos.map((p, i) => (
            <div key={p.id || i} className={`grid grid-cols-[100px_1fr_80px_80px_80px] px-3 py-2 items-center ${i < puntos.length - 1 ? "border-b border-border/20" : ""}`} data-testid={`punto-row-${p.id || i}`}>
              <span className={`px-2 py-0.5 text-[9px] font-mono font-bold border w-fit ${tipoColors[p.tipo] || "text-gray-400 bg-gray-400/10 border-gray-400/30"}`}>
                {p.tipo || "N/A"}
              </span>
              <div className="text-[11px] font-mono" style={{ color: "#D4E4F4" }}>{p.nombreInferido || "Sin nombre"}</div>
              <div className="text-[11px] font-mono text-muted-foreground">{p.frecuencia || "-"}</div>
              <div className="text-[11px] font-mono text-muted-foreground">{p.litrosPromedio ? `${p.litrosPromedio}L` : "-"}</div>
              <div>
                {p.confirmado ? (
                  <span className="text-emerald-400 text-[10px] font-mono flex items-center gap-1"><CheckCircle className="w-3 h-3" /> SI</span>
                ) : (
                  <button onClick={() => confirmarPunto(p.id)} className="text-[10px] font-mono text-primary cursor-pointer hover:underline" data-testid={`btn-confirmar-${p.id || i}`}>
                    Confirmar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FichaCamionModalProps {
  cam: CamionStats;
  faenas: Faena[];
  open: boolean;
  onClose: () => void;
}

export function FichaCamionModal({ cam, faenas, open, onClose }: FichaCamionModalProps) {
  const faena = faenas.find(f => f.id === cam.faenaId);
  const costoRal = cam.horasRalenti ? Math.round(cam.horasRalenti * 8 * PRECIO) : 0;
  const [fichaTab, setFichaTab] = useState<"detalle" | "ruta">("detalle");
  const { data: percentiles } = useQuery<Percentiles>({ queryKey: ["/api/flota/percentiles"] });

  const totS = cam.cargasAnalizadas.reduce((a, c) => a + c.litrosSurtidor, 0);
  const totE = cam.cargasAnalizadas.reduce((a, c) => a + c.litrosEcu, 0);

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setFichaTab("detalle"); }}>
      <DialogContent className="max-w-[860px] bg-card border-border p-0 gap-0 overflow-y-auto max-h-[92vh]">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground">
            Ficha — {cam.patente}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-3 flex gap-1">
          {(["detalle", "ruta"] as const).map(t => (
            <button key={t} onClick={() => setFichaTab(t)}
              data-testid={`ficha-tab-${t}`}
              className={`px-4 py-2 text-[10px] font-mono font-bold tracking-[0.15em] uppercase cursor-pointer border-b-2 transition-colors ${
                fichaTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}>
              {t === "detalle" ? "DETALLE" : "RUTA Y PUNTOS"}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">
          {fichaTab === "ruta" ? (
            <RutaPuntosTab camId={cam.id} patente={cam.patente} />
          ) : (
          <>
          <div
            className="bg-background border border-border p-4 flex justify-between items-center"
            style={{ borderLeftWidth: 4, borderLeftColor: cam.estado === "CRITICO" ? "#FF2D4A" : cam.estado === "ALERTA" ? "#FFB020" : "#00C87A" }}
          >
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-mono font-bold text-primary" data-testid="text-patente">{cam.patente}</span>
                <StatusTag label={cam.estado} variant={getStatusVariant(cam.estado)} dot />
                {faena && <StatusTag label={faena.nombre} variant="custom" color={faena.color} />}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">
                {cam.modelo} · VIN: {cam.vin || "\u2014"} · Conductor: <span className="text-foreground">{cam.conductor || "\u2014"}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-mono text-muted-foreground mb-0.5">SYNC VOLVO CONNECT</div>
              <div className={`text-[11px] font-mono ${cam.syncOk ? "text-emerald-400" : "text-red-400"}`}>
                {cam.syncOk ? `● ${cam.syncAt}` : "✕ Sin sincronizar"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[9px] font-mono text-primary tracking-[0.15em] uppercase mb-2.5">
                VOLVO CONNECT — ECU
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { l: "Odometro", v: fK(cam.odometro), c: "#1A8FFF" },
                  {
                    l: "Rendimiento",
                    v: cam.rendProm ? `${cam.rendProm} km/L` : "\u2014",
                    c: cam.rendProm && percentiles && !percentiles.calibrando
                      ? (getNivelPercentil(cam.rendProm, percentiles) === "EXCELENTE" ? "#00C87A"
                        : getNivelPercentil(cam.rendProm, percentiles) === "BUENO" ? "#66D9A0"
                        : getNivelPercentil(cam.rendProm, percentiles) === "NORMAL" ? "#60A5FA"
                        : getNivelPercentil(cam.rendProm, percentiles) === "BAJO" ? "#FFB020"
                        : "#FF2D4A")
                      : cam.rendProm ? (cam.rendProm >= cam.metaKmL ? "#00C87A" : cam.rendProm >= cam.metaKmL * 0.9 ? "#FFB020" : "#FF2D4A") : undefined,
                    sub: percentiles && !percentiles.calibrando && cam.rendProm
                      ? `${getNivelPercentil(cam.rendProm, percentiles)} · P90: ${percentiles.p90.toFixed(2)}`
                      : undefined
                  },
                  { l: "Vel. promedio", v: cam.velPromedio ? `${cam.velPromedio} km/h` : "\u2014" },
                  { l: "Horas motor", v: `${fN(cam.horasMotor)} h` },
                  { l: "Horas ralenti", v: `${fN(cam.horasRalenti)} h`, c: cam.pctRal && cam.pctRal > 15 ? "#FFB020" : undefined, sub: `${cam.pctRal}% motor · ${f$(costoRal)} perdidos` },
                  {
                    l: "Ref. Percentil",
                    v: percentiles && !percentiles.calibrando ? `P90: ${percentiles.p90.toFixed(1)}` : `Meta: ${cam.metaKmL}`,
                    sub: percentiles && !percentiles.calibrando ? `P75: ${percentiles.p75.toFixed(1)} · P50: ${percentiles.p50.toFixed(1)}` : undefined
                  },
                ].map((k, i) => (
                  <div key={i} className="bg-background border border-border p-2.5" data-testid={`ecu-${k.l.toLowerCase().replace(/\s/g, "-")}`}>
                    <div className="text-[8px] font-mono text-muted-foreground tracking-[0.15em] mb-0.5 uppercase">
                      {k.l}
                    </div>
                    <div className="text-base font-mono font-bold" style={{ color: k.c || "hsl(var(--foreground))" }}>
                      {k.v}
                    </div>
                    {k.sub && <div className="text-[9px] text-muted-foreground mt-0.5">{k.sub}</div>}
                  </div>
                ))}
              </div>

              {cam.pctRal && cam.pctRal > 15 && (
                <div className="bg-amber-400/5 border border-amber-400/20 p-2.5 text-[11px] text-amber-400 font-mono">
                  Ralenti excesivo ({cam.pctRal}%). Consumo sin avance. Revisar habitos de conduccion.
                </div>
              )}
            </div>

            <div>
              <div className="text-[9px] font-mono text-amber-400 tracking-[0.15em] uppercase mb-2.5">
                CUADRATURA TARJETA vs ECU
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2.5">
                {[
                  { l: "Total surtidor", v: fL(totS) },
                  { l: "Total ECU", v: fL(totE), c: "#00C87A" },
                  { l: "Litros desviados", v: fL(cam.litDesv), c: cam.litDesv > 0 ? "#FF2D4A" : "#00C87A" },
                  { l: "Costo desviado", v: f$(cam.litDesv * PRECIO), c: cam.litDesv > 0 ? "#FF2D4A" : "#00C87A" },
                ].map((k, i) => (
                  <div key={i} className="bg-background border border-border p-2.5">
                    <div className="text-[8px] font-mono text-muted-foreground tracking-[0.15em] mb-0.5 uppercase">{k.l}</div>
                    <div className="text-[15px] font-mono font-bold" style={{ color: k.c || "hsl(var(--foreground))" }}>{k.v}</div>
                  </div>
                ))}
              </div>

              <div className="bg-background border border-border">
                <div className="grid grid-cols-6 px-3 py-1.5 border-b border-border text-[8px] font-mono text-muted-foreground tracking-[0.15em]">
                  <div>FECHA</div><div>SURT.</div><div>ECU</div><div>DIF</div><div>REND.</div><div>ESTADO</div>
                </div>
                {cam.cargasAnalizadas.map((c, i) => (
                  <div
                    key={c.id}
                    className={`grid grid-cols-6 px-3 py-2 items-center ${i < cam.cargasAnalizadas.length - 1 ? "border-b border-border/20" : ""} ${c.estado === "CRITICO" ? "bg-red-500/5" : ""}`}
                    data-testid={`carga-row-${c.id}`}
                  >
                    <div className="text-[11px] font-mono text-muted-foreground">{c.fecha.slice(5)}</div>
                    <div className="text-xs font-mono text-foreground">{c.litrosSurtidor}L</div>
                    <div className="text-xs font-mono text-emerald-400">{c.litrosEcu}L</div>
                    <div className={`text-xs font-mono font-bold ${c.estado === "CRITICO" ? "text-red-400" : c.estado === "ALERTA" ? "text-amber-400" : "text-emerald-400"}`}>
                      {c.dif > 0 ? `+${c.dif}` : c.dif}L
                    </div>
                    <div className={`text-[11px] font-mono ${rendColor(c.rend, cam.metaKmL)}`}>
                      {c.rend ?? "\u2014"}
                    </div>
                    <StatusTag label={c.estado} variant={getStatusVariant(c.estado)} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {cam.estado === "CRITICO" && (
            <div className="flex gap-2 justify-end pt-3 border-t border-border">
              <Button variant="outline" size="sm" data-testid="button-marcar-revisado">Marcar revisado</Button>
              <Button variant="secondary" size="sm" className="bg-amber-400/20 text-amber-400 border-amber-400/30" data-testid="button-notificar">
                Notificar cliente
              </Button>
              <Button variant="destructive" size="sm" data-testid="button-escalar">
                Escalar a gerencia
              </Button>
            </div>
          )}
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
