import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Gauge, ChevronDown, ChevronRight, Truck } from "lucide-react";

interface EventoVelocidad {
  camionId: number;
  patente: string;
  modelo: string;
  conductor: string | null;
  faena: string | null;
  velocidadMaxima: number;
  fecha: string;
  lat: number | null;
  lng: number | null;
  riesgo: "ALTO" | "MEDIO" | "BAJO";
}

interface CamionExceso {
  patente: string;
  modelo: string;
  conductor: string | null;
  faena: string | null;
  velocidadMaxima: number;
  totalExcesos: number;
  ultimoExceso: string;
  eventos: EventoVelocidad[];
  riesgo: "ALTO" | "MEDIO" | "BAJO";
}

interface ExcesosData {
  eventos: EventoVelocidad[];
  porCamion: CamionExceso[];
  totals: {
    camionesConExceso: number;
    eventosTotal: number;
    masGrave: { patente: string; velocidad: number } | null;
    hoy: number;
    limiteKmh: number;
  };
  resumen: {
    nuncaExcedieron: number;
    ocasionales: number;
    frecuentes: number;
  };
  desde: string;
}

function RiesgoBadge({ riesgo }: { riesgo: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string }> = {
    ALTO: { color: "#ff2244", bg: "rgba(255,34,68,0.1)", border: "rgba(255,34,68,0.3)" },
    MEDIO: { color: "#ffcc00", bg: "rgba(255,204,0,0.08)", border: "rgba(255,204,0,0.3)" },
    BAJO: { color: "#00ff88", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.3)" },
  };
  const c = cfg[riesgo] || cfg.BAJO;
  return (
    <span className="font-space text-xs font-bold px-2 py-0.5 uppercase tracking-[0.1em]"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {riesgo}
    </span>
  );
}

export default function ExcesosVelocidad() {
  const [vista, setVista] = useState<"camion" | "evento">("camion");
  const [expandedPatente, setExpandedPatente] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ExcesosData>({
    queryKey: ["/api/datos/excesos-velocidad"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="excesos-loading">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: "#3a6080" }}>Analizando excesos de velocidad...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-card px-8 py-12 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#ff2244" }} />
        <div className="font-space text-[14px] font-bold" style={{ color: "#ff2244" }}>Error al cargar datos</div>
      </div>
    );
  }

  if (!data) return null;
  const { eventos, porCamion, totals, resumen } = data;

  return (
    <div className="space-y-5" data-testid="excesos-velocidad-page">
      <div>
        <h2 className="font-space text-[18px] font-bold tracking-[0.12em] uppercase" style={{ color: "#c8e8ff" }}>
          Excesos de Velocidad
        </h2>
        <p className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>
          Limite: {totals.limiteKmh} km/h &middot; Datos en tiempo real via Volvo rFMS
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="dash-card px-4 py-3" data-testid="kpi-camiones-exceso">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CAMIONES CON EXCESOS</div>
          <div className="font-space text-2xl font-bold" style={{ color: totals.camionesConExceso > 0 ? "#ff2244" : "#00ff88" }}>
            {totals.camionesConExceso}
          </div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>actualmente sobre limite</div>
        </div>
        <div className="dash-card px-4 py-3" data-testid="kpi-eventos-total">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>EVENTOS TOTALES</div>
          <div className="font-space text-2xl font-bold" style={{ color: "#ffcc00" }}>{totals.eventosTotal}</div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>detecciones activas</div>
        </div>
        <div className="dash-card px-4 py-3" data-testid="kpi-mas-grave">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>MAS GRAVE</div>
          {totals.masGrave ? (
            <>
              <div className="font-space text-2xl font-bold" style={{ color: "#ff2244" }}>{totals.masGrave.velocidad} km/h</div>
              <div className="font-exo text-xs" style={{ color: "#3a6080" }}>{totals.masGrave.patente}</div>
            </>
          ) : (
            <div className="font-space text-2xl font-bold" style={{ color: "#00ff88" }}>---</div>
          )}
        </div>
        <div className="dash-card px-4 py-3" data-testid="kpi-hoy">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>HOY</div>
          <div className="font-space text-2xl font-bold" style={{ color: totals.hoy > 0 ? "#ffcc00" : "#00ff88" }}>{totals.hoy}</div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>eventos detectados</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="font-space text-xs font-bold tracking-[0.1em] uppercase px-4 py-1.5 transition-all"
          style={{
            color: vista === "camion" ? "#00d4ff" : "#3a6080",
            background: vista === "camion" ? "rgba(0,212,255,0.1)" : "transparent",
            border: `1px solid ${vista === "camion" ? "#00d4ff30" : "#0d2035"}`,
          }}
          onClick={() => setVista("camion")}
          data-testid="btn-vista-camion"
        >
          POR CAMION
        </button>
        <button
          className="font-space text-xs font-bold tracking-[0.1em] uppercase px-4 py-1.5 transition-all"
          style={{
            color: vista === "evento" ? "#00d4ff" : "#3a6080",
            background: vista === "evento" ? "rgba(0,212,255,0.1)" : "transparent",
            border: `1px solid ${vista === "evento" ? "#00d4ff30" : "#0d2035"}`,
          }}
          onClick={() => setVista("evento")}
          data-testid="btn-vista-evento"
        >
          POR EVENTO
        </button>
      </div>

      {vista === "camion" ? (
        <div className="dash-card overflow-hidden">
          {porCamion.length === 0 ? (
            <div className="px-8 py-12 text-center">
              <Gauge className="w-10 h-10 mx-auto mb-3" style={{ color: "#00ff88" }} />
              <div className="font-space text-[14px] font-bold" style={{ color: "#00ff88" }}>Ningun camion excede el limite</div>
              <div className="font-exo text-[11px] mt-2" style={{ color: "#3a6080" }}>
                Todos los camiones CENCOSUD con GPS activo circulan bajo {totals.limiteKmh} km/h
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: "1px solid #0d2035", background: "#020508" }}>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "70px" }}>PATENTE</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "120px" }}>CONDUCTOR</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "120px" }}>FAENA</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "80px" }}>VEL. MAX</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "70px" }}>EXCESOS</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1 text-right" style={{ color: "#3a6080" }}>RIESGO</span>
              </div>
              {porCamion.map(c => (
                <div key={c.patente}>
                  <div
                    className="flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
                    style={{ borderBottom: "1px solid #0d2035" }}
                    onClick={() => setExpandedPatente(expandedPatente === c.patente ? null : c.patente)}
                    data-testid={`exceso-camion-${c.patente}`}
                  >
                    <div className="flex items-center gap-1.5" style={{ width: "70px" }}>
                      <Truck className="w-3 h-3 flex-shrink-0" style={{ color: c.riesgo === "ALTO" ? "#ff2244" : c.riesgo === "MEDIO" ? "#ffcc00" : "#00ff88" }} />
                      <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                    </div>
                    <span className="font-exo text-xs truncate" style={{ color: "#c8e8ff", width: "120px" }}>{c.conductor || "---"}</span>
                    <span className="font-exo text-xs truncate" style={{ color: "#3a6080", width: "120px" }}>{c.faena || "---"}</span>
                    <span className="font-space text-[12px] font-bold text-right" style={{
                      color: c.velocidadMaxima > 105 ? "#ff2244" : c.velocidadMaxima > 90 ? "#ffcc00" : "#c8e8ff",
                      width: "80px"
                    }}>
                      {c.velocidadMaxima} km/h
                    </span>
                    <span className="font-space text-[11px] text-right" style={{ color: "#c8e8ff", width: "70px" }}>{c.totalExcesos}</span>
                    <div className="flex-1 text-right flex items-center justify-end gap-2">
                      <RiesgoBadge riesgo={c.riesgo} />
                      {expandedPatente === c.patente
                        ? <ChevronDown className="w-4 h-4" style={{ color: "#00d4ff" }} />
                        : <ChevronRight className="w-4 h-4" style={{ color: "#3a6080" }} />}
                    </div>
                  </div>
                  {expandedPatente === c.patente && (
                    <div className="px-5 py-3" style={{ background: "rgba(0,212,255,0.02)", borderBottom: "1px solid #0d2035" }}>
                      <div className="font-exo text-xs tracking-[0.15em] uppercase mb-2" style={{ color: "#3a6080" }}>EVENTOS DE EXCESO</div>
                      {c.eventos.map((e, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                          <span className="font-space text-xs" style={{ color: "#3a6080", width: "130px" }}>
                            {new Date(e.fecha).toLocaleString("es-CL")}
                          </span>
                          <span className="font-space text-[12px] font-bold" style={{
                            color: e.velocidadMaxima > 105 ? "#ff2244" : e.velocidadMaxima > 90 ? "#ffcc00" : "#c8e8ff"
                          }}>
                            {e.velocidadMaxima} km/h
                          </span>
                          {e.lat && e.lng && (
                            <span className="font-space text-xs" style={{ color: "#3a6080" }}>
                              {e.lat.toFixed(3)}, {e.lng.toFixed(3)}
                            </span>
                          )}
                          <RiesgoBadge riesgo={e.riesgo} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          {eventos.length === 0 ? (
            <div className="px-8 py-12 text-center">
              <Gauge className="w-10 h-10 mx-auto mb-3" style={{ color: "#00ff88" }} />
              <div className="font-space text-[14px] font-bold" style={{ color: "#00ff88" }}>Sin excesos activos</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: "1px solid #0d2035", background: "#020508" }}>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "130px" }}>FECHA</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "70px" }}>PATENTE</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "120px" }}>CONDUCTOR</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "80px" }}>VELOCIDAD</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "100px" }}>UBICACION</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1 text-right" style={{ color: "#3a6080" }}>RIESGO</span>
              </div>
              {eventos.map((e, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5"
                  style={{ borderBottom: "1px solid #0d2035" }}
                  data-testid={`exceso-evento-${i}`}>
                  <span className="font-space text-xs" style={{ color: "#3a6080", width: "130px" }}>
                    {new Date(e.fecha).toLocaleString("es-CL")}
                  </span>
                  <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff", width: "70px" }}>{e.patente}</span>
                  <span className="font-exo text-xs truncate" style={{ color: "#c8e8ff", width: "120px" }}>{e.conductor || "---"}</span>
                  <span className="font-space text-[12px] font-bold text-right" style={{
                    color: e.velocidadMaxima > 105 ? "#ff2244" : e.velocidadMaxima > 90 ? "#ffcc00" : "#c8e8ff",
                    width: "80px"
                  }}>
                    {e.velocidadMaxima} km/h
                  </span>
                  <span className="font-space text-xs" style={{ color: "#3a6080", width: "100px" }}>
                    {e.lat && e.lng ? `${e.lat.toFixed(3)}, ${e.lng.toFixed(3)}` : "---"}
                  </span>
                  <div className="flex-1 text-right">
                    <RiesgoBadge riesgo={e.riesgo} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="dash-card px-5 py-4">
        <div className="font-exo text-xs tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>
          RESUMEN DEL PERIODO &middot; Desde 01-03-2026
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#00ff88" }} />
            <div>
              <span className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{resumen.nuncaExcedieron}</span>
              <span className="font-exo text-xs ml-2" style={{ color: "#3a6080" }}>camiones nunca excedieron {totals.limiteKmh} km/h</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ffcc00" }} />
            <div>
              <span className="font-space text-[16px] font-bold" style={{ color: "#ffcc00" }}>{resumen.ocasionales}</span>
              <span className="font-exo text-xs ml-2" style={{ color: "#3a6080" }}>con excesos ocasionales</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ff2244" }} />
            <div>
              <span className="font-space text-[16px] font-bold" style={{ color: "#ff2244" }}>{resumen.frecuentes}</span>
              <span className="font-exo text-xs ml-2" style={{ color: "#3a6080" }}>con excesos frecuentes</span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[11px] font-space tracking-[0.15em]" style={{ color: "#3a6080" }}>
        Datos en tiempo real via Volvo rFMS &middot; Limite: 105 km/h &middot; Auto-refresh cada 60s &middot; ALTO: &gt;105 km/h o &gt;10 eventos &middot; MEDIO: 90-105 km/h &middot; BAJO: &lt;90 km/h
      </div>
    </div>
  );
}
