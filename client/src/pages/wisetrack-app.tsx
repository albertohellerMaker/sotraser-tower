import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Truck, Settings, Search, Fuel, Gauge, Activity, ThermometerSun, BarChart3, AlertTriangle, TrendingDown, Clock, MapPin } from "lucide-react";
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
  ralenti: { color: "#ffcc00", label: "RALENTI", dotColor: "#ffcc00" },
  sin_senal: { color: "#ff2244", label: "SIN SENAL", dotColor: "#ff2244" },
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

function StatCard({ label, value, sub, color, icon: Icon }: { label: string; value: string | number; sub?: string; color: string; icon?: any }) {
  return (
    <div className="px-3 py-3 rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3 h-3" style={{ color: "#3a6080" }} />}
        <span className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>{label}</span>
      </div>
      <div className="font-space text-[20px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-exo text-[9px] mt-0.5" style={{ color: "#4a7090" }}>{sub}</div>}
    </div>
  );
}

function WTFlotaDashboard() {
  const [vista, setVista] = useState<"resumen" | "combustible" | "paradas" | "anomalias" | "mapa">("resumen");

  const { data: enVivo } = useQuery<WTResponse>({
    queryKey: ["/api/wisetrack/en-vivo"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/en-vivo"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    refetchInterval: 30000,
    retry: 2,
  });

  const { data: viajesStats } = useQuery<any>({
    queryKey: ["/api/viajes/stats"],
    queryFn: async () => { const r = await fetch("/api/viajes/stats"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 120000,
  });

  const { data: towerFuel } = useQuery<any>({
    queryKey: ["/api/tower/combustible"],
    queryFn: async () => { const r = await fetch("/api/tower/combustible"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 120000,
  });

  const { data: towerParadas } = useQuery<any>({
    queryKey: ["/api/tower/paradas"],
    queryFn: async () => { const r = await fetch("/api/tower/paradas"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 120000,
  });

  const vehiculos = enVivo?.vehiculos || [];
  const resumen = enVivo?.resumen || { total: 0, en_ruta: 0, detenido: 0, ralenti: 0, sin_senal: 0 };

  const lowFuel = vehiculos.filter(v => v.nivelEstanque > 0 && v.nivelEstanque < 20);
  const highTemp = vehiculos.filter(v => v.tempMotor > 95);
  const highRpm = vehiculos.filter(v => v.rpm > 1800 && v.velocidad > 0);

  const anomalias = viajesStats?.anomalias || [];
  const totalViajes = viajesStats?.totalViajes || 0;

  const fuelResumen = towerFuel?.resumen || {};
  const fuelCamiones = towerFuel?.camiones || [];
  const fuelWorst = towerFuel?.worst_5 || [];
  const fuelBest = towerFuel?.best_5 || [];
  const paradasData = towerParadas || {};

  const subTabs = [
    { id: "resumen", label: "RESUMEN", icon: BarChart3 },
    { id: "combustible", label: "COMBUSTIBLE", icon: Fuel },
    { id: "paradas", label: "PARADAS", icon: Clock },
    { id: "anomalias", label: "ANOMALIAS", icon: AlertTriangle },
    { id: "mapa", label: "MAPA EN VIVO", icon: MapPin },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 pb-2" style={{ borderBottom: "1px solid #0d2035" }}>
        {subTabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setVista(t.id as any)}
              className="flex items-center gap-1.5 px-3 py-2 font-exo text-[10px] font-bold tracking-[0.1em] cursor-pointer transition-all"
              style={{
                background: vista === t.id ? "#06b6d410" : "transparent",
                borderBottom: vista === t.id ? "2px solid #06b6d4" : "2px solid transparent",
                color: vista === t.id ? "#06b6d4" : "#3a6080",
              }}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.id === "anomalias" && anomalias.length > 0 && (
                <span className="ml-1 font-space text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#ff2244", color: "#020508" }}>{anomalias.length}</span>
              )}
              {t.id === "combustible" && lowFuel.length > 0 && (
                <span className="ml-1 font-space text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#ffcc00", color: "#020508" }}>{lowFuel.length}</span>
              )}
              {t.id === "paradas" && (paradasData.largas || 0) > 0 && (
                <span className="ml-1 font-space text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#ff6b35", color: "#020508" }}>{paradasData.largas}</span>
              )}
            </button>
          );
        })}
      </div>

      {vista === "resumen" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="FLOTA CENCOSUD" value={resumen.total} sub={`${resumen.en_ruta} en ruta · ${resumen.detenido} detenidos`} color="#06b6d4" icon={Truck} />
            <StatCard label="EN RUTA AHORA" value={resumen.en_ruta} sub={`${resumen.ralenti} en ralenti`} color="#00ff88" icon={Activity} />
            <StatCard label="VIAJES DETECTADOS" value={totalViajes} sub={viajesStats?.desde ? `Desde ${new Date(viajesStats.desde).toLocaleDateString("es-CL")}` : "Sin datos"} color="#06b6d4" icon={BarChart3} />
            <StatCard label="ANOMALIAS" value={anomalias.length} sub={`Rendimiento prom: ${fuelResumen.rendimiento_promedio || "?"} km/L`} color={anomalias.length > 0 ? "#ff2244" : "#00ff88"} icon={AlertTriangle} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>ESTADO FLOTA EN VIVO</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "En Ruta", count: resumen.en_ruta, pct: resumen.total > 0 ? Math.round(resumen.en_ruta / resumen.total * 100) : 0, color: "#00ff88" },
                  { label: "Detenido", count: resumen.detenido, pct: resumen.total > 0 ? Math.round(resumen.detenido / resumen.total * 100) : 0, color: "#ff6b35" },
                  { label: "Ralenti", count: resumen.ralenti, pct: resumen.total > 0 ? Math.round(resumen.ralenti / resumen.total * 100) : 0, color: "#ffcc00" },
                  { label: "Sin Senal", count: resumen.sin_senal, pct: resumen.total > 0 ? Math.round(resumen.sin_senal / resumen.total * 100) : 0, color: "#ff2244" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="font-exo text-[11px] w-24" style={{ color: "#c8e8ff" }}>{s.label}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#0a1520" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                    <span className="font-space text-[11px] font-bold w-8 text-right" style={{ color: s.color }}>{s.count}</span>
                    <span className="font-exo text-[9px] w-10 text-right" style={{ color: "#3a6080" }}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>ALERTAS OPERACIONALES</span>
              </div>
              <div className="p-4 space-y-2">
                {lowFuel.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "#ff224410", border: "1px solid #ff224420" }}>
                    <Fuel className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
                    <span className="font-exo text-[10px]" style={{ color: "#ff2244" }}>{lowFuel.length} camiones con estanque bajo (&lt;20%)</span>
                  </div>
                )}
                {lowFuel.map(v => (
                  <div key={v.patente} className="flex items-center justify-between px-3 py-1 ml-5">
                    <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{v.etiqueta} · {v.patente}</span>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#ff2244" }}>{v.nivelEstanque}%</span>
                  </div>
                ))}
                {highTemp.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "#ff6b3510", border: "1px solid #ff6b3520" }}>
                    <ThermometerSun className="w-3.5 h-3.5" style={{ color: "#ff6b35" }} />
                    <span className="font-exo text-[10px]" style={{ color: "#ff6b35" }}>{highTemp.length} camiones con temp motor alta (&gt;95C)</span>
                  </div>
                )}
                {highRpm.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "#ffcc0010", border: "1px solid #ffcc0020" }}>
                    <Activity className="w-3.5 h-3.5" style={{ color: "#ffcc00" }} />
                    <span className="font-exo text-[10px]" style={{ color: "#ffcc00" }}>{highRpm.length} en RPM elevado (&gt;1800)</span>
                  </div>
                )}
                {lowFuel.length === 0 && highTemp.length === 0 && highRpm.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <span className="font-exo text-[11px]" style={{ color: "#00ff88" }}>Sin alertas operacionales activas</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {anomalias.length > 0 && (
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>ULTIMAS ANOMALIAS DE VIAJES</span>
                <button onClick={() => setVista("anomalias")} className="font-exo text-[9px] cursor-pointer" style={{ color: "#06b6d4" }}>VER TODAS →</button>
              </div>
              <div className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #0d2035" }}>
                        {["CAMION", "RUTA", "KM", "L/100KM", "SCORE", "ESTADO"].map(h => (
                          <th key={h} className="py-2 px-2 text-left font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {anomalias.slice(0, 5).map((a: any) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}>
                          <td className="py-2 px-2 font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</td>
                          <td className="py-2 px-2 font-exo text-[9px]" style={{ color: "#4a7090" }}>{a.origen_nombre || "?"} → {a.destino_nombre || "?"}</td>
                          <td className="py-2 px-2 font-space text-[10px]" style={{ color: "#06b6d4" }}>{Math.round(a.km_ecu)}</td>
                          <td className="py-2 px-2 font-space text-[10px]" style={{ color: a.rendimiento_real < 2 ? "#ff2244" : "#ffcc00" }}>
                            {a.rendimiento_real ? (100 / parseFloat(a.rendimiento_real)).toFixed(1) : "-"}
                          </td>
                          <td className="py-2 px-2">
                            <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded" style={{
                              color: a.score_anomalia >= 50 ? "#ff2244" : "#ffcc00",
                              background: a.score_anomalia >= 50 ? "#ff224415" : "#ffcc0015",
                            }}>{a.score_anomalia}</span>
                          </td>
                          <td className="py-2 px-2 font-exo text-[8px]" style={{ color: a.estado === "ANOMALIA" ? "#ff2244" : "#ffcc00" }}>{a.estado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {vista === "combustible" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="RENDIMIENTO PROMEDIO" value={`${fuelResumen.rendimiento_promedio || 0} km/L`} sub={`${fuelResumen.total_camiones || 0} camiones · 7 dias`} color="#06b6d4" icon={Fuel} />
            <StatCard label="KM TOTAL FLOTA" value={(fuelResumen.km_total_flota || 0).toLocaleString()} sub={`${(fuelResumen.litros_total_flota || 0).toLocaleString()} litros`} color="#00ff88" icon={TrendingDown} />
            <StatCard label="ESTANQUE BAJO" value={lowFuel.length} sub="Menor a 20% en vivo" color={lowFuel.length > 0 ? "#ff6b35" : "#00ff88"} icon={Fuel} />
            <StatCard label="PEOR RENDIMIENTO" value={fuelWorst.length > 0 ? `${fuelWorst[0].rendimiento} km/L` : "N/D"} sub={fuelWorst.length > 0 ? fuelWorst[0].patente : ""} color="#ff2244" icon={AlertTriangle} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#ff2244" }}>PEOR RENDIMIENTO (5 CAMIONES)</span>
              </div>
              <div className="p-4 space-y-2">
                {fuelWorst.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: "#0a1520" }}>
                    <div>
                      <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{t.patente}</span>
                      <span className="font-exo text-[8px] ml-2" style={{ color: "#3a6080" }}>{t.km_total} km · {t.litros_total} L</span>
                    </div>
                    <span className="font-space text-[12px] font-bold" style={{ color: "#ff2244" }}>{t.rendimiento} km/L</span>
                  </div>
                ))}
                {fuelWorst.length === 0 && <div className="text-center py-4 font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin datos de rendimiento</div>}
              </div>
            </div>
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00ff88" }}>MEJOR RENDIMIENTO (5 CAMIONES)</span>
              </div>
              <div className="p-4 space-y-2">
                {fuelBest.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: "#0a1520" }}>
                    <div>
                      <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{t.patente}</span>
                      <span className="font-exo text-[8px] ml-2" style={{ color: "#3a6080" }}>{t.km_total} km · {t.litros_total} L</span>
                    </div>
                    <span className="font-space text-[12px] font-bold" style={{ color: "#00ff88" }}>{t.rendimiento} km/L</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>RENDIMIENTO POR CAMION · FUENTE WISETRACK (7 DIAS)</span>
              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>P25={fuelResumen.percentiles?.p25 || 0} · P50={fuelResumen.percentiles?.p50 || 0} · P75={fuelResumen.percentiles?.p75 || 0} · P90={fuelResumen.percentiles?.p90 || 0}</span>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #0d2035" }}>
                      {["CAMION", "KM", "LITROS", "REND km/L", "TANK MIN", "TANK MAX", "DIAS", "NIVEL"].map(h => (
                        <th key={h} className="py-2 px-3 text-left font-exo text-[9px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fuelCamiones.slice(0, 60).map((t: any, i: number) => {
                      const pcts = fuelResumen.percentiles || {};
                      const c = t.rendimiento >= (pcts.p90 || 99) ? "#00ff88" : t.rendimiento >= (pcts.p75 || 99) ? "#00d4ff" : t.rendimiento >= (pcts.p50 || 99) ? "#ffcc00" : "#ff2244";
                      const lbl = t.rendimiento >= (pcts.p90 || 99) ? "P90+" : t.rendimiento >= (pcts.p75 || 99) ? "P75+" : t.rendimiento >= (pcts.p50 || 99) ? "P50+" : "<P50";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}>
                          <td className="py-2 px-3 font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{t.patente}</td>
                          <td className="py-2 px-3 font-space text-[10px]" style={{ color: "#06b6d4" }}>{t.km_total}</td>
                          <td className="py-2 px-3 font-space text-[10px]" style={{ color: "#c8e8ff" }}>{t.litros_total}</td>
                          <td className="py-2 px-3 font-space text-[11px] font-bold" style={{ color: c }}>{t.rendimiento > 0 ? t.rendimiento.toFixed(2) : "N/D"}</td>
                          <td className="py-2 px-3 font-space text-[10px]" style={{ color: t.tank_min < 20 ? "#ff2244" : "#3a6080" }}>{t.tank_min}%</td>
                          <td className="py-2 px-3 font-space text-[10px]" style={{ color: "#3a6080" }}>{t.tank_max}%</td>
                          <td className="py-2 px-3 font-exo text-[10px]" style={{ color: "#3a6080" }}>{t.dias_datos}d</td>
                          <td className="py-2 px-3">
                            <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded" style={{ color: c, background: `${c}10` }}>{lbl}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {lowFuel.length > 0 && (
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>ESTANQUE BAJO EN VIVO</span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                {lowFuel.map(v => (
                  <div key={v.patente} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: "3px solid #ff2244" }}>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.etiqueta}</div>
                    <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.patente}</div>
                    <div className="font-space text-[14px] font-bold mt-1" style={{ color: "#ff2244" }}>{v.nivelEstanque}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {vista === "paradas" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="TOTAL PARADAS" value={paradasData.total_paradas || 0} sub="Ultimas 48h" color="#06b6d4" icon={Clock} />
            <StatCard label="SIGNIFICATIVAS" value={paradasData.significativas || 0} sub="Mas de 30 minutos" color="#ff6b35" icon={MapPin} />
            <StatCard label="PARADAS LARGAS" value={paradasData.largas || 0} sub="Mas de 2 horas" color="#ff2244" icon={AlertTriangle} />
            <StatCard label="CAMIONES CON PARADAS" value={(paradasData.por_camion || []).length} sub="Con al menos 1 parada" color="#ffcc00" icon={Truck} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>TIEMPO DETENIDO POR CAMION (48H)</span>
              </div>
              <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
                {(paradasData.por_camion || []).map((c: any, i: number) => {
                  const hrs = Math.floor(c.tiempo_total / 60);
                  const mins = c.tiempo_total % 60;
                  return (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: "#0a1520" }}>
                      <div>
                        <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.etiqueta || c.patente}</span>
                        <span className="font-exo text-[8px] ml-2" style={{ color: "#3a6080" }}>{c.paradas} paradas</span>
                      </div>
                      <span className="font-space text-[11px] font-bold" style={{ color: c.tiempo_total > 120 ? "#ff2244" : c.tiempo_total > 60 ? "#ff6b35" : "#ffcc00" }}>
                        {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
                      </span>
                    </div>
                  );
                })}
                {(paradasData.por_camion || []).length === 0 && (
                  <div className="text-center py-4 font-exo text-[11px]" style={{ color: "#00ff88" }}>Sin paradas significativas</div>
                )}
              </div>
            </div>

            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>ULTIMAS PARADAS</span>
              </div>
              <div className="p-4">
                <div className="overflow-y-auto max-h-[400px] space-y-2">
                  {(paradasData.ultimas_paradas || []).slice(0, 20).map((p: any, i: number) => {
                    const hrs = Math.floor(p.duracion_min / 60);
                    const mins = p.duracion_min % 60;
                    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                    return (
                      <div key={i} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${p.duracion_min > 120 ? "#ff2244" : p.duracion_min > 60 ? "#ff6b35" : "#ffcc00"}` }}>
                        <div className="flex items-center justify-between">
                          <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{p.etiqueta || p.patente}</span>
                          <span className="font-space text-[10px] font-bold" style={{ color: p.duracion_min > 120 ? "#ff2244" : "#ff6b35" }}>{timeStr}</span>
                        </div>
                        <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>
                          {new Date(p.inicio).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — {new Date(p.fin).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {vista === "anomalias" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="VIAJES TOTALES" value={totalViajes} color="#06b6d4" icon={BarChart3} />
            <StatCard label="CON ANOMALIA" value={anomalias.filter((a: any) => a.estado === "ANOMALIA").length} color="#ff2244" icon={AlertTriangle} />
            <StatCard label="PARA REVISAR" value={anomalias.filter((a: any) => a.estado === "REVISAR").length} color="#ffcc00" icon={Clock} />
          </div>

          <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>VIAJES CON ANOMALIA (score ≥ 20)</span>
            </div>
            <div className="p-4">
              {anomalias.length === 0 ? (
                <div className="py-8 text-center">
                  <span className="font-exo text-[12px]" style={{ color: "#00ff88" }}>Sin anomalias detectadas. El sistema analiza viajes automaticamente.</span>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #0d2035" }}>
                        {["CAMION", "CONDUCTOR", "RUTA", "FECHA", "KM", "LITROS", "km/L", "SCORE", "ESTADO"].map(h => (
                          <th key={h} className="py-2 px-2 text-left font-exo text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {anomalias.map((a: any) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }} className="hover:bg-[rgba(0,212,255,0.02)]">
                          <td className="py-2 px-2 font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</td>
                          <td className="py-2 px-2 font-exo text-[9px]" style={{ color: "#4a7090" }}>{a.conductor || "-"}</td>
                          <td className="py-2 px-2 font-exo text-[9px]" style={{ color: "#4a7090" }}>
                            {a.origen_nombre || "?"} → {a.destino_nombre || "?"}
                          </td>
                          <td className="py-2 px-2 font-space text-[9px]" style={{ color: "#4a7090" }}>
                            {a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleDateString("es-CL") : "-"}
                          </td>
                          <td className="py-2 px-2 font-space text-[10px]" style={{ color: "#06b6d4" }}>{Math.round(a.km_ecu || 0)}</td>
                          <td className="py-2 px-2 font-space text-[10px]" style={{ color: "#c8e8ff" }}>{parseFloat(a.litros_consumidos_ecu || 0).toFixed(1)}</td>
                          <td className="py-2 px-2 font-space text-[10px] font-bold" style={{ color: a.rendimiento_real < 2 ? "#ff2244" : "#ffcc00" }}>
                            {a.rendimiento_real ? parseFloat(a.rendimiento_real).toFixed(2) : "-"}
                          </td>
                          <td className="py-2 px-2">
                            <span className="font-space text-[10px] font-bold px-2 py-0.5 rounded" style={{
                              color: a.score_anomalia >= 50 ? "#ff2244" : "#ffcc00",
                              background: a.score_anomalia >= 50 ? "#ff224415" : "#ffcc0015",
                            }}>{a.score_anomalia}</span>
                          </td>
                          <td className="py-2 px-2 font-exo text-[8px] font-bold" style={{ color: a.estado === "ANOMALIA" ? "#ff2244" : "#ffcc00" }}>{a.estado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {vista === "mapa" && <WTFlotaMap />}
    </div>
  );
}

function WTFlotaMap() {
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
    <div className="flex gap-4 h-[calc(100vh-150px)]">
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
              <AdvancedMarker key={v.patente} position={{ lat: v.lat, lng: v.lng }} onClick={() => selectVehicle(v)}>
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

      <div className="w-[340px] flex flex-col" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        {data?.resumen && (
          <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
            {[
              { key: null, label: "TODOS", count: data.resumen.total, color: "#06b6d4" },
              { key: "en_ruta", label: "RUTA", count: data.resumen.en_ruta, color: "#00ff88" },
              { key: "detenido", label: "DET", count: data.resumen.detenido, color: "#ff6b35" },
              { key: "sin_senal", label: "S/S", count: data.resumen.sin_senal, color: "#ff2244" },
            ].map((b) => (
              <button key={b.key || "all"} onClick={() => setFiltroEstado(b.key)} className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
                style={{ background: filtroEstado === b.key ? `${b.color}15` : "transparent", border: `1px solid ${filtroEstado === b.key ? b.color + "40" : "transparent"}` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                <span className="font-space text-[10px] font-bold" style={{ color: b.color }}>{b.count}</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{b.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "#3a6080" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar patente..."
              className="w-full pl-8 pr-3 py-1.5 rounded font-exo text-[10px]" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff", outline: "none" }} />
          </div>
        </div>

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

        {selected && (
          <div className="border-t overflow-auto" style={{ borderColor: "#0d2035", maxHeight: "40%" }}>
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{selected.etiqueta}</span>
                  <span className="font-exo text-[10px] ml-2" style={{ color: "#3a6080" }}>{selected.patente}</span>
                </div>
                <button onClick={() => setSelectedPatente(null)} className="font-space text-[12px] cursor-pointer" style={{ color: "#3a6080" }}>x</button>
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
                <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>ULTIMO VIAJE</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Inicio</div><div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{selected.ultimoViaje.inicio}</div></div>
                  <div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Fin</div><div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{selected.ultimoViaje.fin}</div></div>
                  <div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Distancia</div><div className="font-space text-[10px] font-bold" style={{ color: "#06b6d4" }}>{selected.ultimoViaje.kms} km</div></div>
                </div>
              </div>
            )}

            {historial?.puntos && historial.puntos.length > 0 && (
              <div className="p-3 rounded" style={{ background: "#0a1520" }}>
                <div className="font-exo text-[8px] tracking-wider mb-2" style={{ color: "#3a6080" }}>HISTORIAL GPS (ultimas 24h) · {historial.total} registros</div>
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
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>ESTADO WISETRACK API</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 6 }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: status?.sessionActive ? "#00ff88" : "#ff2244", boxShadow: `0 0 6px ${status?.sessionActive ? "#00ff88" : "#ff2244"}` }} />
              <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>WiseTrack API</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sesion: {status?.sessionActive ? "ACTIVA" : "INACTIVA"}</span>
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{status?.lastSyncCount || 0} vehiculos</span>
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
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VEHICULOS CENCOSUD</div>
            </div>
            <div className="text-center p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
              <div className="font-space text-[20px] font-bold" style={{ color: "#c8e8ff" }}>{status?.totalRegistros || 0}</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>POSICIONES GUARDADAS</div>
            </div>
            <div className="text-center p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
              <div className="font-space text-[20px] font-bold" style={{ color: "#00ff88" }}>60s</div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>FRECUENCIA SYNC</div>
            </div>
          </div>
        </div>
      </div>

      {grupos && (
        <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>FLOTA COMPLETA SOTRASER ({grupos.totalVehiculos} vehiculos)</span>
          </div>
          <div className="p-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
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
  { id: "tms", label: "CENCOSUD", icon: BarChart3, color: "#00ff88" },
  { id: "flota", label: "FLOTA", icon: MapIcon, color: "#3a6080" },
  { id: "camiones", label: "CAMIONES", icon: Truck, color: "#3a6080" },
  { id: "sistema", label: "SISTEMA", icon: Settings, color: "#3a6080" },
];

export default function WiseTrackApp({ onBack }: { onBack?: () => void } = {}) {
  const [tab, setTab] = useState<WTTab>("tms");

  const { data: wtData } = useQuery<WTResponse>({
    queryKey: ["/api/wisetrack/en-vivo"],
    queryFn: async () => { const r = await fetch("/api/wisetrack/en-vivo"); if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); },
    staleTime: 30000,
  });

  if (tab === "tms") {
    return <CencosudView onBack={() => setTab("tms")} gpsSource="wisetrack" onNavigate={(t: string) => setTab(t as WTTab)} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "#020508", color: "#c8e8ff" }}>
      <div className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(2,5,8,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center justify-between px-4 h-[36px]">
          <div className="flex items-center gap-3">
            <button onClick={() => onBack ? onBack() : setTab("tms")} className="font-space text-[14px] font-bold tracking-[0.2em] cursor-pointer hover:opacity-80" style={{ color: "#06b6d4", background: "none", border: "none" }}>SOTRASER</button>
            <span className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>TOWER</span>
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
          {tab === "flota" && <WTFlotaDashboard />}
          {tab === "camiones" && <WTCamiones />}
          {tab === "sistema" && <WTSistema />}
        </div>
      </div>
    </div>
  );
}
