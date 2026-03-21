import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, Truck, AlertTriangle, MapPin, TrendingUp, Gauge, CheckCircle,
  Clock, BarChart3, Eye, RefreshCw, Target, GitBranch, Shield,
  Fuel, Activity, Radio, Layers, CircleDot, Zap, ChevronDown, ChevronUp, Users
} from "lucide-react";
import DriversTab from "./drivers-tab";

type BrainTab = "mapa" | "reporte" | "aprendizaje" | "drivers";

const PURPLE = "#a855f7";
const BG_CARD = "#091018";
const BG_DEEP = "#020508";
const BORDER = "#0d2035";
const TEXT_MAIN = "#c8e8ff";
const TEXT_MUTED = "#4a7090";
const TEXT_DIM = "#3a6080";
const SUCCESS = "#00ff88";
const ERROR = "#ff2244";
const WARNING = "#ffcc00";
const CYAN = "#00d4ff";

const CONTRACT_COLORS: Record<string, string> = {
  "CENCOSUD": "#00d4ff",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-COCU": "#00ff88",
};

const GEOCERCA_DEFAULT = "#D3D1C7";
const GEOCERCA_ACTIVE = "#1D9E75";
const GEOCERCA_ALERT = "#E24B4A";

function MapaEnVivoTab() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const geocercaLayersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<any>(null);
  const [truckFilter, setTruckFilter] = useState<string>("todos");

  const { data: fleetData, isLoading: fleetLoading } = useQuery<any[]>({
    queryKey: ["/api/volvo/fleet-status"],
    refetchInterval: 30000,
  });

  const { data: camionesData } = useQuery<any[]>({
    queryKey: ["/api/camiones"],
    refetchInterval: 300000,
  });

  const { data: geocercas } = useQuery<any[]>({
    queryKey: ["/api/geo/bases"],
    refetchInterval: 600000,
  });

  const { data: faenas } = useQuery<any[]>({
    queryKey: ["/api/faenas"],
    refetchInterval: 600000,
  });

  const faenaMap = useMemo(() => {
    const m: Record<number, string> = {};
    (faenas || []).forEach((f: any) => { m[f.id] = f.nombre; });
    return m;
  }, [faenas]);

  const camionMap = useMemo(() => {
    const m: Record<string, any> = {};
    (camionesData || []).forEach((c: any) => { if (c.vin) m[c.vin] = c; });
    return m;
  }, [camionesData]);

  const enrichedFleet = useMemo(() => {
    if (!fleetData) return [];
    return fleetData.filter((v: any) => v.gps?.latitude && v.gps?.longitude).map((v: any) => {
      const cam = camionMap[v.vin];
      const contrato = cam ? (faenaMap[cam.faenaId] || "Desconocido") : "Desconocido";
      const color = CONTRACT_COLORS[contrato] || TEXT_MUTED;

      let insideGeocerca: any = null;
      if (geocercas && v.gps.latitude && v.gps.longitude) {
        for (const g of geocercas) {
          const dist = haversine(v.gps.latitude, v.gps.longitude, parseFloat(g.lat), parseFloat(g.lng));
          if (dist <= (g.radioMetros || 3000)) {
            insideGeocerca = g;
            break;
          }
        }
      }

      return {
        ...v,
        patente: cam?.patente || v.vin.slice(-6),
        contrato,
        color,
        insideGeocerca,
        speed: v.gps?.speed || 0,
        fuelPct: v.fuelLevel,
      };
    });
  }, [fleetData, camionMap, faenaMap, geocercas]);

  const filteredFleet = useMemo(() => {
    if (truckFilter === "todos") return enrichedFleet;
    if (truckFilter === "en_geocerca") return enrichedFleet.filter(t => t.insideGeocerca);
    if (truckFilter === "en_movimiento") return enrichedFleet.filter(t => t.speed > 5);
    if (truckFilter === "detenidos") return enrichedFleet.filter(t => t.speed <= 5);
    return enrichedFleet.filter(t => t.contrato === truckFilter);
  }, [enrichedFleet, truckFilter]);

  const stats = useMemo(() => {
    const total = enrichedFleet.length;
    const enGeocerca = enrichedFleet.filter(t => t.insideGeocerca).length;
    const enMovimiento = enrichedFleet.filter(t => t.speed > 5).length;
    const detenidos = total - enMovimiento;
    return { total, enGeocerca, enMovimiento, detenidos };
  }, [enrichedFleet]);

  useEffect(() => {
    if (typeof (window as any).L === "undefined") {
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
        script.onload = () => setMapReady(false);
        document.head.appendChild(script);
      }
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const tryInit = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [-33.45, -70.65],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
      setMapReady(true);
    };

    if ((window as any).L) {
      tryInit();
    } else {
      const interval = setInterval(() => {
        if ((window as any).L) {
          clearInterval(interval);
          tryInit();
        }
      }, 200);
      return () => clearInterval(interval);
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    const L = (window as any).L;
    const map = leafletMapRef.current;

    geocercaLayersRef.current.forEach(l => map.removeLayer(l));
    geocercaLayersRef.current = [];

    if (!geocercas) return;

    const trucksInGeocerca = new Set<string>();
    enrichedFleet.forEach(t => {
      if (t.insideGeocerca) trucksInGeocerca.add(t.insideGeocerca.nombre);
    });

    geocercas.forEach((g: any) => {
      const lat = parseFloat(g.lat);
      const lng = parseFloat(g.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const hasTraffic = trucksInGeocerca.has(g.nombre);
      const fillColor = hasTraffic ? GEOCERCA_ACTIVE : GEOCERCA_DEFAULT;
      const fillOpacity = hasTraffic ? 0.25 : 0.08;
      const borderColor = hasTraffic ? GEOCERCA_ACTIVE : GEOCERCA_DEFAULT;

      const circle = L.circle([lat, lng], {
        radius: g.radioMetros || 3000,
        fillColor,
        fillOpacity,
        color: borderColor,
        weight: 0.5,
        opacity: 0.3,
        className: "geocerca-transition",
      }).addTo(map);

      circle.bindTooltip(g.nombre, {
        permanent: false,
        direction: "top",
        className: "geocerca-tooltip",
        offset: [0, -10],
      });

      geocercaLayersRef.current.push(circle);
    });
  }, [mapReady, geocercas, enrichedFleet]);

  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    const L = (window as any).L;
    const map = leafletMapRef.current;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    filteredFleet.forEach((truck: any) => {
      const statusColor = truck.insideGeocerca
        ? GEOCERCA_ACTIVE
        : truck.speed > 5 ? CYAN : TEXT_MUTED;

      const marker = L.circleMarker([truck.gps.latitude, truck.gps.longitude], {
        radius: 5,
        fillColor: statusColor,
        fillOpacity: 0.9,
        color: statusColor,
        weight: 1.5,
        opacity: 0.6,
      }).addTo(map);

      const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
      const tooltipParts = [
        `<b style="color:${truck.color}">${esc(truck.patente)}</b>`,
        `<span style="color:${TEXT_MUTED}">${esc(truck.contrato)}</span>`,
        `<span style="color:${statusColor}">${truck.speed > 0 ? truck.speed + ' km/h' : 'Detenido'}</span>`,
      ];
      if (truck.insideGeocerca) tooltipParts.push(`<span style="color:${GEOCERCA_ACTIVE}">En: ${esc(truck.insideGeocerca.nombre)}</span>`);
      if (truck.fuelPct != null) tooltipParts.push(`<span style="color:${WARNING}">Combustible: ${truck.fuelPct}%</span>`);

      marker.bindTooltip(
        `<div style="font-family:Space Mono;font-size:10px;color:${TEXT_MAIN};background:${BG_DEEP};border:1px solid ${BORDER};padding:6px 8px;border-radius:2px;line-height:1.6">${tooltipParts.join('<br/>')}</div>`,
        { permanent: false, direction: "top", className: "truck-tooltip", offset: [0, -8] }
      );

      marker.on("click", () => setSelectedTruck(truck));
      markersRef.current.push(marker);
    });
  }, [mapReady, filteredFleet]);

  return (
    <div data-testid="brain-mapa-tab">
      <div className="flex items-center gap-3 mb-3">
        <MapPin className="w-4 h-4" style={{ color: PURPLE }} />
        <span className="font-space text-[13px] font-bold tracking-wider" style={{ color: TEXT_MAIN }}>MAPA EN VIVO</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {[
            { id: "todos", label: "TODOS", count: stats.total },
            { id: "en_movimiento", label: "MOVIMIENTO", count: stats.enMovimiento },
            { id: "detenidos", label: "DETENIDOS", count: stats.detenidos },
            { id: "en_geocerca", label: "EN GEOCERCA", count: stats.enGeocerca },
          ].map(f => (
            <button key={f.id} onClick={() => setTruckFilter(f.id)}
              className="flex items-center gap-1 px-2 py-1 cursor-pointer transition-all"
              style={{
                background: truckFilter === f.id ? `${PURPLE}10` : "transparent",
                border: `1px solid ${truckFilter === f.id ? `${PURPLE}40` : BORDER}`,
              }} data-testid={`filter-${f.id}`}>
              <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: truckFilter === f.id ? PURPLE : TEXT_DIM }}>{f.label}</span>
              <span className="font-space text-[9px] font-bold" style={{ color: truckFilter === f.id ? PURPLE : TEXT_MUTED }}>{f.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 py-1" style={{ background: `${SUCCESS}10`, border: `1px solid ${SUCCESS}30` }}>
          <Radio className="w-3 h-3" style={{ color: SUCCESS }} />
          <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: SUCCESS }}>ACTUALIZA CADA 30s</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="rounded px-3 py-2 flex items-center gap-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <Truck className="w-4 h-4" style={{ color: CYAN }} />
          <div>
            <div className="font-space text-[18px] font-bold" style={{ color: CYAN }}>{stats.total}</div>
            <div className="font-exo text-[7px] font-bold tracking-wider" style={{ color: TEXT_DIM }}>CON GPS</div>
          </div>
        </div>
        <div className="rounded px-3 py-2 flex items-center gap-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <Activity className="w-4 h-4" style={{ color: SUCCESS }} />
          <div>
            <div className="font-space text-[18px] font-bold" style={{ color: SUCCESS }}>{stats.enMovimiento}</div>
            <div className="font-exo text-[7px] font-bold tracking-wider" style={{ color: TEXT_DIM }}>EN MOVIMIENTO</div>
          </div>
        </div>
        <div className="rounded px-3 py-2 flex items-center gap-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <CircleDot className="w-4 h-4" style={{ color: WARNING }} />
          <div>
            <div className="font-space text-[18px] font-bold" style={{ color: WARNING }}>{stats.detenidos}</div>
            <div className="font-exo text-[7px] font-bold tracking-wider" style={{ color: TEXT_DIM }}>DETENIDOS</div>
          </div>
        </div>
        <div className="rounded px-3 py-2 flex items-center gap-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <MapPin className="w-4 h-4" style={{ color: GEOCERCA_ACTIVE }} />
          <div>
            <div className="font-space text-[18px] font-bold" style={{ color: GEOCERCA_ACTIVE }}>{stats.enGeocerca}</div>
            <div className="font-exo text-[7px] font-bold tracking-wider" style={{ color: TEXT_DIM }}>EN GEOCERCA</div>
          </div>
        </div>
      </div>

      <div className="relative rounded overflow-hidden" style={{ height: "520px", border: `1px solid ${BORDER}` }}>
        {fleetLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: "rgba(2,5,8,0.8)" }}>
            <RefreshCw className="w-6 h-6 animate-spin" style={{ color: PURPLE }} />
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} data-testid="leaflet-map-brain" />

        {selectedTruck && (
          <div className="absolute bottom-3 left-3 z-20 rounded px-4 py-3 max-w-[320px]" style={{ background: BG_DEEP, border: `1px solid ${BORDER}` }} data-testid="truck-detail-panel">
            <button onClick={() => setSelectedTruck(null)} className="absolute top-2 right-2 cursor-pointer" style={{ color: TEXT_DIM }}>x</button>
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4" style={{ color: selectedTruck.color }} />
              <span className="font-space text-[13px] font-bold" style={{ color: selectedTruck.color }}>{selectedTruck.patente}</span>
              <span className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>{selectedTruck.contrato}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded px-2 py-1.5" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
                <div className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>VELOCIDAD</div>
                <div className="font-space text-[13px] font-bold" style={{ color: selectedTruck.speed > 5 ? SUCCESS : WARNING }}>{selectedTruck.speed} km/h</div>
              </div>
              <div className="rounded px-2 py-1.5" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
                <div className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>COMBUSTIBLE</div>
                <div className="font-space text-[13px] font-bold" style={{ color: (selectedTruck.fuelPct ?? 0) < 20 ? ERROR : SUCCESS }}>
                  {selectedTruck.fuelPct != null ? `${selectedTruck.fuelPct}%` : "S/D"}
                </div>
              </div>
            </div>
            {selectedTruck.insideGeocerca && (
              <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded" style={{ background: `${GEOCERCA_ACTIVE}10`, border: `1px solid ${GEOCERCA_ACTIVE}30` }}>
                <MapPin className="w-3 h-3" style={{ color: GEOCERCA_ACTIVE }} />
                <span className="font-rajdhani text-[10px]" style={{ color: GEOCERCA_ACTIVE }}>En geocerca: {selectedTruck.insideGeocerca.nombre}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: GEOCERCA_DEFAULT, opacity: 0.5 }} />
          <span className="font-exo text-[8px] tracking-wider" style={{ color: TEXT_DIM }}>GEOCERCA VACIA</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: GEOCERCA_ACTIVE }} />
          <span className="font-exo text-[8px] tracking-wider" style={{ color: TEXT_DIM }}>CON CAMION DENTRO</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: CYAN }} />
          <span className="font-exo text-[8px] tracking-wider" style={{ color: TEXT_DIM }}>EN MOVIMIENTO</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: TEXT_MUTED }} />
          <span className="font-exo text-[8px] tracking-wider" style={{ color: TEXT_DIM }}>DETENIDO</span>
        </div>
      </div>
    </div>
  );
}

function ReporteDelDiaTab() {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/cerebro/estado-general"], refetchInterval: 120000 });
  const { data: alertas } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 120000 });
  const { data: estaciones } = useQuery<any>({ queryKey: ["/api/estaciones/analisis"], refetchInterval: 300000 });
  const { data: rendimiento } = useQuery<any[]>({ queryKey: ["/api/geo/rendimiento-contratos"], refetchInterval: 300000 });
  const { data: fleetData } = useQuery<any[]>({ queryKey: ["/api/volvo/fleet-status"], refetchInterval: 60000 });
  const { data: camionesData } = useQuery<any[]>({ queryKey: ["/api/camiones"], refetchInterval: 300000 });
  const { data: faenas } = useQuery<any[]>({ queryKey: ["/api/faenas"], refetchInterval: 600000 });

  const contratos = estado?.por_contrato || [];
  const criticos = alertas?.filter((a: any) => a.severidad === "CRITICA").length || 0;

  const faenaMap = useMemo(() => {
    const m: Record<number, string> = {};
    (faenas || []).forEach((f: any) => { m[f.id] = f.nombre; });
    return m;
  }, [faenas]);

  const camionMap = useMemo(() => {
    const m: Record<string, any> = {};
    (camionesData || []).forEach((c: any) => { if (c.vin) m[c.vin] = c; });
    return m;
  }, [camionesData]);

  const fleetByContract = useMemo(() => {
    const result: Record<string, { total: number; conGps: number; enMovimiento: number }> = {};
    (fleetData || []).forEach((v: any) => {
      const cam = camionMap[v.vin];
      const contrato = cam ? (faenaMap[cam.faenaId] || "Otros") : "Otros";
      if (!result[contrato]) result[contrato] = { total: 0, conGps: 0, enMovimiento: 0 };
      result[contrato].total++;
      if (v.gps?.latitude) result[contrato].conGps++;
      if ((v.gps?.speed || 0) > 5) result[contrato].enMovimiento++;
    });
    return result;
  }, [fleetData, camionMap, faenaMap]);

  const todasCargas = useMemo(() => {
    return (estaciones?.estaciones || []).flatMap((e: any) => (e.cargas || []).map((c: any) => ({ ...c, estacion: e.nombre })));
  }, [estaciones]);
  const anomalas = todasCargas.filter((c: any) => c.nivel_alerta !== "NORMAL");

  const hoy = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div data-testid="brain-reporte-tab">
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 className="w-4 h-4" style={{ color: PURPLE }} />
        <span className="font-space text-[13px] font-bold tracking-wider" style={{ color: TEXT_MAIN }}>REPORTE DEL DIA</span>
        <span className="font-rajdhani text-[11px] capitalize" style={{ color: TEXT_MUTED }}>{hoy}</span>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-4">
        <StatCard label="FLOTA TOTAL" value={estado?.total_camiones || 0} color={CYAN} icon={Truck} />
        <StatCard label="ACTIVOS HOY" value={estado?.camiones_activos || 0} sub={`${Math.round(((estado?.camiones_activos || 0) / (estado?.total_camiones || 1)) * 100)}%`} color={SUCCESS} icon={Activity} />
        <StatCard label="KM HOY" value={(estado?.km_hoy || 0).toLocaleString("es-CL")} color={CYAN} icon={Target} />
        <StatCard label="RENDIMIENTO" value={`${estado?.rendimiento_promedio || 0} km/L`} color={WARNING} icon={Gauge} />
        <StatCard label="ALERTAS" value={criticos} sub={`${alertas?.length || 0} totales`} color={criticos > 0 ? ERROR : SUCCESS} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {contratos.map((c: any) => {
          const col = CONTRACT_COLORS[c.contrato] || TEXT_MUTED;
          const fleetInfo = fleetByContract[c.contrato];
          const pct = c.total_camiones > 0 ? Math.round((c.activos / c.total_camiones) * 100) : 0;
          return (
            <div key={c.contrato} className="rounded px-3 py-2.5" style={{ background: BG_CARD, border: `1px solid ${col}20`, borderLeft: `3px solid ${col}` }} data-testid={`reporte-contrato-${c.contrato}`}>
              <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: col }}>{c.contrato}</div>
              <div className="flex items-end gap-2 mb-1.5">
                <span className="font-space text-[20px] font-bold" style={{ color: col }}>{pct}%</span>
                <span className="font-rajdhani text-[10px] pb-0.5" style={{ color: TEXT_MUTED }}>{c.activos}/{c.total_camiones}</span>
              </div>
              <div className="w-full h-1 rounded-full mb-2" style={{ background: BORDER }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col }} />
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="font-rajdhani" style={{ color: TEXT_MUTED }}>{c.rendimiento} km/L</span>
                <span className="font-rajdhani" style={{ color: TEXT_MUTED }}>{(c.km_hoy || 0).toLocaleString("es-CL")} km</span>
              </div>
              {fleetInfo && (
                <div className="flex gap-2 mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <span className="font-space text-[8px]" style={{ color: SUCCESS }}>{fleetInfo.conGps} GPS</span>
                  <span className="font-space text-[8px]" style={{ color: CYAN }}>{fleetInfo.enMovimiento} mov</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Fuel className="w-3.5 h-3.5" style={{ color: "#ff6600" }} />
            <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#ff6600" }}>ANOMALIAS COMBUSTIBLE HOY</span>
            <span className="font-space text-[10px] font-bold ml-auto" style={{ color: anomalas.length > 0 ? ERROR : SUCCESS }}>{anomalas.length}</span>
          </div>
          {anomalas.length === 0 ? (
            <div className="flex items-center gap-2 py-3 justify-center">
              <CheckCircle className="w-4 h-4" style={{ color: SUCCESS }} />
              <span className="font-rajdhani text-[11px]" style={{ color: SUCCESS }}>Sin anomalias detectadas</span>
            </div>
          ) : (
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {anomalas.slice(0, 10).map((c: any, i: number) => {
                const alertColors: Record<string, string> = { CRITICO: ERROR, SOSPECHOSO: "#FF8C00", REVISAR: WARNING };
                const acol = alertColors[c.nivel_alerta] || TEXT_MUTED;
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: BG_DEEP, borderLeft: `2px solid ${acol}` }}>
                    <span className="font-space text-[9px] font-bold" style={{ color: TEXT_MAIN }}>{c.patente}</span>
                    <span className="font-rajdhani text-[9px] truncate flex-1" style={{ color: TEXT_MUTED }}>{c.estacion}</span>
                    <span className="font-space text-[9px] font-bold" style={{ color: "#ff6600" }}>{Math.round(c.litros_sigetra)}L</span>
                    <span className="font-space text-[7px] font-bold px-1 py-0.5" style={{ color: acol, background: `${acol}15`, border: `1px solid ${acol}30` }}>{c.nivel_alerta}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: ERROR }} />
            <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: ERROR }}>ALERTAS CRITICAS</span>
            <span className="font-space text-[10px] font-bold ml-auto" style={{ color: ERROR }}>{criticos}</span>
          </div>
          {criticos === 0 ? (
            <div className="flex items-center gap-2 py-3 justify-center">
              <CheckCircle className="w-4 h-4" style={{ color: SUCCESS }} />
              <span className="font-rajdhani text-[11px]" style={{ color: SUCCESS }}>Sin alertas criticas</span>
            </div>
          ) : (
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {(alertas || []).filter((a: any) => a.severidad === "CRITICA").slice(0, 10).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: BG_DEEP, borderLeft: `2px solid ${ERROR}` }}>
                  <span className="font-space text-[9px] font-bold" style={{ color: TEXT_MAIN }}>{a.patente}</span>
                  <span className="font-rajdhani text-[9px] truncate flex-1" style={{ color: TEXT_MUTED }}>{a.descripcion}</span>
                  <span className="font-rajdhani text-[8px]" style={{ color: TEXT_MUTED }}>{a.contrato}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-3.5 h-3.5" style={{ color: PURPLE }} />
          <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: PURPLE }}>RENDIMIENTO POR CONTRATO</span>
        </div>
        <div className="space-y-2">
          {(rendimiento || []).map((c: any, i: number) => {
            const col = c.color || TEXT_MUTED;
            const metaCumplida = c.rendimiento_promedio >= c.meta_kmL;
            return (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: BG_DEEP, border: `1px solid ${BORDER}` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: col }} />
                <span className="font-space text-[10px] font-bold tracking-wider w-[160px]" style={{ color: col }}>{c.nombre}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: BORDER }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min((c.rendimiento_promedio / Math.max(c.meta_kmL, 1)) * 100, 150)}%`, background: metaCumplida ? SUCCESS : ERROR, maxWidth: "100%" }} />
                </div>
                <span className="font-space text-[10px] font-bold w-[60px] text-right" style={{ color: metaCumplida ? SUCCESS : ERROR }}>{c.rendimiento_promedio} km/L</span>
                <span className="font-rajdhani text-[9px] w-[60px] text-right" style={{ color: TEXT_MUTED }}>meta {c.meta_kmL}</span>
                {c.bajo_meta?.length > 0 && (
                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: ERROR, background: `${ERROR}15`, border: `1px solid ${ERROR}30` }}>
                    {c.bajo_meta.length} bajo meta
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AprendizajeTab() {
  const { data: sistemaEstado } = useQuery<any>({ queryKey: ["/api/sistema/estado"], refetchInterval: 300000 });
  const { data: aprendizaje } = useQuery<any>({ queryKey: ["/api/estaciones/aprendizaje"], refetchInterval: 300000 });
  const { data: parametros } = useQuery<any>({ queryKey: ["/api/aprendizaje/parametros"], refetchInterval: 300000 });
  const { data: alertasAprendizaje } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 300000 });
  const { data: objetivosData } = useQuery<any>({ queryKey: ["/api/aprendizaje/objetivos"], refetchInterval: 300000 });
  const [expandedSection, setExpandedSection] = useState<string | null>("sistema");

  const diasActivo = sistemaEstado?.total_viajes_procesados ? Math.max(Math.ceil((sistemaEstado.total_viajes_procesados || 0) / 50), 1) : 0;
  const enObservacion = diasActivo < 7;

  const toggleSection = (s: string) => setExpandedSection(expandedSection === s ? null : s);

  return (
    <div data-testid="brain-aprendizaje-tab">
      <div className="flex items-center gap-3 mb-4">
        <Brain className="w-4 h-4" style={{ color: PURPLE }} />
        <span className="font-space text-[13px] font-bold tracking-wider" style={{ color: TEXT_MAIN }}>APRENDIZAJE AUTONOMO</span>
        <div className="flex items-center gap-2 ml-auto px-3 py-1" style={{ background: `${PURPLE}10`, border: `1px solid ${PURPLE}30` }}>
          <Brain className="w-3 h-3" style={{ color: PURPLE }} />
          <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: PURPLE }}>
            MADUREZ: {sistemaEstado?.madurez_pct || 0}%
          </span>
          <div className="w-16 h-1 rounded-full" style={{ background: BORDER }}>
            <div className="h-full rounded-full" style={{ width: `${sistemaEstado?.madurez_pct || 0}%`, background: PURPLE }} />
          </div>
        </div>
      </div>

      {enObservacion && (
        <div className="rounded px-4 py-3 mb-4 flex items-center gap-3" style={{ background: `${WARNING}08`, border: `1px solid ${WARNING}30` }} data-testid="observacion-banner">
          <Eye className="w-5 h-5" style={{ color: WARNING }} />
          <div>
            <div className="font-space text-[11px] font-bold" style={{ color: WARNING }}>MODO OBSERVACION (Dia {diasActivo}/7)</div>
            <div className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>
              El sistema esta acumulando comportamiento real sin generar alertas. Los umbrales se calcularan automaticamente al completar 7 dias de datos.
            </div>
          </div>
          <div className="w-20 h-1.5 rounded-full ml-auto" style={{ background: BORDER }}>
            <div className="h-full rounded-full" style={{ width: `${(diasActivo / 7) * 100}%`, background: WARNING }} />
          </div>
        </div>
      )}

      <CollapsibleSection
        title="ESTADO DEL SISTEMA"
        icon={Target}
        color={PURPLE}
        expanded={expandedSection === "sistema"}
        onToggle={() => toggleSection("sistema")}
        testId="section-sistema"
      >
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="VIAJES PROCESADOS" value={sistemaEstado?.total_viajes_procesados || 0} color={CYAN} icon={Target} />
          <StatCard label="CORREDORES" value={sistemaEstado?.total_corredores_conocidos || 0} color={SUCCESS} icon={GitBranch} />
          <StatCard label="CONFIANZA" value={sistemaEstado?.confianza_global || "--"} color={sistemaEstado?.confianza_global === "ALTA" ? SUCCESS : WARNING} icon={Shield} />
          <StatCard label="PATRONES" value={aprendizaje?.total_patrones || 0} sub={`${aprendizaje?.camiones_con_patron || 0} camiones`} color={PURPLE} icon={Brain} />
        </div>
        <div className="font-rajdhani text-[10px] mt-2 px-1" style={{ color: TEXT_MUTED }}>{sistemaEstado?.estado_mensaje || ""}</div>
      </CollapsibleSection>

      <CollapsibleSection
        title="UMBRALES APRENDIDOS"
        icon={Layers}
        color="#ff6600"
        expanded={expandedSection === "umbrales"}
        onToggle={() => toggleSection("umbrales")}
        testId="section-umbrales"
      >
        <div className="font-rajdhani text-[10px] mb-3" style={{ color: TEXT_MUTED }}>
          El sistema calcula automaticamente umbrales usando percentil 75 (normal) y percentil 90 (alerta) del comportamiento historico. Se recalibra cada 7 dias con los ultimos 30 dias.
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {(["BAJA", "MEDIA", "ALTA", "EXPERTA"] as const).map(nivel => {
            const colores: Record<string, string> = { EXPERTA: SUCCESS, ALTA: CYAN, MEDIA: WARNING, BAJA: TEXT_MUTED };
            const count = aprendizaje?.patrones_por_confianza?.[nivel] || 0;
            return (
              <div key={nivel} className="rounded px-3 py-2 text-center" style={{ background: BG_DEEP, border: `1px solid ${colores[nivel]}20` }}>
                <div className="font-space text-[18px] font-bold" style={{ color: colores[nivel] }}>{count}</div>
                <div className="font-exo text-[7px] font-bold tracking-wider" style={{ color: colores[nivel] }}>{nivel}</div>
              </div>
            );
          })}
        </div>

        <div className="rounded px-3 py-2" style={{ background: BG_DEEP, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: SUCCESS }} />
              <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>NORMAL (Z ≤ 1.0)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: WARNING }} />
              <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>REVISAR (1.0 &lt; Z ≤ 1.5)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: "#FF8C00" }} />
              <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>ANOMALIA (1.5 &lt; Z ≤ 2.0)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: ERROR }} />
              <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>CRITICO (Z &gt; 2.0)</span>
            </div>
          </div>
          <div className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>
            Z-Score = (valor_observado - media_historica) / desviacion_estandar. El sistema ajusta estos parametros automaticamente basandose en datos reales.
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="COMBUSTIBLE - PATRONES"
        icon={Fuel}
        color="#ff6600"
        expanded={expandedSection === "combustible"}
        onToggle={() => toggleSection("combustible")}
        testId="section-combustible"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-3 h-3" style={{ color: CYAN }} />
              <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: CYAN }}>TOP CAMIONES APRENDIDOS</span>
            </div>
            <div className="space-y-1">
              {(aprendizaje?.top_camiones || []).slice(0, 8).map((cam: any, i: number) => {
                const confianzaColor: Record<string, string> = { EXPERTA: SUCCESS, ALTA: CYAN, MEDIA: WARNING, BAJA: TEXT_MUTED };
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: BG_DEEP, border: `1px solid ${BORDER}` }}>
                    <span className="font-space text-[9px] font-bold" style={{ color: TEXT_MAIN }}>{cam.patente}</span>
                    <span className="font-rajdhani text-[8px] truncate flex-1" style={{ color: TEXT_MUTED }}>{cam.contrato}</span>
                    <span className="font-space text-[8px]" style={{ color: "#ff6600" }}>{Math.round(cam.carga_tipica)}L</span>
                    <span className="font-space text-[7px] font-bold px-1 py-0.5" style={{ color: confianzaColor[cam.confianza], background: `${confianzaColor[cam.confianza]}15` }}>{cam.confianza}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-3 h-3" style={{ color: "#ff6600" }} />
              <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#ff6600" }}>TOP ESTACIONES</span>
            </div>
            <div className="space-y-1">
              {(aprendizaje?.top_estaciones || []).slice(0, 8).map((est: any, i: number) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: BG_DEEP, border: `1px solid ${BORDER}` }}>
                  <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: "#ff6600" }} />
                  <span className="font-space text-[9px] font-bold truncate flex-1" style={{ color: TEXT_MAIN }}>{est.estacion}</span>
                  <span className="font-space text-[8px]" style={{ color: "#ff6600" }}>{est.total_cargas}</span>
                  <span className="font-space text-[8px]" style={{ color: TEXT_MUTED }}>{est.camiones} cam</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>CARGAS HISTORICAS</span>
          <span className="font-space text-[11px] font-bold" style={{ color: TEXT_MAIN }}>{(aprendizaje?.total_cargas_historicas || 0).toLocaleString("es-CL")}</span>
          <span className="font-exo text-[7px] tracking-wider ml-3" style={{ color: TEXT_DIM }}>RECALIBRACION</span>
          <span className="font-space text-[10px]" style={{ color: PURPLE }}>Cada 7 dias (ultimos 30 dias)</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="CORREDORES Y RUTAS"
        icon={GitBranch}
        color={CYAN}
        expanded={expandedSection === "corredores"}
        onToggle={() => toggleSection("corredores")}
        testId="section-corredores"
      >
        <div className="grid grid-cols-3 gap-3 mb-2">
          <StatCard label="CORREDORES CONOCIDOS" value={sistemaEstado?.total_corredores_conocidos || 0} color={CYAN} icon={GitBranch} />
          <StatCard label="VIAJES TOTALES" value={sistemaEstado?.total_viajes_procesados || 0} color={SUCCESS} icon={Target} />
          <StatCard label="CONFIANZA GLOBAL" value={sistemaEstado?.confianza_global || "--"} color={sistemaEstado?.confianza_global === "ALTA" ? SUCCESS : WARNING} icon={Shield} />
        </div>
        <div className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>
          Los corredores se detectan automaticamente agrupando viajes entre los mismos origenes y destinos (tolerancia 8km). Cada corredor acumula estadisticas de rendimiento que se usan como baseline para deteccion de anomalias.
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="DETECCION DE CAMBIOS"
        icon={Zap}
        color={ERROR}
        expanded={expandedSection === "cambios"}
        onToggle={() => toggleSection("cambios")}
        testId="section-cambios"
      >
        <div className="font-rajdhani text-[10px] mb-3" style={{ color: TEXT_MUTED }}>
          El sistema detecta automaticamente cambios de patron: degradacion de conductor (&gt;20% caida rendimiento), consumo anomalo de combustible, y desviaciones significativas respecto al corredor. Estos cambios generan alertas tipo CAMBIO_PATRON_CONDUCTOR.
        </div>
        {alertasAprendizaje && alertasAprendizaje.filter((a: any) => a.tipo?.includes("PATRON") || a.tipo?.includes("CAMBIO")).length > 0 ? (
          <div className="space-y-1">
            {alertasAprendizaje.filter((a: any) => a.tipo?.includes("PATRON") || a.tipo?.includes("CAMBIO")).slice(0, 6).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: BG_DEEP, borderLeft: `2px solid ${ERROR}` }}>
                <Zap className="w-3 h-3" style={{ color: ERROR }} />
                <span className="font-space text-[9px] font-bold" style={{ color: TEXT_MAIN }}>{a.patente}</span>
                <span className="font-rajdhani text-[9px] truncate flex-1" style={{ color: TEXT_MUTED }}>{a.descripcion}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-3 justify-center">
            <CheckCircle className="w-4 h-4" style={{ color: SUCCESS }} />
            <span className="font-rajdhani text-[11px]" style={{ color: SUCCESS }}>Sin cambios de patron detectados</span>
          </div>
        )}
      </CollapsibleSection>

      <div className="rounded px-4 py-4 mt-4" style={{ background: BG_CARD, border: `1px solid ${PURPLE}20` }} data-testid="objetivos-aprendizaje">
        <div className="flex items-center gap-3 mb-4">
          <Target className="w-4 h-4" style={{ color: PURPLE }} />
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: PURPLE }}>OBJETIVOS DE APRENDIZAJE</span>
          <span className="font-exo text-[8px] tracking-wider" style={{ color: TEXT_MUTED }}>CICLO 7 DIAS</span>
          <div className="flex-1" />
          {objetivosData && (() => {
            const objs = objetivosData.objetivos || [];
            const promedioTotal = objs.length > 0 ? Math.round(objs.reduce((s: number, o: any) => s + o.progreso, 0) / objs.length) : 0;
            return (
              <div className="flex items-center gap-2">
                <span className="font-space text-[9px] font-bold" style={{ color: PURPLE }}>PROGRESO GLOBAL</span>
                <div className="w-24 h-1.5 rounded-full" style={{ background: BORDER }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${promedioTotal}%`, background: PURPLE }} />
                </div>
                <span className="font-space text-[11px] font-bold" style={{ color: PURPLE }}>{promedioTotal}%</span>
              </div>
            );
          })()}
        </div>

        <div className="space-y-2.5">
          {(objetivosData?.objetivos || []).map((obj: any) => {
            const estadoColors: Record<string, string> = { ACTIVO: SUCCESS, APRENDIENDO: WARNING, OBSERVANDO: TEXT_MUTED };
            const estadoColor = estadoColors[obj.estado] || TEXT_MUTED;
            const iconMap: Record<string, typeof Brain> = {
              eficiencia_corredor: Fuel,
              patron_carga: Gauge,
              tiempo_geocerca: Clock,
              degradacion_conductor: TrendingUp,
              ciclo_contrato: BarChart3,
            };
            const ObjIcon = iconMap[obj.id] || Target;
            const progressColor = obj.progreso >= 80 ? SUCCESS : obj.progreso >= 40 ? WARNING : obj.progreso >= 10 ? CYAN : TEXT_MUTED;

            return (
              <div key={obj.id} className="rounded px-4 py-3" style={{ background: BG_DEEP, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${progressColor}` }} data-testid={`objetivo-${obj.id}`}>
                <div className="flex items-center gap-3 mb-2">
                  <ObjIcon className="w-4 h-4" style={{ color: progressColor }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: TEXT_MAIN }}>{obj.nombre}</span>
                      <span className="font-space text-[7px] font-bold px-1.5 py-0.5" style={{
                        color: estadoColor,
                        background: `${estadoColor}12`,
                        border: `1px solid ${estadoColor}30`,
                      }}>{obj.estado}</span>
                    </div>
                    <div className="font-rajdhani text-[9px] mt-0.5" style={{ color: TEXT_MUTED }}>{obj.descripcion}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-space text-[20px] font-bold" style={{ color: progressColor }}>{obj.progreso}%</div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>DIA {obj.dia_inicio}/7</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: BORDER }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${obj.progreso}%`, background: `linear-gradient(90deg, ${progressColor}80, ${progressColor})` }} />
                  </div>
                  <span className="font-space text-[8px] w-[180px] text-right" style={{ color: TEXT_MUTED }}>{obj.datos}</span>
                </div>

                <div className="flex items-center gap-2 mt-1.5">
                  {Array.from({ length: 7 }).map((_, di) => {
                    const filled = di < obj.dia_inicio;
                    return (
                      <div key={di} className="flex items-center gap-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: filled ? progressColor : `${BORDER}` }} />
                        {di < 6 && <div className="w-3 h-px" style={{ background: filled ? `${progressColor}40` : BORDER }} />}
                      </div>
                    );
                  })}
                  <span className="font-exo text-[7px] ml-1" style={{ color: TEXT_DIM }}>7 DIAS CICLO</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: SUCCESS }} />
            <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>ACTIVO (&gt;80%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: WARNING }} />
            <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>APRENDIENDO (30-80%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: TEXT_MUTED }} />
            <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>OBSERVANDO (&lt;30%)</span>
          </div>
          <div className="flex-1" />
          <span className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>Recalibracion automatica cada 7 dias con ultimos 30 dias de datos</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: typeof Brain;
}) {
  return (
    <div className="rounded px-3 py-2.5" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="font-exo text-[7px] font-bold tracking-[0.15em] uppercase" style={{ color: TEXT_DIM }}>{label}</span>
      </div>
      <div className="font-space text-[18px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-rajdhani text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{sub}</div>}
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, color, expanded, onToggle, children, testId }: {
  title: string; icon: typeof Brain; color: string; expanded: boolean; onToggle: () => void; children: React.ReactNode; testId: string;
}) {
  return (
    <div className="rounded mb-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }} data-testid={testId}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer transition-all" data-testid={`${testId}-toggle`}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="font-space text-[10px] font-bold tracking-wider" style={{ color }}>{title}</span>
        <div className="flex-1" />
        {expanded ? <ChevronUp className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} />}
      </button>
      {expanded && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function OperativeBrain() {
  const [tab, setTab] = useState<BrainTab>("mapa");

  const BRAIN_TABS: { id: BrainTab; label: string; icon: typeof Brain }[] = [
    { id: "mapa", label: "MAPA EN VIVO", icon: MapPin },
    { id: "reporte", label: "REPORTE DEL DIA", icon: BarChart3 },
    { id: "drivers", label: "DRIVERS", icon: Users },
    { id: "aprendizaje", label: "APRENDIZAJE", icon: Brain },
  ];

  return (
    <div data-testid="operative-brain-page">
      <div className="flex items-center gap-1.5 mb-4">
        {BRAIN_TABS.map(t => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-all"
              style={{
                background: active ? `${PURPLE}08` : "transparent",
                border: `1px solid ${active ? `${PURPLE}25` : `${BORDER}40`}`,
                borderBottom: active ? `2px solid ${PURPLE}` : "2px solid transparent",
              }}
              data-testid={`brain-tab-${t.id}`}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: active ? PURPLE : TEXT_DIM }} />
              <span className="font-space text-[9px] font-bold tracking-[0.15em]" style={{ color: active ? PURPLE : TEXT_DIM }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "mapa" && <MapaEnVivoTab />}
      {tab === "reporte" && <ReporteDelDiaTab />}
      {tab === "drivers" && <DriversTab />}
      {tab === "aprendizaje" && <AprendizajeTab />}
    </div>
  );
}
