import { useState, useMemo, useRef, useEffect } from "react";
import Volvo from "@/pages/volvo";
import Camiones from "@/pages/camiones";
import RankingConductores from "@/pages/ranking-conductores";
import SigetraFusion from "@/pages/sigetra-fusion";
import MicroCargas from "@/pages/micro-cargas";
import Errores from "@/pages/errores";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, RefreshCw, Fuel, Users, TrendingDown, Truck, MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createDarkMap, addInfoWindow, fitBoundsToPoints, isGoogleMapsReady } from "@/lib/google-maps-utils";

type FlotaSub = "envivo" | "conductores" | "combustible";

const FLOTA_TABS: { id: FlotaSub; label: string }[] = [
  { id: "envivo", label: "EN VIVO" },
  { id: "conductores", label: "CONDUCTORES" },
  { id: "combustible", label: "COMBUSTIBLE" },
];

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help ml-1 align-middle">
          <Info className="w-3 h-3" style={{ color: "#3a6080" }} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs font-exo" style={{ background: "#1a2a3a", color: "#ffffff", border: "1px solid #2a4a5a" }}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function AccordionSection({ title, defaultOpen, children, tooltip }: { title: string; defaultOpen?: boolean; children: React.ReactNode; tooltip?: string }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ border: "1px solid #0d2035" }} className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
        style={{ background: "#091018" }}
        data-testid={`accordion-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>{title}</span>
          {tooltip && <InfoTip text={tooltip} />}
        </div>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: "#3a6080" }} /> : <ChevronRight className="w-4 h-4" style={{ color: "#3a6080" }} />}
      </button>
      {open && <div className="p-4" style={{ borderTop: "1px solid #0d2035" }}>{children}</div>}
    </div>
  );
}

function RendimientoTable() {
  const { data: fusion = [] } = useQuery<any[]>({ queryKey: ["/api/datos/fusion"] });

  const trucks = fusion.map((t: any) => {
    const cargas = t.cargas || [];
    const rendVals = cargas.map((c: any) => c.rendimiento).filter((r: any) => r > 0 && r <= 20);
    const rendProm = rendVals.length > 0 ? +(rendVals.reduce((a: number, b: number) => a + b, 0) / rendVals.length).toFixed(2) : 0;
    return { patente: t.patenteReal || t.fleetNum, faena: t.faenaSigetra || "Sin faena", rend: rendProm, cargas: cargas.length };
  }).filter((t: any) => t.cargas > 0).sort((a: any, b: any) => a.rend - b.rend);

  const allRend = trucks.map((t: any) => t.rend).filter((r: number) => r > 0).sort((a: number, b: number) => a - b);
  const p50 = allRend.length > 0 ? allRend[Math.floor(allRend.length * 0.5)] : 0;
  const p75 = allRend.length > 0 ? allRend[Math.floor(allRend.length * 0.75)] : 0;
  const p90 = allRend.length > 0 ? allRend[Math.floor(allRend.length * 0.9)] : 0;

  function getPercentilColor(rend: number) {
    if (rend >= p90) return "#00ff88";
    if (rend >= p75) return "#00d4ff";
    if (rend >= p50) return "#ffcc00";
    return "#ff2244";
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
          P50: {p50.toFixed(2)} | P75: {p75.toFixed(2)} | P90: {p90.toFixed(2)} km/L
        </span>
        <InfoTip text="P90 = el 90% de los camiones rinde menos que este. Significa que esta entre los mejores." />
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #0d2035" }}>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>Camion</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>Faena</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase text-right" style={{ color: "#3a6080" }}>km/L</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase text-right" style={{ color: "#3a6080" }}>Cargas</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>Nivel</th>
            </tr>
          </thead>
          <tbody>
            {trucks.slice(0, 50).map((t: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}
                className="hover:bg-[rgba(0,212,255,0.02)] transition-colors"
                data-testid={`rend-row-${i}`}>
                <td className="py-2 px-3 font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{t.patente}</td>
                <td className="py-2 px-3 font-exo text-xs" style={{ color: "#3a6080" }}>{t.faena}</td>
                <td className="py-2 px-3 font-space text-[11px] font-bold text-right" style={{ color: getPercentilColor(t.rend) }}>{t.rend > 0 ? t.rend.toFixed(2) : "N/D"}</td>
                <td className="py-2 px-3 font-exo text-xs text-right" style={{ color: "#3a6080" }}>{t.cargas}</td>
                <td className="py-2 px-3">
                  <span className="font-space text-xs font-bold px-2 py-0.5" style={{
                    color: getPercentilColor(t.rend),
                    border: `1px solid ${getPercentilColor(t.rend)}40`,
                    background: `${getPercentilColor(t.rend)}10`,
                  }}>
                    {t.rend >= p90 ? "P90+" : t.rend >= p75 ? "P75+" : t.rend >= p50 ? "P50+" : "<P50"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FUEL_STATIONS: Record<string, { lat: number; lng: number; ciudad: string }> = {
  "QUILICURA": { lat: -33.3583, lng: -70.7250, ciudad: "Santiago" },
  "PANAM. NORTE KM 86.1": { lat: -33.2480, lng: -70.7170, ciudad: "Lampa" },
  "CARRETERA PANAMERICANA NORTE KM 90": { lat: -33.2350, lng: -70.7100, ciudad: "Lampa" },
  "CARRETERA PANAMERICANA NORTE KM. 10": { lat: -33.3890, lng: -70.6650, ciudad: "Renca" },
  "PANAM. NORTE KM.108": { lat: -33.1850, lng: -70.7280, ciudad: "Tiltil" },
  "RUTA 60-C 4, SECTOR 3 ESQUINAS": { lat: -32.8350, lng: -70.6120, ciudad: "Los Andes" },
  "LOS ANGELES 3": { lat: -37.4695, lng: -72.3538, ciudad: "Los Angeles" },
  "PANAMERICANA NORTE, CRUCE CAMINO HU": { lat: -33.32, lng: -70.73, ciudad: "Huechuraba" },
  "RUTA 5 SUR KM 906": { lat: -40.57, lng: -73.13, ciudad: "Osorno" },
  "CARRETERA PANAMERICANA NORTE KM 455": { lat: -30.40, lng: -70.98, ciudad: "La Serena" },
  "CARRETERA LONGITUDINAL SUR KM 275,3": { lat: -35.84, lng: -71.69, ciudad: "Linares" },
};

function AngloMapView({ camiones, conductores, subfaena }: { camiones: any[]; conductores: any[]; subfaena: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<any>(null);

  useEffect(() => {
    if (!mapRef.current || !isGoogleMapsReady()) return;
    if (mapInstance.current) return;
    mapInstance.current = createDarkMap(mapRef.current, { center: { lat: -33.35, lng: -70.72 }, zoom: 10 });
    return () => { mapInstance.current = null; };
  }, [subfaena]);

  useEffect(() => {
    if (!mapInstance.current || !isGoogleMapsReady()) return;
    const map = mapInstance.current;

    markersRef.current.forEach((m: any) => { if (m.setMap) m.setMap(null); else if (m.map !== undefined) m.map = null; });
    markersRef.current = [];

    const stationAgg: Record<string, { cargas: number; litros: number; patentes: Set<string>; lat: number; lng: number; ciudad: string }> = {};
    const truckLastStation: Record<string, string> = {};
    for (const cond of conductores) {
      if (!cond.cargasDetalle) continue;
      for (const cg of cond.cargasDetalle) {
        const lugar = cg.lugar || "";
        const st = FUEL_STATIONS[lugar];
        if (!st) continue;
        if (!stationAgg[lugar]) stationAgg[lugar] = { cargas: 0, litros: 0, patentes: new Set(), lat: st.lat, lng: st.lng, ciudad: st.ciudad };
        stationAgg[lugar].cargas++;
        stationAgg[lugar].litros += cg.litros || 0;
        if (cg.patente) { stationAgg[lugar].patentes.add(cg.patente); if (!truckLastStation[cg.patente]) truckLastStation[cg.patente] = lugar; }
      }
    }

    const trucksWithRend = camiones.filter(c => c.rendimientoSigetra > 0 && c.rendimientoSigetra < 100);
    const rendValues = trucksWithRend.map(c => c.rendimientoSigetra).sort((a: number, b: number) => a - b);
    const p25 = rendValues.length > 0 ? rendValues[Math.floor(rendValues.length * 0.25)] : 2.5;
    const p75 = rendValues.length > 0 ? rendValues[Math.floor(rendValues.length * 0.75)] : 3.5;

    const allPoints: { lat: number; lng: number }[] = [];

    for (const [nombre, d] of Object.entries(stationAgg)) {
      const size = Math.min(30, Math.max(14, Math.sqrt(d.cargas) * 6));
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:${size}px;height:${size}px;background:radial-gradient(circle, #ff660080, #ff660020);border:2px solid #ff6600;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px #ff660040;cursor:pointer;"><svg width="${size*0.5}" height="${size*0.5}" viewBox="0 0 24 24" fill="none" stroke="#ff6600" stroke-width="2"><path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16"/><path d="M15 22V10l4-2v10"/><path d="M7 10h4"/></svg></div>`;
      const popupContent = `<div style="font-family:monospace;font-size:11px;min-width:180px;"><div style="font-weight:bold;color:#ff6600;font-size:12px;margin-bottom:6px;">${nombre}</div><div style="font-size:10px;color:#888;margin-bottom:4px;">${d.ciudad}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;"><span style="color:#888;">Cargas:</span><span style="font-weight:bold;">${d.cargas}</span><span style="color:#888;">Litros:</span><span style="font-weight:bold;">${Math.round(d.litros).toLocaleString()}</span><span style="color:#888;">Camiones:</span><span style="font-weight:bold;">${d.patentes.size}</span></div></div>`;
      if (google.maps.marker?.AdvancedMarkerElement) {
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: d.lat, lng: d.lng }, content: el });
        addInfoWindow(map, marker, popupContent);
        markersRef.current.push(marker);
      } else {
        const marker = new google.maps.Marker({ map, position: { lat: d.lat, lng: d.lng } });
        addInfoWindow(map, marker, popupContent);
        markersRef.current.push(marker);
      }
      allPoints.push({ lat: d.lat, lng: d.lng });
    }

    const truckPositions: Array<{ patente: string; lat: number; lng: number; rend: number; litros: number }> = [];
    for (const c of trucksWithRend) {
      const lastStation = truckLastStation[c.patente];
      if (!lastStation) continue;
      const st = FUEL_STATIONS[lastStation];
      if (!st) continue;
      const jitter = () => (Math.random() - 0.5) * 0.015;
      truckPositions.push({ patente: c.patente, lat: st.lat + jitter(), lng: st.lng + jitter(), rend: c.rendimientoSigetra, litros: c.litrosSigetra });
    }

    for (const t of truckPositions) {
      const color = t.rend >= p75 ? "#00c97a" : t.rend >= p25 ? "#ffcc00" : "#ff2244";
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:10px;height:10px;background:${color};border:1.5px solid ${color};border-radius:2px;box-shadow:0 0 4px ${color}60;cursor:pointer;" title="${t.patente}: ${t.rend.toFixed(2)} km/L"></div>`;
      const popupContent = `<div style="font-family:monospace;font-size:11px;min-width:140px;"><div style="font-weight:bold;color:${color};font-size:13px;margin-bottom:4px;">${t.patente}</div><div style="font-size:11px;"><span style="color:#888;">Rend:</span> <span style="color:${color};font-weight:bold;">${t.rend.toFixed(2)} km/L</span></div><div style="font-size:11px;"><span style="color:#888;">Litros:</span> <span>${Math.round(t.litros).toLocaleString()} L</span></div></div>`;
      if (google.maps.marker?.AdvancedMarkerElement) {
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: t.lat, lng: t.lng }, content: el });
        marker.addListener("click", () => setSelectedTruck(t));
        addInfoWindow(map, marker, popupContent);
        markersRef.current.push(marker);
      } else {
        const marker = new google.maps.Marker({ map, position: { lat: t.lat, lng: t.lng } });
        marker.addListener("click", () => setSelectedTruck(t));
        addInfoWindow(map, marker, popupContent);
        markersRef.current.push(marker);
      }
      allPoints.push({ lat: t.lat, lng: t.lng });
    }

    fitBoundsToPoints(map, allPoints, 40);
  }, [camiones, conductores, subfaena]);

  const stats = useMemo(() => {
    const withRend = camiones.filter(c => c.rendimientoSigetra > 0 && c.rendimientoSigetra < 100);
    const criticos = withRend.filter(c => c.rendimientoSigetra < 2.5).length;
    const normales = withRend.filter(c => c.rendimientoSigetra >= 2.5 && c.rendimientoSigetra < 3.5).length;
    const buenos = withRend.filter(c => c.rendimientoSigetra >= 3.5).length;
    const stationSet = new Set<string>();
    conductores.forEach((cond: any) => cond.cargasDetalle?.forEach((cg: any) => { if (cg.lugar && FUEL_STATIONS[cg.lugar]) stationSet.add(cg.lugar); }));
    return { criticos, normales, buenos, estaciones: stationSet.size };
  }, [camiones, conductores]);

  return (
    <div data-testid="anglo-map-view">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#ff2244" }} />
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Critico &lt;2.5 ({stats.criticos})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#ffcc00" }} />
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Normal ({stats.normales})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#00c97a" }} />
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Bueno &gt;3.5 ({stats.buenos})</span>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-3 h-3 rounded-full" style={{ border: "2px solid #ff6600", background: "#ff660030" }} />
          <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Estaciones ({stats.estaciones})</span>
        </div>
      </div>
      <div className="relative rounded overflow-hidden" style={{ height: "500px", border: "1px solid #0d2035" }}>
        <div ref={mapRef} className="absolute inset-0" data-testid="anglo-map-container" />
      </div>
    </div>
  );
}

function ContractAngloPanel() {
  const [activeSubfaena, setActiveSubfaena] = useState<string>("todas");
  const [activeTab, setActiveTab] = useState<"resumen" | "conductores" | "cruce" | "mapa">("resumen");

  const subfaenaParam = activeSubfaena === "todas" ? "" : activeSubfaena;
  const { data: cruceData, isLoading: cruceLoading } = useQuery<any>({
    queryKey: ["/api/geo/cruce-mensual", "anglo", subfaenaParam],
    queryFn: async () => {
      const params = new URLSearchParams({ contrato: "ANGLO" });
      if (subfaenaParam) params.set("subfaena", subfaenaParam);
      const res = await fetch(`/api/geo/cruce-mensual?${params}`);
      return res.json();
    },
  });

  const { data: conductoresData, isLoading: condLoading } = useQuery<any>({
    queryKey: ["/api/geo/conductores", "anglo", subfaenaParam],
    queryFn: async () => {
      const params = new URLSearchParams({ contrato: "ANGLO" });
      if (subfaenaParam) params.set("subfaena", subfaenaParam);
      const res = await fetch(`/api/geo/conductores?${params}`);
      return res.json();
    },
  });

  const { data: contracts } = useQuery<any[]>({ queryKey: ["/api/contratos"] });
  const angloContract = contracts?.find(c => c.name === "ANGLO");
  const subfaenas = angloContract?.faenas || [];

  const isLoading = cruceLoading || condLoading;

  const resumen = useMemo(() => {
    if (!cruceData?.camiones) return null;
    const totalLitros = cruceData.totalSigetra || 0;
    const totalCamiones = cruceData.totalCamiones || 0;
    const withRend = cruceData.camiones.filter((c: any) => c.rendimientoSigetra > 0 && c.rendimientoSigetra < 100);
    const rendProm = withRend.length > 0
      ? withRend.reduce((s: number, c: any) => s + c.rendimientoSigetra, 0) / withRend.length
      : 0;
    const criticos = withRend.filter((c: any) => c.rendimientoSigetra < 2.5).length;
    const bajos = withRend.filter((c: any) => c.rendimientoSigetra >= 2.5 && c.rendimientoSigetra < 3.5).length;
    return { totalLitros, totalCamiones, rendProm, criticos, bajos, totalConductores: conductoresData?.totalConductores || 0 };
  }, [cruceData, conductoresData]);

  const [sortCond, setSortCond] = useState<"litros" | "rend_asc" | "rend_desc">("litros");
  const [searchCond, setSearchCond] = useState("");
  const [expandedCond, setExpandedCond] = useState<string | null>(null);

  const filteredConductores = useMemo(() => {
    if (!conductoresData?.conductores) return [];
    let list = conductoresData.conductores;
    if (searchCond) {
      const term = searchCond.toLowerCase();
      list = list.filter((c: any) => c.nombre.toLowerCase().includes(term) || c.camiones.some((p: string) => p.includes(term)));
    }
    if (sortCond === "rend_asc") list = [...list].sort((a: any, b: any) => (a.rendimiento || 999) - (b.rendimiento || 999));
    else if (sortCond === "rend_desc") list = [...list].sort((a: any, b: any) => (b.rendimiento || 0) - (a.rendimiento || 0));
    return list;
  }, [conductoresData, searchCond, sortCond]);

  const [sortCruce, setSortCruce] = useState<"patente" | "rend_asc" | "diff">("patente");
  const sortedCruce = useMemo(() => {
    if (!cruceData?.camiones) return [];
    let list = [...cruceData.camiones];
    if (sortCruce === "rend_asc") list.sort((a: any, b: any) => (a.rendimientoSigetra || 999) - (b.rendimientoSigetra || 999));
    else if (sortCruce === "diff") list.sort((a: any, b: any) => Math.abs(b.diferencia || 0) - Math.abs(a.diferencia || 0));
    return list;
  }, [cruceData, sortCruce]);

  return (
    <div data-testid="anglo-panel">
      <div className="flex items-center gap-2 mb-4">
        <div className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#FF6B35" }}>ANGLOAMERICAN</div>
        <div className="font-exo text-xs px-2 py-0.5 rounded" style={{ background: "#FF6B3515", border: "1px solid #FF6B3530", color: "#FF6B35" }}>
          {angloContract?.camiones || 0} camiones
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        <button onClick={() => setActiveSubfaena("todas")}
          data-testid="btn-subfaena-todas"
          className="px-3 py-1.5 font-exo text-xs font-bold cursor-pointer transition-all rounded"
          style={{
            background: activeSubfaena === "todas" ? "#FF6B3520" : "#0d203530",
            border: `1px solid ${activeSubfaena === "todas" ? "#FF6B35" : "#0d2035"}`,
            color: activeSubfaena === "todas" ? "#FF6B35" : "#3a6080",
          }}>
          TODAS
        </button>
        {subfaenas.map((sf: any) => {
          const shortName = sf.nombre.replace("ANGLO-", "");
          const colors: Record<string, string> = { "CARGAS VARIAS": "#FF6B35", "CAL": "#00C49A", "COCU": "#1A8FFF" };
          const c = colors[shortName] || "#FF6B35";
          return (
            <button key={sf.id} onClick={() => setActiveSubfaena(sf.nombre)}
              data-testid={`btn-subfaena-${sf.id}`}
              className="px-3 py-1.5 font-exo text-xs font-bold cursor-pointer transition-all rounded"
              style={{
                background: activeSubfaena === sf.nombre ? `${c}20` : "#0d203530",
                border: `1px solid ${activeSubfaena === sf.nombre ? c : "#0d2035"}`,
                color: activeSubfaena === sf.nombre ? c : "#3a6080",
              }}>
              {shortName}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#FF6B35" }} />
        </div>
      ) : (
        <>
          {resumen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: "CAMIONES", value: resumen.totalCamiones, icon: Truck, color: "#FF6B35" },
                { label: "LITROS MES", value: resumen.totalLitros.toLocaleString() + " L", icon: Fuel, color: "#00d4ff" },
                { label: "REND PROMEDIO", value: resumen.rendProm > 0 ? resumen.rendProm.toFixed(2) + " km/L" : "N/D", icon: TrendingDown, color: resumen.rendProm >= 3.5 ? "#00c97a" : "#ff2244" },
                { label: "CONDUCTORES", value: resumen.totalConductores, icon: Users, color: "#ffcc00" },
              ].map((kpi, i) => (
                <div key={i} className="p-3 rounded" style={{ background: "#091018", border: "1px solid #0d2035" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                    <span className="font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{kpi.label}</span>
                  </div>
                  <div className="font-space text-[18px] font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                  {kpi.label === "REND PROMEDIO" && resumen.criticos > 0 && (
                    <div className="font-exo text-[11px] mt-1" style={{ color: "#ff2244" }}>
                      {resumen.criticos} criticos (&lt;2.5)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1 mb-4">
            {[
              { id: "resumen" as const, label: "CRUCE CAMIONES" },
              { id: "conductores" as const, label: "CONDUCTORES" },
              { id: "mapa" as const, label: "MAPA" },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                data-testid={`anglo-tab-${t.id}`}
                className="px-4 py-2 font-exo text-xs font-bold tracking-[0.15em] cursor-pointer transition-all border-b-2"
                style={{
                  borderColor: activeTab === t.id ? "#FF6B35" : "transparent",
                  color: activeTab === t.id ? "#FF6B35" : "#3a6080",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "resumen" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                {[
                  { id: "patente" as const, label: "Por patente" },
                  { id: "rend_asc" as const, label: "Peor rend" },
                  { id: "diff" as const, label: "Mayor dif" },
                ].map(s => (
                  <button key={s.id} onClick={() => setSortCruce(s.id)}
                    data-testid={`btn-sort-cruce-${s.id}`}
                    className="font-exo text-xs font-bold px-2.5 py-1 rounded cursor-pointer transition-all"
                    style={{
                      background: sortCruce === s.id ? "#FF6B3515" : "#0d203530",
                      border: `1px solid ${sortCruce === s.id ? "#FF6B35" : "#0d2035"}`,
                      color: sortCruce === s.id ? "#FF6B35" : "#3a6080",
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="rounded overflow-hidden" style={{ border: "1px solid #0d2035" }}>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "#0d203540" }}>
                        {["Cam", "Conductores", "Cargas", "Litros Sig", "Km Odo", "Rend km/L", "Litros ECU", "Dif L"].map(h => (
                          <th key={h} className="py-2 px-2 font-exo text-[11px] tracking-wider uppercase text-left" style={{ color: "#3a6080" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCruce.map((c: any) => (
                        <tr key={c.patente} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}
                          className="hover:bg-[rgba(255,107,53,0.03)] transition-colors"
                          data-testid={`anglo-cruce-${c.patente}`}>
                          <td className="py-2 px-2 font-space text-[11px] font-bold" style={{ color: "#FF6B35" }}>{c.patente}</td>
                          <td className="py-2 px-2 font-exo text-xs" style={{ color: "#c8e8ff" }}>
                            {c.conductores?.slice(0, 2).join(", ") || "-"}
                          </td>
                          <td className="py-2 px-2 font-space text-xs text-center" style={{ color: "#3a6080" }}>{c.cargasSigetra}</td>
                          <td className="py-2 px-2 font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>
                            {c.litrosSigetra > 0 ? c.litrosSigetra.toLocaleString() : "-"}
                          </td>
                          <td className="py-2 px-2 font-space text-xs" style={{ color: "#c8e8ff" }}>
                            {c.kmOdometro > 0 ? c.kmOdometro.toLocaleString() : "-"}
                          </td>
                          <td className="py-2 px-2 font-space text-[11px] font-bold" style={{
                            color: c.rendimientoSigetra >= 3.5 ? "#00c97a" : c.rendimientoSigetra >= 2.5 ? "#ffcc00" : c.rendimientoSigetra > 0 ? "#ff2244" : "#3a6080",
                          }}>
                            {c.rendimientoSigetra > 0 ? c.rendimientoSigetra.toFixed(2) : "-"}
                          </td>
                          <td className="py-2 px-2 font-space text-xs" style={{ color: "#3a6080" }}>
                            {c.litrosEcu > 0 ? c.litrosEcu.toLocaleString() : "-"}
                          </td>
                          <td className="py-2 px-2 font-space text-[11px] font-bold" style={{
                            color: Math.abs(c.diferencia) > 500 ? "#ff2244" : Math.abs(c.diferencia) > 100 ? "#ffcc00" : "#3a6080",
                          }}>
                            {c.diferencia !== 0 ? (c.diferencia > 0 ? "+" : "") + c.diferencia.toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "conductores" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="font-exo text-xs px-2 py-0.5 rounded" style={{ background: "#FF6B3515", border: "1px solid #FF6B3530", color: "#FF6B35" }}>
                    {conductoresData?.totalConductores || 0} conductores
                  </div>
                  <div className="flex gap-1">
                    {([
                      { id: "litros" as const, label: "Mas litros" },
                      { id: "rend_asc" as const, label: "Peor rend" },
                      { id: "rend_desc" as const, label: "Mejor rend" },
                    ]).map(s => (
                      <button key={s.id} onClick={() => setSortCond(s.id)}
                        data-testid={`btn-sort-cond-${s.id}`}
                        className="font-exo text-xs font-bold px-2.5 py-1 rounded cursor-pointer transition-all"
                        style={{
                          background: sortCond === s.id ? (s.id === "rend_asc" ? "#ff224420" : s.id === "rend_desc" ? "#00c97a20" : "#FF6B3515") : "#0d203530",
                          border: `1px solid ${sortCond === s.id ? (s.id === "rend_asc" ? "#ff2244" : s.id === "rend_desc" ? "#00c97a" : "#FF6B35") : "#0d2035"}`,
                          color: sortCond === s.id ? (s.id === "rend_asc" ? "#ff2244" : s.id === "rend_desc" ? "#00c97a" : "#FF6B35") : "#3a6080",
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input type="text" value={searchCond} onChange={e => setSearchCond(e.target.value)}
                  placeholder="Buscar conductor..." data-testid="input-search-anglo-conductor"
                  className="pl-3 pr-3 py-1.5 rounded font-exo text-[11px]"
                  style={{ background: "#0d203550", border: "1px solid #0d2035", color: "#c8e8ff", width: "200px" }} />
              </div>
              <div className="rounded overflow-hidden max-h-[500px] overflow-y-auto" style={{ border: "1px solid #0d2035" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "#0d203540" }}>
                      {["Conductor", "Camiones", "Cargas", "Litros", "Km", "Rend km/L"].map(h => (
                        <th key={h} className="py-2 px-2 font-exo text-[11px] tracking-wider uppercase text-left sticky top-0" style={{ color: "#3a6080", background: "#0a1520" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConductores.map((c: any) => (
                      <tr key={c.nombre} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}
                        className="hover:bg-[rgba(255,107,53,0.03)] transition-colors cursor-pointer"
                        onClick={() => setExpandedCond(expandedCond === c.nombre ? null : c.nombre)}
                        data-testid={`anglo-cond-${c.nombre}`}>
                        <td className="py-2 px-2 font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</td>
                        <td className="py-2 px-2">
                          <div className="flex gap-1 flex-wrap">
                            {c.camiones.map((p: string) => (
                              <span key={p} className="font-space text-[11px] px-1.5 py-0.5 rounded" style={{ background: "#FF6B3515", color: "#FF6B35", border: "1px solid #FF6B3530" }}>{p}</span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-2 font-space text-xs" style={{ color: "#3a6080" }}>{c.cargas}</td>
                        <td className="py-2 px-2 font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{c.litrosTotales.toLocaleString()}</td>
                        <td className="py-2 px-2 font-space text-xs" style={{ color: "#c8e8ff" }}>{c.kmTotales > 0 ? c.kmTotales.toLocaleString() : "-"}</td>
                        <td className="py-2 px-2 font-space text-[11px] font-bold" style={{
                          color: c.rendimiento >= 3.5 ? "#00c97a" : c.rendimiento > 0 ? "#ff2244" : "#3a6080",
                        }}>
                          {c.rendimiento > 0 ? c.rendimiento.toFixed(2) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "mapa" && (
            <AngloMapView
              camiones={cruceData?.camiones || []}
              conductores={conductoresData?.conductores || []}
              subfaena={activeSubfaena}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function Flota({ initialSub }: { initialSub?: string }) {
  const [activeSub, setActiveSub] = useState<FlotaSub>((initialSub as FlotaSub) || "envivo");
  const [vistaEnVivo, setVistaEnVivo] = useState<"telemetria" | "camiones">("telemetria");
  const [activeContract, setActiveContract] = useState<string>("ANGLO-COCU");
  const [soloVolvo, setSoloVolvo] = useState<boolean>(true);

  const { data: contracts } = useQuery<any[]>({ queryKey: ["/api/contratos", soloVolvo ? "volvo" : "all"], queryFn: () => fetch(`/api/contratos${soloVolvo ? "?soloVolvo=true" : ""}`).then(r => r.json()) });
  const { data: microData } = useQuery<any>({ queryKey: ["/api/datos/micro-cargas"] });
  const microBadge = (microData?.totals?.criticos || 0) + (microData?.totals?.sospechosos || 0);

  const totalCamiones = useMemo(() => (contracts || []).reduce((s: number, c: any) => s + (c.camiones || 0), 0), [contracts]);

  const contractColors: Record<string, string> = { "ANGLO-COCU": "#00ff88", "ANGLO-CAL": "#ff6b35", "ANGLO-CARGAS VARIAS": "#00d4ff", ANGLO: "#00ff88" };
  const contractIcons: Record<string, string> = { "ANGLO-COCU": "mineria", "ANGLO-CAL": "mineria", "ANGLO-CARGAS VARIAS": "logistica", ANGLO: "mineria" };

  return (
    <div data-testid="page-flota">
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Truck className="w-4 h-4" style={{ color: "#00d4ff" }} />
            <span className="font-space text-[13px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
              FLOTA SOTRASER
            </span>
            <span className="font-exo text-xs px-2 py-0.5 rounded" style={{ background: "#00d4ff10", border: "1px solid #00d4ff25", color: "#00d4ff" }}>
              {totalCamiones} camiones {soloVolvo ? "Volvo Connect" : "totales"}
            </span>
          </div>
          <button
            onClick={() => setSoloVolvo(!soloVolvo)}
            data-testid="toggle-solo-volvo"
            className="flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer font-exo text-xs font-bold tracking-wider transition-all"
            style={{
              background: soloVolvo ? "rgba(0,212,255,0.12)" : "rgba(58,96,128,0.15)",
              border: `1px solid ${soloVolvo ? "#00d4ff" : "#3a6080"}`,
              color: soloVolvo ? "#00d4ff" : "#3a6080",
            }}
          >
            <div className="w-3 h-3 rounded-sm flex items-center justify-center" style={{
              background: soloVolvo ? "#00d4ff" : "transparent",
              border: `1px solid ${soloVolvo ? "#00d4ff" : "#3a6080"}`,
            }}>
              {soloVolvo && <span style={{ color: "#020508", fontSize: 11, fontWeight: "bold" }}>V</span>}
            </div>
            SOLO VOLVO CONNECT
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!contracts && (
            <>
              {[0, 1].map(i => (
                <div key={i} className="p-4 animate-pulse" style={{ background: "#091018", border: "1px solid #0d2035" }}>
                  <div className="h-3 w-24 rounded mb-3" style={{ background: "#0d2035" }} />
                  <div className="h-6 w-12 rounded" style={{ background: "#0d2035" }} />
                </div>
              ))}
            </>
          )}
          {(contracts || []).map(c => {
            const col = contractColors[c.name] || "#00d4ff";
            const isActive = activeContract === c.name;
            return (
              <button key={c.name} onClick={() => setActiveContract(c.name)}
                data-testid={`contract-tab-${c.name}`}
                className="relative p-4 cursor-pointer transition-all text-left group"
                style={{
                  background: isActive ? `${col}08` : "#091018",
                  borderTop: `1px solid ${isActive ? col : "#0d2035"}`,
                  borderRight: `1px solid ${isActive ? col : "#0d2035"}`,
                  borderBottom: `1px solid ${isActive ? col : "#0d2035"}`,
                  borderLeft: `3px solid ${isActive ? col : "#0d203580"}`,
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-space text-[12px] font-bold tracking-[0.1em]" style={{ color: isActive ? col : "#3a6080" }}>
                    {c.name}
                  </span>
                  <span className="font-exo text-[11px] uppercase tracking-wider" style={{ color: "#3a6080" }}>
                    {contractIcons[c.name] || ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[20px] font-bold" style={{ color: isActive ? col : "#c8e8ff" }}>
                    {c.camiones}
                  </span>
                  <span className="font-exo text-xs" style={{ color: "#3a6080" }}>camiones</span>
                </div>
                {isActive && (
                  <div className="absolute bottom-0 left-3 right-3 h-[2px]" style={{ background: col }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeContract === "ANGLO" ? (
        <ContractAngloPanel />
      ) : (
        <>
          <div className="flex items-center gap-1 mb-4 pb-2" style={{ borderBottom: "1px solid #0d2035" }}>
            {FLOTA_TABS.map(t => (
              <button key={t.id} onClick={() => setActiveSub(t.id)}
                data-testid={`flota-tab-${t.id}`}
                className={`px-4 py-2 font-exo text-xs font-bold tracking-[0.15em] cursor-pointer transition-all border-b-2 ${
                  activeSub === t.id
                    ? "border-[#00d4ff] text-[#00d4ff]"
                    : "border-transparent text-[#3a6080] hover:text-[#c8e8ff]"
                }`}>
                {t.label}
                {t.id === "combustible" && microBadge > 0 && (
                  <span className="ml-1.5 font-space text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: "#ff2244", color: "#020508" }}>
                    {microBadge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeSub === "envivo" && (
            <div>
              <div className="flex gap-1 mb-3">
                <button onClick={() => setVistaEnVivo("telemetria")}
                  data-testid="envivo-toggle-telemetria"
                  className={`px-3 py-1 font-exo text-[11px] font-bold cursor-pointer border ${
                    vistaEnVivo === "telemetria" ? "bg-[rgba(0,212,255,0.1)] text-[#00d4ff] border-[rgba(0,212,255,0.3)]" : "text-[#3a6080] border-[#0d2035]"
                  }`}>LISTA</button>
                <button onClick={() => setVistaEnVivo("camiones")}
                  data-testid="envivo-toggle-camiones"
                  className={`px-3 py-1 font-exo text-[11px] font-bold cursor-pointer border ${
                    vistaEnVivo === "camiones" ? "bg-[rgba(0,212,255,0.1)] text-[#00d4ff] border-[rgba(0,212,255,0.3)]" : "text-[#3a6080] border-[#0d2035]"
                  }`}>FICHA CAMIONES</button>
              </div>
              {vistaEnVivo === "telemetria" ? <Volvo /> : <Camiones />}
            </div>
          )}

          {activeSub === "conductores" && <RankingConductores />}

          {activeSub === "combustible" && (
            <div className="space-y-0">
              <AccordionSection title="CRUCE SIGETRA-VOLVO" defaultOpen={true}
                tooltip="Comparacion entre lo que cargo el camion segun Sigetra y lo que consumio segun el GPS.">
                <SigetraFusion />
              </AccordionSection>
              <AccordionSection title="CARGAS SOSPECHOSAS"
                tooltip="Carga de poco combustible con senales que podrian indicar desvio. Requiere verificacion.">
                <MicroCargas />
              </AccordionSection>
              <AccordionSection title="RENDIMIENTO">
                <RendimientoTable />
              </AccordionSection>
              <AccordionSection title="CALIDAD DE DATOS">
                <Errores />
              </AccordionSection>
            </div>
          )}
        </>
      )}
    </div>
  );
}
