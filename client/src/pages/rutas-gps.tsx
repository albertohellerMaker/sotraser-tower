import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Route, Clock, Gauge, ChevronDown, ChevronUp, X, RefreshCw, Truck, TrendingUp, Fuel } from "lucide-react";

const CONTRATOS = [
  { id: "TODOS", label: "TODOS", color: "#c8e8ff" },
  { id: "CENCOSUD", label: "CENCOSUD", color: "#00d4ff" },
  { id: "ANGLO-COCU", label: "ANGLO-COCU", color: "#1A8FFF" },
  { id: "ANGLO-CARGAS VARIAS", label: "A-CARGAS VAR", color: "#FF6B35" },
  { id: "ANGLO-CAL", label: "ANGLO-CAL", color: "#00C49A" },
];

export default function RutasGps() {
  const [contrato, setContrato] = useState("TODOS");
  const [selectedViaje, setSelectedViaje] = useState<any>(null);
  const [showMap, setShowMap] = useState(false);
  const [rutaFilter, setRutaFilter] = useState<string | null>(null);

  const ayer = useMemo(() => {
    const d = new Date(Date.now() - 86400000);
    return d.toISOString().split("T")[0];
  }, []);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/rutas/viajes-dia", ayer, contrato],
    queryFn: async () => {
      const params = new URLSearchParams({ fecha: ayer });
      if (contrato !== "TODOS") params.set("contrato", contrato);
      const r = await fetch(`/api/rutas/viajes-dia?${params}`);
      return r.json();
    },
  });

  const { data: frecuentesData } = useQuery<any>({
    queryKey: ["/api/rutas/frecuentes", contrato],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (contrato !== "TODOS") params.set("contrato", contrato);
      const r = await fetch(`/api/rutas/frecuentes?${params}`);
      return r.json();
    },
  });

  const viajes = data?.viajes || [];
  const rutas = frecuentesData?.rutas || [];

  const viajesFiltrados = rutaFilter
    ? viajes.filter((v: any) => v.nombre_viaje === rutaFilter)
    : viajes;

  const kmTotalDia = viajes.reduce((s: number, v: any) => s + (v.km_total || 0), 0);
  const rendProm = viajes.filter((v: any) => v.rendimiento).length > 0
    ? (viajes.filter((v: any) => v.rendimiento).reduce((s: number, v: any) => s + v.rendimiento, 0) / viajes.filter((v: any) => v.rendimiento).length).toFixed(2)
    : null;

  return (
    <div className="space-y-4" data-testid="rutas-gps-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-rajdhani text-xl font-bold" style={{ color: "#c8e8ff" }} data-testid="text-rutas-title">
            RUTAS GPS
          </div>
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Viajes cerrados {ayer} -- {viajes.length} camiones activos
          </div>
        </div>
        <div className="flex gap-1.5">
          {CONTRATOS.map(c => (
            <button key={c.id}
              onClick={() => { setContrato(c.id); setRutaFilter(null); }}
              data-testid={`btn-contrato-${c.id}`}
              className="px-3 py-1.5 font-exo text-[11px] font-bold tracking-[0.1em] cursor-pointer transition-all"
              style={{
                background: contrato === c.id ? `${c.color}18` : "transparent",
                border: `1px solid ${contrato === c.id ? c.color : "#0d2035"}`,
                color: contrato === c.id ? c.color : "#3a6080",
              }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="CAMIONES" value={viajes.length} color="#00d4ff" testid="stat-camiones" />
        <StatCard label="KM TOTAL" value={kmTotalDia.toLocaleString()} color="#c8e8ff" testid="stat-km-total" />
        <StatCard label="REND PROM" value={rendProm ? `${rendProm} km/L` : "--"} color="#00c97a" testid="stat-rendimiento" />
        <StatCard label="RUTAS FRECUENTES" value={rutas.length} color="#ffcc00" testid="stat-rutas-frec" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-3">
          <div className="dash-card px-0 py-0">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
              <div className="flex items-center gap-2">
                <Route className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
                <span className="font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#c8e8ff" }}>
                  VIAJES DEL DIA
                </span>
                <span className="font-space text-xs" style={{ color: "#3a6080" }}>({viajesFiltrados.length})</span>
              </div>
              {rutaFilter && (
                <button onClick={() => setRutaFilter(null)}
                  data-testid="btn-clear-filter"
                  className="flex items-center gap-1 px-2 py-0.5 font-exo text-[11px] cursor-pointer"
                  style={{ background: "#ffcc0015", border: "1px solid #ffcc0040", color: "#ffcc00" }}>
                  <X className="w-3 h-3" /> Quitar filtro
                </button>
              )}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
                </div>
              )}
              {viajesFiltrados.map((v: any, i: number) => (
                <ViajeCard key={i} viaje={v} index={i} onVerMapa={() => { setSelectedViaje(v); setShowMap(true); }} />
              ))}
              {!isLoading && viajesFiltrados.length === 0 && (
                <div className="text-center py-12">
                  <Truck className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
                  <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
                    {rutaFilter ? "Ningun viaje coincide con esta ruta" : `Sin viajes GPS para ${ayer}`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="dash-card px-0 py-0">
            <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #0d2035" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: "#ffcc00" }} />
                <span className="font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#c8e8ff" }}>
                  RUTAS MAS FRECUENTES
                </span>
              </div>
              <div className="font-exo text-[11px] mt-0.5" style={{ color: "#3a6080" }}>
                Acumulado historico (min 3 repeticiones)
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
              {rutas.length === 0 && (
                <div className="text-center py-8">
                  <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
                    Acumulando datos... Se necesitan mas dias de operacion
                  </div>
                </div>
              )}
              <table className="w-full" data-testid="tabla-rutas-frecuentes">
                <thead>
                  <tr style={{ borderBottom: "1px solid #0d2035" }}>
                    <th className="text-left px-3 py-2 font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>Ruta</th>
                    <th className="text-right px-2 py-2 font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>Veces</th>
                    <th className="text-right px-2 py-2 font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>Km</th>
                    <th className="text-right px-3 py-2 font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>Rend</th>
                  </tr>
                </thead>
                <tbody>
                  {rutas.map((r: any, i: number) => (
                    <tr key={i}
                      onClick={() => setRutaFilter(r.ruta)}
                      data-testid={`ruta-frecuente-${i}`}
                      className="cursor-pointer transition-all hover:bg-[#0a1929]"
                      style={{
                        borderBottom: "1px solid #0d203540",
                        background: rutaFilter === r.ruta ? "#00d4ff10" : undefined,
                      }}>
                      <td className="px-3 py-2">
                        <div className="font-exo text-xs" style={{ color: rutaFilter === r.ruta ? "#00d4ff" : "#c8e8ff" }}>
                          {r.ruta}
                        </div>
                        <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
                          {r.camiones} camiones, {r.dias} dias
                        </div>
                      </td>
                      <td className="text-right px-2 py-2">
                        <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{r.veces}</span>
                      </td>
                      <td className="text-right px-2 py-2">
                        <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>{r.km_prom}</span>
                      </td>
                      <td className="text-right px-3 py-2">
                        <span className="font-space text-xs" style={{ color: r.rend_prom ? "#00c97a" : "#3a6080" }}>
                          {r.rend_prom ? `${r.rend_prom}` : "--"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showMap && selectedViaje && (
        <MapModal viaje={selectedViaje} onClose={() => { setShowMap(false); setSelectedViaje(null); }} />
      )}
    </div>
  );
}

function StatCard({ label, value, color, testid }: { label: string; value: string | number; color: string; testid: string }) {
  return (
    <div className="dash-card px-3 py-2.5" data-testid={testid}>
      <div className="font-space text-[18px] font-bold" style={{ color }} data-testid={`${testid}-value`}>{value}</div>
      <div className="font-exo text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>{label}</div>
    </div>
  );
}

function ViajeCard({ viaje: v, index, onVerMapa }: { viaje: any; index: number; onVerMapa: () => void }) {
  const FAENA_COLORS: Record<string, string> = {
    "CENCOSUD": "#00d4ff", "ANGLO-COCU": "#1A8FFF", "ANGLO-CARGAS VARIAS": "#FF6B35", "ANGLO-CAL": "#00C49A"
  };
  const cc = FAENA_COLORS[v.contrato] || "#c8e8ff";
  const horaInicio = v.hora_inicio ? new Date(v.hora_inicio).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--";
  const horaFin = v.hora_fin ? new Date(v.hora_fin).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--";

  return (
    <div className="px-4 py-3 transition-all hover:bg-[#0a1929]" data-testid={`viaje-card-${index}`}
      style={{ borderBottom: "1px solid #0d203530" }}>
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-space text-[12px] font-bold" style={{ color: cc }}>{v.patente}</span>
          {v.conductor && <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{v.conductor}</span>}
          <span className="font-exo text-xs px-1.5 py-0.5 rounded" style={{ background: `${cc}15`, color: cc, border: `1px solid ${cc}30` }}>
            {v.contrato}
          </span>
        </div>
        <button onClick={onVerMapa}
          data-testid={`btn-ver-mapa-${index}`}
          className="flex items-center gap-1 px-2.5 py-1 font-exo text-[11px] font-bold cursor-pointer transition-all hover:shadow-[0_0_8px_rgba(0,212,255,0.2)]"
          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}>
          <MapPin className="w-3 h-3" /> VER EN MAPA
        </button>
      </div>

      <div className="font-exo text-[11px] mb-1.5" style={{ color: "#c8e8ff" }} data-testid={`viaje-nombre-${index}`}>
        {v.nombre_viaje}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" style={{ color: "#3a6080" }} />
          <span className="font-space text-xs" style={{ color: "#3a6080" }}>{horaInicio} - {horaFin}</span>
          {v.duracion_min > 0 && <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>({v.duracion_min} min)</span>}
        </div>
        <div className="flex items-center gap-1">
          <Route className="w-3 h-3" style={{ color: "#3a6080" }} />
          <span className="font-space text-xs font-bold" style={{ color: v.km_total > 0 ? "#c8e8ff" : "#3a6080" }}>
            {v.km_total > 0 ? `${v.km_total} km` : "0 km"}
          </span>
        </div>
        {v.litros_ecu > 0 && (
          <div className="flex items-center gap-1">
            <Fuel className="w-3 h-3" style={{ color: "#3a6080" }} />
            <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>{v.litros_ecu} L</span>
          </div>
        )}
        {v.rendimiento && (
          <div className="flex items-center gap-1">
            <Gauge className="w-3 h-3" style={{ color: v.rendimiento < 2.0 ? "#ff2244" : v.rendimiento < 2.5 ? "#ffcc00" : "#00c97a" }} />
            <span className="font-space text-xs font-bold" style={{ color: v.rendimiento < 2.0 ? "#ff2244" : v.rendimiento < 2.5 ? "#ffcc00" : "#00c97a" }}>
              {v.rendimiento} km/L
            </span>
          </div>
        )}
        {v.vel_promedio > 0 && (
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Vel: {v.vel_promedio} prom / {v.vel_max} max
          </span>
        )}
      </div>
    </div>
  );
}

function MapModal({ viaje, onClose }: { viaje: any; onClose: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
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
    if (!leafletReady || !mapRef.current || !viaje?.puntos_gps?.length) return;
    const L = (window as any).L;

    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OSM &amp; CARTO',
    }).addTo(map);

    const pts = viaje.puntos_gps.filter((p: any) => p.lat && p.lng && isFinite(p.lat) && isFinite(p.lng));
    if (pts.length === 0) return;

    const coords = pts.map((p: any) => [p.lat, p.lng]);
    L.polyline(coords, { color: "#00d4ff", weight: 3, opacity: 0.8 }).addTo(map);

    const makeIcon = (color: string) => L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #020508;box-shadow:0 0 8px ${color}"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    });

    const first = pts[0];
    const last = pts[pts.length - 1];
    L.marker([first.lat, first.lng], { icon: makeIcon("#00c97a") }).addTo(map)
      .bindTooltip(viaje.lugar_origen || "Origen", { permanent: true, className: "leaflet-tooltip-custom", direction: "top", offset: [0, -10] });
    L.marker([last.lat, last.lng], { icon: makeIcon("#ff2244") }).addTo(map)
      .bindTooltip(viaje.lugar_destino || "Destino", { permanent: true, className: "leaflet-tooltip-custom", direction: "top", offset: [0, -10] });

    if (viaje.lugar_principal && viaje.lugar_principal_lat && viaje.lugar_principal_lng) {
      L.marker([parseFloat(viaje.lugar_principal_lat), parseFloat(viaje.lugar_principal_lng)], { icon: makeIcon("#00d4ff") }).addTo(map)
        .bindTooltip(viaje.lugar_principal, { permanent: true, className: "leaflet-tooltip-custom", direction: "top", offset: [0, -10] });
    }

    const namedPlaces = new Map<string, { lat: number; lng: number }>();
    for (const p of pts) {
      if (p.nombre && p.nombre !== viaje.lugar_origen && p.nombre !== viaje.lugar_destino && p.nombre !== viaje.lugar_principal) {
        if (!namedPlaces.has(p.nombre)) namedPlaces.set(p.nombre, { lat: p.lat, lng: p.lng });
      }
    }
    for (const [nombre, pos] of namedPlaces) {
      L.marker([pos.lat, pos.lng], { icon: makeIcon("#ffcc00") }).addTo(map)
        .bindTooltip(nombre, { permanent: true, className: "leaflet-tooltip-custom", direction: "top", offset: [0, -10] });
    }

    map.fitBounds(coords, { padding: [40, 40] });

    return () => { map.remove(); };
  }, [leafletReady, viaje]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-4 z-50 rounded-lg overflow-hidden flex flex-col" style={{ background: "#020508", border: "1px solid #0d2035" }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <div>
            <div className="font-space text-[13px] font-bold" style={{ color: "#00d4ff" }} data-testid="map-modal-patente">{viaje.patente}</div>
            <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{viaje.nombre_viaje}</div>
            <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
              {viaje.km_total} km {viaje.rendimiento ? `-- ${viaje.rendimiento} km/L` : ""} -- {viaje.total_puntos} puntos GPS
            </div>
          </div>
          <button onClick={onClose} data-testid="btn-close-map"
            className="p-2 cursor-pointer hover:opacity-70" style={{ color: "#3a6080" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 relative">
          <div ref={mapRef} className="absolute inset-0" data-testid="map-viaje" />
          <div className="absolute bottom-3 left-3 z-[1000] flex gap-2">
            {[{ color: "#00c97a", label: "Origen" }, { color: "#ff2244", label: "Destino" }, { color: "#00d4ff", label: "Principal" }, { color: "#ffcc00", label: "Paso" }].map(l => (
              <div key={l.label} className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: "rgba(2,5,8,0.85)" }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
