import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, Activity, Fuel, Gauge, ThermometerSun, Clock, Search, ArrowLeft, RefreshCw, Wifi, WifiOff, AlertTriangle } from "lucide-react";

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

const ESTADO_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  en_ruta: { color: "#00ff88", label: "EN RUTA", bg: "rgba(0,255,136,0.08)" },
  detenido: { color: "#ff6b35", label: "DETENIDO", bg: "rgba(255,107,53,0.08)" },
  ralenti: { color: "#ffcc00", label: "RALENTI", bg: "rgba(255,204,0,0.08)" },
  sin_senal: { color: "#ff2244", label: "SIN SEÑAL", bg: "rgba(255,34,68,0.08)" },
};

export default function WiseTrackView({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [selectedPatente, setSelectedPatente] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<WTResponse>({
    queryKey: ["/api/wisetrack/en-vivo"],
    queryFn: () => fetch("/api/wisetrack/en-vivo").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    if (!data?.vehiculos) return [];
    let list = data.vehiculos;
    if (filtroEstado) list = list.filter((v) => v.estado === filtroEstado);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.patente.toLowerCase().includes(s) ||
          v.etiqueta.toLowerCase().includes(s) ||
          v.conductor.toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => {
      const order = { en_ruta: 0, ralenti: 1, detenido: 2, sin_senal: 3 };
      return (order[a.estado] ?? 4) - (order[b.estado] ?? 4);
    });
  }, [data, filtroEstado, search]);

  const selected = selectedPatente ? data?.vehiculos.find((v) => v.patente === selectedPatente) : null;

  const ago = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <div className="h-full flex flex-col" style={{ background: "#020508" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded hover:bg-[#0a1520] transition-colors">
            <ArrowLeft className="w-4 h-4" style={{ color: "#4a7090" }} />
          </button>
          <div>
            <div className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>
              WISETRACK GPS
            </div>
            <div className="font-exo text-[9px] tracking-wider" style={{ color: "#4a7090" }}>
              CENCOSUD · SEGUIMIENTO EN VIVO
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {ago !== null && (
            <span className="font-exo text-[9px]" style={{ color: ago < 60 ? "#00ff88" : "#ffcc00" }}>
              Actualizado hace {ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m`}
            </span>
          )}
          <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-[#0a1520] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" style={{ color: "#4a7090" }} />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {data?.resumen && (
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
          {[
            { key: null, label: "TODOS", count: data.resumen.total, color: "#00d4ff" },
            { key: "en_ruta", label: "EN RUTA", count: data.resumen.en_ruta, color: "#00ff88" },
            { key: "detenido", label: "DETENIDO", count: data.resumen.detenido, color: "#ff6b35" },
            { key: "ralenti", label: "RALENTI", count: data.resumen.ralenti, color: "#ffcc00" },
            { key: "sin_senal", label: "SIN SEÑAL", count: data.resumen.sin_senal, color: "#ff2244" },
          ].map((b) => (
            <button
              key={b.key || "all"}
              onClick={() => setFiltroEstado(b.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors"
              style={{
                background: filtroEstado === b.key ? `${b.color}15` : "transparent",
                border: `1px solid ${filtroEstado === b.key ? b.color + "40" : "transparent"}`,
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
              <span className="font-space text-[10px] font-bold" style={{ color: b.color }}>
                {b.count}
              </span>
              <span className="font-exo text-[8px]" style={{ color: "#4a7090" }}>
                {b.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar patente, etiqueta, conductor..."
            className="w-full pl-9 pr-3 py-2 rounded font-exo text-[11px]"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff", outline: "none" }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Vehicle list */}
        <div className="flex-1 overflow-auto p-3 space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="font-exo text-[11px]" style={{ color: "#4a7090" }}>Conectando con WiseTrack...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="font-exo text-[11px]" style={{ color: "#4a7090" }}>Sin resultados</div>
            </div>
          ) : (
            filtered.map((v) => {
              const cfg = ESTADO_CONFIG[v.estado] || ESTADO_CONFIG.sin_senal;
              return (
                <button
                  key={v.patente}
                  onClick={() => setSelectedPatente(v.patente === selectedPatente ? null : v.patente)}
                  className="w-full text-left px-3 py-2.5 rounded transition-all"
                  style={{
                    background: selectedPatente === v.patente ? "#0d1f30" : "#060d14",
                    border: `1px solid ${selectedPatente === v.patente ? cfg.color + "30" : "#0d2035"}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{v.etiqueta}</span>
                          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{v.patente}</span>
                        </div>
                        <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                          {v.conductor !== "Sin Conductor Registrado" ? v.conductor : "Sin conductor"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-space text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {v.velocidad > 0 && (
                          <span className="font-space text-[10px]" style={{ color: "#00d4ff" }}>{v.velocidad} km/h</span>
                        )}
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                          {v.minutosAgo < 60 ? `${v.minutosAgo}m` : `${Math.floor(v.minutosAgo / 60)}h`}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[360px] overflow-auto border-l" style={{ borderColor: "#0d2035", background: "#060d14" }}>
            <VehicleDetail vehicle={selected} onClose={() => setSelectedPatente(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function VehicleDetail({ vehicle: v, onClose }: { vehicle: WTVehicle; onClose: () => void }) {
  const cfg = ESTADO_CONFIG[v.estado] || ESTADO_CONFIG.sin_senal;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{v.etiqueta}</div>
          <div className="font-exo text-[11px]" style={{ color: "#4a7090" }}>{v.patente}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[#0a1520]">
          <span className="font-space text-[14px]" style={{ color: "#3a6080" }}>×</span>
        </button>
      </div>

      {/* Status badge */}
      <div className="px-3 py-2 rounded" style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }} />
          <span className="font-space text-[12px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          {v.ignicion && (
            <span className="font-exo text-[8px] px-1.5 py-0.5 rounded" style={{ background: "#00ff8820", color: "#00ff88" }}>
              IGNICIÓN ON
            </span>
          )}
        </div>
        <div className="font-exo text-[9px] mt-1" style={{ color: "#4a7090" }}>
          WiseTrack: {v.estadoWt} · Hace {v.minutosAgo < 60 ? `${v.minutosAgo} min` : `${Math.floor(v.minutosAgo / 60)}h ${v.minutosAgo % 60}m`}
        </div>
      </div>

      {/* Conductor */}
      <div className="px-3 py-2 rounded" style={{ background: "#0a1520" }}>
        <div className="font-exo text-[8px] tracking-wider mb-1" style={{ color: "#3a6080" }}>CONDUCTOR</div>
        <div className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>
          {v.conductor !== "Sin Conductor Registrado" ? v.conductor : "No registrado"}
        </div>
      </div>

      {/* GPS */}
      <div className="px-3 py-2 rounded" style={{ background: "#0a1520" }}>
        <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>POSICIÓN GPS</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Latitud</div>
            <div className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{v.lat.toFixed(5)}</div>
          </div>
          <div>
            <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Longitud</div>
            <div className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{v.lng.toFixed(5)}</div>
          </div>
          <div>
            <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Velocidad</div>
            <div className="font-space text-[11px]" style={{ color: v.velocidad > 0 ? "#00ff88" : "#4a7090" }}>{v.velocidad} km/h</div>
          </div>
          <div>
            <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Heading</div>
            <div className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{v.heading}°</div>
          </div>
        </div>
      </div>

      {/* Telemetry */}
      <div className="px-3 py-2 rounded" style={{ background: "#0a1520" }}>
        <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>TELEMETRÍA</div>
        <div className="grid grid-cols-2 gap-3">
          <TelemetryItem icon={Gauge} label="KMS TOTAL" value={`${Math.round(v.kmsTotal).toLocaleString()}`} color="#00d4ff" />
          <TelemetryItem icon={Fuel} label="ESTANQUE" value={`${v.nivelEstanque}%`} color={v.nivelEstanque < 20 ? "#ff2244" : v.nivelEstanque < 40 ? "#ffcc00" : "#00ff88"} />
          <TelemetryItem icon={Activity} label="RPM" value={`${v.rpm}`} color={v.rpm > 1800 ? "#ff6b35" : "#c8e8ff"} />
          <TelemetryItem icon={ThermometerSun} label="TEMP MOTOR" value={`${v.tempMotor}°C`} color={v.tempMotor > 95 ? "#ff2244" : "#c8e8ff"} />
        </div>
      </div>

      {/* Last trip */}
      {v.ultimoViaje.inicio && (
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520" }}>
          <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>ÚLTIMO VIAJE</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>Inicio</span>
              <span className="font-space text-[9px]" style={{ color: "#c8e8ff" }}>{v.ultimoViaje.inicio}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>Fin</span>
              <span className="font-space text-[9px]" style={{ color: "#c8e8ff" }}>{v.ultimoViaje.fin}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>Distancia</span>
              <span className="font-space text-[9px] font-bold" style={{ color: "#00d4ff" }}>{v.ultimoViaje.kms} km</span>
            </div>
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-center">
        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
          Última lectura: {v.fecha}
        </span>
      </div>
    </div>
  );
}

function TelemetryItem({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
      <div>
        <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{label}</div>
        <div className="font-space text-[12px] font-bold" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
