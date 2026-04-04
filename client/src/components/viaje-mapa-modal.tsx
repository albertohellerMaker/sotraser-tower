/// <reference types="google.maps" />
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Play, Pause, SkipBack, MapPin, Gauge, Clock, Route, CheckCircle, XCircle, Target, Flag, Navigation, ArrowRight, Eye, EyeOff, Layers, Info, Truck } from "lucide-react";
import { Map as GMap, Polyline, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";

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

function FitToBounds({ puntos, extraPoints }: { puntos: PuntoGps[]; extraPoints?: { lat: number; lng: number }[] }) {
  const map = useMap();
  const fittedKey = useRef("");

  useEffect(() => {
    if (!map) return;
    const allPts = [
      ...puntos.map(p => ({ lat: p.lat, lng: p.lng })),
      ...(extraPoints || []),
    ].filter(p => p.lat !== 0 && p.lng !== 0);

    if (allPts.length === 0) return;

    const key = allPts.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
    if (fittedKey.current === key) return;
    fittedKey.current = key;

    const bounds = new google.maps.LatLngBounds();
    allPts.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 60);
  }, [map, puntos, extraPoints]);
  return null;
}

function DashedPolyline({ origin, destination, color = "#ffcc00" }: { origin: google.maps.LatLngLiteral; destination: google.maps.LatLngLiteral; color?: string }) {
  const map = useMap();
  const lineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    if (lineRef.current) lineRef.current.setMap(null);

    lineRef.current = new google.maps.Polyline({
      path: [origin, destination],
      strokeOpacity: 0,
      icons: [{
        icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeWeight: 3, strokeColor: color, scale: 4 },
        offset: "0",
        repeat: "20px",
      }],
      map,
    });

    return () => { lineRef.current?.setMap(null); };
  }, [map, origin.lat, origin.lng, destination.lat, destination.lng, color]);

  return null;
}

export default function ViajeMapaModal({ viajeId, onClose }: Props) {
  const [data, setData] = useState<{ viaje: any; puntos: PuntoGps[]; corredor: CorredorData | null } | null>(null);
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
      const resp = await fetch(`/api/viajes-tms/viaje-validar/${viajeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (resp.ok) setValidated(decision);
    } catch (e) {
      console.error("Error validando viaje:", e);
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
  const hasGps = puntos.length >= 2;
  const hasOriginDest = v.olat != null && v.olng != null && v.dlat != null && v.dlng != null && v.olat !== 0 && v.dlat !== 0;
  const hasCorredor = corredor != null && corredor.olat != null && corredor.dlat != null && corredor.olng != null && corredor.dlng != null;

  const segments = useMemo(() => {
    if (!hasGps) return [];
    const segs: { path: google.maps.LatLngLiteral[]; color: string }[] = [];
    let currentColor = velColor(puntos[0].vel || 0);
    let currentPath: google.maps.LatLngLiteral[] = [{ lat: puntos[0].lat, lng: puntos[0].lng }];
    for (let i = 1; i < puntos.length; i++) {
      const color = velColor(puntos[i].vel || 0);
      const pt = { lat: puntos[i].lat, lng: puntos[i].lng };
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
  }, [data]);

  const center = useMemo(() => {
    if (hasGps) {
      const midIdx = Math.floor(puntos.length / 2);
      return { lat: puntos[midIdx].lat, lng: puntos[midIdx].lng };
    }
    if (hasOriginDest) return { lat: (v.olat + v.dlat) / 2, lng: (v.olng + v.dlng) / 2 };
    if (hasCorredor) return { lat: (corredor.olat + corredor.dlat) / 2, lng: (corredor.olng + corredor.dlng) / 2 };
    return { lat: -33.45, lng: -70.65 };
  }, [data]);

  const currentIdx = Math.min(Math.floor(progress * (puntos.length - 1)), puntos.length - 1);
  const currentPoint = puntos[currentIdx];

  const trailPath = useMemo(() =>
    puntos.slice(0, currentIdx + 1).map(p => ({ lat: p.lat, lng: p.lng })),
    [currentIdx, data]
  );

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

  const extraBoundsPoints: { lat: number; lng: number }[] = [];
  if (showPropuesto && propuestoOrigin) extraBoundsPoints.push(propuestoOrigin);
  if (showPropuesto && propuestoDest) extraBoundsPoints.push(propuestoDest);

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
            <GMap
              defaultCenter={center}
              defaultZoom={10}
              mapId="sotraser-viaje-gps"
              style={{ height: "100%", width: "100%" }}
              gestureHandling="greedy"
              disableDefaultUI
              colorScheme="DARK"
            >
              <FitToBounds
                puntos={showGps ? puntos : []}
                extraPoints={extraBoundsPoints}
              />

              {/* GPS REAL ROUTE */}
              {showGps && hasGps && (
                <>
                  {playing && progress > 0 ? (
                    <>
                      <Polyline path={trailPath} strokeColor="#00d4ff" strokeWeight={5} strokeOpacity={0.9} />
                      {currentPoint && (
                        <AdvancedMarker position={{ lat: currentPoint.lat, lng: currentPoint.lng }}>
                          <div style={{
                            width: 20, height: 20, background: "#00d4ff",
                            border: "3px solid #fff", borderRadius: "50%",
                            boxShadow: "0 0 14px #00d4ff80",
                          }} />
                        </AdvancedMarker>
                      )}
                    </>
                  ) : (
                    segments.map((seg, i) => (
                      <Polyline
                        key={`seg-${i}`}
                        path={seg.path}
                        strokeColor={seg.color}
                        strokeWeight={showPropuesto ? 4 : 5}
                        strokeOpacity={showPropuesto ? 0.7 : 0.85}
                      />
                    ))
                  )}

                  {/* GPS START marker */}
                  <AdvancedMarker position={{ lat: puntos[0].lat, lng: puntos[0].lng }}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, background: "#00ff88", borderRadius: "50%",
                        border: "3px solid #fff", boxShadow: "0 0 12px #00ff8860",
                        fontSize: 13, fontWeight: "bold", color: "#020508",
                      }}>A</div>
                      <div style={{
                        position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)",
                        whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 4,
                        background: "#060d14ee", border: "1px solid #00ff8840",
                        fontSize: 9, color: "#00ff88", fontFamily: "Exo 2",
                        letterSpacing: "0.05em",
                      }}>{gpsStartLabel}</div>
                    </div>
                  </AdvancedMarker>
                  {/* GPS END marker */}
                  <AdvancedMarker position={{ lat: puntos[puntos.length - 1].lat, lng: puntos[puntos.length - 1].lng }}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, background: "#ff2244", borderRadius: "50%",
                        border: "3px solid #fff", boxShadow: "0 0 12px #ff224460",
                        fontSize: 13, fontWeight: "bold", color: "#fff",
                      }}>B</div>
                      <div style={{
                        position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)",
                        whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 4,
                        background: "#060d14ee", border: "1px solid #ff224440",
                        fontSize: 9, color: "#ff2244", fontFamily: "Exo 2",
                        letterSpacing: "0.05em",
                      }}>{gpsEndLabel}</div>
                    </div>
                  </AdvancedMarker>
                </>
              )}

              {/* PROPOSED ROUTE */}
              {showPropuesto && propuestoOrigin && propuestoDest && (
                <>
                  <DashedPolyline origin={propuestoOrigin} destination={propuestoDest} />
                  <AdvancedMarker position={propuestoOrigin}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, background: "#ffcc00", borderRadius: 6,
                        border: "2px solid #fff", boxShadow: "0 0 10px #ffcc0060",
                      }}>
                        <Flag style={{ width: 14, height: 14, color: "#020508" }} />
                      </div>
                      <div style={{
                        position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)",
                        whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 4,
                        background: "#060d14ee", border: "1px solid #ffcc0040",
                        fontSize: 9, color: "#ffcc00", fontFamily: "Exo 2",
                        letterSpacing: "0.05em",
                      }}>{origenLabel}</div>
                    </div>
                  </AdvancedMarker>
                  <AdvancedMarker position={propuestoDest}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, background: "#ffcc00", borderRadius: 6,
                        border: "2px solid #fff", boxShadow: "0 0 10px #ffcc0060",
                      }}>
                        <Target style={{ width: 14, height: 14, color: "#020508" }} />
                      </div>
                      <div style={{
                        position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)",
                        whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 4,
                        background: "#060d14ee", border: "1px solid #ffcc0040",
                        fontSize: 9, color: "#ffcc00", fontFamily: "Exo 2",
                        letterSpacing: "0.05em",
                      }}>{destinoLabel}</div>
                    </div>
                  </AdvancedMarker>
                </>
              )}

              {/* NO GPS, NO PROPOSED - show message */}
              {!hasGps && !propuestoOrigin && (
                <AdvancedMarker position={center}>
                  <div style={{
                    padding: "8px 16px", borderRadius: 8,
                    background: "#060d14ee", border: "1px solid #ff224430",
                    fontSize: 11, color: "#ff2244", fontFamily: "Exo 2",
                    textAlign: "center",
                  }}>
                    Sin datos GPS ni coordenadas<br/>
                    <span style={{ fontSize: 9, color: "#3a6080" }}>Este viaje no tiene puntos de rastreo</span>
                  </div>
                </AdvancedMarker>
              )}
            </GMap>

            {/* NO-GPS BANNER */}
            {!hasGps && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "#ff224420", border: "1px solid #ff224440", zIndex: 1000 }}>
                <MapPin className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
                <span className="font-exo text-[10px] font-semibold" style={{ color: "#ff2244" }}>Sin puntos GPS — mostrando ubicaciones conocidas</span>
              </div>
            )}

            {/* BOTTOM LEGEND when both active */}
            {showGps && showPropuesto && hasGps && propuestoOrigin && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg flex items-center gap-3" style={{ background: "#060d14ee", border: "1px solid #0d2035", zIndex: 1000 }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-1 rounded-full" style={{ background: "#00ff88" }} />
                  <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>Ruta Real (GPS)</span>
                </div>
                <div className="w-px h-3" style={{ background: "#0d2035" }} />
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded-full" style={{ background: "#ffcc00" }} />
                  <span className="font-exo text-[8px]" style={{ color: "#ffcc00" }}>Ruta Propuesta</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PLAYBACK BAR */}
        {hasGps && puntos.length > 2 && showGps && (
          <div className="px-5 py-2.5 flex items-center gap-4" style={{ background: "#060d14", borderTop: "1px solid #0d2035" }}>
            <button onClick={() => { setProgress(0); setPlaying(false); }} className="p-2 cursor-pointer rounded" style={{ background: "#0d2035" }}>
              <SkipBack className="w-4 h-4" style={{ color: "#c8e8ff" }} />
            </button>
            <button onClick={() => setPlaying(!playing)} className="p-2 cursor-pointer rounded" style={{ background: playing ? "#ff224420" : "#00d4ff20", border: `1px solid ${playing ? "#ff224440" : "#00d4ff40"}` }}>
              {playing ? <Pause className="w-4 h-4" style={{ color: "#ff2244" }} /> : <Play className="w-4 h-4" style={{ color: "#00d4ff" }} />}
            </button>

            <div className="flex-1 relative h-2 rounded-full cursor-pointer" style={{ background: "#0d2035" }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                setProgress(Math.max(0, Math.min(1, pct)));
              }}>
              <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${progress * 100}%`, background: "linear-gradient(to right, #00d4ff, #00ff88)" }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full" style={{ left: `calc(${progress * 100}% - 8px)`, background: "#00d4ff", border: "2px solid #fff", boxShadow: "0 0 8px #00d4ff80" }} />
            </div>

            <div className="flex items-center gap-2">
              {[1, 2, 5, 10].map(s => (
                <button key={s} onClick={() => setSpeed(s)} className="font-exo text-[8px] px-2 py-1 cursor-pointer rounded"
                  style={{ color: speed === s ? "#00d4ff" : "#3a6080", background: speed === s ? "#00d4ff15" : "transparent", border: `1px solid ${speed === s ? "#00d4ff30" : "#0d2035"}` }}>
                  {s}x
                </button>
              ))}
            </div>

            <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{currentTime}</div>
            {currentPoint && (
              <div className="flex items-center gap-1">
                <Gauge className="w-3 h-3" style={{ color: velColor(currentPoint.vel) }} />
                <span className="font-space text-[12px] font-bold" style={{ color: velColor(currentPoint.vel) }}>{Math.round(currentPoint.vel || 0)}</span>
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>km/h</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
