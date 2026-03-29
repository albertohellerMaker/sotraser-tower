import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, TrendingUp, AlertTriangle, Fuel, Activity, MapPin, DollarSign, Target, ChevronLeft, Bot, RefreshCw } from "lucide-react";

const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
const fP = (n: number) => `$${fN(n)}`;
type Tab = "RESUMEN" | "VIAJES" | "ERR" | "RUTAS" | "FLOTA" | "BOT" | "TARIFAS";

export default function CencosudView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("RESUMEN");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  const { data: mes } = useQuery<any>({ queryKey: ["/api/cencosud/resumen-mes"], queryFn: () => fetch("/api/cencosud/resumen-mes").then(r => r.json()), staleTime: 120000 });
  const { data: dash } = useQuery<any>({ queryKey: ["/api/cencosud/dashboard", fecha], queryFn: () => fetch(`/api/cencosud/dashboard?fecha=${fecha}`).then(r => r.json()), staleTime: 60000 });
  const { data: errData } = useQuery<any>({ queryKey: ["/api/cencosud/err", fecha], queryFn: () => fetch(`/api/cencosud/err?fecha=${fecha}`).then(r => r.json()), staleTime: 60000, enabled: tab === "ERR" });
  const { data: viajesMes } = useQuery<any>({ queryKey: ["/api/cencosud/viajes-mes"], queryFn: () => fetch("/api/cencosud/viajes-mes").then(r => r.json()), staleTime: 120000, enabled: tab === "VIAJES" });
  const { data: flotaData } = useQuery<any>({ queryKey: ["/api/cencosud/flota"], queryFn: () => fetch("/api/cencosud/flota").then(r => r.json()), staleTime: 300000, enabled: tab === "FLOTA" });
  const { data: tarifasData } = useQuery<any>({ queryKey: ["/api/cencosud/tarifas"], queryFn: () => fetch("/api/cencosud/tarifas").then(r => r.json()), staleTime: 600000, enabled: tab === "TARIFAS" });
  const { data: sinMapear } = useQuery<any>({ queryKey: ["/api/cencosud/sin-mapear"], queryFn: () => fetch("/api/cencosud/sin-mapear").then(r => r.json()), staleTime: 300000 });
  const { data: aliasData } = useQuery<any>({ queryKey: ["/api/cencosud/alias"], queryFn: () => fetch("/api/cencosud/alias").then(r => r.json()), staleTime: 300000, enabled: tab === "BOT" });
  const { data: botStatus } = useQuery<any>({ queryKey: ["/api/agentes/estado"], queryFn: () => fetch("/api/agentes/estado").then(r => r.json()), staleTime: 60000, enabled: tab === "BOT" });
  const { data: botMsgs } = useQuery<any>({ queryKey: ["/api/agentes/mensajes?limite=20"], queryFn: () => fetch("/api/agentes/mensajes?limite=20").then(r => r.json()), staleTime: 30000, enabled: tab === "BOT" });

  const f = mes?.flota || {};
  const fi = mes?.financiero || {};
  const p = mes?.productividad || {};

  return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-3" style={{ background: "#060d14", borderBottom: "2px solid #00d4ff" }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer p-1" style={{ color: "#3a6080" }}><ChevronLeft className="w-5 h-5" /></button>
          <div className="w-8 h-8 rounded flex items-center justify-center font-space text-[11px] font-bold" style={{ background: "#00d4ff15", border: "1px solid #00d4ff30", color: "#00d4ff" }}>C</div>
          <div>
            <div className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>CENCOSUD RETAIL</div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Contrato Ago 2025 - Jul 2029 · 83 camiones · 7 lotes</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>INGRESO MES</div>
            <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{fP(fi.ingreso_acumulado || 0)}</div>
          </div>
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>PROYECTADO</div>
            <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>{fP(fi.ingreso_proyectado || 0)}</div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center justify-between px-4 py-1" style={{ background: "#0a1218", borderBottom: "1px solid #0d2035" }}>
        <div className="flex gap-0">
          {(["RESUMEN", "VIAJES", "ERR", "RUTAS", "FLOTA", "BOT", "TARIFAS"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-4 py-2 font-space text-[9px] font-bold tracking-wider cursor-pointer"
              style={{ color: tab === t ? "#00d4ff" : "#3a6080", borderBottom: tab === t ? "2px solid #00d4ff" : "2px solid transparent" }}>{t}</button>
          ))}
        </div>
        {(tab === "ERR" || tab === "RUTAS") && (
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="font-exo text-[10px] px-3 py-1 rounded outline-none cursor-pointer"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        )}
      </div>

      <div className="p-4 space-y-4 overflow-auto" style={{ height: "calc(100vh - 120px)" }}>

        {/* ═══ RESUMEN ═══ */}
        {tab === "RESUMEN" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-8 gap-2">
              {[
                { l: "CAMIONES", v: `${f.camiones || 0}/83`, c: "#00d4ff", icon: Truck, go: "FLOTA" as Tab },
                { l: "VIAJES MES", v: f.viajes || 0, c: "#a855f7", icon: Activity, go: "VIAJES" as Tab },
                { l: "KM TOTAL", v: fN(parseFloat(f.km) || 0), c: "#00ff88", icon: TrendingUp },
                { l: "KM/L", v: f.rend || "--", c: RC(parseFloat(f.rend) || 0), icon: Fuel },
                { l: "INGRESO MES", v: fP(fi.ingreso_acumulado || 0), c: "#00ff88", icon: DollarSign, go: "ERR" as Tab },
                { l: "% CRUZADOS", v: `${fi.pct_cruzados || 0}%`, c: (fi.pct_cruzados || 0) > 50 ? "#00ff88" : "#ffcc00", icon: Target, go: "VIAJES" as Tab },
                { l: "KM/CAM PROY", v: fN(p.km_proyectado_camion || 0), c: (p.km_proyectado_camion || 0) >= 11000 ? "#00ff88" : "#ff6b35", icon: MapPin },
                { l: "SIN MAPEAR", v: (sinMapear?.sin_mapear || []).length, c: (sinMapear?.sin_mapear || []).length > 20 ? "#ffcc00" : "#3a6080", icon: AlertTriangle, go: "BOT" as Tab },
              ].map(k => {
                const Icon = k.icon;
                return (
                  <div key={k.l} onClick={() => k.go && setTab(k.go)} className={`rounded-lg p-3 ${k.go ? "cursor-pointer hover:opacity-90 transition-all" : ""}`} style={{ background: "#060d14", borderTop: `2px solid ${k.c}`, border: "1px solid #0d2035" }}>
                    <Icon className="w-3.5 h-3.5 mb-1.5" style={{ color: `${k.c}50` }} />
                    <div className="font-space text-[16px] font-bold leading-none" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[6px] tracking-wider uppercase mt-1" style={{ color: "#3a6080" }}>{k.l}{k.go ? " >" : ""}</div>
                  </div>
                );
              })}
            </div>

            {/* Tendencia + Hoy */}
            <div className="grid grid-cols-2 gap-4">
              {/* Tendencia mensual */}
              <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-exo text-[8px] tracking-wider uppercase mb-3" style={{ color: "#00d4ff" }}>TENDENCIA DIARIA · MARZO</div>
                {(mes?.tendencia || []).length > 0 && (
                  <div className="flex items-end gap-0.5" style={{ height: 90 }}>
                    {(mes?.tendencia || []).map((d: any) => {
                      const maxKm = Math.max(...(mes?.tendencia || []).map((t: any) => parseFloat(t.km) || 0));
                      const h = maxKm > 0 ? (parseFloat(d.km) / maxKm) * 80 : 5;
                      return (
                        <div key={d.dia} className="flex-1 flex flex-col items-center gap-0.5">
                          <span className="font-space text-[6px]" style={{ color: RC(parseFloat(d.rend) || 0) }}>{d.rend}</span>
                          <div className="w-full rounded-t" style={{ height: Math.max(3, h), background: `${RC(parseFloat(d.rend) || 0)}80` }} />
                          <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{d.dia.slice(8)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Hoy */}
              <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-exo text-[8px] tracking-wider uppercase mb-3" style={{ color: "#00d4ff" }}>HOY · {new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}</div>
                {dash?.resumen && (
                  <div className="space-y-2">
                    {[
                      { l: "Camiones", v: dash.resumen.camiones },
                      { l: "Viajes", v: dash.resumen.viajes },
                      { l: "KM", v: fN(parseFloat(dash.resumen.km_total) || 0) },
                      { l: "KM/L", v: dash.resumen.rend, c: RC(parseFloat(dash.resumen.rend) || 0) },
                      { l: "Horas ruta", v: dash.resumen.horas_total },
                      { l: "Cruzados", v: `${dash.viajes_cruzados}/${dash.resumen.viajes} (${dash.pct_cruzados}%)` },
                      { l: "Ingreso estimado", v: fP(dash.ingreso_estimado || 0), c: "#00ff88" },
                    ].map(k => (
                      <div key={k.l} className="flex justify-between">
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{k.l}</span>
                        <span className="font-space text-[10px] font-bold" style={{ color: k.c || "#c8e8ff" }}>{k.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Productividad barra */}
            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>PRODUCTIVIDAD vs META CONTRATO</span>
                <span className="font-space text-[10px] font-bold" style={{ color: (p.km_proyectado_camion || 0) >= 11000 ? "#00ff88" : "#ff6b35" }}>
                  {fN(p.km_proyectado_camion || 0)} / {fN(p.meta_km_camion || 11000)} km/cam
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, Math.round((p.km_proyectado_camion || 0) / (p.meta_km_camion || 11000) * 100))}%`,
                  background: (p.km_proyectado_camion || 0) >= 11000 ? "#00ff88" : (p.km_proyectado_camion || 0) >= 6600 ? "#ffcc00" : "#ff2244"
                }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Día {mes?.dia_actual}/{mes?.dias_mes}</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{Math.round((p.km_proyectado_camion || 0) / (p.meta_km_camion || 11000) * 100)}% de meta</span>
              </div>
            </div>
          </>
        )}

        {/* ═══ VIAJES MES ═══ */}
        {tab === "VIAJES" && viajesMes && (() => {
          const conT = viajesMes.viajes_con_tarifa || [];
          const sinT = viajesMes.viajes_sin_tarifa || [];
          return (
            <>
              {/* KPIs viajes */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { l: "TOTAL VIAJES", v: viajesMes.total, c: "#a855f7" },
                  { l: "CON TARIFA", v: viajesMes.con_tarifa, c: "#00ff88" },
                  { l: "SIN TARIFA", v: viajesMes.sin_tarifa, c: "#ffcc00" },
                  { l: "% CRUZADOS", v: `${viajesMes.pct_cruzados}%`, c: viajesMes.pct_cruzados > 50 ? "#00ff88" : "#ffcc00" },
                  { l: "INGRESO MES", v: fP(viajesMes.ingreso_total), c: "#00ff88" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* Viajes CON tarifa */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #00ff8830" }}>
                <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#00ff88" }}>
                    VIAJES CON TARIFA ({conT.length}) · {fP(viajesMes.ingreso_total)}
                  </span>
                </div>
                <div className="overflow-auto" style={{ maxHeight: 300 }}>
                  <table className="w-full">
                    <thead><tr style={{ background: "#0a1520" }}>
                      {["FECHA", "PATENTE", "CONDUCTOR", "RUTA CONTRATO", "LOTE", "KM", "KM/L", "TARIFA"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#00ff88" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {conT.map((v: any, i: number) => (
                        <tr key={v.id} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>{v.fecha?.slice(5)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#c8e8ff" }}>{v.patente}</td>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>{(v.conductor || "").substring(0, 15)}</td>
                          <td className="font-exo text-[9px] px-3 py-1" style={{ color: "#00d4ff" }}>{v.origen_contrato} → {v.destino_contrato}</td>
                          <td className="font-space text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>L{v.lote}</td>
                          <td className="font-space text-[9px] px-3 py-1" style={{ color: "#c8e8ff" }}>{Math.round(v.km || 0)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: RC(v.rend || 0) }}>{v.rend?.toFixed(2) || "--"}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#00ff88" }}>{fP(v.tarifa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Viajes SIN tarifa */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #ffcc0030" }}>
                <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#ffcc00" }}>
                    VIAJES SIN TARIFA ({sinT.length}) · Pendientes de cruce
                  </span>
                </div>
                <div className="overflow-auto" style={{ maxHeight: 250 }}>
                  <table className="w-full">
                    <thead><tr style={{ background: "#0a1520" }}>
                      {["FECHA", "PATENTE", "CONDUCTOR", "ORIGEN GPS", "DESTINO GPS", "ALIAS", "KM", "KM/L"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#ffcc00" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {sinT.slice(0, 100).map((v: any, i: number) => (
                        <tr key={v.id} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>{v.fecha?.slice(5)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#c8e8ff" }}>{v.patente}</td>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>{(v.conductor || "").substring(0, 15)}</td>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#c8e8ff" }}>{(v.origen_nombre || "?").substring(0, 22)}</td>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#c8e8ff" }}>{(v.destino_nombre || "?").substring(0, 22)}</td>
                          <td className="font-exo text-[7px] px-3 py-1" style={{ color: v.origen_contrato || v.destino_contrato ? "#00d4ff" : "#3a6080" }}>
                            {v.origen_contrato || "?"} → {v.destino_contrato || "?"}
                          </td>
                          <td className="font-space text-[9px] px-3 py-1" style={{ color: "#c8e8ff" }}>{Math.round(v.km || 0)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: RC(v.rend || 0) }}>{v.rend?.toFixed(2) || "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}

        {/* ═══ ERR: Estado de Resultados ═══ */}
        {tab === "ERR" && errData && (() => {
          const e = errData.err || {};
          const fechaLabel = new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
          return (
            <>
              <div className="flex items-center justify-between">
                <div className="font-space text-[12px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>
                  ERR CENCOSUD · {fechaLabel.toUpperCase()}
                </div>
                <div className="font-space text-[18px] font-bold" style={{ color: "#00ff88" }}>{fP(e.ingreso_estimado || 0)}</div>
              </div>

              {/* KPIs ERR */}
              <div className="grid grid-cols-7 gap-2">
                {[
                  { l: "CAMIONES", v: e.camiones || 0, c: "#00d4ff" },
                  { l: "VIAJES", v: e.viajes || 0, c: "#a855f7" },
                  { l: "CRUZADOS", v: `${e.viajes_cruzados || 0} (${e.pct_cruzados || 0}%)`, c: (e.pct_cruzados || 0) > 50 ? "#00ff88" : "#ffcc00" },
                  { l: "KM TOTAL", v: fN(e.km_total || 0), c: "#00ff88" },
                  { l: "KM/L", v: e.rend_promedio || "--", c: RC(e.rend_promedio || 0) },
                  { l: "INGRESO", v: fP(e.ingreso_estimado || 0), c: "#00ff88" },
                  { l: "$/KM", v: e.km_total > 0 ? fP(Math.round(e.ingreso_estimado / e.km_total)) : "--", c: "#fbbf24" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                    <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* Por ruta contrato */}
              {(errData.por_ruta || []).length > 0 && (
                <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#00ff88" }}>FACTURACION POR RUTA</span>
                  </div>
                  <table className="w-full">
                    <thead><tr style={{ background: "#0a1520" }}>
                      {["LOTE", "ORIGEN", "DESTINO", "CLASE", "VIAJES", "KM", "KM/L", "TARIFA", "INGRESO"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#3a6080" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(errData.por_ruta || []).map((r: any, i: number) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
                          <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#00d4ff" }}>L{r.lote}</td>
                          <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.origen}</td>
                          <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.destino}</td>
                          <td className="font-space text-[8px] px-3 py-1.5" style={{ color: "#3a6080" }}>{r.clase}</td>
                          <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.viajes}</td>
                          <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(r.km) || 0)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(r.rend) || 0) }}>{r.rend || "--"}</td>
                          <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#00ff88" }}>{fP(r.tarifa)}</td>
                          <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#00ff88" }}>{fP(r.tarifa * r.viajes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Circuitos */}
              {(errData.circuitos || []).length > 0 && (
                <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #a855f730" }}>
                  <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#a855f7" }}>CIRCUITOS DEL DIA · {(errData.circuitos || []).length} camiones con 2+ viajes</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {(errData.circuitos || []).map((c: any) => (
                      <div key={c.patente} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${c.ingreso_circuito > 0 ? "#00ff88" : "#3a6080"}` }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.conductor?.substring(0, 18)}</span>
                            <span className="font-space text-[9px]" style={{ color: "#00d4ff" }}>{c.viajes}v · {fN(parseFloat(c.km_circuito) || 0)}km</span>
                          </div>
                          <span className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{c.ingreso_circuito > 0 ? fP(parseInt(c.ingreso_circuito)) : "--"}</span>
                        </div>
                        <div className="font-exo text-[8px] mt-1 flex items-center gap-1 flex-wrap" style={{ color: "#3a6080" }}>
                          {(c.secuencia || []).map((s: string, i: number) => (
                            <span key={i}>
                              {i > 0 && <span style={{ color: "#0d2035" }}> | </span>}
                              <span style={{ color: "#c8e8ff" }}>{s}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Por camión */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#3a6080" }}>DETALLE POR CAMION</span>
                </div>
                <table className="w-full">
                  <thead><tr style={{ background: "#0a1520" }}>
                    {["PATENTE", "CONDUCTOR", "VIAJES", "KM", "KM/L", "HORAS", "INGRESO"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(errData.por_camion || []).map((c: any, i: number) => (
                      <tr key={c.patente} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
                        <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                        <td className="font-exo text-[8px] px-3 py-1.5" style={{ color: "#3a6080" }}>{(c.conductor || "").substring(0, 18)}</td>
                        <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.viajes}</td>
                        <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km) || 0)}</td>
                        <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(c.rend) || 0) }}>{c.rend || "--"}</td>
                        <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{c.horas}h</td>
                        <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: parseInt(c.ingreso) > 0 ? "#00ff88" : "#3a6080" }}>{parseInt(c.ingreso) > 0 ? fP(parseInt(c.ingreso)) : "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        {/* ═══ RUTAS ═══ */}
        {tab === "RUTAS" && dash && (
          <>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#00d4ff" }}>
              VIAJES DEL DIA CRUZADOS CON TARIFAS · {dash.viajes_cruzados}/{dash.resumen?.viajes} ({dash.pct_cruzados}%)
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d2035" }}>
                    {["ORIGEN", "DESTINO", "VIAJES", "KM", "KM/L", "LOTE", "TARIFA", "INGRESO", "ESTADO"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(dash.rutas || []).map((r: any, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520", borderBottom: "1px solid #0d203530" }}>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{(r.origen_nombre || "").substring(0, 22)}</td>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{(r.destino_nombre || "").substring(0, 22)}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.viajes}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(r.km) || 0)}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(r.rend) || 0) }}>{r.rend || "--"}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{r.lote || "-"}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: r.tarifa ? "#00ff88" : "#3a6080" }}>{r.tarifa ? fP(r.tarifa) : "-"}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#00ff88" }}>{r.ingreso_estimado ? fP(r.ingreso_estimado) : "-"}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{
                          color: r.estado_match === "CRUZADO" ? "#00ff88" : r.estado_match === "PARCIAL" ? "#ffcc00" : "#ff2244",
                          border: `1px solid ${r.estado_match === "CRUZADO" ? "#00ff8830" : r.estado_match === "PARCIAL" ? "#ffcc0030" : "#ff224430"}`,
                        }}>{r.estado_match}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="font-exo text-[9px] mt-2" style={{ color: "#3a6080" }}>
              Total ingreso estimado dia: <span className="font-space font-bold" style={{ color: "#00ff88" }}>{fP(dash.ingreso_estimado || 0)}</span>
            </div>
          </>
        )}

        {/* ═══ FLOTA ═══ */}
        {tab === "FLOTA" && flotaData && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#00d4ff" }}>
                FLOTA CENCOSUD · {flotaData.total}/{flotaData.contratados} CAMIONES ACTIVOS
              </span>
              <div className="font-space text-[11px] font-bold" style={{ color: flotaData.total >= 58 ? "#00ff88" : "#ff6b35" }}>
                {Math.round(flotaData.total / flotaData.contratados * 100)}%
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: "#0d2035" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(flotaData.total / flotaData.contratados * 100))}%`, background: flotaData.total >= 58 ? "#00ff88" : "#ff6b35" }} />
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d2035" }}>
                    {["PATENTE", "CONDUCTOR", "VIAJES", "KM MES", "KM PROY", "% META", "KM/L", "DIAS", "ESTADO"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(flotaData.camiones || []).map((c: any, i: number) => (
                    <tr key={c.patente} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                      <td className="font-exo text-[8px] px-3 py-1.5" style={{ color: "#3a6080" }}>{(c.conductor || "").substring(0, 18)}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.viajes}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km_mes) || 0)}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244" }}>{fN(c.km_proyectado)}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: c.pct_meta >= 100 ? "#00ff88" : c.pct_meta >= 60 ? "#ffcc00" : "#ff2244" }}>{c.pct_meta}%</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(c.rend) || 0) }}>{c.rend || "--"}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{c.dias_activo}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{
                          color: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244",
                          background: c.estado === "OK" ? "#00ff8810" : c.estado === "BAJO" ? "#ffcc0010" : "#ff224410",
                          border: `1px solid ${c.estado === "OK" ? "#00ff8830" : c.estado === "BAJO" ? "#ffcc0030" : "#ff224430"}`,
                        }}>{c.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══ BOT: Admin Contrato ═══ */}
        {tab === "BOT" && (() => {
          const bot = (botStatus?.agentes || []).find((a: any) => a.id === "agente-admin-contrato");
          const msgs = (botMsgs?.mensajes || []).filter((m: any) => m.de_agente === "agente-admin-contrato" || m.contenido?.includes("Cencosud") || m.contenido?.includes("cencosud"));
          const alias = aliasData?.alias || [];
          const porFuente = alias.reduce((acc: any, a: any) => { acc[a.creado_por] = (acc[a.creado_por] || 0) + 1; return acc; }, {});
          const confirmados = alias.filter((a: any) => a.confirmado).length;
          const sinMap = sinMapear?.sin_mapear || [];

          return (
            <>
              {/* Bot header */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #fbbf2430", borderTop: "3px solid #fbbf24" }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5" style={{ color: "#fbbf24" }} />
                    <div>
                      <div className="font-space text-[12px] font-bold tracking-wider" style={{ color: "#fbbf24" }}>ADMIN CONTRATO CENCOSUD</div>
                      <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Autonomía: georeferencias · cruce tarifas · validación · reportería</div>
                    </div>
                    {bot && (
                      <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#00ff8815", color: "#00ff88", border: "1px solid #00ff8830" }}>
                        {bot.ciclos_completados} ciclos · {bot.ultimo_ciclo ? Math.round((Date.now() - new Date(bot.ultimo_ciclo).getTime()) / 60000) + "m" : "--"}
                      </span>
                    )}
                  </div>
                  <button onClick={() => fetch("/api/agentes/forzar/cencosud", { method: "POST" })} className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-[8px] cursor-pointer rounded"
                    style={{ color: "#fbbf24", border: "1px solid #fbbf2430" }}>
                    <RefreshCw className="w-3 h-3" /> Ejecutar ahora
                  </button>
                </div>

                {/* KPIs del bot */}
                <div className="grid grid-cols-5 gap-2 p-3">
                  {[
                    { l: "ALIAS TOTAL", v: alias.length, c: "#fbbf24" },
                    { l: "CONFIRMADOS", v: confirmados, c: "#00ff88" },
                    { l: "AUTO (GEO)", v: porFuente["ADMIN_CONTRATO"] || porFuente["AGENTE_GEO"] || 0, c: "#00d4ff" },
                    { l: "MANUALES", v: porFuente["MANUAL"] || 0, c: "#a855f7" },
                    { l: "SIN MAPEAR", v: sinMap.length, c: sinMap.length > 20 ? "#ff2244" : "#3a6080" },
                  ].map(k => (
                    <div key={k.l} className="text-center p-2 rounded" style={{ background: "#0a1520", borderTop: `2px solid ${k.c}` }}>
                      <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v}</div>
                      <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mensajes del bot */}
              {msgs.length > 0 && (
                <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#fbbf24" }}>REPORTES DEL BOT</span>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {msgs.slice(0, 8).map((m: any) => (
                      <div key={m.id} className="px-4 py-2" style={{ borderBottom: "1px solid #0a1520" }}>
                        <div className="flex items-center justify-between">
                          <span className="font-exo text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{m.titulo}</span>
                          <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{new Date(m.created_at).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className="font-exo text-[8px] mt-0.5 whitespace-pre-wrap" style={{ color: "#3a6080" }}>{m.contenido?.substring(0, 200)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alias recientes */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#00d4ff" }}>ALIAS GEOCERCAS ({alias.length})</span>
                </div>
                <div className="max-h-[250px] overflow-y-auto">
                  <table className="w-full">
                    <thead><tr style={{ background: "#0a1520" }}>
                      {["GEOCERCA", "→ CONTRATO", "FUENTE", "ESTADO"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#3a6080" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {alias.slice(0, 50).map((a: any) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid #0d203520" }}>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#c8e8ff" }}>{a.geocerca_nombre.substring(0, 35)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#00d4ff" }}>{a.nombre_contrato}</td>
                          <td className="font-exo text-[7px] px-3 py-1" style={{ color: a.creado_por.includes("ADMIN") || a.creado_por.includes("AGENTE") ? "#fbbf24" : "#3a6080" }}>{a.creado_por}</td>
                          <td className="px-3 py-1"><span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: a.confirmado ? "#00ff88" : "#ffcc00", border: `1px solid ${a.confirmado ? "#00ff8830" : "#ffcc0030"}` }}>{a.confirmado ? "OK" : "PENDIENTE"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sin mapear */}
              {sinMap.length > 0 && (
                <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #ff224420" }}>
                  <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#ff2244" }}>SIN MAPEAR ({sinMap.length})</span>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto p-2 space-y-1">
                    {sinMap.slice(0, 20).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1 rounded" style={{ background: "#0a1520" }}>
                        <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{s.nombre?.substring(0, 40)}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{s.tipo}</span>
                          <span className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>{s.viajes}v</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ═══ TARIFAS ═══ */}
        {tab === "TARIFAS" && tarifasData && (
          <>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#00d4ff" }}>
              TARIFAS CONTRATO · {(tarifasData.tarifas || []).length} RUTAS · 7 LOTES
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d2035" }}>
                    {["LOTE", "CLASE", "ORIGEN", "DESTINO", "TARIFA"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(tarifasData.tarifas || []).map((t: any, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#00d4ff" }}>L{t.lote}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{t.clase}</td>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{t.origen}</td>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{t.destino}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#00ff88" }}>{fP(t.tarifa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
