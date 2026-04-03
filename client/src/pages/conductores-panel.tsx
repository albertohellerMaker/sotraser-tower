import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, AlertTriangle, MapPin, CheckCircle, Clock, Truck, ChevronDown, ChevronUp, Search } from "lucide-react";

interface Novedad {
  id: number;
  viaje_id: number | null;
  conductor: string;
  tipo: string;
  descripcion: string;
  lat: number | null;
  lng: number | null;
  resuelta: boolean;
  creado_at: string;
}

interface ParadaReciente {
  id: number;
  viaje_id: number;
  nombre: string;
  estado: string;
  hora_real: string | null;
  conductor: string;
  patente: string;
  cliente: string;
}

interface ConductorActivo {
  nombre: string;
  patente: string;
  contrato: string;
  ultimo_punto: string | null;
  lat: number | null;
  lng: number | null;
  velocidad: number | null;
  viajes_hoy: number;
  paradas_completadas: number;
  paradas_total: number;
}

const TIPO_COLORS: Record<string, string> = {
  MECANICA: "#ff6b35",
  ACCIDENTE: "#ff2244",
  RETRASO: "#ffcc00",
  CARGA: "#06b6d4",
  OTRO: "#3a6080",
};

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: "#3a6080",
  EN_CAMINO: "#ffcc00",
  COMPLETADA: "#00ff88",
  SALTADA: "#ff2244",
};

export default function ConductoresPanel() {
  const [filtro, setFiltro] = useState("");
  const [expandedConductor, setExpandedConductor] = useState<string | null>(null);

  const { data: novedades, isLoading: loadingNovedades } = useQuery<Novedad[]>({
    queryKey: ["/api/conductor-panel/novedades"],
    queryFn: () => fetch("/api/conductor-panel/novedades").then(r => r.json()).then(d => d.novedades || []),
    refetchInterval: 30000,
  });

  const { data: paradasRecientes, isLoading: loadingParadas } = useQuery<ParadaReciente[]>({
    queryKey: ["/api/conductor-panel/paradas-recientes"],
    queryFn: () => fetch("/api/conductor-panel/paradas-recientes").then(r => r.json()).then(d => d.paradas || []),
    refetchInterval: 30000,
  });

  const { data: conductoresActivos, isLoading: loadingActivos } = useQuery<ConductorActivo[]>({
    queryKey: ["/api/conductor-panel/activos"],
    queryFn: () => fetch("/api/conductor-panel/activos").then(r => r.json()).then(d => d.conductores || []),
    refetchInterval: 60000,
  });

  const novedadesAbiertas = novedades?.filter(n => !n.resuelta) || [];
  const conductoresFiltrados = (conductoresActivos || []).filter(c =>
    !filtro || c.nombre.toLowerCase().includes(filtro.toLowerCase()) || c.patente?.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={20} style={{ color: "#00d4ff" }} />
          <h2 className="font-space text-[18px] font-bold" style={{ color: "#c8e8ff" }}>PANEL CONDUCTORES</h2>
          <span className="font-exo text-[10px] px-2 py-0.5" style={{ color: "#3a6080", background: "#0d2035", borderRadius: 4 }}>
            {conductoresActivos?.length || 0} activos
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="CONDUCTORES ACTIVOS" value={conductoresActivos?.length || 0} color="#00d4ff" icon={Users} />
        <StatCard label="NOVEDADES ABIERTAS" value={novedadesAbiertas.length} color={novedadesAbiertas.length > 0 ? "#ff2244" : "#00ff88"} icon={AlertTriangle} />
        <StatCard label="PARADAS HOY" value={paradasRecientes?.length || 0} color="#a855f7" icon={MapPin} />
        <StatCard
          label="COMPLETADAS"
          value={paradasRecientes?.filter(p => p.estado === "COMPLETADA").length || 0}
          color="#00ff88"
          icon={CheckCircle}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>CONDUCTORES ACTIVOS</h3>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
                <input
                  value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                  placeholder="Buscar conductor o patente..."
                  className="pl-7 pr-3 py-1.5 font-exo text-[10px]"
                  style={{ background: "#0a1628", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff", outline: "none", width: 220 }}
                />
              </div>
            </div>

            {loadingActivos ? (
              <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Cargando...</div>
            ) : conductoresFiltrados.length === 0 ? (
              <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>
                No hay conductores con actividad hoy
              </div>
            ) : (
              <div className="space-y-1">
                {conductoresFiltrados.map(c => (
                  <div key={c.nombre} style={{ background: "#0a1628", borderRadius: 6, border: `1px solid ${expandedConductor === c.nombre ? "#00d4ff30" : "#0d2035"}` }}>
                    <div
                      className="flex items-center justify-between px-3 py-2 cursor-pointer"
                      onClick={() => setExpandedConductor(expandedConductor === c.nombre ? null : c.nombre)}
                    >
                      <div className="flex items-center gap-3">
                        <Truck size={12} style={{ color: "#06b6d4" }} />
                        <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.nombre}</span>
                        {c.patente && <span className="font-exo text-[9px] px-1.5 py-0.5" style={{ color: "#ffcc00", background: "#ffcc0015", borderRadius: 3 }}>{c.patente}</span>}
                        {c.contrato && <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.contrato}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {c.paradas_total > 0 && (
                          <span className="font-exo text-[9px]" style={{ color: c.paradas_completadas === c.paradas_total ? "#00ff88" : "#ffcc00" }}>
                            {c.paradas_completadas}/{c.paradas_total} paradas
                          </span>
                        )}
                        {c.velocidad != null && c.velocidad > 0 && (
                          <span className="font-space text-[10px] font-bold" style={{ color: c.velocidad > 90 ? "#ff2244" : "#00ff88" }}>
                            {Math.round(c.velocidad)} km/h
                          </span>
                        )}
                        {expandedConductor === c.nombre ? <ChevronUp size={12} style={{ color: "#3a6080" }} /> : <ChevronDown size={12} style={{ color: "#3a6080" }} />}
                      </div>
                    </div>
                    {expandedConductor === c.nombre && (
                      <div className="px-3 pb-3 pt-1 space-y-2" style={{ borderTop: "1px solid #0d2035" }}>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                            Viajes hoy: <span style={{ color: "#c8e8ff" }}>{c.viajes_hoy}</span>
                          </div>
                          {c.ultimo_punto && (
                            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                              Última pos: <span style={{ color: "#c8e8ff" }}>{new Date(c.ultimo_punto).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          )}
                          {c.lat && c.lng && (
                            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                              GPS: <span style={{ color: "#c8e8ff" }}>{Number(c.lat).toFixed(4)}, {Number(c.lng).toFixed(4)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }} className="p-4">
            <h3 className="font-exo text-[11px] font-bold mb-3" style={{ color: "#c8e8ff" }}>PARADAS RECIENTES</h3>
            {loadingParadas ? (
              <div className="text-center py-4 font-exo text-[10px]" style={{ color: "#3a6080" }}>Cargando...</div>
            ) : (paradasRecientes || []).length === 0 ? (
              <div className="text-center py-4 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin paradas recientes</div>
            ) : (
              <div className="space-y-1">
                {(paradasRecientes || []).slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1628", borderRadius: 4 }}>
                    <div className="flex items-center gap-3">
                      <MapPin size={10} style={{ color: ESTADO_COLORS[p.estado] || "#3a6080" }} />
                      <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{p.nombre}</span>
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{p.conductor}</span>
                      {p.patente && <span className="font-exo text-[9px]" style={{ color: "#ffcc0080" }}>{p.patente}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-exo text-[8px] px-1.5 py-0.5" style={{ color: ESTADO_COLORS[p.estado], background: `${ESTADO_COLORS[p.estado]}15`, borderRadius: 3 }}>
                        {p.estado}
                      </span>
                      {p.hora_real && (
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                          {new Date(p.hora_real).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div style={{ background: "#060d14", border: `1px solid ${novedadesAbiertas.length > 0 ? "#ff224430" : "#0d2035"}`, borderRadius: 8 }} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} style={{ color: novedadesAbiertas.length > 0 ? "#ff2244" : "#3a6080" }} />
              <h3 className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>
                NOVEDADES {novedadesAbiertas.length > 0 && `(${novedadesAbiertas.length})`}
              </h3>
            </div>
            {loadingNovedades ? (
              <div className="text-center py-4 font-exo text-[10px]" style={{ color: "#3a6080" }}>Cargando...</div>
            ) : (novedades || []).length === 0 ? (
              <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin novedades reportadas</div>
            ) : (
              <div className="space-y-2">
                {(novedades || []).slice(0, 15).map(n => (
                  <div key={n.id} className="p-2.5" style={{ background: "#0a1628", borderRadius: 6, borderLeft: `3px solid ${TIPO_COLORS[n.tipo] || "#3a6080"}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-exo text-[8px] font-bold px-1.5 py-0.5" style={{ color: TIPO_COLORS[n.tipo], background: `${TIPO_COLORS[n.tipo]}15`, borderRadius: 3 }}>
                        {n.tipo}
                      </span>
                      <div className="flex items-center gap-1">
                        {!n.resuelta && <span className="font-exo text-[8px] px-1 py-0.5" style={{ color: "#ff2244", background: "#ff224415", borderRadius: 3 }}>ABIERTA</span>}
                        {n.resuelta && <span className="font-exo text-[8px] px-1 py-0.5" style={{ color: "#00ff88", background: "#00ff8815", borderRadius: 3 }}>RESUELTA</span>}
                      </div>
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
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <div className="p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} style={{ color }} />
        <span className="font-exo text-[8px] font-bold" style={{ color: "#3a6080" }}>{label}</span>
      </div>
      <div className="font-space text-[22px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
