import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Shield, Truck, Fuel, Search, RefreshCw, ChevronLeft, ChevronRight, X, Users, Activity, BarChart3 } from "lucide-react";

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

// Triple-verified badge component
function TripleBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const s = size === "md" ? "w-2 h-2" : "w-1.5 h-1.5";
  return (
    <div className="flex items-center gap-0.5">
      <div className={`${s} rounded-full`} style={{ background: "#00ff88" }} />
      <div className={`${s} rounded-full`} style={{ background: "#10b981" }} />
      <div className={`${s} rounded-full`} style={{ background: "#ff6b35" }} />
    </div>
  );
}

// ── MAIN PAGE ──
type CruzadoTab = "mapa" | "viajes" | "faenas" | "camiones" | "conductores" | "cobertura";

export default function ValidadorCruzado({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<CruzadoTab>("mapa");
  const [selectedPatente, setSelectedPatente] = useState<string | null>(null);

  const TABS: { id: CruzadoTab; label: string }[] = [
    { id: "mapa", label: "MAPA EN VIVO" },
    { id: "viajes", label: "VIAJES CERRADOS" },
    { id: "faenas", label: "FAENAS" },
    { id: "camiones", label: "CAMIONES" },
    { id: "conductores", label: "CONDUCTORES" },
    { id: "cobertura", label: "COBERTURA" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded cursor-pointer hover:opacity-80" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <ArrowLeft className="w-4 h-4" style={{ color: "#3a6080" }} />
          </button>
          <Shield className="w-5 h-5" style={{ color: "#ffd700" }} />
          <div className="font-space text-[18px] font-bold tracking-[0.2em]" style={{ color: "#ffd700" }}>VALIDADOR CRUZADO</div>
          <div className="flex items-center gap-1 ml-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#00ff88" }} /><span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>VOLVO</span>
            <div className="w-2 h-2 rounded-full ml-1" style={{ background: "#ff6b35" }} /><span className="font-exo text-[8px]" style={{ color: "#ff6b35" }}>SIG</span>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 font-exo text-xs font-bold tracking-[0.12em] cursor-pointer transition-all"
              style={{ borderBottom: `2px solid ${tab === t.id ? "#ffd700" : "transparent"}`, color: tab === t.id ? "#ffd700" : "#4a7090" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      {tab === "mapa" && <CruzadoMapaEnVivo onSelectCamion={(p: string) => { setSelectedPatente(p); setTab("camiones"); }} />}
      {tab === "viajes" && <CruzadoViajesCerrados onSelectCamion={(p: string) => { setSelectedPatente(p); setTab("camiones"); }} />}
      {tab === "faenas" && <CruzadoFaenas />}
      {tab === "camiones" && <CruzadoCamiones initialPatente={selectedPatente} />}
      {tab === "conductores" && <CruzadoConductores />}
      {tab === "cobertura" && <CruzadoCobertura />}
    </div>
  );
}

// ======================================================
// TAB: MAPA EN VIVO (Leaflet with useRef, NOT react-leaflet)
// ======================================================

function CruzadoMapaEnVivo({ onSelectCamion }: { onSelectCamion: (p: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const fuelMarkersRef = useRef<any[]>([]);
  const [filter, setFilter] = useState("todos");
  const [selectedMovil, setSelectedMovil] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showFuelStations, setShowFuelStations] = useState(true);

  const { data, refetch } = useQuery<any>({
    queryKey: ["/api/cruzado/fleet"],
    queryFn: () => fetch("/api/cruzado/fleet").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const { data: fuelData } = useQuery<any>({
    queryKey: ["/api/geo/cargas-combustible"],
  });

  const { data: bases } = useQuery<any[]>({
    queryKey: ["/api/geo/bases"],
  });

  const vehiculos = data?.camiones || [];
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

  // Init Leaflet map (dynamic loading, NOT react-leaflet)
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: "" }).addTo(map);
      mapInstance.current = map;
    };
    loadLeaflet();
  }, []);

  // Update markers with arrow divIcon
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstance.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const statusColors: Record<string, string> = {
      "Conduccion": "#00c97a", "Ralenti": "#ffcc00", "Detenido": "#ff2244", "Motor apagado": "#3a6080",
    };

    for (const v of filtered) {
      if (!v.lat || !v.lng) continue;
      const color = statusColors[v.estado] || "#3a6080";
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:${color};border:2px solid #020508;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff">&#9650;</div>`,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([v.lat, v.lng], { icon })
        .addTo(mapInstance.current)
        .bindPopup(`
          <div style="font-family:monospace;font-size:12px;min-width:220px">
            <b style="color:#ffd700">${v.id_display}</b> · ${v.patentes?.join(" / ")}<br/>
            <span style="color:#00ff88">VOLVO</span> + <span style="color:#ff6b35">SIG</span><br/>
            <span style="color:${getContratoColor(v.sig_contrato)}">${v.sig_contrato || ""}</span><br/>
            ${v.velocidad || 0} km/h<br/>
            ${v.sig_conductor || "Sin conductor"} · ${v.sig_cargas || 0} cargas SIG
          </div>
        `);
      marker.on("click", () => setSelectedMovil(v.id_display));
      markersRef.current.push(marker);
    }

    // Geo bases
    if (bases) {
      for (const b of bases as any[]) {
        const bLat = parseFloat(b.lat);
        const bLng = parseFloat(b.lng);
        if (!bLat || !bLng) continue;
        const circle = L.circle([bLat, bLng], {
          radius: b.radioMetros || 500,
          color: "#00d4ff",
          fillColor: "#00d4ff",
          fillOpacity: 0.03,
          weight: 1,
        }).addTo(mapInstance.current);
        markersRef.current.push(circle);
        const baseMarker = L.marker([bLat, bLng], {
          icon: L.divIcon({
            html: `<div style="width:6px;height:6px;background:#00d4ff;border-radius:1px;border:1px solid #020508"></div>`,
            className: "",
            iconSize: [6, 6],
            iconAnchor: [3, 3],
          }),
        }).addTo(mapInstance.current).bindTooltip(b.nombre, { permanent: false });
        markersRef.current.push(baseMarker);
      }
    }

    // Fuel stations
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
              <b>${est.cargas}</b> cargas -- <b>${est.litros.toLocaleString("es-CL")}</b> L<br/>
              ${est.camiones} camiones
            </div>
          `);
        fuelMarkersRef.current.push(fuelMarker);
      }
    }
  }, [filtered, bases, fuelData, showFuelStations]);

  // FlyTo on selected vehicle
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstance.current || !selectedMovil) return;
    const v = vehiculos.find((vv: any) => vv.id_display === selectedMovil);
    if (v?.lat && v?.lng) {
      mapInstance.current.flyTo([v.lat, v.lng], 12);
    }
  }, [selectedMovil, vehiculos]);

  const selectedVehicle = vehiculos.find((v: any) => v.id_display === selectedMovil);

  return (
    <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
      <div ref={mapRef} className="absolute inset-0 z-0" style={{ border: "1px solid #0d2035" }} />

      {/* Filter buttons overlay */}
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
              background: filter === f.id ? (f.color || "#ffd700") + "30" : "#020508cc",
              border: `1px solid ${filter === f.id ? (f.color || "#ffd700") : "#0d2035"}`,
              color: filter === f.id ? (f.color || "#ffd700") : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
        <button onClick={() => refetch()}
          className="font-exo text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
          style={{ background: "#ffd70020", border: "1px solid #ffd700", color: "#ffd700" }}>
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
      </div>

      {/* Toggle panel button */}
      {!panelOpen && (
        <button onClick={() => setPanelOpen(true)} className="absolute top-3 right-3 z-10 px-3 py-1.5 font-exo text-xs font-bold rounded cursor-pointer"
          style={{ background: "#020508cc", border: "1px solid #ffd70040", color: "#ffd700" }}>
          Panel
        </button>
      )}

      {/* Side panel */}
      {panelOpen && (
        <div className="absolute top-3 right-3 bottom-3 w-80 z-10 flex flex-col rounded overflow-hidden"
          style={{ background: "#060d14ee", border: "1px solid #0d2035", backdropFilter: "blur(10px)" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#ffd700" }}>
              {filtered.length} CAMIONES TRIPLE VERIFICADOS
            </span>
            <button onClick={() => setPanelOpen(false)} className="cursor-pointer"><X className="w-3.5 h-3.5" style={{ color: "#3a6080" }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.map((v: any, i: number) => (
              <button key={i} onClick={() => setSelectedMovil(v.id_display)}
                onDoubleClick={() => onSelectCamion(v.id_display)}
                className="w-full text-left px-3 py-2 cursor-pointer transition-all hover:bg-white/5"
                style={{ borderBottom: "1px solid #0a1520", background: selectedMovil === v.id_display ? "rgba(255,215,0,0.04)" : "transparent" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: getEstadoColor(v.estado) }} />
                    <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.id_display}</span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.patentes?.filter((p: string) => p !== v.id_display).join("/")}</span>
                  </div>
                  <span className="font-space text-[10px] font-bold" style={{ color: v.velocidad > 0 ? "#00ff88" : "#3a6080" }}>{v.velocidad} km/h</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-exo text-[8px]" style={{ color: getContratoColor(v.sig_contrato || v.sig_contrato) }}>{(v.sig_contrato || v.sig_contrato || "").substring(0, 20)}</span>
                  <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>T:{v.nivel_estanque}% {v.rpm}rpm</span>
                  <span className="font-exo text-[7px]" style={{ color: "#ff6b35" }}>{v.sig_cargas}c</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <TripleBadge />
                  <span className="font-exo text-[6px] ml-1" style={{ color: "#3a6080" }}>triple verificado</span>
                </div>
              </button>
            ))}
          </div>

          {/* Selected vehicle detail */}
          {selectedVehicle && (
            <div className="p-3" style={{ borderTop: "2px solid #ffd700", background: "#0a1520" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{selectedVehicle.id_display}</span>
                <button onClick={() => onSelectCamion(selectedVehicle.id_display)} className="px-2 py-1 font-space text-[8px] font-bold cursor-pointer" style={{ background: "#ffd70015", border: "1px solid #ffd70040", color: "#ffd700", borderRadius: 4 }}>VER DETALLE</button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { l: "VEL", v: `${selectedVehicle.velocidad}km/h`, c: selectedVehicle.velocidad > 0 ? "#00ff88" : "#3a6080" },
                  { l: "TANQUE", v: `${selectedVehicle.nivel_estanque}%`, c: selectedVehicle.nivel_estanque < 20 ? "#ff2244" : "#00d4ff" },
                  { l: "RPM", v: `${selectedVehicle.rpm}`, c: "#ffcc00" },
                  { l: "CARGAS", v: `${selectedVehicle.sig_cargas}`, c: "#ff6b35" },
                ].map(k => (
                  <div key={k.l} className="text-center p-1.5" style={{ background: "#060d14", borderRadius: 4 }}>
                    <div className="font-space text-[11px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ======================================================
// TAB: VIAJES CERRADOS (date nav, camion grid, monthly detail, calendar, cargas)
// ======================================================

function CruzadoViajesCerrados({ onSelectCamion }: { onSelectCamion: (p: string) => void }) {
  const [fecha, setFecha] = useState(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const [solo3, setSolo3] = useState(true);
  const [filtroContrato, setFiltroContrato] = useState("TODOS");
  const [selectedCamion, setSelectedCamion] = useState<string | null>(null);

  const { data } = useQuery<any>({
    queryKey: ["/api/cruzado/viajes-dia", fecha, solo3],
    queryFn: () => fetch(`/api/cruzado/viajes-dia?fecha=${fecha}&solo3=${solo3}`).then(r => r.json()),
  });

  const { data: camionDetail } = useQuery<any>({
    queryKey: ["/api/cruzado/camion", selectedCamion],
    queryFn: () => fetch(`/api/cruzado/camion/${selectedCamion}`).then(r => r.json()),
    enabled: !!selectedCamion,
  });

  const { data: resumenMes } = useQuery<any>({
    queryKey: ["/api/cruzado/resumen-mes"],
    queryFn: () => fetch("/api/cruzado/resumen-mes").then(r => r.json()),
  });

  const cambiarFecha = (d: number) => { const dt = new Date(fecha); dt.setDate(dt.getDate() + d); setFecha(dt.toISOString().slice(0, 10)); };

  // Get unique contratos from viajes
  const contratos = useMemo(() => {
    if (!data?.viajes) return [];
    const map = new Map<string, number>();
    data.viajes.forEach((v: any) => {
      const c = v.contrato || "SIN CONTRATO";
      map.set(c, (map.get(c) || 0) + 1);
    });
    return Array.from(map.entries()).map(([c, n]) => ({ contrato: c, viajes: n })).sort((a, b) => b.viajes - a.viajes);
  }, [data]);

  // Filter viajes by contrato
  const filteredViajes = useMemo(() => {
    if (!data?.viajes) return [];
    if (filtroContrato === "TODOS") return data.viajes;
    return data.viajes.filter((v: any) => v.contrato === filtroContrato);
  }, [data, filtroContrato]);

  return (
    <div className="px-5">
      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {[
          { l: "VIAJES MES", v: resumenMes?.totales?.viajes_combinado || 0, c: "#ffd700" },
          { l: "CAMIONES 3S", v: resumenMes?.camiones_3s || 0, c: "#00d4ff" },
          { l: "KM VOLVO", v: fN(resumenMes?.volvo?.km || 0), c: "#00ff88" },
          { l: "LITROS SIG", v: fN(resumenMes?.sigetra?.litros || 0), c: "#ff6b35" },
          { l: "DIAS ACTIVOS", v: resumenMes?.totales?.dias_activos || 0, c: "#a855f7" },
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
          <span className="font-space text-[11px] ml-4" style={{ color: "#ffd700" }}>{data?.total_viajes || 0} viajes</span>
          <span className="font-space text-[11px]" style={{ color: "#3a6080" }}>{data?.total_camiones || 0} camiones</span>
        </div>
        <div className="flex gap-1 items-center">
          <button onClick={() => setSolo3(!solo3)} className="px-3 py-1.5 font-space text-[9px] font-bold cursor-pointer mr-2"
            style={{ background: solo3 ? "#ffd70015" : "transparent", border: `1px solid ${solo3 ? "#ffd70040" : "#0d2035"}`, color: solo3 ? "#ffd700" : "#3a6080", borderRadius: 4 }}>
            {solo3 ? "SOLO 3 SISTEMAS" : "TODOS LOS VIAJES"}
          </button>
          <button onClick={() => setFiltroContrato("TODOS")} className="px-2 py-1 font-space text-[8px] font-bold cursor-pointer"
            style={{ background: filtroContrato === "TODOS" ? "#ffd70015" : "transparent", border: `1px solid ${filtroContrato === "TODOS" ? "#ffd70040" : "#0d2035"}`, color: filtroContrato === "TODOS" ? "#ffd700" : "#3a6080", borderRadius: 4 }}>TODOS</button>
          {contratos.slice(0, 10).map((c: any) => (
            <button key={c.contrato} onClick={() => setFiltroContrato(c.contrato)} className="px-2 py-1 font-exo text-[8px] cursor-pointer"
              style={{ background: filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}15` : "transparent", border: `1px solid ${filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}40` : "#0d2035"}`, color: filtroContrato === c.contrato ? getContratoColor(c.contrato) : "#3a6080", borderRadius: 4 }}>{c.contrato?.substring(0, 12)} ({c.viajes})</button>
          ))}
        </div>
      </div>

      {/* Camiones grid */}
      <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>CAMIONES DEL DIA</div>
      <div className="grid grid-cols-8 gap-2 mb-4">
        {(data?.camiones || []).map((c: any) => {
          const rendColor = c.rendimiento > 0 ? getRendColor(c.rendimiento) : "#3a6080";
          return (
            <button key={c.id_display} onClick={() => { setSelectedCamion(c.id_display); }}
              className="p-2 rounded cursor-pointer transition-all hover:scale-[1.02]"
              style={{ background: selectedCamion === c.id_display ? "rgba(255,215,0,0.08)" : "#060d14", border: `1px solid ${selectedCamion === c.id_display ? "#ffd70040" : c.en_3_sistemas ? "#ffd70015" : "#0d2035"}`, borderTop: `2px solid ${rendColor}` }}>
              <div className="font-space text-[13px] font-bold text-center" style={{ color: "#c8e8ff" }}>{c.id_display}</div>
              <div className="font-exo text-[7px] text-center truncate" style={{ color: getContratoColor(c.contrato) }}>{c.contrato?.substring(0, 12)}</div>
              <div className="font-space text-[11px] font-bold text-center mt-1" style={{ color: rendColor }}>
                {c.rendimiento > 0 ? `${c.rendimiento} km/L` : "--"}
              </div>
              <div className="flex items-center justify-center gap-0.5 mt-0.5">
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{Math.round(c.km_total)}km {c.viajes}v</span>
              </div>
              {c.en_3_sistemas && (
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <TripleBadge />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected camion monthly detail */}
      {selectedCamion && camionDetail && (
        <div className="p-4 mb-4" style={{ background: "#060d14", border: "1px solid #ffd70030", borderTop: "2px solid #ffd700", borderRadius: 8 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <TripleBadge size="md" />
              <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{camionDetail.id_display}</span>
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{camionDetail.patentes?.join(" / ")}</span>
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Detalle mes completo</span>
            </div>
            <button onClick={() => setSelectedCamion(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-4">
            {/* Left: Calendar + Cargas Sigetra */}
            <div>
              <div className="font-space text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>CALENDARIO (viajes Volvo del mes)</div>
              <div className="grid grid-cols-7 gap-1">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <div key={i} className="text-center font-exo text-[7px]" style={{ color: "#3a6080" }}>{d}</div>
                ))}
                {(() => {
                  const viajes = camionDetail.volvo?.viajes || [];
                  if (!viajes.length) return <div className="col-span-7 text-center py-2 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin viajes Volvo</div>;
                  // Group by day
                  const dayMap = new Map<string, { km: number; rend: number; count: number }>();
                  for (const v of viajes) {
                    const d = v.fecha_inicio?.substring(0, 10);
                    if (!d) continue;
                    if (!dayMap.has(d)) dayMap.set(d, { km: 0, rend: 0, count: 0 });
                    const dm = dayMap.get(d)!;
                    dm.km += v.km || 0;
                    if (v.rend > 0) { dm.rend = (dm.rend * dm.count + v.rend) / (dm.count + 1); }
                    dm.count++;
                  }
                  // Build calendar for current month
                  const now = new Date();
                  const year = now.getFullYear(), month = now.getMonth();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const firstDow = new Date(year, month, 1).getDay();
                  const offset = firstDow === 0 ? 6 : firstDow - 1;
                  const cells = [];
                  for (let i = 0; i < offset; i++) cells.push(<div key={`e${i}`} />);
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dm = dayMap.get(dateStr);
                    const bg = !dm ? "#0d2035" : dm.rend >= 2.85 ? "#00ff8825" : dm.rend >= 2.3 ? "#ffcc0025" : dm.rend > 0 ? "#ff224425" : "#ffd70018";
                    const isToday = dateStr === new Date().toISOString().slice(0, 10);
                    cells.push(
                      <div key={day} className="text-center p-1 rounded" style={{ background: bg, border: isToday ? "1px solid #ffd700" : "1px solid transparent", width: 36, height: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
                        title={dm ? `${Math.round(dm.km)}km - ${dm.rend.toFixed(2)}km/L - ${dm.count}v` : ""}>
                        <div className="font-space text-[9px]" style={{ color: dm ? "#c8e8ff" : "#3a6080" }}>{day}</div>
                        {dm && dm.rend > 0 && <div className="font-space text-[6px]" style={{ color: getRendColor(dm.rend) }}>{dm.rend.toFixed(1)}</div>}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>

              {/* Cargas Sigetra */}
              {camionDetail.sigetra?.cargas?.length > 0 && (
                <div className="mt-3">
                  <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#ff6b35" }}>CARGAS SIGETRA ({camionDetail.sigetra.cargas.length})</div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {camionDetail.sigetra.cargas.map((c: any, i: number) => (
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

            {/* Right: 3-source KPIs + viajes */}
            <div>
              <div className="grid grid-cols-6 gap-2 mb-3">
                {[
                  { l: "VOLVO KM", v: fN(Math.round(camionDetail.volvo?.km_mes || 0)), c: "#00ff88" },
                  { l: "VOLVO KM/L", v: camionDetail.volvo?.rend_prom || "--", c: camionDetail.volvo?.rend_prom ? getRendColor(camionDetail.volvo.rend_prom) : "#3a6080" },
                  { l: "SIG CARGAS", v: camionDetail.sigetra?.cargas_mes || 0, c: "#ff6b35" },
                  { l: "SIG LITROS", v: fN(camionDetail.sigetra?.litros_mes || 0), c: "#ff6b35" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                    <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              <div className="font-space text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>VIAJES DEL CAMION (este dia)</div>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {filteredViajes.filter((v: any) => v.id_display === selectedCamion).map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2"
                    style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 4 }}>
                    <div>
                      <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{v.origen_nombre?.substring(0, 20)} → {v.destino_nombre?.substring(0, 20)}</span>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.fecha_inicio?.substring(11, 16)} - {v.fecha_fin?.substring(11, 16)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(v.km_ecu)} km</div>
                      {v.rendimiento > 0 && <div className="font-space text-[9px]" style={{ color: getRendColor(v.rendimiento) }}>{v.rendimiento.toFixed(2)} km/L</div>}
                    </div>
                  </div>
                ))}
                {filteredViajes.filter((v: any) => v.id_display === selectedCamion).length === 0 && (
                  <div className="text-center py-4 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin viajes este dia para este camion</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All viajes list */}
      {!selectedCamion && filteredViajes.length > 0 && (
        <div>
          <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>TODOS LOS VIAJES ({filteredViajes.length})</div>
          <div className="space-y-1">
            {filteredViajes.slice(0, 60).map((v: any) => (
              <div key={v.id} onClick={() => onSelectCamion(v.id_display)} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
                style={{ background: "#060d14", border: `1px solid ${v.en_3_sistemas ? "#ffd70015" : "#0d2035"}`, borderRadius: 4 }}>
                <div className="flex items-center gap-3">
                  {v.en_3_sistemas && <TripleBadge />}
                  <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.id_display}</span>
                  <span className="font-exo text-[8px]" style={{ color: getContratoColor(v.contrato) }}>{v.contrato?.substring(0, 12)}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.origen_nombre?.substring(0, 15)} → {v.destino_nombre?.substring(0, 15)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(v.km_ecu)} km</span>
                  {v.rendimiento > 0 && <span className="font-space text-[10px] font-bold" style={{ color: getRendColor(v.rendimiento) }}>{v.rendimiento.toFixed(2)} km/L</span>}
                  {v.nivel_estanque != null && <span className="font-exo text-[8px]" style={{ color: "#10b981" }}>T:{v.nivel_estanque}%</span>}
                  {v.cargas_dia > 0 && <span className="font-exo text-[8px]" style={{ color: "#ff6b35" }}>{v.litros_dia.toFixed(0)}lt</span>}
                  <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.fecha_inicio?.substring(11, 16)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================
// TAB: FAENAS (contract cards grid with KPIs)
// ======================================================

function CruzadoFaenas() {
  const [selectedFaena, setSelectedFaena] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/cruzado/faenas"],
    queryFn: () => fetch("/api/cruzado/faenas").then(r => r.json()),
    refetchInterval: 30 * 1000,
  });

  const faenas = data?.faenas || [];
  const totals = useMemo(() => {
    const t = { camiones: 0, viajes_volvo: 0, km_volvo: 0, cargas: 0, litros: 0, conductores: 0 };
    for (const f of faenas) {
      t.camiones += f.camiones || 0; t.viajes_volvo += f.viajes_volvo || 0;
      t.km_volvo += f.km_volvo || 0; t.cargas += f.cargas || 0;
      t.litros += f.litros || 0; t.conductores += f.conductores || 0;
    }
    return t;
  }, [faenas]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {[
          { l: "FAENAS ACTIVAS", v: faenas.length, c: "#ffd700" },
          { l: "CAMIONES 3S", v: totals.camiones, c: "#00d4ff" },
          { l: "KM VOLVO", v: fN(totals.km_volvo), c: "#00ff88" },
          { l: "VIAJES VOLVO", v: totals.viajes_volvo, c: "#00d4ff" },
          { l: "CARGAS SIGETRA", v: fN(totals.cargas), c: "#ff6b35" },
          { l: "LITROS TOTAL", v: fN(totals.litros), c: "#a855f7" },
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
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando faenas cruzadas...</div>
        </div>
      ) : (
        <>
          <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>CONTRATOS CON DATOS EN 3 SISTEMAS ({faenas.length})</div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {faenas.map((f: any) => {
              const color = getContratoColor(f.contrato);
              const isSelected = selectedFaena === f.contrato;
              return (
                <button key={f.contrato} onClick={() => setSelectedFaena(isSelected ? null : f.contrato)}
                  className="p-4 rounded text-left cursor-pointer transition-all hover:scale-[1.01]"
                  style={{ background: isSelected ? `${color}08` : "#060d14", border: `1px solid ${isSelected ? `${color}40` : "#0d2035"}`, borderTop: `3px solid ${color}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-space text-[13px] font-bold truncate" style={{ color }}>{f.contrato || "SIN CONTRATO"}</div>
                    <TripleBadge size="md" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="font-space text-[18px] font-bold" style={{ color: "#c8e8ff" }}>{f.camiones}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CAMIONES</div>
                    </div>
                    <div>
                      <div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}>{f.viajes_volvo}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VIAJES</div>
                    </div>
                    <div>
                      <div className="font-space text-[14px] font-bold" style={{ color: "#00ff88" }}>{fN(f.km_volvo)}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>KM VOLVO</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Volvo: <span style={{ color: "#00ff88" }}>{f.rend_volvo || "--"}</span></span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Cargas: <span style={{ color: "#ff6b35" }}>{f.cargas}</span></span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Cond: <span style={{ color: "#06b6d4" }}>{f.conductores}</span></span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Expanded faena detail */}
          {selectedFaena && (() => {
            const f = faenas.find((ff: any) => ff.contrato === selectedFaena);
            if (!f) return null;
            const color = getContratoColor(selectedFaena);
            return (
              <div className="p-4 mb-4" style={{ background: "#060d14", border: `1px solid ${color}30`, borderTop: `3px solid ${color}`, borderRadius: 8 }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <TripleBadge size="md" />
                    <span className="font-space text-[16px] font-bold" style={{ color }}>{selectedFaena}</span>
                    <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Detalle cruzado del mes</span>
                  </div>
                  <button onClick={() => setSelectedFaena(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
                </div>

                <div className="grid grid-cols-8 gap-2">
                  {[
                    { l: "CAMIONES", v: f.camiones, c: "#ffd700" },
                    { l: "VJS VOLVO", v: f.viajes_volvo, c: "#00ff88" },
                    { l: "KM VOLVO", v: fN(f.km_volvo), c: "#00ff88" },
                    { l: "KM/L VOLVO", v: f.rend_volvo || "--", c: f.rend_volvo ? getRendColor(f.rend_volvo) : "#3a6080" },
                    { l: "CARGAS SIG", v: f.cargas, c: "#ff6b35" },
                    { l: "LITROS", v: fN(f.litros), c: "#ff6b35" },
                  ].map(k => (
                    <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                      <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v}</div>
                      <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ======================================================
// TAB: CAMIONES (130-vehicle grid with triple-verified badge)
// ======================================================

function CruzadoCamiones({ initialPatente }: { initialPatente: string | null }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroContrato, setFiltroContrato] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [selectedPatente, setSelectedPatente] = useState<string | null>(initialPatente);

  const { data: fleetData, isLoading } = useQuery<any>({
    queryKey: ["/api/cruzado/fleet"],
    queryFn: () => fetch("/api/cruzado/fleet").then(r => r.json()),
    refetchInterval: 20 * 1000,
  });

  const { data: detalle } = useQuery<any>({
    queryKey: ["/api/cruzado/camion", selectedPatente],
    queryFn: () => fetch(`/api/cruzado/camion/${selectedPatente}`).then(r => r.json()),
    enabled: !!selectedPatente,
  });

  const vehiculos = useMemo(() => {
    if (!fleetData?.camiones) return [];
    return fleetData.camiones.filter((v: any) => {
      if (filtroContrato !== "TODOS" && v.sig_contrato !== filtroContrato && v.sig_contrato !== filtroContrato) return false;
      if (filtroEstado === "CONDUCCION" && v.velocidad === 0) return false;
      if (filtroEstado === "RALENTI" && v.estado !== "Ralenti") return false;
      if (filtroEstado === "DETENIDO" && (v.estado === "Conduccion" || v.estado === "Ralenti")) return false;
      if (busqueda) {
        const q = busqueda.toUpperCase();
        return v.id_display?.toUpperCase().includes(q) || v.patentes?.some((p: string) => p.toUpperCase().includes(q)) || v.conductor?.toUpperCase().includes(q);
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
          { l: "TOTAL 3 SISTEMAS", v: fleetData?.total || 0, c: "#ffd700" },
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
              style={{ background: filtroEstado === e ? "#ffd70015" : "transparent", border: `1px solid ${filtroEstado === e ? "#ffd70040" : "#0d2035"}`, color: filtroEstado === e ? "#ffd700" : "#3a6080", borderRadius: 4 }}>{e}</button>
          ))}
        </div>
      </div>

      {/* Contratos filter */}
      <div className="flex gap-1 flex-wrap mb-3">
        <button onClick={() => setFiltroContrato("TODOS")} className="px-2 py-1 font-exo text-[9px] cursor-pointer"
          style={{ background: filtroContrato === "TODOS" ? "#ffd70015" : "transparent", border: `1px solid ${filtroContrato === "TODOS" ? "#ffd70040" : "#0d2035"}`, color: filtroContrato === "TODOS" ? "#ffd700" : "#3a6080", borderRadius: 4 }}>TODOS ({fleetData?.total || 0})</button>
        {contratos.slice(0, 20).map((c: any) => (
          <button key={c.contrato} onClick={() => setFiltroContrato(c.contrato)} className="px-2 py-1 font-exo text-[9px] cursor-pointer"
            style={{ background: filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}15` : "transparent", border: `1px solid ${filtroContrato === c.contrato ? `${getContratoColor(c.contrato)}40` : "#0d2035"}`, color: filtroContrato === c.contrato ? getContratoColor(c.contrato) : "#3a6080", borderRadius: 4 }}>{c.contrato?.substring(0, 15)} ({c.count})</button>
        ))}
      </div>

      <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#3a6080" }}>{vehiculos.length} VEHICULOS TRIPLE VERIFICADOS</div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando flota cruzada...</div>
        </div>
      ) : (
        <>
          {/* Vehicle grid */}
          <div className="grid grid-cols-8 gap-2 mb-4">
            {vehiculos.map((v: any, i: number) => {
              const estadoColor = getEstadoColor(v.estado);
              const contratoCol = getContratoColor(v.sig_contrato || v.sig_contrato);
              const isSelected = selectedPatente === v.id_display;
              return (
                <button key={i} onClick={() => setSelectedPatente(isSelected ? null : v.id_display)}
                  className="p-2 rounded cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ background: isSelected ? "rgba(255,215,0,0.08)" : "#060d14", border: `1px solid ${isSelected ? "#ffd70040" : "#0d2035"}`, borderLeft: `3px solid ${estadoColor}` }}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: estadoColor }} />
                    <span className="font-space text-[12px] font-bold truncate" style={{ color: "#c8e8ff" }}>{v.id_display}</span>
                  </div>
                  <div className="font-exo text-[8px] truncate" style={{ color: "#3a6080" }}>{v.patentes?.filter((p: string) => p !== v.id_display).join("/")}</div>
                  <div className="font-exo text-[7px] truncate" style={{ color: contratoCol }}>{(v.sig_contrato || v.sig_contrato || "").substring(0, 14)}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-space text-[9px]" style={{ color: v.velocidad > 0 ? "#00ff88" : "#3a6080" }}>{v.velocidad}km/h</span>
                    <span className="font-exo text-[7px]" style={{ color: v.nivel_estanque < 20 ? "#ff2244" : "#3a6080" }}>{v.nivel_estanque}%</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-exo text-[7px]" style={{ color: "#ff6b35" }}>{v.sig_cargas}c</span>
                    <TripleBadge />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Vehicle detail panel */}
          {selectedPatente && detalle && (
            <div className="p-4 mb-4" style={{ background: "#060d14", border: "1px solid #ffd70030", borderTop: "3px solid #ffd700", borderRadius: 8 }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <TripleBadge size="md" />
                  <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{detalle.id_display}</span>
                  <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{detalle.patentes?.join(" / ")}</span>
                  {detalle.vin && <span className="font-exo text-[8px] px-2 py-0.5" style={{ color: "#3a6080", background: "#0d2035", borderRadius: 4 }}>VIN: {detalle.vin?.substring(0, 12)}...</span>}
                </div>
                <button onClick={() => setSelectedPatente(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
              </div>

              {/* 3 source cards */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                {/* VOLVO */}
                <div className="p-4" style={{ background: "#0a1520", border: `1px solid ${detalle.volvo?.activo ? "#00ff8830" : "#0d2035"}`, borderTop: "3px solid #00ff88", borderRadius: 8 }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00ff88" }}>VOLVO CONNECT</span>
                    <span className="font-exo text-[8px] px-1.5 py-0.5" style={{ color: detalle.volvo?.activo ? "#00ff88" : "#3a6080", background: detalle.volvo?.activo ? "#00ff8815" : "#0d2035", borderRadius: 3 }}>
                      {detalle.volvo?.activo ? "ACTIVO" : "SIN DATOS"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: "VIAJES MES", v: detalle.volvo?.viajes_mes || 0, c: "#00ff88" },
                      { l: "KM/L ECU", v: detalle.volvo?.rend_prom || "--", c: "#00ff88" },
                      { l: "KM MES", v: fN(Math.round(detalle.volvo?.km_mes || 0)), c: "#c8e8ff" },
                      { l: "SNAPSHOTS", v: detalle.volvo?.snapshots || 0, c: "#c8e8ff" },
                    ].map(k => (
                      <div key={k.l} className="text-center p-2" style={{ background: "#060d14", borderRadius: 4 }}>
                        <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                        <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SIGETRA */}
                <div className="p-4" style={{ background: "#0a1520", border: `1px solid ${detalle.sigetra?.activo ? "#ff6b3530" : "#0d2035"}`, borderTop: "3px solid #ff6b35", borderRadius: 8 }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>SIGETRA</span>
                    <span className="font-exo text-[8px] px-1.5 py-0.5" style={{ color: detalle.sigetra?.activo ? "#ff6b35" : "#3a6080", background: detalle.sigetra?.activo ? "#ff6b3515" : "#0d2035", borderRadius: 3 }}>
                      {detalle.sigetra?.activo ? `${detalle.sigetra.cargas_mes} CARGAS` : "SIN CARGAS"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: "CARGAS MES", v: detalle.sigetra?.cargas_mes || 0, c: "#ff6b35" },
                      { l: "LITROS MES", v: fN(Math.round(detalle.sigetra?.litros_mes || 0)), c: "#ff6b35" },
                    ].map(k => (
                      <div key={k.l} className="text-center p-2" style={{ background: "#060d14", borderRadius: 4 }}>
                        <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                        <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                  {detalle.sigetra?.conductor && (
                    <div className="mt-2 px-2 py-1" style={{ background: "#060d14", borderRadius: 4 }}>
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Conductor: </span>
                      <span className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{detalle.sigetra.conductor}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Viajes comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                  <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#00ff88" }}>VIAJES VOLVO ECU ({detalle.volvo?.viajes?.length || 0})</div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {(detalle.volvo?.viajes || []).map((v: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5" style={{ background: "#060d14", borderRadius: 4 }}>
                        <div>
                          <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{v.origen_nombre?.substring(0, 18)} → {v.destino_nombre?.substring(0, 18)}</span>
                          <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.fecha_inicio?.substring(0, 16)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-space text-[9px] font-bold" style={{ color: "#00d4ff" }}>{Math.round(v.km || 0)} km</div>
                          {v.rend > 0 && <div className="font-space text-[8px]" style={{ color: getRendColor(v.rend) }}>{v.rend.toFixed(2)} km/L</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6 }}>
                  <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#ff6b35" }}>CARGAS SIGETRA ({detalle.sigetra?.cargas?.length || 0})</div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {(detalle.sigetra?.cargas || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5" style={{ background: "#060d14", borderRadius: 4 }}>
                        <div>
                          <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{c.estacion?.substring(0, 25)}</span>
                          <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.fecha?.substring(0, 16)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-space text-[10px] font-bold" style={{ color: "#ff6b35" }}>{c.litros} lt</div>
                          {c.conductor && <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.conductor}</div>}
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

// ======================================================
// TAB: CONDUCTORES (driver table with stats)
// ======================================================

function CruzadoConductores() {
  const [busqueda, setBusqueda] = useState("");
  const [sortBy, setSortBy] = useState<"camiones" | "cargas" | "litros" | "snapshots">("camiones");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/cruzado/conductores"],
    queryFn: () => fetch("/api/cruzado/conductores").then(r => r.json()),
    refetchInterval: 30 * 1000,
  });

  const conductores = useMemo(() => {
    let list = data?.conductores || [];
    if (busqueda) {
      const q = busqueda.toUpperCase();
      list = list.filter((c: any) => c.nombre?.toUpperCase().includes(q));
    }
    const sortFns: Record<string, (a: any, b: any) => number> = {
      camiones: (a, b) => (b.total_camiones || 0) - (a.total_camiones || 0),
      cargas: (a, b) => (b.cargas || 0) - (a.cargas || 0),
      litros: (a, b) => (b.litros || 0) - (a.litros || 0),
      snapshots: (a, b) => (b.snapshots || 0) - (a.snapshots || 0),
    };
    return [...list].sort(sortFns[sortBy] || sortFns.camiones);
  }, [data, busqueda, sortBy]);

  const totals = useMemo(() => {
    const t = { total: conductores.length, enAmbas: 0, cargas: 0, litros: 0 };
    for (const c of conductores) { if (c.en_ambas) t.enAmbas++; t.cargas += c.cargas || 0; t.litros += c.litros || 0; }
    return t;
  }, [conductores]);

  return (
    <div className="px-5 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { l: "CONDUCTORES", v: totals.total, c: "#ffd700" },
          { l: "EN AMBAS FUENTES", v: totals.enAmbas, c: "#00ff88" },
          { l: "CARGAS SIGETRA", v: fN(totals.cargas), c: "#ff6b35" },
          { l: "LITROS TOTAL", v: fN(totals.litros), c: "#a855f7" },
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
            { id: "camiones" as const, l: "CAMIONES" },
            { id: "cargas" as const, l: "CARGAS" },
            { id: "litros" as const, l: "LITROS" },
            { id: "snapshots" as const, l: "ACTIVIDAD" },
          ].map(s => (
            <button key={s.id} onClick={() => setSortBy(s.id)} className="px-3 py-1.5 font-space text-[9px] font-bold cursor-pointer"
              style={{ background: sortBy === s.id ? "#ffd70015" : "transparent", border: `1px solid ${sortBy === s.id ? "#ffd70040" : "#0d2035"}`, color: sortBy === s.id ? "#ffd700" : "#3a6080", borderRadius: 4 }}>{s.l}</button>
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
                    { key: "fuentes", label: "FUENTES" },
                    { key: "camiones", label: "CAMIONES" },
                    { key: "contrato", label: "CONTRATO" },
                    { key: "cargas", label: "CARGAS SIG" },
                    { key: "litros", label: "LITROS" },
                    { key: "ultima", label: "ULTIMA VEZ" },
                  ].map(col => (
                    <th key={col.key} className="font-exo text-[10px] tracking-[0.12em] text-left px-3 py-2.5" style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conductores.map((c: any, i: number) => (
                  <tr key={i} className="transition-colors hover:bg-white/5" style={{ borderBottom: "1px solid #0a1520" }}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="w-3 h-3" style={{ color: "#ffd700" }} />
                        <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {c.fuente_sig && <div className="w-2 h-2 rounded-full" style={{ background: "#ff6b35" }} />}
                      </div>
                    </td>
                    <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#00d4ff" }}>{c.total_camiones}</td>
                    <td className="px-3 py-2.5">
                      {c.contrato && (
                        <span className="font-exo text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${getContratoColor(c.contrato)}15`, color: getContratoColor(c.contrato) }}>{c.contrato?.substring(0, 18)}</span>
                      )}
                    </td>
                    <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#10b981" }}>{c.snapshots}</td>
                    <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#ff6b35" }}>{c.cargas}</td>
                    <td className="font-space text-[11px] px-3 py-2.5" style={{ color: "#a855f7" }}>{fN(c.litros)}</td>
                    <td className="font-exo text-[9px] px-3 py-2.5" style={{ color: "#3a6080" }}>{c.ultima_vez?.substring(0, 16) || "--"}</td>
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

// ======================================================
// TAB: COBERTURA (existing matching dashboard)
// ======================================================

function CruzadoCobertura() {
  const { data: resumen } = useQuery<any>({
    queryKey: ["/api/cruzado/resumen"],
    queryFn: () => fetch("/api/cruzado/resumen").then(r => r.json()),
  });

  const { data: resumenMes } = useQuery<any>({
    queryKey: ["/api/cruzado/resumen-mes"],
    queryFn: () => fetch("/api/cruzado/resumen-mes").then(r => r.json()),
  });

  const cruzados = resumen?.camiones_volvo_sigetra || 0;
  const volvoTotal = resumen?.volvo_total || 0;
  const sigTotal = resumen?.sig_total || 0;

  return (
    <div className="px-5 pb-8">
      <div className="font-space text-[11px] font-bold tracking-wider mb-4" style={{ color: "#ffd700" }}>COBERTURA DE SISTEMAS</div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-6 text-center" style={{ background: "#060d14", border: "2px solid #ffd70040", borderRadius: 8 }}>
          <div className="font-space text-[40px] font-bold" style={{ color: "#ffd700" }}>{cruzados}</div>
          <div className="font-exo text-[10px] tracking-wider" style={{ color: "#3a6080" }}>VOLVO + SIGETRA</div>
          <div className="font-exo text-[8px] mt-1" style={{ color: "#ffd700" }}>CRUZADOS</div>
        </div>
        <div className="p-6 text-center" style={{ background: "#060d14", border: "1px solid #00ff8830", borderTop: "3px solid #00ff88", borderRadius: 8 }}>
          <div className="font-space text-[40px] font-bold" style={{ color: "#00ff88" }}>{volvoTotal}</div>
          <div className="font-exo text-[10px] tracking-wider" style={{ color: "#3a6080" }}>VOLVO CONNECT</div>
          <div className="font-exo text-[8px] mt-1" style={{ color: "#00ff88" }}>ECU + Snapshots</div>
        </div>
        <div className="p-6 text-center" style={{ background: "#060d14", border: "1px solid #ff6b3530", borderTop: "3px solid #ff6b35", borderRadius: 8 }}>
          <div className="font-space text-[40px] font-bold" style={{ color: "#ff6b35" }}>{sigTotal}</div>
          <div className="font-exo text-[10px] tracking-wider" style={{ color: "#3a6080" }}>SIGETRA</div>
          <div className="font-exo text-[8px] mt-1" style={{ color: "#ff6b35" }}>Cargas Combustible</div>
        </div>
      </div>

      <div className="p-4 mb-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="font-space text-[9px] font-bold tracking-wider mb-3" style={{ color: "#3a6080" }}>COBERTURA PORCENTUAL</div>
        {[
          { label: "Volvo + Sigetra", value: cruzados, max: Math.max(volvoTotal, sigTotal, 1), color: "#ffd700" },
          { label: "Volvo Connect", value: volvoTotal, max: Math.max(volvoTotal, sigTotal, 1), color: "#00ff88" },
          { label: "Sigetra Cargas", value: sigTotal, max: Math.max(volvoTotal, sigTotal, 1), color: "#ff6b35" },
        ].map(b => (
          <div key={b.label} className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-exo text-[10px]" style={{ color: b.color }}>{b.label}</span>
              <span className="font-space text-[11px] font-bold" style={{ color: b.color }}>{b.value}</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: "#0d2035" }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.round(b.value / b.max * 100)}%`, background: b.color, opacity: 0.8 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Monthly KPIs */}
      {resumenMes && (
        <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <div className="font-space text-[9px] font-bold tracking-wider mb-3" style={{ color: "#3a6080" }}>KPIs DEL MES (camiones Volvo + Sigetra)</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3" style={{ background: "#0a1520", borderTop: "2px solid #00ff88", borderRadius: 6 }}>
              <div className="font-space text-[9px] font-bold mb-2" style={{ color: "#00ff88" }}>VOLVO ECU</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center"><div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{fN(resumenMes.volvo?.km || 0)}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>KM</div></div>
                <div className="text-center"><div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{resumenMes.volvo?.viajes || 0}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VIAJES</div></div>
              </div>
              <div className="text-center mt-2"><div className="font-space text-[14px] font-bold" style={{ color: resumenMes.volvo?.rend_prom ? getRendColor(resumenMes.volvo.rend_prom) : "#3a6080" }}>{resumenMes.volvo?.rend_prom || "--"} km/L</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>RENDIMIENTO ECU</div></div>
            </div>
            <div className="p-3" style={{ background: "#0a1520", borderTop: "2px solid #ff6b35", borderRadius: 6 }}>
              <div className="font-space text-[9px] font-bold mb-2" style={{ color: "#ff6b35" }}>SIGETRA CARGAS</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center"><div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{fN(resumenMes.sigetra?.litros || 0)}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>LITROS</div></div>
                <div className="text-center"><div className="font-space text-[16px] font-bold" style={{ color: "#ff6b35" }}>{resumenMes.sigetra?.cargas || 0}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CARGAS</div></div>
              </div>
              <div className="text-center mt-2"><div className="font-space text-[14px] font-bold" style={{ color: resumenMes.totales?.rend_cruzado ? getRendColor(resumenMes.totales.rend_cruzado) : "#3a6080" }}>{resumenMes.totales?.rend_cruzado || "--"} km/L</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>REND. CRUZADO</div></div>
            </div>
          </div>

          {/* Combined totals */}
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid #0d2035" }}>
            {[
              { l: "KM TOTAL", v: fN(resumenMes.totales?.km_total || 0), c: "#ffd700" },
              { l: "VIAJES TOTAL", v: resumenMes.totales?.viajes_total || 0, c: "#00d4ff" },
              { l: "REND. CRUZADO", v: `${resumenMes.totales?.rend_cruzado || "--"} km/L`, c: resumenMes.totales?.rend_cruzado ? getRendColor(resumenMes.totales.rend_cruzado) : "#3a6080" },
              { l: "DIAS ACTIVOS", v: resumenMes.totales?.dias_activos || 0, c: "#a855f7" },
            ].map(k => (
              <div key={k.l} className="text-center p-3" style={{ background: "#060d14", border: "1px solid #ffd70020", borderRadius: 6 }}>
                <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
