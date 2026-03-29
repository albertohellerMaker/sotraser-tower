import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer } from "recharts";

const CONTRATOS = [
  { id: "ANGLO-COCU", color: "#00ff88", label: "COCU" },
  { id: "ANGLO-CAL", color: "#ff6b35", label: "CAL" },
  { id: "ANGLO-CARGAS VARIAS", color: "#00d4ff", label: "CARGAS" },
];

export default function Contratos() {
  const [contrato, setContrato] = useState("ANGLO-COCU");
  const [vista, setVista] = useState<"hoy" | "mes" | "ranking">("mes");
  const [detalle, setDetalle] = useState<string | null>(null);

  const cc = CONTRATOS.find(c => c.id === contrato)?.color || "#00ff88";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/contratos/productividad", contrato],
    queryFn: () => fetch(`/api/contratos/productividad/${contrato}`).then(r => r.json()),
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-4" data-testid="contratos-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {CONTRATOS.map(c => (
            <button key={c.id} onClick={() => setContrato(c.id)}
              className="px-4 py-2 font-space text-xs font-bold tracking-wider cursor-pointer transition-all"
              style={{ borderTop: `3px solid ${contrato === c.id ? c.color : "transparent"}`, border: `1px solid ${contrato === c.id ? `${c.color}40` : "#0d2035"}`, background: contrato === c.id ? `${c.color}10` : "transparent", color: contrato === c.id ? c.color : "#3a6080" }}>
              ANGLO {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {([["hoy", "HOY"], ["mes", "MES"], ["ranking", "RANKING"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setVista(id)}
              className="px-3 py-1.5 font-exo text-[11px] font-bold tracking-wider cursor-pointer"
              style={{ background: vista === id ? `${cc}15` : "transparent", border: `1px solid ${vista === id ? `${cc}40` : "#0d2035"}`, color: vista === id ? cc : "#3a6080" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: cc }} /></div>}

      {data && !isLoading && (<>
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "ACTIVOS HOY", value: data.kpis.camiones_activos_hoy, sub: `de ${data.kpis.total_camiones}`, color: data.kpis.camiones_activos_hoy > 0 ? cc : "#3a6080" },
            { label: "KM FLOTA MES", value: data.kpis.km_flota_mes?.toLocaleString("es-CL") || "0", sub: `dia ${data.periodo.dia_actual}/${data.periodo.dias_mes}`, color: "#c8e8ff" },
            { label: "RENDIMIENTO", value: data.kpis.rend_flota > 0 ? `${data.kpis.rend_flota} km/L` : "--", sub: "promedio mes", color: data.kpis.rend_flota >= 2.5 ? "#00ff88" : data.kpis.rend_flota > 0 ? "#ffcc00" : "#3a6080" },
            { label: "CAMIONES", value: data.kpis.total_camiones, sub: "con actividad", color: cc },
          ].map(k => (
            <div key={k.label} className="p-4" style={{ background: "#060d14", border: `1px solid ${k.color}20`, borderTop: `2px solid ${k.color}` }}>
              <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-2" style={{ color: "#3a6080" }}>{k.label}</div>
              <div className="font-space text-[24px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
              <div className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Vista HOY */}
        {vista === "hoy" && <TablaHoy camiones={data.hoy || []} color={cc} onDetalle={setDetalle} />}

        {/* Vista MES */}
        {vista === "mes" && (<>
          {data.historico?.length > 0 && (
            <div className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="font-exo text-xs tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>KM FLOTA · ULTIMOS 30 DIAS</div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={data.historico}>
                  <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "#3a6080" }} tickFormatter={(v: string) => new Date(v).getDate().toString()} />
                  <YAxis tick={{ fontSize: 11, fill: "#3a6080" }} width={40} />
                  <ReTooltip contentStyle={{ background: "#060d14", border: `1px solid ${cc}30`, fontSize: 12 }} />
                  <Line type="monotone" dataKey="km_flota" stroke={cc} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <TablaMes camiones={data.camiones || []} color={cc} onDetalle={setDetalle} />
        </>)}

        {/* Vista RANKING */}
        {vista === "ranking" && <TablaRanking camiones={data.camiones || []} color={cc} onDetalle={setDetalle} />}
      </>)}

      {detalle && <DetalleModal patente={detalle} contrato={contrato} color={cc} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function TablaHoy({ camiones, color, onDetalle }: { camiones: any[]; color: string; onDetalle: (p: string) => void }) {
  if (!camiones.length) return <div className="py-10 text-center font-exo text-xs" style={{ background: "#060d14", border: "1px solid #0d2035", color: "#3a6080" }}>Sin actividad hoy</div>;
  return (
    <div style={{ background: "#060d14", border: "1px solid #0d2035" }}>
      <div className="grid grid-cols-9 px-4 py-1.5" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
        {["CAM", "KM", "KM/L", "H.RUTA", "VIAJES", "VEL MAX", "EXCESOS", "CONDUCTOR", ""].map(h => (
          <span key={h} className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{h}</span>
        ))}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
        {camiones.sort((a: any, b: any) => (b.km_dia || 0) - (a.km_dia || 0)).map((c: any) => {
          const rc = c.rendimiento_dia >= 2.5 ? "#00ff88" : c.rendimiento_dia > 0 ? "#ffcc00" : "#3a6080";
          const conds = c.conductores_json ? (typeof c.conductores_json === "string" ? JSON.parse(c.conductores_json) : c.conductores_json) : [];
          return (
            <div key={c.patente} className="grid grid-cols-9 px-4 py-2 items-center hover:bg-[#0a1929] transition-all" style={{ borderBottom: "1px solid #0d203520", borderLeft: `3px solid ${c.estuvo_activo ? rc : "#1a3a55"}` }}>
              <div><span className="font-space text-[11px] font-bold" style={{ color }}>{c.patente}</span></div>
              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.km_dia > 0 ? Math.round(c.km_dia) : "--"}</span>
              <span className="font-space text-[11px] font-bold" style={{ color: rc }}>{c.rendimiento_dia > 0 ? c.rendimiento_dia.toFixed(2) : "--"}</span>
              <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>{c.horas_ruta > 0 ? `${c.horas_ruta.toFixed(1)}h` : "--"}</span>
              <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{c.viajes_completados || "--"}</span>
              <span className="font-space text-xs" style={{ color: (c.velocidad_max || 0) > 105 ? "#ff2244" : "#c8e8ff" }}>{c.velocidad_max > 0 ? Math.round(c.velocidad_max) : "--"}</span>
              <span className="font-space text-xs font-bold" style={{ color: (c.excesos_velocidad || 0) > 0 ? "#ff2244" : "#3a6080" }}>{c.excesos_velocidad > 0 ? c.excesos_velocidad : "0"}</span>
              <span className="font-exo text-[11px] truncate" style={{ color: "#c8e8ff" }}>{conds[0] || "--"}</span>
              <button onClick={() => onDetalle(c.patente)} className="font-exo text-xs px-3 py-1.5 rounded-sm font-bold cursor-pointer" style={{ color, border: `1px solid ${color}30` }}>VER</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TablaMes({ camiones, color, onDetalle }: { camiones: any[]; color: string; onDetalle: (p: string) => void }) {
  return (
    <div style={{ background: "#060d14", border: "1px solid #0d2035" }}>
      <div className="grid grid-cols-9 px-4 py-1.5" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
        {["CAM", "KM MES", "KM/L", "MEJOR DIA", "DIAS", "VIAJES", "EXCESOS", "RANK", ""].map(h => (
          <span key={h} className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{h}</span>
        ))}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
        {camiones.map((c: any) => {
          const rc = (c.rend_promedio || 0) >= 2.5 ? "#00ff88" : c.rend_promedio > 0 ? "#ffcc00" : "#3a6080";
          const rkc = (c.ranking_anglo || 999) <= 5 ? "#00ff88" : (c.ranking_anglo || 999) <= 15 ? "#ffcc00" : "#ff2244";
          return (
            <div key={c.patente} className="grid grid-cols-9 px-4 py-2 items-center hover:bg-[#0a1929] transition-all" style={{ borderBottom: "1px solid #0d203520", borderLeft: `3px solid ${rc}` }}>
              <div><span className="font-space text-[11px] font-bold" style={{ color }}>{c.patente}</span><br /><span className="font-exo text-xs" style={{ color: "#3a6080" }}>{c.pct_dias_activo}% activo</span></div>
              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{Math.round(c.km_mes || 0).toLocaleString()}</span>
              <span className="font-space text-[12px] font-bold" style={{ color: rc }}>{c.rend_promedio || "--"}</span>
              <span className="font-space text-xs" style={{ color: "#00ff88" }}>{c.rend_mejor_dia || "--"}</span>
              <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{c.dias_activos}</span>
              <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{c.viajes_mes || "--"}</span>
              <span className="font-space text-xs font-bold" style={{ color: (c.excesos_mes || 0) > 0 ? "#ff2244" : "#3a6080" }}>{(c.excesos_mes || 0) > 0 ? c.excesos_mes : "0"}</span>
              <div><span className="font-space text-[14px] font-bold" style={{ color: rkc }}>#{c.ranking_anglo || "?"}</span><br /><span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>de {c.ranking_total}</span></div>
              <button onClick={() => onDetalle(c.patente)} className="font-exo text-xs px-3 py-1.5 rounded-sm font-bold cursor-pointer" style={{ color, border: `1px solid ${color}30` }}>VER</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TablaRanking({ camiones, color, onDetalle }: { camiones: any[]; color: string; onDetalle: (p: string) => void }) {
  const sorted = [...camiones].sort((a: any, b: any) => (b.rend_promedio || 0) - (a.rend_promedio || 0));
  const prom = sorted.filter((c: any) => c.rend_promedio).length > 0
    ? sorted.filter((c: any) => c.rend_promedio).reduce((s: number, c: any) => s + c.rend_promedio, 0) / sorted.filter((c: any) => c.rend_promedio).length : 0;

  return (
    <div style={{ background: "#060d14", border: "1px solid #0d2035" }}>
      <div className="px-4 py-2 flex items-center gap-3" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
        <span className="font-exo text-xs tracking-wider uppercase" style={{ color }}>RANKING RENDIMIENTO</span>
        <span className="font-exo text-xs" style={{ color: "#3a6080" }}>Promedio flota: {prom.toFixed(2)} km/L</span>
      </div>
      {sorted.map((c: any, i: number) => {
        const rend = c.rend_promedio || 0;
        const vs = prom > 0 ? Math.round((rend - prom) / prom * 100) : 0;
        const mc = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : rend >= prom ? "#00ff88" : "#ff2244";
        return (
          <div key={c.patente} className="flex items-center gap-4 px-4 py-3 hover:bg-[#0a1929] transition-all" style={{ borderBottom: "1px solid #0d203520" }}>
            <span className="font-space text-[14px] font-bold w-8 text-center" style={{ color: mc }}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}</span>
            <div className="w-20 h-2" style={{ background: "#0d2035" }}><div className="h-full" style={{ width: `${Math.min(100, rend / (prom * 1.5) * 100)}%`, background: mc }} /></div>
            <div className="w-16"><span className="font-space text-[12px] font-bold" style={{ color }}>{c.patente}</span><br /><span className="font-exo text-xs" style={{ color: "#3a6080" }}>{c.dias_activos}d</span></div>
            <div className="w-24"><span className="font-space text-[18px] font-bold" style={{ color: mc }}>{rend > 0 ? rend.toFixed(2) : "--"}</span><br /><span className="font-exo text-xs" style={{ color: "#3a6080" }}>km/L</span></div>
            <div className="w-16"><span className="font-space text-[12px] font-bold" style={{ color: vs >= 0 ? "#00ff88" : "#ff2244" }}>{vs >= 0 ? "+" : ""}{vs}%</span><br /><span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>vs prom</span></div>
            <div className="flex-1"><span className="font-space text-xs" style={{ color: "#c8e8ff" }}>{Math.round(c.km_mes || 0).toLocaleString()} km</span> <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{c.viajes_mes || 0}v</span></div>
            <button onClick={() => onDetalle(c.patente)} className="font-exo text-xs px-3 py-1.5 rounded-sm font-bold cursor-pointer" style={{ color, border: `1px solid ${color}30` }}>VER</button>
          </div>
        );
      })}
    </div>
  );
}

function DetalleModal({ patente, contrato, color, onClose }: { patente: string; contrato: string; color: string; onClose: () => void }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/contratos/detalle-camion", patente, contrato],
    queryFn: () => fetch(`/api/contratos/detalle-camion/${patente}?contrato=${contrato}`).then(r => r.json()),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(2,5,8,0.92)" }} />
      <div className="relative w-full max-w-[600px] max-h-[80vh] overflow-y-auto m-4" style={{ background: "#020508", border: `1px solid ${color}30`, borderTop: `3px solid ${color}` }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="flex items-center gap-3">
            <span className="font-space text-[18px] font-bold" style={{ color }}>{patente}</span>
            <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{contrato}</span>
          </div>
          <button onClick={onClose} className="cursor-pointer hover:opacity-70"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
        </div>
        <div className="p-5">
          <div className="font-exo text-xs tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>ACTIVIDAD DIARIA · ULTIMOS 30 DIAS</div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {(data?.historico_diario || []).map((d: any) => {
              const rc = (d.rendimiento_dia || 0) >= 2.5 ? "#00ff88" : d.rendimiento_dia > 0 ? "#ffcc00" : "#3a6080";
              return (
                <div key={d.fecha} className="flex items-center justify-between px-3 py-2" style={{ background: d.estuvo_activo ? "#0a1520" : "#060d14", borderLeft: `2px solid ${d.estuvo_activo ? rc : "#1a3a55"}` }}>
                  <div className="flex items-center gap-3">
                    <span className="font-exo text-[11px] w-20" style={{ color: "#3a6080" }}>{new Date(d.fecha).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="font-exo text-xs" style={{ color: d.estuvo_activo ? "#00ff88" : "#1a3a55" }}>{d.estuvo_activo ? "ACTIVO" : "inactivo"}</span>
                  </div>
                  {d.estuvo_activo && (
                    <div className="flex items-center gap-3">
                      <span className="font-space text-xs" style={{ color: "#c8e8ff" }}>{Math.round(d.km_dia || 0)}km</span>
                      <span className="font-space text-xs font-bold" style={{ color: rc }}>{d.rendimiento_dia > 0 ? `${d.rendimiento_dia.toFixed(2)} km/L` : "--"}</span>
                      <span className="font-exo text-xs" style={{ color: "#3a6080" }}>{d.horas_ruta > 0 ? `${d.horas_ruta.toFixed(1)}h` : ""}</span>
                      {(d.excesos_velocidad || 0) > 0 && <span className="font-exo text-xs" style={{ color: "#ff2244" }}>{d.excesos_velocidad} exc</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
