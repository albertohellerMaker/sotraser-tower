import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Map as MapIcon, CheckCircle, RefreshCw, MapPin, Clock, Gauge, Truck, ChevronDown, ChevronUp, Eye, Check, X, AlertTriangle, Cpu, Search, ArrowLeft, Route, Fuel, Users, Database, Activity, Brain, TrendingUp, Play, Loader2, RotateCcw, Info, Calendar, Droplets, Radio } from "lucide-react";

type GeoTab = "mapa" | "viajes" | "conductores" | "camiones" | "ia" | "recopilacion" | "aprendizaje" | "estaciones" | "rendimiento";

interface CamionLive {
  camionId: number;
  patente: string;
  modelo: string;
  conductor: string | null;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  rumbo: number;
  timestamp: string | null;
  estado: string;
  ageMinutes: number;
  fuelLevel: number | null;
}

interface GeoViaje {
  id: number;
  camionId: number;
  patente: string;
  contrato: string;
  origenNombre: string | null;
  destinoNombre: string | null;
  origenTimestamp: string | null;
  destinoTimestamp: string | null;
  kmGps: string | null;
  duracionMinutos: number | null;
  velocidadMaxima: string | null;
  velocidadPromedio: string | null;
  validacionEstado: string;
  validacionDetalle: any;
  sigetraKmDeltaPct: string | null;
  sigetraLitros: string | null;
  sigetraSurtidorEnRuta: boolean | null;
  validadoManualmente: boolean;
  notas: string | null;
}

interface GeoBase {
  id: number;
  nombre: string;
  lat: string;
  lng: string;
  radioMetros: number;
  contrato: string;
}

const estadoColors: Record<string, string> = {
  VALIDADO: "#00c97a",
  REVISAR: "#ffcc00",
  ANOMALIA: "#ff2244",
  PENDIENTE: "#3a6080",
};

const estadoLabels: Record<string, string> = {
  VALIDADO: "VALIDADO",
  REVISAR: "REVISAR",
  ANOMALIA: "ANOMALIA",
  PENDIENTE: "PENDIENTE",
};

function EstadoBadge({ estado }: { estado: string }) {
  const color = estadoColors[estado] || "#3a6080";
  return (
    <span className="font-exo text-[10px] font-bold px-2 py-0.5 rounded" style={{
      background: color + "20",
      border: `1px solid ${color}`,
      color,
    }} data-testid={`badge-estado-${estado}`}>
      {estadoLabels[estado] || estado}
    </span>
  );
}

function CamionStatusDot({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    EN_MOVIMIENTO: "#00c97a",
    DETENIDO_RECIENTE: "#ffcc00",
    DETENIDO: "#ff2244",
    "SIN_SEÑAL": "#3a6080",
  };
  return <div className="w-2 h-2 rounded-full" style={{ background: colors[estado] || "#3a6080" }} />;
}

function MapaEnVivo() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const fuelMarkersRef = useRef<any[]>([]);
  const [filter, setFilter] = useState("todos");
  const [selectedCamion, setSelectedCamion] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showFuelStations, setShowFuelStations] = useState(true);
  const [selectedEstacion, setSelectedEstacion] = useState<string | null>(null);

  const { data: camiones, refetch } = useQuery<CamionLive[]>({
    queryKey: ["/api/geo/camiones-live"],
    refetchInterval: 60000,
  });

  const { data: bases } = useQuery<GeoBase[]>({
    queryKey: ["/api/geo/bases"],
  });

  const { data: fuelData } = useQuery<any>({
    queryKey: ["/api/geo/cargas-combustible"],
  });


  const ingestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/geo/ingest-volvo"),
    onSuccess: () => { refetch(); },
  });

  const filtered = useMemo(() => {
    if (!camiones) return [];
    if (filter === "todos") return camiones;
    if (filter === "movimiento") return camiones.filter(c => c.estado === "EN_MOVIMIENTO");
    if (filter === "detenidos") return camiones.filter(c => c.estado === "DETENIDO" || c.estado === "DETENIDO_RECIENTE");
    if (filter === "sinsenal") return camiones.filter(c => c.estado === "SIN_SEÑAL");
    return camiones;
  }, [camiones, filter]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const loadLeaflet = async () => {
      const L = (window as any).L;
      if (!L) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => initMap();
        document.body.appendChild(script);
      } else {
        initMap();
      }
    };

    const initMap = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;
      const map = L.map(mapRef.current).setView([-33.45, -70.65], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      mapInstance.current = map;
    };

    loadLeaflet();
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstance.current || !camiones) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const statusColors: Record<string, string> = {
      EN_MOVIMIENTO: "#00c97a",
      DETENIDO_RECIENTE: "#ffcc00",
      DETENIDO: "#ff2244",
      "SIN_SEÑAL": "#3a6080",
    };

    for (const c of filtered) {
      if (!c.lat || !c.lng) continue;
      const color = statusColors[c.estado] || "#3a6080";
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:${color};border:2px solid #020508;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;transform:rotate(${c.rumbo}deg)">&#9650;</div>`,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([c.lat, c.lng], { icon })
        .addTo(mapInstance.current)
        .bindPopup(`
          <div style="font-family:monospace;font-size:12px;min-width:180px">
            <b>${c.patente}</b> ${c.conductor || ""}<br/>
            ${c.velocidad} km/h · ${c.estado.replace(/_/g, " ")}<br/>
            ${c.timestamp ? new Date(c.timestamp).toLocaleString("es-CL") : "Sin senal"}
          </div>
        `);
      marker.on("click", () => setSelectedCamion(c.camionId));
      markersRef.current.push(marker);
    }

    if (bases) {
      for (const b of bases) {
        const bLat = parseFloat(b.lat);
        const bLng = parseFloat(b.lng);
        const circle = L.circle([bLat, bLng], {
          radius: b.radioMetros,
          color: "#00d4ff",
          fillColor: "#00d4ff",
          fillOpacity: 0.05,
          weight: 1,
        }).addTo(mapInstance.current);
        markersRef.current.push(circle);
        const baseMarker = L.marker([bLat, bLng], {
          icon: L.divIcon({
            html: `<div style="width:8px;height:8px;background:#00d4ff;border-radius:2px;border:1px solid #020508"></div>`,
            className: "",
            iconSize: [8, 8],
            iconAnchor: [4, 4],
          }),
        }).addTo(mapInstance.current).bindTooltip(b.nombre, { permanent: false });
        markersRef.current.push(baseMarker);
      }
    }

    fuelMarkersRef.current.forEach(m => m.remove());
    fuelMarkersRef.current = [];
    if (showFuelStations && fuelData?.estaciones) {
      for (const est of fuelData.estaciones) {
        if (!est.lat || !est.lng) continue;
        const fuelIcon = L.divIcon({
          html: `<div style="width:28px;height:28px;background:#ff6600;border:2px solid #020508;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:bold">&#9981;</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const fuelMarker = L.marker([est.lat, est.lng], { icon: fuelIcon })
          .addTo(mapInstance.current)
          .bindPopup(`
            <div style="font-family:monospace;font-size:12px;min-width:200px">
              <b style="color:#ff6600">${est.nombre}</b><br/>
              <span style="color:#666">${est.ciudad}</span><br/>
              <hr style="border-color:#eee;margin:4px 0"/>
              <b>${est.cargas}</b> cargas -- <b>${est.litros.toLocaleString("es-CL")}</b> L<br/>
              ${est.camiones} camiones -- Ult: ${est.ultimaCarga ? new Date(est.ultimaCarga).toLocaleDateString("es-CL") : "--"}
            </div>
          `);
        fuelMarker.on("click", () => setSelectedEstacion(est.nombre));
        fuelMarkersRef.current.push(fuelMarker);
      }
    }
  }, [filtered, bases, fuelData, showFuelStations]);

  const counts = useMemo(() => {
    if (!camiones) return { total: 0, mov: 0, det: 0, sin: 0 };
    return {
      total: camiones.length,
      mov: camiones.filter(c => c.estado === "EN_MOVIMIENTO").length,
      det: camiones.filter(c => c.estado === "DETENIDO" || c.estado === "DETENIDO_RECIENTE").length,
      sin: camiones.filter(c => c.estado === "SIN_SEÑAL").length,
    };
  }, [camiones]);

  const estacionDetail = useMemo(() => {
    if (!selectedEstacion || !fuelData?.cargas) return null;
    const cargas = fuelData.cargas.filter((c: any) => c.lugar === selectedEstacion);
    if (!cargas.length) return null;
    const byTruck: Record<string, { patente: string; conductor: string; cargas: any[]; totalLitros: number }> = {};
    for (const c of cargas) {
      const key = String(c.numVeh);
      if (!byTruck[key]) byTruck[key] = { patente: key, conductor: c.conductor || "--", cargas: [], totalLitros: 0 };
      byTruck[key].cargas.push(c);
      byTruck[key].totalLitros += c.litros;
    }
    const trucks = Object.values(byTruck).sort((a, b) => b.totalLitros - a.totalLitros);
    const estacion = fuelData.estaciones?.find((e: any) => e.nombre === selectedEstacion);
    return { nombre: selectedEstacion, ciudad: estacion?.ciudad || "", totalCargas: cargas.length, totalLitros: cargas.reduce((s: number, c: any) => s + c.litros, 0), trucks };
  }, [selectedEstacion, fuelData]);

  const [expandedTruck, setExpandedTruck] = useState<string | null>(null);

  return (
    <div className="relative" style={{ height: "calc(100vh - 120px)" }} data-testid="geo-mapa">
      <div ref={mapRef} className="absolute inset-0 z-0 rounded" style={{ border: "1px solid #0d2035" }} />

      <div className="absolute top-3 left-3 z-10 flex gap-2">
        {[
          { id: "todos", label: `Todos (${counts.total})` },
          { id: "movimiento", label: `Mov (${counts.mov})`, color: "#00c97a" },
          { id: "detenidos", label: `Det (${counts.det})`, color: "#ffcc00" },
          { id: "sinsenal", label: `Sin (${counts.sin})`, color: "#3a6080" },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            data-testid={`geo-filter-${f.id}`}
            className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: filter === f.id ? (f.color || "#00d4ff") + "30" : "#020508cc",
              border: `1px solid ${filter === f.id ? (f.color || "#00d4ff") : "#0d2035"}`,
              color: filter === f.id ? (f.color || "#00d4ff") : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
        <button onClick={() => ingestMutation.mutate()} disabled={ingestMutation.isPending}
          data-testid="btn-ingest-volvo"
          className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer"
          style={{ background: "#00d4ff20", border: "1px solid #00d4ff", color: "#00d4ff" }}>
          <RefreshCw className={`w-3 h-3 inline mr-1 ${ingestMutation.isPending ? "animate-spin" : ""}`} />
          Ingest GPS
        </button>
        <button onClick={() => setShowFuelStations(!showFuelStations)}
          data-testid="btn-toggle-fuel"
          className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer"
          style={{
            background: showFuelStations ? "#ff660030" : "#020508cc",
            border: `1px solid ${showFuelStations ? "#ff6600" : "#0d2035"}`,
            color: showFuelStations ? "#ff6600" : "#3a6080",
          }}>
          <Fuel className="w-3 h-3 inline mr-1" />
          Estaciones ({fuelData?.estaciones?.filter((e: any) => e.lat)?.length || 0})
        </button>
      </div>

      {panelOpen && (
        <div className="absolute top-3 right-3 bottom-3 w-72 z-10 overflow-y-auto rounded" style={{
          background: "rgba(2,5,8,0.92)",
          border: "1px solid #0d2035",
          backdropFilter: "blur(8px)",
        }}>
          <div className="p-3 sticky top-0" style={{ background: "rgba(2,5,8,0.95)", borderBottom: "1px solid #0d2035" }}>
            <div className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>
              CAMIONES ACTIVOS
            </div>
          </div>
          <div className="p-2 space-y-1">
            {filtered?.map(c => (
              <div key={c.camionId}
                onClick={() => {
                  setSelectedCamion(c.camionId);
                  if (c.lat && c.lng && mapInstance.current) {
                    mapInstance.current.flyTo([c.lat, c.lng], 12, { duration: 0.5 });
                  }
                }}
                className="flex items-center gap-2 p-2 rounded cursor-pointer transition-all"
                style={{
                  background: selectedCamion === c.camionId ? "#00d4ff10" : "transparent",
                  border: `1px solid ${selectedCamion === c.camionId ? "#00d4ff40" : "transparent"}`,
                }}
                data-testid={`geo-camion-${c.patente}`}>
                <CamionStatusDot estado={c.estado} />
                <div className="flex-1 min-w-0">
                  <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</div>
                  <div className="font-exo text-[9px] truncate" style={{ color: "#3a6080" }}>
                    {c.velocidad > 0 ? `${c.velocidad} km/h` : c.estado === "SIN_SEÑAL" ? `Sin senal ${c.ageMinutes}min` : `Detenido ${c.ageMinutes}min`}
                    {c.conductor ? ` · ${c.conductor}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setPanelOpen(!panelOpen)}
        className="absolute top-3 z-10 font-exo text-[10px] px-2 py-1 rounded cursor-pointer"
        style={{
          right: panelOpen ? "19rem" : "0.75rem",
          background: "#020508cc",
          border: "1px solid #0d2035",
          color: "#3a6080",
        }}>
        {panelOpen ? ">" : "<"}
      </button>

      {estacionDetail && (
        <div className="absolute bottom-3 left-3 z-20 overflow-y-auto rounded" style={{
          background: "rgba(2,5,8,0.95)",
          border: "1px solid #ff6600",
          backdropFilter: "blur(8px)",
          maxHeight: "60%",
          width: "380px",
        }} data-testid="fuel-station-detail">
          <div className="p-3 flex items-center justify-between sticky top-0" style={{ background: "rgba(2,5,8,0.98)", borderBottom: "1px solid #0d2035" }}>
            <div>
              <div className="font-space text-[12px] font-bold tracking-wider" style={{ color: "#ff6600" }}>
                {estacionDetail.nombre}
              </div>
              <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
                {estacionDetail.ciudad} -- {estacionDetail.totalCargas} cargas -- {Math.round(estacionDetail.totalLitros).toLocaleString("es-CL")} L -- {estacionDetail.trucks.length} camiones
              </div>
            </div>
            <button onClick={() => setSelectedEstacion(null)} className="cursor-pointer" style={{ color: "#3a6080" }} data-testid="btn-close-fuel-detail">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-2 space-y-1">
            {estacionDetail.trucks.map(truck => (
              <div key={truck.patente}>
                <button
                  onClick={() => setExpandedTruck(expandedTruck === truck.patente ? null : truck.patente)}
                  className="w-full flex items-center gap-2 p-2 rounded cursor-pointer transition-all"
                  style={{
                    background: expandedTruck === truck.patente ? "#ff660015" : "transparent",
                    border: `1px solid ${expandedTruck === truck.patente ? "#ff660040" : "#0d203580"}`,
                  }}
                  data-testid={`btn-fuel-truck-${truck.patente}`}
                >
                  <Truck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ff6600" }} />
                  <div className="flex-1 text-left min-w-0">
                    <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{truck.patente}</span>
                    <span className="font-exo text-[10px] ml-2" style={{ color: "#3a6080" }}>{truck.conductor}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-space text-[11px] font-bold" style={{ color: "#ff6600" }}>{truck.cargas.length}</span>
                    <span className="font-exo text-[9px] ml-1" style={{ color: "#3a6080" }}>cargas</span>
                    <span className="font-space text-[10px] ml-2" style={{ color: "#c8e8ff" }}>{Math.round(truck.totalLitros).toLocaleString("es-CL")} L</span>
                  </div>
                  {expandedTruck === truck.patente ? <ChevronUp className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} />}
                </button>
                {expandedTruck === truck.patente && (
                  <div className="ml-6 mt-1 mb-2 space-y-1" data-testid={`fuel-detail-${truck.patente}`}>
                    {(() => {
                      const cm = null; // cruce-mensual query removed (duplicate)
                      if (!cm) return null;
                      const diffColor = Math.abs(cm.diferencia) <= 50 ? "#00c97a" : cm.diferencia > 0 ? "#ffcc00" : "#ff2244";
                      return (
                        <div className="p-2.5 rounded mb-2" style={{ background: "#00d4ff08", border: "1px solid #00d4ff30" }} data-testid={`cruce-mensual-${truck.patente}`}>
                          <div className="font-space text-[10px] font-bold tracking-wider mb-2" style={{ color: "#00d4ff" }}>CRUCE MENSUAL ACUMULADO</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            {/* Sigetra oculto - solo Volvo */}
                            <div className="flex justify-between">
                              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Consumo ECU Volvo</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{cm.litrosEcu.toLocaleString("es-CL")} L</span>
                            </div>
                            {/* N cargas Sigetra oculto */}
                            <div className="flex justify-between">
                              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>N viajes ECU</span>
                              <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{cm.viajesEcu}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Km odometro</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{cm.kmOdometro > 0 ? cm.kmOdometro.toLocaleString("es-CL") : "--"} km</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Km viajes ECU</span>
                              <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{cm.kmEcu > 0 ? cm.kmEcu.toLocaleString("es-CL") : "--"} km</span>
                            </div>
                            {cm.odoInicio > 0 && (
                              <div className="col-span-2 flex justify-between">
                                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Odo inicio / fin</span>
                                <span className="font-space text-[10px]" style={{ color: "#3a6080" }}>{cm.odoInicio.toLocaleString("es-CL")} / {cm.odoFin.toLocaleString("es-CL")}</span>
                              </div>
                            )}
                            {/* Rend Sigetra oculto */}
                            <div className="flex justify-between">
                              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Rend ECU Volvo</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: cm.rendimientoEcu >= 3.5 ? "#00c97a" : cm.rendimientoEcu > 0 ? "#ff2244" : "#3a6080" }}>
                                {cm.rendimientoEcu > 0 ? `${cm.rendimientoEcu.toFixed(2)} km/L` : "--"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 pt-2 flex justify-between items-center" style={{ borderTop: "1px solid #0d2035", display: 'none' }}>
                            <span className="font-exo text-[9px] font-bold" style={{ color: "#3a6080" }}>DIFERENCIA</span>
                            <div className="text-right">
                              <span className="font-space text-[11px] font-bold" style={{ color: diffColor }}>
                                {cm.diferencia > 0 ? "+" : ""}{cm.diferencia.toLocaleString("es-CL")} L
                              </span>
                              {cm.diferenciaPct !== 0 && (
                                <span className="font-exo text-[9px] ml-1" style={{ color: diffColor }}>
                                  ({cm.diferenciaPct > 0 ? "+" : ""}{cm.diferenciaPct}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {truck.cargas.sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map((c: any, i: number) => (
                      <div key={i} className="p-2 rounded" style={{ background: "#0d203530", border: "1px solid #0d2035" }}>
                        <div className="flex justify-between items-center">
                          <span className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>
                            {new Date(c.fecha).toLocaleDateString("es-CL")} {new Date(c.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="font-space text-[11px] font-bold" style={{ color: "#ff6600" }}>{c.litros.toFixed(1)} L</span>
                        </div>
                        <div className="flex gap-3 mt-1">
                          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Odo: {c.odometro?.toLocaleString("es-CL") || "--"} km</span>
                          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Km rec: {c.kmRecorrido?.toLocaleString("es-CL") || "--"}</span>
                          <span className="font-exo text-[9px]" style={{ color: c.rendimiento >= 3.5 ? "#00c97a" : c.rendimiento > 0 ? "#ff2244" : "#3a6080" }}>
                            Rend: {c.rendimiento > 0 ? `${c.rendimiento.toFixed(2)} km/L` : "--"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

interface ResumenFlota {
  kpis: { total_camiones: number; con_gps: number; sin_gps: number; total_viajes: number; total_km: number; ocultos_sin_gps: number };
  camiones: {
    patente: string; camionId: number; conductor: string | null; modelo: string;
    tiene_gps: boolean; puntos_gps: number; total_viajes: number; total_km: number;
    destino_top: string | null; validados: number; anomalias: number;
    sigetra_cargas: number; sigetra_litros: number;
  }[];
  camiones_sin_gps: { patente: string; camionId: number; modelo: string; conductor: string | null }[];
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

function PerfilCamion({ historial, onBack, onVerDetalle }: {
  historial: HistorialCamion;
  onBack: () => void;
  onVerDetalle: (viaje: HistorialCamion["viajes"][0]) => void;
}) {
  const { camion, viajes, sigetra, resumen, mensaje } = historial;

  return (
    <div data-testid="perfil-camion">
      <button onClick={onBack} className="flex items-center gap-1 mb-3 cursor-pointer font-exo text-[11px]" style={{ color: "#3a6080" }}
        data-testid="btn-volver-flota">
        <ArrowLeft className="w-3 h-3" /> Volver a flota
      </button>

      <div className="dash-card px-5 py-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5" style={{ color: "#00d4ff" }} />
            <span className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{camion.patente}</span>
            <span className="font-exo text-[10px] font-bold px-2 py-0.5 rounded" style={{
              background: "#00c97a15", border: "1px solid #00c97a", color: "#00c97a",
            }}>{camion.contrato || camion.faena || "CENCOSUD"}</span>
          </div>
          <div className="flex items-center gap-2">
            {camion.tiene_gps ? (
              <span className="font-exo text-[10px]" style={{ color: "#00c97a" }}>
                <Check className="w-3 h-3 inline mr-1" />{camion.total_puntos_gps} puntos GPS
              </span>
            ) : (
              <span className="font-exo text-[10px]" style={{ color: "#ff2244" }}>
                <X className="w-3 h-3 inline mr-1" />Sin GPS
              </span>
            )}
          </div>
        </div>
        {camion.conductor && (
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Conductor: {camion.conductor}</div>
        )}
        {camion.tiene_gps && camion.primer_punto && (
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            GPS desde {new Date(camion.primer_punto).toLocaleDateString("es-CL")}
          </div>
        )}
      </div>

      {!camion.tiene_gps ? (
        <div className="dash-card px-5 py-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#ff2244" }} />
          <div className="font-space text-[13px] font-bold" style={{ color: "#ff2244" }}>
            Sin datos GPS desde 01-03-2026
          </div>
          {sigetra && sigetra.total_cargas > 0 ? (
            <div className="mt-4 dash-card px-4 py-3 text-left" style={{ background: "#0a1520" }}>
              <div className="font-exo text-[10px] font-bold tracking-[0.15em] mb-2" style={{ color: "#3a6080" }}>
                SIN DATOS GPS
              </div>
              <div className="font-exo text-[10px] mt-2" style={{ color: "#3a6080" }}>
                Sin GPS no es posible reconstruir los viajes automaticamente.
              </div>
            </div>
          ) : (
            <div className="font-exo text-[11px] mt-2" style={{ color: "#3a6080" }}>
              {mensaje || "No hay datos disponibles para este camion en el periodo."}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="dash-card px-5 py-3 mb-4">
            <div className="font-exo text-[9px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>
              RESUMEN DEL PERIODO
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "VIAJES", value: resumen.total_viajes, color: "#00d4ff" },
                { label: "KM TOTAL", value: resumen.total_km_gps.toLocaleString(), color: "#00c97a" },
                { label: "DESTINO TOP", value: resumen.destino_mas_frecuente || "--", color: "#c8e8ff", small: true },
                { label: "ANOMALIAS", value: resumen.viajes_anomalia, color: resumen.viajes_anomalia > 0 ? "#ff2244" : "#3a6080" },
              ].map(k => (
                <div key={k.label}>
                  <div className="font-exo text-[8px] tracking-[0.1em]" style={{ color: "#3a6080" }}>{k.label}</div>
                  <div className={`font-space font-bold ${k.small ? "text-[11px]" : "text-[18px]"}`} style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {viajes.length === 0 ? (
            <div className="dash-card px-5 py-6 text-center">
              <Route className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
              <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
                {"GPS disponible pero sin viajes que cumplan criterios minimos (>30km, >1h)"}
              </div>
            </div>
          ) : (
            <div className="space-y-2" data-testid="lista-viajes">
              {viajes.map(v => (
                <div key={v.id} className="dash-card px-4 py-3" data-testid={`viaje-card-${v.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-space text-[12px] font-bold" style={{ color: "#3a6080" }}>
                        {v.fecha ? new Date(v.fecha + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--"}
                      </div>
                      <div className="font-exo text-[12px]" style={{ color: "#c8e8ff" }}>
                        {v.origen_nombre || "?"} → {v.destino_nombre || "?"}
                      </div>
                    </div>
                    <EstadoBadge estado={v.validacion_estado} />
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{v.km_gps.toFixed(0)} km</span>
                    <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{v.duracion_horas}h</span>
                    {v.velocidad_maxima > 0 && (
                      <span className="font-exo text-[10px]" style={{ color: v.velocidad_maxima > 90 ? "#ffcc00" : "#3a6080" }}>
                        max {v.velocidad_maxima} km/h
                      </span>
                    )}
                    {/* Sigetra match badge oculto */}
                    <div className="flex-1" />
                    <button onClick={() => onVerDetalle(v)}
                      className="font-exo text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                      style={{ background: "#00d4ff15", border: "1px solid #00d4ff40", color: "#00d4ff" }}
                      data-testid={`btn-ver-detalle-${v.id}`}>
                      <Eye className="w-3 h-3 inline mr-1" />Ver detalle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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

function ViajesCerrados() {
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

function CamionesTab() {
  const CONTRATOS = [
    { id: "TODOS", label: "TODOS", color: "#c8e8ff" },
    { id: "CENCOSUD", label: "CENCOSUD", color: "#00d4ff" },
    { id: "ANGLO-COCU", label: "ANGLO-COCU", color: "#1A8FFF" },
    { id: "ANGLO-CARGAS VARIAS", label: "A-CARGAS VAR", color: "#FF6B35" },
    { id: "ANGLO-CAL", label: "ANGLO-CAL", color: "#00C49A" },
  ];

  const [contrato, setContrato] = useState("TODOS");
  const [busq, setBusq] = useState("");
  const [sortBy, setSortBy] = useState<"patente" | "diffLt" | "diffPct" | "litrosSig" | "litrosEcu">("diffLt");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const contratoColor = CONTRATOS.find(c => c.id === contrato)?.color || "#c8e8ff";

  const contractQueries = CONTRATOS.filter(c => c.id !== "TODOS");
  const queries = useQueries({
    queries: contractQueries.map(c => {
      const params = c.id === "CENCOSUD" ? "contrato=CENCOSUD" : `contrato=${c.id.split("-")[0]}&subfaena=${c.id.split("-").slice(1).join("-")}`;
      return {
        queryKey: ["/api/geo/cruce-mensual", c.id],
        queryFn: () => fetch(`/api/geo/cruce-mensual?${params}`).then(r => r.json()),
        refetchInterval: 120000,
      };
    }),
  });

  const isLoading = queries.some(q => q.isLoading);

  const q0 = queries[0]?.data;
  const q1 = queries[1]?.data;
  const q2 = queries[2]?.data;
  const q3 = queries[3]?.data;

  const allData = useMemo(() => {
    const merged: Record<string, any> = {};
    contractQueries.forEach((c, i) => {
      const data = queries[i]?.data;
      if (!data?.camiones) return;
      for (const cam of data.camiones) {
        if (!merged[cam.patente]) {
          merged[cam.patente] = { ...cam, contrato: c.id };
        }
      }
    });
    return Object.values(merged);
  }, [q0, q1, q2, q3]);

  const { filtered, sinTelemetria } = useMemo(() => {
    let list = contrato === "TODOS" ? allData : allData.filter((c: any) => c.contrato === contrato);
    if (busq.trim()) {
      const b = busq.toLowerCase();
      list = list.filter((c: any) => c.patente?.toLowerCase().includes(b));
    }
    const sortFns: Record<string, (a: any, b: any) => number> = {
      patente: (a, b) => a.patente.localeCompare(b.patente),
      diffLt: (a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia),
      diffPct: (a, b) => Math.abs(b.diferenciaPct) - Math.abs(a.diferenciaPct),
      litrosSig: (a, b) => b.litrosSigetra - a.litrosSigetra,
      litrosEcu: (a, b) => b.litrosEcu - a.litrosEcu,
    };
    const sorted = [...list].sort(sortFns[sortBy] || sortFns.diffLt);
    const confiables = sorted.filter((c: any) => (c.confianza || "BAJA") !== "BAJA");
    const noConfiables = sorted.filter((c: any) => (c.confianza || "BAJA") === "BAJA");
    return { filtered: confiables, sinTelemetria: noConfiables };
  }, [allData, contrato, busq, sortBy]);

  const totals = useMemo(() => {
    const t = { camiones: filtered.length, litrosSig: 0, litrosEcu: 0, cargas: 0, viajes: 0, km: 0 };
    for (const c of filtered) {
      t.litrosSig += c.litrosSigetra || 0;
      t.litrosEcu += c.litrosEcu || 0;
      t.cargas += c.cargasSigetra || 0;
      t.viajes += c.viajesEcu || 0;
      t.km += c.kmEcu || 0;
    }
    return t;
  }, [filtered]);

  const fN = (n: number) => Math.round(n).toLocaleString("es-CL");

  const diffColor = (diff: number, pct: number) => {
    if (Math.abs(diff) < 50) return "#00c97a";
    if (Math.abs(pct) > 30) return "#ff2244";
    if (Math.abs(pct) > 15) return "#ffcc00";
    return "#c8e8ff";
  };

  const getContratoColor = (id: string) => CONTRATOS.find(c => c.id === id)?.color || "#3a6080";

  const barMax = useMemo(() => {
    let max = 0;
    for (const c of filtered) {
      if (c.litrosSigetra > max) max = c.litrosSigetra;
      if (c.litrosEcu > max) max = c.litrosEcu;
    }
    return max || 1;
  }, [filtered]);

  return (
    <div data-testid="geo-camiones">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-space text-[16px] font-bold tracking-[0.12em]" style={{ color: "#c8e8ff" }}>
            CONSUMO ECU POR CAMION
          </h2>
          <p className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Acumulado mensual por camion — consumo ECU Volvo (desde 01-MAR)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {CONTRATOS.map(c => (
          <button key={c.id} onClick={() => { setContrato(c.id); setExpandedRow(null); }}
            data-testid={`camiones-filter-${c.id}`}
            className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all tracking-[0.08em]"
            style={{
              background: contrato === c.id ? c.color + "20" : "transparent",
              border: `1px solid ${contrato === c.id ? c.color : "#0d2035"}`,
              color: contrato === c.id ? c.color : "#3a6080",
            }}>
            {c.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar patente..."
            data-testid="camiones-search"
            className="font-exo text-[11px] pl-7 pr-3 py-1.5 rounded w-40"
            style={{ background: "#091018", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "CAMIONES", val: totals.camiones, color: contratoColor },
          { label: "LT ECU", val: fN(totals.litrosEcu), color: "#00d4ff" },
          { label: "KM VOLVO", val: fN(totals.km), color: "#3a6080" },
        ].map(k => (
          <div key={k.label} className="dash-card px-3 py-2.5" data-testid={`camiones-kpi-${k.label.toLowerCase().replace(/ /g, "-")}`}>
            <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
            <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando datos...</div>
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          <table className="w-full" data-testid="camiones-table">
            <thead>
              <tr style={{ background: "#091018" }}>
                {[
                  { key: "patente", label: "PATENTE", w: "w-20" },
                  { key: "contrato", label: "CONTRATO", w: "w-24" },
                  { key: "litrosEcu", label: "LT ECU", w: "w-24" },
                  { key: "viajes", label: "SNAPS", w: "w-16" },
                  { key: "confianza", label: "CONFIANZA", w: "w-20" },
                  { key: "km", label: "KM ECU", w: "w-20" },
                  { key: "rend", label: "REND ECU", w: "w-16" },
                  { key: "bar", label: "COMPARATIVO", w: "flex-1" },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => ["patente", "diffLt", "diffPct", "litrosSig", "litrosEcu"].includes(col.key) ? setSortBy(col.key as any) : null}
                    className={`font-exo text-[9px] tracking-[0.12em] text-left px-2.5 py-2.5 ${col.w} ${["patente", "diffLt", "diffPct", "litrosSig", "litrosEcu"].includes(col.key) ? "cursor-pointer hover:text-[#c8e8ff]" : ""}`}
                    style={{ color: sortBy === col.key ? "#00d4ff" : "#3a6080", borderBottom: "1px solid #0d2035" }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <Fragment key={c.patente}>
                  <tr onClick={() => setExpandedRow(expandedRow === c.patente ? null : c.patente)}
                    data-testid={`camiones-row-${c.patente}`}
                    className="cursor-pointer transition-colors hover:bg-[#0d203520]"
                    style={{ borderBottom: "1px solid #0d2035" }}>
                    <td className="font-space text-[12px] font-bold px-2.5 py-2.5" style={{ color: "#00d4ff" }}>{c.patente}</td>
                    <td className="font-exo text-[10px] px-2.5 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: getContratoColor(c.contrato) + "20", color: getContratoColor(c.contrato) }}>
                        {CONTRATOS.find(ct => ct.id === c.contrato)?.label || c.contrato}
                      </span>
                    </td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#00d4ff" }}>{fN(c.litrosEcu)}</td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{c.viajesEcu}</td>
                    <td className="px-2.5 py-2.5">
                      <span className="font-exo text-[9px] font-bold px-2 py-0.5 rounded" style={{
                        background: c.confianza === "ALTA" ? "#00c97a20" : c.confianza === "MEDIA" ? "#ffcc0020" : "#ff224420",
                        color: c.confianza === "ALTA" ? "#00c97a" : c.confianza === "MEDIA" ? "#ffcc00" : "#ff2244",
                      }} data-testid={`confianza-${c.patente}`}>
                        {c.confianza || "BAJA"}
                      </span>
                    </td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{fN(c.kmEcu)}</td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: c.rendimientoEcu > 0 && c.rendimientoEcu < 2 ? "#ff2244" : c.rendimientoEcu < 2.5 ? "#ffcc00" : "#00c97a" }}>
                      {c.rendimientoEcu > 0 ? c.rendimientoEcu.toFixed(2) : "--"}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <div className="flex items-center gap-1">
                        <div className="font-exo text-[8px] w-5" style={{ color: "#3a6080" }}>ECU</div>
                        <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: "#0d2035" }}>
                          <div className="h-full rounded-sm" style={{ width: `${Math.min((c.litrosEcu / barMax) * 100, 100)}%`, background: "#00d4ff" }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                  {expandedRow === c.patente && (
                    <tr>
                      <td colSpan={8} style={{ background: "#060d15", borderBottom: "1px solid #0d2035" }}>
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="dash-card p-3">
                              <div className="font-exo text-[8px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>KM ECU VOLVO</div>
                              <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{fN(c.kmEcu)}</div>
                            </div>
                            <div className="dash-card p-3">
                              <div className="font-exo text-[8px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>REND ECU</div>
                              <div className="font-space text-[14px] font-bold" style={{ color: c.rendimientoEcu > 0 ? "#00d4ff" : "#3a6080" }}>
                                {c.rendimientoEcu > 0 ? `${c.rendimientoEcu.toFixed(2)} km/L` : "--"}
                              </div>
                            </div>
                            <div className="dash-card p-3">
                              <div className="font-exo text-[8px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>LT ECU CONSUMIDOS</div>
                              <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>
                                {fN(c.litrosEcu)} L
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="font-exo text-[9px] mb-1" style={{ color: "#3a6080" }}>ECU: {fN(c.litrosEcu)} L</div>
                              <div className="h-5 rounded overflow-hidden" style={{ background: "#0d2035" }}>
                                <div className="h-full rounded" style={{ width: `${Math.min((c.litrosEcu / barMax) * 100, 100)}%`, background: "#00d4ff" }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length > 0 && (
                <tr style={{ background: "#091018", borderTop: "2px solid #0d2035" }}>
                  <td className="font-space text-[11px] font-bold px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>TOTAL</td>
                  <td className="font-exo text-[10px] px-2.5 py-2.5" style={{ color: "#3a6080" }}>{filtered.length} cam</td>
                  <td className="font-space text-[11px] font-bold px-2.5 py-2.5" style={{ color: "#00d4ff" }}>{fN(totals.litrosEcu)}</td>
                  <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{fN(totals.viajes)}</td>
                  <td />
                  <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{fN(totals.km)}</td>
                  <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: totals.km > 0 && totals.litrosEcu > 0 ? "#00c97a" : "#3a6080" }}>
                    {totals.litrosEcu > 0 ? (totals.km / totals.litrosEcu).toFixed(2) : "--"}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Truck className="w-8 h-8 mx-auto mb-3" style={{ color: "#3a6080" }} />
              <div className="font-space text-[13px] font-bold" style={{ color: "#3a6080" }}>Sin camiones</div>
            </div>
          )}
        </div>
      )}

      {sinTelemetria.length > 0 && !isLoading && (
        <div className="mt-5" data-testid="sin-telemetria-section">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" style={{ color: "#3a6080" }} />
            <h3 className="font-space text-[13px] font-bold tracking-[0.1em]" style={{ color: "#3a6080" }}>
              SIN TELEMETRIA SUFICIENTE
            </h3>
            <span className="font-exo text-[10px] px-2 py-0.5 rounded" style={{ background: "#ff224415", color: "#ff2244" }}>
              {sinTelemetria.length} camiones — menos de 5 snapshots ECU
            </span>
          </div>
          <p className="font-exo text-[10px] mb-3" style={{ color: "#3a6080" }}>
            Estos camiones tienen datos ECU insuficientes para un cruce confiable. Excluidos del analisis principal.
          </p>
          <div className="dash-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ background: "#091018" }}>
                  {["PATENTE", "CONTRATO", "LT ECU", "SNAPS", "CONFIANZA"].map(h => (
                    <th key={h} className="font-exo text-[9px] tracking-[0.12em] text-left px-2.5 py-2"
                      style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sinTelemetria.map((c: any) => (
                  <tr key={c.patente} style={{ borderBottom: "1px solid #0d203530" }} data-testid={`sin-tel-row-${c.patente}`}>
                    <td className="font-space text-[11px] font-bold px-2.5 py-2" style={{ color: "#3a6080" }}>{c.patente}</td>
                    <td className="font-exo text-[10px] px-2.5 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: getContratoColor(c.contrato) + "20", color: getContratoColor(c.contrato) }}>
                        {CONTRATOS.find(ct => ct.id === c.contrato)?.label || c.contrato}
                      </span>
                    </td>
                    <td className="font-space text-[11px] px-2.5 py-2" style={{ color: "#3a6080" }}>{fN(c.litrosEcu)}</td>
                    <td className="font-space text-[11px] px-2.5 py-2" style={{ color: "#3a6080" }}>{c.viajesEcu}</td>
                    <td className="px-2.5 py-2">
                      <span className="font-exo text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "#ff224420", color: "#ff2244" }}>
                        BAJA
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalisisIATab() {
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
            <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
              Ultimo analisis: {haceMinutos < 60 ? `hace ${haceMinutos}min` : haceMinutos < 1440 ? `hace ${Math.floor(haceMinutos / 60)}h` : `hace ${Math.floor(haceMinutos / 1440)}d`}
            </span>
          )}
          <button onClick={() => generarMutation.mutate()}
            disabled={generarMutation.isPending}
            className="font-exo text-[10px] font-bold px-3 py-2 rounded cursor-pointer"
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
              <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{progreso.paso}</span>
              <span className="font-space text-[10px]" style={{ color: "#3a6080" }}>{progreso.progreso}/{progreso.total}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${progreso.total > 0 ? (progreso.progreso / progreso.total) * 100 : 0}%`,
                background: "#00c97a",
              }} />
            </div>
            {progreso.detalles && (
              <span className="font-exo text-[9px] mt-1 block" style={{ color: "#3a6080" }}>{progreso.detalles}</span>
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
            <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>VIAJES ANALIZADOS</div>
            <div className="font-space text-xl font-bold" style={{ color: "#00d4ff" }}>{analisis.resultadoJson.totalViajes || 0}</div>
          </div>
          <div className="dash-card px-4 py-3">
            <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>KM GPS TOTAL</div>
            <div className="font-space text-xl font-bold" style={{ color: "#00c97a" }}>{(analisis.resultadoJson.totalKmGps || 0).toLocaleString()}</div>
          </div>
          <div className="dash-card px-4 py-3">
            <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CAMIONES</div>
            <div className="font-space text-xl font-bold" style={{ color: "#c8e8ff" }}>{analisis.resultadoJson.camionesAnalizados || 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function AprendizajeWidget() {
  const { data: aprendizaje, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/aprendizaje"],
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading || !aprendizaje) return null;

  const r = aprendizaje.resumen;
  if (!r) return null;

  if (r.total_patrones === 0) {
    return (
      <div className="mb-4 border p-4" style={{ borderColor: "#0d2035", background: "#060d14", borderLeft: "3px solid #3a6080" }} data-testid="widget-aprendizaje">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          <span className="font-space text-[10px] font-bold tracking-[0.15em]" style={{ color: "#3a6080" }}>APRENDIENDO PATRONES DE CARGA</span>
        </div>
        <div className="font-rajdhani text-[12px]" style={{ color: "#4a7090" }}>
          El sistema comenzara a aprender patrones despues del primer ciclo de 30 minutos
        </div>
      </div>
    );
  }

  const borderColor =
    r.madurez_pct >= 80 ? "#00ff88" :
    r.madurez_pct >= 50 ? "#00d4ff" :
    r.madurez_pct >= 20 ? "#ffcc00" :
    "#3a6080";

  const confianzaNiveles = [
    { key: "experta", label: "EXPERTA", color: "#00ff88", desc: "200+ cargas" },
    { key: "alta", label: "ALTA", color: "#00d4ff", desc: "50+ cargas" },
    { key: "media", label: "MEDIA", color: "#ffcc00", desc: "10+ cargas" },
    { key: "baja", label: "BAJA", color: "#3a6080", desc: "<10 cargas" },
  ];

  return (
    <div className="mb-4 border" style={{ borderColor: "#0d2035", background: "#060d14", borderLeft: `3px solid ${borderColor}` }} data-testid="widget-aprendizaje">
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          <span className="font-space text-[10px] font-bold tracking-[0.15em]" style={{ color: "#00d4ff" }}>
            APRENDIENDO PATRONES DE CARGA
          </span>
          {r.ultima_actualizacion && (
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
              ultima actualizacion: {new Date(r.ultima_actualizacion).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <span className="font-space text-[10px] font-bold px-2 py-1" style={{
          color: r.madurez_pct >= 50 ? "#00ff88" : "#ffcc00",
          border: `1px solid ${r.madurez_pct >= 50 ? "#00ff8840" : "#ffcc0040"}`,
        }} data-testid="badge-madurez">
          {r.madurez_pct}% calibrado
        </span>
      </div>

      <div className="p-4">
        <div className="font-rajdhani text-[12px] mb-4 leading-relaxed" style={{ color: "#c8e8ff" }} data-testid="mensaje-aprendizaje">
          "{r.mensaje}"
        </div>

        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>MADUREZ DEL SISTEMA</span>
            <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{r.madurez_pct}%</span>
          </div>
          <div className="h-1.5 w-full" style={{ background: "#0d2035" }}>
            <div className="h-full transition-all duration-500" style={{
              width: `${r.madurez_pct}%`,
              background: r.madurez_pct >= 80 ? "#00ff88" : r.madurez_pct >= 50 ? "#00d4ff" : "#ffcc00",
            }} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>PATRONES ACTIVOS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#00d4ff" }} data-testid="stat-patrones">{r.total_patrones}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>combinaciones aprendidas</div>
          </div>
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>CAMIONES CONOCIDOS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#00ff88" }} data-testid="stat-camiones">{r.camiones_con_patron}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>con patron de carga propio</div>
          </div>
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>ESTACIONES CONOCIDAS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#ffcc00" }} data-testid="stat-estaciones">{r.estaciones_conocidas}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>con comportamiento aprendido</div>
          </div>
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>CARGAS ANALIZADAS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#c8e8ff" }} data-testid="stat-cargas">{r.cargas_historicas.toLocaleString("es-CL")}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>historial total procesado</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>DISTRIBUCION DE CONFIANZA</div>
          <div className="grid grid-cols-4 gap-2">
            {confianzaNiveles.map(nivel => (
              <div key={nivel.key} className="p-2 text-center" style={{ background: "#0a1520", border: `1px solid ${nivel.color}30` }}>
                <div className="font-space text-[16px] font-bold" style={{ color: nivel.color }}>{r.por_confianza[nivel.key]}</div>
                <div className="font-exo text-[8px] font-bold" style={{ color: nivel.color }}>{nivel.label}</div>
                <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{nivel.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {(() => {
          const primerSnapshot = new Date("2026-03-19");
          const diasConDatos = Math.max(1, Math.floor((Date.now() - primerSnapshot.getTime()) / (1000 * 60 * 60 * 24)));
          const coberturaEcuPct = Math.min(95, diasConDatos * 3);
          const diasParaCompleto = coberturaEcuPct >= 80 ? 0 : Math.ceil((80 - coberturaEcuPct) / 3);
          return (
            <div className="mb-4 rounded px-3 py-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }} data-testid="widget-cobertura-ecu">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-3 h-3" style={{ color: "#00d4ff" }} />
                <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>COBERTURA ECU VOLVO</span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>{coberturaEcuPct}%</span>
                <span className="font-rajdhani text-[10px]" style={{ color: "#4a7090" }}>Cobertura ECU actual</span>
                {diasParaCompleto > 0 && (
                  <span className="font-rajdhani text-[10px]" style={{ color: "#c8e8ff" }}>
                    - Sistema completo estimado: en {diasParaCompleto} dias
                  </span>
                )}
                {diasParaCompleto === 0 && (
                  <span className="font-rajdhani text-[10px]" style={{ color: "#00ff88" }}>
                    - Sistema operando normalmente
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${coberturaEcuPct}%`,
                  background: coberturaEcuPct >= 80 ? "#00ff88" : coberturaEcuPct >= 50 ? "#00d4ff" : "#ffcc00",
                }} />
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>CAMIONES MAS CONOCIDOS</div>
            <div className="space-y-1">
              {(aprendizaje.top_camiones || []).map((c: any, i: number) => (
                <div key={c.patente} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520" }} data-testid={`top-camion-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{i + 1}</span>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{c.patente}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{c.totalCargas || c.total_cargas} cargas</span>
                    <span className="font-exo text-[8px] px-1" style={{
                      color: c.confianza === "EXPERTA" ? "#00ff88" : c.confianza === "ALTA" ? "#00d4ff" : c.confianza === "MEDIA" ? "#ffcc00" : "#3a6080",
                      border: "1px solid currentColor",
                    }}>{c.confianza}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>ESTACIONES MAS CONOCIDAS</div>
            <div className="space-y-1">
              {(aprendizaje.top_estaciones || []).map((e: any, i: number) => (
                <div key={e.estacion} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520" }} data-testid={`top-estacion-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{i + 1}</span>
                    <span className="font-exo text-[10px] truncate max-w-[120px]" style={{ color: "#c8e8ff" }}>{e.estacion}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[10px]" style={{ color: "#ffcc00" }}>{Number(e.total_cargas).toLocaleString("es-CL")}</span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{e.camiones} cam.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodosEntreCargas() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/periodos-entre-cargas"],
    refetchInterval: 5 * 60 * 1000,
  });
  const [filtroNivel, setFiltroNivel] = useState<string>("TODOS");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#ff6600" }} />
    </div>
  );

  const resumen = data?.resumen;
  const periodos = useMemo(() => {
    if (!data?.periodos) return [];
    if (filtroNivel === "TODOS") return data.periodos;
    if (filtroNivel === "ANOMALIAS") return data.periodos.filter((p: any) => p.evaluacion.evaluable && p.evaluacion.nivel !== "NORMAL");
    return data.periodos.filter((p: any) => p.evaluacion.nivel === filtroNivel);
  }, [data, filtroNivel]);

  const nivelColors: Record<string, string> = {
    NORMAL: "#00ff88", REVISAR: "#ffcc00", SOSPECHOSO: "#FF8C00", CRITICO: "#ff2244",
    PENDIENTE: "#3a6080", SIN_DATOS: "#4a7090",
  };

  const filtros = [
    { id: "TODOS", label: `TODOS (${resumen?.total_periodos || 0})`, color: "#c8e8ff" },
    { id: "ANOMALIAS", label: `ANOMALIAS (${(resumen?.criticos || 0) + (resumen?.sospechosos || 0) + (resumen?.revisar || 0)})`, color: "#FF8C00" },
    { id: "CRITICO", label: `CRITICOS (${resumen?.criticos || 0})`, color: "#ff2244" },
    { id: "SOSPECHOSO", label: `SOSPECHOSOS (${resumen?.sospechosos || 0})`, color: "#FF8C00" },
    { id: "NORMAL", label: `NORMAL (${resumen?.normales || 0})`, color: "#00ff88" },
    { id: "PENDIENTE", label: `PENDIENTES (${resumen?.pendientes || 0})`, color: "#3a6080" },
  ];

  function formatDuracion(horas: number | null) {
    if (horas == null) return "--";
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h ${m}min`;
  }

  function formatFecha(fecha: string) {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }) +
      " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div data-testid="periodos-entre-cargas">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-5 h-5" style={{ color: "#ff6600" }} />
        <div>
          <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: "#ff6600" }}>
            ANALISIS ENTRE CARGAS
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            {resumen?.periodo_label} — {resumen?.patentes_analizadas || 0} patentes Volvo — Solo fisica del camion
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 mb-4">
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PERIODOS</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{resumen?.total_periodos || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>EVALUABLES</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{resumen?.evaluables || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#ff224410", border: "1px solid #ff224420" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CRITICOS</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#ff2244" }}>{resumen?.criticos || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#FF8C0010", border: "1px solid #FF8C0020" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>SOSPECHOSOS</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#FF8C00" }}>{resumen?.sospechosos || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>NORMALES</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{resumen?.normales || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PENDIENTES</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#3a6080" }}>{resumen?.pendientes || 0}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {filtros.map(f => (
          <button key={f.id}
            onClick={() => setFiltroNivel(f.id)}
            data-testid={`btn-periodo-filtro-${f.id.toLowerCase()}`}
            className="font-space text-[9px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: filtroNivel === f.id ? f.color + "15" : "#0a1520",
              border: `1px solid ${filtroNivel === f.id ? f.color : "#0d2035"}`,
              color: filtroNivel === f.id ? f.color : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {periodos.length === 0 && (
          <div className="text-center py-8 font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Sin periodos para el filtro seleccionado
          </div>
        )}
        {periodos.map((p: any, idx: number) => {
          const isExpanded = expandedIdx === idx;
          const nc = nivelColors[p.evaluacion.nivel] || "#3a6080";
          const borderColor = p.evaluacion.nivel === "CRITICO" ? "#ff2244" : p.evaluacion.nivel === "SOSPECHOSO" ? "#FF8C00" : "#0d2035";

          return (
            <div key={idx} className="rounded overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: "#0a1520" }} data-testid={`periodo-${idx}`}>
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all text-left"
                data-testid={`btn-periodo-${idx}`}>
                <span className="font-space text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{
                  background: nc + "15", border: `1px solid ${nc}30`, color: nc,
                }}>{p.evaluacion.nivel}</span>
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{p.patente}</span>
                <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>{p.conductor}</span>
                <span className="font-exo text-[8px] px-1.5 py-0.5 rounded" style={{ background: "#0d203550", color: "#4a7090" }}>{p.contrato}</span>
                <div className="flex-1" />
                {p.ecu.periodo_abierto ? (
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Periodo abierto</span>
                ) : (
                  <>
                    <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>{formatDuracion(p.ecu.horas_periodo)}</span>
                    {p.ecu.km != null && <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{p.ecu.km} km</span>}
                    {p.evaluacion.balance_litros != null && p.evaluacion.balance_litros > 0 && (
                      <span className="font-space text-[10px] font-bold" style={{ color: p.evaluacion.balance_litros > 50 ? "#ff2244" : "#ffcc00" }}>
                        +{p.evaluacion.balance_litros}L
                      </span>
                    )}
                  </>
                )}
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6080" }} />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid #0d2035" }}>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                      <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: "#3a6080" }}>CARGA A (INICIO PERIODO)</div>
                      <div className="font-space text-[12px] font-bold" style={{ color: "#ff6600" }}>{p.carga_a.litros}L</div>
                      <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>{p.carga_a.estacion}</div>
                      <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{formatFecha(p.carga_a.fecha)}</div>
                    </div>
                    <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                      <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: "#3a6080" }}>CARGA B (FIN PERIODO)</div>
                      {p.carga_b ? (
                        <>
                          <div className="font-space text-[12px] font-bold" style={{ color: "#ff6600" }}>{p.carga_b.litros}L</div>
                          <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>{p.carga_b.estacion}</div>
                          <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{formatFecha(p.carga_b.fecha)}</div>
                        </>
                      ) : (
                        <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Periodo abierto — sin carga siguiente registrada</div>
                      )}
                    </div>
                  </div>

                  {p.evaluacion.evaluable && (
                    <div className="mt-3">
                      <div className="font-exo text-[7px] tracking-wider mb-2" style={{ color: "#3a6080" }}>PERIODO: {formatDuracion(p.ecu.horas_periodo)}</div>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CONSUMO ECU</div>
                          <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>
                            {p.ecu.litros_consumidos != null ? `${p.ecu.litros_consumidos}L` : "--"}
                          </div>
                        </div>
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CARGADO (A)</div>
                          <div className="font-space text-[14px] font-bold" style={{ color: "#ff6600" }}>{p.carga_a.litros}L</div>
                        </div>
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>BALANCE</div>
                          <div className="font-space text-[14px] font-bold" style={{
                            color: p.evaluacion.balance_litros > 50 ? "#ff2244" : p.evaluacion.balance_litros > 20 ? "#ffcc00" : "#00ff88",
                          }}>
                            {p.evaluacion.balance_litros != null ? `${p.evaluacion.balance_litros > 0 ? "+" : ""}${p.evaluacion.balance_litros}L` : "--"}
                            {p.evaluacion.balance_pct != null && (
                              <span className="text-[10px] ml-1">({p.evaluacion.balance_pct}%)</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>RENDIMIENTO</div>
                          <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>
                            {p.evaluacion.rendimiento_real != null ? `${p.evaluacion.rendimiento_real} km/L` : "--"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-3">
                        <div className="font-exo text-[8px]" style={{ color: "#4a7090" }}>
                          Cobertura ECU: {p.ecu.cobertura_pct}% — {p.ecu.snap_count} snapshots — Calidad: {p.ecu.calidad}
                        </div>
                      </div>
                    </div>
                  )}

                  {p.evaluacion.razones.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {p.evaluacion.razones.map((r: string, ri: number) => (
                        <div key={ri} className="flex items-start gap-2 rounded px-3 py-2" style={{
                          background: "#020508", border: `1px solid ${nc}20`,
                        }}>
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: nc }} />
                          <span className="font-rajdhani text-[10px]" style={{ color: "#c8e8ff" }}>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EstacionesTab() {
  const [subVista, setSubVista] = useState<"ESTACIONES" | "ENTRE_CARGAS">("ESTACIONES");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/analisis"],
    refetchInterval: 5 * 60 * 1000,
  });

  const [expandedEstacion, setExpandedEstacion] = useState<string | null>(null);
  const [expandedCarga, setExpandedCarga] = useState<string | number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | "ANOMALIAS" | "CRITICO" | "SOSPECHOSO" | "REVISAR" | "CON_ECU" | "SIN_ECU">("TODOS");
  const [showResumenIA, setShowResumenIA] = useState(false);
  const [soloConEcu, setSoloConEcu] = useState<boolean>(() => {
    try { return localStorage.getItem("estaciones_solo_ecu") !== "false"; } catch { return true; }
  });

  const { data: resumenIA, isLoading: loadingIA } = useQuery<any>({
    queryKey: ["/api/estaciones/resumen-inteligencia"],
    enabled: showResumenIA,
  });

  const toggleSoloEcu = (val: boolean) => {
    setSoloConEcu(val);
    try { localStorage.setItem("estaciones_solo_ecu", String(val)); } catch {}
  };

  const cargasSinEcuCount = useMemo(() => {
    if (!data?.estaciones) return 0;
    return (data.estaciones as any[]).reduce((sum: number, e: any) =>
      sum + (e.cargas || []).filter((c: any) => !c.tiene_cruce_ecu && c.nivel_alerta === "NORMAL").length, 0);
  }, [data]);

  const estaciones = useMemo(() => {
    if (!data?.estaciones) return [];
    let filtered = data.estaciones.map((e: any) => {
      let cargas = e.cargas || [];
      if (soloConEcu && filtro !== "SIN_ECU") {
        cargas = cargas.filter((c: any) => c.tiene_cruce_ecu || c.nivel_alerta !== "NORMAL");
      }
      if (filtro === "CON_ECU") cargas = cargas.filter((c: any) => c.tiene_cruce_ecu);
      else if (filtro === "SIN_ECU") cargas = cargas.filter((c: any) => !c.tiene_cruce_ecu);
      else if (filtro === "CRITICO") cargas = cargas.filter((c: any) => c.nivel_alerta === "CRITICO");
      else if (filtro === "SOSPECHOSO") cargas = cargas.filter((c: any) => c.nivel_alerta === "SOSPECHOSO");
      else if (filtro === "REVISAR") cargas = cargas.filter((c: any) => c.nivel_alerta === "REVISAR");
      else if (filtro === "ANOMALIAS") cargas = cargas.filter((c: any) => c.nivel_alerta !== "NORMAL");
      return { ...e, cargas, total_cargas: cargas.length, total_litros: cargas.reduce((s: number, c: any) => s + (c.litros_sigetra || 0), 0), camiones_distintos: new Set(cargas.map((c: any) => c.patente)).size, tiene_anomalias: cargas.some((c: any) => c.nivel_alerta !== "NORMAL"), alertas_count: cargas.filter((c: any) => c.nivel_alerta !== "NORMAL").length };
    }).filter((e: any) => e.cargas.length > 0);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((e: any) =>
        e.nombre.toLowerCase().includes(term) ||
        e.ciudad?.toLowerCase().includes(term) ||
        e.cargas?.some((c: any) => c.patente?.toLowerCase().includes(term))
      );
    }
    return filtered;
  }, [data, searchTerm, filtro, soloConEcu]);

  const resumen = data?.resumen;
  const periodoLabel = resumen?.periodo?.label || "Ayer";

  const alertaColors: Record<string, string> = { NORMAL: "#00ff88", REVISAR: "#ffcc00", SOSPECHOSO: "#FF8C00", CRITICO: "#ff2244" };

  const filtroButtons = [
    { id: "TODOS" as const, label: `TODOS (${resumen?.total_cargas || 0})`, color: "#c8e8ff" },
    { id: "CON_ECU" as const, label: `CON ECU (${resumen?.cobertura?.cargas_con_cruce_ecu || 0})`, color: "#00ff88" },
    { id: "SIN_ECU" as const, label: `SIN ECU (${resumen?.cobertura?.cargas_volvo_sin_cruce || 0})`, color: "#4a7090" },
    { id: "ANOMALIAS" as const, label: `ANOMALIAS (${resumen?.cargas_anomalas || 0})`, color: "#FF8C00" },
    { id: "CRITICO" as const, label: `CRITICOS (${resumen?.cargas_criticas || 0})`, color: "#ff2244" },
    { id: "SOSPECHOSO" as const, label: "SOSPECHOSO", color: "#FF8C00" },
    { id: "REVISAR" as const, label: "REVISAR", color: "#ffcc00" },
  ];

  return (
    <div data-testid="estaciones-tab">
      <div className="flex items-center gap-1 mb-4">
        {[
          { id: "ESTACIONES" as const, label: "POR ESTACION", icon: <Fuel className="w-3.5 h-3.5" /> },
          { id: "ENTRE_CARGAS" as const, label: "ENTRE CARGAS", icon: <Activity className="w-3.5 h-3.5" /> },
        ].map(t => (
          <button key={t.id}
            onClick={() => setSubVista(t.id)}
            data-testid={`btn-subvista-${t.id.toLowerCase()}`}
            className="flex items-center gap-1.5 font-space text-[10px] font-bold tracking-wider px-4 py-2 cursor-pointer transition-all"
            style={{
              background: subVista === t.id ? "#ff660015" : "transparent",
              borderBottom: subVista === t.id ? "2px solid #ff6600" : "2px solid transparent",
              color: subVista === t.id ? "#ff6600" : "#3a6080",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {subVista === "ENTRE_CARGAS" ? <PeriodosEntreCargas /> : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#ff6600" }} />
        </div>
      ) : (
      <>
      <div className="mb-5 p-4 border" data-testid="panel-explicativo-estaciones"
        style={{
          borderColor: '#00d4ff20',
          background: 'rgba(0,212,255,0.02)',
          borderLeft: '3px solid #00d4ff'
        }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="font-space text-[11px] font-bold tracking-[0.15em]" style={{ color: '#00d4ff' }}>
            COMO FUNCIONA ESTE ANALISIS
          </span>
          <span className="font-exo text-[8px] px-2 py-0.5" style={{ color: '#00d4ff', border: '1px solid #00d4ff30' }}>
            T-2 &middot; 48 HORAS
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="font-exo text-[8px] font-bold tracking-wider uppercase mb-2" style={{ color: '#00d4ff' }}>
              POR QUE 48 HORAS ATRAS
            </div>
            <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: '#c8e8ff' }}>
              Analizamos T-2 — antes de ayer completo.
              Un camion puede cargar combustible hoy
              y consumirlo en los proximos 2 dias.
              Con 48 horas de distancia los periodos
              entre cargas estan cerrados y el ECU
              tiene el consumo real registrado.
            </div>
          </div>
          <div>
            <div className="font-exo text-[8px] font-bold tracking-wider uppercase mb-2" style={{ color: '#00ff88' }}>
              QUE CRUZAMOS
            </div>
            <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: '#c8e8ff' }}>
              Sigetra registra los litros que el
              surtidor entrego al camion.
              Volvo Connect registra los litros
              que el motor realmente quemo.
              Cruzamos ambas fuentes en el periodo
              real entre dos cargas consecutivas —
              sin importar si son 8 o 36 horas.
            </div>
          </div>
          <div>
            <div className="font-exo text-[8px] font-bold tracking-wider uppercase mb-2" style={{ color: '#ffcc00' }}>
              CUANDO ES ANOMALIA REAL
            </div>
            <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: '#c8e8ff' }}>
              Solo marcamos anomalia cuando el camion
              recorrio 100km+ y tiene 15+ snapshots
              Volvo en ese periodo. Si el camion
              simplemente no salio a ruta o el periodo
              esta incompleto — no se evalua.
              Sin evidencia suficiente no hay alerta.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 pt-3 border-t" style={{ borderColor: '#0d2035' }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
            <span className="font-exo text-[9px]" style={{ color: '#3a6080' }}>Solo camiones con Volvo Connect activo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00d4ff' }} />
            <span className="font-exo text-[9px]" style={{ color: '#3a6080' }}>Snapshots acumulando desde 19-Mar — cobertura mejora cada dia</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ffcc00' }} />
            <span className="font-exo text-[9px]" style={{ color: '#3a6080' }}>Click en cualquier alerta para ver el historial del mes del camion</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <Fuel className="w-5 h-5" style={{ color: "#ff6600" }} />
            <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: "#ff6600" }}>
              DETECCION DE IRREGULARIDADES
            </div>
          </div>
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            {periodoLabel} &middot; Solo camiones Volvo Connect &middot; Sigetra vs ECU
          </div>
          {resumen?.cobertura && (
            <div className="flex items-center gap-2 mt-1">
              <span className="font-rajdhani text-[10px]" style={{ color: "#4a7090" }}>
                {resumen.cobertura.cargas_con_cruce_ecu} con cruce ECU / {resumen.total_cargas} cargas Volvo totales / {resumen.cobertura.cargas_total_sigetra} en Sigetra
              </span>
              <span className="font-space text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                background: "#00ff8815",
                border: "1px solid #00ff8830",
                color: "#00ff88",
              }} data-testid="badge-cobertura-ecu">
                100% VOLVO CONNECT
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            const tc = resumen?.total_cargas || 0;
            const ce = resumen?.cobertura?.cargas_con_cruce_ecu || 0;
            const se = tc - ce;
            const cp = tc > 0 ? Math.round((ce / tc) * 100) : 0;
            const anomVerif = data?.estaciones
              ? (data.estaciones as any[]).reduce((sum: number, e: any) =>
                sum + (e.cargas || []).filter((c: any) => c.tiene_cruce_ecu && c.nivel_alerta !== "NORMAL").length, 0)
              : 0;
            return (
              <div className="grid grid-cols-4 gap-2">
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PERIODOS TOTALES</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>{tc}</div>
                </div>
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CON CRUCE ECU</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: cp >= 50 ? "#00ff88" : "#ffcc00" }}>{ce}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#4a7090" }}>{cp}% cobertura</div>
                </div>
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>SIN CRUCE ECU</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#4a7090" }}>{se}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#4a7090" }}>Mejora con el tiempo</div>
                </div>
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ANOMALIAS</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: anomVerif > 0 ? "#ff2244" : "#00ff88" }}>{anomVerif}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#4a7090" }}>De verificados</div>
                </div>
              </div>
            );
          })()}
          <button
            onClick={() => setShowResumenIA(!showResumenIA)}
            data-testid="btn-resumen-ia"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: showResumenIA ? "#00ff8815" : "#0a1520",
              border: `1px solid ${showResumenIA ? "#00ff88" : "#0d2035"}`,
            }}
          >
            <Brain className="w-4 h-4" style={{ color: showResumenIA ? "#00ff88" : "#4a7090" }} />
            <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: showResumenIA ? "#00ff88" : "#4a7090" }}>
              RESUMEN IA
            </span>
          </button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#3a6080" }} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar estacion o patente..."
              data-testid="input-search-estacion"
              className="pl-7 pr-3 py-1.5 rounded font-exo text-[11px]"
              style={{ background: "#0d203550", border: "1px solid #0d2035", color: "#c8e8ff", width: "200px" }}
            />
          </div>
        </div>
      </div>

      {showResumenIA && (
        <div className="mb-4 rounded overflow-hidden" style={{ background: "#0a1520", border: "1px solid #00ff8840" }} data-testid="panel-resumen-ia">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" style={{ color: "#00ff88" }} />
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00ff88" }}>QUE HA APRENDIDO EL SISTEMA</span>
            </div>
            <button onClick={() => setShowResumenIA(false)} className="cursor-pointer" data-testid="btn-close-resumen-ia">
              <X className="w-4 h-4" style={{ color: "#4a7090" }} />
            </button>
          </div>
          {loadingIA ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00ff88" }} />
              <span className="ml-2 font-exo text-[11px]" style={{ color: "#4a7090" }}>Generando resumen de inteligencia...</span>
            </div>
          ) : resumenIA ? (
            <div className="px-4 py-3">
              <div className="grid grid-cols-5 gap-3 mb-4">
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PATRONES</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{resumenIA.stats.total_patrones.toLocaleString("es-CL")}</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CAMIONES</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{resumenIA.stats.camiones}</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ESTACIONES</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#ff6600" }}>{resumenIA.stats.estaciones}</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CARGA PROM</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{resumenIA.stats.avg_carga_flota} L</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>DESV PROM</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#ffcc00" }}>{resumenIA.stats.desviacion_promedio} L</div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {resumenIA.insights.map((insight: string, i: number) => (
                  <div key={i} className="flex gap-2 rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }} data-testid={`insight-${i}`}>
                    <div className="w-1 rounded-full flex-shrink-0 mt-0.5" style={{ background: i === 0 ? "#00ff88" : i < 3 ? "#00d4ff" : "#4a7090", minHeight: "16px" }} />
                    <p className="font-rajdhani text-[11px] leading-relaxed" style={{ color: "#c8e8ff" }}>{insight}</p>
                  </div>
                ))}
              </div>

              {resumenIA.stats.contratos && resumenIA.stats.contratos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#ff6600" }}>MAYOR CONSUMO POR CARGA</div>
                    <div className="space-y-1">
                      {(resumenIA.stats.top_consumidores || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: "#0d203530" }}>
                          <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#ff2244" }} />
                          <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                          <span className="ml-auto font-space text-[10px] font-bold" style={{ color: "#ff6600" }}>{c.litros} L</span>
                          <span className="font-exo text-[8px]" style={{ color: "#4a7090" }}>{c.cargas} cargas</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#00ff88" }}>MENOR CONSUMO POR CARGA</div>
                    <div className="space-y-1">
                      {(resumenIA.stats.top_eficientes || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: "#0d203530" }}>
                          <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#00ff88" }} />
                          <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                          <span className="ml-auto font-space text-[10px] font-bold" style={{ color: "#00ff88" }}>{c.litros} L</span>
                          <span className="font-exo text-[8px]" style={{ color: "#4a7090" }}>{c.cargas} cargas</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {filtroButtons.map(f => (
          <button key={f.id}
            onClick={() => setFiltro(f.id)}
            data-testid={`btn-filtro-est-${f.id.toLowerCase()}`}
            className="font-space text-[9px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: filtro === f.id ? f.color + "15" : "#0a1520",
              border: `1px solid ${filtro === f.id ? f.color : "#0d2035"}`,
              color: filtro === f.id ? f.color : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => toggleSoloEcu(!soloConEcu)}
            data-testid="btn-toggle-solo-ecu"
            className="flex items-center gap-1.5 font-space text-[9px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: soloConEcu ? "#00ff8810" : "#0a1520",
              border: `1px solid ${soloConEcu ? "#00ff8830" : "#0d2035"}`,
              color: soloConEcu ? "#00ff88" : "#3a6080",
            }}>
            <Check className="w-3 h-3" style={{ opacity: soloConEcu ? 1 : 0.3 }} />
            Solo con ECU
          </button>
          {soloConEcu && cargasSinEcuCount > 0 && (
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }} data-testid="text-ocultas-sin-ecu">
              {cargasSinEcuCount} cargas sin ECU ocultas
            </span>
          )}
        </div>
      </div>

      {(() => {
        const totalC = resumen?.total_cargas || 0;
        const conEcuC = resumen?.cobertura?.cargas_con_cruce_ecu || 0;
        const cobPct = totalC > 0 ? Math.round((conEcuC / totalC) * 100) : 0;
        if (cobPct < 50) return (
          <div className="rounded px-4 py-3 mb-4 flex items-start gap-3" style={{ background: "#ffcc0008", border: "1px solid #ffcc0025", borderLeft: "3px solid #ffcc00" }} data-testid="banner-calibracion-est">
            <Radio className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ffcc00" }} />
            <div>
              <div className="font-space text-[10px] font-bold tracking-wider mb-1" style={{ color: "#ffcc00" }}>SISTEMA EN CALIBRACION</div>
              <div className="font-rajdhani text-[11px] leading-relaxed" style={{ color: "#c8e8ff" }}>
                Cruce ECU disponible en {cobPct}% de las cargas. Los snapshots Volvo cubren desde el 19-Mar. La cobertura aumenta automaticamente a medida que se acumulan mas datos.
              </div>
            </div>
          </div>
        );
        if (cobPct <= 80) return (
          <div className="rounded px-4 py-3 mb-4 flex items-start gap-3" style={{ background: "#00d4ff08", border: "1px solid #00d4ff25", borderLeft: "3px solid #00d4ff" }} data-testid="banner-cobertura-parcial-est">
            <Radio className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#00d4ff" }} />
            <div>
              <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>Cobertura parcial — {cobPct}% con ECU</div>
            </div>
          </div>
        );
        return null;
      })()}

      <div className="mb-4 rounded p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }} data-testid="panel-señales-activas">
        <div className="font-space text-[10px] font-bold tracking-[0.15em] mb-3" style={{ color: "#ff6600" }}>SEÑALES ACTIVAS DE DETECCION</div>
        <div className="grid grid-cols-5 gap-2">
          <div className="rounded px-3 py-2" style={{ background: "#ff224408", border: "1px solid #ff224420" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>ECU vs SIGETRA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Declaro mas litros de los que entraron</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#00ff8810", color: "#00ff88" }}>Solo Volvo</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#ff224408", border: "1px solid #ff224420" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>BALANCE DEL DIA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Cargo mucho mas de lo que consumio</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#00ff8810", color: "#00ff88" }}>Solo Volvo</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#ff224408", border: "1px solid #ff224420" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>CARGA ANTICIPADA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Cargo con estanque lleno sin necesidad</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#ffcc0015", color: "#ffcc00" }}>Todos (con ECU)</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#FF8C0008", border: "1px solid #FF8C0020" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#FF8C00" }}>DOBLE CARGA RAPIDA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Doble carga bajo umbral aprendido</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#ffcc0015", color: "#ffcc00" }}>Todos (con ECU)</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#FF8C0008", border: "1px solid #FF8C0020" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#FF8C00" }}>MICRO CARGA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Cargo menos del minimo operacional</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#c8e8ff10", color: "#c8e8ff" }}>Todos</div>
          </div>
        </div>
      </div>

      {data?.balances_dia && data.balances_dia.length > 0 && (
        <div className="mb-4 rounded overflow-hidden" style={{ background: "#0a1520", border: "1px solid #ff224440", borderLeft: "3px solid #ff2244" }} data-testid="panel-balance-dia">
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: "#ff2244" }} />
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#ff2244" }}>
                BALANCE POR PERIODO — {data.balances_dia.length} CAMION{data.balances_dia.length > 1 ? "ES" : ""} CON EXCESO
              </span>
            </div>
            <div className="font-exo text-[9px] mt-1" style={{ color: "#4a7090" }}>
              Periodos entre cargas donde lo cargado supera significativamente el consumo ECU
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "#0d2035" }}>
            {data.balances_dia.map((b: any, i: number) => (
              <div key={i} className="px-4 py-2 flex items-center gap-4" data-testid={`balance-dia-${i}`}>
                <span className="font-space text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                  background: b.nivel === "CRITICO" ? "#ff224415" : "#FF8C0015",
                  border: `1px solid ${b.nivel === "CRITICO" ? "#ff224430" : "#FF8C0030"}`,
                  color: b.nivel === "CRITICO" ? "#ff2244" : "#FF8C00",
                }}>{b.nivel}</span>
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{b.patente}</span>
                <span className="font-exo text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#0d203550", color: "#4a7090" }}>{b.contrato}</span>
                <div className="flex-1 font-rajdhani text-[10px]" style={{ color: "#c8e8ff" }}>{b.mensaje}</div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CARGADO</div>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#ff6600" }}>{b.litros_cargados_sigetra || b.litros_cargados}L</div>
                  </div>
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>ECU CONSUMO</div>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{b.litros_consumidos_ecu}L</div>
                  </div>
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>EXCESO</div>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>+{b.diferencia}L ({b.pct_exceso}%)</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AprendizajeWidget />

      <div className="space-y-2">
        {estaciones.map((est: any, idx: number) => {
          const isExpanded = expandedEstacion === est.nombre;
          const totalLitros = resumen?.total_litros || 1;
          const litrosPct = totalLitros > 0 ? Math.round((est.total_litros / totalLitros) * 100) : 0;
          const borderColor = est.tiene_anomalias ? "#ff2244" : isExpanded ? "#ff6600" : "#0d2035";
          return (
            <div key={est.nombre}
              data-testid={`card-estacion-${idx}`}
              className="rounded overflow-hidden"
              style={{ border: `1px solid ${borderColor}`, background: "#0a1520" }}>
              <button
                onClick={() => setExpandedEstacion(isExpanded ? null : est.nombre)}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all"
                style={{ background: isExpanded ? "#ff660008" : "transparent" }}
                data-testid={`btn-estacion-${idx}`}>
                <Fuel className="w-4 h-4 flex-shrink-0" style={{ color: est.tiene_anomalias ? "#ff2244" : "#ff6600" }} />
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{est.nombre}</span>
                    {est.ciudad && <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{est.ciudad}</span>}
                    {est.alertas_count > 0 && (
                      <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244" }}>
                        {est.alertas_count} ALERTA{est.alertas_count > 1 ? "S" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                      <div className="h-full rounded-full" style={{ width: `${litrosPct}%`, background: est.tiene_anomalias ? "#ff2244" : "#ff6600" }} />
                    </div>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{litrosPct}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-right flex-shrink-0">
                  <div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>LITROS</div>
                    <div className="font-space text-[12px] font-bold" style={{ color: "#ff6600" }}>{Math.round(est.total_litros).toLocaleString("es-CL")}</div>
                  </div>
                  <div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CARGAS</div>
                    <div className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{est.total_cargas}</div>
                  </div>
                  <div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CAMIONES</div>
                    <div className="font-space text-[12px] font-bold" style={{ color: "#00d4ff" }}>{est.camiones_distintos}</div>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "#3a6080" }} />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-3" style={{ borderTop: "1px solid #0d2035" }}>
                  <div className="font-space text-[9px] font-bold tracking-wider mb-1.5 pt-2" style={{ color: "#ff6600" }}>
                    CARGAS EN ESTA ESTACION ({est.total_cargas})
                  </div>
                  <div className="space-y-1.5">
                    {(est.cargas || []).sort((a: any, b: any) => {
                      const order: Record<string, number> = { CRITICO: 0, SOSPECHOSO: 1, REVISAR: 2, NORMAL: 3 };
                      return (order[a.nivel_alerta] ?? 3) - (order[b.nivel_alerta] ?? 3);
                    }).map((carga: any, ci: number) => {
                      const ac = alertaColors[carga.nivel_alerta] || "#3a6080";
                      const cargaKey = carga.id ?? `${est.nombre}-${ci}`;
                      const isDetailOpen = expandedCarga === cargaKey;
                      const fechaCarga = new Date(carga.fecha);
                      const fechaStr = fechaCarga.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                      return (
                        <div key={ci} className="rounded overflow-hidden" style={{ background: "#0d203520", border: `1px solid ${carga.nivel_alerta !== "NORMAL" ? ac + "40" : "#0d203580"}`, borderLeft: `3px solid ${ac}` }} data-testid={`estacion-carga-${idx}-${ci}`}>
                          <button
                            className="w-full p-2.5 cursor-pointer transition-all text-left"
                            style={{ background: isDetailOpen ? ac + "08" : "transparent" }}
                            onClick={() => setExpandedCarga(isDetailOpen ? null : cargaKey)}
                            data-testid={`btn-carga-detail-${idx}-${ci}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <Truck className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
                                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{carga.patente}</span>
                                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{carga.conductor}</span>
                                {carga.tiene_cruce_ecu ? (
                                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: ac, background: ac + "15", border: `1px solid ${ac}30` }}>
                                    {carga.nivel_alerta}
                                  </span>
                                ) : (
                                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5 flex items-center gap-1" style={{ color: "#4a7090", background: "#4a709015", border: "1px solid #4a709030" }}>
                                    <Radio className="w-2.5 h-2.5" /> SIN_DATOS
                                  </span>
                                )}
                                {carga.tiene_cruce_ecu && (
                                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830" }}>
                                    ECU OK
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{carga.hora}</span>
                                <span className="font-space text-[10px] font-bold" style={{ color: "#ff6600" }}>{Math.round(carga.litros_sigetra)} L</span>
                                {carga.tiene_cruce_ecu && carga.ecu_consumo_periodo != null && (
                                  <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                                    ECU: {Math.round(carga.ecu_consumo_periodo)}L consumido / {Math.round(carga.ecu_km_periodo || 0)}km
                                  </span>
                                )}
                                {isDetailOpen ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#4a7090" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6080" }} />}
                              </div>
                            </div>
                            {carga.razones.length > 0 && (
                              <div className="ml-5 mt-1 space-y-0.5">
                                {carga.razones.map((r: string, ri: number) => (
                                  <div key={ri} className="font-rajdhani text-[10px] flex items-start gap-1" style={{ color: ac }}>
                                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {r}
                                  </div>
                                ))}
                              </div>
                            )}
                          </button>

                          {isDetailOpen && (
                            <div className="px-4 pb-3 pt-2" style={{ borderTop: `1px solid ${ac}25` }} data-testid={`detail-carga-${idx}-${ci}`}>
                              <div className="grid grid-cols-3 gap-3 mb-3">
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Calendar className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>FECHA Y HORA</span>
                                  </div>
                                  <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{fechaStr}</div>
                                  <div className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{carga.hora}</div>
                                </div>
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Droplets className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>LITROS SIGETRA</span>
                                  </div>
                                  <div className="font-space text-[16px] font-bold" style={{ color: "#ff6600" }}>{carga.litros_sigetra.toLocaleString("es-CL", { maximumFractionDigits: 1 })} L</div>
                                </div>
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Gauge className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ODOMETRO</span>
                                  </div>
                                  <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{carga.odometro ? carga.odometro.toLocaleString("es-CL") + " km" : "--"}</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Truck className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CAMION</span>
                                  </div>
                                  <div className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{carga.patente}</div>
                                  <div className="font-exo text-[10px]" style={{ color: "#4a7090" }}>{carga.conductor}</div>
                                </div>
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Route className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CONTRATO</span>
                                  </div>
                                  <div className="font-space text-[12px] font-bold" style={{ color: "#00d4ff" }}>{carga.contrato || "Sin contrato"}</div>
                                </div>
                              </div>

                              {carga.tiene_cruce_ecu && (
                                <div className="rounded px-3 py-2 mb-3" style={{ background: "#00ff8808", border: "1px solid #00ff8820" }}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Cpu className="w-3 h-3" style={{ color: "#00ff88" }} />
                                    <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#00ff88" }}>CRUCE ECU VOLVO</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div>
                                      <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CONSUMO ENTRE SNAPSHOTS</div>
                                      <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{carga.ecu_consumo_periodo != null ? carga.ecu_consumo_periodo.toFixed(1) + " L" : "--"}</div>
                                    </div>
                                    <div>
                                      <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>KM ENTRE SNAPSHOTS</div>
                                      <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{carga.ecu_km_periodo != null ? carga.ecu_km_periodo.toFixed(1) + " km" : "--"}</div>
                                    </div>
                                    <div>
                                      <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>DELTA</div>
                                      <div className="font-space text-[13px] font-bold" style={{ color: carga.litros_delta != null && carga.litros_delta > 25 ? "#ff2244" : "#00ff88" }}>
                                        {carga.litros_delta != null ? (carga.litros_delta > 0 ? "+" : "") + carga.litros_delta.toFixed(1) + " L" : "OK"}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="font-rajdhani text-[10px] mt-2" style={{ color: "#4a7090" }}>
                                    Ventana: 3h antes / 3h despues de la carga. Consumo ECU = totalFuelUsed despues - antes.
                                  </div>
                                </div>
                              )}

                              {!carga.tiene_cruce_ecu && (
                                <div className="rounded px-3 py-2 mb-3" style={{ background: "#4a709008", border: "1px solid #4a709020" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Radio className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#4a7090" }}>{carga.patente} - Sin ECU disponible</span>
                                  </div>
                                  <div className="font-rajdhani text-[11px] mb-1" style={{ color: "#c8e8ff" }}>
                                    Sigetra: {Math.round(carga.litros_sigetra)} L cargados
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Radio className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-rajdhani text-[10px]" style={{ color: "#4a7090" }}>
                                      Snapshots no disponibles para este periodo
                                    </span>
                                  </div>
                                </div>
                              )}

                              {carga.razones.length > 0 && (
                                <div className="rounded px-3 py-2" style={{ background: ac + "08", border: `1px solid ${ac}20` }}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <AlertTriangle className="w-3 h-3" style={{ color: ac }} />
                                    <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: ac }}>RAZONES DE ALERTA</span>
                                  </div>
                                  <div className="space-y-1">
                                    {carga.razones.map((r: string, ri: number) => (
                                      <div key={ri} className="font-rajdhani text-[11px] flex items-start gap-2 rounded px-2 py-1.5" style={{ background: "#020508", border: `1px solid ${ac}15` }}>
                                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: ac }} />
                                        <span style={{ color: "#c8e8ff" }}>{r}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {carga.razones.length === 0 && carga.nivel_alerta === "NORMAL" && carga.tiene_cruce_ecu && (
                                <div className="flex items-center gap-2 rounded px-3 py-2" style={{ background: "#00ff8808", border: "1px solid #00ff8820" }}>
                                  <CheckCircle className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />
                                  <span className="font-rajdhani text-[11px]" style={{ color: "#00ff88" }}>Sin anomalias detectadas en esta carga</span>
                                </div>
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
        })}

        {estaciones.length === 0 && (
          <div className="font-exo text-[11px] py-8 text-center" style={{ color: "#3a6080" }}>
            {filtro !== "TODOS" ? `Sin estaciones con cargas ${filtro.toLowerCase()} ayer` : "Sin datos de cargas para ayer"}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

const CONTRATOS_GEO = [
  { id: "CENCOSUD", label: "CENCOSUD", color: "#00d4ff" },
  { id: "ANGLO", label: "ANGLO", color: "#FF6B35", subfaenas: [
    { id: "ANGLO-COCU", label: "COCU", color: "#1A8FFF" },
    { id: "ANGLO-CARGAS VARIAS", label: "CARGAS VARIAS", color: "#FF6B35" },
    { id: "ANGLO-CAL", label: "CAL", color: "#00C49A" },
  ]},
];

function ConductoresTab() {
  const [selectedContrato, setSelectedContrato] = useState("CENCOSUD");
  const [selectedSubfaena, setSelectedSubfaena] = useState("");

  const contratoParam = selectedContrato;
  const subfaenaParam = selectedSubfaena;

  const { data: conductoresData, isLoading } = useQuery<any>({
    queryKey: ["/api/geo/conductores", contratoParam, subfaenaParam],
    queryFn: async () => {
      let url = `/api/geo/conductores?contrato=${encodeURIComponent(contratoParam)}`;
      if (subfaenaParam) url += `&subfaena=${encodeURIComponent(subfaenaParam)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const [expandedConductor, setExpandedConductor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"litros" | "rend_asc" | "rend_desc">("litros");

  const activeColor = selectedSubfaena
    ? (CONTRATOS_GEO.find(c => c.id === "ANGLO")?.subfaenas?.find(s => s.id === selectedSubfaena)?.color || "#FF6B35")
    : (CONTRATOS_GEO.find(c => c.id === selectedContrato)?.color || "#00d4ff");

  const filtered = useMemo(() => {
    if (!conductoresData?.conductores) return [];
    let list = conductoresData.conductores;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((c: any) =>
        c.nombre.toLowerCase().includes(term) || c.camiones.some((p: string) => p.includes(term))
      );
    }
    if (sortBy === "rend_asc") {
      list = [...list].sort((a: any, b: any) => (a.rendimiento || 999) - (b.rendimiento || 999));
    } else if (sortBy === "rend_desc") {
      list = [...list].sort((a: any, b: any) => (b.rendimiento || 0) - (a.rendimiento || 0));
    }
    return list;
  }, [conductoresData, searchTerm, sortBy]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#00d4ff" }} />
    </div>
  );

  return (
    <div data-testid="conductores-tab">
      <div className="flex items-center gap-2 mb-3">
        {CONTRATOS_GEO.map(c => (
          <button key={c.id}
            onClick={() => { setSelectedContrato(c.id); setSelectedSubfaena(""); setExpandedConductor(null); }}
            data-testid={`btn-contrato-${c.id}`}
            className="font-space text-[10px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: selectedContrato === c.id ? c.color + "20" : "#0a1520",
              border: `1px solid ${selectedContrato === c.id ? c.color : "#0d2035"}`,
              color: selectedContrato === c.id ? c.color : "#3a6080",
            }}>
            {c.label}
          </button>
        ))}
        {selectedContrato === "ANGLO" && CONTRATOS_GEO.find(c => c.id === "ANGLO")?.subfaenas?.map(sf => (
          <button key={sf.id}
            onClick={() => { setSelectedSubfaena(selectedSubfaena === sf.id ? "" : sf.id); setExpandedConductor(null); }}
            data-testid={`btn-subfaena-${sf.id}`}
            className="font-space text-[9px] font-bold tracking-wider px-2.5 py-1 cursor-pointer transition-all"
            style={{
              background: selectedSubfaena === sf.id ? sf.color + "20" : "#0a1520",
              border: `1px solid ${selectedSubfaena === sf.id ? sf.color : "#0d2035"}`,
              color: selectedSubfaena === sf.id ? sf.color : "#3a6080",
            }}>
            {sf.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: activeColor }}>
            CONDUCTORES {selectedSubfaena || selectedContrato}
          </div>
          <div className="font-exo text-[10px] px-2 py-0.5 rounded" style={{ background: activeColor + "15", border: `1px solid ${activeColor}30`, color: activeColor }}>
            {conductoresData?.totalConductores || 0} conductores
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            Desde {conductoresData?.desde || "01-03-2026"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {([
              { id: "litros" as const, label: "Mas litros" },
              { id: "rend_asc" as const, label: "Peor rend" },
              { id: "rend_desc" as const, label: "Mejor rend" },
            ]).map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                data-testid={`btn-sort-${s.id}`}
                className="font-exo text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer transition-all"
                style={{
                  background: sortBy === s.id ? (s.id === "rend_asc" ? "#ff224420" : s.id === "rend_desc" ? "#00c97a20" : "#00d4ff15") : "#0d203530",
                  border: `1px solid ${sortBy === s.id ? (s.id === "rend_asc" ? "#ff2244" : s.id === "rend_desc" ? "#00c97a" : "#00d4ff") : "#0d2035"}`,
                  color: sortBy === s.id ? (s.id === "rend_asc" ? "#ff2244" : s.id === "rend_desc" ? "#00c97a" : "#00d4ff") : "#3a6080",
                }}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#3a6080" }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar conductor o patente..."
              data-testid="input-search-conductor"
              className="pl-7 pr-3 py-1.5 rounded font-exo text-[11px]"
              style={{ background: "#0d203550", border: "1px solid #0d2035", color: "#c8e8ff", width: "220px" }}
            />
          </div>
        </div>
      </div>

      <div className="rounded overflow-hidden" style={{ border: "1px solid #0d2035" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "#0d203540" }}>
              {["CONDUCTOR", "CAMIONES", "CARGAS", "LITROS TOTAL", "KM TOTAL", "REND km/L", "ULT. CARGA"].map(h => (
                <th key={h} className="px-3 py-2 text-left font-space text-[10px] font-bold tracking-wider" style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((cond: any) => (
              <Fragment key={cond.nombre}>
                <tr
                  onClick={() => setExpandedConductor(expandedConductor === cond.nombre ? null : cond.nombre)}
                  className="cursor-pointer transition-all"
                  style={{
                    background: expandedConductor === cond.nombre ? "#00d4ff08" : "transparent",
                    borderBottom: "1px solid #0d203540",
                  }}
                  data-testid={`row-conductor-${cond.nombre.replace(/[^a-zA-Z]/g, "").slice(0, 15)}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#00d4ff" }} />
                      <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{cond.nombre}</span>
                      {expandedConductor === cond.nombre ? <ChevronUp className="w-3 h-3" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "#3a6080" }} />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {cond.camiones.map((p: string) => (
                        <span key={p} className="font-space text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#ff660015", border: "1px solid #ff660030", color: "#ff6600" }}>{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-space text-[11px]" style={{ color: "#c8e8ff" }}>{cond.cargas}</td>
                  <td className="px-3 py-2 font-space text-[11px] font-bold" style={{ color: "#ff6600" }}>{Math.round(cond.litrosTotales).toLocaleString("es-CL")} L</td>
                  <td className="px-3 py-2 font-space text-[11px]" style={{ color: "#c8e8ff" }}>{cond.kmTotales > 0 ? cond.kmTotales.toLocaleString("es-CL") : "--"}</td>
                  <td className="px-3 py-2 font-space text-[11px] font-bold" style={{ color: cond.rendimiento >= 3.5 ? "#00c97a" : cond.rendimiento > 0 ? "#ff2244" : "#3a6080" }}>
                    {cond.rendimiento > 0 ? cond.rendimiento.toFixed(2) : "--"}
                  </td>
                  <td className="px-3 py-2 font-exo text-[10px]" style={{ color: "#3a6080" }}>
                    {cond.ultimaCarga ? new Date(cond.ultimaCarga).toLocaleDateString("es-CL") : "--"}
                  </td>
                </tr>
                {expandedConductor === cond.nombre && (
                  <tr>
                    <td colSpan={7} className="px-3 py-2" style={{ background: "#0d203515" }}>
                      <div className="ml-6 space-y-1 max-h-[300px] overflow-y-auto">
                        <div className="font-space text-[10px] font-bold tracking-wider mb-2" style={{ color: "#00d4ff" }}>
                          DETALLE DE CARGAS ({cond.cargasDetalle.length})
                        </div>
                        {cond.cargasDetalle.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-1.5 rounded" style={{ background: "#0d203530", border: "1px solid #0d203560" }}>
                            <span className="font-exo text-[10px] w-24 flex-shrink-0" style={{ color: "#c8e8ff" }}>
                              {new Date(c.fecha).toLocaleDateString("es-CL")} {new Date(c.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="font-space text-[10px] font-bold w-14 text-right flex-shrink-0" style={{ color: "#ff6600" }}>{c.litros.toFixed(1)} L</span>
                            <span className="font-space text-[10px] w-12 flex-shrink-0 px-1.5 py-0.5 rounded text-center" style={{ background: "#ff660015", border: "1px solid #ff660030", color: "#ff6600" }}>{c.patente}</span>
                            <span className="font-exo text-[9px] flex-1 truncate" style={{ color: "#3a6080" }}>{c.lugar}</span>
                            <span className="font-exo text-[9px] w-16 text-right flex-shrink-0" style={{ color: "#3a6080" }}>{c.km > 0 ? `${c.km.toLocaleString("es-CL")} km` : "--"}</span>
                            <span className="font-space text-[10px] w-16 text-right flex-shrink-0 font-bold" style={{ color: c.rend >= 3.5 ? "#00c97a" : c.rend > 0 && c.rend < 100 ? "#ff2244" : "#3a6080" }}>
                              {c.rend > 0 && c.rend < 100 ? `${c.rend.toFixed(2)} km/L` : "--"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecopilacionTab() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/geo/stats"],
    refetchInterval: 30000,
  });

  const ingestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/geo/ingest-volvo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geo/stats"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
      </div>
    );
  }

  const kpis = [
    { label: "PUNTOS GPS TOTAL", value: stats?.totalPuntos?.toLocaleString() || "0", color: "#00d4ff" },
    { label: "CAMIONES RASTREADOS", value: stats?.totalCamiones || 0, color: "#00c97a" },
    { label: "PUNTOS HOY", value: stats?.puntosHoy?.toLocaleString() || "0", color: "#ffcc00" },
    { label: "PUNTOS 7 DIAS", value: stats?.puntos7d?.toLocaleString() || "0", color: "#ff6600" },
  ];

  return (
    <div data-testid="recopilacion-tab">
      <div className="flex items-center justify-between mb-4">
        <div className="font-exo text-[13px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
          RECOPILACION DE DATOS GPS
        </div>
        <button
          onClick={() => ingestMutation.mutate()}
          disabled={ingestMutation.isPending}
          data-testid="button-ingest-manual"
          className="flex items-center gap-2 px-4 py-2 font-exo text-[11px] font-bold tracking-wider rounded cursor-pointer"
          style={{
            background: "rgba(0,212,255,0.12)",
            border: "1px solid #00d4ff",
            color: "#00d4ff",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${ingestMutation.isPending ? "animate-spin" : ""}`} />
          {ingestMutation.isPending ? "INGESTING..." : "INGESTAR AHORA"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-lg p-4" style={{
            background: "rgba(6,13,20,0.6)",
            border: `1px solid ${k.color}30`,
          }} data-testid={`kpi-recopilacion-${i}`}>
            <div className="font-exo text-[10px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
              {k.label}
            </div>
            <div className="font-space text-[24px] font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg p-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
            PRIMER PUNTO REGISTRADO
          </div>
          <div className="font-space text-[14px]" style={{ color: "#c8e8ff" }}>
            {stats?.primerPunto ? new Date(stats.primerPunto).toLocaleString("es-CL") : "---"}
          </div>
        </div>
        <div className="rounded-lg p-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
            ULTIMO PUNTO REGISTRADO
          </div>
          <div className="font-space text-[14px]" style={{ color: "#c8e8ff" }}>
            {stats?.ultimoPunto ? new Date(stats.ultimoPunto).toLocaleString("es-CL") : "---"}
          </div>
        </div>
      </div>

      <div className="rounded-lg p-4" style={{
        background: "rgba(6,13,20,0.6)",
        border: "1px solid #0d2035",
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <div className="font-exo text-[12px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
            HISTORIAL DIARIO (ULTIMOS 14 DIAS)
          </div>
        </div>
        <div className="font-exo text-[10px] tracking-wider mb-2" style={{ color: "#3a6080" }}>
          INGESTION AUTOMATICA CADA 5 MINUTOS - TODOS LOS CONTRATOS
        </div>

        {stats?.porDia?.length > 0 ? (
          <div className="space-y-1">
            <div className="grid grid-cols-[120px_1fr_80px_80px] gap-2 py-1 border-b" style={{ borderColor: "#0d2035" }}>
              <div className="font-exo text-[10px] font-bold tracking-wider" style={{ color: "#3a6080" }}>FECHA</div>
              <div className="font-exo text-[10px] font-bold tracking-wider" style={{ color: "#3a6080" }}>VOLUMEN</div>
              <div className="font-exo text-[10px] font-bold tracking-wider text-right" style={{ color: "#3a6080" }}>PUNTOS</div>
              <div className="font-exo text-[10px] font-bold tracking-wider text-right" style={{ color: "#3a6080" }}>CAMIONES</div>
            </div>
            {stats.porDia.map((d: any, i: number) => {
              const maxPuntos = Math.max(...stats.porDia.map((x: any) => x.puntos));
              const pct = maxPuntos > 0 ? (d.puntos / maxPuntos) * 100 : 0;
              return (
                <div key={i} className="grid grid-cols-[120px_1fr_80px_80px] gap-2 py-1.5 items-center" data-testid={`row-dia-${i}`}>
                  <div className="font-space text-[12px]" style={{ color: "#c8e8ff" }}>
                    {new Date(d.dia).toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short" })}
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, #00d4ff, #00c97a)`,
                    }} />
                  </div>
                  <div className="font-space text-[12px] text-right" style={{ color: "#00d4ff" }}>
                    {d.puntos.toLocaleString()}
                  </div>
                  <div className="font-space text-[12px] text-right" style={{ color: "#00c97a" }}>
                    {d.camiones}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Database className="w-8 h-8 mx-auto mb-2" style={{ color: "#3a6080" }} />
            <div className="font-exo text-[12px]" style={{ color: "#3a6080" }}>
              SIN DATOS AUN - LA INGESTION AUTOMATICA COMENZARA A ACUMULAR PUNTOS GPS
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg p-4" style={{
        background: "rgba(0,212,255,0.05)",
        border: "1px solid rgba(0,212,255,0.15)",
      }}>
        <div className="font-exo text-[11px] font-bold tracking-wider mb-2" style={{ color: "#00d4ff" }}>
          COMO FUNCIONA LA RECOPILACION
        </div>
        <div className="font-rajdhani text-[13px] leading-relaxed space-y-1" style={{ color: "#6a90aa" }}>
          <p>Cada 5 minutos se consulta Volvo Connect por la posicion GPS de todos los camiones con VIN registrado.</p>
          <p>Los puntos se almacenan con coordenadas, velocidad, rumbo y odometro para reconstruir viajes.</p>
          <p>Con suficientes datos se podran detectar patrones: rutas habituales, paradas sospechosas, desvios y tiempos muertos.</p>
          <p>Mientras mas datos se acumulen, mejor sera la deteccion de anomalias en el comportamiento de cada camion.</p>
        </div>
      </div>
    </div>
  );
}

function AprendizajeTab() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/viajes/stats"],
  });

  const { data: progress } = useQuery<any>({
    queryKey: ["/api/viajes/sync-progress"],
    refetchInterval: 30000,
  });

  const { data: autoSyncStatus } = useQuery<any>({
    queryKey: ["/api/viajes/auto-sync"],
    refetchInterval: 30000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/viajes/sync-historico?dias=90"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/sync-progress"] });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/viajes/stats"] }), 15000);
    },
  });

  const autoSyncMutation = useMutation({
    mutationFn: (enable: boolean) => apiRequest("POST", `/api/viajes/auto-sync?enable=${enable}&interval=30`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/auto-sync"] });
    },
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/viajes/recalcular-scores"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/stats"] });
    },
  });

  const corredoresMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/viajes/clusterizar-corredores"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/corredores"] });
      recalcMutation.mutate();
    },
  });

  const { data: corredores } = useQuery<any[]>({
    queryKey: ["/api/viajes/corredores"],
  });

  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [showExplicacion, setShowExplicacion] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
      </div>
    );
  }

  const estadoColors: Record<string, string> = {
    NORMAL: "#00c97a",
    REVISAR: "#ffcc00",
    ANOMALIA: "#ff2244",
  };

  const cuadrados = stats?.cuadratura?.cruzados || 0;
  const totalViajes = stats?.totalViajes || 0;
  const pctCuad = totalViajes > 0 ? Math.round((cuadrados / totalViajes) * 100) : 0;

  const kpis = [
    { label: "VIAJES ANALIZADOS", value: totalViajes.toLocaleString(), color: "#00d4ff" },
    { label: "CAMIONES", value: stats?.totalCamiones || 0, color: "#00c97a" },
    { label: "NORMALES", value: stats?.porEstado?.find((e: any) => e.estado === "NORMAL")?.count || 0, color: "#00c97a" },
    { label: "REVISAR", value: stats?.porEstado?.find((e: any) => e.estado === "REVISAR")?.count || 0, color: "#ffcc00" },
    { label: "ANOMALIAS", value: stats?.porEstado?.find((e: any) => e.estado === "ANOMALIA")?.count || 0, color: "#ff2244" },
    { label: `CUADRATURA ${pctCuad}%`, value: `${cuadrados}/${totalViajes}`, color: "#ff6b35" },
  ];

  const anomalias = filtroEstado === "todos"
    ? stats?.anomalias || []
    : (stats?.anomalias || []).filter((a: any) => a.estado === filtroEstado);

  return (
    <div data-testid="data-viajes-tab">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <div className="font-exo text-[13px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
            DATA VIAJES
          </div>
          <button onClick={() => setShowExplicacion(!showExplicacion)}
            data-testid="button-explicacion"
            className="px-2 py-1 font-exo text-[9px] font-bold tracking-wider rounded cursor-pointer"
            style={{ background: "#00d4ff15", border: "1px solid #00d4ff40", color: "#00d4ff" }}>
            {showExplicacion ? "CERRAR" : "QUE HACE?"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {progress?.status === "running" && (
            <div className="flex items-center gap-2 font-exo text-[10px]" style={{ color: "#ffcc00" }}>
              <RefreshCw className="w-3 h-3 animate-spin" />
              SYNC {progress.procesados}/{progress.totalCamiones}
            </div>
          )}
          <button
            onClick={() => autoSyncMutation.mutate(!autoSyncStatus?.active)}
            disabled={autoSyncMutation.isPending}
            data-testid="button-auto-sync"
            className="flex items-center gap-2 px-3 py-1.5 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
            style={{
              background: autoSyncStatus?.active ? "rgba(0,201,122,0.12)" : "rgba(58,96,128,0.1)",
              border: `1px solid ${autoSyncStatus?.active ? "#00c97a" : "#3a6080"}`,
              color: autoSyncStatus?.active ? "#00c97a" : "#3a6080",
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{
              background: autoSyncStatus?.active ? "#00c97a" : "#3a608050",
              boxShadow: autoSyncStatus?.active ? "0 0 6px #00c97a80" : "none",
            }} />
            SYNC AUTO
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || progress?.status === "running"}
            data-testid="button-sync-viajes"
            className="flex items-center gap-2 px-3 py-1.5 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
            style={{
              background: "rgba(0,212,255,0.12)",
              border: "1px solid #00d4ff",
              color: "#00d4ff",
              opacity: progress?.status === "running" ? 0.5 : 1,
            }}
          >
            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            SYNC
          </button>
          <button
            onClick={() => corredoresMutation.mutate()}
            disabled={corredoresMutation.isPending || recalcMutation.isPending}
            data-testid="button-clusterizar"
            className="flex items-center gap-2 px-3 py-1.5 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
            style={{
              background: "rgba(0,255,136,0.08)",
              border: "1px solid #00ff8840",
              color: "#00ff88",
              opacity: corredoresMutation.isPending ? 0.5 : 1,
            }}
          >
            <Route className="w-3 h-3" />
            APRENDER RUTAS
          </button>
        </div>
      </div>

      {showExplicacion && (
        <div className="rounded-lg p-4 mb-4" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid #00d4ff30" }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-3" style={{ color: "#00d4ff" }}>
            COMO FUNCIONA DATA VIAJES
          </div>
          <div className="space-y-2 font-exo text-[11px]" style={{ color: "#6a90aa" }}>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#00d4ff" }} />
              <span><strong style={{ color: "#c8e8ff" }}>SYNC</strong> — Toma los datos ECU de Volvo Connect (combustible, km, velocidad) y los puntos GPS para reconstruir viajes automaticamente. Un viaje empieza cuando el camion se mueve y termina cuando se detiene mas de 90 minutos en ruta general, hasta 8 horas en base o 6 horas en faena minera. El sistema adapta el umbral segun el lugar.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#00ff88" }} />
              <span><strong style={{ color: "#c8e8ff" }}>APRENDER RUTAS</strong> — Agrupa los viajes por origen y destino con radio adaptativo (1-8km segun distancia del viaje) y separados por contrato. Cada corredor guarda el rendimiento promedio, desviacion, km y duracion tipica de esa ruta.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ffcc00" }} />
              <span><strong style={{ color: "#c8e8ff" }}>SCORE INTELIGENTE</strong> — Cada viaje se compara contra el promedio de su corredor especifico. Un camion en ruta Santiago-Temuco se evalua contra otros viajes Santiago-Temuco, no contra un numero fijo. Si el corredor no tiene suficientes viajes (min 5), se usa el promedio del contrato como referencia.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ff2244" }} />
              <span><strong style={{ color: "#c8e8ff" }}>ANOMALIAS</strong> — Los viajes con rendimiento muy por debajo del corredor (mas de 2 desviaciones estandar) se marcan como anomalia. A mas viajes acumulados, mas preciso el scoring.</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-6 gap-3 mb-4">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-lg p-3" style={{
            background: "rgba(6,13,20,0.6)",
            border: `1px solid ${k.color}30`,
          }} data-testid={`kpi-data-viajes-${i}`}>
            <div className="font-exo text-[9px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
              {k.label}
            </div>
            <div className="font-space text-[20px] font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {(corredores || []).length > 0 && (
        <div className="rounded-lg p-4 mb-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-exo text-[11px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
              CORREDORES APRENDIDOS ({(corredores || []).length} rutas)
            </div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
              Baselines de rendimiento por ruta — min {MIN_VIAJES_CORREDOR} viajes
            </div>
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_100px_80px_70px_70px_60px] gap-2 py-1 border-b" style={{ borderColor: "#0d2035" }}>
              {["CORREDOR", "CONTRATO", "REND PROM", "DESV", "KM PROM", "VIAJES"].map(h => (
                <div key={h} className="font-exo text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
              ))}
            </div>
            {(corredores || []).slice(0, 15).map((c: any, i: number) => {
              const rendColor = c.rendimientoPromedio >= 3.5 ? "#00c97a" : c.rendimientoPromedio >= 2.5 ? "#ffcc00" : "#ff2244";
              return (
                <div key={i} className="grid grid-cols-[1fr_100px_80px_70px_70px_60px] gap-2 py-1.5 items-center"
                  data-testid={`row-corredor-${i}`}
                  style={{ borderBottom: "1px solid rgba(13,32,53,0.3)" }}>
                  <div className="font-exo text-[10px] truncate" style={{ color: "#c8e8ff" }}>
                    {c.nombre}
                  </div>
                  <div className="font-exo text-[9px] truncate" style={{ color: "#3a6080" }}>
                    {c.contrato}
                  </div>
                  <div className="font-space text-[11px] font-bold" style={{ color: rendColor }}>
                    {c.rendimientoPromedio.toFixed(2)} km/L
                  </div>
                  <div className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                    +/-{c.rendimientoDesviacion.toFixed(2)}
                  </div>
                  <div className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                    {c.kmPromedio.toFixed(0)} km
                  </div>
                  <div className="font-space text-[10px] text-center" style={{ color: "#4a7090" }}>
                    {c.totalViajes}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats?.porContrato?.length > 0 && (
        <div className="rounded-lg p-4 mb-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-3" style={{ color: "#c8e8ff" }}>
            RENDIMIENTO POR CONTRATO (km/L promedio ECU)
          </div>
          <div className="space-y-2">
            {stats.porContrato.map((c: any, i: number) => {
              const maxRend = Math.max(...stats.porContrato.map((x: any) => x.rendimientoAvg || 0));
              const pct = maxRend > 0 ? ((c.rendimientoAvg || 0) / maxRend) * 100 : 0;
              const rendColor = (c.rendimientoAvg || 0) >= 3.5 ? "#00c97a" : (c.rendimientoAvg || 0) >= 2.5 ? "#ffcc00" : "#ff2244";
              return (
                <div key={i} className="grid grid-cols-[180px_1fr_80px_80px_60px] gap-2 items-center" data-testid={`row-contrato-${i}`}>
                  <div className="font-exo text-[11px] font-bold truncate" style={{ color: "#c8e8ff" }}>
                    {c.contrato}
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      background: rendColor,
                    }} />
                  </div>
                  <div className="font-space text-[12px] text-right font-bold" style={{ color: rendColor }}>
                    {c.rendimientoAvg ?? "--"} km/L
                  </div>
                  <div className="font-space text-[11px] text-right" style={{ color: "#3a6080" }}>
                    {c.kmAvg} km avg
                  </div>
                  <div className="font-space text-[11px] text-right" style={{ color: "#3a6080" }}>
                    {c.count} viajes
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg p-4" style={{
        background: "rgba(6,13,20,0.6)",
        border: "1px solid #0d2035",
      }}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-exo text-[11px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
            VIAJES CON ANOMALIAS DETECTADAS
          </div>
          <div className="flex gap-1">
            {["todos", "REVISAR", "ANOMALIA"].map(est => (
              <button key={est} onClick={() => setFiltroEstado(est)}
                data-testid={`filter-estado-${est}`}
                className="px-3 py-1 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
                style={{
                  background: filtroEstado === est ? (estadoColors[est] || "#00d4ff") + "20" : "transparent",
                  border: `1px solid ${filtroEstado === est ? (estadoColors[est] || "#00d4ff") : "#0d2035"}`,
                  color: filtroEstado === est ? (estadoColors[est] || "#00d4ff") : "#3a6080",
                }}>
                {est === "todos" ? "TODOS" : est}
              </button>
            ))}
          </div>
        </div>

        {anomalias.length > 0 ? (
          <div className="space-y-1">
            <div className="grid grid-cols-[70px_90px_80px_65px_65px_65px_85px_1fr_40px] gap-2 py-1 border-b" style={{ borderColor: "#0d2035" }}>
              {["PATENTE", "CONTRATO", "FECHA", "KM ECU", "L ECU", "REND", "CUADRATURA", "CORREDOR", "SC"].map(h => (
                <div key={h} className="font-exo text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
              ))}
            </div>
            {anomalias.map((a: any, i: number) => {
              const rend = parseFloat(a.rendimiento_real) || 0;
              const corrRend = parseFloat(a.corredor_rend_promedio) || 0;
              const rendColor = corrRend > 0
                ? (rend >= corrRend * 0.85 ? "#00c97a" : rend >= corrRend * 0.7 ? "#ffcc00" : "#ff2244")
                : (rend >= 3.5 ? "#00c97a" : rend >= 2.5 ? "#ffcc00" : "#ff2244");
              const score = a.score_anomalia || 0;
              const scoreColor = score >= 50 ? "#ff2244" : score >= 20 ? "#ffcc00" : "#00c97a";
              const litrosSigetra = parseFloat(a.litros_cargados_sigetra || 0);
              const delta = a.delta_cuadratura != null ? parseFloat(a.delta_cuadratura) : null;
              const cruzado = a.sigetra_cruzado === true;
              return (
                <div key={i} className="grid grid-cols-[70px_90px_80px_65px_65px_65px_85px_1fr_40px] gap-2 py-1.5 items-center"
                  data-testid={`row-anomalia-${i}`}
                  style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}>
                  <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</div>
                  <div className="font-exo text-[9px] truncate" style={{ color: "#3a6080" }}>{a.contrato}</div>
                  <div className="font-space text-[10px]" style={{ color: "#6a90aa" }}>
                    {a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--"}
                  </div>
                  <div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{parseFloat(a.km_ecu || 0).toFixed(0)} km</div>
                  <div className="font-space text-[10px]" style={{ color: "#00d4ff" }}>{parseFloat(a.litros_consumidos_ecu || 0).toFixed(1)} L</div>
                  <div className="font-space text-[11px] font-bold" style={{ color: rendColor }}>
                    {rend.toFixed(2)}
                    {corrRend > 0 && (
                      <span className="font-exo text-[8px] ml-0.5" style={{ color: "#3a6080" }}>/{corrRend.toFixed(1)}</span>
                    )}
                  </div>
                  <div className="font-exo text-[9px]" style={{ color: !cruzado ? "#3a6080" : delta != null && delta > 15 ? "#ff2244" : delta != null && delta > 0 ? "#ffcc00" : "#4a7090" }}>
                    {!cruzado ? (
                      <span style={{ color: "#3a608060" }}>PENDIENTE</span>
                    ) : litrosSigetra > 0 ? (
                      <span>{litrosSigetra.toFixed(0)}L surt {delta != null ? (delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)) + "L" : ""}</span>
                    ) : (
                      <span style={{ color: "#3a608060" }}>SIN MATCH</span>
                    )}
                  </div>
                  <div className="font-exo text-[9px] truncate" style={{ color: a.corredor_nombre ? "#4a7090" : "#1e3a50" }}>
                    {a.corredor_nombre || (a.origen_nombre && a.destino_nombre ? `${a.origen_nombre} → ${a.destino_nombre}` : "--")}
                  </div>
                  <div className="font-space text-[11px] font-bold text-center" style={{ color: scoreColor }}>{score}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: "#00c97a" }} />
            <div className="font-exo text-[12px]" style={{ color: "#3a6080" }}>
              {stats?.totalViajes > 0 ? "SIN ANOMALIAS EN EL FILTRO SELECCIONADO" : "EJECUTAR SYNC PARA ANALIZAR VIAJES"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const MIN_VIAJES_CORREDOR = 5;

const CONTRATO_COLORS: Record<string, string> = {
  "CENCOSUD": "#00d4ff",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-COCU": "#00ff88",
};

function RendimientoECUTab() {
  const { data: rendData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/geo/rendimiento-contratos"],
    refetchInterval: 300000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: '#4a7090' }}>Cargando rendimiento...</span>
      </div>
    );
  }

  const contratos = rendData || [];
  const maxRend = Math.max(...contratos.map((c: any) => c.rendimiento_promedio || 0), 5);
  const allBajoMeta = contratos.flatMap((c: any) => c.bajo_meta || []);

  return (
    <div data-testid="rendimiento-ecu-tab">
      <div className="mb-4">
        <div className="font-space text-[16px] font-bold tracking-[0.15em]" style={{ color: '#00d4ff' }}>
          RENDIMIENTO ECU POR CONTRATO
        </div>
        <div className="font-exo text-[11px] tracking-wider mt-1" style={{ color: '#4a7090' }}>
          Basado en datos Volvo Connect (ultimos 7 dias)
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {contratos.map((c: any) => {
          const color = CONTRATO_COLORS[c.nombre] || c.color || '#00d4ff';
          const rend = c.rendimiento_promedio || 0;
          const meta = c.meta_kmL || 2.1;
          const pct = Math.min((rend / maxRend) * 100, 100);
          const cumpleMeta = rend >= meta;

          return (
            <div key={c.nombre} className="p-3" style={{ background: '#091018', border: '1px solid #0d2035' }} data-testid={`rend-contrato-${c.nombre}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="font-exo text-[12px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>{c.nombre}</span>
                  <span className="font-rajdhani text-[11px]" style={{ color: '#4a7090' }}>
                    {c.camiones_con_datos}/{c.camiones_total} camiones
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-space text-[14px] font-bold" style={{ color }}>{rend > 0 ? rend.toFixed(1) : '-'} km/L</span>
                  <span className="font-rajdhani text-[11px]" style={{ color: '#4a7090' }}>meta {meta.toFixed(2)}</span>
                  <span className="font-space text-[12px]" style={{ color: cumpleMeta ? '#00ff88' : '#ffcc00' }}>
                    {cumpleMeta ? '\u2713' : '\u26A0'}
                  </span>
                </div>
              </div>
              <div className="h-3 rounded-sm overflow-hidden" style={{ background: '#0a1520' }}>
                <div className="h-full rounded-sm transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}33, ${color})`,
                  }}
                />
              </div>
              {(c.bajo_meta?.length || 0) > 0 && (
                <div className="font-rajdhani text-[11px] mt-1" style={{ color: '#ff2244' }}>
                  {c.bajo_meta.length} camion{c.bajo_meta.length > 1 ? 'es' : ''} bajo meta (&lt;70%)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allBajoMeta.length > 0 && (
        <div>
          <div className="font-exo text-[12px] font-bold tracking-wider mb-2" style={{ color: '#ff2244' }}>
            CAMIONES BAJO META
          </div>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #0d2035' }}>
                <th className="text-left font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>PATENTE</th>
                <th className="text-left font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>CONTRATO</th>
                <th className="text-right font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>REND. REAL</th>
                <th className="text-right font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>META</th>
                <th className="text-right font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>DIFERENCIA</th>
              </tr>
            </thead>
            <tbody>
              {allBajoMeta.map((cam: any, idx: number) => (
                <tr key={`${cam.patente}-${idx}`} style={{
                  borderBottom: '1px solid #0a1520',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(9,16,24,0.5)',
                }} data-testid={`rend-bajo-${cam.patente}`}>
                  <td className="font-space text-[12px] font-bold py-2 px-2" style={{ color: '#c8e8ff' }}>{cam.patente}</td>
                  <td className="font-rajdhani text-[12px] py-2 px-2" style={{ color: CONTRATO_COLORS[cam.contrato] || '#c8e8ff' }}>{cam.contrato}</td>
                  <td className="font-space text-[12px] text-right py-2 px-2" style={{ color: '#ff2244' }}>
                    {cam.rendimiento_real != null ? `${cam.rendimiento_real} km/L` : '-'}
                  </td>
                  <td className="font-space text-[12px] text-right py-2 px-2" style={{ color: '#4a7090' }}>{cam.meta?.toFixed(2)}</td>
                  <td className="font-space text-[12px] text-right py-2 px-2" style={{ color: '#ff2244' }}>
                    {cam.diferencia_pct != null ? `${cam.diferencia_pct}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 font-rajdhani text-[11px]" style={{ color: '#4a7090' }}>
        Solo camiones con telemetria Volvo activa. Datos de los ultimos 7 dias.
      </div>
    </div>
  );
}

export default function GeoValidator({ initialTab }: { initialTab?: GeoTab } = {}) {
  const [tab, setTab] = useState<GeoTab>(initialTab || "mapa");

  const subtabs: { id: GeoTab; label: string; icon: typeof MapIcon }[] = [
    { id: "mapa", label: "MAPA", icon: MapIcon },
    { id: "recopilacion", label: "RECOPILACION", icon: Database },
    { id: "aprendizaje", label: "DATA VIAJES", icon: TrendingUp },
    { id: "viajes", label: "VIAJES CERRADOS", icon: Route },
    { id: "rendimiento", label: "RENDIMIENTO", icon: Gauge },
    { id: "estaciones", label: "ESTACIONES", icon: Fuel },
    { id: "conductores", label: "CONDUCTORES", icon: Users },
    { id: "camiones", label: "CAMIONES", icon: Truck },
    { id: "ia", label: "IA", icon: Cpu },
  ];

  return (
    <div data-testid="geovalidator">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="font-space text-[18px] font-bold tracking-[0.2em]" style={{ color: "#00d4ff" }}>
            GEOVALIDATOR
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {subtabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                data-testid={`geo-tab-${t.id}`}
                className={`flex items-center gap-1.5 px-3 py-2 font-exo text-[10px] font-bold tracking-[0.12em] cursor-pointer transition-all border-b-2 ${
                  tab === t.id
                    ? "border-[#00d4ff] text-[#00d4ff]"
                    : "border-transparent text-[#4a7090] hover:text-[#c8e8ff]"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "mapa" && <MapaEnVivo />}
      {tab === "recopilacion" && <RecopilacionTab />}
      {tab === "aprendizaje" && <AprendizajeTab />}
      {tab === "viajes" && <ViajesCerrados />}
      {tab === "rendimiento" && <RendimientoECUTab />}
      {tab === "estaciones" && <EstacionesTab />}
      {tab === "conductores" && <ConductoresTab />}
      {tab === "camiones" && <CamionesTab />}
      {tab === "ia" && <AnalisisIATab />}
    </div>
  );
}
