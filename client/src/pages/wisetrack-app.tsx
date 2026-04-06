import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Truck, Settings, Search, Fuel, Gauge, Activity, ThermometerSun, BarChart3 } from "lucide-react";
import { Map as GMap, AdvancedMarker } from "@vis.gl/react-google-maps";
import CencosudView from "./cencosud";

interface WTVehicle {
  patente: string;
  etiqueta: string;
  lat: number;
  lng: number;
  velocidad: number;
  heading: number;
  estado: "en_ruta" | "detenido" | "ralenti" | "sin_senal";
  estadoWt: string;
  ignicion: boolean;
  conductor: string;
  grupo1: string;
  kmsTotal: number;
  nivelEstanque: number;
  rpm: number;
  tempMotor: number;
  fecha: string;
  minutosAgo: number;
  ultimoViaje: { inicio: string; fin: string; kms: number };
}

interface WTResponse {
  vehiculos: WTVehicle[];
  resumen: { total: number; en_ruta: number; detenido: number; ralenti: number; sin_senal: number };
  timestamp: string;
}

const ESTADO_CFG: Record<string, { color: string; label: string; dotColor: string }> = {
  en_ruta: { color: "#00ff88", label: "EN RUTA", dotColor: "#00ff88" },
  detenido: { color: "#ff6b35", label: "DETENIDO", dotColor: "#ff6b35" },
  ralenti: { color: "#ffcc00", label: "RALENTÍ", dotColor: "#ffcc00" },
  sin_senal: { color: "#ff2244", label: "SIN SEÑAL", dotColor: "#ff2244" },
};

type WTTab = "flota" | "camiones" | "tms" | "sistema";

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
      setTime(`${months[now.getMonth()]} ${now.getDate()} · ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-space text-[11px]" style={{ color: "#4a7090" }}>{time}</span>;
}

function WTFlota() {
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [selectedPatente, setSelectedPatente] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: -33.45, lng: -70.65 });
  const [mapZoom, setMapZoom] = useState(6);

  const { data, isLoading } = useQuery<WTResponse>({
    queryKey: ["/api/wisetrack/en-vivo"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/en-vivo"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    refetchInterval: 30000,
    retry: 2,
  });

  const filtered = useMemo(() => {
    if (!data?.vehiculos) return [];
    let list = data.vehiculos;
    if (filtroEstado) list = list.filter((v) => v.estado === filtroEstado);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((v) => v.patente.toLowerCase().includes(s) || v.etiqueta.toLowerCase().includes(s) || v.conductor.toLowerCase().includes(s));
    }
    return list.sort((a, b) => {
      const order = { en_ruta: 0, ralenti: 1, detenido: 2, sin_senal: 3 };
      return (order[a.estado] ?? 4) - (order[b.estado] ?? 4);
    });
  }, [data, filtroEstado, search]);

  const selected = selectedPatente ? data?.vehiculos.find((v) => v.patente === selectedPatente) : null;

  const selectVehicle = (v: WTVehicle) => {
    setSelectedPatente(v.patente === selectedPatente ? null : v.patente);
    if (v.lat && v.lng) {
      setMapCenter({ lat: v.lat, lng: v.lng });
      setMapZoom(14);
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-110px)]">
      {/* Left: Map */}
      <div className="flex-1 rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
        <GMap
          mapId="wt-fleet-map"
          center={mapCenter}
          zoom={mapZoom}
          onCameraChanged={(ev) => { setMapCenter(ev.detail.center); setMapZoom(ev.detail.zoom); }}
          gestureHandling="greedy"
          disableDefaultUI={true}
          style={{ width: "100%", height: "100%" }}
          colorScheme="DARK"
        >
          {(data?.vehiculos || []).filter(v => v.lat && v.lng).map((v) => {
            const cfg = ESTADO_CFG[v.estado] || ESTADO_CFG.sin_senal;
            const isSelected = v.patente === selectedPatente;
            return (
              <AdvancedMarker
                key={v.patente}
                position={{ lat: v.lat, lng: v.lng }}
                onClick={() => selectVehicle(v)}
              >
                <div className="relative cursor-pointer" style={{ transform: isSelected ? "scale(1.4)" : "scale(1)", transition: "transform 0.2s" }}>
                  <div className="w-4 h-4 rounded-full border-2" style={{ background: cfg.dotColor, borderColor: isSelected ? "#fff" : cfg.dotColor, boxShadow: `0 0 ${isSelected ? 12 : 6}px ${cfg.dotColor}` }} />
                  {(isSelected || mapZoom >= 10) && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded" style={{ background: "#020508ee", border: `1px solid ${cfg.dotColor}40` }}>
                      <span className="font-space text-[8px] font-bold" style={{ color: cfg.dotColor }}>{v.etiqueta}</span>
                      {v.velocidad > 0 && <span className="font-space text-[7px] ml-1" style={{ color: "#c8e8ff" }}>{v.velocidad}km/h</span>}
                    </div>
                  )}
                </div>
              </AdvancedMarker>
            );
          })}
        </GMap>
      </div>

      {/* Right: Panel */}
      <div className="w-[380px] flex flex-col" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        {/* Summary */}
        {data?.resumen && (
          <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
            {[
              { key: null, label: "TODOS", count: data.resumen.total, color: "#06b6d4" },
              { key: "en_ruta", label: "RUTA", count: data.resumen.en_ruta, color: "#00ff88" },
              { key: "detenido", label: "DET", count: data.resumen.detenido, color: "#ff6b35" },
              { key: "ralenti", label: "RAL", count: data.resumen.ralenti, color: "#ffcc00" },
              { key: "sin_senal", label: "S/S", count: data.resumen.sin_senal, color: "#ff2244" },
            ].map((b) => (
              <button key={b.key || "all"} onClick={() => setFiltroEstado(b.key)} className="flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer"
                style={{ background: filtroEstado === b.key ? `${b.color}15` : "transparent", border: `1px solid ${filtroEstado === b.key ? b.color + "40" : "transparent"}` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                <span className="font-space text-[10px] font-bold" style={{ color: b.color }}>{b.count}</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{b.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "#3a6080" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar patente, etiqueta..."
              className="w-full pl-8 pr-3 py-1.5 rounded font-exo text-[10px]" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff", outline: "none" }} />
          </div>
        </div>

        {/* Vehicle list */}
        <div className="flex-1 overflow-auto px-2 py-1 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="font-exo text-[11px]" style={{ color: "#4a7090" }}>Conectando WiseTrack...</div>
            </div>
          ) : filtered.map((v) => {
            const cfg = ESTADO_CFG[v.estado] || ESTADO_CFG.sin_senal;
            return (
              <button key={v.patente} onClick={() => selectVehicle(v)} className="w-full text-left px-3 py-2 rounded transition-all cursor-pointer"
                style={{ background: selectedPatente === v.patente ? "#0d1f30" : "#060d14", border: `1px solid ${selectedPatente === v.patente ? cfg.color + "30" : "#0a1520"}` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.etiqueta}</span>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.patente}</span>
                      </div>
                      <div className="font-exo text-[8px]" style={{ color: "#4a7090" }}>
                        {v.conductor !== "Sin Conductor Registrado" ? v.conductor : "Sin conductor"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-space text-[9px] font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
                    {v.velocidad > 0 && <span className="font-space text-[9px]" style={{ color: "#06b6d4" }}>{v.velocidad} km/h</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="border-t overflow-auto" style={{ borderColor: "#0d2035", maxHeight: "40%" }}>
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{selected.etiqueta}</span>
                  <span className="font-exo text-[10px] ml-2" style={{ color: "#3a6080" }}>{selected.patente}</span>
                </div>
                <button onClick={() => setSelectedPatente(null)} className="font-space text-[12px] cursor-pointer" style={{ color: "#3a6080" }}>×</button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: Gauge, label: "KMS", value: Math.round(selected.kmsTotal).toLocaleString(), color: "#06b6d4" },
                  { icon: Fuel, label: "ESTANQUE", value: `${selected.nivelEstanque}%`, color: selected.nivelEstanque < 20 ? "#ff2244" : "#00ff88" },
                  { icon: Activity, label: "RPM", value: `${selected.rpm}`, color: selected.rpm > 1800 ? "#ff6b35" : "#c8e8ff" },
                  { icon: ThermometerSun, label: "TEMP", value: `${selected.tempMotor}°C`, color: selected.tempMotor > 95 ? "#ff2244" : "#c8e8ff" },
                ].map((t) => (
                  <div key={t.label} className="text-center p-1.5 rounded" style={{ background: "#0a1520" }}>
                    <t.icon className="w-3 h-3 mx-auto mb-0.5" style={{ color: "#3a6080" }} />
                    <div className="font-space text-[11px] font-bold" style={{ color: t.color }}>{t.value}</div>
                    <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{t.label}</div>
                  </div>
                ))}
              </div>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                WiseTrack: {selected.estadoWt} · {selected.fecha}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WTCamiones() {
  const [search, setSearch] = useState("");
  const [selectedPatente, setSelectedPatente] = useState<string | null>(null);

  const { data } = useQuery<WTResponse>({
    queryKey: ["/api/wisetrack/en-vivo"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/en-vivo"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 30000,
  });

  const camiones = useMemo(() => {
    let list = data?.vehiculos || [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((v) => v.patente.toLowerCase().includes(s) || v.etiqueta.toLowerCase().includes(s) || v.conductor.toLowerCase().includes(s));
    }
    return list.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  }, [data, search]);

  const selected = selectedPatente ? data?.vehiculos.find((v) => v.patente === selectedPatente) : null;

  const { data: historial } = useQuery<any>({
    queryKey: ["/api/wisetrack/historial", selectedPatente],
    queryFn: async () => { const r = await fetch(`/api/wisetrack/historial/${selectedPatente}?horas=24`); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    enabled: !!selectedPatente,
    staleTime: 60000,
  });

  if (selectedPatente && selected) {
    const cfg = ESTADO_CFG[selected.estado] || ESTADO_CFG.sin_senal;
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedPatente(null)} className="font-exo text-[10px] px-2 py-1 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>← VOLVER</button>
        <div style={{ background: "#060d14", border: `1px solid ${cfg.color}30`, borderTop: `2px solid ${cfg.color}`, borderRadius: 8 }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-3">
              <span className="font-space text-[18px] font-bold" style={{ color: "#c8e8ff" }}>{selected.etiqueta}</span>
              <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>{selected.patente}</span>
              <span className="font-space text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: cfg.color, background: `${cfg.color}15` }}>{cfg.label}</span>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-6 gap-3 mb-4">
              {[
                { label: "KMS TOTAL", value: Math.round(selected.kmsTotal).toLocaleString(), color: "#06b6d4" },
                { label: "VELOCIDAD", value: `${selected.velocidad} km/h`, color: selected.velocidad > 0 ? "#00ff88" : "#3a6080" },
                { label: "ESTANQUE", value: `${selected.nivelEstanque}%`, color: selected.nivelEstanque < 20 ? "#ff2244" : "#00ff88" },
                { label: "RPM", value: `${selected.rpm}`, color: "#c8e8ff" },
                { label: "TEMP MOTOR", value: `${selected.tempMotor}°C`, color: selected.tempMotor > 95 ? "#ff2244" : "#c8e8ff" },
                { label: "CONDUCTOR", value: selected.conductor !== "Sin Conductor Registrado" ? selected.conductor.split(" ").slice(0, 2).join(" ") : "Sin conductor", color: "#4a7090" },
              ].map((k) => (
                <div key={k.label} className="text-center px-3 py-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                  <div className="font-space text-[16px] font-bold" style={{ color: k.color }}>{k.value}</div>
                  <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
                </div>
              ))}
            </div>

            {selected.ultimoViaje.inicio && (
              <div className="p-3 rounded mb-4" style={{ background: "#0a1520" }}>
                <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>ÚLTIMO VIAJE</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Inicio</div><div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{selected.ultimoViaje.inicio}</div></div>
                  <div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Fin</div><div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{selected.ultimoViaje.fin}</div></div>
                  <div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Distancia</div><div className="font-space text-[10px] font-bold" style={{ color: "#06b6d4" }}>{selected.ultimoViaje.kms} km</div></div>
                </div>
              </div>
            )}

            {historial?.puntos && historial.puntos.length > 0 && (
              <div className="p-3 rounded" style={{ background: "#0a1520" }}>
                <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>HISTORIAL GPS (últimas 24h) · {historial.total} registros</div>
                <div className="overflow-auto" style={{ maxHeight: 200 }}>
                  <table className="w-full">
                    <thead><tr>
                      {["HORA", "LAT", "LNG", "VEL", "RPM", "ESTADO"].map(h => (
                        <th key={h} className="px-2 py-1 text-left font-exo text-[7px]" style={{ color: "#3a6080" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {historial.puntos.slice(0, 50).map((p: any, i: number) => (
                        <tr key={i} style={{ borderTop: "1px solid #0d2035" }}>
                          <td className="px-2 py-1 font-space text-[9px]" style={{ color: "#c8e8ff" }}>{p.fecha?.substring(11, 19)}</td>
                          <td className="px-2 py-1 font-space text-[8px]" style={{ color: "#3a6080" }}>{p.lat?.toFixed(3)}</td>
                          <td className="px-2 py-1 font-space text-[8px]" style={{ color: "#3a6080" }}>{p.lng?.toFixed(3)}</td>
                          <td className="px-2 py-1 font-space text-[9px]" style={{ color: p.velocidad > 0 ? "#00ff88" : "#3a6080" }}>{p.velocidad}</td>
                          <td className="px-2 py-1 font-space text-[9px]" style={{ color: "#c8e8ff" }}>{p.rpm || "-"}</td>
                          <td className="px-2 py-1 font-exo text-[8px]" style={{ color: "#4a7090" }}>{p.estado_operacion || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar patente, etiqueta, conductor..."
        className="w-full px-4 py-2.5 font-exo text-[11px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6, color: "#c8e8ff" }} />
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
        {camiones.map((v) => {
          const cfg = ESTADO_CFG[v.estado] || ESTADO_CFG.sin_senal;
          return (
            <div key={v.patente} onClick={() => setSelectedPatente(v.patente)} className="px-2 py-2 text-center cursor-pointer transition-all hover:opacity-80"
              style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
              <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }} />
              <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.etiqueta}</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.patente}</div>
              <div className="font-space text-[9px] mt-0.5" style={{ color: cfg.color }}>{v.velocidad > 0 ? `${v.velocidad} km/h` : cfg.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WTSistema() {
  const { data: status } = useQuery<any>({
    queryKey: ["/api/wisetrack/status"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/status"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    refetchInterval: 30000,
  });

  const { data: grupos } = useQuery<any>({
    queryKey: ["/api/wisetrack/grupos"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/grupos"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 120000,
  });

  return (
    <div className="space-y-4">
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>ESTADO WISETRACK</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 6 }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: status?.sessionActive ? "#00ff88" : "#ff2244", boxShadow: `0 0 6px ${status?.sessionActive ? "#00ff88" : "#ff2244"}` }} />
              <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>WiseTrack Portal</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sesión: {status?.sessionActive ? "ACTIVA" : "INACTIVA"}</span>
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{status?.lastSyncCount || 0} vehículos</span>
              <span className="font-space text-[10px]" style={{ color: status?.lastSyncAt ? "#00ff88" : "#ff2244" }}>
                {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString("es-CL") : "Sin sync"}
              </span>
            </div>
          </div>
          {status?.lastSyncError && (
            <div className="px-3 py-2 font-exo text-[10px]" style={{ background: "#ff224410", border: "1px solid #ff224430", borderRadius: 6, color: "#ff2244" }}>
              Error: {status.lastSyncError}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
              <div className="font-space text-[20px] font-bold" style={{ color: "#06b6d4" }}>{status?.lastSyncCount || 0}</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VEHÍCULOS CENCOSUD</div>
            </div>
            <div className="text-center p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
              <div className="font-space text-[20px] font-bold" style={{ color: "#c8e8ff" }}>{status?.totalRegistros || 0}</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>POSICIONES GUARDADAS</div>
            </div>
            <div className="text-center p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
              <div className="font-space text-[20px] font-bold" style={{ color: "#00ff88" }}>120s</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>FRECUENCIA SYNC</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#06b6d4" }}>COMO FUNCIONA WISETRACK</span>
        </div>
        <div className="p-4 space-y-4">
          <div className="p-3 text-center" style={{ background: "#0a1520", borderRadius: 6 }}>
            <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#3a6080" }}>FLUJO DE DATOS</div>
            <div className="font-space text-[10px] leading-relaxed" style={{ color: "#c8e8ff" }}>
              <span style={{ color: "#06b6d4" }}>PORTAL WISETRACK</span>
              <br /><span style={{ color: "#3a6080" }}>scraping cada 120s · ASP.NET AJAX</span>
              <br /><span style={{ color: "#3a6080" }}>↓</span>
              <br /><span style={{ color: "#a855f7" }}>FILTRO CENCOSUD</span> (63 de 482 vehículos)
              <br /><span style={{ color: "#3a6080" }}>↓</span>
              <br /><span style={{ color: "#a855f7" }}>GPS + TELEMETRÍA</span> (lat, lng, vel, RPM, estanque, temp)
              <br /><span style={{ color: "#3a6080" }}>↓</span>
              <br /><span style={{ color: "#00ff88" }}>DASHBOARD</span> (mapa + fichas)
            </div>
          </div>
        </div>
      </div>

      {grupos && (
        <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>FLOTA COMPLETA SOTRASER ({grupos.totalVehiculos} vehículos)</span>
          </div>
          <div className="p-4 grid grid-cols-4 gap-2">
            {grupos.grupos?.slice(0, 20).map((g: any) => (
              <div key={g.nombre} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: g.nombre === "CENCOSUD" ? "3px solid #06b6d4" : "3px solid #0d2035" }}>
                <div className="font-space text-[12px] font-bold" style={{ color: g.nombre === "CENCOSUD" ? "#06b6d4" : "#c8e8ff" }}>{g.cantidad}</div>
                <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{g.nombre}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const WT_TABS: { id: WTTab; label: string; icon: typeof MapIcon; color: string }[] = [
  { id: "flota", label: "FLOTA", icon: MapIcon, color: "#06b6d4" },
  { id: "camiones", label: "CAMIONES", icon: Truck, color: "#06b6d4" },
  { id: "tms", label: "TMS CENCOSUD", icon: BarChart3, color: "#00ff88" },
  { id: "sistema", label: "SISTEMA", icon: Settings, color: "#3a6080" },
];

export default function WiseTrackApp({ onBack }: { onBack?: () => void } = {}) {
  const [tab, setTab] = useState<WTTab>("flota");

  const { data: wtData } = useQuery<WTResponse>({
    queryKey: ["/api/wisetrack/en-vivo"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/en-vivo"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 30000,
  });

  if (tab === "tms") {
    return <CencosudView onBack={() => setTab("flota")} gpsSource="wisetrack" />;
  }

  return (
    <div className="min-h-screen" style={{ background: "#020508", color: "#c8e8ff" }}>
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(2,5,8,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center justify-between px-4 h-[36px]">
          <div className="flex items-center gap-3">
            <button onClick={() => onBack ? onBack() : setTab("flota")} className="font-space text-[14px] font-bold tracking-[0.2em] cursor-pointer hover:opacity-80" style={{ color: "#06b6d4", background: "none", border: "none" }}>SOTRASER</button>
            <span className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>WISETRACK</span>
            <div className="w-px h-4 mx-1" style={{ background: "#0d2035" }} />
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00ff88", animation: "blink 2s infinite", boxShadow: "0 0 4px #00ff88" }} />
              <span className="font-exo text-[9px] font-bold" style={{ color: "#00ff88" }}>LIVE</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {wtData?.resumen && (
              <>
                <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{wtData.resumen.total} Cencosud</span>
                <span className="font-space text-[10px]" style={{ color: "#00ff88" }}>{wtData.resumen.en_ruta} en ruta</span>
              </>
            )}
            <LiveClock />
          </div>
        </div>
        <div className="flex items-center px-4 h-[36px] gap-1" style={{ borderTop: "1px solid #0a1520" }}>
          {WT_TABS.map((t) => {
            const isActive = tab === t.id;
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-[10px] font-bold tracking-[0.1em] cursor-pointer transition-all"
                style={{
                  background: isActive ? `${t.color}10` : "transparent",
                  borderTop: isActive ? `2px solid ${t.color}` : "2px solid transparent",
                  borderBottom: "none",
                  color: isActive ? t.color : "#3a6080",
                }}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ paddingTop: "72px" }}>
        <div className="p-4 max-w-[1600px] mx-auto">
          {tab === "flota" && <WTFlota />}
          {tab === "camiones" && <WTCamiones />}
          {tab === "sistema" && <WTSistema />}
        </div>
      </div>
    </div>
  );
}
