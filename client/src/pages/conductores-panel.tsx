import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { APIProvider, Map as GMap, AdvancedMarker } from "@vis.gl/react-google-maps";
import {
  Users, AlertTriangle, MapPin, CheckCircle, Clock, Truck, Search,
  Plus, Send, Eye, Radio, ChevronRight, X, Navigation, Loader2,
  Smartphone, ExternalLink, Maximize2, Minimize2
} from "lucide-react";

type SubTab = "vivo" | "asignar" | "gestion" | "novedades" | "app";

const ESTADO_COLORS: Record<string, string> = {
  PROGRAMADO: "#ffcc00",
  EN_RUTA: "#00ff88",
  COMPLETADO: "#06b6d4",
  CANCELADO: "#ff2244",
  PENDIENTE: "#3a6080",
  EN_CAMINO: "#ffcc00",
  COMPLETADA: "#00ff88",
  SALTADA: "#ff2244",
};

const TIPO_COLORS: Record<string, string> = {
  MECANICA: "#ff6b35",
  ACCIDENTE: "#ff2244",
  RETRASO: "#ffcc00",
  CARGA: "#06b6d4",
  OTRO: "#3a6080",
};

export default function ConductoresPanel() {
  const [subTab, setSubTab] = useState<SubTab>("vivo");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={20} style={{ color: "#00d4ff" }} />
          <h2 className="font-space text-[18px] font-bold" style={{ color: "#c8e8ff" }}>CONDUCTORES</h2>
        </div>
        <div className="flex gap-1">
          {([
            { id: "vivo" as SubTab, label: "VIAJES EN VIVO", icon: Radio, color: "#00ff88" },
            { id: "asignar" as SubTab, label: "ASIGNAR VIAJE", icon: Send, color: "#ffcc00" },
            { id: "gestion" as SubTab, label: "GESTIÓN", icon: Users, color: "#06b6d4" },
            { id: "novedades" as SubTab, label: "NOVEDADES", icon: AlertTriangle, color: "#ff6b35" },
            { id: "app" as SubTab, label: "APP CONDUCTOR", icon: Smartphone, color: "#a855f7" },
          ]).map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-[9px] font-bold cursor-pointer transition-all"
              style={{
                color: subTab === t.id ? t.color : "#3a6080",
                background: subTab === t.id ? `${t.color}15` : "transparent",
                border: `1px solid ${subTab === t.id ? `${t.color}40` : "#0d2035"}`,
                borderRadius: 6,
              }}>
              <t.icon size={10} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "vivo" && <ViajesEnVivo />}
      {subTab === "asignar" && <AsignarViaje />}
      {subTab === "gestion" && <GestionConductores />}
      {subTab === "novedades" && <NovedadesPanel />}
      {subTab === "app" && <AppConductorIframe />}
    </div>
  );
}

function ViajesEnVivo() {
  const [selectedViaje, setSelectedViaje] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: viajes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/conductor-panel/viajes-vivo"],
    queryFn: () => fetch("/api/conductor-panel/viajes-vivo").then(r => r.json()).then(d => d.viajes || []),
    refetchInterval: 15000,
  });

  const { data: tracking } = useQuery<any>({
    queryKey: ["/api/conductor-panel/viaje", selectedViaje, "tracking"],
    queryFn: () => fetch(`/api/conductor-panel/viaje/${selectedViaje}/tracking`).then(r => r.json()),
    enabled: !!selectedViaje,
    refetchInterval: 20000,
  });

  const enRuta = (viajes || []).filter(v => v.estado === "EN_RUTA");
  const programados = (viajes || []).filter(v => v.estado === "PROGRAMADO");

  const updateEstado = useCallback(async (id: number, estado: string) => {
    await fetch(`/api/conductor-panel/viaje/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    qc.invalidateQueries({ queryKey: ["/api/conductor-panel/viajes-vivo"] });
  }, [qc]);

  return (
    <div className="grid grid-cols-3 gap-4" style={{ minHeight: "calc(100vh - 180px)" }}>
      <div className="col-span-1 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Radio size={12} style={{ color: "#00ff88" }} className="animate-pulse" />
          <span className="font-exo text-[10px] font-bold" style={{ color: "#00ff88" }}>{enRuta.length} EN RUTA</span>
          <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>· {programados.length} programados</span>
        </div>

        {isLoading && <div className="text-center py-8"><Loader2 size={16} className="animate-spin mx-auto" style={{ color: "#3a6080" }} /></div>}

        {!isLoading && (viajes || []).length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Truck size={24} className="mx-auto" style={{ color: "#0d2035" }} />
            <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>No hay viajes activos</div>
            <div className="font-exo text-[9px]" style={{ color: "#0d2035" }}>Asigna un viaje en la pestaña "ASIGNAR VIAJE"</div>
          </div>
        )}

        {(viajes || []).map((v: any) => (
          <div key={v.id}
            onClick={() => setSelectedViaje(v.id)}
            className="p-3 cursor-pointer transition-all"
            style={{
              background: selectedViaje === v.id ? "#0a1628" : "#060d14",
              border: `1px solid ${selectedViaje === v.id ? ESTADO_COLORS[v.estado] + "40" : "#0d2035"}`,
              borderRadius: 8,
              borderLeft: `3px solid ${ESTADO_COLORS[v.estado]}`,
            }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.codigo}</span>
                <span className="font-exo text-[7px] px-1.5 py-0.5 font-bold"
                  style={{ color: ESTADO_COLORS[v.estado], background: `${ESTADO_COLORS[v.estado]}15`, borderRadius: 3 }}>
                  {v.estado}
                </span>
              </div>
              <ChevronRight size={12} style={{ color: "#3a6080" }} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Truck size={10} style={{ color: "#06b6d4" }} />
                <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{v.conductor}</span>
                {v.patente && <span className="font-exo text-[9px] px-1 py-0.5" style={{ color: "#ffcc00", background: "#ffcc0010", borderRadius: 3 }}>{v.patente}</span>}
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={10} style={{ color: "#3a6080" }} />
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{v.origen_nombre}</span>
              </div>
              {v.cliente && (
                <div className="font-exo text-[9px]" style={{ color: "#a855f7" }}>{v.cliente}</div>
              )}
              {v.gps && (
                <div className="flex items-center gap-2 mt-1 pt-1" style={{ borderTop: "1px solid #0d2035" }}>
                  <Navigation size={8} style={{ color: "#00ff88", transform: `rotate(${v.gps.rumbo_grados || 0}deg)` }} />
                  <span className="font-space text-[10px] font-bold" style={{ color: v.gps.velocidad_kmh > 90 ? "#ff2244" : "#00ff88" }}>
                    {Math.round(v.gps.velocidad_kmh || 0)} km/h
                  </span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                    hace {Math.round((Date.now() - new Date(v.gps.timestamp_punto).getTime()) / 60000)} min
                  </span>
                </div>
              )}
              {v.paradas && (
                <div className="flex items-center gap-1 mt-1">
                  {(v.paradas as any[]).map((p: any, i: number) => (
                    <span key={i} className="w-2 h-2 rounded-full" style={{ background: ESTADO_COLORS[p.estado] || "#3a6080" }} />
                  ))}
                  <span className="font-exo text-[8px] ml-1" style={{ color: "#3a6080" }}>
                    {(v.paradas as any[]).filter((p: any) => p.estado === "COMPLETADA").length}/{(v.paradas as any[]).length}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="col-span-2" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8, overflow: "hidden" }}>
        {!selectedViaje ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Eye size={24} style={{ color: "#0d2035" }} />
              <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Selecciona un viaje para ver tracking en vivo</div>
            </div>
          </div>
        ) : !tracking ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin" style={{ color: "#3a6080" }} />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
              <div className="flex items-center gap-3">
                <span className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{tracking.viaje.codigo}</span>
                <span className="font-exo text-[8px] px-2 py-0.5 font-bold"
                  style={{ color: ESTADO_COLORS[tracking.viaje.estado], background: `${ESTADO_COLORS[tracking.viaje.estado]}15`, borderRadius: 4 }}>
                  {tracking.viaje.estado}
                </span>
                <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{tracking.viaje.conductor}</span>
                {tracking.viaje.patente && <span className="font-exo text-[9px]" style={{ color: "#ffcc00" }}>{tracking.viaje.patente}</span>}
              </div>
              <div className="flex items-center gap-2">
                {tracking.viaje.estado === "PROGRAMADO" && (
                  <button onClick={() => updateEstado(selectedViaje, "EN_RUTA")} className="px-3 py-1 font-exo text-[9px] font-bold cursor-pointer"
                    style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 4 }}>
                    INICIAR VIAJE
                  </button>
                )}
                {tracking.viaje.estado === "EN_RUTA" && (
                  <button onClick={() => updateEstado(selectedViaje, "COMPLETADO")} className="px-3 py-1 font-exo text-[9px] font-bold cursor-pointer"
                    style={{ color: "#06b6d4", background: "#06b6d415", border: "1px solid #06b6d430", borderRadius: 4 }}>
                    COMPLETAR
                  </button>
                )}
                <button onClick={() => setSelectedViaje(null)} className="p-1 cursor-pointer" style={{ color: "#3a6080" }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 relative" style={{ minHeight: 400 }}>
              <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY || ""}>
                <GMap
                  defaultCenter={{
                    lat: tracking.trayectoria?.[tracking.trayectoria.length - 1]?.lat
                      || tracking.viaje.origen_lat || -33.45,
                    lng: tracking.trayectoria?.[tracking.trayectoria.length - 1]?.lng
                      || tracking.viaje.origen_lng || -70.65,
                  }}
                  defaultZoom={12}
                  mapId="conductor-tracking"
                  style={{ width: "100%", height: "100%" }}
                  gestureHandling="greedy"
                >
                  {tracking.viaje.origen_lat && (
                    <AdvancedMarker position={{ lat: Number(tracking.viaje.origen_lat), lng: Number(tracking.viaje.origen_lng) }}>
                      <div className="flex items-center gap-1 px-2 py-1" style={{ background: "#060d14", border: "1px solid #00ff8840", borderRadius: 4 }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: "#00ff88" }} />
                        <span className="font-exo text-[8px] font-bold" style={{ color: "#00ff88" }}>ORIGEN</span>
                      </div>
                    </AdvancedMarker>
                  )}
                  {(tracking.paradas || []).map((p: any) => p.lat && (
                    <AdvancedMarker key={p.id} position={{ lat: Number(p.lat), lng: Number(p.lng) }}>
                      <div className="flex items-center gap-1 px-2 py-1" style={{ background: "#060d14", border: `1px solid ${ESTADO_COLORS[p.estado]}40`, borderRadius: 4 }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: ESTADO_COLORS[p.estado] }} />
                        <span className="font-exo text-[7px] font-bold" style={{ color: ESTADO_COLORS[p.estado] }}>{p.orden}. {p.nombre}</span>
                      </div>
                    </AdvancedMarker>
                  ))}
                  {tracking.trayectoria?.length > 0 && (
                    <AdvancedMarker position={{
                      lat: Number(tracking.trayectoria[tracking.trayectoria.length - 1].lat),
                      lng: Number(tracking.trayectoria[tracking.trayectoria.length - 1].lng),
                    }}>
                      <div className="px-2 py-1" style={{ background: "#060d14", border: "1px solid #00d4ff40", borderRadius: 4 }}>
                        <span className="font-exo text-[8px] font-bold" style={{ color: "#00d4ff" }}>
                          🚛 {Math.round(tracking.trayectoria[tracking.trayectoria.length - 1].velocidad_kmh || 0)} km/h
                        </span>
                      </div>
                    </AdvancedMarker>
                  )}
                </GMap>
              </APIProvider>
            </div>

            <div className="p-3 space-y-2" style={{ borderTop: "1px solid #0d2035", maxHeight: 200, overflowY: "auto" }}>
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={10} style={{ color: "#a855f7" }} />
                <span className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>PARADAS</span>
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                  {(tracking.paradas || []).filter((p: any) => p.estado === "COMPLETADA").length}/{(tracking.paradas || []).length}
                </span>
                {tracking.trayectoria?.length > 0 && (
                  <span className="font-exo text-[9px] ml-auto" style={{ color: "#3a6080" }}>
                    GPS: {tracking.trayectoria.length} puntos
                  </span>
                )}
              </div>
              {(tracking.paradas || []).length === 0 ? (
                <div className="font-exo text-[9px] py-2" style={{ color: "#3a6080" }}>Sin paradas asignadas</div>
              ) : (
                <div className="space-y-1">
                  {(tracking.paradas || []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-2 py-1.5" style={{ background: "#0a1628", borderRadius: 4 }}>
                      <div className="flex items-center gap-2">
                        <span className="font-space text-[9px] font-bold" style={{ color: "#3a6080", width: 16 }}>{p.orden}</span>
                        <span className="w-2 h-2 rounded-full" style={{ background: ESTADO_COLORS[p.estado] }} />
                        <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{p.nombre}</span>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{p.tipo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-exo text-[8px] px-1.5 py-0.5"
                          style={{ color: ESTADO_COLORS[p.estado], background: `${ESTADO_COLORS[p.estado]}15`, borderRadius: 3 }}>
                          {p.estado}
                        </span>
                        {p.hora_real && (
                          <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>
                            {new Date(p.hora_real).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(tracking.novedades || []).length > 0 && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                  <span className="font-exo text-[9px] font-bold" style={{ color: "#ff6b35" }}>NOVEDADES ({tracking.novedades.length})</span>
                  {tracking.novedades.map((n: any) => (
                    <div key={n.id} className="flex items-center gap-2 mt-1 px-2 py-1" style={{ background: "#0a1628", borderRadius: 4, borderLeft: `2px solid ${TIPO_COLORS[n.tipo]}` }}>
                      <span className="font-exo text-[8px] font-bold" style={{ color: TIPO_COLORS[n.tipo] }}>{n.tipo}</span>
                      <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{n.descripcion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AsignarViaje() {
  const qc = useQueryClient();
  const [searchConductor, setSearchConductor] = useState("");
  const [searchCamion, setSearchCamion] = useState("");
  const [form, setForm] = useState({
    conductor: "", camionId: 0, patente: "", cliente: "",
    origenNombre: "", fechaSalida: "", cargaDescripcion: "",
  });
  const [paradas, setParadas] = useState<{ nombre: string; tipo: string; direccion: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: conductores } = useQuery<any[]>({
    queryKey: ["/api/conductor-panel/conductores", searchConductor],
    queryFn: () => fetch(`/api/conductor-panel/conductores?q=${encodeURIComponent(searchConductor)}`).then(r => r.json()).then(d => d.conductores || []),
    enabled: searchConductor.length >= 2,
  });

  const { data: camiones } = useQuery<any[]>({
    queryKey: ["/api/conductor-panel/camiones-disponibles"],
    queryFn: () => fetch("/api/conductor-panel/camiones-disponibles").then(r => r.json()).then(d => d.camiones || []),
  });

  const camionesFilt = (camiones || []).filter(c =>
    !searchCamion || c.patente.toLowerCase().includes(searchCamion.toLowerCase())
  );

  const addParada = () => setParadas([...paradas, { nombre: "", tipo: "ENTREGA", direccion: "" }]);
  const removeParada = (i: number) => setParadas(paradas.filter((_, idx) => idx !== i));
  const updateParada = (i: number, field: string, val: string) => {
    const copy = [...paradas];
    (copy[i] as any)[field] = val;
    setParadas(copy);
  };

  const enviar = async () => {
    if (!form.conductor || !form.camionId || !form.origenNombre) return;
    setSending(true);
    try {
      const res = await fetch("/api/conductor-panel/viaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paradas: paradas.filter(p => p.nombre.trim()),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`Viaje ${data.viaje.codigo} creado y asignado a ${form.conductor}`);
        setForm({ conductor: "", camionId: 0, patente: "", cliente: "", origenNombre: "", fechaSalida: "", cargaDescripcion: "" });
        setParadas([]);
        qc.invalidateQueries({ queryKey: ["/api/conductor-panel/viajes-vivo"] });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-4">
        <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <h3 className="font-exo text-[11px] font-bold mb-3" style={{ color: "#ffcc00" }}>NUEVO VIAJE</h3>

          {success && (
            <div className="mb-3 p-3" style={{ background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 6 }}>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} style={{ color: "#00ff88" }} />
                <span className="font-exo text-[11px]" style={{ color: "#00ff88" }}>{success}</span>
                <button onClick={() => setSuccess(null)} className="ml-auto cursor-pointer"><X size={12} style={{ color: "#3a6080" }} /></button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="font-exo text-[9px] font-bold mb-1 block" style={{ color: "#3a6080" }}>CONDUCTOR *</label>
              <input value={form.conductor || searchConductor}
                onChange={e => { setSearchConductor(e.target.value); setForm({ ...form, conductor: "" }); }}
                placeholder="Buscar conductor..."
                className="w-full px-3 py-2 font-exo text-[11px]"
                style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
              {searchConductor.length >= 2 && !form.conductor && conductores && conductores.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto" style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
                  {conductores.map((c: any) => (
                    <div key={c.id} onClick={() => { setForm({ ...form, conductor: c.nombre }); setSearchConductor(c.nombre); }}
                      className="px-3 py-1.5 cursor-pointer hover:bg-[#0d2035] flex items-center justify-between">
                      <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{c.nombre}</span>
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.contrato}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="font-exo text-[9px] font-bold mb-1 block" style={{ color: "#3a6080" }}>CAMIÓN *</label>
              <input value={searchCamion}
                onChange={e => setSearchCamion(e.target.value)}
                placeholder="Buscar patente..."
                className="w-full px-3 py-2 font-exo text-[11px]"
                style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
              {searchCamion && (
                <div className="mt-1 max-h-32 overflow-y-auto" style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
                  {camionesFilt.slice(0, 10).map((c: any) => (
                    <div key={c.id} onClick={() => { setForm({ ...form, camionId: c.id, patente: c.patente }); setSearchCamion(c.patente); }}
                      className="px-3 py-1.5 cursor-pointer hover:bg-[#0d2035] flex items-center justify-between">
                      <span className="font-space text-[10px] font-bold" style={{ color: "#ffcc00" }}>{c.patente}</span>
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.modelo}</span>
                    </div>
                  ))}
                </div>
              )}
              {form.patente && <span className="font-exo text-[9px] mt-1 block" style={{ color: "#ffcc00" }}>Seleccionado: {form.patente}</span>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-exo text-[9px] font-bold mb-1 block" style={{ color: "#3a6080" }}>CLIENTE</label>
                <input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })}
                  placeholder="Ej: CENCOSUD"
                  className="w-full px-3 py-2 font-exo text-[11px]"
                  style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
              </div>
              <div>
                <label className="font-exo text-[9px] font-bold mb-1 block" style={{ color: "#3a6080" }}>FECHA SALIDA</label>
                <input type="datetime-local" value={form.fechaSalida} onChange={e => setForm({ ...form, fechaSalida: e.target.value })}
                  className="w-full px-3 py-2 font-exo text-[11px]"
                  style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
              </div>
            </div>

            <div>
              <label className="font-exo text-[9px] font-bold mb-1 block" style={{ color: "#3a6080" }}>ORIGEN *</label>
              <input value={form.origenNombre} onChange={e => setForm({ ...form, origenNombre: e.target.value })}
                placeholder="Ej: CD Lo Aguirre"
                className="w-full px-3 py-2 font-exo text-[11px]"
                style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
            </div>

            <div>
              <label className="font-exo text-[9px] font-bold mb-1 block" style={{ color: "#3a6080" }}>DESCRIPCIÓN CARGA</label>
              <input value={form.cargaDescripcion} onChange={e => setForm({ ...form, cargaDescripcion: e.target.value })}
                placeholder="Ej: Abarrotes 12 pallets"
                className="w-full px-3 py-2 font-exo text-[11px]"
                style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
            </div>
          </div>
        </div>

        <button onClick={enviar} disabled={!form.conductor || !form.camionId || !form.origenNombre || sending}
          className="w-full py-3 font-exo text-[12px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all"
          style={{
            background: form.conductor && form.camionId && form.origenNombre ? "linear-gradient(135deg, #ffcc00, #ff6b35)" : "#0d2035",
            color: form.conductor && form.camionId && form.origenNombre ? "#060d14" : "#3a6080",
            borderRadius: 8, border: "none",
            opacity: sending ? 0.6 : 1,
          }}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? "ASIGNANDO..." : "ASIGNAR VIAJE"}
        </button>
      </div>

      <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-exo text-[11px] font-bold" style={{ color: "#a855f7" }}>PARADAS ({paradas.length})</h3>
          <button onClick={addParada} className="flex items-center gap-1 px-2 py-1 font-exo text-[9px] font-bold cursor-pointer"
            style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 4 }}>
            <Plus size={10} /> AGREGAR
          </button>
        </div>

        {paradas.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <MapPin size={20} className="mx-auto" style={{ color: "#0d2035" }} />
            <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin paradas. Agrega puntos de entrega/retiro.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {paradas.map((p, i) => (
              <div key={i} className="p-3 space-y-2" style={{ background: "#0a1628", borderRadius: 6, border: "1px solid #0d2035" }}>
                <div className="flex items-center justify-between">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#a855f7" }}>PARADA {i + 1}</span>
                  <button onClick={() => removeParada(i)} className="cursor-pointer"><X size={12} style={{ color: "#ff2244" }} /></button>
                </div>
                <input value={p.nombre} onChange={e => updateParada(i, "nombre", e.target.value)}
                  placeholder="Nombre (ej: Jumbo Maipú)"
                  className="w-full px-2 py-1.5 font-exo text-[10px]"
                  style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={p.direccion} onChange={e => updateParada(i, "direccion", e.target.value)}
                    placeholder="Dirección"
                    className="w-full px-2 py-1.5 font-exo text-[10px]"
                    style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
                  <select value={p.tipo} onChange={e => updateParada(i, "tipo", e.target.value)}
                    className="w-full px-2 py-1.5 font-exo text-[10px]"
                    style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }}>
                    <option value="ENTREGA">ENTREGA</option>
                    <option value="RETIRO">RETIRO</option>
                    <option value="CARGA">CARGA</option>
                    <option value="DESCARGA">DESCARGA</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GestionConductores() {
  const [search, setSearch] = useState("");
  const [contrato, setContrato] = useState("");

  const { data: conductores, isLoading } = useQuery<any[]>({
    queryKey: ["/api/conductor-panel/conductores", search, contrato],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (contrato) params.set("contrato", contrato);
      return fetch(`/api/conductor-panel/conductores?${params}`).then(r => r.json()).then(d => d.conductores || []);
    },
  });

  const contratos = [...new Set((conductores || []).map(c => c.contrato).filter(Boolean))].sort();

  return (
    <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }} className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-exo text-[11px] font-bold" style={{ color: "#06b6d4" }}>CONDUCTORES REGISTRADOS ({conductores?.length || 0})</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-7 pr-3 py-1.5 font-exo text-[10px]"
              style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none", width: 200 }} />
          </div>
          <select value={contrato} onChange={e => setContrato(e.target.value)}
            className="px-3 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }}>
            <option value="">Todos los contratos</option>
            {contratos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8"><Loader2 size={16} className="animate-spin mx-auto" style={{ color: "#3a6080" }} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(conductores || []).map((c: any) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1628", borderRadius: 6 }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-space text-[10px] font-bold"
                  style={{ background: "#06b6d415", color: "#06b6d4" }}>
                  {c.nombre?.charAt(0)}
                </div>
                <div>
                  <div className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</div>
                  <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.contrato || "Sin contrato"}</div>
                </div>
              </div>
              <div className="text-right">
                {c.score_comportamiento != null && (
                  <div className="font-space text-[11px] font-bold" style={{
                    color: Number(c.score_comportamiento) >= 7 ? "#00ff88" : Number(c.score_comportamiento) >= 4 ? "#ffcc00" : "#ff2244"
                  }}>
                    {Number(c.score_comportamiento).toFixed(1)}
                  </div>
                )}
                <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                  {c.total_jornadas || 0} jornadas
                </div>
                {c.tendencia && (
                  <span className="font-exo text-[7px]" style={{
                    color: c.tendencia === "UP" ? "#00ff88" : c.tendencia === "DOWN" ? "#ff2244" : "#3a6080"
                  }}>
                    {c.tendencia === "UP" ? "↑" : c.tendencia === "DOWN" ? "↓" : "→"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NovedadesPanel() {
  const qc = useQueryClient();

  const { data: novedades, isLoading } = useQuery<any[]>({
    queryKey: ["/api/conductor-panel/novedades"],
    queryFn: () => fetch("/api/conductor-panel/novedades").then(r => r.json()).then(d => d.novedades || []),
    refetchInterval: 30000,
  });

  const resolver = async (id: number) => {
    await fetch(`/api/conductor-panel/novedad/${id}/resolver`, { method: "PATCH" });
    qc.invalidateQueries({ queryKey: ["/api/conductor-panel/novedades"] });
  };

  const abiertas = (novedades || []).filter(n => !n.resuelta);
  const resueltas = (novedades || []).filter(n => n.resuelta);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4" style={{ background: "#060d14", border: `1px solid ${abiertas.length > 0 ? "#ff224430" : "#0d2035"}`, borderRadius: 8 }}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={14} style={{ color: abiertas.length > 0 ? "#ff2244" : "#3a6080" }} />
          <h3 className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>ABIERTAS ({abiertas.length})</h3>
        </div>
        {isLoading ? (
          <div className="text-center py-4"><Loader2 size={14} className="animate-spin mx-auto" style={{ color: "#3a6080" }} /></div>
        ) : abiertas.length === 0 ? (
          <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin novedades abiertas</div>
        ) : (
          <div className="space-y-2">
            {abiertas.map(n => (
              <div key={n.id} className="p-3" style={{ background: "#0a1628", borderRadius: 6, borderLeft: `3px solid ${TIPO_COLORS[n.tipo]}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-exo text-[8px] font-bold px-1.5 py-0.5"
                    style={{ color: TIPO_COLORS[n.tipo], background: `${TIPO_COLORS[n.tipo]}15`, borderRadius: 3 }}>
                    {n.tipo}
                  </span>
                  <button onClick={() => resolver(n.id)} className="px-2 py-0.5 font-exo text-[8px] font-bold cursor-pointer"
                    style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 3 }}>
                    RESOLVER
                  </button>
                </div>
                <div className="font-exo text-[10px] mb-1" style={{ color: "#c8e8ff" }}>{n.descripcion}</div>
                <div className="flex items-center justify-between">
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{n.conductor}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                    <Clock size={8} className="inline mr-1" />
                    {new Date(n.creado_at).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <h3 className="font-exo text-[11px] font-bold mb-3" style={{ color: "#3a6080" }}>RESUELTAS ({resueltas.length})</h3>
        {resueltas.length === 0 ? (
          <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin novedades resueltas</div>
        ) : (
          <div className="space-y-2">
            {resueltas.slice(0, 15).map(n => (
              <div key={n.id} className="p-2 opacity-60" style={{ background: "#0a1628", borderRadius: 4, borderLeft: `2px solid ${TIPO_COLORS[n.tipo]}` }}>
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[8px]" style={{ color: TIPO_COLORS[n.tipo] }}>{n.tipo}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{n.descripcion}</span>
                </div>
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{n.conductor}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DRIVER_APP_URL = "https://driver-route-planner-albertoheller.replit.app";

function AppConductorIframe() {
  const [patente, setPatente] = useState("DEMO01");
  const [searchCamion, setSearchCamion] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const { data: camionesData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/camiones-disponibles"],
    queryFn: () => fetch("/api/conductor-panel/camiones-disponibles").then(r => r.json()),
  });

  const camiones = camionesData?.camiones || [];
  const camionesFilt = searchCamion
    ? camiones.filter((c: any) => c.patente.toLowerCase().includes(searchCamion.toLowerCase()))
    : [];

  const iframeSrc = `${DRIVER_APP_URL}/?patente=${patente}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <Smartphone size={16} style={{ color: "#a855f7" }} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>VISTA PREVIA — APP DEL CONDUCTOR</span>
            <a href={iframeSrc} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 font-exo text-[8px]" style={{ color: "#a855f7" }}>
              <ExternalLink size={9} /> ABRIR EN NUEVA PESTAÑA
            </a>
          </div>
          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
            Selecciona un camión para ver la app como la ve el conductor en terreno
          </span>
        </div>

        <div className="relative">
          <input
            value={searchCamion}
            onChange={e => setSearchCamion(e.target.value)}
            placeholder="Buscar patente..."
            className="px-3 py-1.5 font-exo text-[10px] w-[160px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }}
          />
          {searchCamion && camionesFilt.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto z-50"
              style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
              {camionesFilt.slice(0, 12).map((c: any) => (
                <div key={c.id}
                  onClick={() => { setPatente(c.patente); setSearchCamion(""); setIframeKey(k => k + 1); }}
                  className="px-3 py-1.5 cursor-pointer hover:bg-[#0d2035] flex items-center justify-between">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#ffcc00" }}>{c.patente}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.modelo}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2 py-1" style={{ background: "#a855f720", borderRadius: 4, border: "1px solid #a855f740" }}>
            <span className="font-space text-[11px] font-bold" style={{ color: "#a855f7" }}>{patente}</span>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 cursor-pointer" style={{ color: "#3a6080", background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      <div style={{
        background: "#060d14",
        border: "1px solid #0d2035",
        borderRadius: 12,
        overflow: "hidden",
        height: expanded ? "calc(100vh - 160px)" : "700px",
        transition: "height 0.3s ease",
      }}>
        <iframe
          key={iframeKey}
          src={iframeSrc}
          width="100%"
          height="100%"
          frameBorder="0"
          allow="geolocation; camera"
          title="App del Conductor"
          style={{ border: "none", borderRadius: 12 }}
        />
      </div>
    </div>
  );
}
