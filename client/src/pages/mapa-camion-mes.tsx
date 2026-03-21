import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, Fuel, Route, Clock, Gauge, Eye, EyeOff } from "lucide-react";

const COLORS_VIAJE = [
  "#00d4ff", "#00ff88", "#ff6b35", "#ffcc00", "#a855f7",
  "#ff2244", "#4ade80", "#f472b6", "#38bdf8", "#facc15",
  "#fb923c", "#c084fc", "#22d3ee", "#34d399", "#fbbf24",
];

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CONTRATO_COLORS: Record<string, string> = {
  CENCOSUD: "#00d4ff",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-COCU": "#00ff88",
  "X ASIGNAR": "#4a7090",
};

interface MapaCamionMesProps {
  patente: string;
  onClose: () => void;
}

export default function MapaCamionMes({ patente, onClose }: MapaCamionMesProps) {
  const leafletMapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedViaje, setSelectedViaje] = useState<number | null>(null);
  const [showGps, setShowGps] = useState(true);
  const [showCargas, setShowCargas] = useState(true);
  const [showViajes, setShowViajes] = useState(true);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/camiones", patente, "mapa-mes"],
    queryFn: async () => {
      const r = await fetch(`/api/camiones/${patente}/mapa-mes`);
      if (!r.ok) throw new Error("Error cargando datos");
      return r.json();
    },
  });

  useEffect(() => {
    const W = window as any;
    if (typeof W.L === "undefined") {
      const existing = document.querySelector('link[href*="leaflet"]');
      if (!existing) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      const existingScript = document.querySelector('script[src*="leaflet"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        document.head.appendChild(script);
      }
    }
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;
    let intervalId: any = null;

    const tryInit = () => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [-33.45, -70.65],
        zoom: 7,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
      setMapReady(true);
    };

    if ((window as any).L) {
      tryInit();
    } else {
      intervalId = setInterval(() => {
        if ((window as any).L) {
          clearInterval(intervalId);
          intervalId = null;
          tryInit();
        }
      }, 200);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const viajes = data?.viajes || [];
  const cargasList = data?.cargas || [];
  const gpsPoints = data?.gps || [];

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !leafletMapRef.current || !mapReady || !data) return;

    layersRef.current.forEach(l => {
      try { leafletMapRef.current.removeLayer(l); } catch {}
    });
    layersRef.current = [];

    const bounds: [number, number][] = [];

    if (showGps && gpsPoints.length > 0) {
      const gpsCoords = gpsPoints
        .filter((p: any) => p.lat && p.lng && Math.abs(p.lat) > 1)
        .map((p: any) => [p.lat, p.lng] as [number, number]);

      if (gpsCoords.length > 1) {
        const trail = L.polyline(gpsCoords, {
          color: "#1a3a55",
          weight: 2,
          opacity: 0.5,
          dashArray: "4 4",
        });
        trail.addTo(leafletMapRef.current);
        layersRef.current.push(trail);
        bounds.push(...gpsCoords);
      }
    }

    if (showViajes) {
      viajes.forEach((v: any, idx: number) => {
        if (selectedViaje !== null && selectedViaje !== idx) return;
        const color = COLORS_VIAJE[idx % COLORS_VIAJE.length];
        const oLat = v.origen_lat;
        const oLng = v.origen_lng;
        const dLat = v.destino_lat;
        const dLng = v.destino_lng;

        if (oLat && oLng && dLat && dLng && Math.abs(oLat) > 1 && Math.abs(dLat) > 1) {
          const line = L.polyline([[oLat, oLng], [dLat, dLng]], {
            color,
            weight: selectedViaje === idx ? 4 : 2.5,
            opacity: selectedViaje === idx ? 1 : 0.7,
          });
          line.addTo(leafletMapRef.current);
          layersRef.current.push(line);

          const fecha = v.fecha_inicio ? new Date(v.fecha_inicio).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "";
          const km = v.km_ecu ? `${Math.round(v.km_ecu)} km` : "";
          const rend = v.rendimiento ? `${v.rendimiento.toFixed(1)} km/L` : "";

          const originIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #020508;box-shadow:0 0 8px ${color}80;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          const destIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="width:10px;height:10px;border-radius:2px;background:${color};border:2px solid #020508;box-shadow:0 0 8px ${color}80;transform:rotate(45deg);"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });

          const popupStyle = `font-family:'Space Mono',monospace;font-size:11px;color:#c8e8ff;background:#091018;border:1px solid #0d2035;padding:8px;min-width:180px;`;

          const origenText = escHtml(v.origen_nombre || `${oLat.toFixed(4)}, ${oLng.toFixed(4)}`);
          const destinoText = escHtml(v.destino_nombre || `${dLat.toFixed(4)}, ${dLng.toFixed(4)}`);

          const mO = L.marker([oLat, oLng], { icon: originIcon })
            .bindPopup(`<div style="${popupStyle}">
              <div style="color:${color};font-weight:bold;margin-bottom:4px;">VIAJE #${idx + 1} — ORIGEN</div>
              <div>${origenText}</div>
              <div style="color:#4a7090;margin-top:4px;">${escHtml(fecha)} | ${escHtml(km)} | ${escHtml(rend)}</div>
            </div>`, { className: "dark-popup" });
          mO.addTo(leafletMapRef.current);
          layersRef.current.push(mO);

          const mD = L.marker([dLat, dLng], { icon: destIcon })
            .bindPopup(`<div style="${popupStyle}">
              <div style="color:${color};font-weight:bold;margin-bottom:4px;">VIAJE #${idx + 1} — DESTINO</div>
              <div>${destinoText}</div>
              <div style="color:#4a7090;margin-top:4px;">${escHtml(fecha)} | ${escHtml(km)} | ${escHtml(rend)}</div>
            </div>`, { className: "dark-popup" });
          mD.addTo(leafletMapRef.current);
          layersRef.current.push(mD);

          bounds.push([oLat, oLng], [dLat, dLng]);

          if (v.paradas && Array.isArray(v.paradas)) {
            v.paradas.forEach((p: any) => {
              if (p.lat && p.lng) {
                const pIcon = L.divIcon({
                  className: "custom-marker",
                  html: `<div style="width:6px;height:6px;border-radius:50%;background:#ffcc00;border:1px solid #020508;"></div>`,
                  iconSize: [6, 6],
                  iconAnchor: [3, 3],
                });
                const pm = L.marker([p.lat, p.lng], { icon: pIcon })
                  .bindPopup(`<div style="font-family:'Space Mono',monospace;font-size:10px;color:#ffcc00;background:#091018;border:1px solid #0d2035;padding:6px;">PARADA ${p.duracion_min ? `${p.duracion_min} min` : ""}</div>`, { className: "dark-popup" });
                pm.addTo(leafletMapRef.current);
                layersRef.current.push(pm);
              }
            });
          }
        }
      });
    }

    if (showCargas && cargasList.length > 0) {
      const cargasByLugar = new Map<string, { total: number; count: number; fechas: string[] }>();
      const renderedPositions: [number, number][] = [];

      cargasList.forEach((c: any) => {
        const key = c.lugar || c.proveedor || "Desconocido";
        const existing = cargasByLugar.get(key) || { total: 0, count: 0, fechas: [] };
        existing.total += c.litros || 0;
        existing.count++;
        if (c.fecha) existing.fechas.push(c.fecha);
        cargasByLugar.set(key, existing);

        if (c.lat && c.lng) {
          renderedPositions.push([c.lat, c.lng]);
          return;
        }
        if (c.fecha && gpsPoints.length > 0) {
          const cTime = new Date(c.fecha).getTime();
          let closest: any = null;
          let closestDist = Infinity;
          for (const gp of gpsPoints) {
            if (!gp.lat || !gp.lng || !gp.timestamp) continue;
            const dist = Math.abs(new Date(gp.timestamp).getTime() - cTime);
            if (dist < closestDist) {
              closestDist = dist;
              closest = gp;
            }
          }
          if (closest && closestDist < 6 * 60 * 60 * 1000) {
            c._mapLat = closest.lat;
            c._mapLng = closest.lng;
            renderedPositions.push([closest.lat, closest.lng]);
          }
        }
      });

      cargasList.forEach((c: any) => {
        const lat = c.lat || c._mapLat;
        const lng = c.lng || c._mapLng;
        if (!lat || !lng) return;

        const litros = c.litros ? Math.round(c.litros) : 0;
        const fuelIcon = L.divIcon({
          className: "custom-marker",
          html: `<div style="width:18px;height:18px;border-radius:3px;background:#ff6b35;border:2px solid #020508;box-shadow:0 0 8px #ff6b3580;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:8px;font-weight:bold;color:#020508;font-family:'Space Mono',monospace;">F</span>
          </div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        const fechaStr = c.fecha ? new Date(c.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--";
        const lugarStr = escHtml(c.lugar || c.proveedor || "Estacion");
        const condStr = c.conductor ? escHtml(c.conductor) : "";

        const m = L.marker([lat, lng], { icon: fuelIcon })
          .bindPopup(`<div style="font-family:'Space Mono',monospace;font-size:11px;color:#c8e8ff;background:#091018;border:1px solid #0d2035;padding:8px;min-width:160px;">
            <div style="color:#ff6b35;font-weight:bold;margin-bottom:4px;">CARGA COMBUSTIBLE</div>
            <div style="font-size:14px;font-weight:bold;color:#ff6b35;">${litros} L</div>
            <div style="color:#4a7090;margin-top:4px;">${lugarStr}</div>
            <div style="color:#3a6080;">${fechaStr}${condStr ? ` | ${condStr}` : ""}</div>
            ${c.rend_real > 0 ? `<div style="color:${c.rend_real >= 2.85 ? "#00ff88" : "#ffcc00"};margin-top:2px;">${c.rend_real.toFixed(1)} km/L</div>` : ""}
          </div>`, { className: "dark-popup" });
        m.addTo(leafletMapRef.current);
        layersRef.current.push(m);
        bounds.push([lat, lng]);
      });
    }

    if (bounds.length > 1) {
      try {
        leafletMapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 });
      } catch {}
    } else if (bounds.length === 1) {
      leafletMapRef.current.setView(bounds[0], 10);
    }
  }, [data, mapReady, showGps, showCargas, showViajes, selectedViaje]);

  const resumen = data?.resumen;
  const camionInfo = data?.camion;
  const cc = camionInfo ? CONTRATO_COLORS[camionInfo.contrato] || "#4a7090" : "#4a7090";

  const viajesList = useMemo(() => {
    return viajes.map((v: any, idx: number) => {
      const fecha = v.fecha_inicio ? new Date(v.fecha_inicio) : null;
      return {
        idx,
        fecha: fecha ? fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--",
        hora: fecha ? fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "",
        origen: v.origen_nombre || "?",
        destino: v.destino_nombre || "?",
        km: v.km_ecu ? Math.round(v.km_ecu) : 0,
        rend: v.rendimiento ? v.rendimiento.toFixed(1) : "--",
        duracion: v.duracion_minutos ? `${Math.floor(v.duracion_minutos / 60)}h${(v.duracion_minutos % 60).toString().padStart(2, "0")}m` : "--",
        color: COLORS_VIAJE[idx % COLORS_VIAJE.length],
        estado: v.estado || "NORMAL",
      };
    });
  }, [viajes]);

  return (
    <div className="fixed inset-0 z-[100]" style={{ background: "#020508" }} data-testid="mapa-camion-mes">
      <div className="absolute top-0 left-0 right-0 z-[110] flex items-center justify-between px-4 py-2"
        style={{ background: "#020508e0", borderBottom: "1px solid #0d2035", backdropFilter: "blur(8px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 cursor-pointer hover:opacity-70" data-testid="btn-cerrar-mapa-mes">
            <X className="w-5 h-5" style={{ color: "#4a7090" }} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-space text-[18px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>{patente}</span>
              {camionInfo?.contrato && (
                <span className="font-exo text-[9px] px-2 py-0.5" style={{ color: cc, border: `1px solid ${cc}30`, background: `${cc}08` }}>
                  {camionInfo.contrato}
                </span>
              )}
              {camionInfo?.modelo && (
                <span className="font-rajdhani text-[11px]" style={{ color: "#3a6080" }}>{camionInfo.modelo}</span>
              )}
            </div>
            <div className="font-exo text-[10px] tracking-[0.1em]" style={{ color: "#4a7090" }}>
              TRABAJO DEL MES — {new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase()}
            </div>
          </div>
        </div>

        {resumen && (
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{resumen.totalViajes}</div>
              <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#4a7090" }}>VIAJES</div>
            </div>
            <div className="text-center">
              <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{resumen.totalKm?.toLocaleString()}</div>
              <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#4a7090" }}>KM</div>
            </div>
            <div className="text-center">
              <div className="font-space text-[16px] font-bold" style={{ color: resumen.rendimientoPromedio >= 2.85 ? "#00ff88" : "#ffcc00" }}>
                {resumen.rendimientoPromedio > 0 ? resumen.rendimientoPromedio.toFixed(1) : "--"}
              </div>
              <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#4a7090" }}>KM/L</div>
            </div>
            <div className="text-center">
              <div className="font-space text-[16px] font-bold" style={{ color: "#ff6b35" }}>{resumen.totalCargas}</div>
              <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#4a7090" }}>CARGAS</div>
            </div>
            <div className="text-center">
              <div className="font-space text-[16px] font-bold" style={{ color: "#a855f7" }}>{resumen.diasActivo}</div>
              <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#4a7090" }}>DIAS</div>
            </div>
            <div className="text-center">
              <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff40" }}>{resumen.totalPuntosGps?.toLocaleString()}</div>
              <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#4a7090" }}>GPS</div>
            </div>
          </div>
        )}
      </div>

      <div ref={mapContainerRef} className="absolute inset-0" style={{ top: 0 }} data-testid="mapa-container" />

      <div className="absolute bottom-4 left-4 z-[110] flex items-center gap-2">
        <button onClick={() => setShowGps(!showGps)}
          className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-all"
          style={{
            background: showGps ? "#1a3a5530" : "#09101890",
            border: `1px solid ${showGps ? "#1a3a55" : "#0d2035"}`,
            color: showGps ? "#4a7090" : "#3a6080",
          }}
          data-testid="toggle-gps">
          {showGps ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span className="font-exo text-[9px] font-bold tracking-[0.1em]">TRAIL GPS</span>
        </button>
        <button onClick={() => setShowViajes(!showViajes)}
          className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-all"
          style={{
            background: showViajes ? "#00d4ff12" : "#09101890",
            border: `1px solid ${showViajes ? "#00d4ff40" : "#0d2035"}`,
            color: showViajes ? "#00d4ff" : "#3a6080",
          }}
          data-testid="toggle-viajes">
          {showViajes ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span className="font-exo text-[9px] font-bold tracking-[0.1em]">VIAJES</span>
        </button>
        <button onClick={() => setShowCargas(!showCargas)}
          className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-all"
          style={{
            background: showCargas ? "#ff6b3512" : "#09101890",
            border: `1px solid ${showCargas ? "#ff6b3540" : "#0d2035"}`,
            color: showCargas ? "#ff6b35" : "#3a6080",
          }}
          data-testid="toggle-cargas">
          {showCargas ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span className="font-exo text-[9px] font-bold tracking-[0.1em]">CARGAS</span>
        </button>
      </div>

      <div className="absolute top-[52px] right-0 bottom-0 z-[110] w-[320px] overflow-y-auto"
        style={{ background: "#020508e0", borderLeft: "1px solid #0d2035", backdropFilter: "blur(8px)" }}
        data-testid="panel-viajes-mes">

        <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
                VIAJES ({viajes.length})
              </span>
            </div>
            {selectedViaje !== null && (
              <button onClick={() => setSelectedViaje(null)}
                className="font-exo text-[9px] px-2 py-0.5 cursor-pointer"
                style={{ color: "#ff2244", border: "1px solid #ff224430" }}
                data-testid="btn-ver-todos">
                VER TODOS
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
          </div>
        ) : viajesList.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="font-rajdhani text-[12px]" style={{ color: "#3a6080" }}>Sin viajes registrados este mes</div>
            {gpsPoints.length > 0 && (
              <div className="font-rajdhani text-[11px] mt-2" style={{ color: "#4a7090" }}>
                {gpsPoints.length.toLocaleString()} puntos GPS disponibles
              </div>
            )}
          </div>
        ) : (
          <div>
            {viajesList.map((v: any) => (
              <div key={v.idx}
                onClick={() => setSelectedViaje(selectedViaje === v.idx ? null : v.idx)}
                className="px-3 py-2.5 cursor-pointer transition-all"
                style={{
                  borderBottom: "1px solid #0d203540",
                  background: selectedViaje === v.idx ? `${v.color}08` : "transparent",
                  borderLeft: selectedViaje === v.idx ? `3px solid ${v.color}` : "3px solid transparent",
                }}
                data-testid={`viaje-item-${v.idx}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }} />
                    <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>#{v.idx + 1}</span>
                    <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>{v.fecha}</span>
                    <span className="font-space text-[9px]" style={{ color: "#3a6080" }}>{v.hora}</span>
                  </div>
                  {v.estado !== "NORMAL" && (
                    <span className="font-exo text-[8px] px-1.5 py-0.5"
                      style={{ color: "#ff2244", background: "#ff224410", border: "1px solid #ff224430" }}>
                      {v.estado}
                    </span>
                  )}
                </div>
                <div className="font-rajdhani text-[11px] truncate" style={{ color: "#c8e8ff" }}>
                  {v.origen} <span style={{ color: "#3a6080" }}>&rarr;</span> {v.destino}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                    <Route className="w-3 h-3 inline mr-0.5" style={{ verticalAlign: "middle" }} />
                    {v.km} km
                  </span>
                  <span className="font-space text-[10px]" style={{ color: v.rend !== "--" && parseFloat(v.rend) >= 2.85 ? "#00ff88" : "#ffcc00" }}>
                    <Gauge className="w-3 h-3 inline mr-0.5" style={{ verticalAlign: "middle" }} />
                    {v.rend} km/L
                  </span>
                  <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                    <Clock className="w-3 h-3 inline mr-0.5" style={{ verticalAlign: "middle" }} />
                    {v.duracion}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {cargasList.length > 0 && (
          <>
            <div className="px-3 py-2.5" style={{ borderTop: "1px solid #0d2035", borderBottom: "1px solid #0d2035" }}>
              <div className="flex items-center gap-2">
                <Fuel className="w-3.5 h-3.5" style={{ color: "#ff6b35" }} />
                <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
                  CARGAS COMBUSTIBLE ({cargasList.length})
                </span>
              </div>
            </div>
            {cargasList.map((c: any, i: number) => {
              const fecha = c.fecha ? new Date(c.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--";
              return (
                <div key={i} className="px-3 py-2" style={{ borderBottom: "1px solid #0d203530" }}
                  data-testid={`carga-item-${i}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-3 h-3" style={{ color: "#ff6b35" }} />
                      <span className="font-space text-[11px] font-bold" style={{ color: "#ff6b35" }}>
                        {c.litros ? `${Math.round(c.litros)} L` : "--"}
                      </span>
                      <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>{fecha}</span>
                    </div>
                    {c.rend_real > 0 && (
                      <span className="font-space text-[10px]" style={{ color: c.rend_real >= 2.85 ? "#00ff88" : "#ffcc00" }}>
                        {c.rend_real.toFixed(1)} km/L
                      </span>
                    )}
                  </div>
                  <div className="font-rajdhani text-[10px] truncate" style={{ color: "#4a7090" }}>
                    {c.lugar || c.proveedor || "Estacion"}
                  </div>
                  {c.conductor && (
                    <div className="font-rajdhani text-[9px]" style={{ color: "#3a6080" }}>{c.conductor}</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center" style={{ background: "#020508cc" }}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
            <span className="font-exo text-[12px] tracking-[0.1em]" style={{ color: "#4a7090" }}>CARGANDO DATOS DEL MES...</span>
          </div>
        </div>
      )}
    </div>
  );
}
