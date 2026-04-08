import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Play, Pause, SkipBack, MapPin, Gauge, Clock, Route, CheckCircle, XCircle, Target, Flag, Navigation, ArrowRight, Eye, EyeOff, Layers, Info, Truck } from "lucide-react";
import { LeafletMap, DivMarker, FitBounds } from "@/components/leaflet-map";
import { Polyline } from "react-leaflet";

interface Props {
  viajeId: number;
  onClose: () => void;
}

interface PuntoGps {
  lat: number;
  lng: number;
  ts: string;
  vel: number;
  rumbo: number;
}

interface CorredorData {
  nombre: string;
  origen_nombre: string;
  destino_nombre: string;
  olat: number;
  olng: number;
  dlat: number;
  dlng: number;
  km_promedio: number;
  rendimiento_promedio: number;
  duracion_promedio_min: number;
}

const velColor = (v: number) => {
  if (v <= 0) return "#3a6080";
  if (v < 40) return "#00d4ff";
  if (v < 60) return "#00ff88";
  if (v < 80) return "#fbbf24";
  if (v < 100) return "#ff6b35";
  return "#ff2244";
};

const RC = (r: number | null) =>
  !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";

export default function ViajeMapaModal({ viajeId, onClose }: Props) {
  const [data, setData] = useState<{ viaje: any; puntos: PuntoGps[]; corredor: CorredorData | null; has_real_gps?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showGps, setShowGps] = useState(true);
  const [showPropuesto, setShowPropuesto] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<string | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/viajes-tms/viaje-gps/${viajeId}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(d => {
        if (d.error) { setError(d.error); }
        else {
          setData(d);
          if (d.viaje?.estado === "APROBADO" || d.viaje?.estado === "RECHAZADO") {
            setValidated(d.viaje.estado);
          }
        }
        setLoading(false);
      })
      .catch(e => { if (e.name !== "AbortError") { setError("Error de conexion"); setLoading(false); } });
    return () => ctrl.abort();
  }, [viajeId]);

  useEffect(() => {
    if (!playing || !data?.puntos?.length) return;
    const animate = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;
      setProgress(prev => {
        const next = prev + (delta / (30000 / speed));
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      animRef.current = requestAnimationFrame(animate);
    };
    lastTimeRef.current = 0;
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, speed, data]);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  const handleValidate = useCallback(async (decision: "APROBADO" | "RECHAZADO") => {
    setValidating(true);
    try {
      setValidateError(null);
      const resp = await fetch(`/api/viajes-tms/viaje-validar/${viajeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (resp.ok) {
        setValidated(decision);
      } else {
        const body = await resp.json().catch(() => ({}));
        setValidateError(body.error || `Error ${resp.status}`);
        setTimeout(() => setValidateError(null), 4000);
      }
    } catch (e) {
      console.error("Error validando viaje:", e);
      setValidateError("Error de conexión");
      setTimeout(() => setValidateError(null), 4000);
    }
    setValidating(false);
  }, [viajeId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "#00d4ff", borderTopColor: "transparent" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando ruta GPS...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
        <div className="p-6 rounded-lg text-center" style={{ background: "#060d14", border: "1px solid #ff224430" }}>
          <div className="font-exo text-[12px] mb-3" style={{ color: "#ff2244" }}>{error || "Sin datos"}</div>
          <button onClick={onClose} className="font-exo text-[10px] px-4 py-2 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>Cerrar</button>
        </div>
      </div>
    );
  }

  const { viaje: v, puntos, corredor } = data;
  const hasRealGps = data.has_real_gps === true;
  const hasGps = hasRealGps && puntos.length >= 2;
  const hasOriginDest = v.olat != null && v.olng != null && v.dlat != null && v.dlng != null && v.olat !== 0 && v.dlat !== 0;
  const hasCorredor = corredor != null && corredor.olat != null && corredor.dlat != null && corredor.olng != null && corredor.dlng != null;

  const segments = (() => {
    if (!hasGps) return [];
    const segs: { path: [number, number][]; color: string }[] = [];
    let currentColor = velColor(puntos[0].vel || 0);
    let currentPath: [number, number][] = [[puntos[0].lat, puntos[0].lng]];
    for (let i = 1; i < puntos.length; i++) {
      const color = velColor(puntos[i].vel || 0);
      const pt: [number, number] = [puntos[i].lat, puntos[i].lng];
      if (color === currentColor) {
        currentPath.push(pt);
      } else {
        currentPath.push(pt);
        segs.push({ path: currentPath, color: currentColor });
        currentPath = [pt];
        currentColor = color;
      }
    }
    if (currentPath.length > 1) segs.push({ path: currentPath, color: currentColor });
    return segs;
  })();

  const center: [number, number] = (() => {
    if (hasRealGps && puntos.length > 0) {
      const midIdx = Math.floor(puntos.length / 2);
      return [puntos[midIdx].lat, puntos[midIdx].lng];
    }
    if (hasOriginDest) return [(v.olat + v.dlat) / 2, (v.olng + v.dlng) / 2];
    if (hasCorredor) return [(corredor.olat + corredor.dlat) / 2, (corredor.olng + corredor.dlng) / 2];
    return [-33.45, -70.65];
  })();

  const currentIdx = Math.min(Math.floor(progress * (puntos.length - 1)), puntos.length - 1);
  const currentPoint = puntos[currentIdx];

  const trailPath: [number, number][] = puntos.slice(0, currentIdx + 1).map(p => [p.lat, p.lng]);

  const rend = parseFloat(v.rendimiento || 0);
  const durH = v.duracion ? Math.floor(v.duracion / 60) : 0;
  const durM = v.duracion ? v.duracion % 60 : 0;
  const currentTime = currentPoint?.ts ? new Date(currentPoint.ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";

  const propuestoOrigin = hasCorredor
    ? { lat: corredor.olat, lng: corredor.olng }
    : hasOriginDest ? { lat: v.olat, lng: v.olng } : null;
  const propuestoDest = hasCorredor
    ? { lat: corredor.dlat, lng: corredor.dlng }
    : hasOriginDest ? { lat: v.dlat, lng: v.dlng } : null;

  const origenLabel = corredor?.origen_nombre || v.origen_nombre || "Origen";
  const destinoLabel = corredor?.destino_nombre || v.destino_nombre || "Destino";

  const fitPoints: [number, number][] = [];
  if (showGps && hasGps) puntos.forEach(p => fitPoints.push([p.lat, p.lng]));
  if (showPropuesto && propuestoOrigin) fitPoints.push([propuestoOrigin.lat, propuestoOrigin.lng]);
  if (showPropuesto && propuestoDest) fitPoints.push([propuestoDest.lat, propuestoDest.lng]);

  const gpsStartLabel = v.origen_nombre || "Inicio GPS";
  const gpsEndLabel = v.destino_nombre || "Fin GPS";

  const fechaStr = new Date(v.fecha_inicio).toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short" });
  const horaIni = new Date(v.fecha_inicio).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const horaFin = v.fecha_fin ? new Date(v.fecha_fin).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--";

  return (
    <div className="fixed inset-0 z-[9999]" style={{ background: "rgba(0,0,0,0.92)" }}>
      <div className="h-full flex flex-col">
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#060d14", borderBottom: "2px solid #00d4ff30" }}>
          <div className="flex items-center gap-3 min-w-0">
            <Truck className="w-5 h-5 shrink-0" style={{ color: "#00d4ff" }} />
            <div className="min-w-0">
              <div className="font-space text-[13px] font-bold truncate" style={{ color: "#c8e8ff" }}>
                {v.patente} — {v.origen_nombre || "?"} → {v.destino_nombre || "?"}
              </div>
              <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                {v.contrato} · {fechaStr} · {horaIni} → {horaFin}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!validated ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleValidate("APROBADO")}
                  disabled={validating}
                  className="flex items-center gap-1 font-exo text-[9px] tracking-wider uppercase px-3 py-1.5 rounded cursor-pointer transition-all"
                  style={{ background: "#00ff8815", border: "1px solid #00ff8830", color: "#00ff88", opacity: validating ? 0.5 : 1 }}
                >
                  <CheckCircle className="w-3 h-3" />
                  APROBAR
                </button>
                <button
                  onClick={() => handleValidate("RECHAZADO")}
                  disabled={validating}
                  className="flex items-center gap-1 font-exo text-[9px] tracking-wider uppercase px-3 py-1.5 rounded cursor-pointer transition-all"
                  style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244", opacity: validating ? 0.5 : 1 }}
                >
                  <XCircle className="w-3 h-3" />
                  RECHAZAR
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded font-exo text-[10px] tracking-wider uppercase font-bold"
                style={{
                  background: validated === "APROBADO" ? "#00ff8815" : "#ff224415",
                  border: `1px solid ${validated === "APROBADO" ? "#00ff8840" : "#ff224440"}`,
                  color: validated === "APROBADO" ? "#00ff88" : "#ff2244",
                }}>
                {validated === "APROBADO" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {validated}
              </div>
            )}

            {validateError && (
              <div className="px-2 py-1 rounded font-exo text-[9px]" style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244" }}>
                {validateError}
              </div>
            )}

            <button onClick={onClose} className="p-2 cursor-pointer hover:opacity-70 rounded ml-1" style={{ background: "#0d2035" }}>
              <X className="w-5 h-5" style={{ color: "#c8e8ff" }} />
            </button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex relative overflow-hidden">
          {/* LEFT INFO PANEL */}
          {showPanel && (
            <div className="w-[280px] shrink-0 overflow-y-auto" style={{ background: "#060d14", borderRight: "1px solid #0d2035" }}>
              {/* TRIP DATA */}
              <div className="px-3 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <div className="font-exo text-[7px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>DATOS DEL VIAJE</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Route className="w-3 h-3" style={{ color: "#3a6080" }} />
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Distancia</span>
                    </div>
                    <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{v.km || 0} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3 h-3" style={{ color: "#3a6080" }} />
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Rendimiento</span>
                    </div>
                    <span className="font-space text-[12px] font-bold" style={{ color: RC(rend) }}>{rend > 0 ? `${rend.toFixed(2)} km/L` : "--"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" style={{ color: "#3a6080" }} />
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Duración</span>
                    </div>
                    <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{v.duracion ? `${durH}h ${durM}m` : "--"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" style={{ color: "#3a6080" }} />
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Puntos GPS</span>
                    </div>
                    <span className="font-space text-[12px] font-bold" style={{ color: "#00d4ff" }}>{puntos.length}</span>
                  </div>
                  {v.vel_prom > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Navigation className="w-3 h-3" style={{ color: "#3a6080" }} />
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Vel. prom / máx</span>
                      </div>
                      <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.vel_prom} / {v.vel_max || "?"} km/h</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ORIGIN / DESTINATION */}
              <div className="px-3 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <div className="font-exo text-[7px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>ORIGEN → DESTINO</div>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#00ff88", border: "2px solid #fff" }}>
                      <span className="text-[9px] font-bold" style={{ color: "#020508" }}>A</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-exo text-[10px] font-semibold truncate" style={{ color: "#00ff88" }}>{gpsStartLabel}</div>
                      {hasGps && (
                        <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                          {puntos[0].lat.toFixed(4)}, {puntos[0].lng.toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <ArrowRight className="w-3 h-3" style={{ color: "#0d2035" }} />
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#ff2244", border: "2px solid #fff" }}>
                      <span className="text-[9px] font-bold" style={{ color: "#fff" }}>B</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-exo text-[10px] font-semibold truncate" style={{ color: "#ff2244" }}>{gpsEndLabel}</div>
                      {hasGps && (
                        <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                          {puntos[puntos.length-1].lat.toFixed(4)}, {puntos[puntos.length-1].lng.toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* PROPOSED (CORREDOR) */}
              {(hasCorredor || hasOriginDest) && (
                <div className="px-3 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-[0.15em] uppercase mb-2" style={{ color: "#ffcc00" }}>
                    {corredor ? "CORREDOR PROPUESTO" : "PROPUESTO"}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Flag className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#ffcc00" }} />
                      <div className="min-w-0">
                        <div className="font-exo text-[10px] font-semibold truncate" style={{ color: "#ffcc00" }}>{origenLabel}</div>
                        {propuestoOrigin && (
                          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                            {propuestoOrigin.lat.toFixed(4)}, {propuestoOrigin.lng.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Target className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#ffcc00" }} />
                      <div className="min-w-0">
                        <div className="font-exo text-[10px] font-semibold truncate" style={{ color: "#ffcc00" }}>{destinoLabel}</div>
                        {propuestoDest && (
                          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                            {propuestoDest.lat.toFixed(4)}, {propuestoDest.lng.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>

                    {corredor && (
                      <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: "1px solid #0d2035" }}>
                        {corredor.km_promedio > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>KM base</span>
                            <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{corredor.km_promedio} km</span>
                          </div>
                        )}
                        {corredor.rendimiento_promedio > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Rend. base</span>
                            <span className="font-space text-[10px] font-bold" style={{ color: RC(corredor.rendimiento_promedio) }}>{corredor.rendimiento_promedio} km/L</span>
                          </div>
                        )}
                        {corredor.duracion_promedio_min > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Duración base</span>
                            <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{Math.floor(corredor.duracion_promedio_min / 60)}h {corredor.duracion_promedio_min % 60}m</span>
                          </div>
                        )}
                        {v.km > 0 && corredor.km_promedio > 0 && (
                          <div className="flex items-center justify-between mt-1 pt-1" style={{ borderTop: "1px solid #0d2035" }}>
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Δ KM</span>
                            <span className="font-space text-[10px] font-bold" style={{
                              color: Math.abs(v.km - corredor.km_promedio) / corredor.km_promedio > 0.15 ? "#ff6b35" : "#00ff88"
                            }}>
                              {v.km > corredor.km_promedio ? "+" : ""}{(v.km - corredor.km_promedio).toFixed(0)} km ({((v.km - corredor.km_promedio) / corredor.km_promedio * 100).toFixed(0)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LAYER TOGGLES */}
              <div className="px-3 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <div className="font-exo text-[7px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>CAPAS DEL MAPA</div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setShowGps(!showGps)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all"
                    style={{ background: showGps ? "#00ff8810" : "transparent", border: `1px solid ${showGps ? "#00ff8830" : "#0d2035"}` }}
                  >
                    {showGps ? <Eye className="w-3 h-3" style={{ color: "#00ff88" }} /> : <EyeOff className="w-3 h-3" style={{ color: "#3a6080" }} />}
                    <span className="font-exo text-[9px]" style={{ color: showGps ? "#00ff88" : "#3a6080" }}>Ruta GPS Real</span>
                    <div className="ml-auto w-4 h-1 rounded-full" style={{ background: showGps ? "#00ff88" : "#3a6080" }} />
                  </button>
                  <button
                    onClick={() => setShowPropuesto(!showPropuesto)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all"
                    style={{ background: showPropuesto ? "#ffcc0010" : "transparent", border: `1px solid ${showPropuesto ? "#ffcc0030" : "#0d2035"}` }}
                  >
                    {showPropuesto ? <Eye className="w-3 h-3" style={{ color: "#ffcc00" }} /> : <EyeOff className="w-3 h-3" style={{ color: "#3a6080" }} />}
                    <span className="font-exo text-[9px]" style={{ color: showPropuesto ? "#ffcc00" : "#3a6080" }}>Ruta Propuesta</span>
                    <div className="ml-auto w-4 h-0.5 rounded-full" style={{ background: showPropuesto ? "#ffcc00" : "#3a6080", borderStyle: "dashed" }} />
                  </button>
                </div>
              </div>

              {/* VELOCITY LEGEND */}
              {showGps && (
                <div className="px-3 py-3">
                  <div className="font-exo text-[7px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>VELOCIDAD</div>
                  <div className="space-y-1">
                    {[
                      { label: "Detenido", color: "#3a6080" },
                      { label: "0-40 km/h", color: "#00d4ff" },
                      { label: "40-60 km/h", color: "#00ff88" },
                      { label: "60-80 km/h", color: "#fbbf24" },
                      { label: "80-100 km/h", color: "#ff6b35" },
                      { label: "> 100 km/h", color: "#ff2244" },
                    ].map(l => (
                      <div key={l.label} className="flex items-center gap-2">
                        <div className="w-4 h-1 rounded-full" style={{ background: l.color }} />
                        <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PANEL TOGGLE */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="absolute top-3 cursor-pointer z-[1001] p-1.5 rounded"
            style={{
              left: showPanel ? 268 : 8,
              background: "#060d14ee",
              border: "1px solid #0d2035",
              transition: "left 0.2s",
            }}
          >
            <Info className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          </button>

          {/* MAP */}
          <div className="flex-1 relative">
            <LeafletMap center={center} zoom={10}>
              {fitPoints.length > 0 && <FitBounds points={fitPoints} />}

              {/* GPS REAL ROUTE */}
              {showGps && hasGps && (
                <>
                  {playing && progress > 0 ? (
                    <>
                      <Polyline positions={trailPath} pathOptions={{ color: "#00d4ff", weight: 5, opacity: 0.9 }} />
                      {currentPoint && (
                        <DivMarker position={[currentPoint.lat, currentPoint.lng]}
                          html={`<div style="width:20px;height:20px;background:#00d4ff;border:3px solid #fff;border-radius:50%;box-shadow:0 0 14px #00d4ff80"></div>`}
                          size={[20, 20]} zIndexOffset={2000} />
                      )}
                    </>
                  ) : (
                    segments.map((seg, i) => (
                      <Polyline
                        key={`seg-${i}`}
                        positions={seg.path}
                        pathOptions={{ color: seg.color, weight: showPropuesto ? 4 : 5, opacity: showPropuesto ? 0.7 : 0.85 }}
                      />
                    ))
                  )}

                  {/* GPS START marker */}
                  <DivMarker position={[puntos[0].lat, puntos[0].lng]} zIndexOffset={1000}
                    html={`<div style="position:relative"><div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#00ff88;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px #00ff8860;font-size:13px;font-weight:bold;color:#020508">A</div><div style="position:absolute;top:-28px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 8px;border-radius:4px;background:#060d14ee;border:1px solid #00ff8840;font-size:9px;color:#00ff88;font-family:Exo 2;letter-spacing:0.05em">${gpsStartLabel}</div></div>`}
                    size={[32, 32]} />
                  {/* GPS END marker */}
                  <DivMarker position={[puntos[puntos.length - 1].lat, puntos[puntos.length - 1].lng]} zIndexOffset={1000}
                    html={`<div style="position:relative"><div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#ff2244;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px #ff224460;font-size:13px;font-weight:bold;color:#fff">B</div><div style="position:absolute;top:-28px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 8px;border-radius:4px;background:#060d14ee;border:1px solid #ff224440;font-size:9px;color:#ff2244;font-family:Exo 2;letter-spacing:0.05em">${gpsEndLabel}</div></div>`}
                    size={[32, 32]} />
                </>
              )}

              {/* PROPOSED ROUTE (dashed via dashArray) */}
              {showPropuesto && propuestoOrigin && propuestoDest && (
                <>
                  <Polyline
                    positions={[[propuestoOrigin.lat, propuestoOrigin.lng], [propuestoDest.lat, propuestoDest.lng]]}
                    pathOptions={{ color: "#ffcc00", weight: 3, opacity: 0.9, dashArray: "10 8" }}
                  />
                  <DivMarker position={[propuestoOrigin.lat, propuestoOrigin.lng]} zIndexOffset={900}
                    html={`<div style="position:relative"><div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;background:#ffcc00;border-radius:6px;border:2px solid #fff;box-shadow:0 0 10px #ffcc0060"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#020508" stroke-width="3"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg></div><div style="position:absolute;top:-28px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 8px;border-radius:4px;background:#060d14ee;border:1px solid #ffcc0040;font-size:9px;color:#ffcc00;font-family:Exo 2;letter-spacing:0.05em">${origenLabel}</div></div>`}
                    size={[30, 30]} />
                  <DivMarker position={[propuestoDest.lat, propuestoDest.lng]} zIndexOffset={900}
                    html={`<div style="position:relative"><div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;background:#ffcc00;border-radius:6px;border:2px solid #fff;box-shadow:0 0 10px #ffcc0060"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#020508" stroke-width="3"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div><div style="position:absolute;top:-28px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 8px;border-radius:4px;background:#060d14ee;border:1px solid #ffcc0040;font-size:9px;color:#ffcc00;font-family:Exo 2;letter-spacing:0.05em">${destinoLabel}</div></div>`}
                    size={[30, 30]} />
                </>
              )}

              {/* NO GPS, NO PROPOSED - show message */}
              {!hasGps && !propuestoOrigin && (
                <DivMarker position={center}
                  html={`<div style="padding:8px 16px;border-radius:8px;background:#060d14ee;border:1px solid #ff224430;font-size:11px;color:#ff2244;font-family:Exo 2;text-align:center">Sin datos GPS ni coordenadas<br/><span style="font-size:9px;color:#3a6080">Este viaje no tiene puntos de rastreo</span></div>`}
                  size={[200, 50]} />
              )}
            </LeafletMap>

            {/* NO-GPS BANNER */}
            {!hasGps && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "#ff224420", border: "1px solid #ff224440", zIndex: 1000 }}>
                <MapPin className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
                <span className="font-exo text-[10px] font-semibold" style={{ color: "#ff2244" }}>Sin puntos GPS — mostrando ubicaciones conocidas</span>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER — playback */}
        {hasGps && (
          <div className="px-4 py-2.5" style={{ background: "#060d14", borderTop: "2px solid #0d2035" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setProgress(0); setPlaying(false); }}
                  className="p-1.5 rounded cursor-pointer" style={{ background: "#0d2035" }}
                >
                  <SkipBack className="w-3.5 h-3.5" style={{ color: "#c8e8ff" }} />
                </button>
                <button
                  onClick={() => setPlaying(!playing)}
                  className="p-1.5 rounded cursor-pointer" style={{ background: playing ? "#ff224420" : "#00d4ff20", border: `1px solid ${playing ? "#ff224440" : "#00d4ff40"}` }}
                >
                  {playing ? <Pause className="w-3.5 h-3.5" style={{ color: "#ff2244" }} /> : <Play className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />}
                </button>
              </div>

              <div className="flex-1 h-1.5 rounded-full cursor-pointer relative" style={{ background: "#0d2035" }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setProgress((e.clientX - rect.left) / rect.width);
                }}>
                <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "#00d4ff" }} />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{currentTime}</span>
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{currentPoint?.vel || 0} km/h</span>
                <div className="flex gap-0.5">
                  {[1, 2, 4].map(s => (
                    <button key={s} onClick={() => setSpeed(s)}
                      className="font-space text-[8px] px-1.5 py-0.5 rounded cursor-pointer"
                      style={{
                        background: speed === s ? "#00d4ff20" : "transparent",
                        border: `1px solid ${speed === s ? "#00d4ff40" : "#0d2035"}`,
                        color: speed === s ? "#00d4ff" : "#3a6080",
                      }}>{s}x</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
