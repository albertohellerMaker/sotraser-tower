/// <reference types="google.maps" />
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Play, Pause, SkipBack, MapPin, Gauge, Clock, Route } from "lucide-react";
import { APIProvider, Map as GMap, Polyline, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";

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

function FitToBounds({ puntos }: { puntos: PuntoGps[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || fitted.current || puntos.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    puntos.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 60);
    fitted.current = true;
  }, [map, puntos]);
  return null;
}

export default function ViajeMapaModal({ viajeId, onClose }: Props) {
  const [data, setData] = useState<{ viaje: any; puntos: PuntoGps[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/viajes-tms/viaje-gps/${viajeId}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(d => {
        if (d.error) { setError(d.error); }
        else { setData(d); }
        setLoading(false);
      })
      .catch(e => { if (e.name !== "AbortError") { setError("Error de conexión"); setLoading(false); } });
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
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
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

  const { viaje: v, puntos } = data;
  const hasGps = puntos.length >= 2;

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
    if (currentPath.length > 1) {
      segs.push({ path: currentPath, color: currentColor });
    }
    return segs;
  }, [data]);

  const center = useMemo(() => {
    if (hasGps) {
      const midIdx = Math.floor(puntos.length / 2);
      return { lat: puntos[midIdx].lat, lng: puntos[midIdx].lng };
    }
    if (v.olat && v.dlat) return { lat: (v.olat + v.dlat) / 2, lng: (v.olng + v.dlng) / 2 };
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

  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_KEY || "";

  return (
    <div className="fixed inset-0 z-[9999]" style={{ background: "rgba(0,0,0,0.9)" }}>
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-3" style={{ background: "#060d14", borderBottom: "2px solid #00d4ff30" }}>
          <div className="flex items-center gap-4">
            <Route className="w-5 h-5" style={{ color: "#00d4ff" }} />
            <div>
              <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>
                {v.patente} — {v.origen_nombre || "?"} → {v.destino_nombre || "?"}
              </div>
              <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                {v.contrato} · {v.conductor || "Sin conductor"} · {new Date(v.fecha_inicio).toLocaleDateString("es-CL")}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 cursor-pointer hover:opacity-70 rounded" style={{ background: "#0d2035" }}>
            <X className="w-5 h-5" style={{ color: "#c8e8ff" }} />
          </button>
        </div>

        <div className="flex-1 relative">
          <APIProvider apiKey={apiKey}>
            <GMap
              defaultCenter={center}
              defaultZoom={10}
              mapId="sotraser-viaje-gps"
              style={{ height: "100%", width: "100%" }}
              gestureHandling="greedy"
              disableDefaultUI
              colorScheme="DARK"
            >
              <FitToBounds puntos={puntos} />

              {playing && progress > 0 ? (
                <>
                  <Polyline
                    path={trailPath}
                    strokeColor="#00d4ff"
                    strokeWeight={5}
                    strokeOpacity={0.9}
                  />
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
                    strokeWeight={5}
                    strokeOpacity={0.85}
                  />
                ))
              )}

              {hasGps && (
                <>
                  <AdvancedMarker position={{ lat: puntos[0].lat, lng: puntos[0].lng }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, background: "#00ff88", borderRadius: "50%",
                      border: "3px solid #fff", boxShadow: "0 0 12px #00ff8860",
                      fontSize: 12, fontWeight: "bold", color: "#020508",
                    }}>A</div>
                  </AdvancedMarker>
                  <AdvancedMarker position={{ lat: puntos[puntos.length - 1].lat, lng: puntos[puntos.length - 1].lng }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, background: "#ff2244", borderRadius: "50%",
                      border: "3px solid #fff", boxShadow: "0 0 12px #ff224460",
                      fontSize: 12, fontWeight: "bold", color: "#fff",
                    }}>B</div>
                  </AdvancedMarker>
                </>
              )}
            </GMap>
          </APIProvider>

          <div className="absolute top-4 right-4 p-3 rounded-lg" style={{ background: "#060d14ee", border: "1px solid #0d2035", zIndex: 1000, minWidth: 200 }}>
            <div className="font-exo text-[7px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>LEYENDA VELOCIDAD</div>
            <div className="space-y-1">
              {[
                { label: "0-40 km/h", color: "#00d4ff" },
                { label: "40-60 km/h", color: "#00ff88" },
                { label: "60-80 km/h", color: "#fbbf24" },
                { label: "80-100 km/h", color: "#ff6b35" },
                { label: "> 100 km/h", color: "#ff2244" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="w-5 h-1 rounded-full" style={{ background: l.color }} />
                  <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute top-4 left-4 grid grid-cols-2 gap-2" style={{ zIndex: 1000 }}>
            {[
              { icon: Route, label: "DISTANCIA", value: `${v.km || 0} km`, color: "#c8e8ff" },
              { icon: Gauge, label: "RENDIMIENTO", value: rend > 0 ? `${rend.toFixed(2)} km/L` : "--", color: RC(rend) },
              { icon: Clock, label: "DURACIÓN", value: v.duracion ? `${durH}h ${durM}m` : "--", color: "#c8e8ff" },
              { icon: MapPin, label: "PUNTOS GPS", value: `${puntos.length}`, color: "#00d4ff" },
            ].map(k => (
              <div key={k.label} className="px-3 py-2 rounded-lg" style={{ background: "#060d14ee", border: "1px solid #0d2035" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <k.icon className="w-3 h-3" style={{ color: k.color, opacity: 0.5 }} />
                  <span className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.label}</span>
                </div>
                <div className="font-space text-[14px] font-bold" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {hasGps && puntos.length > 2 && (
          <div className="px-5 py-3 flex items-center gap-4" style={{ background: "#060d14", borderTop: "1px solid #0d2035" }}>
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

            <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>
              {currentTime}
            </div>
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
