import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import Supercluster from "supercluster";
import { ArrowLeft, Truck, Fuel, Search, RefreshCw, Gauge, Radio, Calendar, X, Route, Users, MapPin, ChevronLeft, ChevronRight, Activity, BarChart3 } from "lucide-react";

const GMAPS_KEY = "AIzaSyC2Sq4RSutNYqwnAyykQau4meFMnmucTlc";

// ── COLORS ──
function getEstadoColor(e: string) { return e === "Conduccion" ? "#00ff88" : e === "Ralenti" ? "#ffcc00" : "#ff2244"; }
function getRendColor(r: number) { return r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : "#ff2244"; }
function getContratoColor(c: string) {
  if (!c) return "#3a6080";
  const u = c.toUpperCase();
  if (u.includes("ANGLO")) return "#00ff88";
  if (u.includes("CENCOSUD") || u.includes("WALMART")) return "#00d4ff";
  if (u.includes("GLENCORE") || u.includes("ACIDO")) return "#ff6b35";
  if (u.includes("INDURA")) return "#06b6d4";
  const h = c.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return ["#a855f7", "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6"][h % 6];
}
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");

function MapUpdater({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  map.setView(center, zoom || map.getZoom());
  return null;
}

// ── MAIN PAGE ──
type WtTab = "mapa" | "viajes" | "faenas" | "camiones" | "conductores" | "estaciones" | "cobertura";

export default function WisetrackPage({ onBack, initialTab, embedded }: { onBack: () => void; initialTab?: WtTab; embedded?: boolean }) {
  const [tab, setTab] = useState<WtTab>(initialTab || "mapa");

  const TABS: { id: WtTab; label: string }[] = [
    { id: "mapa", label: "MAPA EN VIVO" },
    { id: "viajes", label: "VIAJES" },
    { id: "faenas", label: "FAENAS" },
    { id: "camiones", label: "CAMIONES" },
    { id: "conductores", label: "CONDUCTORES" },
    { id: "estaciones", label: "ESTACIONES" },
    { id: "cobertura", label: "COBERTURA" },
  ];

  return (
    <div className={embedded ? "" : "min-h-screen"} style={{ background: "#020508" }}>
      {/* HEADER — hidden when embedded in unified app */}
      {!embedded && (
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded cursor-pointer hover:opacity-80" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <ArrowLeft className="w-4 h-4" style={{ color: "#3a6080" }} />
          </button>
          <div className="font-space text-[18px] font-bold tracking-[0.2em]" style={{ color: "#10b981" }}>
            WISETRACK
          </div>
          <span className="font-exo text-[8px] px-2 py-0.5" style={{ color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4 }}>GPS · 477 VEHICULOS</span>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 font-exo text-xs font-bold tracking-[0.12em] cursor-pointer transition-all"
              style={{ borderBottom: `2px solid ${tab === t.id ? "#10b981" : "transparent"}`, color: tab === t.id ? "#10b981" : "#4a7090" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* CONTENT */}
      {tab === "mapa" && <WtMapaEnVivo />}
      {tab === "viajes" && <WtViajesCerrados />}
      {tab === "faenas" && <WtFaenas />}
      {tab === "camiones" && <WtCamiones />}
      {tab === "conductores" && <WtConductores />}
      {tab === "estaciones" && <WtEstaciones />}
      {tab === "cobertura" && <WtCobertura />}
    </div>
  );
}

// ══════════════════════════════════════════════
// CLUSTERED MARKERS COMPONENT
// ══════════════════════════════════════════════

function ClusteredMarkers({ clusters, scIndex, onSelect }: { clusters: any[]; scIndex: any; onSelect: (movil: string) => void }) {
  const map = useMap();
  return (
    <>
      {clusters.map((c: any, i: number) => {
        const [lng, lat] = c.geometry.coordinates;
        if (c.properties.cluster) {
          const count = c.properties.point_count;
          const size = count < 10 ? 32 : count < 50 ? 40 : count < 100 ? 48 : count < 200 ? 54 : 60;
          const bg = count < 10 ? "rgba(0,212,255,0.85)" : count < 50 ? "rgba(0,255,136,0.85)" : count < 100 ? "rgba(255,204,0,0.85)" : "rgba(255,107,53,0.85)";
          return (
            <AdvancedMarker key={`cl-${c.id}`} position={{ lat, lng }}
              onClick={() => { if (map) { const z = Math.min(scIndex.getClusterExpansionZoom(c.id), 18); map.setZoom(z); map.panTo({ lat, lng }); } }}>
              <div style={{ width: size, height: size, borderRadius: "50%", background: bg, border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.4)", fontFamily: "Space Mono", fontSize: count > 99 ? 10 : 12, fontWeight: "bold", color: "#020508" }}>
                {count}
              </div>
            </AdvancedMarker>
          );
        }
        const v = c.properties.v;
        const vel = parseFloat(v.velocidad || 0);
        const enMov = vel > 5;
        const enRal = vel > 0 && vel <= 5;
        const alerta = vel > 105;
        const cColor = getContratoColor(v.contrato);
        return (
          <AdvancedMarker key={`v-${v.movil || v.patente_norm}-${i}`} position={{ lat, lng }}
            onClick={() => onSelect(v.movil)}>
            {enMov ? (
              <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: `12px solid ${alerta ? "#ff2244" : cColor}`, filter: `drop-shadow(0 0 3px ${alerta ? "#ff2244" : cColor})`, cursor: "pointer", transform: `rotate(${v.direccion || 0}deg)` }} />
            ) : (
              <div style={{ width: enRal ? 10 : 7, height: enRal ? 10 : 7, background: enRal ? "#ffcc00" : "#3a6080", border: `1.5px solid ${enRal ? "#fff" : cColor}`, borderRadius: "50%", cursor: "pointer", opacity: enRal ? 1 : 0.6 }} />
            )}
          </AdvancedMarker>
        );
      })}
    </>
  );
}

// ══════════════════════════════════════════════
// TAB: MAPA EN VIVO
// ══════════════════════════════════════════════

function WtMapaEnVivo() {
  // Google Maps replaces Leaflet
  const [filter, setFilter] = useState("todos");
  const [selectedMovil, setSelectedMovil] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showFuelStations, setShowFuelStations] = useState(true);

  const { data, refetch } = useQuery<any>({
    queryKey: ["/api/wisetrack/fleet"],
    queryFn: () => fetch("/api/wisetrack/fleet").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const { data: fuelData } = useQuery<any>({
    queryKey: ["/api/geo/cargas-combustible"],
  });

  const { data: bases } = useQuery<any[]>({
    queryKey: ["/api/geo/bases"],
  });

  const vehiculos = data?.vehiculos || [];
  const filtered = useMemo(() => {
    if (filter === "todos") return vehiculos;
    if (filter === "conduccion") return vehiculos.filter((v: any) => v.velocidad > 0 || v.estado === "Conduccion");
    if (filter === "ralenti") return vehiculos.filter((v: any) => v.estado === "Ralenti" && v.velocidad === 0);
    if (filter === "detenido") return vehiculos.filter((v: any) => v.estado !== "Conduccion" && v.estado !== "Ralenti" && v.velocidad === 0);
    return vehiculos;
  }, [vehiculos, filter]);

  const counts = useMemo(() => ({
    total: vehiculos.length,
    conduccion: vehiculos.filter((v: any) => v.velocidad > 0).length,
    ralenti: vehiculos.filter((v: any) => v.estado === "Ralenti" && v.velocidad === 0).length,
    detenido: vehiculos.filter((v: any) => v.estado !== "Conduccion" && v.estado !== "Ralenti").length,
  }), [vehiculos]);

  // Google Maps state
  const [infoOpen, setInfoOpen] = useState<string | null>(null);

  const selectedVehicle = vehiculos.find((v: any) => v.movil === selectedMovil);

  // Supercluster index
  const scIndex = useMemo(() => {
    const sc = new Supercluster({ radius: 60, maxZoom: 15, minPoints: 3 });
    sc.load(filtered.filter((v: any) => v.lat && v.lng).map((v: any) => ({
      type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [v.lng, v.lat] }, properties: { v },
    })));
    return sc;
  }, [filtered]);

  const [mapZoom, setMapZoom] = useState(6);
  const [mapBounds, setMapBounds] = useState<[number, number, number, number]>([-180, -85, 180, 85]);

  const clusters = useMemo(() => scIndex.getClusters(mapBounds, mapZoom), [scIndex, mapBounds, mapZoom]);

  return (
    <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
      <APIProvider apiKey={GMAPS_KEY}>
        <GMap defaultCenter={{ lat: -33.45, lng: -70.65 }} defaultZoom={6} mapId="sotraser-fleet"
          style={{ position: "absolute", inset: 0 }}
          gestureHandling="greedy" disableDefaultUI={false} zoomControl={true} mapTypeControl={true} streetViewControl={false}
          onZoomChanged={(e) => setMapZoom(e.detail.zoom)}
          onBoundsChanged={(e) => { const b = e.detail.bounds; if (b) setMapBounds([b.west, b.south, b.east, b.north]); }}>

          <ClusteredMarkers clusters={clusters} scIndex={scIndex} onSelect={(movil) => { setSelectedMovil(movil); setInfoOpen(movil); }} />

          {showFuelStations && mapZoom >= 10 && fuelData?.estaciones?.map((est: any) => {
            if (!est.lat || !est.lng) return null;
            return (
              <AdvancedMarker key={`fuel-${est.nombre}`} position={{ lat: est.lat, lng: est.lng }} onClick={() => setInfoOpen(`fuel-${est.nombre}`)}>
                <div style={{ width: 18, height: 18, background: "#ff6600", border: "1.5px solid #fff", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: "bold" }}>⛽</div>
              </AdvancedMarker>
            );
          })}

          {infoOpen && (() => {
            const v = filtered.find((x: any) => x.movil === infoOpen);
            if (v) { const vel = parseFloat(v.velocidad||0); const cC = getContratoColor(v.contrato); return (
              <InfoWindow position={{ lat: v.lat, lng: v.lng }} onCloseClick={() => setInfoOpen(null)}>
                <div style={{ fontFamily: "'Space Grotesk', monospace", minWidth: 240, background: "#060d14", borderRadius: 8, padding: "12px 16px", color: "#c8e8ff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: "bold", color: "#00d4ff" }}>{v.movil}</span>
                    <span style={{ fontSize: 8, color: cC, border: `1px solid ${cC}40`, padding: "2px 6px", borderRadius: 3 }}>{v.contrato?.replace("ANGLO-","") || ""}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><div style={{ fontSize: 7, color: "#3a6080", textTransform: "uppercase" }}>VELOCIDAD</div><div style={{ fontSize: 16, fontWeight: "bold", color: vel > 105 ? "#ff2244" : vel > 5 ? "#00ff88" : "#3a6080" }}>{Math.round(vel)} km/h</div></div>
                    <div><div style={{ fontSize: 7, color: "#3a6080", textTransform: "uppercase" }}>TANQUE</div><div style={{ fontSize: 16, fontWeight: "bold", color: (v.nivel_estanque||0) < 20 ? "#ff2244" : (v.nivel_estanque||0) < 40 ? "#ffcc00" : "#00ff88" }}>{v.nivel_estanque ? v.nivel_estanque + "%" : "--"}</div></div>
                    <div><div style={{ fontSize: 7, color: "#3a6080", textTransform: "uppercase" }}>CONDUCTOR</div><div style={{ fontSize: 9 }}>{v.conductor || "Sin conductor"}</div></div>
                    <div><div style={{ fontSize: 7, color: "#3a6080", textTransform: "uppercase" }}>KM TOTAL</div><div style={{ fontSize: 9 }}>{v.km_total ? Math.round(v.km_total).toLocaleString("es-CL") : "--"}</div></div>
                  </div>
                  {v.rpm > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #0d2035", fontSize: 8, color: "#3a6080" }}>RPM: {v.rpm} · Motor: {v.temp_motor}°C · {v.estado}</div>}
                  <div style={{ marginTop: 4, fontSize: 8, color: "#3a6080" }}>{v.patente} · {v.fecha}</div>
                </div>
              </InfoWindow>
            ); }
            const fuelEst = fuelData?.estaciones?.find((e: any) => `fuel-${e.nombre}` === infoOpen);
            if (fuelEst) return (
              <InfoWindow position={{ lat: fuelEst.lat, lng: fuelEst.lng }} onCloseClick={() => setInfoOpen(null)}>
                <div style={{ fontFamily: "monospace", fontSize: 12, minWidth: 200 }}>
                  <b style={{ color: "#ff6600" }}>{fuelEst.nombre}</b><br/>
                  <b>{fuelEst.cargas}</b> cargas · <b>{fuelEst.litros?.toLocaleString("es-CL")}</b> L<br/>
                  {fuelEst.camiones} camiones
                </div>
              </InfoWindow>
            );
            return null;
          })()}
        </GMap>
      </APIProvider>

      {/* Filter buttons overlay — same as GeoValidator */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        {[
          { id: "todos", label: `Todos (${counts.total})` },
          { id: "conduccion", label: `Mov (${counts.conduccion})`, color: "#00c97a" },
          { id: "ralenti", label: `Ralenti (${counts.ralenti})`, color: "#ffcc00" },
          { id: "detenido", label: `Det (${counts.detenido})`, color: "#ff2244" },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="font-exo text-xs font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: filter === f.id ? (f.color || "#10b981") + "30" : "#020508cc",
              border: `1px solid ${filter === f.id ? (f.color || "#10b981") : "#0d2035"}`,
              color: filter === f.id ? (f.color || "#10b981") : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
        <button onClick={() => refetch()}
          className="font-exo text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
          style={{ background: "#10b98120", border: "1px solid #10b981", color: "#10b981" }}>
          <RefreshCw className="w-3 h-3 inline mr-1" />
          Refresh
        </button>
        <button onClick={() => setShowFuelStations(!showFuelStations)}
          className="font-exo text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
          style={{
            background: showFuelStations ? "#ff660030" : "#020508cc",
            border: `1px solid ${showFuelStations ? "#ff6600" : "#0d2035"}`,
            color: showFuelStations ? "#ff6600" : "#3a6080",
          }}>
          <Fuel className="w-3 h-3 inline mr-1" />
          Estaciones ({fuelData?.estaciones?.filter((e: any) => e.lat)?.length || 0})
        </button>
        <span className="font-exo text-[9px] px-2 py-1.5" style={{ color: "#3a6080", background: "#020508cc", borderRadius: 4 }}>
          Zoom: {mapZoom} {mapZoom < 10 ? "· Zoom para estaciones" : ""}
        </span>
      </div>

      {/* Right panel — same as GeoValidator */}
      {panelOpen && (
        <div className="absolute top-3 right-3 bottom-3 w-72 z-10 overflow-y-auto rounded" style={{
          background: "rgba(2,5,8,0.92)",
          border: "1px solid #0d2035",
          backdropFilter: "blur(8px)",
        }}>
          <div className="p-3 sticky top-0" style={{ background: "rgba(2,5,8,0.95)", borderBottom: "1px solid #0d2035" }}>
            <div className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#10b981" }}>
              FLOTA WISETRACK · {filtered.length} vehiculos
            </div>
          </div>
          <div className="p-2 space-y-1">
            {filtered.map((c: any) => (
              <div key={c.movil}
                onClick={() => {
                  setSelectedMovil(c.movil);
                  if (c.lat && c.lng && mapInstance.current) {
                    mapInstance.current.flyTo([c.lat, c.lng], 12, { duration: 0.5 });
                  }
                }}
                className="flex items-center gap-2 p-2 rounded cursor-pointer transition-all"
                style={{
                  background: selectedMovil === c.movil ? "#10b98110" : "transparent",
                  border: `1px solid ${selectedMovil === c.movil ? "#10b98140" : "transparent"}`,
                }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: getEstadoColor(c.estado) }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.movil}</span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.patente}</span>
                  </div>
                  <div className="font-exo text-[9px] truncate" style={{ color: "#3a6080" }}>
                    {c.velocidad > 0 ? `${c.velocidad} km/h` : c.estado}
                    {c.conductor ? ` · ${c.conductor}` : ""}
                  </div>
                  <div className="font-exo text-[7px]" style={{ color: getContratoColor(c.contrato) }}>{c.contrato?.substring(0, 20)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-space text-[9px]" style={{ color: c.nivel_estanque < 20 ? "#ff2244" : "#3a6080" }}>{c.nivel_estanque}%</div>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.rpm}rpm</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle panel button */}
      <button onClick={() => setPanelOpen(!panelOpen)}
        className="absolute top-3 z-10 font-exo text-xs px-2 py-1 rounded cursor-pointer"
        style={{
          right: panelOpen ? "19rem" : "0.75rem",
          background: "#020508cc",
          border: "1px solid #0d2035",
          color: "#3a6080",
        }}>
        {panelOpen ? ">" : "<"}
      </button>

      {/* Selected vehicle detail — bottom panel */}
      {selectedVehicle && (
        <div className="absolute bottom-3 left-3 z-10 rounded" style={{
          background: "rgba(2,5,8,0.95)",
          border: "1px solid #10b981",
          backdropFilter: "blur(8px)",
          width: "420px",
        }}>
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{selectedVehicle.movil}</span>
                <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{selectedVehicle.patente}</span>
                <span className="font-exo text-[8px] px-1.5 py-0.5" style={{ color: getEstadoColor(selectedVehicle.estado), background: `${getEstadoColor(selectedVehicle.estado)}15`, borderRadius: 3 }}>{selectedVehicle.estado}</span>
              </div>
              <button onClick={() => setSelectedMovil(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
            </div>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {[
                { l: "VEL", v: `${selectedVehicle.velocidad} km/h`, c: selectedVehicle.velocidad > 0 ? "#00ff88" : "#3a6080" },
                { l: "TANQUE", v: `${selectedVehicle.nivel_estanque}%`, c: selectedVehicle.nivel_estanque < 20 ? "#ff2244" : "#00d4ff" },
                { l: "RPM", v: `${selectedVehicle.rpm}`, c: "#ffcc00" },
                { l: "MOTOR", v: `${selectedVehicle.temp_motor}C`, c: selectedVehicle.temp_motor > 100 ? "#ff2244" : "#00d4ff" },
                { l: "KM TOTAL", v: Math.round(selectedVehicle.km_total).toLocaleString("es-CL"), c: "#a855f7" },
              ].map(k => (
                <div key={k.l} className="text-center p-1.5" style={{ background: "#060d14", borderRadius: 4 }}>
                  <div className="font-space text-[11px] font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-exo text-[9px]" style={{ color: getContratoColor(selectedVehicle.contrato) }}>{selectedVehicle.contrato}</span>
              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{selectedVehicle.conductor || "Sin conductor"}</span>
              <span className="font-exo text-[8px] ml-auto" style={{ color: "#3a6080" }}>{selectedVehicle.fecha}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: VIAJES CERRADOS (improved)
// ══════════════════════════════════════════════

function WtViajesCerrados() {
  const [fecha, setFecha] = useState(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const [filtroContrato, setFiltroContrato] = useState("TODOS");
  const [selectedCamion, setSelectedCamion] = useState<string | null>(null);
  const [selectedViaje, setSelectedViaje] = useState<any>(null);

  const { data } = useQuery<any>({
    queryKey: ["/api/wt/viajes-dia", fecha, filtroContrato],
    queryFn: () => fetch(`/api/wt/viajes-dia?fecha=${fecha}&contrato=${filtroContrato}`).then(r => r.json()),
  });

  const { data: mesData } = useQuery<any>({
    queryKey: ["/api/wt/camion-mes", selectedCamion],
    queryFn: () => fetch(`/api/wt/camion-mes/${selectedCamion}`).then(r => r.json()),
    enabled: !!selectedCamion,
  });

  const { data: resumenMes } = useQuery<any>({
    queryKey: ["/api/wt/resumen-mes", filtroContrato],
    queryFn: () => fetch(`/api/wt/resumen-mes?contrato=${filtroContrato}`).then(r => r.json()),
  });

  const cambiarFecha = (d: number) => { const dt = new Date(fecha); dt.setDate(dt.getDate() + d); setFecha(dt.toISOString().slice(0, 10)); };

  return (
    <div className="px-5">
      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {[
          { l: "VIAJES MES", v: resumenMes?.viajes || 0, c: "#10b981" },
          { l: "CAMIONES", v: resumenMes?.camiones || 0, c: "#00d4ff" },
          { l: "KM TOTAL", v: fN(resumenMes?.km_total || 0), c: "#a855f7" },
          { l: "KM/L PROM", v: resumenMes?.rend_prom || "--", c: resumenMes?.rend_prom ? getRendColor(parseFloat(resumenMes.rend_prom)) : "#3a6080" },
          { l: "KM PROMEDIO", v: resumenMes?.km_prom || 0, c: "#ffcc00" },
          { l: "DIAS ACTIVOS", v: resumenMes?.dias_activos || 0, c: "#ff6b35" },
        ].map(k => (
          <div key={k.l} className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
            <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Date + filters */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => cambiarFecha(-1)} className="cursor-pointer hover:opacity-80"><ChevronLeft className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
          <span className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>
            {new Date(fecha + "T12:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <button onClick={() => cambiarFecha(1)} className="cursor-pointer hover:opacity-80"><ChevronRight className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
          <span className="font-space text-[11px] ml-4" style={{ color: "#10b981" }}>{data?.total_viajes || 0} viajes</span>
          <span className="font-space text-[11px]" style={{ color: "#3a6080" }}>{data?.total_camiones || 0} camiones</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFiltroContrato("TODOS")} className="px-2 py-1 font-space text-[8px] font-bold cursor-pointer"
            style={{ background: filtroContrato === "TODOS" ? "#10b98115" : "transparent", border: `1px solid ${filtroContrato === "TODOS" ? "#10b98140" : "#0d2035"}`, color: filtroContrato === "TODOS" ? "#10b981" : "#3a6080", borderRadius: 4 }}>TODOS</button>
          {(data?.contratos || []).slice(0, 10).map((c: any) => (
            <button key={c.contrato} onClick={() => setFiltroContrato(c.contrato)} className="px-2 py-1 font-exo text-[8px] cursor-pointer"
              style={{ background: filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}15` : "transparent", border: `1px solid ${filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}40` : "#0d2035"}`, color: filtroContrato === c.contrato ? getContratoColor(c.contrato) : "#3a6080", borderRadius: 4 }}>{c.contrato?.substring(0, 12)} ({c.viajes})</button>
          ))}
        </div>
      </div>

      {/* Camiones grid */}
      <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>CAMIONES DEL DIA</div>
      <div className="grid grid-cols-8 gap-2 mb-4">
        {(data?.camiones || []).map((c: any) => {
          const rendColor = c.rendimiento_prom > 0 ? getRendColor(c.rendimiento_prom) : "#3a6080";
          return (
            <button key={c.patente_norm} onClick={() => { setSelectedCamion(c.patente_norm); setSelectedViaje(null); }}
              className="p-2 rounded cursor-pointer transition-all hover:scale-[1.02]"
              style={{ background: selectedCamion === c.patente_norm ? "rgba(16,185,129,0.08)" : "#060d14", border: `1px solid ${selectedCamion === c.patente_norm ? "#10b98140" : "#0d2035"}`, borderTop: `2px solid ${rendColor}` }}>
              <div className="font-space text-[14px] font-bold text-center" style={{ color: "#c8e8ff" }}>{c.movil || c.patente_norm}</div>
              <div className="font-exo text-[7px] text-center truncate" style={{ color: getContratoColor(c.contrato) }}>{c.contrato?.substring(0, 14)}</div>
              <div className="font-space text-[12px] font-bold text-center mt-1" style={{ color: rendColor }}>
                {c.rendimiento_prom > 0 ? `${c.rendimiento_prom} km/L` : "--"}
              </div>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{Math.round(c.km_total)}km</span>
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.viajes}v</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected camion detail */}
      {selectedCamion && mesData && (
        <div className="p-4 mb-4" style={{ background: "#060d14", border: "1px solid #10b98130", borderTop: "2px solid #10b981", borderRadius: 8 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{selectedCamion}</span>
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Detalle mes completo</span>
            </div>
            <button onClick={() => setSelectedCamion(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-4">
            {/* Calendar */}
            <div>
              <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>CALENDARIO</div>
              <div className="grid grid-cols-7 gap-1">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <div key={i} className="text-center font-exo text-[7px]" style={{ color: "#3a6080" }}>{d}</div>
                ))}
                {(() => {
                  const cal = mesData.calendario || [];
                  if (cal.length === 0) return null;
                  const firstDay = new Date(cal[0].fecha + "T12:00").getDay();
                  const offset = firstDay === 0 ? 6 : firstDay - 1;
                  const cells = [];
                  for (let i = 0; i < offset; i++) cells.push(<div key={`e${i}`} />);
                  for (const day of cal) {
                    const bg = !day.activo ? "#0d2035" : day.rendimiento >= 2.85 ? "#00ff8825" : day.rendimiento >= 2.3 ? "#ffcc0025" : day.rendimiento > 0 ? "#ff224425" : "#10b98118";
                    const isToday = day.fecha === new Date().toISOString().slice(0, 10);
                    cells.push(
                      <div key={day.dia} className="text-center p-1 rounded" style={{ background: bg, border: isToday ? "1px solid #10b981" : "1px solid transparent", width: 36, height: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
                        title={`${day.km}km - ${day.rendimiento}km/L - ${day.viajes}v - ${day.cargas_dia} cargas`}>
                        <div className="font-space text-[9px]" style={{ color: day.activo ? "#c8e8ff" : "#3a6080" }}>{day.dia}</div>
                        {day.activo && day.rendimiento > 0 && <div className="font-space text-[6px]" style={{ color: getRendColor(day.rendimiento) }}>{day.rendimiento}</div>}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>

              {mesData.cargas?.length > 0 && (
                <div className="mt-3">
                  <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>CARGAS SIGETRA ({mesData.cargas.length})</div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {mesData.cargas.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520", borderRadius: 4 }}>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.fecha?.substring(5, 16)}</span>
                        <span className="font-space text-[9px] font-bold" style={{ color: "#ff6b35" }}>{c.litros}lt</span>
                        <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.estacion?.substring(0, 18)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: KPIs + viajes */}
            <div>
              <div className="grid grid-cols-5 gap-2 mb-3">
                {[
                  { l: "KM MES", v: fN(mesData.acumulado?.km_mes || 0), c: "#10b981" },
                  { l: "KM/L", v: mesData.acumulado?.rendimiento_promedio || "--", c: mesData.acumulado?.rendimiento_promedio ? getRendColor(mesData.acumulado.rendimiento_promedio) : "#3a6080" },
                  { l: "VIAJES", v: mesData.acumulado?.viajes_mes || 0, c: "#00d4ff" },
                  { l: "DIAS ACTIVO", v: `${mesData.acumulado?.dias_activos || 0}/${mesData.acumulado?.dias_mes || 0}`, c: "#ffcc00" },
                  { l: "LITROS", v: fN(mesData.acumulado?.litros_mes || 0), c: "#ff6b35" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                    <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>VIAJES DEL CAMION</div>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {(data?.viajes || []).filter((v: any) => v.patente_norm === selectedCamion).map((v: any) => (
                  <div key={v.id} onClick={() => setSelectedViaje(v)} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
                    style={{ background: selectedViaje?.id === v.id ? "rgba(16,185,129,0.05)" : "#0a1520", border: `1px solid ${selectedViaje?.id === v.id ? "#10b98140" : "#0d2035"}`, borderRadius: 4 }}>
                    <div>
                      <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{v.origen_nombre?.substring(0, 20)} → {v.destino_nombre?.substring(0, 20)}</span>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.fecha_inicio?.substring(11, 16)} - {v.fecha_fin?.substring(11, 16)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(v.km_viaje)} km</div>
                      {v.rendimiento > 0 && <div className="font-space text-[9px]" style={{ color: getRendColor(v.rendimiento) }}>{v.rendimiento} km/L</div>}
                    </div>
                  </div>
                ))}
                {(data?.viajes || []).filter((v: any) => v.patente_norm === selectedCamion).length === 0 && (
                  <div className="text-center py-4 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin viajes este dia</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All viajes list */}
      {!selectedCamion && (data?.viajes || []).length > 0 && (
        <div>
          <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>TODOS LOS VIAJES ({data.viajes.length})</div>
          <div className="space-y-1">
            {data.viajes.slice(0, 50).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4 }}>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.movil || v.patente}</span>
                  <span className="font-exo text-[8px]" style={{ color: getContratoColor(v.contrato) }}>{v.contrato?.substring(0, 14)}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.origen_nombre?.substring(0, 18)} → {v.destino_nombre?.substring(0, 18)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(v.km_viaje)} km</span>
                  {v.rendimiento > 0 && <span className="font-space text-[10px] font-bold" style={{ color: getRendColor(v.rendimiento) }}>{v.rendimiento} km/L</span>}
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.fecha_inicio?.substring(11, 16)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: FAENAS — Dashboard by contract
// ══════════════════════════════════════════════

function WtFaenas() {
  const [selectedFaena, setSelectedFaena] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/wt/faenas"],
    queryFn: () => fetch("/api/wt/faenas").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const { data: detalle } = useQuery<any>({
    queryKey: ["/api/wt/faena", selectedFaena],
    queryFn: () => fetch(`/api/wt/faena/${encodeURIComponent(selectedFaena!)}`).then(r => r.json()),
    enabled: !!selectedFaena,
  });

  const faenas = data?.faenas || [];
  const totals = useMemo(() => {
    const t = { camiones: 0, viajes: 0, km: 0, cargas: 0 };
    for (const f of faenas) { t.camiones += parseInt(f.camiones) || 0; t.viajes += parseInt(f.viajes) || 0; t.km += parseInt(f.km_total) || 0; t.cargas += f.cargas || 0; }
    return t;
  }, [faenas]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { l: "FAENAS/CONTRATOS", v: faenas.length, c: "#10b981" },
          { l: "CAMIONES ACTIVOS", v: totals.camiones, c: "#00d4ff" },
          { l: "VIAJES MES", v: fN(totals.viajes), c: "#a855f7" },
          { l: "KM TOTAL MES", v: fN(totals.km), c: "#ffcc00" },
          { l: "CARGAS SIGETRA", v: fN(totals.cargas), c: "#ff6b35" },
        ].map(k => (
          <div key={k.l} className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
            <div className="font-space text-[22px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando faenas...</div>
        </div>
      ) : (
        <>
          {/* Faenas grid */}
          <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>CONTRATOS ACTIVOS ({faenas.length})</div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {faenas.map((f: any) => {
              const color = getContratoColor(f.contrato);
              const isSelected = selectedFaena === f.contrato;
              return (
                <button key={f.contrato} onClick={() => setSelectedFaena(isSelected ? null : f.contrato)}
                  className="p-4 rounded text-left cursor-pointer transition-all hover:scale-[1.01]"
                  style={{ background: isSelected ? `${color}08` : "#060d14", border: `1px solid ${isSelected ? `${color}40` : "#0d2035"}`, borderTop: `3px solid ${color}` }}>
                  <div className="font-space text-[13px] font-bold truncate mb-2" style={{ color }}>{f.contrato || "SIN CONTRATO"}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="font-space text-[18px] font-bold" style={{ color: "#c8e8ff" }}>{f.camiones}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CAMIONES</div>
                    </div>
                    <div>
                      <div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}>{f.viajes}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VIAJES</div>
                    </div>
                    <div>
                      <div className="font-space text-[14px] font-bold" style={{ color: "#a855f7" }}>{fN(parseInt(f.km_total) || 0)}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>KM MES</div>
                    </div>
                    <div>
                      <div className="font-space text-[14px] font-bold" style={{ color: f.rend ? getRendColor(parseFloat(f.rend)) : "#3a6080" }}>{f.rend || "--"}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>KM/L</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Vivos: <span style={{ color: "#00ff88" }}>{f.live_count}</span></span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Cargas: <span style={{ color: "#ff6b35" }}>{f.cargas}</span></span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Cond: <span style={{ color: "#06b6d4" }}>{f.conductores}</span></span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded faena detail */}
          {selectedFaena && detalle && (
            <div className="p-4 mb-4" style={{ background: "#060d14", border: `1px solid ${getContratoColor(selectedFaena)}30`, borderTop: `3px solid ${getContratoColor(selectedFaena)}`, borderRadius: 8 }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="font-space text-[16px] font-bold" style={{ color: getContratoColor(selectedFaena) }}>{selectedFaena}</span>
                  <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Detalle del mes</span>
                </div>
                <button onClick={() => setSelectedFaena(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
              </div>

              {/* Resumen KPIs */}
              <div className="grid grid-cols-6 gap-2 mb-4">
                {[
                  { l: "VIAJES", v: detalle.resumen?.total || 0, c: "#10b981" },
                  { l: "CAMIONES", v: detalle.resumen?.camiones_activos || 0, c: "#00d4ff" },
                  { l: "KM TOTAL", v: fN(parseInt(detalle.resumen?.km_total) || 0), c: "#a855f7" },
                  { l: "KM/L PROM", v: detalle.resumen?.rend_prom || "--", c: detalle.resumen?.rend_prom ? getRendColor(parseFloat(detalle.resumen.rend_prom)) : "#3a6080" },
                  { l: "CARGAS", v: detalle.cargas?.length || 0, c: "#ff6b35" },
                  { l: "DIAS ACTIVOS", v: detalle.resumen?.dias_activos || 0, c: "#ffcc00" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                    <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Camiones list */}
                <div>
                  <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>CAMIONES ({detalle.camiones?.length || 0})</div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {(detalle.camiones || []).map((c: any) => (
                      <div key={c.patente_norm} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4, border: "1px solid #0d2035" }}>
                        <div>
                          <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.movil || c.patente_norm}</span>
                          <span className="font-exo text-[8px] ml-2" style={{ color: "#3a6080" }}>{c.patente}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-space text-[10px]" style={{ color: "#00d4ff" }}>{fN(parseInt(c.km_total) || 0)}km</span>
                          <span className="font-space text-[10px]" style={{ color: c.rend ? getRendColor(parseFloat(c.rend)) : "#3a6080" }}>{c.rend || "--"}</span>
                          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.viajes}v</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conductores */}
                <div>
                  <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>CONDUCTORES ({detalle.conductores?.length || 0})</div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {(detalle.conductores || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4, border: "1px solid #0d2035" }}>
                        <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{c.conductor}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.camiones} cam</span>
                          <span className="font-space text-[10px]" style={{ color: "#00d4ff" }}>{fN(parseInt(c.km_total) || 0)}km</span>
                          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.viajes}v</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: CAMIONES — All 477 vehicles grid
// ══════════════════════════════════════════════

function WtCamiones() {
  const [busqueda, setBusqueda] = useState("");
  const [filtroContrato, setFiltroContrato] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [selectedPatente, setSelectedPatente] = useState<string | null>(null);

  const { data: fleetData, isLoading } = useQuery<any>({
    queryKey: ["/api/wisetrack/fleet"],
    queryFn: () => fetch("/api/wisetrack/fleet").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const { data: detalle } = useQuery<any>({
    queryKey: ["/api/wt/camion-detalle", selectedPatente],
    queryFn: () => fetch(`/api/wt/camion-detalle/${selectedPatente}`).then(r => r.json()),
    enabled: !!selectedPatente,
  });

  const vehiculos = useMemo(() => {
    if (!fleetData?.vehiculos) return [];
    return fleetData.vehiculos.filter((v: any) => {
      if (filtroContrato !== "TODOS" && v.contrato !== filtroContrato) return false;
      if (filtroEstado === "CONDUCCION" && v.velocidad === 0) return false;
      if (filtroEstado === "RALENTI" && v.estado !== "Ralenti") return false;
      if (filtroEstado === "DETENIDO" && (v.estado === "Conduccion" || v.estado === "Ralenti")) return false;
      if (busqueda) {
        const q = busqueda.toUpperCase();
        return v.patente?.toUpperCase().includes(q) || v.movil?.toUpperCase().includes(q) || v.conductor?.toUpperCase().includes(q);
      }
      return true;
    });
  }, [fleetData, filtroContrato, filtroEstado, busqueda]);

  const contratos = useMemo(() => fleetData?.por_contrato || [], [fleetData]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { l: "TOTAL FLOTA", v: fleetData?.total || 0, c: "#10b981" },
          { l: "EN CONDUCCION", v: fleetData?.conduccion || 0, c: "#00ff88" },
          { l: "RALENTI", v: fleetData?.ralenti || 0, c: "#ffcc00" },
          { l: "DETENIDO", v: fleetData?.detenido || 0, c: "#ff2244" },
          { l: "CONTRATOS", v: contratos.length, c: "#00d4ff" },
        ].map(k => (
          <div key={k.l} className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
            <div className="font-space text-[22px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 px-3 py-1.5 flex-1" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4 }}>
          <Search className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar patente, movil o conductor..." className="flex-1 bg-transparent font-exo text-[11px] outline-none" style={{ color: "#c8e8ff" }} />
        </div>
        <div className="flex gap-1">
          {["TODOS", "CONDUCCION", "RALENTI", "DETENIDO"].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)} className="px-3 py-1.5 font-space text-[9px] font-bold cursor-pointer"
              style={{ background: filtroEstado === e ? "#10b98115" : "transparent", border: `1px solid ${filtroEstado === e ? "#10b98140" : "#0d2035"}`, color: filtroEstado === e ? "#10b981" : "#3a6080", borderRadius: 4 }}>{e}</button>
          ))}
        </div>
      </div>

      {/* Contratos filter */}
      <div className="flex gap-1 flex-wrap mb-3">
        <button onClick={() => setFiltroContrato("TODOS")} className="px-2 py-1 font-exo text-[9px] cursor-pointer"
          style={{ background: filtroContrato === "TODOS" ? "#10b98115" : "transparent", border: `1px solid ${filtroContrato === "TODOS" ? "#10b98140" : "#0d2035"}`, color: filtroContrato === "TODOS" ? "#10b981" : "#3a6080", borderRadius: 4 }}>TODOS ({fleetData?.total || 0})</button>
        {contratos.slice(0, 20).map((c: any) => (
          <button key={c.contrato} onClick={() => setFiltroContrato(c.contrato)} className="px-2 py-1 font-exo text-[9px] cursor-pointer"
            style={{ background: filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}15` : "transparent", border: `1px solid ${filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}40` : "#0d2035"}`, color: filtroContrato === c.contrato ? getContratoColor(c.contrato) : "#3a6080", borderRadius: 4 }}>{c.contrato?.substring(0, 15)} ({c.count})</button>
        ))}
      </div>

      <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>{vehiculos.length} VEHICULOS</div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando flota...</div>
        </div>
      ) : (
        <>
          {/* Vehicle grid */}
          <div className="grid grid-cols-8 gap-2 mb-4">
            {vehiculos.map((v: any, i: number) => {
              const patNorm = (v.patente || "").replace(/-/g, "").toUpperCase();
              const estadoColor = getEstadoColor(v.estado);
              const contratoCol = getContratoColor(v.contrato);
              const isSelected = selectedPatente === patNorm;
              return (
                <button key={i} onClick={() => setSelectedPatente(isSelected ? null : patNorm)}
                  className="p-2 rounded cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ background: isSelected ? "rgba(16,185,129,0.08)" : "#060d14", border: `1px solid ${isSelected ? "#10b98140" : "#0d2035"}`, borderLeft: `3px solid ${estadoColor}` }}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: estadoColor }} />
                    <span className="font-space text-[12px] font-bold truncate" style={{ color: "#c8e8ff" }}>{v.movil}</span>
                  </div>
                  <div className="font-exo text-[8px] truncate" style={{ color: "#3a6080" }}>{v.patente}</div>
                  <div className="font-exo text-[7px] truncate" style={{ color: contratoCol }}>{v.contrato?.substring(0, 14)}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-space text-[9px]" style={{ color: v.velocidad > 0 ? "#00ff88" : "#3a6080" }}>{v.velocidad}km/h</span>
                    <span className="font-exo text-[7px]" style={{ color: v.nivel_estanque < 20 ? "#ff2244" : "#3a6080" }}>{v.nivel_estanque}%</span>
                  </div>
                  <div className="font-exo text-[7px] truncate" style={{ color: "#3a6080" }}>KM: {fN(v.km_total || 0)}</div>
                </button>
              );
            })}
          </div>

          {/* Vehicle detail panel */}
          {selectedPatente && detalle && (
            <div className="p-4 mb-4" style={{ background: "#060d14", border: "1px solid #10b98130", borderTop: "3px solid #10b981", borderRadius: 8 }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5" style={{ color: "#10b981" }} />
                  <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{detalle.live?.Movil || selectedPatente}</span>
                  <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{detalle.live?.MOV_PATENTE || selectedPatente}</span>
                  {detalle.live?.contrato && <span className="font-exo text-[9px] px-2 py-0.5 rounded" style={{ background: `${getContratoColor(detalle.live.contrato)}15`, color: getContratoColor(detalle.live.contrato), border: `1px solid ${getContratoColor(detalle.live.contrato)}30` }}>{detalle.live.contrato}</span>}
                </div>
                <button onClick={() => setSelectedPatente(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
              </div>

              {/* Live data */}
              {detalle.live && (
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {[
                    { l: "VELOCIDAD", v: `${detalle.live.velocidad || 0} km/h`, c: detalle.live.velocidad > 0 ? "#00ff88" : "#3a6080" },
                    { l: "TANQUE", v: `${detalle.live.nivel_estanque || 0}%`, c: (detalle.live.nivel_estanque || 0) < 20 ? "#ff2244" : "#00d4ff" },
                    { l: "RPM", v: `${detalle.live.rpm || 0}`, c: "#ffcc00" },
                    { l: "MOTOR", v: `${detalle.live.temp_motor || 0}C`, c: (detalle.live.temp_motor || 0) > 100 ? "#ff2244" : "#00d4ff" },
                    { l: "KM TOTAL", v: fN(detalle.live.km_total || 0), c: "#a855f7" },
                    { l: "ESTADO", v: detalle.live.estado || "--", c: getEstadoColor(detalle.live.estado || "") },
                  ].map(k => (
                    <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                      <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Monthly summary */}
              <div className="grid grid-cols-6 gap-2 mb-4">
                {[
                  { l: "VIAJES MES", v: detalle.resumen?.viajes_mes || 0, c: "#10b981" },
                  { l: "KM MES", v: fN(detalle.resumen?.km_mes || 0), c: "#00d4ff" },
                  { l: "KM/L PROM", v: detalle.resumen?.rend_prom || "--", c: detalle.resumen?.rend_prom ? getRendColor(detalle.resumen.rend_prom) : "#3a6080" },
                  { l: "LITROS WT", v: fN(detalle.resumen?.litros_mes || 0), c: "#a855f7" },
                  { l: "CARGAS SIG", v: detalle.resumen?.cargas_mes || 0, c: "#ff6b35" },
                  { l: "LT SIGETRA", v: fN(detalle.resumen?.litros_sigetra || 0), c: "#ff6b35" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                    <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Productividad calendar */}
                <div>
                  <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>PRODUCTIVIDAD DIARIA</div>
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {(detalle.productividad || []).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5" style={{ background: p.activo ? "#0a1520" : "#060d14", borderRadius: 4, border: "1px solid #0d2035" }}>
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{p.fecha?.substring(5)}</span>
                        <span className="font-space text-[9px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(p.km_dia)}km</span>
                        <span className="font-space text-[9px]" style={{ color: p.rendimiento_dia > 0 ? getRendColor(p.rendimiento_dia) : "#3a6080" }}>{p.rendimiento_dia || "--"}</span>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{p.viajes_completados}v</span>
                      </div>
                    ))}
                    {(!detalle.productividad || detalle.productividad.length === 0) && (
                      <div className="text-center py-4 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin datos de productividad</div>
                    )}
                  </div>
                </div>

                {/* Viajes */}
                <div>
                  <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>VIAJES MES ({detalle.viajes?.length || 0})</div>
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {(detalle.viajes || []).slice(0, 20).map((v: any) => (
                      <div key={v.id} className="px-2 py-1.5" style={{ background: "#0a1520", borderRadius: 4, border: "1px solid #0d2035" }}>
                        <div className="flex items-center justify-between">
                          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.fecha_inicio?.substring(5, 16)}</span>
                          <span className="font-space text-[9px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(v.km_viaje)}km</span>
                          {v.rendimiento > 0 && <span className="font-space text-[8px]" style={{ color: getRendColor(v.rendimiento) }}>{v.rendimiento}</span>}
                        </div>
                        <div className="font-exo text-[7px] truncate" style={{ color: "#3a6080" }}>{v.origen_nombre?.substring(0, 25)} → {v.destino_nombre?.substring(0, 25)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cargas + conductores */}
                <div>
                  <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>CARGAS SIGETRA ({detalle.cargas?.length || 0})</div>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto mb-3">
                    {(detalle.cargas || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520", borderRadius: 4 }}>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.fecha?.substring(5, 16)}</span>
                        <span className="font-space text-[9px] font-bold" style={{ color: "#ff6b35" }}>{c.litros_surtidor}lt</span>
                        <span className="font-exo text-[7px] truncate max-w-[80px]" style={{ color: "#3a6080" }}>{c.estacion?.substring(0, 15)}</span>
                      </div>
                    ))}
                    {(!detalle.cargas || detalle.cargas.length === 0) && (
                      <div className="text-center py-2 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin cargas</div>
                    )}
                  </div>

                  <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>CONDUCTORES</div>
                  <div className="space-y-1">
                    {(detalle.conductores || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520", borderRadius: 4 }}>
                        <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{c.conductor}</span>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.viajes}v</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: CONDUCTORES — Driver analytics
// ══════════════════════════════════════════════

function WtConductores() {
  const [busqueda, setBusqueda] = useState("");
  const [selectedConductor, setSelectedConductor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"viajes" | "km" | "camiones" | "cargas">("viajes");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/wt/conductores"],
    queryFn: () => fetch("/api/wt/conductores").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const conductores = useMemo(() => {
    let list = data?.conductores || [];
    if (busqueda) {
      const q = busqueda.toUpperCase();
      list = list.filter((c: any) => c.nombre?.toUpperCase().includes(q));
    }
    const sortFns: Record<string, (a: any, b: any) => number> = {
      viajes: (a, b) => (b.viajes || 0) - (a.viajes || 0),
      km: (a, b) => (parseInt(b.km_total) || 0) - (parseInt(a.km_total) || 0),
      camiones: (a, b) => (parseInt(b.camiones) || 0) - (parseInt(a.camiones) || 0),
      cargas: (a, b) => (b.cargas || 0) - (a.cargas || 0),
    };
    return [...list].sort(sortFns[sortBy] || sortFns.viajes);
  }, [data, busqueda, sortBy]);

  const totals = useMemo(() => {
    const t = { conductores: conductores.length, viajes: 0, km: 0, cargas: 0 };
    for (const c of conductores) { t.viajes += c.viajes || 0; t.km += parseInt(c.km_total) || 0; t.cargas += c.cargas || 0; }
    return t;
  }, [conductores]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { l: "CONDUCTORES", v: totals.conductores, c: "#10b981" },
          { l: "VIAJES TOTALES", v: fN(totals.viajes), c: "#00d4ff" },
          { l: "KM TOTAL", v: fN(totals.km), c: "#a855f7" },
          { l: "CARGAS SIGETRA", v: fN(totals.cargas), c: "#ff6b35" },
        ].map(k => (
          <div key={k.l} className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
            <div className="font-space text-[22px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 px-3 py-1.5 flex-1" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4 }}>
          <Search className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar conductor..." className="flex-1 bg-transparent font-exo text-[11px] outline-none" style={{ color: "#c8e8ff" }} />
        </div>
        <div className="flex gap-1">
          {[
            { id: "viajes" as const, l: "VIAJES" },
            { id: "km" as const, l: "KM" },
            { id: "camiones" as const, l: "CAMIONES" },
            { id: "cargas" as const, l: "CARGAS" },
          ].map(s => (
            <button key={s.id} onClick={() => setSortBy(s.id)} className="px-3 py-1.5 font-space text-[9px] font-bold cursor-pointer"
              style={{ background: sortBy === s.id ? "#10b98115" : "transparent", border: `1px solid ${sortBy === s.id ? "#10b98140" : "#0d2035"}`, color: sortBy === s.id ? "#10b981" : "#3a6080", borderRadius: 4 }}>{s.l}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando conductores...</div>
        </div>
      ) : (
        <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "#0a1520", position: "sticky", top: 0, zIndex: 1 }}>
                  {[
                    { key: "nombre", label: "CONDUCTOR" },
                    { key: "camiones", label: "CAMIONES" },
                    { key: "viajes", label: "VIAJES" },
                    { key: "km", label: "KM TOTAL" },
                    { key: "rend", label: "KM/L PROM" },
                    { key: "cargas", label: "CARGAS SIG" },
                    { key: "litros", label: "LITROS" },
                    { key: "contrato", label: "CONTRATO" },
                  ].map(col => (
                    <th key={col.key} className="font-exo text-[10px] tracking-[0.12em] text-left px-3 py-2.5" style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conductores.map((c: any, i: number) => {
                  const isSelected = selectedConductor === c.nombre;
                  return (
                    <tr key={i} onClick={() => setSelectedConductor(isSelected ? null : c.nombre)}
                      className="cursor-pointer transition-colors hover:bg-white/5"
                      style={{ borderBottom: "1px solid #0a1520", background: isSelected ? "rgba(16,185,129,0.05)" : "transparent" }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Users className="w-3 h-3" style={{ color: "#3a6080" }} />
                          <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</span>
                        </div>
                      </td>
                      <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#00d4ff" }}>{c.camiones}</td>
                      <td className="font-space text-[11px] font-bold px-3 py-2.5" style={{ color: "#10b981" }}>{c.viajes}</td>
                      <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#c8e8ff" }}>{fN(parseInt(c.km_total) || 0)}</td>
                      <td className="font-space text-[11px] px-3 py-2.5" style={{ color: c.rend_prom ? getRendColor(parseFloat(c.rend_prom)) : "#3a6080" }}>{c.rend_prom || "--"}</td>
                      <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#ff6b35" }}>{c.cargas || 0}</td>
                      <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#3a6080" }}>{fN(c.litros_cargados || 0)}</td>
                      <td className="px-3 py-2.5">
                        {c.contrato_principal && (
                          <span className="font-exo text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${getContratoColor(c.contrato_principal)}15`, color: getContratoColor(c.contrato_principal) }}>{c.contrato_principal?.substring(0, 18)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {conductores.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: "#3a6080" }} />
                <div className="font-space text-[13px] font-bold" style={{ color: "#3a6080" }}>Sin conductores</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: ESTACIONES — Fuel stations with WT proximity
// ══════════════════════════════════════════════

function WtEstaciones() {
  const [busqueda, setBusqueda] = useState("");
  const [showOnlyWithVehicles, setShowOnlyWithVehicles] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/wt/estaciones-wt"],
    queryFn: () => fetch("/api/wt/estaciones-wt").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const estaciones = useMemo(() => {
    let list = data?.estaciones || [];
    if (showOnlyWithVehicles) list = list.filter((e: any) => e.vehiculos_cerca_count > 0);
    if (busqueda) {
      const q = busqueda.toUpperCase();
      list = list.filter((e: any) => e.nombre?.toUpperCase().includes(q));
    }
    return list.sort((a: any, b: any) => b.vehiculos_cerca_count - a.vehiculos_cerca_count || b.cargas_mes - a.cargas_mes);
  }, [data, busqueda, showOnlyWithVehicles]);

  const estacionesWithGps = useMemo(() => (data?.estaciones || []).filter((e: any) => e.lat && e.lng && e.lat !== 0 && e.lng !== 0), [data]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { l: "TOTAL ESTACIONES", v: data?.total_estaciones || 0, c: "#10b981" },
          { l: "CON VEHICULOS CERCA", v: data?.estaciones_con_vehiculos || 0, c: "#00ff88" },
          { l: "VEHICULOS GPS", v: data?.total_vehiculos || 0, c: "#00d4ff" },
          { l: "MOSTRANDO", v: estaciones.length, c: "#a855f7" },
        ].map(k => (
          <div key={k.l} className="p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
            <div className="font-space text-[22px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 px-3 py-1.5 flex-1" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4 }}>
          <Search className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar estacion..." className="flex-1 bg-transparent font-exo text-[11px] outline-none" style={{ color: "#c8e8ff" }} />
        </div>
        <button onClick={() => setShowOnlyWithVehicles(!showOnlyWithVehicles)} className="px-3 py-1.5 font-space text-[9px] font-bold cursor-pointer"
          style={{ background: showOnlyWithVehicles ? "#10b98115" : "transparent", border: `1px solid ${showOnlyWithVehicles ? "#10b98140" : "#0d2035"}`, color: showOnlyWithVehicles ? "#10b981" : "#3a6080", borderRadius: 4 }}>SOLO CON VEHICULOS</button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando estaciones...</div>
        </div>
      ) : (
        <div className="flex gap-4" style={{ height: "calc(100vh - 300px)" }}>
          {/* Map */}
          <div className="flex-1 rounded overflow-hidden" style={{ border: "1px solid #0d2035" }}>
            <APIProvider apiKey={GMAPS_KEY}>
              <GMap defaultCenter={{ lat: -33.45, lng: -70.65 }} defaultZoom={6} mapId="sotraser-fuel"
                style={{ height: "100%", width: "100%" }}>
                {estacionesWithGps.map((e: any) => (
                  <AdvancedMarker key={e.id} position={{ lat: e.lat, lng: e.lng }}>
                    <div style={{ width: e.vehiculos_cerca_count > 0 ? 14 : 8, height: e.vehiculos_cerca_count > 0 ? 14 : 8, background: e.vehiculos_cerca_count > 0 ? "#00ff88" : "#ff6b35", borderRadius: "50%", border: "2px solid #fff", boxShadow: e.vehiculos_cerca_count > 0 ? "0 0 6px #00ff88" : "none" }} />
                  </AdvancedMarker>
                ))}
              </GMap>
            </APIProvider>
          </div>

          {/* Stations list */}
          <div className="w-[450px] flex flex-col rounded overflow-hidden" style={{ border: "1px solid #0d2035", background: "#060d14" }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
              <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{estaciones.length} ESTACIONES</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {estaciones.map((e: any) => (
                <div key={e.id} className="px-3 py-2" style={{ borderBottom: "1px solid #0a1520" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-3 h-3" style={{ color: "#ff6b35" }} />
                      <span className="font-exo text-[10px] font-bold truncate max-w-[200px]" style={{ color: "#c8e8ff" }}>{e.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.vehiculos_cerca_count > 0 && (
                        <span className="font-space text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#00ff8815", color: "#00ff88", border: "1px solid #00ff8830" }}>
                          {e.vehiculos_cerca_count} cerca
                        </span>
                      )}
                      {e.cargas_mes > 0 && (
                        <span className="font-exo text-[8px]" style={{ color: "#ff6b35" }}>{e.cargas_mes} cargas · {fN(e.litros_mes)}lt</span>
                      )}
                    </div>
                  </div>
                  {e.vehiculos_cerca_count > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.vehiculos_cerca.slice(0, 6).map((v: any, i: number) => (
                        <span key={i} className="font-exo text-[7px] px-1 py-0.5 rounded" style={{ background: "#0a1520", color: getContratoColor(v.contrato), border: "1px solid #0d2035" }}>
                          {v.movil || v.patente} {v.velocidad > 0 ? `${v.velocidad}km/h` : ""}
                        </span>
                      ))}
                      {e.vehiculos_cerca_count > 6 && (
                        <span className="font-exo text-[7px] px-1 py-0.5" style={{ color: "#3a6080" }}>+{e.vehiculos_cerca_count - 6} mas</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB: COBERTURA — Cross-match Volvo x WT x Sigetra
// ══════════════════════════════════════════════

function WtCobertura() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/wisetrack/matching"],
    queryFn: () => fetch("/api/wisetrack/matching").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/wt/stats"],
    queryFn: () => fetch("/api/wt/stats").then(r => r.json()),
  });

  const [filtroSistemas, setFiltroSistemas] = useState("TODOS");
  const r = data?.resumen;

  const camFiltrados = useMemo(() => {
    if (!data?.camiones) return [];
    if (filtroSistemas === "TODOS") return data.camiones;
    if (filtroSistemas === "3") return data.camiones.filter((c: any) => c.volvo && c.wisetrack && c.sigetra);
    if (filtroSistemas === "WT+SIG") return data.camiones.filter((c: any) => c.wisetrack && c.sigetra);
    if (filtroSistemas === "SOLO_WT") return data.camiones.filter((c: any) => c.wisetrack && !c.sigetra && !c.volvo);
    if (filtroSistemas === "SOLO_SIG") return data.camiones.filter((c: any) => c.sigetra && !c.wisetrack && !c.volvo);
    return data.camiones;
  }, [data, filtroSistemas]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs top */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { l: "FLOTA TOTAL", v: r?.total || "...", c: "#10b981" },
          { l: "EN 3 SISTEMAS", v: r?.los_3_sistemas || "...", c: "#00ff88", desc: "Volvo + WiseTrack + Sigetra" },
          { l: "COBERTURA GPS", v: `${r?.pct_gps || "..."}%`, c: "#00d4ff" },
          { l: "COBERTURA COMBUSTIBLE", v: `${r?.pct_combustible || "..."}%`, c: "#ff6b35" },
        ].map(k => (
          <div key={k.l} className="p-4 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
            <div className="font-space text-[28px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
            {k.desc && <div className="font-exo text-[7px] mt-1" style={{ color: "#3a6080" }}>{k.desc}</div>}
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {[
          { l: "3 SISTEMAS", v: r?.los_3_sistemas, c: "#00ff88", f: "3" },
          { l: "VOLVO+WT", v: r?.volvo_wisetrack, c: "#06b6d4", f: "" },
          { l: "VOLVO+SIG", v: r?.volvo_sigetra, c: "#a855f7", f: "" },
          { l: "WT+SIG", v: r?.wisetrack_sigetra, c: "#f97316", f: "WT+SIG" },
          { l: "SOLO VOLVO", v: r?.solo_volvo, c: "#3a6080", f: "" },
          { l: "SOLO WT", v: r?.solo_wisetrack, c: "#3a6080", f: "SOLO_WT" },
          { l: "SOLO SIG", v: r?.solo_sigetra, c: "#3a6080", f: "SOLO_SIG" },
        ].map(k => (
          <button key={k.l} onClick={() => k.f && setFiltroSistemas(filtroSistemas === k.f ? "TODOS" : k.f)}
            className="p-2 text-center cursor-pointer transition-all hover:opacity-80"
            style={{ background: filtroSistemas === k.f ? `${k.c}10` : "#060d14", borderTop: `2px solid ${k.c}`, border: `1px solid ${filtroSistemas === k.f ? `${k.c}40` : "#0d2035"}`, borderRadius: 4 }}>
            <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v ?? "..."}</div>
            <div className="font-space text-[7px] font-bold" style={{ color: k.c }}>{k.l}</div>
          </button>
        ))}
      </div>

      {/* WT Engine stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
            <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>VIAJES WISETRACK</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#10b981" }}>{stats.viajes?.total || 0}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{stats.viajes?.camiones || 0} camiones - {stats.viajes?.rend_prom || "--"} km/L prom</div>
          </div>
          <div className="p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
            <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>SNAPSHOTS ACUMULADOS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#00d4ff" }}>{stats.snapshots?.total || 0}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>ultimo: {stats.snapshots?.ultimo?.substring(0, 16) || "--"}</div>
          </div>
          <div className="p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
            <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>PRODUCTIVIDAD DIARIA</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#ffcc00" }}>{stats.productividad?.total || 0}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{stats.productividad?.camiones || 0} camiones</div>
          </div>
        </div>
      )}

      {/* Vehicle table */}
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
        <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>DETALLE POR VEHICULO</span>
          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{camFiltrados.length} vehiculos</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead><tr style={{ background: "#0a1520", position: "sticky", top: 0 }}>
              {["VEHICULO", "PATENTES", "VOLVO", "WISETRACK", "SIGETRA", "CONTRATO", "CARGAS", "ESTADO WT"].map(h => (
                <th key={h} className="px-3 py-1.5 text-left font-space text-[8px] font-bold" style={{ color: "#3a6080" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {camFiltrados.slice(0, 200).map((c: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #0a1520" }} className="hover:bg-white/5">
                  <td className="px-3 py-1.5"><span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.id_display}</span></td>
                  <td className="px-3 py-1.5"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.patentes?.join(" / ")}</span></td>
                  <td className="px-3 py-1.5"><div className="w-3 h-3 rounded-full mx-auto" style={{ background: c.volvo ? "#00ff88" : "#1a1a2e" }} /></td>
                  <td className="px-3 py-1.5"><div className="w-3 h-3 rounded-full mx-auto" style={{ background: c.wisetrack ? "#10b981" : "#1a1a2e" }} /></td>
                  <td className="px-3 py-1.5"><div className="w-3 h-3 rounded-full mx-auto" style={{ background: c.sigetra ? "#ff6b35" : "#1a1a2e" }} /></td>
                  <td className="px-3 py-1.5"><span className="font-exo text-[8px]" style={{ color: getContratoColor(c.wt_contrato || c.sig_contrato || "") }}>{(c.wt_contrato || c.sig_contrato || "").substring(0, 18)}</span></td>
                  <td className="px-3 py-1.5"><span className="font-space text-[9px]" style={{ color: "#3a6080" }}>{c.sig_cargas || 0}</span></td>
                  <td className="px-3 py-1.5">{c.wt_estado && <span className="font-exo text-[8px] px-1.5 py-0.5" style={{ color: getEstadoColor(c.wt_estado), background: `${getEstadoColor(c.wt_estado)}15`, borderRadius: 3 }}>{c.wt_estado}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
