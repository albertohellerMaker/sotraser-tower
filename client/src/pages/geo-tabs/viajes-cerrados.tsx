import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, MapPin, Clock, Truck, ChevronDown, ChevronUp, Eye, Check, X, AlertTriangle, Route, RotateCcw } from "lucide-react";
import { EstadoBadge } from "./shared-components";

interface HistorialCamion {
  camion: {
    id: number;
    patente: string;
    modelo: string;
    conductor: string | null;
    contrato: string;
    tiene_gps: boolean;
    total_puntos_gps: number;
    primer_punto: string | null;
    ultimo_punto: string | null;
  };
  viajes: {
    id: number;
    fecha: string | null;
    origen_nombre: string | null;
    destino_nombre: string | null;
    km_gps: number;
    km_odometro: number | null;
    duracion_horas: number;
    duracion_minutos: number;
    velocidad_maxima: number;
    velocidad_promedio: number;
    tiempo_detenido_min: number;
    paradas: any[];
    validacion_estado: string;
    sigetra_match: { encontrado: boolean; litros?: number; km_delta_pct?: number };
    origen_lat: number;
    origen_lng: number;
    destino_lat: number;
    destino_lng: number;
  }[];
  sigetra: { total_cargas: number; total_litros: number; proveedores: string[] } | null;
  resumen: {
    total_viajes: number;
    total_km_gps: number;
    km_promedio_por_viaje: number;
    destino_mas_frecuente: string | null;
    viajes_validados: number;
    viajes_anomalia: number;
  };
  mensaje: string | null;
}

function ViajeDetalleModal({ viaje, onClose }: { viaje: HistorialCamion["viajes"][0]; onClose: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    if ((window as any).L) { setLeafletReady(true); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !leafletReady) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [(viaje.origen_lat + viaje.destino_lat) / 2, (viaje.origen_lng + viaje.destino_lng) / 2],
      zoom: 6, zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(map);

    L.circleMarker([viaje.origen_lat, viaje.origen_lng], { radius: 8, color: "#00c97a", fillColor: "#00c97a", fillOpacity: 0.9, weight: 2 })
      .bindTooltip(viaje.origen_nombre || "Origen", { permanent: false }).addTo(map);
    L.circleMarker([viaje.destino_lat, viaje.destino_lng], { radius: 8, color: "#ff2244", fillColor: "#ff2244", fillOpacity: 0.9, weight: 2 })
      .bindTooltip(viaje.destino_nombre || "Destino", { permanent: false }).addTo(map);

    if (viaje.paradas && Array.isArray(viaje.paradas)) {
      viaje.paradas.forEach((p: any) => {
        if (p.lat && p.lng) {
          L.circleMarker([p.lat, p.lng], { radius: 6, color: "#ffcc00", fillColor: "#ffcc00", fillOpacity: 0.8, weight: 2 })
            .bindTooltip(`${p.nombre || "Parada"} (${p.minutos}min)`, { permanent: false }).addTo(map);
        }
      });
    }

    L.polyline([[viaje.origen_lat, viaje.origen_lng], [viaje.destino_lat, viaje.destino_lng]], {
      color: "#00d4ff", weight: 2, opacity: 0.5, dashArray: "8,8",
    }).addTo(map);

    const bounds = L.latLngBounds([[viaje.origen_lat, viaje.origen_lng], [viaje.destino_lat, viaje.destino_lng]]);
    map.fitBounds(bounds, { padding: [30, 30] });

    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [viaje, leafletReady]);

  const validacionItems = [];
  /* Sigetra validation items ocultos */
  if (viaje.km_gps > 30) validacionItems.push({ label: "Viaje real (>30km)", ok: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(2,5,8,0.85)" }}
      onClick={onClose} data-testid="modal-viaje-detalle">
      <div className="w-[95vw] max-w-[1200px] max-h-[85vh] overflow-auto rounded-lg"
        style={{ background: "#091018", border: "1px solid #0d2035" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>
            {viaje.fecha} -- {viaje.origen_nombre || "?"} → {viaje.destino_nombre || "?"}
          </div>
          <button onClick={onClose} className="cursor-pointer" data-testid="btn-cerrar-modal">
            <X className="w-4 h-4" style={{ color: "#3a6080" }} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-0" style={{ minHeight: "400px" }}>
          <div ref={mapRef} className="col-span-1" style={{ minHeight: "400px", background: "#020508" }} data-testid="modal-mapa" />

          <div className="col-span-1 px-4 py-4 overflow-auto" style={{ borderLeft: "1px solid #0d2035", borderRight: "1px solid #0d2035", maxHeight: "500px" }}>
            <div className="font-exo text-[9px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>TIMELINE</div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#00c97a" }} />
                <div>
                  <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>SALIDA</div>
                  <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{viaje.origen_nombre || "Origen"}</div>
                </div>
              </div>
              {viaje.paradas && Array.isArray(viaje.paradas) && viaje.paradas.map((p: any, i: number) => (
                <div key={i} className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ffcc00" }} />
                  <div>
                    <div className="font-exo text-[10px]" style={{ color: "#ffcc00" }}>PARADA {p.minutos}min</div>
                    <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{p.nombre || "Parada"}</div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ff2244" }} />
                <div>
                  <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>LLEGADA</div>
                  <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{viaje.destino_nombre || "Destino"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-1 px-4 py-4 overflow-auto" style={{ maxHeight: "500px" }}>
            <div className="font-exo text-[9px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>METRICAS</div>
            <div className="space-y-2">
              {[
                { label: "KM GPS", value: `${viaje.km_gps.toFixed(1)}`, color: "#00d4ff" },
                ...(viaje.km_odometro ? [{ label: "KM ODOMETRO", value: `${viaje.km_odometro.toFixed(1)}`, color: "#c8e8ff" }] : []),
                { label: "DURACION", value: `${viaje.duracion_horas}h`, color: "#c8e8ff" },
                { label: "VEL. MAXIMA", value: `${viaje.velocidad_maxima} km/h`, color: "#ffcc00" },
                { label: "VEL. PROMEDIO", value: `${viaje.velocidad_promedio} km/h`, color: "#c8e8ff" },
                { label: "TIEMPO DETENIDO", value: `${Math.floor(viaje.tiempo_detenido_min / 60)}h ${viaje.tiempo_detenido_min % 60}m`, color: "#3a6080" },
              ].map(m => (
                <div key={m.label} className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid #0d203530" }}>
                  <span className="font-exo text-[9px] tracking-[0.1em]" style={{ color: "#3a6080" }}>{m.label}</span>
                  <span className="font-space text-[12px] font-bold" style={{ color: m.color }}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* Sigetra match oculto - solo Volvo visible */}

            {validacionItems.length > 0 && (
              <div className="mt-4">
                <div className="font-exo text-[9px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>VALIDACION</div>
                {validacionItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    {item.ok ?
                      <Check className="w-3 h-3" style={{ color: "#00c97a" }} /> :
                      <X className="w-3 h-3" style={{ color: "#ff2244" }} />
                    }
                    <span className="font-exo text-[10px]" style={{ color: item.ok ? "#00c97a" : "#ff2244" }}>{item.label}</span>
                  </div>
                ))}
                <div className="mt-2">
                  <EstadoBadge estado={viaje.validacion_estado} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplayModal({ viaje, onClose }: { viaje: any; onClose: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [progreso, setProgreso] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const polylineRef = useRef<any>(null);
  const marcadorRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const puntosGps = useMemo(() => {
    return (viaje.puntos_gps || []).filter((p: any) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng));
  }, [viaje]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const L = (window as any).L;
    if (!L) return;

    const centerLat = puntosGps.length > 0 ? puntosGps[0].lat : -33.45;
    const centerLng = puntosGps.length > 0 ? puntosGps[0].lng : -70.65;

    const map = L.map(mapRef.current, { attributionControl: false }).setView([centerLat, centerLng], 7);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
    mapInstance.current = map;

    if (puntosGps.length > 0) {
      const first = puntosGps[0];
      const last = puntosGps[puntosGps.length - 1];
      L.circleMarker([first.lat, first.lng], {
        radius: 8, fillColor: "#00ff88", color: "#020508", weight: 2, fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>ORIGEN</b><br>${viaje.lugar_origen || "Inicio"}`);
      L.circleMarker([last.lat, last.lng], {
        radius: 8, fillColor: "#ff2244", color: "#020508", weight: 2, fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>DESTINO</b><br>${viaje.lugar_destino || "Fin"}`);

      const bounds = puntosGps.map((p: any) => [p.lat, p.lng]);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
    }

    return () => { map.remove(); mapInstance.current = null; };
  }, [puntosGps]);

  const iniciarReplay = () => {
    const L = (window as any).L;
    if (!L || !mapInstance.current || puntosGps.length < 2) return;

    setReproduciendo(true);
    setTerminado(false);
    setProgreso(0);

    if (polylineRef.current) polylineRef.current.remove();
    if (marcadorRef.current) marcadorRef.current.remove();

    const calcBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
      const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
      return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    };

    const makeIcon = (rotation: number) => L.divIcon({
      html: `<div style="
        font-size:28px;
        line-height:1;
        transform:rotate(${rotation}deg);
        filter:drop-shadow(0 0 6px #00d4ff) drop-shadow(0 0 12px rgba(0,212,255,0.4));
        text-align:center;
      ">&#x1F69A;</div>`,
      className: "",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const total = puntosGps.length;
    const DURACION_MS = 7000;
    const intervaloMs = DURACION_MS / total;
    let idx = 0;
    const coordsAnimadas: [number, number][] = [];
    let currentBearing = 0;

    marcadorRef.current = L.marker([puntosGps[0].lat, puntosGps[0].lng], { icon: makeIcon(0) }).addTo(mapInstance.current);

    intervalRef.current = setInterval(() => {
      if (idx >= total) {
        clearInterval(intervalRef.current);
        setReproduciendo(false);
        setTerminado(true);
        setProgreso(100);
        return;
      }

      const punto = puntosGps[idx];
      coordsAnimadas.push([punto.lat, punto.lng]);

      if (polylineRef.current) polylineRef.current.remove();
      polylineRef.current = L.polyline(coordsAnimadas, {
        color: "#00d4ff", weight: 3, opacity: 0.8,
        dashArray: "8,4",
      }).addTo(mapInstance.current);

      if (idx > 0) {
        const prev = puntosGps[idx - 1];
        currentBearing = calcBearing(prev.lat, prev.lng, punto.lat, punto.lng);
      }

      if (marcadorRef.current) {
        marcadorRef.current.setLatLng([punto.lat, punto.lng]);
        marcadorRef.current.setIcon(makeIcon(currentBearing));
      }

      setProgreso(Math.round((idx / total) * 100));

      if (idx % 5 === 0) {
        mapInstance.current.panTo([punto.lat, punto.lng], { animate: true, duration: 0.5 });
      }

      idx++;
    }, intervaloMs);
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const duracion = viaje.hora_inicio && viaje.hora_fin
    ? (() => {
        const ms = new Date(viaje.hora_fin).getTime() - new Date(viaje.hora_inicio).getTime();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return `${h}h ${m}m`;
      })()
    : "--";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85" onClick={onClose}>
      <div className="w-full max-w-4xl mx-4 flex flex-col rounded-lg overflow-hidden"
        style={{ background: "#020508", border: "1px solid rgba(0,212,255,0.3)", maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 flex-shrink-0" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '20px' }}>&#x1F69A;</span>
            <div className="font-space text-sm font-bold tracking-wider" style={{ color: "#00d4ff" }}>RECREAR VIAJE</div>
            <div className="font-rajdhani text-sm" style={{ color: "#3a6080" }}>
              {viaje.patente} · {viaje.lugar_origen || "Origen"} → {viaje.lugar_destino || "Destino"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
              {puntosGps.length} puntos GPS{viaje.km_total ? ` · ${viaje.km_total} km` : ""}
            </div>
            <button onClick={onClose} data-testid="button-cerrar-replay" className="p-1 cursor-pointer hover:opacity-70">
              <X className="w-4 h-4" style={{ color: "#3a6080" }} />
            </button>
          </div>
        </div>

        <div className="flex-1 relative" style={{ minHeight: "400px" }}>
          {puntosGps.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "#020508" }}>
              <MapPin className="w-8 h-8 mb-3" style={{ color: "#3a6080" }} />
              <span className="font-exo text-sm" style={{ color: "#3a6080" }}>Sin puntos GPS para este viaje</span>
              <span className="font-exo text-[10px] mt-1" style={{ color: "#1a3a55" }}>El viaje fue reconstruido sin trayectoria GPS detallada</span>
            </div>
          )}
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>

        <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid #0d2035" }}>
          <div className="h-1 w-full mb-3 overflow-hidden" style={{ background: "#0d2035" }}>
            <div className="h-full" style={{
              width: `${progreso}%`,
              background: terminado ? "#00ff88" : "#00d4ff",
              boxShadow: reproduciendo ? "0 0 8px rgba(0,212,255,0.6)" : "none",
              transition: "width 0.1s linear",
            }} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>DURACION</div>
                <div className="font-space text-sm font-bold" style={{ color: "#c8e8ff" }}>{duracion}</div>
              </div>
              <div>
                <div className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>RENDIMIENTO</div>
                <div className="font-space text-sm font-bold" style={{ color: viaje.rendimiento >= 2.5 ? "#00ff88" : "#ff2244" }}>
                  {viaje.rendimiento ? `${viaje.rendimiento.toFixed(2)} km/L` : "--"}
                </div>
              </div>
              <div>
                <div className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>VEL MAX</div>
                <div className="font-space text-sm font-bold" style={{ color: (viaje.vel_max || 0) > 100 ? "#ff2244" : "#c8e8ff" }}>
                  {viaje.vel_max ? `${viaje.vel_max} km/h` : "--"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!reproduciendo && !terminado && puntosGps.length > 0 && (
                <button onClick={iniciarReplay} data-testid="button-iniciar-replay"
                  className="flex items-center gap-2 px-5 py-2.5 font-space text-[11px] font-bold cursor-pointer transition-all hover:opacity-80"
                  style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff", boxShadow: "0 0 12px rgba(0,212,255,0.15)" }}>
                  <span style={{ fontSize: '16px' }}>&#x1F69A;</span>
                  INICIAR RECREACION · 7s
                </button>
              )}
              {reproduciendo && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '16px', animation: 'pulse 1s infinite' }}>&#x1F69A;</span>
                  <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>REPRODUCIENDO... {progreso}%</span>
                </div>
              )}
              {terminado && (
                <button onClick={iniciarReplay} data-testid="button-repetir-replay"
                  className="flex items-center gap-2 px-4 py-2 font-space text-[11px] font-bold cursor-pointer hover:opacity-80"
                  style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)", color: "#00ff88" }}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  REPETIR
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ViajesCerrados() {
  const [faenaFilter, setFaenaFilter] = useState<string>("TODOS");
  const [selectedViaje, setSelectedViaje] = useState<any | null>(null);
  const [viajeReplay, setViajeReplay] = useState<any | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    if ((window as any).L) { setLeafletReady(true); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  const ayer = useMemo(() => {
    const d = new Date(Date.now() - 86400000);
    return d.toISOString().split("T")[0];
  }, []);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/rutas/viajes-dia", ayer, faenaFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ fecha: ayer });
      if (faenaFilter !== "TODOS") params.set("contrato", faenaFilter);
      const r = await fetch(`/api/rutas/viajes-dia?${params}`);
      return r.json();
    },
  });

  const { data: patronesData } = useQuery<any>({
    queryKey: ["/api/rutas/patrones", faenaFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (faenaFilter !== "TODOS") params.set("contrato", faenaFilter);
      const r = await fetch(`/api/rutas/patrones?${params}`);
      return r.json();
    },
  });

  const { data: acumuladosData } = useQuery<any>({
    queryKey: ["/api/rutas/viajes-acumulados"],
  });

  const viajes = data?.viajes || [];
  const rutasFrecuentes = data?.rutasFrecuentes || [];
  const patrones = patronesData?.patrones || [];
  const diasAcumulados = patronesData?.diasAcumulados || 0;
  const patronesListo = patronesData?.listo || false;
  const totalViajesAcumulados = patronesData?.totalViajes || 0;
  const porContrato = patronesData?.porContrato || [];
  const diasInfo = acumuladosData?.dias || [];

  const FAENA_COLORS: Record<string, string> = {
    "CENCOSUD": "#00d4ff",
    "ANGLO-COCU": "#1A8FFF",
    "ANGLO-CARGAS VARIAS": "#FF6B35",
    "ANGLO-CAL": "#00C49A",
  };
  const getColor = (c: string) => FAENA_COLORS[c] || "#c8e8ff";

  const contratos = useMemo(() => {
    const map = new Map<string, number>();
    viajes.forEach((v: any) => {
      if (v.contrato) map.set(v.contrato, (map.get(v.contrato) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([c, n]) => ({ contrato: c, cantidad: n }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [viajes]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !leafletReady) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current, {
      center: [-33.45, -70.65], zoom: 6,
      zoomControl: true, attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [leafletReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];

    if (!selectedViaje || !selectedViaje.puntos_gps?.length) return;

    const pts = selectedViaje.puntos_gps.filter((p: any) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng));
    if (pts.length < 2) return;

    const color = getColor(selectedViaje.contrato || "");
    const latlngs = pts.map((p: any) => [p.lat, p.lng]);

    const line = L.polyline(latlngs, { color, weight: 3, opacity: 0.85 }).addTo(map);
    layersRef.current.push(line);

    const namedPoints = new Map<string, { latSum: number; lngSum: number; count: number }>();
    pts.forEach((p: any) => {
      if (p.nombre) {
        if (!namedPoints.has(p.nombre)) {
          namedPoints.set(p.nombre, { latSum: p.lat, lngSum: p.lng, count: 1 });
        } else {
          const ex = namedPoints.get(p.nombre)!;
          ex.count++;
          ex.latSum += p.lat;
          ex.lngSum += p.lng;
        }
      }
    });

    const first = pts[0];
    const last = pts[pts.length - 1];

    const startMarker = L.circleMarker([first.lat, first.lng], {
      radius: 9, color: "#00c97a", fillColor: "#00c97a", fillOpacity: 1, weight: 2,
    }).addTo(map);
    startMarker.bindPopup(`<div style="font-family:'Space Mono';font-size:11px;color:#020508"><b>ORIGEN</b><br/>${selectedViaje.lugar_origen}</div>`);
    startMarker.bindTooltip(selectedViaje.lugar_origen, {
      permanent: true, direction: "top", offset: [0, -10],
      className: "leaflet-tooltip-custom",
    });
    layersRef.current.push(startMarker);

    const endMarker = L.circleMarker([last.lat, last.lng], {
      radius: 9, color: "#ff2244", fillColor: "#ff2244", fillOpacity: 1, weight: 2,
    }).addTo(map);
    endMarker.bindPopup(`<div style="font-family:'Space Mono';font-size:11px;color:#020508"><b>DESTINO</b><br/>${selectedViaje.lugar_destino}</div>`);
    endMarker.bindTooltip(selectedViaje.lugar_destino, {
      permanent: true, direction: "top", offset: [0, -10],
      className: "leaflet-tooltip-custom",
    });
    layersRef.current.push(endMarker);

    for (const [nombre, info] of namedPoints) {
      if (nombre === selectedViaje.lugar_origen || nombre === selectedViaje.lugar_destino) continue;
      const isPrincipal = nombre === selectedViaje.lugar_principal;
      const mkColor = isPrincipal ? "#00d4ff" : "#ffcc00";
      const mkRadius = isPrincipal ? 8 : 6;
      const centroidLat = info.latSum / info.count;
      const centroidLng = info.lngSum / info.count;
      const mk = L.circleMarker([centroidLat, centroidLng], {
        radius: mkRadius, color: mkColor, fillColor: mkColor, fillOpacity: 0.9, weight: 2,
      }).addTo(map);
      mk.bindPopup(`<div style="font-family:'Space Mono';font-size:11px;color:#020508"><b>${isPrincipal ? "PRINCIPAL" : "PASO"}</b><br/>${nombre}<br/>${info.count} pts GPS</div>`);
      mk.bindTooltip(nombre, {
        permanent: true, direction: "top", offset: [0, -8],
        className: "leaflet-tooltip-custom",
      });
      layersRef.current.push(mk);
    }

    map.fitBounds(latlngs, { padding: [40, 40] });
  }, [selectedViaje]);

  const formatHora = (f: string | null) => {
    if (!f) return "--";
    return new Date(f).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div data-testid="geo-viajes-cerrados">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-rajdhani text-sm font-bold" style={{ color: "#c8e8ff" }}>
            Viajes del Dia
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            {viajes.length} viajes -- {ayer} (cerrados)
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <button onClick={() => setFaenaFilter("TODOS")}
          data-testid="filter-faena-todos"
          className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
          style={{
            background: faenaFilter === "TODOS" ? "#00d4ff20" : "#0a1520",
            border: `1px solid ${faenaFilter === "TODOS" ? "#00d4ff" : "#0d2035"}`,
            color: faenaFilter === "TODOS" ? "#00d4ff" : "#3a6080",
          }}>
          TODOS ({viajes.length})
        </button>
        {contratos.map((cs) => (
          <button key={cs.contrato} onClick={() => setFaenaFilter(cs.contrato)}
            data-testid={`filter-faena-${cs.contrato}`}
            className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: faenaFilter === cs.contrato ? getColor(cs.contrato) + "20" : "#0a1520",
              border: `1px solid ${faenaFilter === cs.contrato ? getColor(cs.contrato) : "#0d2035"}`,
              color: faenaFilter === cs.contrato ? getColor(cs.contrato) : "#3a6080",
            }}>
            {cs.contrato} ({cs.cantidad})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2 dash-card overflow-hidden relative" style={{ height: 450 }}>
          <div ref={mapRef} data-testid="mapa-viajes" className="w-full h-full" />
          {!selectedViaje && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "rgba(2,5,8,0.4)" }}>
              <div className="text-center">
                <Route className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
                <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Selecciona un viaje para ver en mapa</div>
              </div>
            </div>
          )}
          {selectedViaje && (
            <div className="absolute top-2 right-2 z-[1000]">
              <button onClick={() => setSelectedViaje(null)}
                data-testid="btn-cerrar-mapa"
                className="font-exo text-[9px] font-bold px-2.5 py-1.5 rounded cursor-pointer flex items-center gap-1"
                style={{ background: "rgba(2,5,8,0.9)", border: "1px solid #ff2244", color: "#ff2244" }}>
                <X className="w-3 h-3" /> CERRAR
              </button>
            </div>
          )}
          {selectedViaje && (
            <div className="absolute bottom-2 left-2 z-[1000] flex gap-2">
              {[
                { color: "#00c97a", label: "Origen" },
                { color: "#ff2244", label: "Destino" },
                { color: "#00d4ff", label: "Principal" },
                { color: "#ffcc00", label: "Paso" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1 px-2 py-1 rounded"
                  style={{ background: "rgba(2,5,8,0.85)" }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{l.label}</span>
                </div>
              ))}
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#020508cc", zIndex: 1000 }}>
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
            </div>
          )}
        </div>

        <div className="dash-card px-0 py-0 overflow-y-auto" style={{ height: 450 }}>
          <div className="px-3 py-2 sticky top-0 z-10" style={{ background: "#0a1929", borderBottom: "1px solid #0d2035" }}>
            <span className="font-exo text-[9px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>
              VIAJES ({viajes.length})
            </span>
          </div>
          <div className="space-y-0">
            {viajes.map((v: any, i: number) => {
              const isSelected = selectedViaje?.patente === v.patente;
              const color = getColor(v.contrato || "");
              return (
                <div key={`${v.patente}-${i}`}
                  data-testid={`viaje-card-${i}`}
                  className="px-3 py-2.5 cursor-pointer transition-all"
                  style={{
                    background: isSelected ? color + "12" : "transparent",
                    borderBottom: "1px solid #0d203540",
                    borderLeft: isSelected ? `3px solid ${color}` : "3px solid transparent",
                  }}
                  onClick={() => setSelectedViaje(isSelected ? null : v)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[11px] font-bold" style={{ color }}>{v.patente}</span>
                      {v.conductor && (
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{v.conductor}</span>
                      )}
                    </div>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{v.km_total} km</span>
                  </div>
                  <div className="font-exo text-[10px] mb-1 truncate" style={{ color: "#c8e8ff" }}>
                    {v.nombre_viaje}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-space text-[9px]" style={{ color: "#3a6080" }}>
                      {formatHora(v.hora_inicio)} -- {formatHora(v.hora_fin)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {v.total_puntos >= 2 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setViajeReplay(v); }}
                          data-testid={`button-replay-${i}`}
                          className="flex items-center gap-1 px-2 py-0.5 font-exo text-[9px] font-bold cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.15)]"
                          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}>
                          <span style={{ fontSize: '13px' }}>&#x1F69A;</span>
                          RECREAR
                        </button>
                      )}
                      <span className="font-exo text-[8px] px-1.5 py-0.5 rounded"
                        style={{ background: color + "15", color, border: `1px solid ${color}30` }}>
                        {v.total_puntos} pts GPS
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {viajes.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <Route className="w-5 h-5 mx-auto mb-2" style={{ color: "#3a6080" }} />
                <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin viajes GPS para {ayer}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {rutasFrecuentes.length > 0 && (
        <div className="dash-card px-3 py-3" data-testid="rutas-frecuentes">
          <div className="font-exo text-[9px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>
            RUTAS MAS FRECUENTES DEL DIA
          </div>
          <div className="space-y-1.5">
            {rutasFrecuentes.slice(0, 15).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 rounded"
                data-testid={`ruta-frecuente-${i}`}
                style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
                <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{r.nombre}</span>
                <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>
                  {r.cantidad} {r.cantidad === 1 ? "vez" : "veces"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dash-card px-3 py-3" data-testid="acumulacion-viajes">
        <div className="flex items-center justify-between mb-3">
          <div className="font-exo text-[9px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>
            ACUMULACION DE VIAJES
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: patronesListo ? "#00c97a" : "#ffcc00" }} />
            <span className="font-space text-[9px]" style={{ color: patronesListo ? "#00c97a" : "#ffcc00" }}>
              {diasAcumulados}/7 dias
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="px-2.5 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
            <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }} data-testid="stat-dias-acumulados">{diasAcumulados}</div>
            <div className="font-exo text-[8px] uppercase" style={{ color: "#3a6080" }}>Dias</div>
          </div>
          <div className="px-2.5 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
            <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }} data-testid="stat-total-viajes">{totalViajesAcumulados}</div>
            <div className="font-exo text-[8px] uppercase" style={{ color: "#3a6080" }}>Viajes Total</div>
          </div>
          <div className="px-2.5 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
            <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }} data-testid="stat-patrones">{patrones.length}</div>
            <div className="font-exo text-[8px] uppercase" style={{ color: "#3a6080" }}>Patrones</div>
          </div>
          <div className="px-2.5 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
            <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }} data-testid="stat-contratos">{porContrato.length}</div>
            <div className="font-exo text-[8px] uppercase" style={{ color: "#3a6080" }}>Contratos</div>
          </div>
        </div>

        {diasInfo.length > 0 && (
          <div className="mb-3">
            <div className="font-exo text-[8px] uppercase mb-2" style={{ color: "#3a6080" }}>HISTORIAL DIARIO</div>
            <div className="space-y-1">
              {diasInfo.slice(0, 10).map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded"
                  data-testid={`dia-acumulado-${i}`}
                  style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
                  <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{d.fecha}</span>
                  <div className="flex gap-3">
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{d.camiones} camiones</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{d.km_total?.toLocaleString()} km</span>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{d.viajes} viajes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!patronesListo && (
          <div className="px-3 py-2.5 rounded" style={{ background: "#ffcc0010", border: "1px solid #ffcc0030" }}>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" style={{ color: "#ffcc00" }} />
              <span className="font-exo text-[10px]" style={{ color: "#ffcc00" }}>
                {patronesData?.mensaje || `Acumulando datos... Faltan ${7 - diasAcumulados} dias para proponer patrones.`}
              </span>
            </div>
          </div>
        )}
      </div>

      {viajeReplay && (
        <ReplayModal viaje={viajeReplay} onClose={() => setViajeReplay(null)} />
      )}

      {porContrato.length > 0 && (
        <div className="dash-card px-3 py-3" data-testid="resumen-contratos">
          <div className="font-exo text-[9px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>
            RESUMEN POR CONTRATO (ACUMULADO)
          </div>
          <div className="space-y-1.5">
            {porContrato.map((c: any, i: number) => {
              const cc = FAENA_COLORS[c.contrato] || "#c8e8ff";
              return (
                <div key={i} className="flex items-center justify-between px-2.5 py-2 rounded"
                  data-testid={`contrato-resumen-${i}`}
                  style={{ background: "#0a1520", border: `1px solid ${cc}30` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: cc }} />
                    <span className="font-exo text-[10px] font-bold" style={{ color: cc }}>{c.contrato}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.rutas_unicas} rutas</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.camiones} camiones</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.km_promedio} km prom</span>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.viajes_total} viajes</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {patronesListo && patrones.length > 0 && (
        <div className="dash-card px-3 py-3" data-testid="patrones-viajes">
          <div className="flex items-center justify-between mb-3">
            <div className="font-exo text-[9px] tracking-[0.15em] uppercase" style={{ color: "#00c97a" }}>
              PATRONES DE VIAJE IDENTIFICADOS
            </div>
            <div className="px-2 py-0.5 rounded" style={{ background: "#00c97a20", border: "1px solid #00c97a40" }}>
              <span className="font-space text-[9px] font-bold" style={{ color: "#00c97a" }}>
                {patrones.length} patrones
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {patrones.map((p: any, i: number) => {
              const cc = FAENA_COLORS[p.contrato] || "#c8e8ff";
              return (
                <div key={i} className="px-3 py-2.5 rounded"
                  data-testid={`patron-${i}`}
                  style={{ background: "#0a1520", border: `1px solid ${cc}25` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{p.nombre_viaje}</span>
                    <span className="font-space text-[11px] font-bold" style={{ color: cc }}>
                      {p.frecuencia}x
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <span className="font-exo text-[9px]" style={{ color: cc }}>{p.contrato}</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{p.dias_distintos} dias</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{p.camiones_distintos} camiones</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{p.km_promedio} km prom</span>
                  </div>
                  {p.patentes?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.patentes.slice(0, 8).map((pat: string) => (
                        <span key={pat} className="font-space text-[8px] px-1.5 py-0.5 rounded"
                          style={{ background: `${cc}15`, color: cc, border: `1px solid ${cc}30` }}>
                          {pat}
                        </span>
                      ))}
                      {p.patentes.length > 8 && (
                        <span className="font-space text-[8px] px-1.5 py-0.5" style={{ color: "#3a6080" }}>
                          +{p.patentes.length - 8} mas
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
