import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Truck, Fuel, ChevronDown, ChevronUp, X } from "lucide-react";
import { CamionLive, GeoBase } from "./types";
import { CamionStatusDot } from "./shared-components";

export default function MapaEnVivo() {
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
