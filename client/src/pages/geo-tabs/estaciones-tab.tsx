import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Fuel, Truck, Users, ChevronDown, ChevronUp, MapPin, Search, AlertTriangle } from "lucide-react";
import { createDarkMap, addInfoWindow, fitBoundsToPoints, isGoogleMapsReady } from "@/lib/google-maps-utils";

function getContColor(c: string): string {
  if (c?.includes("CENCOSUD") || c?.includes("WALMART")) return "#00bfff";
  return "#c8e8ff";
}

export default function EstacionesTab() {
  const [contrato, setContrato] = useState("TODOS");
  const [dias, setDias] = useState(30);
  const [vista, setVista] = useState<"estaciones" | "conductores" | "irregularidades" | "gestionadas">("estaciones");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [selectedIrr, setSelectedIrr] = useState<any>(null);
  const [calDia, setCalDia] = useState<string | null>(null);
  const irrMarkerRef = useRef<any>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const { data: contratosData } = useQuery<any>({
    queryKey: ["/api/rutas/contratos-disponibles"],
    queryFn: () => fetch("/api/rutas/contratos-disponibles").then(r => r.json()),
    staleTime: 600000,
  });
  const contratos = contratosData?.contratos || [{ id: "TODOS", label: "TODOS" }];

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/dashboard", contrato, dias],
    queryFn: () => fetch(`/api/estaciones/dashboard?contrato=${contrato}&dias=${dias}`).then(r => r.json()),
  });

  const { data: detalle } = useQuery<any>({
    queryKey: [vista === "estaciones" ? "/api/estaciones/detalle" : "/api/estaciones/conductor", expandida],
    queryFn: () => {
      if (!expandida) return null;
      const ep = vista === "estaciones"
        ? `/api/estaciones/detalle/${encodeURIComponent(expandida)}`
        : `/api/estaciones/conductor/${encodeURIComponent(expandida)}`;
      return fetch(ep).then(r => r.json());
    },
    enabled: !!expandida,
  });

  const items = useMemo(() => {
    const list = vista === "estaciones" ? (data?.estaciones || []) : (data?.conductores || []);
    if (!busqueda) return list;
    const q = busqueda.toLowerCase();
    return list.filter((r: any) => (vista === "estaciones" ? r.nombre : r.conductor)?.toLowerCase().includes(q));
  }, [data, vista, busqueda]);

  // Irregularidades
  const { data: irrData } = useQuery<any>({
    queryKey: ["/api/estaciones/irregularidades", contrato, dias],
    queryFn: () => fetch(`/api/estaciones/irregularidades?contrato=${contrato}&dias=${dias}`).then(r => r.json()),
    enabled: vista === "irregularidades",
  });
  const [tipoIrr, setTipoIrr] = useState("error_digitacion");

  const { data: gestData, refetch: refetchGest } = useQuery<any>({
    queryKey: ["/api/estaciones/irregularidades/gestionadas"],
    queryFn: () => fetch("/api/estaciones/irregularidades/gestionadas").then(r => r.json()),
    enabled: vista === "gestionadas",
  });

  const [gestionados, setGestionados] = useState<Set<string>>(new Set());
  const [gestionMsg, setGestionMsg] = useState<string | null>(null);

  const gestionar = async (carga_id: number | null, patente: string, tipo: string, decision: string) => {
    try {
      await fetch("/api/estaciones/irregularidades/gestionar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carga_id, patente, tipo, decision }),
      });
      // Mark as gestioned visually
      const key = `${carga_id || ""}:${patente}:${tipo}`;
      setGestionados(prev => new Set([...prev, key]));
      setGestionMsg(`${patente} → ${decision}`);
      setTimeout(() => setGestionMsg(null), 2000);
      refetchGest();
    } catch (e) {
      setGestionMsg("Error al gestionar");
      setTimeout(() => setGestionMsg(null), 2000);
    }
  };

  const isGestionado = (r: any, tipo: string) => {
    const key = `${r.id || ""}:${r.patente}:${tipo}`;
    return gestionados.has(key);
  };

  const res = data?.resumen || {};

  useEffect(() => {
    if (!mapRef.current || !data?.estaciones || !isGoogleMapsReady()) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = createDarkMap(mapRef.current, { center: { lat: -33.45, lng: -70.65 }, zoom: 5 });
    }
    const map = mapInstanceRef.current;
    markersRef.current.forEach((m: any) => { if (m.setMap) m.setMap(null); else if (m.map !== undefined) m.map = null; });
    markersRef.current = [];
    const estConGeo = data.estaciones.filter((e: any) => e.lat && e.lng);
    if (estConGeo.length === 0) return;
    const maxCargas = Math.max(...estConGeo.map((e: any) => e.cargas));
    const allPoints: { lat: number; lng: number }[] = [];
    estConGeo.forEach((e: any) => {
      const size = Math.max(10, Math.min(32, (e.cargas / maxCargas) * 32));
      const color = e.cargas > maxCargas * 0.5 ? "#ff6b35" : e.cargas > maxCargas * 0.2 ? "#ffcc00" : "#00d4ff";
      const isSel = expandida === e.nombre;
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid ${isSel ? "#fff" : color + "80"};border-radius:50%;opacity:0.85;box-shadow:0 0 ${isSel ? 12 : 6}px ${color};display:flex;align-items:center;justify-content:center;cursor:pointer">${size > 14 ? `<span style="font-size:7px;color:#000;font-weight:bold">${e.cargas}</span>` : ""}</div>`;
      const tooltipContent = `<div style="font-family:monospace;font-size:11px;line-height:1.4"><b>${e.nombre}</b><br>${e.cargas} cargas · ${e.camiones} camiones<br>${(e.litros || 0).toLocaleString()} litros · ${e.conductores} conductores</div>`;
      if (google.maps.marker?.AdvancedMarkerElement) {
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: e.lat, lng: e.lng }, content: el });
        addInfoWindow(map, marker, tooltipContent);
        marker.addListener("click", () => { setVista("estaciones"); setExpandida(e.nombre); });
        markersRef.current.push(marker);
      } else {
        const marker = new google.maps.Marker({ map, position: { lat: e.lat, lng: e.lng } });
        addInfoWindow(map, marker, tooltipContent);
        marker.addListener("click", () => { setVista("estaciones"); setExpandida(e.nombre); });
        markersRef.current.push(marker);
      }
      allPoints.push({ lat: e.lat, lng: e.lng });
    });
    if (allPoints.length > 1) fitBoundsToPoints(map, allPoints, 30);
  }, [data, expandida]);

  const irrLayersRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapInstanceRef.current || !isGoogleMapsReady()) return;
    const map = mapInstanceRef.current;
    irrLayersRef.current.forEach((l: any) => { try { if (l.setMap) l.setMap(null); else if (l.map !== undefined) l.map = null; } catch {} });
    irrLayersRef.current = [];
    if (irrMarkerRef.current) { if (irrMarkerRef.current.setMap) irrMarkerRef.current.setMap(null); else if (irrMarkerRef.current.map !== undefined) irrMarkerRef.current.map = null; irrMarkerRef.current = null; }
    if (!selectedIrr) return;

    const estaciones = data?.estaciones || [];
    const findEst = (name: string) => estaciones.find((e: any) => e.nombre === name);

    const makeEl = (html: string) => { const el = document.createElement("div"); el.innerHTML = html; return el; };

    if (selectedIrr.est1 && selectedIrr.est2) {
      const e1 = findEst(selectedIrr.est1);
      const e2 = findEst(selectedIrr.est2);
      const points: { lat: number; lng: number }[] = [];

      if (e1?.lat && e1?.lng) {
        points.push({ lat: e1.lat, lng: e1.lng });
        const el1 = makeEl(`<div style="width:28px;height:28px;background:#ff6b35;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px #ff6b35;display:flex;align-items:center;justify-content:center"><span style="font-size:10px;font-weight:bold;color:#fff">1</span></div>`);
        const popup1 = `<div style="font-family:monospace;font-size:11px;line-height:1.5"><b style="color:#ff6b35">CARGA 1</b><br><b>${selectedIrr.patente}</b> · ${selectedIrr.conductor || "?"}<br>${selectedIrr.est1}<br>${(selectedIrr.fecha1 || "").slice(0, 16)}<br><b style="color:#ffcc00">${selectedIrr.litros1} litros</b></div>`;
        if (google.maps.marker?.AdvancedMarkerElement) {
          const m1 = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: e1.lat, lng: e1.lng }, content: el1 });
          const iw = addInfoWindow(map, m1, popup1, true);
          irrLayersRef.current.push(m1);
        } else {
          const m1 = new google.maps.Marker({ map, position: { lat: e1.lat, lng: e1.lng } });
          addInfoWindow(map, m1, popup1, true);
          irrLayersRef.current.push(m1);
        }
      }

      if (e2?.lat && e2?.lng) {
        points.push({ lat: e2.lat, lng: e2.lng });
        const el2 = makeEl(`<div style="width:28px;height:28px;background:#ff2244;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px #ff2244;display:flex;align-items:center;justify-content:center"><span style="font-size:10px;font-weight:bold;color:#fff">2</span></div>`);
        const popup2 = `<div style="font-family:monospace;font-size:11px;line-height:1.5"><b style="color:#ff2244">CARGA 2</b><br><b>${selectedIrr.patente}</b> · ${selectedIrr.conductor || "?"}<br>${selectedIrr.est2}<br>${(selectedIrr.fecha2 || "").slice(0, 16)}<br><b style="color:#ffcc00">${selectedIrr.litros2} litros</b><br><b style="color:#ff2244">TOTAL: ${selectedIrr.litros_total} lt · ${selectedIrr.minutos_entre} min entre</b></div>`;
        if (google.maps.marker?.AdvancedMarkerElement) {
          const m2 = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: e2.lat, lng: e2.lng }, content: el2 });
          addInfoWindow(map, m2, popup2);
          irrLayersRef.current.push(m2);
        } else {
          const m2 = new google.maps.Marker({ map, position: { lat: e2.lat, lng: e2.lng } });
          addInfoWindow(map, m2, popup2);
          irrLayersRef.current.push(m2);
        }
      }

      if (points.length === 2) {
        const line = new google.maps.Polyline({ map, path: points, strokeColor: "#ff2244", strokeWeight: 3, strokeOpacity: 0.8 });
        const mid = { lat: (points[0].lat + points[1].lat) / 2, lng: (points[0].lng + points[1].lng) / 2 };
        const labelEl = makeEl(`<div style="background:#0a1520;border:1px solid #ff2244;border-radius:4px;padding:2px 8px;text-align:center;white-space:nowrap"><span style="font-family:monospace;font-size:10px;color:#ff2244;font-weight:bold">${selectedIrr.minutos_entre} min · ${selectedIrr.litros_total} lt</span></div>`);
        irrLayersRef.current.push(line);
        if (google.maps.marker?.AdvancedMarkerElement) {
          const label = new google.maps.marker.AdvancedMarkerElement({ map, position: mid, content: labelEl });
          irrLayersRef.current.push(label);
        }
        fitBoundsToPoints(map, points, 60);
      } else if (points.length === 1) {
        map.setCenter(points[0]);
        map.setZoom(10);
      }
    } else {
      const est = findEst(selectedIrr.estacion);
      if (!est?.lat || !est?.lng) return;
      const el = makeEl(`<div style="width:24px;height:24px;background:#ff2244;border:3px solid #fff;border-radius:50%;box-shadow:0 0 15px #ff2244"></div>`);
      const popup = `<div style="font-family:monospace;font-size:11px;line-height:1.5"><b>${selectedIrr.patente}</b> · ${selectedIrr.conductor || "?"}<br>${selectedIrr.estacion}<br>${(selectedIrr.fecha || "").slice(0, 16)}<br><b style="color:#ffcc00">${Math.round(selectedIrr.litros || 0)} litros</b><br>${selectedIrr.km_ant ? `KM: ${selectedIrr.km_ant.toLocaleString()} → ${selectedIrr.km_act?.toLocaleString()}<br>` : ""}<b style="color:#ff2244">${selectedIrr.tipo_error || selectedIrr.razon || "Irregularidad"}</b></div>`;
      if (google.maps.marker?.AdvancedMarkerElement) {
        irrMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: est.lat, lng: est.lng }, content: el });
        addInfoWindow(map, irrMarkerRef.current, popup, true);
      } else {
        irrMarkerRef.current = new google.maps.Marker({ map, position: { lat: est.lat, lng: est.lng } });
        addInfoWindow(map, irrMarkerRef.current, popup, true);
      }
      map.setCenter({ lat: est.lat, lng: est.lng });
      map.setZoom(10);
    }
  }, [selectedIrr, data]);

  // Calendar data
  const calDias = useMemo(() => {
    if (!irrData?.irregularidades) return [];
    const all: any[] = [];
    for (const arr of Object.values(irrData.irregularidades) as any[][]) {
      arr.forEach((r: any) => {
        const d = (r.fecha || r.fecha1 || "").slice(0, 10);
        if (d) all.push(d);
      });
    }
    const counts = new Map<string, number>();
    all.forEach(d => counts.set(d, (counts.get(d) || 0) + 1));
    return Array.from(counts.entries()).map(([d, n]) => ({ fecha: d, irregularidades: n })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [irrData]);

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#ff6b35" }} /></div>;

  return (
    <div data-testid="estaciones-tab" className="relative">
      {/* Toast */}
      {gestionMsg && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg animate-pulse" style={{ background: "#0a1520", border: "1px solid #00ff8840" }}>
          <span className="font-exo text-[11px] font-bold" style={{ color: "#00ff88" }}>{gestionMsg}</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-rajdhani text-sm font-bold" style={{ color: "#c8e8ff" }}>Estaciones de Servicio</div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>{res.estaciones || 0} estaciones · {(res.litros || 0).toLocaleString()} litros · {res.cargas || 0} cargas</div>
        </div>
        <div className="flex gap-2 items-center">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDias(d)} className="font-space text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
              style={{ background: dias === d ? "#ff6b3515" : "transparent", border: `1px solid ${dias === d ? "#ff6b3540" : "#0d2035"}`, color: dias === d ? "#ff6b35" : "#3a6080" }}>{d}D</button>
          ))}
          {contratos.slice(0, 6).map((c: any) => (
            <button key={c.id} onClick={() => setContrato(c.id)} className="font-exo text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
              style={{ background: contrato === c.id ? getContColor(c.id) + "15" : "transparent", border: `1px solid ${contrato === c.id ? getContColor(c.id) + "40" : "#0d2035"}`, color: contrato === c.id ? getContColor(c.id) : "#3a6080" }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        {[
          { label: "ESTACIONES", value: res.estaciones || 0, color: "#ff6b35" },
          { label: "CARGAS", value: res.cargas || 0, color: "#00d4ff" },
          { label: "LITROS", value: `${Math.round((res.litros || 0) / 1000)}k`, color: "#ffcc00" },
          { label: "CON MAPA", value: `${res.con_geo || 0}/${res.estaciones || 0}`, color: (res.con_geo || 0) >= ((res.estaciones || 1) * 0.5) ? "#00ff88" : "#ff2244" },
          { label: "CONDUCTORES", value: res.conductores || 0, color: "#a855f7" },
        ].map(k => (
          <div key={k.label} className="text-center py-2 rounded" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.color}` }}>
            <div className="font-space text-[16px] font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="font-exo text-[7px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Map */}
      <div ref={mapRef} className="rounded-lg mb-2" style={{ height: 260, background: "#060d14", border: `1px solid ${selectedIrr ? "#ff224440" : "#0d2035"}` }} />

      {/* Calendar - below map when in irregularidades */}
      {vista === "irregularidades" && calDias.length > 0 && (
        <div className="mb-3 p-3 rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-exo text-[8px] uppercase tracking-wider" style={{ color: "#3a6080" }}>CALENDARIO DE IRREGULARIDADES</span>
            {calDia && <button onClick={() => setCalDia(null)} className="font-exo text-[8px] px-2 py-0.5 rounded cursor-pointer" style={{ color: "#00d4ff", border: "1px solid #00d4ff30" }}>Limpiar filtro</button>}
          </div>
          <div className="flex flex-wrap gap-1">
            {calDias.map(d => {
              const isSel = calDia === d.fecha;
              const color = d.irregularidades >= 5 ? "#ff2244" : d.irregularidades >= 2 ? "#ffcc00" : "#3a6080";
              return (
                <button key={d.fecha} onClick={() => setCalDia(isSel ? null : d.fecha)}
                  className="text-center px-2 py-1.5 rounded cursor-pointer transition-all"
                  style={{ background: isSel ? color + "20" : "#0a1520", border: `1px solid ${isSel ? color : "#0d2035"}`, minWidth: 52 }}>
                  <div className="font-space text-[9px] font-bold" style={{ color: isSel ? color : "#c8e8ff" }}>{d.fecha.slice(5)}</div>
                  <div className="font-space text-[7px]" style={{ color }}>{d.irregularidades} irr</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Vista toggle + search */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
          <button onClick={() => { setVista("estaciones"); setExpandida(null); }}
            className="flex items-center gap-1.5 font-exo text-[9px] font-bold px-3 py-1.5 rounded cursor-pointer"
            style={{ background: vista === "estaciones" ? "#ff6b3515" : "transparent", border: `1px solid ${vista === "estaciones" ? "#ff6b3540" : "#0d2035"}`, color: vista === "estaciones" ? "#ff6b35" : "#3a6080" }}>
            <Fuel className="w-3 h-3" /> ESTACIONES ({data?.estaciones?.length || 0})
          </button>
          <button onClick={() => { setVista("conductores"); setExpandida(null); }}
            className="flex items-center gap-1.5 font-exo text-[9px] font-bold px-3 py-1.5 rounded cursor-pointer"
            style={{ background: vista === "conductores" ? "#a855f715" : "transparent", border: `1px solid ${vista === "conductores" ? "#a855f740" : "#0d2035"}`, color: vista === "conductores" ? "#a855f7" : "#3a6080" }}>
            <Users className="w-3 h-3" /> CONDUCTORES ({data?.conductores?.length || 0})
          </button>
          <button onClick={() => { setVista("irregularidades"); setExpandida(null); }}
            className="flex items-center gap-1.5 font-exo text-[9px] font-bold px-3 py-1.5 rounded cursor-pointer"
            style={{ background: vista === "irregularidades" ? "#ff224415" : "transparent", border: `1px solid ${vista === "irregularidades" ? "#ff224440" : "#0d2035"}`, color: vista === "irregularidades" ? "#ff2244" : "#3a6080" }}>
            <AlertTriangle className="w-3 h-3" /> IRREGULARIDADES
          </button>
          <button onClick={() => { setVista("gestionadas"); setExpandida(null); }}
            className="flex items-center gap-1.5 font-exo text-[9px] font-bold px-3 py-1.5 rounded cursor-pointer"
            style={{ background: vista === "gestionadas" ? "#00ff8815" : "transparent", border: `1px solid ${vista === "gestionadas" ? "#00ff8840" : "#0d2035"}`, color: vista === "gestionadas" ? "#00ff88" : "#3a6080" }}>
            <MapPin className="w-3 h-3" /> GESTIONADAS
          </button>
        </div>
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder={vista === "estaciones" ? "Buscar estacion..." : "Buscar conductor..."}
            className="pl-7 pr-3 py-1.5 font-exo text-[10px] rounded outline-none w-48"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        </div>
      </div>

      {/* IRREGULARIDADES VIEW */}
      {vista === "irregularidades" && (
        <div>
          {!irrData ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#ff2244" }} /></div> : (
            <div>
              {/* Resumen KPIs */}
              <div className="grid grid-cols-6 gap-2 mb-4">
                {[
                  { key: "error_digitacion", label: "ERROR DIGITO", n: irrData.resumen?.error_digitacion || 0, desc: "KM retrocede o salta (error tipeo)", color: "#ff2244" },
                  { key: "rend_sospechoso", label: "REND. SOSPECH.", n: irrData.resumen?.rend_sospechoso || 0, desc: ">6 o <0.5 km/L (km valido)", color: "#ffcc00" },
                  { key: "doble_carga", label: "DOBLE CARGA", n: irrData.resumen?.doble_carga || 0, desc: "2 cargas mismo camion <1h", color: "#a855f7" },
                  { key: "litros_excesivo", label: "LITROS >600", n: irrData.resumen?.litros_excesivo || 0, desc: "Carga excesiva", color: "#00d4ff" },
                  { key: "km_no_avanza", label: "KM NO AVANZA", n: irrData.resumen?.km_no_avanza || 0, desc: "Cargo litros pero 0 km", color: "#ff6b35" },
                  { key: "km_cero", label: "SIN ODOMETRO", n: irrData.resumen?.km_cero || 0, desc: "KM en 0 con litros", color: "#3a6080" },
                ].map(k => (
                  <button key={k.key} onClick={() => setTipoIrr(k.key)}
                    className="text-center py-3 rounded cursor-pointer transition-all"
                    style={{ background: tipoIrr === k.key ? "#0a1a28" : "#060d14", border: `1px solid ${tipoIrr === k.key ? k.color + "50" : "#0d2035"}`, borderTop: `3px solid ${k.n > 0 ? k.color : "#0d2035"}` }}>
                    <div className="font-space text-[20px] font-bold" style={{ color: k.n > 0 ? k.color : "#3a6080" }}>{k.n}</div>
                    <div className="font-exo text-[7px] tracking-[0.1em] uppercase" style={{ color: tipoIrr === k.key ? k.color : "#3a6080" }}>{k.label}</div>
                    <div className="font-exo text-[7px] mt-0.5" style={{ color: "#3a608080" }}>{k.desc}</div>
                  </button>
                ))}
              </div>

              {/* Camiones más irregulares */}
              {irrData.camiones_irregulares?.length > 0 && (
                <div className="mb-4 p-3 rounded-lg" style={{ background: "#060d14", border: "1px solid #ff224420" }}>
                  <div className="font-exo text-[8px] uppercase tracking-wider mb-2" style={{ color: "#ff2244" }}>
                    CAMIONES CON MAS IRREGULARIDADES ({irrData.camiones_irregulares.length})
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {irrData.camiones_irregulares.slice(0, 12).map((c: any) => (
                      <div key={c.patente} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1520", borderLeft: `2px solid ${c.irregularidades >= 3 ? "#ff2244" : "#ffcc00"}` }}>
                        <div>
                          <div className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</div>
                          <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.contrato} · {c.total_cargas} cargas</div>
                        </div>
                        <div className="text-right">
                          <div className="font-space text-[12px] font-bold" style={{ color: "#ff2244" }}>{c.irregularidades}</div>
                          <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>
                            {c.km_retrocede > 0 && `R:${c.km_retrocede} `}{c.km_excesivo > 0 && `E:${c.km_excesivo} `}{c.litros_excesivo > 0 && `L:${c.litros_excesivo}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detalle del tipo seleccionado */}
              <div className="rounded-lg p-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-exo text-[8px] uppercase tracking-wider mb-3" style={{ color: "#c8e8ff" }}>
                  DETALLE: {tipoIrr.replace(/_/g, " ").toUpperCase()}
                </div>

                {tipoIrr === "doble_carga" ? (
                  <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                    {(irrData.irregularidades?.doble_carga || []).filter((r: any) => !calDia || (r.fecha1 || "").startsWith(calDia)).filter((r: any) => !isGestionado(r, "doble_carga")).map((r: any, i: number) => {
                      const sevColor = r.severidad === "ALTA" ? "#ff2244" : r.severidad === "BAJA" ? "#00ff88" : "#ffcc00";
                      return (
                      <div key={i} onClick={() => setSelectedIrr({ ...r, estacion: r.est1, razon: r.clasificacion === "PROBABLE_LLENADO_2_ETAPAS" ? "Probable llenado en 2 etapas (misma estacion, <600lt)" : r.clasificacion === "SOSPECHOSO" ? "Sospechoso: estacion diferente o >600lt total" : "Revisar" })} className="flex items-center justify-between px-2 py-2 rounded cursor-pointer hover:opacity-80" style={{ background: selectedIrr?.id === r.id ? "#ff224415" : (i % 2 === 0 ? "#0a1520" : "transparent"), borderLeft: `3px solid ${sevColor}` }}>
                        <div className="flex items-center gap-3">
                          <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{r.patente}</span>
                          <span className="font-exo text-[8px]" style={{ color: "#a855f7" }}>{r.conductor || "?"}</span>
                          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{r.minutos_entre} min</span>
                          <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: sevColor, border: `1px solid ${sevColor}30`, background: sevColor + "10" }}>
                            {r.clasificacion === "PROBABLE_LLENADO_2_ETAPAS" ? "LLENADO 2 ETAPAS" : r.clasificacion === "SOSPECHOSO" ? "SOSPECHOSO" : "REVISAR"}
                          </span>
                          {r.misma_estacion && <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>misma est.</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="font-space text-[9px] font-bold" style={{ color: "#ffcc00" }}>{Math.round(r.litros1)} lt</span>
                            <span className="font-exo text-[8px] mx-1" style={{ color: "#3a6080" }}>{r.est1?.substring(0, 15)}</span>
                          </div>
                          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>+</span>
                          <div className="text-right">
                            <span className="font-space text-[9px] font-bold" style={{ color: "#ffcc00" }}>{Math.round(r.litros2)} lt</span>
                            <span className="font-exo text-[8px] mx-1" style={{ color: "#3a6080" }}>{r.est2?.substring(0, 15)}</span>
                          </div>
                          <span className="font-space text-[10px] font-bold" style={{ color: "#ff2244" }}> = {Math.round(r.litros_total)} lt</span>
                          <div className="flex gap-1 ml-2">
                            <button onClick={(e) => { e.stopPropagation(); gestionar(null, r.patente, "doble_carga", "OK"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#00ff8815", border: "1px solid #00ff8830", color: "#00ff88" }}>OK</button>
                            <button onClick={(e) => { e.stopPropagation(); gestionar(null, r.patente, "doble_carga", "FRAUDE"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244" }}>FRAUDE</button>
                            <button onClick={(e) => { e.stopPropagation(); gestionar(null, r.patente, "doble_carga", "ERROR_DATO"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#ffcc0015", border: "1px solid #ffcc0030", color: "#ffcc00" }}>ERROR</button>
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1 mb-1" style={{ borderBottom: "1px solid #0d2035" }}>
                      <span className="font-exo text-[7px] uppercase w-16" style={{ color: "#3a6080" }}>Patente</span>
                      <span className="font-exo text-[7px] uppercase flex-1" style={{ color: "#3a6080" }}>Conductor</span>
                      <span className="font-exo text-[7px] uppercase flex-1" style={{ color: "#3a6080" }}>Estacion</span>
                      <span className="font-exo text-[7px] uppercase w-20 text-right" style={{ color: "#3a6080" }}>Fecha</span>
                      <span className="font-exo text-[7px] uppercase w-16 text-right" style={{ color: "#3a6080" }}>Litros</span>
                      <span className="font-exo text-[7px] uppercase w-20 text-right" style={{ color: "#3a6080" }}>KM ant</span>
                      <span className="font-exo text-[7px] uppercase w-20 text-right" style={{ color: "#3a6080" }}>KM act</span>
                      <span className="font-exo text-[7px] uppercase w-20 text-right" style={{ color: "#3a6080" }}>Diferencia</span>
                    </div>
                    {(irrData.irregularidades?.[tipoIrr] || []).filter((r: any) => !calDia || (r.fecha || "").startsWith(calDia)).filter((r: any) => !isGestionado(r, tipoIrr)).map((r: any, i: number) => {
                      const diffLabel = tipoIrr === "error_digitacion" ? `${r.tipo_error || "?"}: ${Math.round(r.diferencia || 0).toLocaleString()}`
                        : tipoIrr === "rend_sospechoso" ? (r.razon || `${(r.rendimiento || 0).toFixed(1)} km/L`)
                        : tipoIrr === "litros_excesivo" ? `${Math.round(r.litros)} lt`
                        : tipoIrr === "km_no_avanza" ? (r.razon || `${r.km_entre || 0} km`)
                        : tipoIrr === "km_cero" ? "sin odometro"
                        : `${r.km_entre || "?"} km`;
                      return (
                        <div key={i} onClick={() => setSelectedIrr(r)} className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:opacity-80" style={{ background: selectedIrr?.id === r.id ? "#ff224415" : (i % 2 === 0 ? "#0a1520" : "transparent"), borderLeft: selectedIrr?.id === r.id ? "3px solid #ff2244" : "none" }}>
                          <span className="font-space text-[10px] font-bold w-16" style={{ color: "#c8e8ff" }}>{r.patente}</span>
                          <span className="font-exo text-[8px] flex-1 truncate" style={{ color: "#a855f7" }}>{r.conductor || "—"}</span>
                          <span className="font-exo text-[8px] flex-1 truncate" style={{ color: "#3a6080" }}>{(r.estacion || "").substring(0, 20)}</span>
                          <span className="font-exo text-[8px] w-20 text-right" style={{ color: "#3a6080" }}>{r.fecha?.slice(5, 10)} {r.fecha?.slice(11, 16)}</span>
                          <span className="font-space text-[9px] w-16 text-right" style={{ color: "#ffcc00" }}>{Math.round(r.litros || 0)}</span>
                          <span className="font-space text-[9px] w-20 text-right" style={{ color: "#3a6080" }}>{r.km_ant ? Math.round(r.km_ant).toLocaleString() : "—"}</span>
                          <span className="font-space text-[9px] w-20 text-right" style={{ color: "#3a6080" }}>{r.km_act ? Math.round(r.km_act).toLocaleString() : "—"}</span>
                          <span className="font-space text-[10px] font-bold w-20 text-right" style={{ color: "#ff2244" }}>{diffLabel}</span>
                          <div className="flex gap-1 ml-2">
                            <button onClick={(e) => { e.stopPropagation(); gestionar(r.id || null, r.patente, tipoIrr, "OK"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#00ff8815", border: "1px solid #00ff8830", color: "#00ff88" }}>OK</button>
                            <button onClick={(e) => { e.stopPropagation(); gestionar(r.id || null, r.patente, tipoIrr, "FRAUDE"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244" }}>FRAUDE</button>
                            <button onClick={(e) => { e.stopPropagation(); gestionar(r.id || null, r.patente, tipoIrr, "ERROR_DATO"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#ffcc0015", border: "1px solid #ffcc0030", color: "#ffcc00" }}>ERROR</button>
                            <button onClick={(e) => { e.stopPropagation(); gestionar(r.id || null, r.patente, tipoIrr, "REVISAR"); }} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer" style={{ background: "#00d4ff15", border: "1px solid #00d4ff30", color: "#00d4ff" }}>REVISAR</button>
                          </div>
                        </div>
                      );
                    })}
                    {(irrData.irregularidades?.[tipoIrr] || []).length === 0 && (
                      <div className="text-center py-6 font-exo text-[10px]" style={{ color: "#00ff88" }}>Sin irregularidades de este tipo</div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected irregularity detail panel */}
              {selectedIrr && (
                <div className="mt-4 p-4 rounded-lg" style={{ background: "#0a1520", border: "1px solid #ff224440", borderTop: "3px solid #ff2244" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-4 h-4" style={{ color: "#ff2244" }} />
                      <span className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{selectedIrr.patente}</span>
                      {selectedIrr.conductor && <span className="font-exo text-[10px]" style={{ color: "#a855f7" }}>{selectedIrr.conductor}</span>}
                    </div>
                    <button onClick={() => setSelectedIrr(null)} className="font-exo text-[8px] px-2 py-1 rounded cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035" }}>Cerrar</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="p-2 rounded" style={{ background: "#060d14" }}>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Estacion</div>
                      <div className="font-exo text-[10px] font-bold" style={{ color: "#ff6b35" }}>{selectedIrr.estacion || selectedIrr.est1 || "?"}</div>
                    </div>
                    <div className="p-2 rounded" style={{ background: "#060d14" }}>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Fecha</div>
                      <div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{(selectedIrr.fecha || selectedIrr.fecha1 || "").slice(0, 16)}</div>
                    </div>
                    <div className="p-2 rounded" style={{ background: "#060d14" }}>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Litros</div>
                      <div className="font-space text-[12px] font-bold" style={{ color: "#ffcc00" }}>{Math.round(selectedIrr.litros || selectedIrr.litros_total || 0)} lt</div>
                    </div>
                    <div className="p-2 rounded" style={{ background: "#060d14" }}>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>KM</div>
                      <div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{selectedIrr.km_ant ? `${selectedIrr.km_ant.toLocaleString()} → ${selectedIrr.km_act?.toLocaleString()}` : (selectedIrr.km_entre ? `${selectedIrr.km_entre} km` : "—")}</div>
                    </div>
                  </div>
                  {(selectedIrr.tipo_error || selectedIrr.razon) && (
                    <div className="px-3 py-2 rounded mb-3" style={{ background: "#ff224410", border: "1px solid #ff224430" }}>
                      <span className="font-exo text-[9px] font-bold" style={{ color: "#ff2244" }}>{selectedIrr.tipo_error || selectedIrr.razon}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => { gestionar(selectedIrr.id, selectedIrr.patente, tipoIrr, "OK"); setSelectedIrr(null); }} className="flex-1 py-2 rounded font-exo text-[10px] font-bold cursor-pointer" style={{ background: "#00ff8815", border: "1px solid #00ff8840", color: "#00ff88" }}>OK — Sin problema</button>
                    <button onClick={() => { gestionar(selectedIrr.id, selectedIrr.patente, tipoIrr, "FRAUDE"); setSelectedIrr(null); }} className="flex-1 py-2 rounded font-exo text-[10px] font-bold cursor-pointer" style={{ background: "#ff224415", border: "1px solid #ff224440", color: "#ff2244" }}>FRAUDE</button>
                    <button onClick={() => { gestionar(selectedIrr.id, selectedIrr.patente, tipoIrr, "ERROR_DATO"); setSelectedIrr(null); }} className="flex-1 py-2 rounded font-exo text-[10px] font-bold cursor-pointer" style={{ background: "#ffcc0015", border: "1px solid #ffcc0040", color: "#ffcc00" }}>ERROR DATO</button>
                    <button onClick={() => { gestionar(selectedIrr.id, selectedIrr.patente, tipoIrr, "REVISAR"); setSelectedIrr(null); }} className="flex-1 py-2 rounded font-exo text-[10px] font-bold cursor-pointer" style={{ background: "#00d4ff15", border: "1px solid #00d4ff40", color: "#00d4ff" }}>REVISAR</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* GESTIONADAS VIEW */}
      {vista === "gestionadas" && (
        <div>
          {!gestData ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-10" style={{ color: "#00ff88" }} /> : (
            <div>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: "TOTAL", n: gestData.resumen?.total || 0, color: "#c8e8ff" },
                  { label: "OK", n: gestData.resumen?.ok || 0, color: "#00ff88" },
                  { label: "FRAUDE", n: gestData.resumen?.fraude || 0, color: "#ff2244" },
                  { label: "ERROR DATO", n: gestData.resumen?.error_dato || 0, color: "#ffcc00" },
                ].map(k => (
                  <div key={k.label} className="text-center py-3 rounded" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.color}` }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>{k.n}</div>
                    <div className="font-exo text-[7px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
                {(gestData.gestionadas || []).map((g: any, i: number) => (
                  <div key={g.id} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: i % 2 === 0 ? "#060d14" : "transparent", borderLeft: `3px solid ${g.decision === "OK" ? "#00ff88" : g.decision === "FRAUDE" ? "#ff2244" : g.decision === "ERROR_DATO" ? "#ffcc00" : "#00d4ff"}` }}>
                    <div className="flex items-center gap-3">
                      <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{g.patente}</span>
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{g.tipo}</span>
                      {g.conductor && <span className="font-exo text-[8px]" style={{ color: "#a855f7" }}>{g.conductor}</span>}
                      {g.estacion && <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{g.estacion?.substring(0, 20)}</span>}
                      {g.fecha_carga && <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{g.fecha_carga?.slice(0, 10)}</span>}
                      {g.litros > 0 && <span className="font-space text-[9px]" style={{ color: "#ffcc00" }}>{Math.round(g.litros)} lt</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-exo text-[8px] font-bold px-2 py-0.5 rounded" style={{ color: g.decision === "OK" ? "#00ff88" : g.decision === "FRAUDE" ? "#ff2244" : g.decision === "ERROR_DATO" ? "#ffcc00" : "#00d4ff", border: `1px solid ${g.decision === "OK" ? "#00ff8830" : g.decision === "FRAUDE" ? "#ff224430" : "#ffcc0030"}` }}>{g.decision}</span>
                      <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{g.fecha_gestion?.slice(0, 10)}</span>
                    </div>
                  </div>
                ))}
                {(gestData.gestionadas || []).length === 0 && (
                  <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin irregularidades gestionadas aun</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista estaciones/conductores */}
      {vista !== "irregularidades" && vista !== "gestionadas" && <div className="space-y-1">
        {items.map((r: any) => {
          const name = vista === "estaciones" ? r.nombre : r.conductor;
          const isOpen = expandida === name;
          return (
            <div key={name}>
              <button onClick={() => setExpandida(isOpen ? null : name)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer transition-all hover:opacity-90"
                style={{ background: isOpen ? "#0a1a28" : "#060d14", border: `1px solid ${isOpen ? (vista === "estaciones" ? "#ff6b3530" : "#a855f730") : "#0d2035"}`, borderLeft: `3px solid ${vista === "estaciones" ? "#ff6b35" : "#a855f7"}` }}>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-exo text-[10px] font-bold truncate" style={{ color: "#c8e8ff" }}>{name}</div>
                  <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>
                    {vista === "estaciones" ? `${r.camiones} camiones · ${r.conductores} conductores${r.lat ? "" : " · sin mapa"}` : `${r.camiones} camiones · ${r.estaciones} estaciones`}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: "#00d4ff" }}>{r.cargas}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>cargas</div></div>
                  <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: "#ffcc00" }}>{(r.litros || 0).toLocaleString()}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>litros</div></div>
                  <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{r.litros_prom || 0}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>lt/carga</div></div>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />}
                </div>
              </button>

              {isOpen && detalle && (
                <div className="mx-3 px-4 py-3 rounded-b" style={{ background: "#0a1520", borderLeft: `3px solid ${vista === "estaciones" ? "#ff6b35" : "#a855f7"}`, borderBottom: "1px solid #0d203530" }}>
                  {vista === "estaciones" && detalle.conductores?.length > 0 && (
                    <div className="mb-3 pb-3" style={{ borderBottom: "1px solid #0d2035" }}>
                      <div className="font-exo text-[8px] uppercase tracking-wider mb-2" style={{ color: "#a855f7" }}>CONDUCTORES EN ESTA ESTACION</div>
                      <div className="flex flex-wrap gap-1">
                        {detalle.conductores.map((c: any) => (
                          <div key={c.conductor} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                            <span className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{c.conductor}</span>
                            <span className="font-space text-[8px]" style={{ color: "#00d4ff" }}>{c.cargas}c</span>
                            <span className="font-space text-[8px]" style={{ color: "#3a6080" }}>{c.camiones}cam</span>
                            <span className="font-space text-[8px]" style={{ color: "#ffcc00" }}>{Math.round(c.litros)}lt</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {vista === "conductores" && r.estaciones_lista?.length > 0 && (
                    <div className="mb-3 pb-3" style={{ borderBottom: "1px solid #0d2035" }}>
                      <div className="font-exo text-[8px] uppercase tracking-wider mb-2" style={{ color: "#ff6b35" }}>ESTACIONES DONDE CARGA</div>
                      <div className="flex flex-wrap gap-1">
                        {r.estaciones_lista.map((e: string) => (
                          <span key={e} className="font-exo text-[8px] px-2 py-0.5 rounded" style={{ background: "#060d14", border: "1px solid #0d2035", color: "#c8e8ff" }}>{e}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="font-exo text-[8px] uppercase tracking-wider mb-2" style={{ color: "#3a6080" }}>ULTIMAS {detalle.total} CARGAS</div>
                  <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                    {(detalle.cargas || []).map((c: any, i: number) => {
                      const km = (c.km_act && c.km_ant && c.km_act > c.km_ant) ? Math.round(c.km_act - c.km_ant) : null;
                      return (
                        <div key={c.id || i} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: i % 2 === 0 ? "#060d14" : "transparent" }}>
                          <div className="flex items-center gap-3">
                            <span className="font-space text-[9px] w-4 text-right" style={{ color: "#3a6080" }}>{i + 1}</span>
                            <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                            {c.conductor && <span className="font-exo text-[8px]" style={{ color: "#a855f7" }}>{c.conductor}</span>}
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.fecha?.slice(0, 10)} {c.fecha?.slice(11, 16)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {vista === "conductores" && c.estacion && <span className="font-exo text-[8px]" style={{ color: "#ff6b35" }}>{c.estacion}</span>}
                            <span className="font-space text-[10px] font-bold" style={{ color: "#ffcc00" }}>{Math.round(c.litros)} lt</span>
                            {km && km < 3000 && <span className="font-space text-[9px]" style={{ color: "#c8e8ff" }}>{km} km</span>}
                            {c.contrato && <span className="font-exo text-[7px]" style={{ color: getContColor(c.contrato) }}>{c.contrato}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && !isLoading && (
          <div className="text-center py-8"><Fuel className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} /><div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin resultados</div></div>
        )}
      </div>}
    </div>
  );
}
