import { useState, useEffect, useRef, useMemo } from "react";
import { X, Play, Pause, SkipBack, MapPin, Gauge, Clock, Route } from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, bounds]);
  return null;
}

function AnimatedTruck({ position }: { position: [number, number] }) {
  const map = useMap();
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    }
  }, [position]);

  const icon = useMemo(() => L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;background:#00d4ff;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px #00d4ff80;"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  }), []);

  return <Marker ref={markerRef} position={position} icon={icon} />;
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
    fetch(`/api/viajes-tms/viaje-gps/${viajeId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); }
        else { setData(d); }
        setLoading(false);
      })
      .catch(() => { setError("Error de conexión"); setLoading(false); });
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

  const segments: { positions: [number, number][]; color: string }[] = [];
  if (hasGps) {
    for (let i = 0; i < puntos.length - 1; i++) {
      const p1 = puntos[i];
      const p2 = puntos[i + 1];
      segments.push({
        positions: [[p1.lat, p1.lng], [p2.lat, p2.lng]],
        color: velColor(p2.vel || p1.vel || 0),
      });
    }
  }

  const bounds: L.LatLngBoundsExpression = hasGps
    ? puntos.map(p => [p.lat, p.lng] as [number, number])
    : v.olat && v.dlat
      ? [[v.olat, v.olng], [v.dlat, v.dlng]]
      : [[-33.45, -70.65], [-33.44, -70.64]];

  const currentIdx = Math.min(Math.floor(progress * (puntos.length - 1)), puntos.length - 1);
  const currentPoint = puntos[currentIdx];
  const trailPositions = puntos.slice(0, currentIdx + 1).map(p => [p.lat, p.lng] as [number, number]);

  const startIcon = L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:#00ff88;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #00ff8860;"><span style="font-size:11px;font-weight:bold;color:#020508;">A</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const endIcon = L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:#ff2244;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #ff224460;"><span style="font-size:11px;font-weight:bold;color:#fff;">B</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  const rend = parseFloat(v.rendimiento || 0);
  const durH = v.duracion ? Math.floor(v.duracion / 60) : 0;
  const durM = v.duracion ? v.duracion % 60 : 0;

  const currentTime = currentPoint?.ts ? new Date(currentPoint.ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";

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
          <MapContainer
            center={hasGps ? [puntos[0].lat, puntos[0].lng] : [-33.45, -70.65]}
            zoom={10}
            style={{ height: "100%", width: "100%", background: "#020508" }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; CartoDB'
            />
            <FitBounds bounds={bounds} />

            {progress > 0 && playing ? (
              <>
                <Polyline positions={trailPositions} pathOptions={{ color: "#00d4ff", weight: 4, opacity: 0.9 }} />
                {segments.slice(currentIdx).map((seg, i) => (
                  <Polyline key={`future-${i}`} positions={seg.positions} pathOptions={{ color: "#3a608040", weight: 2, opacity: 0.3, dashArray: "4 8" }} />
                ))}
                {currentPoint && <AnimatedTruck position={[currentPoint.lat, currentPoint.lng]} />}
              </>
            ) : progress >= 1 ? (
              segments.map((seg, i) => (
                <Polyline key={`seg-${i}`} positions={seg.positions} pathOptions={{ color: seg.color, weight: 4, opacity: 0.85 }} />
              ))
            ) : (
              segments.map((seg, i) => (
                <Polyline key={`seg-${i}`} positions={seg.positions} pathOptions={{ color: seg.color, weight: 4, opacity: 0.85 }} />
              ))
            )}

            {hasGps && (
              <>
                <Marker position={[puntos[0].lat, puntos[0].lng]} icon={startIcon}>
                  <Popup><b>{v.origen_nombre || "Origen"}</b><br/>{new Date(v.fecha_inicio).toLocaleTimeString("es-CL")}</Popup>
                </Marker>
                <Marker position={[puntos[puntos.length - 1].lat, puntos[puntos.length - 1].lng]} icon={endIcon}>
                  <Popup><b>{v.destino_nombre || "Destino"}</b><br/>{new Date(v.fecha_fin).toLocaleTimeString("es-CL")}</Popup>
                </Marker>
              </>
            )}

            {!playing && progress > 0 && progress < 1 && hasGps && puntos.map((p, i) => {
              if (i % Math.max(1, Math.floor(puntos.length / 50)) !== 0) return null;
              return (
                <CircleMarker key={`dot-${i}`} center={[p.lat, p.lng]} radius={3}
                  pathOptions={{ color: velColor(p.vel), fillColor: velColor(p.vel), fillOpacity: 0.8, weight: 1 }}
                />
              );
            })}
          </MapContainer>

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
