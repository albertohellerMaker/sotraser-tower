import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, MapPin, Clock, Truck, ChevronDown, ChevronUp, Eye, Check, X, AlertTriangle, Route, RotateCcw, Fuel, Calendar, TrendingUp, Activity } from "lucide-react";
import { EstadoBadge } from "./shared-components";
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Dot } from "recharts";
import { createDarkMap, addInfoWindow, fitBoundsToPoints, isGoogleMapsReady } from "@/lib/google-maps-utils";

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

interface ParadaDetectada {
  nombre: string;
  lat: number;
  lng: number;
  entrada: string;
  salida: string;
  minutos: number;
  puntos: number;
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

function detectarParadas(puntosGps: any[]): ParadaDetectada[] {
  if (!puntosGps || puntosGps.length < 2) return [];
  const paradas: ParadaDetectada[] = [];
  let currentNombre: string | null = null;
  let entrada: string | null = null;
  let lastTimestamp: string | null = null;
  let latSum = 0, lngSum = 0, count = 0;

  for (const p of puntosGps) {
    if (p.nombre && p.nombre === currentNombre) {
      lastTimestamp = p.timestamp;
      latSum += p.lat;
      lngSum += p.lng;
      count++;
    } else {
      if (currentNombre && entrada && lastTimestamp && count >= 2) {
        const min = Math.round((new Date(lastTimestamp).getTime() - new Date(entrada).getTime()) / 60000);
        paradas.push({ nombre: currentNombre, lat: latSum / count, lng: lngSum / count, entrada, salida: lastTimestamp, minutos: min, puntos: count });
      }
      currentNombre = p.nombre || null;
      entrada = p.timestamp;
      lastTimestamp = p.timestamp;
      latSum = p.lat;
      lngSum = p.lng;
      count = 1;
    }
  }
  if (currentNombre && entrada && lastTimestamp && count >= 2) {
    const min = Math.round((new Date(lastTimestamp).getTime() - new Date(entrada).getTime()) / 60000);
    paradas.push({ nombre: currentNombre, lat: latSum / count, lng: lngSum / count, entrada, salida: lastTimestamp, minutos: min, puntos: count });
  }
  return paradas;
}

function formatMinutos(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function getRendColor(rend: number): string {
  if (rend >= 2.85) return "#00ff88";
  if (rend >= 2.3) return "#ffcc00";
  return "#ff2244";
}

function getRendLabel(rend: number): string {
  if (rend >= 2.85) return "Bueno";
  if (rend >= 2.3) return "Medio";
  return "Bajo";
}

// ═══════════════════════════════════════════════════
// ReplayModal (preserved from original)
// ═══════════════════════════════════════════════════

function ReplayModal({ viaje, onClose }: { viaje: any; onClose: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const marcadorRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const puntosGps = useMemo(() => {
    return (viaje.puntos_gps || []).filter((p: any) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng));
  }, [viaje]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !isGoogleMapsReady()) return;
    const centerLat = puntosGps.length > 0 ? puntosGps[0].lat : -33.45;
    const centerLng = puntosGps.length > 0 ? puntosGps[0].lng : -70.65;
    const map = createDarkMap(mapRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: 7,
    });
    mapInstance.current = map;
    if (puntosGps.length > 0) {
      const first = puntosGps[0];
      const last = puntosGps[puntosGps.length - 1];
      new google.maps.Circle({ map, center: { lat: first.lat, lng: first.lng }, radius: 300, fillColor: "#00ff88", strokeColor: "#020508", strokeWeight: 2, fillOpacity: 1 });
      addInfoWindow(map, new google.maps.Marker({ map, position: { lat: first.lat, lng: first.lng }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#00ff88", fillOpacity: 1, strokeColor: "#020508", strokeWeight: 2 } }), `<b>ORIGEN</b><br>${viaje.lugar_origen || "Inicio"}`);
      addInfoWindow(map, new google.maps.Marker({ map, position: { lat: last.lat, lng: last.lng }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#ff2244", fillOpacity: 1, strokeColor: "#020508", strokeWeight: 2 } }), `<b>DESTINO</b><br>${viaje.lugar_destino || "Fin"}`);
      const points = puntosGps.map((p: any) => ({ lat: p.lat, lng: p.lng }));
      if (points.length > 1) fitBoundsToPoints(map, points, 40);
    }
    return () => { mapInstance.current = null; };
  }, [puntosGps]);

  const iniciarReplay = () => {
    if (!mapInstance.current || !isGoogleMapsReady() || puntosGps.length < 2) return;
    const map = mapInstance.current;
    setReproduciendo(true); setTerminado(false); setProgreso(0);
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    if (marcadorRef.current) { if (marcadorRef.current.setMap) marcadorRef.current.setMap(null); else if (marcadorRef.current.map !== undefined) marcadorRef.current.map = null; marcadorRef.current = null; }
    const calcBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
      const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
      return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    };
    const makeMarkerEl = (rotation: number) => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="font-size:28px;line-height:1;transform:rotate(${rotation}deg);filter:drop-shadow(0 0 6px #00d4ff);text-align:center;">&#x1F69A;</div>`;
      el.style.width = "32px"; el.style.height = "32px";
      return el;
    };
    const total = puntosGps.length;
    const intervaloMs = 7000 / total;
    let idx = 0;
    const coordsAnimadas: google.maps.LatLngLiteral[] = [];
    let currentBearing = 0;

    if (google.maps.marker?.AdvancedMarkerElement) {
      marcadorRef.current = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: puntosGps[0].lat, lng: puntosGps[0].lng }, content: makeMarkerEl(0) });
    } else {
      marcadorRef.current = new google.maps.Marker({ map, position: { lat: puntosGps[0].lat, lng: puntosGps[0].lng } });
    }

    intervalRef.current = setInterval(() => {
      if (idx >= total) { clearInterval(intervalRef.current); setReproduciendo(false); setTerminado(true); setProgreso(100); return; }
      const punto = puntosGps[idx];
      coordsAnimadas.push({ lat: punto.lat, lng: punto.lng });
      if (polylineRef.current) polylineRef.current.setMap(null);
      polylineRef.current = new google.maps.Polyline({ map, path: coordsAnimadas, strokeColor: "#00d4ff", strokeWeight: 3, strokeOpacity: 0.8 });
      if (idx > 0) { const prev = puntosGps[idx - 1]; currentBearing = calcBearing(prev.lat, prev.lng, punto.lat, punto.lng); }
      if (marcadorRef.current) {
        if (marcadorRef.current instanceof google.maps.Marker) {
          marcadorRef.current.setPosition({ lat: punto.lat, lng: punto.lng });
        } else {
          marcadorRef.current.position = { lat: punto.lat, lng: punto.lng };
          marcadorRef.current.content = makeMarkerEl(currentBearing);
        }
      }
      setProgreso(Math.round((idx / total) * 100));
      if (idx % 5 === 0) map.panTo({ lat: punto.lat, lng: punto.lng });
      idx++;
    }, intervaloMs);
  };

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const duracion = viaje.hora_inicio && viaje.hora_fin
    ? (() => { const ms = new Date(viaje.hora_fin).getTime() - new Date(viaje.hora_inicio).getTime(); return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`; })()
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
            <div className="font-exo text-xs" style={{ color: "#3a6080" }}>{puntosGps.length} puntos GPS{viaje.km_total ? ` · ${viaje.km_total} km` : ""}</div>
            <button onClick={onClose} className="p-1 cursor-pointer hover:opacity-70"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
          </div>
        </div>
        <div className="flex-1 relative" style={{ minHeight: "400px" }}>
          {puntosGps.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "#020508" }}>
              <MapPin className="w-8 h-8 mb-3" style={{ color: "#3a6080" }} />
              <span className="font-exo text-sm" style={{ color: "#3a6080" }}>Sin puntos GPS para este viaje</span>
            </div>
          )}
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>
        <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid #0d2035" }}>
          <div className="h-1 w-full mb-3 overflow-hidden" style={{ background: "#0d2035" }}>
            <div className="h-full" style={{ width: `${progreso}%`, background: terminado ? "#00ff88" : "#00d4ff", transition: "width 0.1s linear" }} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div><div className="font-exo text-[11px] tracking-wider" style={{ color: "#3a6080" }}>DURACION</div><div className="font-space text-sm font-bold" style={{ color: "#c8e8ff" }}>{duracion}</div></div>
              <div><div className="font-exo text-[11px] tracking-wider" style={{ color: "#3a6080" }}>RENDIMIENTO</div><div className="font-space text-sm font-bold" style={{ color: viaje.rendimiento >= 2.5 ? "#00ff88" : "#ff2244" }}>{viaje.rendimiento ? `${viaje.rendimiento.toFixed(2)} km/L` : "--"}</div></div>
              <div><div className="font-exo text-[11px] tracking-wider" style={{ color: "#3a6080" }}>VEL MAX</div><div className="font-space text-sm font-bold" style={{ color: (viaje.vel_max || 0) > 100 ? "#ff2244" : "#c8e8ff" }}>{viaje.vel_max ? `${viaje.vel_max} km/h` : "--"}</div></div>
            </div>
            <div className="flex items-center gap-2">
              {!reproduciendo && !terminado && puntosGps.length > 0 && (
                <button onClick={iniciarReplay} className="flex items-center gap-2 px-5 py-2.5 font-space text-[11px] font-bold cursor-pointer transition-all hover:opacity-80"
                  style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff" }}>
                  <span style={{ fontSize: '16px' }}>&#x1F69A;</span> INICIAR RECREACION · 7s
                </button>
              )}
              {reproduciendo && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '16px', animation: 'pulse 1s infinite' }}>&#x1F69A;</span>
                  <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>REPRODUCIENDO... {progreso}%</span>
                </div>
              )}
              {terminado && (
                <button onClick={iniciarReplay} className="flex items-center gap-2 px-4 py-2 font-space text-[11px] font-bold cursor-pointer hover:opacity-80"
                  style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)", color: "#00ff88" }}>
                  <RotateCcw className="w-3.5 h-3.5" /> REPETIR
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Calendario Mensual
// ═══════════════════════════════════════════════════

function CalendarioMes({ calendario, mes, anio, onDayClick, selectedDay }: {
  calendario: any[];
  mes: number;
  anio: number;
  onDayClick: (fecha: string) => void;
  selectedDay: string | null;
}) {
  const diasSemana = ["L", "M", "X", "J", "V", "S", "D"];
  const primerDia = new Date(anio, mes - 1, 1);
  // getDay: 0=dom, 1=lun -> offset: (getDay + 6) % 7
  const offset = (primerDia.getDay() + 6) % 7;
  const diasEnMes = new Date(anio, mes, 0).getDate();

  const hoyStr = new Date().toISOString().split("T")[0];

  const getCellColor = (dia: any) => {
    if (!dia) return "transparent";
    const dt = new Date(dia.fecha);
    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
    if (!dia.activo) return isWeekend ? "#0a1520" : "#060d14";
    if (dia.rendimiento >= 2.85) return "#00ff8820";
    if (dia.rendimiento >= 2.3) return "#ffcc0018";
    return "#ff224418";
  };

  const getBorderColor = (dia: any) => {
    if (!dia) return "transparent";
    if (dia.fecha === hoyStr) return "#00d4ff";
    if (!dia.activo) return "#0d203530";
    if (dia.rendimiento >= 2.85) return "#00ff8840";
    if (dia.rendimiento >= 2.3) return "#ffcc0035";
    return "#ff224435";
  };

  const cells = [];
  // Blank cells for offset
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= diasEnMes; d++) cells.push(calendario.find((c: any) => c.dia === d) || null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {diasSemana.map(d => (
          <div key={d} className="text-center font-exo text-xs font-bold py-0.5" style={{ color: "#3a6080" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((dia, i) => {
          const isToday = dia?.fecha === hoyStr;
          const isSelected = dia && selectedDay === dia.fecha;
          return (
            <div key={i}
              className="relative flex flex-col items-center justify-center cursor-pointer transition-all hover:opacity-80"
              style={{
                width: 38, height: 38,
                background: dia ? getCellColor(dia) : "transparent",
                border: isSelected ? "1.5px solid #00d4ff" : `1px solid ${dia ? getBorderColor(dia) : "transparent"}`,
                borderRadius: 4,
                animation: isToday ? "todayPulse 2s infinite" : undefined,
              }}
              title={dia ? `${dia.fecha}${dia.fuente ? ` [${dia.fuente}]` : ""}\n${dia.km} km | ${dia.rendimiento} km/L\n${dia.viajes} viajes${dia.horas_ruta ? ` | ${dia.horas_ruta}h ruta` : ""}${dia.litros_dia ? `\n${dia.litros_dia}L consumidos` : ""}` : ""}
              onClick={() => dia && onDayClick(dia.fecha)}>
              {dia && (
                <>
                  <span className="font-space text-xs font-bold leading-none" style={{
                    color: !dia.activo ? "#1a3a55" : "#c8e8ff"
                  }}>
                    {dia.dia}
                  </span>
                  {dia.activo && dia.rendimiento > 0 && (
                    <span className="font-exo text-xs leading-none mt-0.5" style={{
                      color: dia.rendimiento >= 2.85 ? "#00ff88" : dia.rendimiento >= 2.3 ? "#ffcc00" : "#ff2244"
                    }}>
                      {dia.rendimiento.toFixed(1)}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// KPI Cards Acumulado
// ═══════════════════════════════════════════════════

function AcumuladoKpis({ acumulado }: { acumulado: any }) {
  const kpis = [
    { label: "KM MES", value: acumulado.km_mes?.toLocaleString() || "0", color: "#00d4ff" },
    { label: "KM/L PROMEDIO", value: acumulado.rendimiento_promedio?.toFixed(2) || "0", color: getRendColor(acumulado.rendimiento_promedio || 0) },
    { label: "CARGAS MES", value: String(acumulado.cargas_mes || 0), color: "#c8e8ff" },
    { label: "DIAS ACTIVO", value: `${acumulado.dias_activos || 0}/${acumulado.dias_mes || 0}`, color: "#c8e8ff" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {kpis.map(k => (
        <div key={k.label} className="px-3 py-2.5 rounded text-center" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>{k.value}</div>
          <div className="font-exo text-xs tracking-[0.15em] uppercase mt-0.5" style={{ color: "#3a6080" }}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Timeline de Cargas
// ═══════════════════════════════════════════════════

function TimelineCargas({ cargas }: { cargas: any[] }) {
  if (!cargas || cargas.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <Fuel className="w-4 h-4 mr-2" style={{ color: "#3a6080" }} />
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Sin cargas registradas este mes</span>
      </div>
    );
  }

  // Calculate average km between charges for estimation
  const kmEntreCargas = cargas
    .filter(c => c.km_desde_ultima_carga > 10 && c.km_desde_ultima_carga < 3000)
    .map(c => c.km_desde_ultima_carga);
  const promedioKmEntreCarga = kmEntreCargas.length > 0
    ? Math.round(kmEntreCargas.reduce((s: number, k: number) => s + k, 0) / kmEntreCargas.length)
    : 0;

  // Estimate km since last charge (from km_actual of last charge to "now")
  const lastCarga = cargas[cargas.length - 1];
  const kmDesdeUltima = lastCarga?.km_desde_ultima_carga || 0;
  const cicloPct = promedioKmEntreCarga > 0 ? Math.min(100, Math.round((kmDesdeUltima / promedioKmEntreCarga) * 100)) : 0;
  const kmRestante = promedioKmEntreCarga > 0 ? Math.max(0, promedioKmEntreCarga - kmDesdeUltima) : 0;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-0 min-w-max py-2 px-1">
        {cargas.map((c, i) => {
          const rendColor = c.rendimiento_periodo > 0 ? getRendColor(c.rendimiento_periodo) : "#3a6080";
          const fechaCorta = c.fecha ? new Date(c.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "?";
          return (
            <div key={i} className="flex items-center">
              {/* Fuel icon */}
              <div className="flex flex-col items-center" style={{ minWidth: 64 }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center mb-1" style={{ background: "#00d4ff15", border: "1.5px solid #00d4ff50" }}>
                  <Fuel className="w-4 h-4" style={{ color: "#00d4ff" }} />
                </div>
                <div className="font-space text-xs font-bold" style={{ color: "#00d4ff" }}>{Math.round(c.litros)}L</div>
                <div className="font-exo text-xs" style={{ color: "#3a6080" }}>{fechaCorta}</div>
                <div className="font-exo text-[7px] max-w-[60px] truncate text-center" style={{ color: "#1a3a55" }}>{c.estacion}</div>
              </div>
              {/* Connecting line with km */}
              {i < cargas.length - 1 && (
                <div className="flex flex-col items-center mx-1" style={{ minWidth: 80 }}>
                  <div className="font-space text-[11px] font-bold mb-0.5" style={{ color: rendColor }}>
                    {c.km_desde_ultima_carga > 0 ? `${c.km_desde_ultima_carga} km` : ""}
                  </div>
                  <div className="w-full h-[2px] relative" style={{ background: "#0d2035" }}>
                    <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, #00d4ff40, ${rendColor}40)` }} />
                  </div>
                  <div className="font-exo text-xs mt-0.5" style={{ color: rendColor }}>
                    {c.rendimiento_periodo > 0 ? `${Number(c.rendimiento_periodo).toFixed(2)} km/L` : ""}
                  </div>
                </div>
              )}
              {/* Last item: open period with smart estimation */}
              {i === cargas.length - 1 && (
                <div className="flex flex-col items-center ml-2 px-3 py-2 rounded" style={{ minWidth: 140, background: "#0a1520", border: "1px solid #0d2035" }}>
                  {promedioKmEntreCarga > 0 ? (
                    <>
                      <div className="font-exo text-xs mb-1" style={{ color: "#3a6080" }}>
                        Lleva ~{kmDesdeUltima} km desde ultima carga
                      </div>
                      <div className="w-full h-[5px] rounded-full overflow-hidden mb-1" style={{ background: "#0d2035" }}>
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${cicloPct}%`,
                          background: cicloPct > 85 ? "#ff2244" : cicloPct > 60 ? "#ffcc00" : "#00ff88",
                        }} />
                      </div>
                      <div className="font-space text-[11px] font-bold" style={{ color: cicloPct > 85 ? "#ff2244" : "#00d4ff" }}>
                        {cicloPct}% del ciclo
                      </div>
                      <div className="font-exo text-[7px] mt-0.5" style={{ color: "#3a6080" }}>
                        Carga cada ~{promedioKmEntreCarga} km
                        {kmRestante > 0 && ` · Faltan ~${kmRestante} km`}
                      </div>
                    </>
                  ) : (
                    <div className="font-exo text-xs italic" style={{ color: "#3a6080" }}>En ruta...</div>
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

// ═══════════════════════════════════════════════════
// Grafico Rendimiento
// ═══════════════════════════════════════════════════

function GraficoRendimiento({ rendimiento_diario, promedioHistorico, onPointClick }: {
  rendimiento_diario: any[];
  promedioHistorico: number;
  onPointClick: (fecha: string) => void;
}) {
  if (!rendimiento_diario || rendimiento_diario.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <TrendingUp className="w-4 h-4 mr-2" style={{ color: "#3a6080" }} />
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Sin datos de rendimiento</span>
      </div>
    );
  }

  const data = rendimiento_diario.map(d => ({
    ...d,
    fechaCorta: new Date(d.fecha).getDate().toString(),
    promedio: promedioHistorico,
  }));

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    const color = getRendColor(payload.km_L);
    return (
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="#020508" strokeWidth={2}
        style={{ cursor: "pointer" }}
        onClick={() => onPointClick(payload.fecha)} />
    );
  };

  const CustomTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="px-3 py-2 rounded" style={{ background: "#091018", border: "1px solid #0d2035" }}>
        <div className="font-space text-xs font-bold" style={{ color: "#00d4ff" }}>{d.fecha}</div>
        <div className="font-exo text-[11px] mt-1" style={{ color: getRendColor(d.km_L) }}>{d.km_L?.toFixed(2)} km/L</div>
        <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{d.km} km · {d.viajes} viajes</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
        <XAxis dataKey="fechaCorta" tick={{ fill: "#3a6080", fontSize: 11 }} axisLine={{ stroke: "#0d2035" }} tickLine={false} />
        <YAxis domain={[1.5, 4]} tick={{ fill: "#3a6080", fontSize: 11 }} axisLine={{ stroke: "#0d2035" }} tickLine={false} />
        <RechartsTooltip content={<CustomTooltipContent />} />
        <ReferenceLine y={promedioHistorico} stroke="#00d4ff" strokeDasharray="6 4" strokeOpacity={0.5} label={{ value: `Prom ${promedioHistorico}`, fill: "#00d4ff", fontSize: 11, position: "right" }} />
        <ReferenceLine y={2.85} stroke="#00ff8830" strokeDasharray="3 3" />
        <ReferenceLine y={2.3} stroke="#ffcc0030" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="km_L" stroke="#00d4ff" strokeWidth={2} dot={<CustomDot />} activeDot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════
// Panel Detalle de un Día
// ═══════════════════════════════════════════════════

function DayDetailPanel({ patente, fecha, onClose }: { patente: string; fecha: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/camion/detalle-dia", patente, fecha],
    queryFn: async () => {
      const r = await fetch(`/api/camion/detalle-dia/${patente}?fecha=${fecha}`);
      return r.json();
    },
    enabled: !!patente && !!fecha,
  });

  if (isLoading) {
    return (
      <div className="dash-card px-4 py-6 flex items-center justify-center">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" style={{ color: "#3a6080" }} />
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Cargando detalle...</span>
      </div>
    );
  }

  if (!data || data.error) return null;

  const rendColor = data.kpis?.rendimiento > 0 ? getRendColor(data.kpis.rendimiento) : "#3a6080";

  const TrendArrow = ({ val, suffix }: { val: number | null; suffix: string }) => {
    if (val === null || val === undefined) return <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>--</span>;
    const positive = val >= 0;
    return (
      <span className="font-space text-xs font-bold" style={{ color: positive ? "#00ff88" : "#ff2244" }}>
        {positive ? "+" : ""}{val}{suffix} {positive ? "↗" : "↘"}
      </span>
    );
  };

  return (
    <div className="dash-card px-0 py-0 overflow-hidden" style={{ animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
        <div>
          <div className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{data.fecha_texto?.toUpperCase()}</div>
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Camion {data.patente} · {data.contrato}
            {data.conductores?.length > 0 && ` · ${data.conductores.join(", ")}`}
          </div>
        </div>
        <button onClick={onClose} className="p-1 cursor-pointer hover:opacity-70"><X className="w-3.5 h-3.5" style={{ color: "#3a6080" }} /></button>
      </div>

      {/* Resumen */}
      <div className="px-4 py-3" style={{ background: `${data.resumen_color}08`, borderBottom: "1px solid #0d2035" }}>
        <div className="font-space text-[13px] font-bold" style={{ color: data.resumen_color }}>
          {data.resumen_texto}
        </div>
      </div>

      {/* KPIs */}
      <div className="px-4 py-3 grid grid-cols-4 gap-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div>
          <div className="font-space text-[20px] font-bold leading-none" style={{ color: "#00d4ff" }}>{data.kpis?.km || 0}</div>
          <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>km recorridos</div>
        </div>
        <div>
          <div className="font-space text-[20px] font-bold leading-none" style={{ color: rendColor }}>{data.kpis?.rendimiento?.toFixed(2) || "--"}</div>
          <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>km/L rendimiento</div>
        </div>
        <div>
          <div className="font-space text-[20px] font-bold leading-none" style={{ color: "#c8e8ff" }}>{data.kpis?.viajes || 0}</div>
          <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>viajes completados</div>
        </div>
        <div>
          <div className="font-space text-[20px] font-bold leading-none" style={{ color: "#c8e8ff" }}>{data.kpis?.horas_ruta || 0}</div>
          <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>horas en ruta</div>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x" style={{ borderColor: "#0d2035" }}>
        {/* Viajes del día */}
        <div className="px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>VIAJES DEL DIA</div>
          {data.viajes?.length > 0 ? (
            <div className="space-y-2">
              {data.viajes.map((v: any) => (
                <div key={v.numero} className="flex gap-2">
                  <div className="font-space text-xs font-bold w-4 flex-shrink-0" style={{ color: "#3a6080" }}>{v.numero}.</div>
                  <div>
                    <div className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{v.origen} → {v.destino}</div>
                    <div className="font-space text-[11px]" style={{ color: "#3a6080" }}>
                      {v.km} km · <span style={{ color: getRendColor(v.rendimiento) }}>{v.rendimiento?.toFixed(2)} km/L</span> · {v.duracion_horas}h
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin viajes detallados</div>
          )}
        </div>

        {/* Combustible + Comparativas */}
        <div className="px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>COMBUSTIBLE</div>
          {data.combustible?.length > 0 ? (
            <div className="space-y-1 mb-3">
              {data.combustible.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Fuel className="w-3 h-3 flex-shrink-0" style={{ color: "#00d4ff" }} />
                  <span className="font-exo text-xs" style={{ color: "#c8e8ff" }}>
                    {c.litros}L en {c.estacion} {c.hora && `a las ${c.hora}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-exo text-[11px] mb-3" style={{ color: "#3a6080" }}>Sin carga este dia</div>
          )}

          <div className="font-exo text-xs tracking-[0.15em] uppercase mb-2 mt-3 pt-2" style={{ color: "#3a6080", borderTop: "1px solid #0d2035" }}>COMPARATIVAS</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>vs dia anterior (km/L)</span>
              <TrendArrow val={data.comparativas?.vs_ayer_rendimiento} suffix=" km/L" />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>vs promedio mes (km/L)</span>
              <TrendArrow val={data.comparativas?.vs_mes_rendimiento} suffix=" km/L" />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>vs ayer (km)</span>
              <TrendArrow val={data.comparativas?.vs_ayer_km} suffix=" km" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Conductores BETA
// ═══════════════════════════════════════════════════

function ConductoresBeta({ patente }: { patente: string }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/camion/conductores", patente],
    queryFn: async () => {
      const r = await fetch(`/api/camion/conductores/${patente}`);
      return r.json();
    },
    enabled: !!patente,
  });

  if (!data || !data.conductores?.length) return null;

  return (
    <div className="dash-card px-3 py-3">
      {/* Header con badge BETA */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CONDUCTORES</span>
        <span className="font-exo text-[7px] font-bold px-1.5 py-0.5 rounded"
          style={{ color: "#ffcc00", background: "rgba(255,204,0,0.1)", border: "1px solid rgba(255,204,0,0.3)" }}>
          BETA
        </span>
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>
          {data.total_conductores > 1 ? `${data.total_conductores} conductores este mes` : "1 conductor este mes"}
        </span>
      </div>

      {/* Advertencia */}
      {data.advertencia && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded" style={{ background: "rgba(255,204,0,0.05)", border: "1px solid rgba(255,204,0,0.2)" }}>
          <span className="font-exo text-xs" style={{ color: "#ffcc00" }}>{data.advertencia}</span>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-1.5">
        {data.conductores.map((c: any, i: number) => (
          <div key={c.conductor} className="flex items-center justify-between px-3 py-2 rounded"
            style={{
              background: c.es_principal ? "rgba(0,212,255,0.05)" : "#0a1520",
              border: `1px solid ${c.es_principal ? "rgba(0,212,255,0.2)" : "#0d2035"}`,
            }}>
            <div className="flex items-center gap-3">
              <span className="font-space text-[11px] font-bold w-4" style={{ color: "#3a6080" }}>{i + 1}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.conductor}</span>
                  {c.es_principal && (
                    <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#00d4ff", border: "1px solid #00d4ff30" }}>PRINCIPAL</span>
                  )}
                </div>
                <div className="font-exo text-xs mt-0.5" style={{ color: "#3a6080" }}>
                  {c.cargas} cargas · {c.dias_activo} dias · {c.km_total.toLocaleString("es-CL")} km
                </div>
              </div>
            </div>
            <div className="text-right">
              {c.ultimo_viaje && (
                <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
                  ultimo: {new Date(c.ultimo_viaje).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Cobertura */}
      <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
        <div className="flex-1 h-1 rounded" style={{ background: "#0d2035" }}>
          <div className="h-full rounded" style={{
            width: `${data.pct_cobertura_datos}%`,
            background: data.pct_cobertura_datos >= 70 ? "#00ff88" : data.pct_cobertura_datos >= 40 ? "#ffcc00" : "#ff2244",
          }} />
        </div>
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{data.pct_cobertura_datos}% cobertura</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Seccion Camion Detalle (below map)
// ═══════════════════════════════════════════════════

function CamionDetalle({ patente, onDayFilter, onPointHighlight, viajesDelDia, onSelectViaje, onReplay, selectedViaje: currentSelectedViaje }: {
  patente: string;
  onDayFilter: (fecha: string) => void;
  onPointHighlight: (fecha: string) => void;
  viajesDelDia: any[];
  onSelectViaje: (v: any) => void;
  onReplay: (v: any) => void;
  selectedViaje: any | null;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/camion/mes-completo", patente],
    queryFn: async () => {
      const r = await fetch(`/api/camion/mes-completo/${patente}`);
      return r.json();
    },
    enabled: !!patente,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" style={{ color: "#3a6080" }} />
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Cargando datos del camion...</span>
      </div>
    );
  }

  if (!data || data.error) return null;

  const handleDayClick = (fecha: string) => {
    const newDay = selectedDay === fecha ? null : fecha;
    setSelectedDay(newDay);
    onDayFilter(fecha);
  };

  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="space-y-3 mt-3" style={{ animation: "fadeIn 0.3s ease" }}>
      {/* SECCION A — ENCABEZADO */}
      <div className="dash-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "#00d4ff10", border: "1.5px solid #00d4ff40" }}>
              <span className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{patente}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>Camion {patente}</span>
                {data.acumulado?.conductor && (
                  <span className="font-exo text-xs px-2 py-0.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }}>
                    {data.acumulado.conductor}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{meses[(data.mes || 1) - 1]} {data.anio}</span>
                {data.acumulado?.dias_volvo > 0 && (
                  <span className="font-exo text-xs px-1.5 py-0.5 rounded" style={{ background: "#00ff8812", border: "1px solid #00ff8825", color: "#00ff88" }}>
                    {data.acumulado.dias_volvo}d WiseTrack
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Quick KPIs del dia */}
          <div className="flex items-center gap-4">
            {[
              { label: "KM MES", value: data.acumulado?.km_mes?.toLocaleString() || "0", color: "#00d4ff" },
              { label: "KM/L", value: data.acumulado?.rendimiento_promedio?.toFixed(2) || "--", color: getRendColor(data.acumulado?.rendimiento_promedio || 0) },
              { label: "CARGAS", value: String(data.acumulado?.cargas_mes || 0), color: "#c8e8ff" },
              { label: "DIAS", value: `${data.acumulado?.dias_activos || 0}/${data.acumulado?.dias_mes || 0}`, color: "#c8e8ff" },
            ].map(k => (
              <div key={k.label} className="text-center">
                <div className="font-space text-[16px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
                <div className="font-exo text-[7px] tracking-[0.15em] uppercase mt-0.5" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* VIAJES DEL CAMION */}
      {viajesDelDia.length > 0 && (
        <div className="dash-card px-0 py-0">
          <div className="px-3 py-2 flex items-center justify-between" style={{ background: "#0a1929", borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-2">
              <Route className="w-3 h-3" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[8px] tracking-[0.15em] uppercase font-bold" style={{ color: "#3a6080" }}>VIAJES</span>
              <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{viajesDelDia.length}</span>
            </div>
            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Click para ver en mapa</span>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {viajesDelDia.map((v: any, i: number) => {
              const isSelected = currentSelectedViaje?.patente === v.patente && currentSelectedViaje?.hora_inicio === v.hora_inicio;
              const rendColor = v.rendimiento ? getRendColor(v.rendimiento) : "#3a6080";
              const durMin = v.duracion_min || 0;
              const durH = Math.floor(durMin / 60);
              const durM = durMin % 60;
              const horaInicio = v.hora_inicio ? new Date(v.hora_inicio).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--";
              const horaFin = v.hora_fin ? new Date(v.hora_fin).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--";
              return (
                <div key={`trip-${i}`}
                  className="px-3 py-2 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.04)]"
                  style={{
                    background: isSelected ? "#00d4ff08" : "transparent",
                    borderBottom: "1px solid #0d203530",
                    borderLeft: isSelected ? "3px solid #00d4ff" : "3px solid transparent",
                  }}
                  onClick={() => onSelectViaje(isSelected ? null : v)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[10px] font-bold" style={{ color: "#3a6080" }}>{i + 1}.</span>
                      <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>
                        {v.lugar_origen} → {v.lugar_destino}
                      </span>
                    </div>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{v.km_total} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{horaInicio} → {horaFin}</span>
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{durH > 0 ? `${durH}h ${durM}m` : `${durM}m`}</span>
                      {v.rendimiento > 0 && (
                        <span className="font-space text-[9px] font-bold" style={{ color: rendColor }}>{v.rendimiento.toFixed(2)} km/L</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {v.total_puntos >= 2 && (
                        <button onClick={(e) => { e.stopPropagation(); onReplay(v); }}
                          className="font-exo text-[8px] font-bold px-1.5 py-0.5 rounded cursor-pointer"
                          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", color: "#00d4ff" }}>
                          RECREAR
                        </button>
                      )}
                      <span className="font-exo text-[7px] px-1 py-0.5 rounded" style={{ background: "#0d2035", color: "#3a6080" }}>{v.total_puntos} pts</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conductores BETA */}
      <ConductoresBeta patente={patente} />

      {/* Grid: Calendario + Grafico */}
      <div className="grid grid-cols-3 gap-3">
        {/* SECCION 1 - Calendario */}
        <div className="col-span-1 dash-card px-3 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3 h-3" style={{ color: "#3a6080" }} />
            <span className="font-exo text-[11px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CALENDARIO DEL MES</span>
          </div>
          <CalendarioMes
            calendario={data.calendario || []}
            mes={data.mes}
            anio={data.anio}
            onDayClick={handleDayClick}
            selectedDay={selectedDay}
          />
          <div className="flex gap-2 mt-2 justify-center">
            {[
              { color: "#00ff88", label: "Bueno" },
              { color: "#ffcc00", label: "Medio" },
              { color: "#ff2244", label: "Bajo" },
              { color: "#0a1929", label: "Inactivo" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: l.color + (l.color === "#0a1929" ? "" : "40") }} />
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SECCION 2 - Grafico Rendimiento */}
        <div className="col-span-2 dash-card px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3" style={{ color: "#3a6080" }} />
            <span className="font-exo text-[11px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>RENDIMIENTO DIARIO</span>
            {data.rendimiento_diario?.length > 0 && (
              <span className="font-exo text-xs ml-auto" style={{ color: "#3a6080" }}>
                {data.rendimiento_diario.length} dias con datos
              </span>
            )}
          </div>
          <GraficoRendimiento
            rendimiento_diario={data.rendimiento_diario || []}
            promedioHistorico={data.promedio_historico || 2.5}
            onPointClick={onPointHighlight}
          />
        </div>
      </div>

      {/* Day detail panel - appears when clicking a calendar day */}
      {selectedDay && (
        <DayDetailPanel patente={patente} fecha={selectedDay} onClose={() => setSelectedDay(null)} />
      )}

      {/* SECCION 3 - Timeline Cargas */}
      <div className="dash-card px-3 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Fuel className="w-3 h-3" style={{ color: "#3a6080" }} />
          <span className="font-exo text-[11px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>HISTORIAL DE CARGAS</span>
          {data.cargas && <span className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{data.cargas.length} cargas</span>}
        </div>
        <TimelineCargas cargas={data.cargas || []} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN: ViajesCerrados
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// Supervision Predictiva Widget
// ═══════════════════════════════════════════════════

function SupervisionWidget() {
  const { data } = useQuery<any>({
    queryKey: ["/api/supervision/estado-hoy"],
    queryFn: async () => {
      const r = await fetch("/api/supervision/estado-hoy");
      return r.json();
    },
    refetchInterval: 30 * 60 * 1000,
  });

  if (!data || !data.resumen || data.resumen.total === 0) return null;

  // VALIDACIÓN 3: Solo mostrar alertas con confianza MEDIA o ALTA
  const alertasConfiables = (data.camiones || []).filter((c: any) =>
    c.estado_supervision && c.estado_supervision !== "NORMAL" && c.estado_supervision !== "SIN_DATOS" && c.estado_supervision !== "PENDIENTE"
    && (c.confianza_prediccion === "ALTA" || c.confianza_prediccion === "MEDIA")
  );
  const alertasBaja = (data.camiones || []).filter((c: any) =>
    c.estado_supervision && c.estado_supervision !== "NORMAL" && c.estado_supervision !== "SIN_DATOS" && c.estado_supervision !== "PENDIENTE"
    && c.confianza_prediccion === "BAJA"
  );

  const confianzaColor: Record<string, string> = { ALTA: "#00ff88", MEDIA: "#ffcc00", BAJA: "#3a6080" };

  return (
    <div className="dash-card px-4 py-3" style={{ animation: "fadeIn 0.3s ease" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          <span className="font-exo text-[8px] tracking-[0.15em] uppercase font-bold" style={{ color: "#3a6080" }}>SUPERVISION PREDICTIVA</span>
          <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#00d4ff", border: "1px solid #00d4ff30" }}>HOY</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Confianza indicators */}
          {data.resumen.confianza_alta > 0 && <span className="font-exo text-[7px] px-1 py-0.5 rounded" style={{ color: "#00ff88", border: "1px solid #00ff8830" }}>{data.resumen.confianza_alta} alta</span>}
          {data.resumen.confianza_media > 0 && <span className="font-exo text-[7px] px-1 py-0.5 rounded" style={{ color: "#ffcc00", border: "1px solid #ffcc0030" }}>{data.resumen.confianza_media} media</span>}
          {data.resumen.confianza_baja > 0 && <span className="font-exo text-[7px] px-1 py-0.5 rounded" style={{ color: "#3a6080", border: "1px solid #0d2035" }}>{data.resumen.confianza_baja} baja</span>}
          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{data.resumen.total} cam</span>
        </div>
      </div>

      {/* Semáforo */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        {[
          { label: "INACTIVOS\nINESPERADOS", value: data.resumen.inactivos_inesperados, color: data.resumen.inactivos_inesperados > 0 ? "#ff2244" : "#3a6080" },
          { label: "RENDIMIENTO\nBAJO", value: data.resumen.rendimiento_bajo, color: data.resumen.rendimiento_bajo > 0 ? "#ffcc00" : "#3a6080" },
          { label: "ACTIVOS\nINESPERADOS", value: data.resumen.activos_inesperados, color: data.resumen.activos_inesperados > 0 ? "#00d4ff" : "#3a6080" },
          { label: "PENDIENTES\n(< 14:00)", value: data.resumen.pendientes || 0, color: (data.resumen.pendientes || 0) > 0 ? "#3a6080" : "#1a3a55" },
          { label: "OPERANDO\nNORMAL", value: data.resumen.normales, color: "#00ff88" },
        ].map(s => (
          <div key={s.label} className="text-center px-2 py-2 rounded" style={{ background: "#0a1520", borderTop: `2px solid ${s.color}` }}>
            <div className="font-space text-[18px] font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
            <div className="font-exo text-[7px] uppercase mt-1 whitespace-pre-line" style={{ color: "#3a6080" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Alertas confiables (MEDIA/ALTA) */}
      {alertasConfiables.length > 0 && (
        <div className="space-y-1 mb-2">
          {alertasConfiables.slice(0, 5).map((cam: any) => {
            const stateColor = cam.estado_supervision === "INACTIVO_INESPERADO" ? "#ff2244"
              : cam.estado_supervision === "RENDIMIENTO_BAJO" ? "#ffcc00" : "#00d4ff";
            const stateText = cam.estado_supervision === "INACTIVO_INESPERADO" ? "Esperado activo · sin datos"
              : cam.estado_supervision === "RENDIMIENTO_BAJO" ? `${Math.abs(Math.round(cam.desviacion_rend_pct || 0))}% bajo historico`
              : cam.estado_supervision === "ACTIVO_INESPERADO" ? "Activo en dia inusual" : cam.estado_supervision;
            return (
              <div key={cam.patente} className="flex items-center justify-between px-3 py-2 rounded"
                style={{ background: "#0a1520", borderLeft: `3px solid ${stateColor}` }}>
                <div className="flex items-center gap-2">
                  <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{cam.contrato}</span>
                  <span className="font-exo text-[6px] px-1 py-0.5 rounded" style={{ color: confianzaColor[cam.confianza_prediccion] || "#3a6080", border: `1px solid ${confianzaColor[cam.confianza_prediccion] || "#0d2035"}30` }}>
                    {cam.confianza_prediccion} · {cam.semanas_historial}sem
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-exo text-[9px]" style={{ color: stateColor }}>{stateText}</div>
                  {cam.rendimiento_esperado > 0 && (
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>esperado: {cam.rendimiento_esperado?.toFixed(2)} km/L</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alertas baja confianza (gris, sin alarma) */}
      {alertasBaja.length > 0 && (
        <div className="mt-1">
          <div className="font-exo text-[7px] uppercase mb-1" style={{ color: "#1a3a55" }}>Baja confianza ({alertasBaja.length}) — sin alarma</div>
          <div className="flex flex-wrap gap-1">
            {alertasBaja.slice(0, 8).map((cam: any) => (
              <span key={cam.patente} className="font-space text-[9px] px-1.5 py-0.5 rounded" style={{ color: "#3a6080", background: "#0a1520", border: "1px solid #0d2035" }}>
                {cam.patente}
              </span>
            ))}
            {alertasBaja.length > 8 && <span className="font-exo text-[8px]" style={{ color: "#1a3a55" }}>+{alertasBaja.length - 8} mas</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Resumen Mensual Acumulado
// ═══════════════════════════════════════════════════

function ResumenMesPanel({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/resumen-mes"],
    queryFn: async () => {
      const r = await fetch("/api/resumen-mes");
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="dash-card px-4 py-8 flex items-center justify-center">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" style={{ color: "#3a6080" }} />
        <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Cargando resumen del mes...</span>
      </div>
    );
  }

  if (!data || data.error) return null;

  const FAENA_COLORS: Record<string, string> = { "CENCOSUD": "#00d4ff" };

  return (
    <div className="space-y-3" style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div className="dash-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5" style={{ color: "#00d4ff" }} />
          <div>
            <div className="font-space text-[15px] font-bold" style={{ color: "#00d4ff" }}>RESUMEN {data.mes_nombre?.toUpperCase()} {data.anio}</div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Acumulado flota Cencosud · Fuente: WiseTrack Telemetria</div>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-1 px-3 py-1.5 rounded cursor-pointer font-exo text-[9px] font-bold"
          style={{ background: "#ff224410", border: "1px solid #ff224430", color: "#ff2244" }}>
          <X className="w-3 h-3" /> Cerrar
        </button>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-7 gap-2">
        {[
          { label: "CAMIONES", value: data.kpis?.camiones || 0, color: "#00d4ff" },
          { label: "KM TOTAL", value: (data.kpis?.km_total || 0).toLocaleString(), color: "#c8e8ff" },
          { label: "LITROS", value: (data.kpis?.litros_total || 0).toLocaleString(), color: "#c8e8ff" },
          { label: "KM/L PROM", value: data.kpis?.rendimiento_promedio?.toFixed(2) || "--", color: getRendColor(data.kpis?.rendimiento_promedio || 0) },
          { label: "CARGAS", value: data.kpis?.cargas || 0, color: "#c8e8ff" },
          { label: "DIAS OP", value: data.kpis?.dias_operacion || 0, color: "#c8e8ff" },
          { label: "CONDUCTORES", value: data.kpis?.conductores || 0, color: "#c8e8ff" },
        ].map(k => (
          <div key={k.label} className="dash-card px-2 py-2.5 text-center">
            <div className="font-space text-[18px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
            <div className="font-exo text-[7px] tracking-[0.12em] uppercase mt-1" style={{ color: "#3a6080" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Por contrato */}
      <div className="dash-card px-4 py-3">
        <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>POR CONTRATO</div>
        <div className="space-y-1.5">
          {(data.por_contrato || []).map((c: any) => {
            const color = FAENA_COLORS[c.contrato] || "#c8e8ff";
            return (
              <div key={c.contrato} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: "#0a1520", border: `1px solid ${color}20` }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="font-exo text-[10px] font-bold" style={{ color }}>{c.contrato}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.camiones} cam</span>
                  <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.km?.toLocaleString()} km</span>
                  <span className="font-space text-[10px] font-bold" style={{ color: getRendColor(c.rendimiento) }}>{c.rendimiento} km/L</span>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.litros?.toLocaleString()}L</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Top camiones */}
        <div className="dash-card px-3 py-3">
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>TOP 10 CAMIONES POR KM</div>
          <div className="space-y-1">
            {(data.top_camiones || []).map((c: any, i: number) => (
              <div key={c.patente} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1520" }}>
                <div className="flex items-center gap-2">
                  <span className="font-space text-[9px] w-4 text-right" style={{ color: "#3a6080" }}>{i + 1}</span>
                  <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{c.km?.toLocaleString()} km</span>
                  <span className="font-space text-[9px]" style={{ color: getRendColor(c.rendimiento) }}>{c.rendimiento} km/L</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.dias}d</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top conductores */}
        <div className="dash-card px-3 py-3">
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>TOP 10 CONDUCTORES POR KM</div>
          <div className="space-y-1">
            {(data.top_conductores || []).map((c: any, i: number) => (
              <div key={c.conductor} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1520" }}>
                <div className="flex items-center gap-2">
                  <span className="font-space text-[9px] w-4 text-right" style={{ color: "#3a6080" }}>{i + 1}</span>
                  <span className="font-exo text-[10px] font-bold truncate" style={{ color: "#c8e8ff", maxWidth: 140 }}>{c.conductor}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{c.km?.toLocaleString()} km</span>
                  <span className="font-space text-[9px]" style={{ color: getRendColor(c.rendimiento) }}>{c.rendimiento} km/L</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.camiones} cam</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Acumulado diario */}
      <div className="dash-card px-3 py-3">
        <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>ACTIVIDAD DIARIA DEL MES</div>
        <div className="space-y-0.5">
          {(data.por_dia || []).map((d: any) => {
            const maxKm = Math.max(...(data.por_dia || []).map((x: any) => x.km));
            const pct = maxKm > 0 ? (d.km / maxKm) * 100 : 0;
            const esHoy = new Date(d.fecha).toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
            return (
              <div key={d.fecha} className="flex items-center gap-2">
                <span className="font-exo text-[8px] w-16 text-right" style={{ color: esHoy ? "#00d4ff" : "#3a6080" }}>
                  {new Date(d.fecha + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                </span>
                <div className="flex-1 h-4 rounded overflow-hidden relative" style={{ background: "#0a1520" }}>
                  <div className="h-full rounded" style={{ width: `${pct}%`, background: esHoy ? "#00d4ff50" : "#00ff8830" }} />
                  <div className="absolute inset-0 flex items-center px-2">
                    <span className="font-exo text-[7px]" style={{ color: "#c8e8ff" }}>{d.km?.toLocaleString()} km · {d.camiones} cam · {d.cargas} cargas</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ViajesCerrados() {
  const [faenaFilter, setFaenaFilter] = useState<string>("TODOS");
  const [selectedViaje, setSelectedViaje] = useState<any | null>(null);
  const [viajeReplay, setViajeReplay] = useState<any | null>(null);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const layersRef = useRef<any[]>([]);

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

  const viajes = data?.viajes || [];

  const getColor = (c: string): string => {
    if (c?.includes("CENCOSUD") || c?.includes("WALMART")) return "#00bfff";
    if (c?.includes("INDURA") || c?.includes("AIR LIQUIDE")) return "#a855f7";
    if (c?.includes("GLENCORE") || c?.includes("ACIDO")) return "#ff8c00";
    if (c?.includes("Bluex") || c?.includes("CHILEXPRESS") || c?.includes("MELI")) return "#ff69b4";
    if (c?.includes("COPEC") || c?.includes("GASCO") || c?.includes("LIPIGAS")) return "#ffd700";
    if (c?.includes("MININCO")) return "#8b4513";
    return "#c8e8ff";
  };

  const contratos = useMemo(() => {
    const map = new Map<string, number>();
    viajes.forEach((v: any) => {
      if (v.contrato) map.set(v.contrato, (map.get(v.contrato) || 0) + 1);
    });
    return Array.from(map.entries()).map(([c, n]) => ({ contrato: c, cantidad: n })).sort((a, b) => b.cantidad - a.cantidad);
  }, [viajes]);

  // Filter viajes by day if dayFilter is set
  const filteredViajes = useMemo(() => {
    if (!dayFilter) return viajes;
    // dayFilter is in the current month, viajes are from yesterday
    // If dayFilter matches ayer, show all, otherwise show empty (since we only have 1 day of viajes)
    return dayFilter === ayer ? viajes : viajes;
  }, [viajes, dayFilter, ayer]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !isGoogleMapsReady()) return;
    mapInstanceRef.current = createDarkMap(mapRef.current, {
      center: { lat: -33.45, lng: -70.65 },
      zoom: 6,
    });
    return () => { mapInstanceRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isGoogleMapsReady()) return;

    layersRef.current.forEach((l: any) => { try { if (l.setMap) l.setMap(null); else if (l.map !== undefined) l.map = null; } catch {} });
    layersRef.current = [];

    if (!selectedViaje || !selectedViaje.puntos_gps?.length) return;

    const pts = selectedViaje.puntos_gps.filter((p: any) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng));
    if (pts.length < 2) return;

    const rend = selectedViaje.rendimiento || 0;
    const routeColor = getRendColor(rend);

    const path = pts.map((p: any) => ({ lat: p.lat, lng: p.lng }));
    const line = new google.maps.Polyline({ map, path, strokeColor: routeColor, strokeWeight: 3.5, strokeOpacity: 0.85 });
    layersRef.current.push(line);

    const paradas = detectarParadas(pts);
    const first = pts[0];
    const last = pts[pts.length - 1];

    const startMarker = new google.maps.Marker({
      map,
      position: { lat: first.lat, lng: first.lng },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#0066ff", fillOpacity: 1, strokeColor: "#020508", strokeWeight: 2 },
    });
    addInfoWindow(map, startMarker, `<div style="font-family:monospace;font-size:10px;"><b>${selectedViaje.patente}</b> · ${rend > 0 ? rend.toFixed(2) + " km/L" : ""}<br/>${selectedViaje.lugar_origen || "Origen"}</div>`, true);
    layersRef.current.push(startMarker);

    const endMarker = new google.maps.Marker({
      map,
      position: { lat: last.lat, lng: last.lng },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: routeColor, fillOpacity: 1, strokeColor: "#020508", strokeWeight: 2 },
    });
    addInfoWindow(map, endMarker, `<div style="font-family:monospace;font-size:10px;">${selectedViaje.lugar_destino || "Destino"}</div>`);
    layersRef.current.push(endMarker);

    for (const parada of paradas) {
      if (parada.nombre === selectedViaje.lugar_origen && parada === paradas[0]) continue;
      if (parada.nombre === selectedViaje.lugar_destino && parada === paradas[paradas.length - 1]) continue;
      const isLong = parada.minutos >= 10;
      const mkColor = isLong ? "#00d4ff" : "#ffcc0060";
      const mk = new google.maps.Marker({
        map,
        position: { lat: parada.lat, lng: parada.lng },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: isLong ? 8 : 4, fillColor: mkColor, fillOpacity: 0.9, strokeColor: mkColor, strokeWeight: 2 },
      });
      addInfoWindow(map, mk, `<div style="font-family:monospace;font-size:11px;"><b>${isLong ? "PARADA" : "PASO"}</b><br/>${parada.nombre}<br/>${formatMinutos(parada.minutos)}</div>`);
      layersRef.current.push(mk);
    }

    fitBoundsToPoints(map, path, 40);
  }, [selectedViaje]);

  const formatHora = (f: string | null) => {
    if (!f) return "--";
    return new Date(f).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  const handleDayFilter = useCallback((fecha: string) => {
    setDayFilter(prev => prev === fecha ? null : fecha);
  }, []);

  const handlePointHighlight = useCallback((fecha: string) => {
    // Find first viaje on this date and select it
    const match = viajes.find((v: any) => {
      const vFecha = v.hora_inicio ? new Date(v.hora_inicio).toISOString().split("T")[0] : "";
      return vFecha === fecha;
    });
    if (match) setSelectedViaje(match);
  }, [viajes]);

  const [selectedCamion, setSelectedCamion] = useState<string | null>(null);
  const [showResumenMes, setShowResumenMes] = useState(false);

  // Build list of unique camiones from viajes
  const camionesDelDia = useMemo(() => {
    const map = new Map<string, { patente: string; contrato: string; viajes: number; km: number; rendimiento: number; litros: number; conductor: string | null; conductores: Set<string> }>();
    viajes.forEach((v: any) => {
      const existing = map.get(v.patente);
      const km = v.km_total || 0;
      const rend = v.rendimiento || 0;
      if (existing) {
        existing.viajes += 1;
        existing.km += km;
        existing.litros += (rend > 0 && km > 0) ? km / rend : 0;
        if (v.conductor) existing.conductores.add(v.conductor);
      } else {
        const conductores = new Set<string>();
        if (v.conductor) conductores.add(v.conductor);
        map.set(v.patente, {
          patente: v.patente,
          contrato: v.contrato || "",
          viajes: 1,
          km,
          rendimiento: 0,
          litros: (rend > 0 && km > 0) ? km / rend : 0,
          conductor: v.conductor || null,
          conductores,
        });
      }
    });
    // Calculate avg rendimiento
    for (const cam of map.values()) {
      cam.rendimiento = cam.litros > 0 ? cam.km / cam.litros : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.km - a.km);
  }, [viajes]);

  return (
    <div data-testid="geo-viajes-cerrados">
      {/* Header + filters */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-rajdhani text-sm font-bold" style={{ color: "#c8e8ff" }}>Viajes del Dia</div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>{viajes.length} viajes -- {ayer} (cerrados) -- {camionesDelDia.length} camiones</div>
        </div>
        <div className="flex items-center gap-2">
          {dayFilter && (
            <button onClick={() => setDayFilter(null)} className="font-exo text-[9px] px-2 py-1 rounded cursor-pointer"
              style={{ background: "#ff224415", border: "1px solid #ff224440", color: "#ff2244" }}>
              Limpiar filtro dia
            </button>
          )}
          <button onClick={() => setShowResumenMes(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer font-exo text-[9px] font-bold tracking-wider transition-all"
            style={{
              background: showResumenMes ? "#00d4ff15" : "#060d14",
              border: `1px solid ${showResumenMes ? "#00d4ff" : "#0d2035"}`,
              color: showResumenMes ? "#00d4ff" : "#3a6080",
            }}>
            <Calendar className="w-3 h-3" />
            RESUMEN MES
          </button>
        </div>
      </div>

      {/* Resumen mensual */}
      {showResumenMes && (
        <>
          <SupervisionWidget />
          <ResumenMesPanel onClose={() => setShowResumenMes(false)} />
        </>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        <button onClick={() => setFaenaFilter("TODOS")}
          className="font-exo text-xs font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
          style={{
            background: faenaFilter === "TODOS" ? "#00d4ff20" : "#0a1520",
            border: `1px solid ${faenaFilter === "TODOS" ? "#00d4ff" : "#0d2035"}`,
            color: faenaFilter === "TODOS" ? "#00d4ff" : "#3a6080",
          }}>
          TODOS ({viajes.length})
        </button>
        {contratos.map((cs) => (
          <button key={cs.contrato} onClick={() => setFaenaFilter(cs.contrato)}
            className="font-exo text-xs font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: faenaFilter === cs.contrato ? getColor(cs.contrato) + "20" : "#0a1520",
              border: `1px solid ${faenaFilter === cs.contrato ? getColor(cs.contrato) : "#0d2035"}`,
              color: faenaFilter === cs.contrato ? getColor(cs.contrato) : "#3a6080",
            }}>
            {cs.contrato} ({cs.cantidad})
          </button>
        ))}
      </div>

      {/* MAP — full width */}
      <div className="grid grid-cols-1 gap-3">
        {/* Map - full width */}
        <div className="dash-card overflow-hidden relative" style={{ height: 380 }}>
          <div ref={mapRef} className="w-full h-full" />
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
                className="font-exo text-[11px] font-bold px-2.5 py-1.5 rounded cursor-pointer flex items-center gap-1"
                style={{ background: "rgba(2,5,8,0.9)", border: "1px solid #ff2244", color: "#ff2244" }}>
                <X className="w-3 h-3" /> CERRAR
              </button>
            </div>
          )}
          {/* Rendimiento legend */}
          {selectedViaje && (
            <div className="absolute bottom-2 left-2 z-[1000] flex gap-2">
              {[
                { color: "#0066ff", label: "Origen" },
                { color: "#00ff88", label: ">= 2.85" },
                { color: "#ffcc00", label: "2.3-2.85" },
                { color: "#ff2244", label: "< 2.3" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: "rgba(2,5,8,0.85)" }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  <span className="font-exo text-xs" style={{ color: "#c8e8ff" }}>{l.label}</span>
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

        {/* Trip list - hidden, viajes moved to camion detail */}
        <div className="dash-card px-0 py-0 overflow-y-auto" style={{ height: 450, display: "none" }}>
          <div className="px-3 py-2 sticky top-0 z-10" style={{ background: "#0a1929", borderBottom: "1px solid #0d2035" }}>
            <span className="font-exo text-[11px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>
              VIAJES ({filteredViajes.length})
            </span>
          </div>
          <div className="space-y-0">
            {filteredViajes.map((v: any, i: number) => {
              const isSelected = selectedViaje?.patente === v.patente && selectedViaje?.hora_inicio === v.hora_inicio;
              const color = getColor(v.contrato || "");
              const paradas = detectarParadas(v.puntos_gps || []);
              const paradasLargas = paradas.filter((p: ParadaDetectada) => p.minutos >= 10);
              const durMin = v.duracion_min || 0;
              const durH = Math.floor(durMin / 60);
              const durM = durMin % 60;
              const rendColor = v.rendimiento ? getRendColor(v.rendimiento) : "#3a6080";
              return (
                <div key={`${v.patente}-${i}`}
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
                      {v.conductor && <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{v.conductor}</span>}
                      {v.contrato && (
                        <span className="font-exo text-xs px-1 py-0.5 rounded" style={{ background: color + "15", color, border: `1px solid ${color}30` }}>
                          {v.contrato}
                        </span>
                      )}
                    </div>
                    <span className="font-space text-xs font-bold" style={{ color: "#c8e8ff" }}>{v.km_total} km</span>
                  </div>

                  <div className="mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#0066ff" }} />
                      <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>
                        {v.lugar_origen} <span style={{ color: "#3a6080" }}>{formatHora(v.hora_inicio)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: rendColor }} />
                      <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>
                        {v.lugar_destino} <span style={{ color: "#3a6080" }}>{formatHora(v.hora_fin)}</span>
                      </span>
                    </div>
                  </div>

                  {isSelected && paradasLargas.length > 0 && (
                    <div className="my-1.5 px-2 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d203540" }}>
                      <div className="font-exo text-xs tracking-[0.1em] uppercase mb-1" style={{ color: "#3a6080" }}>RUTA VERIFICADA</div>
                      <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>
                        {v.lugar_origen}
                        {paradasLargas.map((p: ParadaDetectada, pi: number) => (
                          <span key={pi}>
                            <span style={{ color: "#3a6080" }}> → </span>
                            <span style={{ color: "#00d4ff" }}>{p.nombre}</span>
                            <span style={{ color: "#3a6080" }}> ({formatMinutos(p.minutos)})</span>
                          </span>
                        ))}
                        <span style={{ color: "#3a6080" }}> → </span>
                        {v.lugar_destino}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-space text-[11px]" style={{ color: "#3a6080" }}>
                        {durH > 0 ? `${durH}h ${durM}min` : `${durM}min`}
                      </span>
                      {v.rendimiento && (
                        <span className="font-space text-[11px] font-bold" style={{ color: rendColor }}>
                          {v.rendimiento.toFixed(2)} km/L
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {v.total_puntos >= 2 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setViajeReplay(v); }}
                          className="flex items-center gap-1 px-2 py-0.5 font-exo text-[11px] font-bold cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.15)]"
                          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}>
                          <span style={{ fontSize: '13px' }}>&#x1F69A;</span>
                          RECREAR
                        </button>
                      )}
                      <span className="font-exo text-xs px-1.5 py-0.5 rounded"
                        style={{ background: color + "15", color, border: `1px solid ${color}30` }}>
                        {v.total_puntos} pts
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredViajes.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <Route className="w-5 h-5 mx-auto mb-2" style={{ color: "#3a6080" }} />
                <div className="font-exo text-xs" style={{ color: "#3a6080" }}>Sin viajes GPS para {ayer}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SECCION INFERIOR: GRILLA CAMIONES + DETALLE MENSUAL ═══ */}
      {camionesDelDia.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4" style={{ color: "#00d4ff" }} />
              <span className="font-exo text-[11px] tracking-[0.15em] uppercase font-bold" style={{ color: "#3a6080" }}>
                CAMIONES DEL DIA
              </span>
              <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{camionesDelDia.length}</span>
            </div>
            {selectedCamion && (
              <button onClick={() => setSelectedCamion(null)} className="font-exo text-xs px-2.5 py-1 rounded cursor-pointer flex items-center gap-1"
                style={{ background: "#ff224410", border: "1px solid #ff224430", color: "#ff2244" }}>
                <X className="w-3 h-3" /> Cerrar detalle
              </button>
            )}
          </div>

          {/* Camion cards grid */}
          <div className="grid grid-cols-6 gap-2 mb-3">
            {camionesDelDia.map(cam => {
              const isSelected = selectedCamion === cam.patente;
              const color = getColor(cam.contrato);
              const rendColor = cam.rendimiento > 0 ? getRendColor(cam.rendimiento) : "#3a6080";
              const isAlert = cam.rendimiento > 0 && cam.rendimiento < 2.3;
              const rendPct = cam.rendimiento > 0 ? Math.min(100, (cam.rendimiento / 3.5) * 100) : 0;
              return (
                <div key={cam.patente}
                  onClick={() => setSelectedCamion(isSelected ? null : cam.patente)}
                  className="relative px-2.5 py-2 rounded cursor-pointer transition-all hover:scale-[1.02]"
                  style={{
                    background: isSelected ? `${color}12` : "#060d14",
                    border: isAlert && !isSelected ? "1px solid #ff224450" : `1px solid ${isSelected ? color : "#0d2035"}`,
                    borderBottom: isSelected ? `2.5px solid ${color}` : undefined,
                    animation: isAlert && !isSelected ? "alertPulse 2s infinite" : undefined,
                  }}>
                  {/* Patente grande + tipo badge */}
                  <div className="flex items-center gap-1 mb-1">
                    <span className="font-space text-[18px] font-bold leading-none" style={{
                      color: isSelected ? color : isAlert ? "#ff2244" : cam.rendimiento >= 2.85 ? "#00ff88" : "#c8e8ff"
                    }}>
                      {cam.patente}
                    </span>
                    {!/^\d+$/.test(cam.patente) && (
                      <span className="font-exo text-[6px] font-bold px-1 py-0.5 rounded" style={{
                        color: "#3a6080", background: "#0d2035", border: "1px solid #1a3a5530",
                      }}>PAT</span>
                    )}
                  </div>
                  {/* km/L + km */}
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="font-space text-[12px] font-bold" style={{ color: rendColor }}>
                      {cam.rendimiento > 0 ? cam.rendimiento.toFixed(2) : "--"} <span className="text-xs font-normal">km/L</span>
                    </span>
                    <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{Math.round(cam.km)} km</span>
                  </div>
                  {/* Barra rendimiento */}
                  <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${rendPct}%`, background: rendColor }} />
                  </div>
                  {/* Viajes count */}
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{cam.viajes} viaje{cam.viajes !== 1 ? "s" : ""}</span>
                    {cam.conductor && (
                      <span className="font-exo text-[7px] truncate max-w-[70px]" style={{ color: "#3a6080" }}>
                        {cam.conductor}{cam.conductores.size > 1 ? ` +${cam.conductores.size - 1}` : ""}
                      </span>
                    )}
                  </div>
                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-1 right-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detalle del camion seleccionado */}
          {selectedCamion && (
            <CamionDetalle
              patente={selectedCamion}
              onDayFilter={handleDayFilter}
              onPointHighlight={handlePointHighlight}
              viajesDelDia={viajes.filter((v: any) => v.patente === selectedCamion)}
              onSelectViaje={(v: any) => setSelectedViaje(v)}
              onReplay={(v: any) => setViajeReplay(v)}
              selectedViaje={selectedViaje}
            />
          )}

          {/* Si no hay camion seleccionado, mostrar resumen global */}
          {!selectedCamion && (
            <div className="dash-card px-4 py-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="px-3 py-3 rounded text-center" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[22px] font-bold" style={{ color: "#00d4ff" }}>{camionesDelDia.length}</div>
                  <div className="font-exo text-xs tracking-[0.15em] uppercase mt-1" style={{ color: "#3a6080" }}>CAMIONES</div>
                </div>
                <div className="px-3 py-3 rounded text-center" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[22px] font-bold" style={{ color: "#c8e8ff" }}>{viajes.length}</div>
                  <div className="font-exo text-xs tracking-[0.15em] uppercase mt-1" style={{ color: "#3a6080" }}>VIAJES</div>
                </div>
                <div className="px-3 py-3 rounded text-center" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[22px] font-bold" style={{ color: "#c8e8ff" }}>
                    {Math.round(camionesDelDia.reduce((s, c) => s + c.km, 0)).toLocaleString()}
                  </div>
                  <div className="font-exo text-xs tracking-[0.15em] uppercase mt-1" style={{ color: "#3a6080" }}>KM TOTAL</div>
                </div>
                <div className="px-3 py-3 rounded text-center" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  {(() => {
                    const totalKm = camionesDelDia.reduce((s, c) => s + c.km, 0);
                    const totalLt = camionesDelDia.reduce((s, c) => s + c.litros, 0);
                    const avgRend = totalLt > 0 ? totalKm / totalLt : 0;
                    return (
                      <>
                        <div className="font-space text-[22px] font-bold" style={{ color: avgRend > 0 ? getRendColor(avgRend) : "#3a6080" }}>
                          {avgRend > 0 ? avgRend.toFixed(2) : "--"}
                        </div>
                        <div className="font-exo text-xs tracking-[0.15em] uppercase mt-1" style={{ color: "#3a6080" }}>KM/L PROM</div>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="font-exo text-[11px] text-center mt-3" style={{ color: "#3a6080" }}>
                Click en un camion para ver su resumen mensual completo
              </div>
            </div>
          )}
        </div>
      )}

      {/* Replay modal */}
      {viajeReplay && (
        <ReplayModal viaje={viajeReplay} onClose={() => setViajeReplay(null)} />
      )}

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes alertPulse {
          0%, 100% { border-color: #ff224450; box-shadow: none; }
          50% { border-color: #ff2244; box-shadow: 0 0 8px #ff224430; }
        }
        @keyframes todayPulse {
          0%, 100% { border-color: #00d4ff60; }
          50% { border-color: #00d4ff; box-shadow: 0 0 6px #00d4ff30; }
        }
      `}</style>
    </div>
  );
}
