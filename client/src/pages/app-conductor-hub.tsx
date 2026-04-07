import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Smartphone, Settings, MessageCircle, Truck, Users, AlertTriangle,
  Send, CheckCircle, ExternalLink, Radio, Loader2, Megaphone,
  X, Plus, MapPin, Activity, Clock, Navigation
} from "lucide-react";
import { Map as GMap, AdvancedMarker } from "@vis.gl/react-google-maps";

type HubMode = "vista-app" | "gestion";
type GestionTab = "envivo" | "viajes" | "conductores" | "comunicaciones" | "novedades";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const DRIVER_APP_URL = "https://driver-route-planner-albertoheller.replit.app";

const ESTADO_COLORS: Record<string, string> = {
  PROGRAMADO: "#ffcc00",
  EN_RUTA: "#00ff88",
  COMPLETADO: "#06b6d4",
  CANCELADO: "#ff2244",
  PENDIENTE: "#3a6080",
  COMPLETADA: "#00ff88",
  SALTADA: "#ff2244",
  EN_CAMINO: "#ffcc00",
};

const TIPO_NOVEDAD_COLORS: Record<string, string> = {
  MECANICA: "#ff6b35",
  ACCIDENTE: "#ff2244",
  RETRASO: "#ffcc00",
  CARGA: "#06b6d4",
  OTRO: "#3a6080",
};

const MENSAJES_RAPIDOS = [
  "Confirma ETA de llegada",
  "Desvío autorizado",
  "Cambio de ruta: contactar torre",
  "Parada adicional agregada",
  "Esperando carga en origen",
  "Urgente: comunicarse con base",
];

export default function AppConductorHub({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<HubMode>("gestion");
  const [gestionTab, setGestionTab] = useState<GestionTab>("envivo");

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/conductor-panel/stats-conductor"],
    queryFn: () => fetchJson("/api/conductor-panel/stats-conductor"),
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      <div className="flex items-center gap-3 px-5 py-2.5" style={{ background: "#060d14", borderBottom: "1px solid #0d2035" }}>
        <button onClick={onBack} className="font-exo text-[10px] font-bold px-3 py-1.5 cursor-pointer"
          style={{ color: "#ff6b35", background: "#ff6b3515", border: "1px solid #ff6b3530", borderRadius: 6 }}>
          ← VOLVER
        </button>
        <div className="text-[18px]">📱</div>
        <span className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>APP CONDUCTOR</span>

        {stats && (
          <div className="flex items-center gap-4 ml-4">
            {[
              { l: "EN RUTA", v: stats.en_ruta || 0, c: "#00ff88" },
              { l: "PROGRAMADOS", v: stats.programados || 0, c: "#ffcc00" },
              { l: "HOY", v: stats.viajes_hoy || 0, c: "#06b6d4" },
              { l: "ACTIVOS", v: stats.conductores_activos || 0, c: "#a855f7" },
              { l: "NOVEDADES", v: stats.novedades_abiertas || 0, c: (stats.novedades_abiertas || 0) > 0 ? "#ff2244" : "#3a6080" },
              { l: "MENSAJES", v: stats.mensajes_sin_leer || 0, c: (stats.mensajes_sin_leer || 0) > 0 ? "#a855f7" : "#3a6080" },
            ].map(s => (
              <div key={s.l} className="text-center">
                <div className="font-space text-[14px] font-bold" style={{ color: s.c }}>{s.v}</div>
                <div className="font-exo text-[6px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <div className="flex gap-1">
          <button onClick={() => setMode("gestion")}
            className="flex items-center gap-1.5 px-4 py-2 font-exo text-[10px] font-bold cursor-pointer transition-all"
            style={{
              color: mode === "gestion" ? "#ff6b35" : "#3a6080",
              background: mode === "gestion" ? "#ff6b3515" : "transparent",
              border: `1px solid ${mode === "gestion" ? "#ff6b3540" : "#0d2035"}`,
              borderRadius: 6,
            }}>
            <Settings size={12} /> GESTIÓN EMPRESA
          </button>
          <button onClick={() => setMode("vista-app")}
            className="flex items-center gap-1.5 px-4 py-2 font-exo text-[10px] font-bold cursor-pointer transition-all"
            style={{
              color: mode === "vista-app" ? "#a855f7" : "#3a6080",
              background: mode === "vista-app" ? "#a855f715" : "transparent",
              border: `1px solid ${mode === "vista-app" ? "#a855f740" : "#0d2035"}`,
              borderRadius: 6,
            }}>
            <Smartphone size={12} /> VISTA APP
          </button>
        </div>
      </div>

      {mode === "vista-app" && <VistaApp />}
      {mode === "gestion" && (
        <div className="flex" style={{ height: "calc(100vh - 52px)" }}>
          <div className="w-[180px] p-3 space-y-1 flex-shrink-0" style={{ background: "#040a10", borderRight: "1px solid #0d2035" }}>
            {([
              { id: "envivo" as GestionTab, label: "EN VIVO", icon: Activity, color: "#00ff88" },
              { id: "viajes" as GestionTab, label: "VIAJES", icon: Truck, color: "#06b6d4", badge: stats?.viajes_hoy },
              { id: "conductores" as GestionTab, label: "CONDUCTORES", icon: Users, color: "#a855f7" },
              { id: "comunicaciones" as GestionTab, label: "COMUNICACIONES", icon: MessageCircle, color: "#ffcc00", badge: stats?.mensajes_sin_leer },
              { id: "novedades" as GestionTab, label: "NOVEDADES", icon: AlertTriangle, color: "#ff6b35", badge: stats?.novedades_abiertas },
            ]).map(t => (
              <button key={t.id} onClick={() => setGestionTab(t.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 font-exo text-[9px] font-bold cursor-pointer transition-all text-left"
                style={{
                  color: gestionTab === t.id ? t.color : "#3a6080",
                  background: gestionTab === t.id ? `${t.color}10` : "transparent",
                  border: `1px solid ${gestionTab === t.id ? `${t.color}30` : "transparent"}`,
                  borderRadius: 6,
                }}>
                <t.icon size={12} />
                {t.label}
                {(t.badge ?? 0) > 0 && (
                  <span className="ml-auto font-space text-[8px] px-1.5 py-0.5" style={{ background: `${t.color}20`, color: t.color, borderRadius: 10 }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {gestionTab === "envivo" && <PanelEnVivo />}
            {gestionTab === "viajes" && <GestionViajes />}
            {gestionTab === "conductores" && <GestionConductores />}
            {gestionTab === "comunicaciones" && <Comunicaciones />}
            {gestionTab === "novedades" && <GestionNovedades />}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelEnVivo() {
  const [selectedViaje, setSelectedViaje] = useState<any>(null);

  const { data: viajesVivo } = useQuery<any>({
    queryKey: ["/api/conductor-panel/viajes-vivo"],
    queryFn: () => fetchJson("/api/conductor-panel/viajes-vivo"),
    refetchInterval: 10000,
  });

  const { data: activos } = useQuery<any>({
    queryKey: ["/api/conductor-panel/activos"],
    queryFn: () => fetchJson("/api/conductor-panel/activos"),
    refetchInterval: 15000,
  });

  const { data: paradasRecientes } = useQuery<any>({
    queryKey: ["/api/conductor-panel/paradas-recientes"],
    queryFn: () => fetchJson("/api/conductor-panel/paradas-recientes"),
    refetchInterval: 20000,
  });

  const viajes = viajesVivo?.viajes || [];
  const conductoresActivos = activos?.conductores || [];
  const paradas = paradasRecientes?.paradas || [];

  const viajesConGps = viajes.filter((v: any) => v.gps?.lat && v.gps?.lng);

  const mapCenter = useMemo(() => {
    if (viajesConGps.length > 0) {
      const avgLat = viajesConGps.reduce((s: number, v: any) => s + parseFloat(v.gps.lat), 0) / viajesConGps.length;
      const avgLng = viajesConGps.reduce((s: number, v: any) => s + parseFloat(v.gps.lng), 0) / viajesConGps.length;
      return { lat: avgLat, lng: avgLng };
    }
    return { lat: -33.45, lng: -70.65 };
  }, [viajesConGps]);

  const enRuta = viajes.filter((v: any) => v.estado === "EN_RUTA").length;
  const programados = viajes.filter((v: any) => v.estado === "PROGRAMADO").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: "#00ff88" }} />
          <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>PANEL EN VIVO</span>
          <span className="font-exo text-[9px] px-2 py-0.5" style={{ color: "#00ff88", background: "#00ff8815", borderRadius: 10 }}>
            {enRuta} en ruta · {programados} programados
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: "#0a1628", borderRadius: 4 }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00ff88" }} />
            <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>GPS ACTIVO</span>
          </div>
          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
            {conductoresActivos.length} conductores conectados
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3" style={{ height: "calc(100vh - 140px)" }}>
        <div className="col-span-8" style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #0d2035" }}>
          <GMap
            defaultCenter={mapCenter}
            defaultZoom={viajesConGps.length > 0 ? 7 : 6}
            gestureHandling="greedy"
            disableDefaultUI={false}
            style={{ width: "100%", height: "100%" }}
            colorScheme="DARK"
          >
            {viajesConGps.map((v: any) => (
              <AdvancedMarker
                key={v.id}
                position={{ lat: parseFloat(v.gps.lat), lng: parseFloat(v.gps.lng) }}
                onClick={() => setSelectedViaje(v)}
              >
                <div style={{
                  background: v.estado === "EN_RUTA" ? "#00ff88" : "#ffcc00",
                  color: "#060d14",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 800,
                  fontFamily: "Exo 2",
                  whiteSpace: "nowrap",
                  boxShadow: `0 0 8px ${v.estado === "EN_RUTA" ? "#00ff8880" : "#ffcc0080"}`,
                  border: `1px solid ${v.estado === "EN_RUTA" ? "#00ff88" : "#ffcc00"}`,
                  cursor: "pointer",
                }}>
                  🚛 {v.patente || v.codigo}
                  {v.gps.velocidad_kmh > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{Math.round(v.gps.velocidad_kmh)} km/h</span>}
                </div>
              </AdvancedMarker>
            ))}

            {viajes.filter((v: any) => v.origen_lat && v.origen_lng).map((v: any) => (
              <AdvancedMarker
                key={`orig-${v.id}`}
                position={{ lat: parseFloat(v.origen_lat), lng: parseFloat(v.origen_lng) }}
              >
                <div style={{
                  background: "#06b6d4",
                  color: "#fff",
                  width: 16, height: 16,
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 800,
                  border: "1px solid #06b6d4",
                }}>O</div>
              </AdvancedMarker>
            ))}
          </GMap>
        </div>

        <div className="col-span-4 space-y-3 overflow-y-auto">
          {selectedViaje && (
            <div className="p-3" style={{ background: "#060d14", border: "1px solid #00ff8840", borderRadius: 8 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{selectedViaje.codigo}</span>
                <button onClick={() => setSelectedViaje(null)} className="cursor-pointer" style={{ color: "#3a6080" }}><X size={12} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="p-1.5" style={{ background: "#0a1628", borderRadius: 4 }}>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CONDUCTOR</div>
                  <div className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{selectedViaje.conductor}</div>
                </div>
                <div className="p-1.5" style={{ background: "#0a1628", borderRadius: 4 }}>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>PATENTE</div>
                  <div className="font-exo text-[9px] font-bold" style={{ color: "#ffcc00" }}>{selectedViaje.patente}</div>
                </div>
                <div className="p-1.5" style={{ background: "#0a1628", borderRadius: 4 }}>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>ESTADO</div>
                  <div className="font-exo text-[9px] font-bold" style={{ color: ESTADO_COLORS[selectedViaje.estado] }}>{selectedViaje.estado}</div>
                </div>
                <div className="p-1.5" style={{ background: "#0a1628", borderRadius: 4 }}>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VELOCIDAD</div>
                  <div className="font-exo text-[9px] font-bold" style={{ color: "#00ff88" }}>
                    {selectedViaje.gps ? `${Math.round(selectedViaje.gps.velocidad_kmh || 0)} km/h` : "—"}
                  </div>
                </div>
              </div>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                {selectedViaje.origen_nombre} · {selectedViaje.cliente || "Sin cliente"}
              </div>
              {selectedViaje.paradas && (
                <div className="mt-2 space-y-1">
                  {selectedViaje.paradas.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1" style={{ background: "#0a1628", borderRadius: 3 }}>
                      <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: `${ESTADO_COLORS[p.estado]}20`, fontSize: 6, color: ESTADO_COLORS[p.estado] }}>
                        {p.estado === "COMPLETADA" ? "✓" : p.orden}
                      </div>
                      <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{p.nombre}</span>
                      <span className="font-exo text-[7px] ml-auto" style={{ color: ESTADO_COLORS[p.estado] }}>{p.estado}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="font-exo text-[9px] font-bold mb-2 flex items-center gap-1.5" style={{ color: "#00ff88" }}>
              <Navigation size={10} /> VIAJES ACTIVOS ({viajes.length})
            </div>
            <div className="space-y-1.5" style={{ maxHeight: selectedViaje ? "200px" : "350px", overflowY: "auto" }}>
              {viajes.map((v: any) => (
                <div key={v.id} onClick={() => setSelectedViaje(v)}
                  className="p-2.5 cursor-pointer transition-all"
                  style={{
                    background: selectedViaje?.id === v.id ? "#0d2035" : "#060d14",
                    border: `1px solid ${selectedViaje?.id === v.id ? ESTADO_COLORS[v.estado] + "60" : "#0d2035"}`,
                    borderLeft: `3px solid ${ESTADO_COLORS[v.estado]}`,
                    borderRadius: 6,
                  }}>
                  <div className="flex items-center justify-between">
                    <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{v.codigo}</span>
                    <div className="flex items-center gap-1">
                      {v.gps && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00ff88" }} />}
                      <span className="font-exo text-[7px] px-1.5 py-0.5" style={{ color: ESTADO_COLORS[v.estado], background: `${ESTADO_COLORS[v.estado]}15`, borderRadius: 3 }}>
                        {v.estado}
                      </span>
                    </div>
                  </div>
                  <div className="font-exo text-[8px] mt-0.5" style={{ color: "#5a8090" }}>{v.conductor}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.patente} · {v.cliente || "—"}</span>
                    {v.gps && (
                      <span className="font-exo text-[7px]" style={{ color: "#00ff88" }}>{Math.round(v.gps.velocidad_kmh || 0)} km/h</span>
                    )}
                  </div>
                </div>
              ))}
              {viajes.length === 0 && (
                <div className="text-center py-6 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin viajes activos</div>
              )}
            </div>
          </div>

          <div>
            <div className="font-exo text-[9px] font-bold mb-2 flex items-center gap-1.5" style={{ color: "#06b6d4" }}>
              <Users size={10} /> CONDUCTORES ACTIVOS ({conductoresActivos.length})
            </div>
            <div className="space-y-1" style={{ maxHeight: "200px", overflowY: "auto" }}>
              {conductoresActivos.slice(0, 15).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4 }}>
                  <div>
                    <div className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.patente} · {c.contrato || "—"}</div>
                  </div>
                  <div className="text-right">
                    {c.velocidad > 0 && (
                      <div className="font-exo text-[8px] font-bold" style={{ color: "#00ff88" }}>{Math.round(c.velocidad)} km/h</div>
                    )}
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.viajes_hoy} viajes</div>
                  </div>
                </div>
              ))}
              {conductoresActivos.length === 0 && (
                <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin conductores activos</div>
              )}
            </div>
          </div>

          <div>
            <div className="font-exo text-[9px] font-bold mb-2 flex items-center gap-1.5" style={{ color: "#a855f7" }}>
              <Clock size={10} /> PARADAS RECIENTES
            </div>
            <div className="space-y-1" style={{ maxHeight: "180px", overflowY: "auto" }}>
              {paradas.slice(0, 10).map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 p-2" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 4 }}>
                  <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{
                    background: `${ESTADO_COLORS[p.estado] || "#3a6080"}20`,
                    color: ESTADO_COLORS[p.estado] || "#3a6080",
                    fontSize: 8, fontWeight: 800,
                  }}>
                    {p.estado === "COMPLETADA" ? "✓" : p.estado === "SALTADA" ? "✗" : "•"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-exo text-[8px] font-bold truncate" style={{ color: "#c8e8ff" }}>{p.nombre}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{p.conductor} · {p.patente}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: ESTADO_COLORS[p.estado] }}>{p.estado}</div>
                    {p.hora_real && (
                      <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>
                        {new Date(p.hora_real).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {paradas.length === 0 && (
                <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin paradas recientes</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VistaApp() {
  const [patente, setPatente] = useState("DEMO01");
  const [searchCamion, setSearchCamion] = useState("");
  const [iframeKey, setIframeKey] = useState(0);

  const { data: camionesData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/camiones-disponibles"],
    queryFn: () => fetchJson("/api/conductor-panel/camiones-disponibles"),
  });

  const camiones = camionesData?.camiones || [];
  const camionesFilt = searchCamion
    ? camiones.filter((c: any) => c.patente.toLowerCase().includes(searchCamion.toLowerCase()))
    : [];

  const iframeSrc = `${DRIVER_APP_URL}/?patente=${patente}`;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <Smartphone size={16} style={{ color: "#a855f7" }} />
        <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>VISTA PREVIA — APP DEL CONDUCTOR</span>
        <a href={iframeSrc} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 font-exo text-[8px]" style={{ color: "#a855f7" }}>
          <ExternalLink size={9} /> ABRIR EN NUEVA PESTAÑA
        </a>
        <div className="flex-1" />
        <div className="relative">
          <input value={searchCamion} onChange={e => setSearchCamion(e.target.value)}
            placeholder="Buscar patente..." className="px-3 py-1.5 font-exo text-[10px] w-[160px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          {searchCamion && camionesFilt.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto z-50"
              style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
              {camionesFilt.slice(0, 12).map((c: any) => (
                <div key={c.id} onClick={() => { setPatente(c.patente); setSearchCamion(""); setIframeKey(k => k + 1); }}
                  className="px-3 py-1.5 cursor-pointer hover:bg-[#0d2035] flex items-center justify-between">
                  <span className="font-space text-[10px] font-bold" style={{ color: "#ffcc00" }}>{c.patente}</span>
                  <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.modelo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-2 py-1" style={{ background: "#a855f720", borderRadius: 4, border: "1px solid #a855f740" }}>
          <span className="font-space text-[11px] font-bold" style={{ color: "#a855f7" }}>{patente}</span>
        </div>
      </div>
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 12, overflow: "hidden", height: "calc(100vh - 140px)" }}>
        <iframe key={iframeKey} src={iframeSrc} width="100%" height="100%" frameBorder="0"
          allow="geolocation; camera" title="App del Conductor" style={{ border: "none", borderRadius: 12 }} />
      </div>
    </div>
  );
}

function GestionViajes() {
  const qc = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroConductor, setFiltroConductor] = useState("");
  const [selectedViaje, setSelectedViaje] = useState<number | null>(null);
  const [showCrear, setShowCrear] = useState(false);

  const { data: viajes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/conductor-panel/viajes-todos", filtroEstado, filtroConductor],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtroEstado) params.set("estado", filtroEstado);
      if (filtroConductor) params.set("conductor", filtroConductor);
      return fetchJson(`/api/conductor-panel/viajes-todos?${params}`).then(d => d.viajes || []);
    },
    refetchInterval: 15000,
  });

  const { data: tracking } = useQuery<any>({
    queryKey: ["/api/conductor-panel/viaje", selectedViaje, "tracking"],
    queryFn: () => fetchJson(`/api/conductor-panel/viaje/${selectedViaje}/tracking`),
    enabled: !!selectedViaje,
    refetchInterval: selectedViaje ? 10000 : false,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck size={16} style={{ color: "#06b6d4" }} />
          <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>GESTIÓN DE VIAJES</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="px-2 py-1 font-exo text-[9px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }}>
            <option value="">TODOS</option>
            <option value="PROGRAMADO">PROGRAMADO</option>
            <option value="EN_RUTA">EN RUTA</option>
            <option value="COMPLETADO">COMPLETADO</option>
            <option value="CANCELADO">CANCELADO</option>
          </select>
          <input value={filtroConductor} onChange={e => setFiltroConductor(e.target.value)}
            placeholder="Filtrar conductor..." className="px-2 py-1 font-exo text-[9px] w-[140px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          <button onClick={() => setShowCrear(!showCrear)}
            className="flex items-center gap-1 px-3 py-1.5 font-exo text-[9px] font-bold cursor-pointer"
            style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 4 }}>
            <Plus size={10} /> NUEVO VIAJE
          </button>
        </div>
      </div>

      {showCrear && <CrearViajeInline onClose={() => { setShowCrear(false); qc.invalidateQueries({ queryKey: ["/api/conductor-panel/viajes-todos"] }); }} />}

      <div className="grid grid-cols-3 gap-3" style={{ height: "calc(100vh - 140px)" }}>
        <div className="col-span-1 overflow-y-auto space-y-2 pr-1">
          {isLoading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: "#3a6080" }} /></div>}
          {viajes?.map(v => (
            <div key={v.id} onClick={() => setSelectedViaje(v.id)}
              className="p-3 cursor-pointer transition-all"
              style={{
                background: selectedViaje === v.id ? "#0d2035" : "#060d14",
                border: `1px solid ${selectedViaje === v.id ? ESTADO_COLORS[v.estado] + "60" : "#0d2035"}`,
                borderLeft: `3px solid ${ESTADO_COLORS[v.estado] || "#3a6080"}`,
                borderRadius: 6,
              }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{v.codigo}</span>
                <span className="font-exo text-[7px] px-1.5 py-0.5" style={{ color: ESTADO_COLORS[v.estado], background: `${ESTADO_COLORS[v.estado]}15`, borderRadius: 3 }}>
                  {v.estado}
                </span>
              </div>
              <div className="font-exo text-[9px] mb-0.5" style={{ color: "#5a8090" }}>{v.conductor}</div>
              <div className="flex items-center justify-between">
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.patente} · {v.cliente || "—"}</span>
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                  {v.paradas_ok}/{v.total_paradas} paradas
                  {v.total_mensajes > 0 && <span style={{ color: "#a855f7" }}> · {v.total_mensajes} msg</span>}
                </span>
              </div>
              {v.fecha_salida && (
                <div className="font-exo text-[7px] mt-1" style={{ color: "#3a6080" }}>
                  {new Date(v.fecha_salida).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          ))}
          {!isLoading && (!viajes || viajes.length === 0) && (
            <div className="text-center py-10 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin viajes registrados</div>
          )}
        </div>

        <div className="col-span-2 overflow-y-auto" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          {selectedViaje && tracking ? (
            <ViajeDetalle tracking={tracking} onCambiarEstado={(estado: string) => {
              fetch(`/api/conductor-panel/viaje/${selectedViaje}/estado`, {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado })
              }).then(res => {
                if (res.ok) qc.invalidateQueries({ queryKey: ["/api/conductor-panel/viajes-todos"] });
              });
            }} />
          ) : (
            <div className="flex items-center justify-center h-full font-exo text-[11px]" style={{ color: "#3a6080" }}>
              Selecciona un viaje para ver el detalle
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ViajeDetalle({ tracking, onCambiarEstado }: { tracking: any; onCambiarEstado: (e: string) => void }) {
  const v = tracking.viaje;
  const paradas = tracking.paradas || [];
  const novedades = tracking.novedades || [];
  const trayectoria = tracking.trayectoria || [];
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const { data: mensajesData, refetch: refetchMsgs } = useQuery<any>({
    queryKey: ["/api/conductor-panel/mensajes", v.id],
    queryFn: () => fetchJson(`/api/conductor-panel/mensajes/${v.id}`),
    refetchInterval: 10000,
  });
  const mensajes = mensajesData?.mensajes || [];

  const enviarMensaje = async (texto: string) => {
    if (!texto.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/conductor-panel/mensaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viajeId: v.id, conductor: v.conductor, mensaje: texto }),
      });
      if (res.ok) {
        setMsg("");
        refetchMsgs();
      }
    } catch {}
    setSending(false);
  };

  const mapCenter = useMemo(() => {
    if (trayectoria.length > 0) {
      const last = trayectoria[trayectoria.length - 1];
      return { lat: parseFloat(last.lat), lng: parseFloat(last.lng) };
    }
    if (v.origen_lat && v.origen_lng) {
      return { lat: parseFloat(v.origen_lat), lng: parseFloat(v.origen_lng) };
    }
    return { lat: -33.45, lng: -70.65 };
  }, [trayectoria, v.origen_lat, v.origen_lng]);

  const hasGeoData = trayectoria.length > 0 || (v.origen_lat && v.origen_lng) || paradas.some((p: any) => p.lat && p.lng);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{v.codigo}</span>
            <span className="font-exo text-[9px] px-2 py-0.5" style={{ color: ESTADO_COLORS[v.estado], background: `${ESTADO_COLORS[v.estado]}15`, borderRadius: 4 }}>
              {v.estado}
            </span>
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#5a8090" }}>
            {v.conductor} · {v.patente} · {v.cliente || "Sin cliente"}
          </div>
        </div>
        <div className="flex gap-1">
          {hasGeoData && (
            <button onClick={() => setShowMap(!showMap)} className="px-3 py-1.5 font-exo text-[9px] font-bold cursor-pointer flex items-center gap-1"
              style={{ color: showMap ? "#ff6b35" : "#06b6d4", background: showMap ? "#ff6b3515" : "#06b6d415", border: `1px solid ${showMap ? "#ff6b3530" : "#06b6d430"}`, borderRadius: 4 }}>
              {showMap ? <><X size={9} /> CERRAR MAPA</> : <><MapPin size={9} /> VER MAPA</>}
            </button>
          )}
          {v.estado === "PROGRAMADO" && (
            <button onClick={() => onCambiarEstado("EN_RUTA")} className="px-3 py-1.5 font-exo text-[9px] font-bold cursor-pointer"
              style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 4 }}>
              INICIAR VIAJE
            </button>
          )}
          {v.estado === "EN_RUTA" && (
            <button onClick={() => onCambiarEstado("COMPLETADO")} className="px-3 py-1.5 font-exo text-[9px] font-bold cursor-pointer"
              style={{ color: "#06b6d4", background: "#06b6d415", border: "1px solid #06b6d430", borderRadius: 4 }}>
              COMPLETAR
            </button>
          )}
          {(v.estado === "PROGRAMADO" || v.estado === "EN_RUTA") && (
            <button onClick={() => onCambiarEstado("CANCELADO")} className="px-3 py-1.5 font-exo text-[9px] font-bold cursor-pointer"
              style={{ color: "#ff2244", background: "#ff224415", border: "1px solid #ff224430", borderRadius: 4 }}>
              CANCELAR
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "ORIGEN", v: v.origen_nombre || "—", c: "#06b6d4" },
          { l: "CARGA", v: v.carga_descripcion || "—", c: "#ffcc00" },
          { l: "SALIDA", v: v.fecha_salida ? new Date(v.fecha_salida).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—", c: "#00ff88" },
          { l: "TRAYECTORIA", v: trayectoria.length > 0 ? `${trayectoria.length} puntos GPS` : "Sin datos", c: "#a855f7" },
        ].map(s => (
          <div key={s.l} className="p-2" style={{ background: "#0a1628", borderRadius: 4 }}>
            <div className="font-exo text-[7px] uppercase tracking-wider mb-0.5" style={{ color: "#3a6080" }}>{s.l}</div>
            <div className="font-exo text-[10px] font-bold" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {showMap && (
        <div style={{ height: 280, borderRadius: 8, overflow: "hidden", border: "1px solid #0d2035" }}>
          <GMap
            defaultCenter={mapCenter}
            defaultZoom={10}
            gestureHandling="greedy"
            disableDefaultUI={false}
            style={{ width: "100%", height: "100%" }}
            colorScheme="DARK"
          >
            {v.origen_lat && v.origen_lng && (
              <AdvancedMarker position={{ lat: parseFloat(v.origen_lat), lng: parseFloat(v.origen_lng) }}>
                <div style={{ background: "#06b6d4", color: "#fff", width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, border: "2px solid #fff" }}>O</div>
              </AdvancedMarker>
            )}

            {paradas.filter((p: any) => p.lat && p.lng).map((p: any) => (
              <AdvancedMarker key={p.id} position={{ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }}>
                <div style={{
                  background: ESTADO_COLORS[p.estado] || "#3a6080",
                  color: "#fff",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 8,
                  fontWeight: 800,
                  fontFamily: "Exo 2",
                  whiteSpace: "nowrap",
                  border: "1px solid #fff",
                }}>
                  {p.orden}. {p.nombre}
                </div>
              </AdvancedMarker>
            ))}

            {trayectoria.length > 0 && (
              <AdvancedMarker position={{ lat: parseFloat(trayectoria[trayectoria.length - 1].lat), lng: parseFloat(trayectoria[trayectoria.length - 1].lng) }}>
                <div style={{
                  background: "#00ff88",
                  color: "#060d14",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 800,
                  fontFamily: "Exo 2",
                  boxShadow: "0 0 10px #00ff8880",
                  border: "1px solid #00ff88",
                }}>
                  🚛 {v.patente} (última pos.)
                </div>
              </AdvancedMarker>
            )}
          </GMap>
        </div>
      )}

      <div>
        <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#c8e8ff" }}>TIMELINE DE PARADAS</div>
        <div className="space-y-1">
          {paradas.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-3 p-2" style={{ background: "#0a1628", borderRadius: 4 }}>
              <div className="w-5 h-5 flex items-center justify-center rounded-full text-[8px] font-bold"
                style={{ background: `${ESTADO_COLORS[p.estado] || "#3a6080"}20`, color: ESTADO_COLORS[p.estado] || "#3a6080" }}>
                {p.estado === "COMPLETADA" ? "✓" : i + 1}
              </div>
              <div className="flex-1">
                <div className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{p.nombre}</div>
                <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{p.tipo} · {p.direccion || "Sin dirección"}</div>
              </div>
              <div className="text-right">
                <div className="font-exo text-[8px]" style={{ color: ESTADO_COLORS[p.estado] || "#3a6080" }}>{p.estado}</div>
                {p.hora_real && <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{new Date(p.hora_real).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</div>}
                {p.hora_estimada && !p.hora_real && <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Est: {new Date(p.hora_estimada).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</div>}
              </div>
            </div>
          ))}
          {paradas.length === 0 && <div className="font-exo text-[9px] py-2" style={{ color: "#3a6080" }}>Sin paradas registradas</div>}
        </div>
      </div>

      {novedades.length > 0 && (
        <div>
          <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#ff6b35" }}>NOVEDADES ({novedades.length})</div>
          {novedades.map((n: any) => (
            <div key={n.id} className="p-2 mb-1" style={{ background: "#0a1628", borderRadius: 4, borderLeft: `2px solid ${TIPO_NOVEDAD_COLORS[n.tipo] || "#3a6080"}` }}>
              <div className="flex items-center gap-2">
                <span className="font-exo text-[8px] font-bold" style={{ color: TIPO_NOVEDAD_COLORS[n.tipo] || "#3a6080" }}>{n.tipo}</span>
                <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{n.descripcion}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#a855f7" }}>
          CHAT DEL VIAJE ({mensajes.length} mensajes)
        </div>
        <div className="max-h-[200px] overflow-y-auto space-y-1 mb-2 p-2" style={{ background: "#0a1628", borderRadius: 6 }}>
          {mensajes.map((m: any) => (
            <div key={m.id} className={`flex ${m.remitente === "TORRE" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[70%] px-2.5 py-1.5" style={{
                background: m.remitente === "TORRE" ? "#a855f720" : "#0d2035",
                borderRadius: 6,
                border: `1px solid ${m.remitente === "TORRE" ? "#a855f730" : "#1a3050"}`,
              }}>
                <div className="font-exo text-[7px] mb-0.5" style={{ color: m.remitente === "TORRE" ? "#a855f7" : "#ff6b35" }}>
                  {m.remitente === "TORRE" ? "TORRE" : "CONDUCTOR"} · {new Date(m.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{m.mensaje}</div>
              </div>
            </div>
          ))}
          {mensajes.length === 0 && <div className="font-exo text-[8px] text-center py-3" style={{ color: "#3a6080" }}>Sin mensajes</div>}
        </div>
        <div className="flex gap-1">
          <div className="flex gap-1 flex-wrap mb-1">
            {MENSAJES_RAPIDOS.slice(0, 3).map(mr => (
              <button key={mr} onClick={() => enviarMensaje(mr)}
                className="px-2 py-1 font-exo text-[7px] cursor-pointer"
                style={{ color: "#a855f7", background: "#a855f710", border: "1px solid #a855f720", borderRadius: 3 }}>
                {mr}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <input value={msg} onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && enviarMensaje(msg)}
            placeholder="Escribir mensaje..."
            className="flex-1 px-3 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          <button onClick={() => enviarMensaje(msg)} disabled={!msg.trim() || sending}
            className="px-3 py-1.5 cursor-pointer"
            style={{ color: "#a855f7", background: "#a855f715", border: "1px solid #a855f730", borderRadius: 4 }}>
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CrearViajeInline({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<any>({ conductor: "", camionId: null, patente: "", cliente: "", origenNombre: "", cargaDescripcion: "", fechaSalida: "" });
  const [searchConductor, setSearchConductor] = useState("");
  const [searchCamion, setSearchCamion] = useState("");
  const [paradas, setParadas] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  const { data: conductoresData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/conductores", searchConductor],
    queryFn: () => fetchJson(`/api/conductor-panel/conductores?q=${encodeURIComponent(searchConductor)}`),
    enabled: searchConductor.length >= 2 && !form.conductor,
  });
  const conductores = conductoresData?.conductores || [];

  const { data: camionesData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/camiones-disponibles"],
    queryFn: () => fetchJson("/api/conductor-panel/camiones-disponibles"),
  });
  const camiones = camionesData?.camiones || [];
  const camionesFilt = searchCamion ? camiones.filter((c: any) => c.patente.toLowerCase().includes(searchCamion.toLowerCase())) : [];

  const enviar = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/conductor-panel/viaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, paradas }),
      });
      if (res.ok) onClose();
    } catch {}
    setSending(false);
  };

  return (
    <div className="p-4" style={{ background: "#060d14", border: "1px solid #00ff8830", borderRadius: 8 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-exo text-[11px] font-bold" style={{ color: "#00ff88" }}>CREAR NUEVO VIAJE</span>
        <button onClick={onClose} className="cursor-pointer" style={{ color: "#3a6080" }}><X size={14} /></button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="relative">
          <label className="font-exo text-[8px] font-bold block mb-1" style={{ color: "#3a6080" }}>CONDUCTOR *</label>
          <input value={form.conductor || searchConductor} onChange={e => { setSearchConductor(e.target.value); setForm({ ...form, conductor: "" }); }}
            placeholder="Buscar..." className="w-full px-2 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          {searchConductor.length >= 2 && !form.conductor && conductores.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-28 overflow-y-auto z-50" style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
              {conductores.map((c: any) => (
                <div key={c.id} onClick={() => { setForm({ ...form, conductor: c.nombre }); setSearchConductor(c.nombre); }}
                  className="px-2 py-1 cursor-pointer hover:bg-[#0d2035] font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{c.nombre}</div>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <label className="font-exo text-[8px] font-bold block mb-1" style={{ color: "#3a6080" }}>CAMIÓN *</label>
          <input value={searchCamion} onChange={e => setSearchCamion(e.target.value)}
            placeholder="Patente..." className="w-full px-2 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          {searchCamion && camionesFilt.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-28 overflow-y-auto z-50" style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4 }}>
              {camionesFilt.slice(0, 8).map((c: any) => (
                <div key={c.id} onClick={() => { setForm({ ...form, camionId: c.id, patente: c.patente }); setSearchCamion(c.patente); }}
                  className="px-2 py-1 cursor-pointer hover:bg-[#0d2035] font-exo text-[9px]" style={{ color: "#ffcc00" }}>{c.patente}</div>
              ))}
            </div>
          )}
          {form.patente && <span className="font-exo text-[8px]" style={{ color: "#ffcc00" }}>{form.patente}</span>}
        </div>
        <div>
          <label className="font-exo text-[8px] font-bold block mb-1" style={{ color: "#3a6080" }}>CLIENTE</label>
          <input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })}
            placeholder="Ej: CENCOSUD" className="w-full px-2 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
        </div>
        <div>
          <label className="font-exo text-[8px] font-bold block mb-1" style={{ color: "#3a6080" }}>ORIGEN *</label>
          <input value={form.origenNombre} onChange={e => setForm({ ...form, origenNombre: e.target.value })}
            placeholder="Ej: CD Lo Aguirre" className="w-full px-2 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <label className="font-exo text-[8px] font-bold block mb-1" style={{ color: "#3a6080" }}>CARGA</label>
          <input value={form.cargaDescripcion} onChange={e => setForm({ ...form, cargaDescripcion: e.target.value })}
            placeholder="Descripción de carga" className="w-full px-2 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
        </div>
        <div>
          <label className="font-exo text-[8px] font-bold block mb-1" style={{ color: "#3a6080" }}>PARADAS</label>
          <div className="flex gap-1">
            <button onClick={() => setParadas([...paradas, { nombre: "", tipo: "ENTREGA", direccion: "" }])}
              className="px-2 py-1.5 font-exo text-[8px] font-bold cursor-pointer"
              style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 4 }}>
              + PARADA
            </button>
          </div>
        </div>
      </div>
      {paradas.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {paradas.map((p, i) => (
            <div key={i} className="flex items-center gap-1 p-1.5" style={{ background: "#0a1628", borderRadius: 4 }}>
              <span className="font-exo text-[8px] font-bold" style={{ color: "#a855f7" }}>{i + 1}</span>
              <input value={p.nombre} onChange={e => { const np = [...paradas]; np[i].nombre = e.target.value; setParadas(np); }}
                placeholder="Nombre" className="flex-1 px-1.5 py-0.5 font-exo text-[9px]"
                style={{ background: "transparent", border: "none", color: "#c8e8ff", outline: "none" }} />
              <button onClick={() => setParadas(paradas.filter((_, j) => j !== i))} className="cursor-pointer" style={{ color: "#ff2244" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button onClick={enviar} disabled={!form.conductor || !form.camionId || !form.origenNombre || sending}
        className="px-4 py-2 font-exo text-[10px] font-bold cursor-pointer"
        style={{
          background: form.conductor && form.camionId && form.origenNombre ? "linear-gradient(135deg, #00ff88, #06b6d4)" : "#0d2035",
          color: form.conductor && form.camionId && form.origenNombre ? "#060d14" : "#3a6080",
          borderRadius: 6, border: "none",
        }}>
        {sending ? "CREANDO..." : "CREAR VIAJE"}
      </button>
    </div>
  );
}

function GestionConductores() {
  const [search, setSearch] = useState("");
  const [selectedConductor, setSelectedConductor] = useState<string | null>(null);

  const { data: conductoresData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/conductores", search],
    queryFn: () => fetchJson(`/api/conductor-panel/conductores?q=${encodeURIComponent(search)}`),
  });
  const conductores = conductoresData?.conductores || [];

  const { data: ficha } = useQuery<any>({
    queryKey: ["/api/conductor-panel/conductor-ficha", selectedConductor],
    queryFn: () => fetchJson(`/api/conductor-panel/conductor-ficha/${encodeURIComponent(selectedConductor!)}`),
    enabled: !!selectedConductor,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: "#a855f7" }} />
          <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>GESTIÓN DE CONDUCTORES</span>
          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{conductores.length} registrados</span>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar conductor..." className="px-3 py-1.5 font-exo text-[10px] w-[200px]"
          style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
      </div>

      <div className="grid grid-cols-3 gap-3" style={{ height: "calc(100vh - 140px)" }}>
        <div className="col-span-1 overflow-y-auto space-y-1 pr-1">
          {conductores.map((c: any) => (
            <div key={c.id} onClick={() => setSelectedConductor(c.nombre)}
              className="p-2.5 cursor-pointer transition-all"
              style={{
                background: selectedConductor === c.nombre ? "#0d2035" : "#060d14",
                border: `1px solid ${selectedConductor === c.nombre ? "#a855f740" : "#0d2035"}`,
                borderRadius: 6,
              }}>
              <div className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.contrato || "Sin contrato"}</span>
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[8px]" style={{ color: parseFloat(c.score_comportamiento) > 70 ? "#00ff88" : parseFloat(c.score_comportamiento) > 40 ? "#ffcc00" : "#ff2244" }}>
                    Score: {parseFloat(c.score_comportamiento || 0).toFixed(0)}
                  </span>
                  <span className="font-exo text-[8px]" style={{ color: c.tendencia === "MEJORANDO" ? "#00ff88" : c.tendencia === "EMPEORANDO" ? "#ff2244" : "#3a6080" }}>
                    {c.tendencia === "MEJORANDO" ? "↑" : c.tendencia === "EMPEORANDO" ? "↓" : "→"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="col-span-2 overflow-y-auto" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          {selectedConductor && ficha ? (
            <ConductorFicha ficha={ficha} nombre={selectedConductor} />
          ) : (
            <div className="flex items-center justify-center h-full font-exo text-[11px]" style={{ color: "#3a6080" }}>
              Selecciona un conductor para ver su ficha
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConductorFicha({ ficha, nombre }: { ficha: any; nombre: string }) {
  const p = ficha.perfil;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{nombre}</div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            {p?.contrato || "Sin contrato"} {ficha.camion && `· Camión ${ficha.camion.patente} (${ficha.camion.modelo})`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { l: "SCORE", v: p ? parseFloat(p.score_comportamiento).toFixed(0) : "—", c: "#06b6d4" },
          { l: "RENDIMIENTO", v: p?.rendimiento_promedio ? `${parseFloat(p.rendimiento_promedio).toFixed(2)} km/L` : "—", c: "#00ff88" },
          { l: "JORNADAS", v: p?.total_jornadas || 0, c: "#a855f7" },
          { l: "KM TOTAL", v: p?.km_total ? `${parseFloat(p.km_total).toFixed(0)}` : "0", c: "#ffcc00" },
          { l: "TENDENCIA", v: p?.tendencia || "—", c: p?.tendencia === "MEJORANDO" ? "#00ff88" : p?.tendencia === "EMPEORANDO" ? "#ff2244" : "#3a6080" },
        ].map(s => (
          <div key={s.l} className="p-2 text-center" style={{ background: "#0a1628", borderRadius: 4 }}>
            <div className="font-space text-[14px] font-bold" style={{ color: s.c }}>{s.v}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ficha.mensajes && (
          <div className="p-2" style={{ background: "#0a1628", borderRadius: 4 }}>
            <div className="font-exo text-[8px] font-bold mb-1" style={{ color: "#a855f7" }}>MENSAJES</div>
            <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{ficha.mensajes.total} total · {ficha.mensajes.no_leidos} sin leer</span>
          </div>
        )}
        <div className="p-2" style={{ background: "#0a1628", borderRadius: 4 }}>
          <div className="font-exo text-[8px] font-bold mb-1" style={{ color: "#ff6b35" }}>NOVEDADES</div>
          <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{ficha.novedades?.length || 0} reportadas</span>
        </div>
      </div>

      <div>
        <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#c8e8ff" }}>ÚLTIMOS VIAJES</div>
        <div className="space-y-1">
          {ficha.viajes?.map((v: any) => (
            <div key={v.id} className="flex items-center justify-between p-2" style={{ background: "#0a1628", borderRadius: 4 }}>
              <div className="flex items-center gap-2">
                <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{v.codigo}</span>
                <span className="font-exo text-[8px]" style={{ color: ESTADO_COLORS[v.estado] }}>{v.estado}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.patente} · {v.cliente || "—"}</span>
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.paradas_ok}/{v.total_paradas}</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>
                  {v.fecha_salida ? new Date(v.fecha_salida).toLocaleDateString("es-CL") : ""}
                </span>
              </div>
            </div>
          ))}
          {(!ficha.viajes || ficha.viajes.length === 0) && (
            <div className="font-exo text-[9px] py-3 text-center" style={{ color: "#3a6080" }}>Sin viajes registrados</div>
          )}
        </div>
      </div>

      {ficha.novedades?.length > 0 && (
        <div>
          <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#ff6b35" }}>NOVEDADES REPORTADAS</div>
          {ficha.novedades.map((n: any) => (
            <div key={n.id} className="p-2 mb-1" style={{ background: "#0a1628", borderRadius: 4, borderLeft: `2px solid ${TIPO_NOVEDAD_COLORS[n.tipo] || "#3a6080"}` }}>
              <div className="flex items-center gap-2">
                <span className="font-exo text-[8px] font-bold" style={{ color: TIPO_NOVEDAD_COLORS[n.tipo] }}>{n.tipo}</span>
                <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{n.descripcion}</span>
                <span className="font-exo text-[7px] ml-auto" style={{ color: n.resuelta ? "#00ff88" : "#ff2244" }}>{n.resuelta ? "RESUELTA" : "ABIERTA"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Comunicaciones() {
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastContrato, setBroadcastContrato] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [selectedConductor, setSelectedConductor] = useState<string | null>(null);
  const [msgDirecto, setMsgDirecto] = useState("");
  const [searchConductor, setSearchConductor] = useState("");

  const { data: conductoresData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/conductores", searchConductor],
    queryFn: () => fetchJson(`/api/conductor-panel/conductores?q=${encodeURIComponent(searchConductor)}`),
    enabled: searchConductor.length >= 2,
  });

  const { data: mensajesData, refetch } = useQuery<any>({
    queryKey: ["/api/conductor-panel/mensajes-conductor", selectedConductor],
    queryFn: () => fetchJson(`/api/conductor-panel/mensajes-conductor/${encodeURIComponent(selectedConductor!)}`),
    enabled: !!selectedConductor,
    refetchInterval: 10000,
  });

  const enviarBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/conductor-panel/mensaje/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: broadcastMsg, contrato: broadcastContrato || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setSent(`Enviado a ${data.enviados} conductores`);
        setBroadcastMsg("");
        setTimeout(() => setSent(null), 3000);
      }
    } catch {}
    setSending(false);
  };

  const enviarDirecto = async () => {
    if (!msgDirecto.trim() || !selectedConductor) return;
    setSending(true);
    try {
      const res = await fetch("/api/conductor-panel/mensaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conductor: selectedConductor, mensaje: msgDirecto }),
      });
      if (res.ok) {
        setMsgDirecto("");
        refetch();
      }
    } catch {}
    setSending(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle size={16} style={{ color: "#ffcc00" }} />
        <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>COMUNICACIONES</span>
      </div>

      <div className="p-4" style={{ background: "#060d14", border: "1px solid #a855f730", borderRadius: 8 }}>
        <div className="flex items-center gap-2 mb-3">
          <Megaphone size={14} style={{ color: "#a855f7" }} />
          <span className="font-exo text-[11px] font-bold" style={{ color: "#a855f7" }}>BROADCAST — MENSAJE MASIVO</span>
        </div>
        <div className="flex gap-2 mb-2">
          <select value={broadcastContrato} onChange={e => setBroadcastContrato(e.target.value)}
            className="px-2 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }}>
            <option value="">Todos los conductores activos</option>
            <option value="CENCOSUD">Solo CENCOSUD</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && enviarBroadcast()}
            placeholder="Escribir mensaje para todos los conductores..."
            className="flex-1 px-3 py-2 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          <button onClick={enviarBroadcast} disabled={!broadcastMsg.trim() || sending}
            className="px-4 py-2 font-exo text-[10px] font-bold cursor-pointer flex items-center gap-1"
            style={{ color: "#060d14", background: broadcastMsg.trim() ? "linear-gradient(135deg, #a855f7, #ff6b35)" : "#0d2035", borderRadius: 6, border: "none" }}>
            <Megaphone size={12} /> ENVIAR A TODOS
          </button>
        </div>
        {sent && <div className="mt-2 font-exo text-[9px] font-bold" style={{ color: "#00ff88" }}>{sent}</div>}
        <div className="flex gap-1 mt-2 flex-wrap">
          {MENSAJES_RAPIDOS.map(mr => (
            <button key={mr} onClick={() => setBroadcastMsg(mr)}
              className="px-2 py-1 font-exo text-[7px] cursor-pointer"
              style={{ color: "#a855f7", background: "#a855f710", border: "1px solid #a855f720", borderRadius: 3 }}>
              {mr}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3" style={{ height: "calc(100vh - 300px)" }}>
        <div className="col-span-1 space-y-2">
          <div className="font-exo text-[9px] font-bold" style={{ color: "#06b6d4" }}>MENSAJE DIRECTO</div>
          <input value={searchConductor} onChange={e => setSearchConductor(e.target.value)}
            placeholder="Buscar conductor..." className="w-full px-3 py-1.5 font-exo text-[10px]"
            style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
          <div className="overflow-y-auto space-y-1" style={{ maxHeight: "calc(100vh - 400px)" }}>
            {(conductoresData?.conductores || []).map((c: any) => (
              <div key={c.id} onClick={() => { setSelectedConductor(c.nombre); setSearchConductor(""); }}
                className="p-2 cursor-pointer transition-all"
                style={{
                  background: selectedConductor === c.nombre ? "#0d2035" : "#060d14",
                  border: `1px solid ${selectedConductor === c.nombre ? "#a855f740" : "#0d2035"}`,
                  borderRadius: 4,
                }}>
                <div className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</div>
                <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.contrato}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-2 flex flex-col" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          {selectedConductor ? (
            <>
              <div className="p-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{selectedConductor}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {(mensajesData?.mensajes || []).map((m: any) => (
                  <div key={m.id} className={`flex ${m.remitente === "TORRE" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[70%] px-3 py-2" style={{
                      background: m.remitente === "TORRE" ? "#a855f720" : "#0d2035",
                      borderRadius: 8,
                      border: `1px solid ${m.remitente === "TORRE" ? "#a855f730" : "#1a3050"}`,
                    }}>
                      <div className="font-exo text-[7px] mb-0.5" style={{ color: m.remitente === "TORRE" ? "#a855f7" : "#ff6b35" }}>
                        {m.remitente} · {new Date(m.created_at).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {m.viaje_codigo && <span style={{ color: "#3a6080" }}> · {m.viaje_codigo}</span>}
                      </div>
                      <div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{m.mensaje}</div>
                    </div>
                  </div>
                ))}
                {(!mensajesData?.mensajes || mensajesData.mensajes.length === 0) && (
                  <div className="flex items-center justify-center h-full font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin mensajes con este conductor</div>
                )}
              </div>
              <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #0d2035" }}>
                <input value={msgDirecto} onChange={e => setMsgDirecto(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && enviarDirecto()}
                  placeholder="Escribir mensaje..." className="flex-1 px-3 py-2 font-exo text-[10px]"
                  style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none" }} />
                <button onClick={enviarDirecto} disabled={!msgDirecto.trim() || sending}
                  className="px-3 py-2 cursor-pointer"
                  style={{ color: "#a855f7", background: "#a855f715", border: "1px solid #a855f730", borderRadius: 4 }}>
                  <Send size={14} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full font-exo text-[11px]" style={{ color: "#3a6080" }}>
              Selecciona un conductor para chatear
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GestionNovedades() {
  const qc = useQueryClient();
  const { data: novedadesData } = useQuery<any>({
    queryKey: ["/api/conductor-panel/novedades"],
    queryFn: () => fetchJson("/api/conductor-panel/novedades"),
    refetchInterval: 15000,
  });
  const novedades = novedadesData?.novedades || [];
  const abiertas = novedades.filter((n: any) => !n.resuelta);
  const resueltas = novedades.filter((n: any) => n.resuelta);

  const resolver = async (id: number) => {
    try {
      const res = await fetch(`/api/conductor-panel/novedad/${id}/resolver`, { method: "PATCH" });
      if (res.ok) qc.invalidateQueries({ queryKey: ["/api/conductor-panel/novedades"] });
    } catch {}
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} style={{ color: "#ff6b35" }} />
        <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>CENTRO DE NOVEDADES</span>
        {abiertas.length > 0 && (
          <span className="font-exo text-[9px] px-2 py-0.5" style={{ color: "#ff2244", background: "#ff224420", borderRadius: 10 }}>
            {abiertas.length} abiertas
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ height: "calc(100vh - 140px)" }}>
        <div className="overflow-y-auto">
          <div className="font-exo text-[10px] font-bold mb-2 flex items-center gap-2" style={{ color: "#ff2244" }}>
            <Radio size={10} /> ABIERTAS ({abiertas.length})
          </div>
          <div className="space-y-2">
            {abiertas.map((n: any) => (
              <div key={n.id} className="p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6, borderLeft: `3px solid ${TIPO_NOVEDAD_COLORS[n.tipo] || "#3a6080"}` }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-exo text-[9px] font-bold px-1.5 py-0.5" style={{ color: TIPO_NOVEDAD_COLORS[n.tipo], background: `${TIPO_NOVEDAD_COLORS[n.tipo]}15`, borderRadius: 3 }}>
                      {n.tipo}
                    </span>
                    <span className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{n.conductor}</span>
                  </div>
                  <button onClick={() => resolver(n.id)}
                    className="px-2 py-1 font-exo text-[8px] font-bold cursor-pointer"
                    style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", borderRadius: 4 }}>
                    RESOLVER
                  </button>
                </div>
                <div className="font-exo text-[10px] mb-1" style={{ color: "#c8e8ff" }}>{n.descripcion}</div>
                <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>
                  {new Date(n.creado_at).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {n.viaje_id && ` · Viaje #${n.viaje_id}`}
                </div>
              </div>
            ))}
            {abiertas.length === 0 && <div className="font-exo text-[10px] py-6 text-center" style={{ color: "#3a6080" }}>Sin novedades abiertas</div>}
          </div>
        </div>

        <div className="overflow-y-auto">
          <div className="font-exo text-[10px] font-bold mb-2 flex items-center gap-2" style={{ color: "#00ff88" }}>
            <CheckCircle size={10} /> RESUELTAS ({resueltas.length})
          </div>
          <div className="space-y-1">
            {resueltas.map((n: any) => (
              <div key={n.id} className="p-2 opacity-60" style={{ background: "#060d14", borderRadius: 4, borderLeft: `2px solid ${TIPO_NOVEDAD_COLORS[n.tipo] || "#3a6080"}` }}>
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[8px]" style={{ color: TIPO_NOVEDAD_COLORS[n.tipo] }}>{n.tipo}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{n.descripcion}</span>
                </div>
                <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{n.conductor} · {new Date(n.creado_at).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            ))}
            {resueltas.length === 0 && <div className="font-exo text-[10px] py-6 text-center" style={{ color: "#3a6080" }}>Sin novedades resueltas</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
