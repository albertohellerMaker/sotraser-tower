import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, Trophy, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle, MapPin, X, Truck, Clock, Fuel, Route, Shield, Activity, Calendar, Map } from "lucide-react";

const ViajeMapaModal = lazy(() => import("../components/viaje-mapa-modal"));

type Vista = "RESUMEN" | "DIA" | "MES" | "CONTRATO" | "RANKING" | "ALERTAS";

const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
const CC = (c: string) => { if (!c) return "#3a6080"; const u = c.toUpperCase(); if (u.includes("ANGLO") && u.includes("COCU")) return "#00ff88"; if (u.includes("ANGLO")) return "#22c55e"; if (u.includes("CENCOSUD")) return "#00d4ff"; if (u.includes("MININCO")) return "#84cc16"; if (u.includes("SAN JORGE")) return "#fbbf24"; if (u.includes("GLENCORE")) return "#ff6b35"; if (u.includes("INDURA")) return "#a78bfa"; if (u.includes("BLUEX")) return "#f472b6"; if (u.includes("ESTANQUE")) return "#06b6d4"; const h = c.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0); return ["#a855f7","#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6"][h % 6]; };
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");

function Badge({ doble, wt }: { doble?: boolean; wt?: boolean }) {
  if (doble) return <span className="text-[7px] font-bold px-1.5 py-0.5" style={{ color: "#00ffcc", background: "#00ffcc12", border: "1px solid #00ffcc30", borderRadius: 3 }}>DOBLE CHECK</span>;
  if (wt) return <span className="text-[7px] font-bold px-1.5 py-0.5" style={{ color: "#10b981", background: "#10b98112", border: "1px solid #10b98130", borderRadius: 3 }}>WT</span>;
  return <span className="text-[7px] font-bold px-1.5 py-0.5" style={{ color: "#00d4ff", background: "#00d4ff12", border: "1px solid #00d4ff30", borderRadius: 3 }}>ECU</span>;
}

export default function ViajesTMS() {
  const [vista, setVista] = useState<Vista>("RESUMEN");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [contrato, setContrato] = useState("TODOS");
  const [periodoRanking, setPeriodoRanking] = useState("MES");
  const [periodoResumen, setPeriodoResumen] = useState<"DIA"|"3DIAS"|"SEMANA">("DIA");
  const [selCamion, setSelCamion] = useState<string | null>(null);
  const [ordenCol, setOrdenCol] = useState("km_total");
  const [ordenDir, setOrdenDir] = useState<"asc"|"desc">("desc");
  const [mapaViajeId, setMapaViajeId] = useState<number | null>(null);

  const { data: dataResumen } = useQuery<any>({ queryKey: ["/api/viajes-tms/resumen-ejecutivo", periodoResumen, contrato], queryFn: () => fetch(`/api/viajes-tms/resumen-ejecutivo?periodo=${periodoResumen}&contrato=${contrato}`).then(r => r.json()), enabled: vista === "RESUMEN", refetchInterval: 120000 });
  const { data: dataDia } = useQuery<any>({ queryKey: ["/api/viajes-tms/resumen-dia", fecha, contrato], queryFn: () => fetch(`/api/viajes-tms/resumen-dia?fecha=${fecha}&contrato=${contrato}`).then(r => r.json()), enabled: vista === "DIA", refetchInterval: 120000 });
  const { data: dataMes } = useQuery<any>({ queryKey: ["/api/viajes-tms/acumulado-mes", contrato], queryFn: () => fetch(`/api/viajes-tms/acumulado-mes?contrato=${contrato}`).then(r => r.json()), enabled: vista === "MES", staleTime: 300000 });
  const { data: dataContrato } = useQuery<any>({ queryKey: ["/api/viajes-tms/por-contrato", contrato], queryFn: () => fetch(`/api/viajes-tms/por-contrato?contrato=${contrato}`).then(r => r.json()), enabled: vista === "CONTRATO" && contrato === "TODOS" });
  const { data: contratoDetalle } = useQuery<any>({ queryKey: ["/api/viajes-tms/contrato-detalle", contrato], queryFn: () => fetch(`/api/viajes-tms/contrato-detalle/${encodeURIComponent(contrato)}`).then(r => r.json()), enabled: vista === "CONTRATO" && contrato !== "TODOS", staleTime: 300000 });
  const { data: dataRanking } = useQuery<any>({ queryKey: ["/api/viajes-tms/ranking", periodoRanking, contrato], queryFn: () => fetch(`/api/viajes-tms/ranking?periodo=${periodoRanking}&contrato=${contrato}`).then(r => r.json()), enabled: vista === "RANKING" });
  const { data: dataAlertas } = useQuery<any>({ queryKey: ["/api/viajes-tms/alertas", fecha, contrato], queryFn: () => fetch(`/api/viajes-tms/alertas?fecha=${fecha}&contrato=${contrato}`).then(r => r.json()), enabled: vista === "ALERTAS", refetchInterval: 300000 });
  const { data: alertasDetalle } = useQuery<any>({ queryKey: ["/api/viajes-tms/alertas-detalle", fecha, contrato], queryFn: () => fetch(`/api/viajes-tms/alertas-detalle?fecha=${fecha}&contrato=${contrato}`).then(r => r.json()), enabled: vista === "ALERTAS", refetchInterval: 300000 });
  const { data: detalleViajes } = useQuery<any>({ queryKey: ["/api/viajes-tms/camion-dia", selCamion, fecha], queryFn: () => fetch(`/api/viajes-tms/camion-dia/${selCamion}?fecha=${fecha}`).then(r => r.json()), enabled: !!selCamion && vista === "DIA" });

  const datos = vista === "DIA" ? dataDia : vista === "MES" ? dataMes : null;
  const kpis = datos?.kpis || {};
  const contratos: string[] = datos?.contratos || [];

  const sortedCam = useMemo(() => {
    const f = datos?.camiones || [];
    return [...f].sort((a: any, b: any) => {
      const va = parseFloat(a[ordenCol] || a.km_mes || 0);
      const vb = parseFloat(b[ordenCol] || b.km_mes || 0);
      return ordenDir === "desc" ? vb - va : va - vb;
    });
  }, [datos, ordenCol, ordenDir]);

  const cambiarFecha = (d: number) => { const dt = new Date(fecha); dt.setDate(dt.getDate() + d); setFecha(dt.toISOString().slice(0, 10)); };
  const toggleSort = (col: string) => { if (ordenCol === col) setOrdenDir(d => d === "desc" ? "asc" : "desc"); else { setOrdenCol(col); setOrdenDir("desc"); } };

  return (
    <div style={{ background: "#020508" }}>

      {/* ═══ TOP BAR: KPIs grandes ═══ */}
      <div className="grid grid-cols-6 gap-0 border-b" style={{ borderColor: "#0d2035" }}>
        {[
          { label: "VIAJES", value: kpis.total_viajes, icon: Route, color: "#00d4ff" },
          { label: "CAMIONES", value: kpis.total_camiones, icon: Truck, color: "#c8e8ff" },
          { label: "KM TOTAL", value: kpis.km_total ? fN(kpis.km_total) : "-", icon: Activity, color: "#a855f7" },
          { label: "KM/L PROM", value: kpis.rend_promedio || "-", icon: Fuel, color: RC(kpis.rend_promedio) },
          { label: "ALERTAS", value: dataAlertas?.total_alertas || 0, icon: AlertTriangle, color: (dataAlertas?.total_alertas || 0) > 0 ? "#ff2244" : "#3a6080" },
          { label: vista === "MES" ? "DÍAS MES" : "FECHA", value: vista === "MES" ? dataMes?.dias_mes : new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" }), icon: Calendar, color: "#3a6080" },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="px-4 py-3 flex items-center gap-3" style={{ background: "#060d14", borderRight: "1px solid #0d2035" }}>
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: `${k.color}60` }} />
              <div>
                <div className="font-space text-[18px] font-bold leading-none" style={{ color: k.color }}>{k.value ?? "-"}</div>
                <div className="font-exo text-[7px] tracking-wider uppercase mt-0.5" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ NAVIGATION BAR ═══ */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b" style={{ borderColor: "#0d2035", background: "#0a1218" }}>
        {/* Vistas */}
        <div className="flex gap-0">
          {(["RESUMEN", "DIA", "MES", "CONTRATO", "RANKING", "ALERTAS"] as Vista[]).map(v => (
            <button key={v} onClick={() => { setVista(v); setSelCamion(null); }}
              className="px-4 py-2 font-space text-[9px] font-bold tracking-[0.15em] cursor-pointer transition-all"
              style={{ color: vista === v ? (v === "RESUMEN" ? "#a855f7" : "#00d4ff") : "#3a6080", borderBottom: vista === v ? `2px solid ${v === "RESUMEN" ? "#a855f7" : "#00d4ff"}` : "2px solid transparent", background: vista === v ? (v === "RESUMEN" ? "#a855f708" : "#00d4ff08") : "transparent" }}>
              {v === "RESUMEN" ? "RESUMEN" : v}
            </button>
          ))}
        </div>

        {/* Periodo resumen */}
        {vista === "RESUMEN" && (
          <div className="flex gap-1">
            {([["DIA", "DIARIO"], ["3DIAS", "3 DIAS"], ["SEMANA", "SEMANAL"]] as const).map(([p, label]) => (
              <button key={p} onClick={() => setPeriodoResumen(p as any)} className="px-3 py-1.5 font-space text-[8px] font-bold cursor-pointer"
                style={{ color: periodoResumen === p ? "#a855f7" : "#3a6080", background: periodoResumen === p ? "#a855f710" : "transparent", border: `1px solid ${periodoResumen === p ? "#a855f730" : "#0d2035"}`, borderRadius: 4 }}>{label}</button>
            ))}
          </div>
        )}

        {/* Fecha (DIA/ALERTAS) */}
        {(vista === "DIA" || vista === "ALERTAS") && (
          <div className="flex items-center gap-2">
            <button onClick={() => cambiarFecha(-1)} className="p-1 cursor-pointer" style={{ color: "#3a6080" }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-exo text-[11px] font-bold w-32 text-center" style={{ color: "#c8e8ff" }}>
              {new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button onClick={() => cambiarFecha(1)} disabled={fecha >= new Date().toISOString().slice(0, 10)} className="p-1 cursor-pointer disabled:opacity-30" style={{ color: "#3a6080" }}><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}

        {/* Periodo ranking */}
        {vista === "RANKING" && (
          <div className="flex gap-1">
            {["HOY", "SEMANA", "MES"].map(p => (
              <button key={p} onClick={() => setPeriodoRanking(p)} className="px-3 py-1.5 font-space text-[8px] font-bold cursor-pointer"
                style={{ color: periodoRanking === p ? "#00d4ff" : "#3a6080", background: periodoRanking === p ? "#00d4ff10" : "transparent", border: `1px solid ${periodoRanking === p ? "#00d4ff30" : "#0d2035"}`, borderRadius: 4 }}>{p}</button>
            ))}
          </div>
        )}

        {/* Filtro contratos */}
        <div className="flex gap-1 flex-wrap max-w-[600px]">
          {["TODOS", ...contratos].slice(0, 12).map((c: string) => (
            <button key={c} onClick={() => setContrato(c)} className="px-2 py-1 font-exo text-[8px] font-bold cursor-pointer transition-all"
              style={{ color: contrato === c ? CC(c) : "#3a6080", background: contrato === c ? `${CC(c)}12` : "transparent", border: `1px solid ${contrato === c ? `${CC(c)}35` : "#0d203500"}`, borderRadius: 4 }}>
              {c === "TODOS" ? "TODOS" : c.replace("ANGLO-", "").substring(0, 14)}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex" style={{ height: "calc(100vh - 190px)" }}>

        {/* ── LEFT: TRIP LIST ── */}
        <div className={`overflow-auto ${selCamion && vista === "DIA" ? "w-[60%]" : "w-full"} border-r`} style={{ borderColor: "#0d2035" }}>

          {/* ═══ VISTA RESUMEN EJECUTIVO ═══ */}
          {vista === "RESUMEN" && dataResumen && (() => {
            const act = dataResumen.actual || {};
            const cmp = dataResumen.comparacion || {};
            const periodoLabel = periodoResumen === "DIA" ? "Hoy" : periodoResumen === "3DIAS" ? "Últimos 3 días" : "Esta semana";
            const DeltaBadge = ({ val, suffix = "%", invert = false }: { val: number; suffix?: string; invert?: boolean }) => {
              const color = val === 0 ? "#3a6080" : (invert ? val < 0 : val > 0) ? "#00ff88" : "#ff2244";
              return <span className="font-space text-[10px] font-bold" style={{ color }}>{val > 0 ? "+" : ""}{val}{suffix}</span>;
            };
            return (
              <div className="p-5 space-y-5 overflow-auto" style={{ height: "calc(100vh - 190px)" }}>
                {/* KPIs con comparación */}
                <div className="grid grid-cols-6 gap-3">
                  {[
                    { l: "CAMIONES", v: act.camiones || 0, d: null, c: "#00d4ff", icon: Truck },
                    { l: "VIAJES", v: act.viajes || 0, d: cmp.delta_viajes, c: "#a855f7", icon: Route },
                    { l: "KM TOTAL", v: fN(parseFloat(act.km) || 0), d: cmp.delta_km, c: "#00ff88", icon: Activity },
                    { l: "KM/L PROM", v: act.rend || "--", d: null, extra: cmp.delta_rend, c: RC(parseFloat(act.rend) || 0), icon: Fuel },
                    { l: "CRITICOS", v: act.criticos || 0, d: null, extra: cmp.delta_criticos, c: (act.criticos || 0) > 0 ? "#ff2244" : "#00ff88", icon: AlertTriangle },
                    { l: "EXCESOS VEL", v: act.excesos_vel || 0, d: null, c: (act.excesos_vel || 0) > 0 ? "#ff6b35" : "#3a6080", icon: Shield },
                  ].map(k => {
                    const Icon = k.icon;
                    return (
                      <div key={k.l} className="rounded-lg p-4" style={{ background: "#060d14", borderTop: `2px solid ${k.c}`, border: "1px solid #0d2035" }}>
                        <div className="flex items-center justify-between mb-2">
                          <Icon className="w-4 h-4" style={{ color: `${k.c}50` }} />
                          {k.d !== null && k.d !== undefined && <DeltaBadge val={k.d} />}
                          {k.extra !== null && k.extra !== undefined && (
                            <DeltaBadge val={k.extra} suffix={k.l === "KM/L PROM" ? " km/L" : ""} invert={k.l === "CRITICOS"} />
                          )}
                        </div>
                        <div className="font-space text-[24px] font-bold leading-none" style={{ color: k.c }}>{k.v}</div>
                        <div className="font-exo text-[7px] tracking-[0.12em] uppercase mt-1" style={{ color: "#3a6080" }}>{k.l}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Tabla contratos */}
                  <div className="col-span-2 rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
                      <span className="font-exo text-[8px] tracking-[0.15em] uppercase font-bold" style={{ color: "#a855f7" }}>POR CONTRATO · {periodoLabel.toUpperCase()}</span>
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{(dataResumen.por_contrato || []).length} contratos</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: "#0a1520" }}>
                          {["CONTRATO", "CAM", "VIAJES", "KM", "KM/L", "CRIT"].map(h => (
                            <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(dataResumen.por_contrato || []).map((c: any, i: number) => (
                          <tr key={c.contrato} className="cursor-pointer hover:bg-[rgba(255,255,255,0.02)]" onClick={() => { setContrato(c.contrato); setVista("CONTRATO"); }}
                            style={{ background: i % 2 === 0 ? "transparent" : "#0a152030", borderBottom: "1px solid #0d203530" }}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-4 rounded-full" style={{ background: CC(c.contrato) }} />
                                <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.contrato}</span>
                              </div>
                            </td>
                            <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.camiones}</td>
                            <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.viajes}</td>
                            <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km) || 0)}</td>
                            <td className="font-space text-[10px] font-bold px-3 py-2" style={{ color: RC(parseFloat(c.rend) || 0) }}>{c.rend || "--"}</td>
                            <td className="font-space text-[10px] px-3 py-2" style={{ color: (c.criticos || 0) > 0 ? "#ff2244" : "#3a6080" }}>{c.criticos || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Panel derecho: Top/Bottom + Alertas */}
                  <div className="space-y-3">
                    {/* Top 5 */}
                    <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                      <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                        <span className="font-exo text-[8px] tracking-[0.12em] uppercase font-bold" style={{ color: "#00ff88" }}>TOP 5 RENDIMIENTO</span>
                      </div>
                      <div className="p-2 space-y-1">
                        {(dataResumen.top_camiones || []).map((c: any, i: number) => (
                          <div key={c.patente} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1520" }}>
                            <div className="flex items-center gap-2">
                              <span className="font-space text-[8px] w-3" style={{ color: "#3a6080" }}>{i + 1}</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                            </div>
                            <span className="font-space text-[10px] font-bold" style={{ color: "#00ff88" }}>{c.rend}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom 5 */}
                    <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #ff224420" }}>
                      <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                        <span className="font-exo text-[8px] tracking-[0.12em] uppercase font-bold" style={{ color: "#ff2244" }}>REQUIEREN ATENCION</span>
                      </div>
                      <div className="p-2 space-y-1">
                        {(dataResumen.bottom_camiones || []).map((c: any) => (
                          <div key={c.patente} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1520", borderLeft: "2px solid #ff2244" }}>
                            <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                            <span className="font-space text-[10px] font-bold" style={{ color: "#ff2244" }}>{c.rend}</span>
                          </div>
                        ))}
                        {(dataResumen.bottom_camiones || []).length === 0 && (
                          <div className="text-center py-2 font-exo text-[9px]" style={{ color: "#00ff88" }}>Sin camiones criticos</div>
                        )}
                      </div>
                    </div>

                    {/* Alertas resumen */}
                    {(dataResumen.alertas || []).length > 0 && (
                      <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                        <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                          <span className="font-exo text-[8px] tracking-[0.12em] uppercase font-bold" style={{ color: "#ffcc00" }}>ALERTAS</span>
                        </div>
                        <div className="p-2 space-y-1">
                          {(dataResumen.alertas || []).map((a: any) => (
                            <div key={a.tipo} className="flex items-center justify-between px-2 py-1">
                              <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{a.tipo.replace(/_/g, " ")}</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: "#ffcc00" }}>{a.total}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tendencia diaria */}
                {(dataResumen.tendencia || []).length > 1 && (
                  <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                    <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>TENDENCIA DIARIA</div>
                    <div className="flex items-end gap-1" style={{ height: 80 }}>
                      {(dataResumen.tendencia || []).map((d: any) => {
                        const maxKm = Math.max(...(dataResumen.tendencia || []).map((t: any) => parseFloat(t.km) || 0));
                        const h = maxKm > 0 ? (parseFloat(d.km) / maxKm) * 70 : 5;
                        return (
                          <div key={d.dia} className="flex-1 flex flex-col items-center gap-1">
                            <span className="font-space text-[7px] font-bold" style={{ color: RC(parseFloat(d.rend) || 0) }}>{d.rend}</span>
                            <div className="w-full rounded-t" style={{ height: Math.max(4, h), background: `linear-gradient(to top, ${RC(parseFloat(d.rend) || 0)}40, ${RC(parseFloat(d.rend) || 0)})` }} />
                            <div className="text-center">
                              <div className="font-space text-[8px] font-bold" style={{ color: "#c8e8ff" }}>{fN(parseFloat(d.km) || 0)}</div>
                              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{d.dia.slice(5)}</div>
                              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{d.viajes}v · {d.camiones}c</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* VISTA DIA / MES — Tabla compacta TMS */}
          {(vista === "DIA" || vista === "MES") && (
            <div className="flex-1 overflow-auto">
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <tr style={{ background: "#0a1520", borderBottom: "2px solid #0d2035" }}>
                    {[
                      { id: "patente", l: "CAMIÓN", w: 100 },
                      { id: "validacion", l: "TIPO", w: 65 },
                      { id: "contrato", l: "CONTRATO", w: 130 },
                      { id: "km_total", l: vista === "MES" ? "KM MES" : "KM", w: 90 },
                      { id: "rendimiento", l: "KM/L", w: 75 },
                      { id: "viajes", l: "VIAJES", w: 60 },
                      { id: "horas_ruta", l: vista === "MES" ? "DÍAS" : "HORAS", w: 60 },
                      { id: "conductor", l: "CONDUCTOR", w: 140 },
                      { id: "estado", l: vista === "MES" ? "TEND." : "ESTADO", w: 60 },
                    ].map(h => (
                      <th key={h.id} onClick={() => toggleSort(h.id)} style={{ width: h.w, padding: "8px 12px", textAlign: h.id === "km_total" || h.id === "rendimiento" ? "right" : h.id === "viajes" || h.id === "horas_ruta" || h.id === "estado" ? "center" : "left", cursor: "pointer", userSelect: "none" }}>
                        <span className="font-exo text-[7px] tracking-wider uppercase" style={{ color: ordenCol === h.id ? "#00d4ff" : "#3a6080" }}>
                          {h.l} {ordenCol === h.id && (ordenDir === "desc" ? "↓" : "↑")}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCam.map((cam: any, i: number) => {
                    const rend = parseFloat(cam.rendimiento || cam.rend_promedio || 0);
                    const sel = selCamion === cam.patente;
                    return (
                      <tr key={cam.patente} onClick={() => setSelCamion(sel ? null : cam.patente)}
                        className="transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                        style={{ height: 38, background: sel ? "rgba(0,212,255,0.06)" : i % 2 === 0 ? "#060d14" : "#070e16", borderBottom: "1px solid #0a1825", borderLeft: sel ? "3px solid #00d4ff" : "3px solid transparent", cursor: "pointer" }}>
                        <td style={{ padding: "0 12px" }}><span className="font-space text-[12px] font-bold" style={{ color: sel ? "#00d4ff" : "#c8e8ff" }}>{cam.patente}</span></td>
                        <td style={{ padding: "0 8px" }}><Badge doble={cam.doble_validado} wt={cam.tiene_wt} /></td>
                        <td style={{ padding: "0 8px" }}><span className="font-exo text-[8px] font-bold" style={{ color: CC(cam.contrato), background: `${CC(cam.contrato)}12`, border: `1px solid ${CC(cam.contrato)}25`, padding: "1px 5px", borderRadius: 3 }}>{cam.contrato?.replace("ANGLO-", "")?.substring(0, 14)}</span></td>
                        <td style={{ padding: "0 12px", textAlign: "right" }}><span className="font-space text-[12px]" style={{ color: "#c8e8ff" }}>{fN(parseFloat(cam.km_total || cam.km_mes || 0))}</span><span className="font-exo text-[8px] ml-0.5" style={{ color: "#3a6080" }}>km</span></td>
                        <td style={{ padding: "0 12px", textAlign: "right" }}><span className="font-space text-[13px] font-bold" style={{ color: RC(rend) }}>{rend > 0 ? rend.toFixed(2) : "--"}</span></td>
                        <td style={{ padding: "0 12px", textAlign: "center" }}><span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{cam.viajes || cam.viajes_mes}</span></td>
                        <td style={{ padding: "0 12px", textAlign: "center" }}><span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{vista === "MES" ? `${cam.dias_activos}/${cam.dias_mes}` : cam.horas_ruta ? `${parseFloat(cam.horas_ruta).toFixed(1)}h` : "--"}</span></td>
                        <td style={{ padding: "0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="font-exo text-[9px]" style={{ color: "#5a8090" }}>{cam.conductor?.split(",")[0] || "--"}</span></td>
                        <td style={{ padding: "0 12px", textAlign: "center" }}>
                          {vista === "MES" ? (
                            <span className="flex items-center justify-center gap-0.5">
                              {cam.tendencia === "MEJORANDO" ? <TrendingUp className="w-3 h-3" style={{ color: "#00ff88" }} /> : cam.tendencia === "BAJANDO" ? <TrendingDown className="w-3 h-3" style={{ color: "#ff2244" }} /> : <Minus className="w-3 h-3" style={{ color: "#3a6080" }} />}
                            </span>
                          ) : (
                            <span className="font-exo text-[10px]">{cam.estado === "OK" ? "✅" : cam.estado === "CRITICO" ? "🔴" : cam.estado === "ALERTA" ? "⚠️" : "⚪"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sortedCam.length === 0 && <div className="text-center py-16 font-exo text-[12px]" style={{ color: "#3a6080" }}>Sin datos para este período</div>}
            </div>
          )}

          {/* VISTA CONTRATO */}
          {vista === "CONTRATO" && (
            <div className="p-4 space-y-3">
              {contrato === "TODOS" ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {(dataContrato?.contratos || []).map((c: any) => (
                    <button key={c.contrato} onClick={() => setContrato(c.contrato)}
                      className="p-4 text-left cursor-pointer transition-all hover:scale-[1.02]"
                      style={{ background: "#060d14", border: `1px solid ${CC(c.contrato)}25`, borderTop: `3px solid ${CC(c.contrato)}`, borderRadius: 8 }}>
                      <div className="font-space text-[14px] font-bold mb-3" style={{ color: CC(c.contrato) }}>{c.contrato}</div>
                      <div className="grid grid-cols-2 gap-3">
                        {[{ l: "CAMIONES", v: c.camiones }, { l: "VIAJES", v: c.viajes }, { l: "KM", v: fN(parseFloat(c.km_total || 0)) }, { l: "KM/L", v: c.rend_promedio || "--", c: RC(parseFloat(c.rend_promedio)) }].map(k => (
                          <div key={k.l}><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div><div className="font-space text-[16px] font-bold" style={{ color: (k as any).c || "#c8e8ff" }}>{k.v}</div></div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Header contrato */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-space text-[18px] font-bold" style={{ color: CC(contrato) }}>{contrato}</span>
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Marzo 2026</span>
                    </div>
                    <button onClick={() => setContrato("TODOS")} className="font-exo text-[10px] cursor-pointer px-3 py-1.5" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>← Todos los contratos</button>
                  </div>

                  {/* KPIs principales */}
                  {contratoDetalle?.kpis && (
                    <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                      {[
                        { l: "CAMIONES", v: contratoDetalle.kpis.camiones, c: "#c8e8ff" },
                        { l: "VIAJES MES", v: fN(contratoDetalle.kpis.viajes), c: "#c8e8ff" },
                        { l: "KM TOTAL", v: fN(parseFloat(contratoDetalle.kpis.km_total || 0)), c: "#a855f7" },
                        { l: "KM/L ECU", v: contratoDetalle.kpis.rend_promedio, c: RC(parseFloat(contratoDetalle.kpis.rend_promedio || 0)) },
                        { l: "HORAS RUTA", v: fN(parseFloat(contratoDetalle.kpis.horas_total || 0)), c: "#c8e8ff" },
                        { l: "DÍAS ACTIVOS", v: `${contratoDetalle.kpis.dias_activos}/${contratoDetalle.kpis.dias_mes}`, c: "#c8e8ff" },
                        { l: "DOBLE CHECK", v: contratoDetalle.kpis.doble_validados, c: "#00ffcc" },
                        { l: "VEL MAX PROM", v: contratoDetalle.kpis.vel_max_prom ? `${contratoDetalle.kpis.vel_max_prom}` : "--", c: (contratoDetalle.kpis.vel_max_prom || 0) > 105 ? "#ff2244" : "#c8e8ff" },
                      ].map(k => (
                        <div key={k.l} className="text-center p-2" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
                          <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v || "--"}</div>
                          <div className="font-exo text-[6px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Combustible Sigetra */}
                  {contratoDetalle?.combustible && (
                    <div className="p-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: "3px solid #ff6b35", borderRadius: 6 }}>
                      <div className="flex items-center gap-2 mb-2"><Fuel className="w-3.5 h-3.5" style={{ color: "#ff6b35" }} /><span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>COMBUSTIBLE SIGETRA</span></div>
                      <div className="grid grid-cols-5 gap-3">
                        {[
                          { l: "CARGAS", v: contratoDetalle.combustible.cargas },
                          { l: "LITROS", v: fN(parseFloat(contratoDetalle.combustible.litros_total || 0)) },
                          { l: "CAM. CARGARON", v: contratoDetalle.combustible.camiones_cargaron },
                          { l: "ESTACIONES", v: contratoDetalle.combustible.estaciones },
                          { l: "REND CRUZADO", v: contratoDetalle.combustible.rend_cruzado ? `${contratoDetalle.combustible.rend_cruzado} km/L` : "--", c: RC(contratoDetalle.combustible.rend_cruzado) },
                        ].map(k => (
                          <div key={k.l}><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div><div className="font-space text-[13px] font-bold" style={{ color: (k as any).c || "#c8e8ff" }}>{k.v}</div></div>
                        ))}
                      </div>
                      {contratoDetalle.estaciones?.length > 0 && (
                        <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                          {contratoDetalle.estaciones.map((e: any) => (
                            <span key={e.estacion} className="font-exo text-[8px] px-2 py-1" style={{ color: "#3a6080", background: "#0a1520", borderRadius: 3 }}>{e.estacion?.substring(0, 20)} · {e.cargas}c · {fN(parseFloat(e.litros || 0))}lt</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dos columnas: Resumen diario + Conductores */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Resumen por día */}
                    <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
                      <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}><span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>RESUMEN DIARIO</span></div>
                      <div className="overflow-auto" style={{ maxHeight: "250px" }}>
                        <table className="w-full">
                          <thead><tr style={{ borderBottom: "1px solid #0d2035" }}>
                            {["FECHA", "VIAJES", "CAM", "KM", "KM/L"].map(h => <th key={h} className="px-2 py-1.5 text-left font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {(contratoDetalle?.por_dia || []).map((d: any) => (
                              <tr key={d.fecha} style={{ borderBottom: "1px solid #0a1520" }}>
                                <td className="px-2 py-1.5 font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{new Date(d.fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric" })}</td>
                                <td className="px-2 py-1.5 font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{d.viajes}</td>
                                <td className="px-2 py-1.5 font-space text-[10px]" style={{ color: "#3a6080" }}>{d.camiones}</td>
                                <td className="px-2 py-1.5 font-space text-[10px]" style={{ color: "#c8e8ff" }}>{fN(parseFloat(d.km || 0))}</td>
                                <td className="px-2 py-1.5 font-space text-[11px] font-bold" style={{ color: RC(parseFloat(d.rend || 0)) }}>{d.rend || "--"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Conductores */}
                    <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
                      <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}><span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>CONDUCTORES</span></div>
                      <div className="overflow-auto" style={{ maxHeight: "250px" }}>
                        {(contratoDetalle?.conductores || []).map((c: any, i: number) => {
                          const rend = parseFloat(c.rend || 0);
                          return (
                            <div key={c.conductor} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #0a1520" }}>
                              <span className="font-space text-[10px] w-4" style={{ color: "#3a6080" }}>{i + 1}</span>
                              <span className="font-exo text-[10px] font-bold flex-1" style={{ color: "#c8e8ff" }}>{c.conductor}</span>
                              <span className="font-space text-[10px]" style={{ color: "#3a6080" }}>{c.viajes}v · {c.camiones}cam</span>
                              <span className="font-space text-[11px] font-bold" style={{ color: RC(rend) }}>{rend > 0 ? rend.toFixed(2) : "--"}</span>
                            </div>
                          );
                        })}
                        {(contratoDetalle?.conductores || []).length === 0 && <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin conductores identificados</div>}
                      </div>
                    </div>
                  </div>

                  {/* Alertas hoy */}
                  {(contratoDetalle?.alertas_hoy || []).length > 0 && (
                    <div style={{ background: "#060d14", border: "1px solid #ff224430", borderLeft: "3px solid #ff2244", borderRadius: 6 }}>
                      <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                        <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#ff2244" }}>ALERTAS HOY · {contratoDetalle.alertas_hoy.length}</span>
                      </div>
                      <div className="p-2 space-y-1">
                        {contratoDetalle.alertas_hoy.map((a: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                            <div className="flex items-center gap-2">
                              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                              {a.conductor && <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{a.conductor}</span>}
                              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{a.origen} → {a.destino}</span>
                            </div>
                            <span className="font-space text-[12px] font-bold" style={{ color: RC(parseFloat(a.rend || 0)) }}>{a.rend ? `${parseFloat(a.rend).toFixed(2)} km/L` : "--"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Camiones del contrato */}
                  <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
                    <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035" }}><span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>CAMIONES · {(contratoDetalle?.camiones || []).length}</span></div>
                    <div className="space-y-0">
                      {(contratoDetalle?.camiones || []).map((cam: any, i: number) => {
                        const rend = parseFloat(cam.rend || 0);
                        const pct = Math.min(100, (rend / 4.5) * 100);
                        return (
                          <div key={cam.patente} className="flex items-center gap-3 px-4 py-2.5" style={{ background: i % 2 === 0 ? "transparent" : "#0a151808", borderBottom: "1px solid #0a1520" }}>
                            <span className="font-space text-[13px] font-bold w-20" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
                            {cam.doble && <Badge doble />}
                            <div className="flex-1 h-2" style={{ background: "#0d2035", borderRadius: 3 }}><div className="h-full" style={{ width: `${pct}%`, background: RC(rend), borderRadius: 3 }} /></div>
                            <span className="font-space text-[14px] font-bold w-14 text-right" style={{ color: RC(rend) }}>{rend > 0 ? rend.toFixed(2) : "--"}</span>
                            <span className="font-exo text-[9px] w-32 text-right" style={{ color: "#3a6080" }}>{fN(parseFloat(cam.km_mes || 0))}km · {cam.viajes}v · {cam.dias}d</span>
                            <span className="flex items-center gap-1 w-20">
                              {cam.tendencia === "MEJORANDO" ? <TrendingUp className="w-3 h-3" style={{ color: "#00ff88" }} /> : cam.tendencia === "BAJANDO" ? <TrendingDown className="w-3 h-3" style={{ color: "#ff2244" }} /> : <Minus className="w-3 h-3" style={{ color: "#3a6080" }} />}
                              <span className="font-exo text-[8px]" style={{ color: cam.tendencia === "MEJORANDO" ? "#00ff88" : cam.tendencia === "BAJANDO" ? "#ff2244" : "#3a6080" }}>{cam.tendencia || "="}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VISTA RANKING */}
          {vista === "RANKING" && (
            <div className="p-4 space-y-6">
              {[{ title: "TOP 10 — MEJOR RENDIMIENTO", data: dataRanking?.top10, icon: Trophy, color: "#ffcc00", border: (i: number) => i < 3 ? "#ffcc00" : "#00ff88" },
                { title: "BOTTOM 10 — REQUIERE ATENCIÓN", data: dataRanking?.bottom10, icon: AlertTriangle, color: "#ff2244", border: () => "#ff2244" }].map(section => (
                <div key={section.title}>
                  <div className="flex items-center gap-2 mb-3">
                    <section.icon className="w-4 h-4" style={{ color: section.color }} />
                    <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: section.color }}>{section.title}</span>
                  </div>
                  <div className="space-y-1">
                    {(section.data || []).map((cam: any, i: number) => {
                      const rend = parseFloat(cam.rend_promedio || 0);
                      return (
                        <div key={cam.patente} className="flex items-center gap-3 px-4 py-3" style={{ background: "#060d14", borderLeft: `3px solid ${section.border(i)}`, borderRadius: 4 }}>
                          {section.title.includes("TOP") && <span className="font-space text-[16px] font-bold w-8" style={{ color: i < 3 ? "#ffcc00" : "#3a6080" }}>{i + 1}</span>}
                          <span className="font-space text-[13px] font-bold w-20" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
                          <span className="font-exo text-[8px] font-bold px-2 py-0.5" style={{ color: CC(cam.contrato), background: `${CC(cam.contrato)}12`, borderRadius: 3 }}>{cam.contrato?.replace("ANGLO-", "")?.substring(0, 14)}</span>
                          <Badge doble={cam.doble_validado} />
                          <div className="flex-1 h-2" style={{ background: "#0d2035", borderRadius: 3 }}><div className="h-full" style={{ width: `${Math.min(100, (rend / 4.5) * 100)}%`, background: RC(rend), borderRadius: 3 }} /></div>
                          <span className="font-space text-[16px] font-bold w-16 text-right" style={{ color: RC(rend) }}>{rend > 0 ? rend.toFixed(2) : "--"}</span>
                          <span className="font-exo text-[9px] w-28 text-right" style={{ color: "#3a6080" }}>{fN(parseFloat(cam.km_total || 0))}km · {cam.viajes}v</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISTA ALERTAS — Detalle completo gestionable */}
          {vista === "ALERTAS" && (
            <div className="p-4 space-y-4">
              {/* KPIs alertas */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: "RENDIMIENTO BAJO", v: alertasDetalle?.rendimiento_bajo?.length || 0, c: "#ff6b35" },
                  { l: "VELOCIDAD ALTA", v: alertasDetalle?.velocidad?.length || 0, c: "#ff2244" },
                  { l: "CRITICOS", v: (alertasDetalle?.rendimiento_bajo || []).filter((a: any) => a.severidad === "CRITICO").length + (alertasDetalle?.velocidad || []).filter((a: any) => a.severidad === "CRITICO").length, c: "#ff2244" },
                  { l: "RECURRENTES", v: (alertasDetalle?.rendimiento_bajo || []).filter((a: any) => a.recurrente).length, c: "#a855f7" },
                ].map(k => (
                  <div key={k.l} className="text-center p-3" style={{ background: "#060d14", borderTop: `2px solid ${k.c}`, borderRadius: 6 }}>
                    <div className="font-space text-[22px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* Alertas velocidad */}
              {(alertasDetalle?.velocidad || []).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" style={{ color: "#ff2244" }} /><span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#ff2244" }}>EXCESOS DE VELOCIDAD</span></div>
                  <div className="space-y-2">
                    {(alertasDetalle?.velocidad || []).map((a: any, i: number) => (
                      <div key={`vel-${i}`} className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: `4px solid ${a.severidad === "CRITICO" ? "#ff2244" : "#ff6b35"}`, borderRadius: "0 8px 8px 0" }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-exo text-[8px] font-bold px-2 py-1" style={{ color: "#ff2244", background: "#ff224415", borderRadius: 4 }}>{a.severidad}</span>
                            <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                            <span className="font-exo text-[8px] font-bold px-2 py-0.5" style={{ color: CC(a.contrato), background: `${CC(a.contrato)}12`, borderRadius: 3 }}>{a.contrato}</span>
                          </div>
                          <span className="font-space text-[22px] font-bold" style={{ color: "#ff2244" }}>{a.vel_max} km/h</span>
                        </div>
                        <div className="grid grid-cols-4 gap-3 mt-2">
                          <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>HORA</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.hora?.substring(11, 16) || "--"}</div></div>
                          <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>CONDUCTOR</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.conductor || "No identificado"}</div></div>
                          <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>RUTA</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.origen_nombre || "?"} → {a.destino_nombre || "?"}</div></div>
                          <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>VEL PROMEDIO</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.vel_prom || "--"} km/h</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alertas rendimiento */}
              {(alertasDetalle?.rendimiento_bajo || []).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2"><Fuel className="w-4 h-4" style={{ color: "#ff6b35" }} /><span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>RENDIMIENTO BAJO</span></div>
                  <div className="space-y-2">
                    {(alertasDetalle?.rendimiento_bajo || []).map((a: any, i: number) => {
                      const sC = a.severidad === "CRITICO" ? "#ff2244" : a.severidad === "SIN_ECU" ? "#3a6080" : "#ff6b35";
                      return (
                        <div key={`rend-${i}`} className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: `4px solid ${sC}`, borderRadius: "0 8px 8px 0" }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="font-exo text-[8px] font-bold px-2 py-1" style={{ color: sC, background: `${sC}15`, borderRadius: 4 }}>{a.severidad}</span>
                              {a.recurrente && <span className="font-exo text-[7px] font-bold px-1.5 py-0.5" style={{ color: "#a855f7", background: "#a855f715", borderRadius: 3 }}>RECURRENTE</span>}
                              <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                              <span className="font-exo text-[8px] font-bold px-2 py-0.5" style={{ color: CC(a.contrato), background: `${CC(a.contrato)}12`, borderRadius: 3 }}>{a.contrato}</span>
                              <Badge doble={a.validacion_doble} wt={a.validado_wt} />
                            </div>
                            <div className="text-right">
                              <span className="font-space text-[20px] font-bold" style={{ color: RC(parseFloat(a.rend || 0)) }}>{a.rend ? `${parseFloat(a.rend).toFixed(2)}` : "--"}<span className="text-[10px] ml-0.5" style={{ color: "#3a6080" }}>km/L</span></span>
                              {a.rend_historico && <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>historico: {a.rend_historico} {a.desviacion_pct !== null && <span style={{ color: a.desviacion_pct < -10 ? "#ff2244" : "#3a6080" }}>({a.desviacion_pct > 0 ? "+" : ""}{a.desviacion_pct}%)</span>}</div>}
                            </div>
                          </div>

                          {/* Contexto del viaje */}
                          <div className="grid grid-cols-5 gap-3 mt-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                            <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>HORA</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.hora_inicio?.substring(11, 16) || "--"} → {a.hora_fin?.substring(11, 16) || "--"}</div></div>
                            <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>CONDUCTOR</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.conductor || "No identificado"}</div></div>
                            <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>RUTA</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.origen_nombre || "?"} → {a.destino_nombre || "?"}</div></div>
                            <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>KM / DURACIÓN</div><div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.km || 0}km · {a.duracion ? `${Math.floor(a.duracion/60)}h${a.duracion%60}m` : "--"}</div></div>
                            <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>ALERTAS MES</div><div className="font-exo text-[10px]" style={{ color: parseInt(a.alertas_mes_camion) >= 3 ? "#ff2244" : "#c8e8ff" }}>{a.alertas_mes_camion} alertas este camión</div></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(alertasDetalle?.rendimiento_bajo || []).length === 0 && (alertasDetalle?.velocidad || []).length === 0 && (
                <div className="text-center py-16 font-exo text-[12px]" style={{ color: "#3a6080" }}>Sin alertas para este día</div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: TRIP DETAIL PANEL ── */}
        {mapaViajeId && (
          <Suspense fallback={null}>
            <ViajeMapaModal viajeId={mapaViajeId} onClose={() => setMapaViajeId(null)} />
          </Suspense>
        )}

        {selCamion && vista === "DIA" && (
          <div className="w-[40%] overflow-auto" style={{ background: "#060d14" }}>
            <div className="px-4 py-3 flex items-center justify-between sticky top-0 z-10" style={{ background: "#060d14", borderBottom: "1px solid #0d2035" }}>
              <div className="flex items-center gap-3">
                <Truck className="w-4 h-4" style={{ color: "#00d4ff" }} />
                <span className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{selCamion}</span>
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{detalleViajes?.viajes?.length || 0} viajes</span>
              </div>
              <button onClick={() => setSelCamion(null)} className="cursor-pointer p-1 hover:opacity-70"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
            </div>

            <div className="p-4 space-y-3">
              {(detalleViajes?.viajes || []).length === 0 && <div className="text-center py-12 font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin viajes detallados</div>}
              {(detalleViajes?.viajes || []).map((v: any, i: number) => {
                const rend = parseFloat(v.rendimiento || 0);
                return (
                  <div key={v.id || i} className="p-4" style={{ background: "#0a1520", borderRadius: 8, borderLeft: `4px solid ${RC(rend)}` }}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-space text-[12px] font-bold px-2 py-0.5" style={{ color: "#020508", background: "#c8e8ff", borderRadius: 4 }}>V{i + 1}</span>
                        <Badge doble={v.validacion_doble} wt={v.validado_wt} />
                        {v.conductor && <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.conductor}</span>}
                      </div>
                      <span className="font-space text-[18px] font-bold" style={{ color: RC(rend) }}>{rend > 0 ? `${rend.toFixed(2)}` : "--"}<span className="text-[10px] ml-0.5" style={{ color: "#3a6080" }}>km/L</span></span>
                    </div>

                    {/* Route visual */}
                    <div className="relative pl-6 space-y-3 mb-3">
                      {/* Line */}
                      <div className="absolute left-[11px] top-2 bottom-2 w-0.5" style={{ background: `linear-gradient(to bottom, #00d4ff, ${RC(rend)})` }} />

                      {/* Origen */}
                      <div className="relative">
                        <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full border-2" style={{ borderColor: "#00d4ff", background: "#020508" }} />
                        <div>
                          <div className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{v.origen_nombre || "Punto desconocido"}</div>
                          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.inicio?.substring(11, 16) || "--:--"}</div>
                        </div>
                      </div>

                      {/* Destino */}
                      <div className="relative">
                        <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full" style={{ background: RC(rend) }} />
                        <div>
                          <div className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{v.destino_nombre || "Punto desconocido"}</div>
                          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.fin?.substring(11, 16) || "--:--"}</div>
                        </div>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-4 gap-2 pt-3" style={{ borderTop: "1px solid #0d2035" }}>
                      <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{v.km || 0}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>KM</div></div>
                      <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{v.duracion ? `${Math.floor(v.duracion / 60)}h${v.duracion % 60}m` : "--"}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>DURACION</div></div>
                      <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{v.vel_prom ? Math.round(v.vel_prom) : "--"}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VEL PROM</div></div>
                      <div className="text-center"><div className="font-space text-[13px] font-bold" style={{ color: (v.vel_max || 0) > 105 ? "#ff2244" : "#c8e8ff" }}>{v.vel_max ? Math.round(v.vel_max) : "--"}</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>VEL MAX</div></div>
                    </div>

                    {v.id && (
                      <button onClick={(e) => { e.stopPropagation(); setMapaViajeId(v.id); }}
                        className="w-full mt-3 py-2.5 flex items-center justify-center gap-2 cursor-pointer rounded-lg transition-all hover:scale-[1.02]"
                        style={{ background: "linear-gradient(135deg, #00d4ff15, #00ff8815)", border: "1px solid #00d4ff30" }}>
                        <Map className="w-4 h-4" style={{ color: "#00d4ff" }} />
                        <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>VER RUTA EN MAPA</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
