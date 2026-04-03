import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, TrendingUp, AlertTriangle, Fuel, Activity, MapPin, DollarSign, Target, ChevronLeft, RefreshCw, Settings, Route, Eye, Calculator, FileText, Send, Mountain, Shield, MessageSquare } from "lucide-react";

const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
const fP = (n: number) => `$${fN(n)}`;
type Tab = "RESUMEN" | "VIAJES" | "ERR" | "RUTAS" | "FLOTA" | "AGENTE" | "TARIFAS" | "REAJUSTE";

export default function AngloView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("RESUMEN");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  const { data: mes } = useQuery<any>({ queryKey: ["/api/anglo/resumen-mes"], queryFn: () => fetch("/api/anglo/resumen-mes").then(r => r.json()), staleTime: 120000 });
  const { data: dash } = useQuery<any>({ queryKey: ["/api/anglo/dashboard", fecha], queryFn: () => fetch(`/api/anglo/dashboard?fecha=${fecha}`).then(r => r.json()), staleTime: 60000 });
  const { data: errData } = useQuery<any>({ queryKey: ["/api/anglo/err", fecha], queryFn: () => fetch(`/api/anglo/err?fecha=${fecha}`).then(r => r.json()), staleTime: 60000, enabled: tab === "ERR" });
  const { data: viajesMes } = useQuery<any>({ queryKey: ["/api/anglo/viajes-mes"], queryFn: () => fetch("/api/anglo/viajes-mes").then(r => r.json()), staleTime: 120000, enabled: tab === "VIAJES" });
  const { data: flotaData } = useQuery<any>({ queryKey: ["/api/anglo/flota"], queryFn: () => fetch("/api/anglo/flota").then(r => r.json()), staleTime: 300000, enabled: tab === "FLOTA" });
  const { data: tarifasData } = useQuery<any>({ queryKey: ["/api/anglo/tarifas"], queryFn: () => fetch("/api/anglo/tarifas").then(r => r.json()), staleTime: 600000, enabled: tab === "TARIFAS" });
  const { data: sinMapear } = useQuery<any>({ queryKey: ["/api/anglo/sin-mapear"], queryFn: () => fetch("/api/anglo/sin-mapear").then(r => r.json()), staleTime: 300000 });
  const { data: intelData } = useQuery<any>({ queryKey: ["/api/anglo/agente/inteligencia"], queryFn: () => fetch("/api/anglo/agente/inteligencia").then(r => r.json()), refetchInterval: 120000, enabled: tab === "AGENTE" });
  const { data: rutasTop } = useQuery<any>({ queryKey: ["/api/anglo/rutas-top"], queryFn: () => fetch("/api/anglo/rutas-top").then(r => r.json()), staleTime: 300000, enabled: tab === "RUTAS" });
  const { data: reajusteData } = useQuery<any>({ queryKey: ["/api/anglo/reajuste"], queryFn: () => fetch("/api/anglo/reajuste").then(r => r.json()), staleTime: 600000, enabled: tab === "REAJUSTE" });
  const { data: paramData } = useQuery<any>({ queryKey: ["/api/anglo/parametros"], queryFn: () => fetch("/api/anglo/parametros").then(r => r.json()), staleTime: 300000, enabled: tab === "AGENTE" || tab === "REAJUSTE" });

  const f = mes?.flota || {};
  const fi = mes?.financiero || {};
  const p = mes?.productividad || {};
  const ci = mes?.contrato_info || {};
  const ACC = "#22c55e";

  return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ background: "#060d14", borderBottom: `2px solid ${ACC}` }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer p-1" style={{ color: "#3a6080" }}><ChevronLeft className="w-5 h-5" /></button>
          <div className="w-8 h-8 rounded flex items-center justify-center font-space text-[11px] font-bold" style={{ background: `${ACC}15`, border: `1px solid ${ACC}30`, color: ACC }}>A</div>
          <div>
            <div className="font-space text-[14px] font-bold tracking-wider" style={{ color: ACC }}>ANGLO AMERICAN · CARGAS VARIAS</div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Contrato N° {ci.numero || "4.22.0015.1"} · Mar 2023 - Jun 2027 · {ci.camiones || 74} camiones</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>INGRESO MES</div>
            <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{fP(fi.ingreso_acumulado || 0)}</div>
          </div>
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>PROYECTADO</div>
            <div className="font-space text-[14px] font-bold" style={{ color: ACC }}>{fP(fi.ingreso_proyectado || 0)}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-1" style={{ background: "#0a1218", borderBottom: "1px solid #0d2035" }}>
        <div className="flex gap-0">
          {(["RESUMEN", "VIAJES", "ERR", "RUTAS", "FLOTA", "AGENTE", "TARIFAS", "REAJUSTE"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-4 py-2 font-space text-[9px] font-bold tracking-wider cursor-pointer"
              style={{ color: tab === t ? ACC : "#3a6080", borderBottom: tab === t ? `2px solid ${ACC}` : "2px solid transparent" }}>{t}</button>
          ))}
        </div>
        {(tab === "ERR" || tab === "RUTAS") && (
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="font-exo text-[10px] px-3 py-1 rounded outline-none cursor-pointer"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        )}
      </div>

      <div className="p-4 space-y-4 overflow-auto" style={{ height: "calc(100vh - 120px)" }}>

        {tab === "RESUMEN" && (
          <>
            <div className="grid grid-cols-8 gap-2">
              {[
                { l: "CAMIONES", v: `${f.camiones || 0}/${ci.camiones || 74}`, c: ACC, icon: Truck, go: "FLOTA" as Tab },
                { l: "VIAJES MES", v: f.viajes || 0, c: "#a855f7", icon: Activity, go: "VIAJES" as Tab },
                { l: "KM TOTAL", v: fN(parseFloat(f.km) || 0), c: "#00ff88", icon: TrendingUp },
                { l: "KM/L", v: f.rend || "--", c: RC(parseFloat(f.rend) || 0), icon: Fuel },
                { l: "INGRESO MES", v: fP(fi.ingreso_acumulado || 0), c: "#00ff88", icon: DollarSign, go: "ERR" as Tab },
                { l: "% CRUZADOS", v: `${fi.pct_cruzados || 0}%`, c: (fi.pct_cruzados || 0) > 50 ? "#00ff88" : "#ffcc00", icon: Target, go: "VIAJES" as Tab },
                { l: "KM/CAM PROY", v: fN(p.km_proyectado_camion || 0), c: (p.km_proyectado_camion || 0) >= (p.meta_km_camion || 8000) ? "#00ff88" : "#ff6b35", icon: MapPin },
                { l: "SIN MAPEAR", v: (sinMapear?.sin_mapear || []).length, c: (sinMapear?.sin_mapear || []).length > 20 ? "#ffcc00" : "#3a6080", icon: AlertTriangle, go: "AGENTE" as Tab },
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

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>TENDENCIA MENSUAL</div>
                <div className="flex items-end gap-1" style={{ height: 120 }}>
                  {(mes?.tendencia || []).map((d: any, i: number) => {
                    const maxV = Math.max(...(mes?.tendencia || []).map((x: any) => x.viajes || 1));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="font-space text-[7px]" style={{ color: "#5a8090" }}>{d.viajes}</div>
                        <div className="w-full rounded-t" style={{ height: `${Math.max((d.viajes / maxV) * 90, 4)}px`, background: `${ACC}80` }} />
                        <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{d.dia?.slice(8)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>CONTRATO ANGLO CARGAS VARIAS</div>
                <div className="space-y-2">
                  {[
                    { l: "N° Contrato", v: ci.numero || "4.22.0015.1" },
                    { l: "Vigencia", v: `${ci.vigencia_inicio?.slice(0, 7) || "2023-03"} → ${ci.vigencia_fin?.slice(0, 7) || "2027-06"}` },
                    { l: "Camiones", v: ci.camiones || 74 },
                    { l: "Reajuste Variable", v: "60% IPC + 30% Diesel + 10% USD" },
                    { l: "Meses Reajuste", v: "Mar · Jul · Nov" },
                    { l: "IPC₀", v: ci.bases?.ipc0 || 128.65 },
                    { l: "Diesel₀", v: fN(ci.bases?.diesel0 || 1025851) },
                    { l: "Dólar₀", v: `$${ci.bases?.dolar0 || 917.05}` },
                  ].map(r => (
                    <div key={r.l} className="flex justify-between">
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{r.l}</span>
                      <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>TOP 10 RUTAS HOY ({dash?.fecha?.slice(5) || ""})</div>
              <div className="space-y-1">
                {(dash?.rutas || []).slice(0, 10).map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid #0d2035" }}>
                    <div className="w-5 font-space text-[8px] text-center" style={{ color: "#3a6080" }}>{i + 1}</div>
                    <div className="flex-1 font-exo text-[8px] truncate" style={{ color: "#c8e8ff" }}>{r.origen_nombre} → {r.destino_nombre}</div>
                    <div className="font-space text-[9px] font-bold" style={{ color: r.tarifa ? "#00ff88" : "#3a6080" }}>{r.viajes}v</div>
                    <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{r.km}km</div>
                    <div className="w-12 font-space text-[8px] text-right" style={{ color: r.tarifa ? "#00ff88" : "#ff6b35" }}>{r.tarifa ? fP(r.ingreso_estimado) : "SIN TAR"}</div>
                    <div className="w-3 h-3 rounded-full" style={{ background: r.estado_match === "CRUZADO" ? "#00ff88" : r.estado_match === "PARCIAL" ? "#ffcc00" : "#ff2244" }} />
                  </div>
                ))}
                {(dash?.rutas || []).length === 0 && <div className="font-exo text-[9px] text-center py-4" style={{ color: "#3a6080" }}>Sin viajes hoy</div>}
              </div>
            </div>
          </>
        )}

        {tab === "VIAJES" && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              {[
                { l: "TOTAL", v: viajesMes?.total || 0, c: "#a855f7" },
                { l: "CON TARIFA", v: viajesMes?.con_tarifa || 0, c: "#00ff88" },
                { l: "SIN TARIFA", v: viajesMes?.sin_tarifa || 0, c: "#ff6b35" },
                { l: "INGRESO", v: fP(viajesMes?.ingreso_total || 0), c: "#00ff88" },
              ].map(k => (
                <div key={k.l} className="rounded-lg p-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="grid grid-cols-8 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
                {["FECHA", "PATENTE", "ORIGEN", "DESTINO", "KM", "KM/L", "TARIFA", "ESTADO"].map(h => (
                  <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
                ))}
              </div>
              <div style={{ maxHeight: 500, overflow: "auto" }}>
                {[...(viajesMes?.viajes_con_tarifa || []), ...(viajesMes?.viajes_sin_tarifa || [])].slice(0, 100).map((v: any, i: number) => (
                  <div key={i} className="grid grid-cols-8 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                    <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>{v.fecha?.slice(5)}</div>
                    <div className="font-space text-[8px] font-bold" style={{ color: "#c8e8ff" }}>{v.patente}</div>
                    <div className="font-exo text-[7px] truncate" style={{ color: "#c8e8ff" }}>{v.origen_nombre?.substring(0, 20)}</div>
                    <div className="font-exo text-[7px] truncate" style={{ color: "#c8e8ff" }}>{v.destino_nombre?.substring(0, 20)}</div>
                    <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{Math.round(v.km)}</div>
                    <div className="font-space text-[8px]" style={{ color: RC(v.rend) }}>{v.rend > 0 && v.rend < 10 ? v.rend.toFixed(2) : "--"}</div>
                    <div className="font-space text-[8px]" style={{ color: v.tarifa ? "#00ff88" : "#3a6080" }}>{v.tarifa ? fP(v.tarifa) : "--"}</div>
                    <div className="font-exo text-[7px]" style={{ color: v.tarifa ? "#00ff88" : "#ff6b35" }}>{v.tarifa ? "OK" : "SIN"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "ERR" && (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-2">
              {[
                { l: "CAMIONES", v: errData?.err?.camiones || 0, c: ACC },
                { l: "VIAJES", v: errData?.err?.viajes || 0, c: "#a855f7" },
                { l: "CRUZADOS", v: `${errData?.err?.viajes_cruzados || 0} (${errData?.err?.pct_cruzados || 0}%)`, c: "#00ff88" },
                { l: "KM TOTAL", v: fN(errData?.err?.km_total || 0), c: "#00d4ff" },
                { l: "KM/L", v: errData?.err?.rend_promedio || "--", c: RC(errData?.err?.rend_promedio) },
                { l: "INGRESO DÍA", v: fP(errData?.err?.ingreso_estimado || 0), c: "#00ff88" },
              ].map(k => (
                <div key={k.l} className="rounded-lg p-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>POR RUTA CONTRATO</div>
              {(errData?.por_ruta || []).map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid #0d203530" }}>
                  <div className="flex-1 font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{r.origen} → {r.destino}</div>
                  <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{r.viajes}v · {r.km}km</div>
                  <div className="font-space text-[9px] font-bold" style={{ color: "#00ff88" }}>{fP(r.tarifa * r.viajes)}</div>
                </div>
              ))}
              {(errData?.por_ruta || []).length === 0 && <div className="font-exo text-[9px] text-center py-4" style={{ color: "#3a6080" }}>Sin rutas cruzadas. Configura alias y tarifas primero.</div>}
            </div>

            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>POR CAMIÓN</div>
              <div className="space-y-1">
                {(errData?.por_camion || []).slice(0, 15).map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid #0d203520" }}>
                    <div className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</div>
                    <div className="font-exo text-[7px] flex-1 truncate" style={{ color: "#5a8090" }}>{c.conductor || "s/c"}</div>
                    <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{c.viajes}v · {c.km}km</div>
                    <div className="font-space text-[8px]" style={{ color: RC(parseFloat(c.rend)) }}>{c.rend || "--"}</div>
                    <div className="font-space text-[9px] font-bold" style={{ color: parseInt(c.ingreso) > 0 ? "#00ff88" : "#3a6080" }}>{fP(parseInt(c.ingreso))}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "RUTAS" && (
          <div className="space-y-3">
            <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: ACC }}>TOP RUTAS ÚLTIMOS 30 DÍAS (origen ≠ destino, km &gt; 5)</div>
            <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="grid grid-cols-7 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
                {["ORIGEN", "DESTINO", "VIAJES", "CAMIONES", "KM PROM", "KM/L", "ESTADO"].map(h => (
                  <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
                ))}
              </div>
              {(rutasTop?.rutas || []).map((r: any, i: number) => (
                <div key={i} className="grid grid-cols-7 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                  <div className="font-exo text-[8px] truncate" style={{ color: "#c8e8ff" }}>{r.origen_nombre}</div>
                  <div className="font-exo text-[8px] truncate" style={{ color: "#c8e8ff" }}>{r.destino_nombre}</div>
                  <div className="font-space text-[9px] font-bold" style={{ color: ACC }}>{r.viajes}</div>
                  <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{r.camiones}</div>
                  <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{r.km_promedio}</div>
                  <div className="font-space text-[8px]" style={{ color: RC(parseFloat(r.rend)) }}>{r.rend || "--"}</div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: r.tarifa ? "#00ff88" : r.o_c || r.d_c ? "#ffcc00" : "#ff2244" }} />
                    <span className="font-exo text-[7px]" style={{ color: r.tarifa ? "#00ff88" : "#ff6b35" }}>{r.tarifa ? fP(r.tarifa) : r.o_c || r.d_c ? "PARCIAL" : "SIN ALIAS"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "FLOTA" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: ACC }}>FLOTA ANGLO CARGAS VARIAS · {flotaData?.total || 0}/{flotaData?.contratados || 74}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { l: "OK", v: (flotaData?.camiones || []).filter((c: any) => c.estado === "OK").length, c: "#00ff88" },
                { l: "BAJO", v: (flotaData?.camiones || []).filter((c: any) => c.estado === "BAJO").length, c: "#ffcc00" },
                { l: "CRÍTICO", v: (flotaData?.camiones || []).filter((c: any) => c.estado === "CRITICO").length, c: "#ff2244" },
              ].map(k => (
                <div key={k.l} className="rounded-lg p-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[20px] font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{k.l}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="grid grid-cols-7 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
                {["PATENTE", "CONDUCTOR", "VIAJES", "KM MES", "KM PROY", "KM/L", "ESTADO"].map(h => (
                  <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
                ))}
              </div>
              <div style={{ maxHeight: 500, overflow: "auto" }}>
                {(flotaData?.camiones || []).map((c: any, i: number) => (
                  <div key={i} className="grid grid-cols-7 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                    <div className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</div>
                    <div className="font-exo text-[7px] truncate" style={{ color: "#5a8090" }}>{c.conductor || "s/c"}</div>
                    <div className="font-space text-[8px]" style={{ color: "#5a8090" }}>{c.viajes}</div>
                    <div className="font-space text-[8px]" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km_mes))}</div>
                    <div className="font-space text-[8px]" style={{ color: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244" }}>{fN(c.km_proyectado)}</div>
                    <div className="font-space text-[8px]" style={{ color: RC(parseFloat(c.rend)) }}>{c.rend || "--"}</div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244" }} />
                      <span className="font-exo text-[7px]" style={{ color: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244" }}>{c.pct_meta}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "AGENTE" && <AngloAgentePanel intelData={intelData} sinMapear={sinMapear} paramData={paramData} />}

        {tab === "TARIFAS" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: ACC }}>TARIFAS CONTRATO · {(tarifasData?.tarifas || []).length} rutas</div>
            </div>
            {(tarifasData?.tarifas || []).length === 0 ? (
              <div className="rounded-lg p-8 text-center" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: "#3a6080" }} />
                <div className="font-space text-[12px] font-bold mb-2" style={{ color: "#ffcc00" }}>SIN TARIFAS CARGADAS</div>
                <div className="font-exo text-[9px]" style={{ color: "#5a8090" }}>Sube el cuadro de tarifas origen-destino del contrato para activar la facturación inteligente.</div>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="grid grid-cols-4 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
                  {["ORIGEN", "DESTINO", "TARIFA", "CLASE"].map(h => (
                    <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
                  ))}
                </div>
                {(tarifasData?.tarifas || []).map((t: any, i: number) => (
                  <div key={i} className="grid grid-cols-4 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                    <div className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{t.origen}</div>
                    <div className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{t.destino}</div>
                    <div className="font-space text-[9px] font-bold" style={{ color: "#00ff88" }}>{fP(t.tarifa)}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#5a8090" }}>{t.clase || "--"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "REAJUSTE" && <ReajustePanel data={reajusteData} />}
      </div>
    </div>
  );
}

function AngloAgentePanel({ intelData, sinMapear, paramData }: any) {
  const [subTab, setSubTab] = useState<"INTELIGENCIA" | "ALIAS" | "SIN_MAPEAR" | "PARAMETROS">("INTELIGENCIA");
  const ACC = "#22c55e";
  const al = intelData?.alias || {};
  const bl = intelData?.billing || {};

  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-2">
        {(["INTELIGENCIA", "ALIAS", "SIN_MAPEAR", "PARAMETROS"] as const).map(st => (
          <button key={st} onClick={() => setSubTab(st)} className="px-3 py-1.5 rounded font-space text-[8px] font-bold tracking-wider cursor-pointer"
            style={{ background: subTab === st ? `${ACC}20` : "#060d14", color: subTab === st ? ACC : "#3a6080", border: `1px solid ${subTab === st ? `${ACC}40` : "#0d2035"}` }}>{st.replace("_", " ")}</button>
        ))}
      </div>

      {subTab === "INTELIGENCIA" && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: "VIAJES MES", v: bl.total || 0, c: "#a855f7" },
              { l: "CON TARIFA", v: bl.con_tarifa || 0, c: "#00ff88" },
              { l: "% COBERTURA", v: `${bl.pct || 0}%`, c: (bl.pct || 0) > 50 ? "#00ff88" : "#ffcc00" },
              { l: "INGRESO", v: `$${Math.round((bl.revenue || 0) / 1e6)}M`, c: "#00ff88" },
            ].map(k => (
              <div key={k.l} className="rounded-lg p-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-space text-[18px] font-bold" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: "ALIAS TOTAL", v: al.total || 0, c: ACC },
              { l: "CONFIRMADOS", v: al.confirmados || 0, c: "#00ff88" },
              { l: "AUTO GPS", v: al.auto_gps || 0, c: "#00d4ff" },
              { l: "MANUALES", v: al.manuales || 0, c: "#a855f7" },
            ].map(k => (
              <div key={k.l} className="rounded-lg p-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
          {intelData?.ultimo_reajuste && (
            <div className="rounded-lg p-3" style={{ background: "#060d14", border: `1px solid ${ACC}30` }}>
              <div className="font-space text-[9px] font-bold mb-1" style={{ color: ACC }}>ÚLTIMO REAJUSTE: {intelData.ultimo_reajuste.periodo}</div>
              <div className="flex gap-4">
                <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>FR Fijo: <b style={{ color: "#c8e8ff" }}>{intelData.ultimo_reajuste.fr_fijo?.toFixed(4)}</b></span>
                <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>FR Variable: <b style={{ color: "#c8e8ff" }}>{intelData.ultimo_reajuste.fr_variable?.toFixed(4)}</b></span>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === "ALIAS" && (
        <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="grid grid-cols-4 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
            {["GEOCERCA GPS", "NOMBRE CONTRATO", "CREADO POR", "ESTADO"].map(h => (
              <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
            ))}
          </div>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {(al.recientes || []).map((a: any, i: number) => (
              <div key={i} className="grid grid-cols-4 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                <div className="font-exo text-[8px] truncate" style={{ color: "#c8e8ff" }}>{a.geocerca_nombre}</div>
                <div className="font-exo text-[8px] truncate" style={{ color: ACC }}>{a.nombre_contrato}</div>
                <div className="font-exo text-[7px]" style={{ color: "#5a8090" }}>{a.creado_por}</div>
                <div className="font-exo text-[7px]" style={{ color: a.confirmado ? "#00ff88" : "#ffcc00" }}>{a.confirmado ? "CONFIRMADO" : "PENDIENTE"}</div>
              </div>
            ))}
            {(al.recientes || []).length === 0 && <div className="font-exo text-[9px] text-center py-4" style={{ color: "#3a6080" }}>Sin alias. Configura manualmente o activa el Super Agente.</div>}
          </div>
        </div>
      )}

      {subTab === "SIN_MAPEAR" && (
        <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="grid grid-cols-3 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
            {["GEOCERCA", "TIPO", "VIAJES"].map(h => (
              <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
            ))}
          </div>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {(intelData?.sin_mapear || sinMapear?.sin_mapear || []).map((s: any, i: number) => (
              <div key={i} className="grid grid-cols-3 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
                <div className="font-exo text-[8px] truncate" style={{ color: "#c8e8ff" }}>{s.nombre}</div>
                <div className="font-exo text-[7px]" style={{ color: s.tipo === "ORIGEN" ? "#00d4ff" : "#a855f7" }}>{s.tipo}</div>
                <div className="font-space text-[9px] font-bold" style={{ color: s.viajes > 5 ? "#ffcc00" : "#5a8090" }}>{s.viajes}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === "PARAMETROS" && (
        <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="grid grid-cols-4 gap-2 px-3 py-2" style={{ background: "#0a1218" }}>
            {["PARÁMETRO", "VALOR", "CATEGORÍA", "DESCRIPCIÓN"].map(h => (
              <div key={h} className="font-space text-[7px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
            ))}
          </div>
          {(paramData?.parametros || []).map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-4 gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #0d203520" }}>
              <div className="font-space text-[8px] font-bold" style={{ color: "#c8e8ff" }}>{p.nombre || p.clave}</div>
              <div className="font-space text-[9px] font-bold" style={{ color: ACC }}>{p.valor?.toLocaleString("es-CL")}</div>
              <div className="font-exo text-[7px]" style={{ color: "#5a8090" }}>{p.categoria}</div>
              <div className="font-exo text-[7px] truncate" style={{ color: "#3a6080" }}>{p.descripcion}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReajustePanel({ data }: { data: any }) {
  const ACC = "#22c55e";
  const [ipc1, setIpc1] = useState("");
  const [diesel1, setDiesel1] = useState("");
  const [dolar1, setDolar1] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const calcular = async () => {
    if (!periodo || !ipc1 || !diesel1 || !dolar1) return;
    setLoading(true);
    try {
      const r = await fetch("/api/anglo/reajuste/calcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, ipc1: parseFloat(ipc1), diesel1: parseFloat(diesel1), dolar1: parseFloat(dolar1) }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>FÓRMULA DE REAJUSTE</div>
          <div className="space-y-3">
            <div className="rounded p-3" style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px] uppercase mb-1" style={{ color: "#3a6080" }}>COSTO FIJO (Equipo + Admin)</div>
              <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>FR = 100% IPC</div>
              <div className="font-exo text-[7px] mt-1" style={{ color: "#5a8090" }}>Tarifa Reajustada = TB × (IPC₁ / IPC₀)</div>
            </div>
            <div className="rounded p-3" style={{ background: "#0a1218", border: `1px solid ${ACC}30` }}>
              <div className="font-exo text-[8px] uppercase mb-1" style={{ color: "#3a6080" }}>COSTO VARIABLE (Origen-Destino)</div>
              <div className="font-space text-[11px] font-bold" style={{ color: ACC }}>FR = 60% IPC + 30% DIESEL + 10% DÓLAR</div>
              <div className="font-exo text-[7px] mt-1" style={{ color: "#5a8090" }}>Cuatrimestral: Marzo · Julio · Noviembre</div>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {[
              { l: "IPC₀ (Nov 2022)", v: data?.bases?.ipc0 || 128.65 },
              { l: "Diesel₀ DIRPLAN (Nov 2022)", v: `$${(data?.bases?.diesel0 || 1025851.30).toLocaleString("es-CL")}` },
              { l: "Dólar₀ SII (Nov 2022)", v: `$${data?.bases?.dolar0 || 917.05}` },
            ].map(r => (
              <div key={r.l} className="flex justify-between py-0.5">
                <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{r.l}</span>
                <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: "#060d14", border: `1px solid ${ACC}30` }}>
          <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>
            <Calculator className="w-4 h-4 inline mr-1" />CALCULAR REAJUSTE
          </div>
          <div className="space-y-2">
            <div>
              <label className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Período</label>
              <input value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="Ej: Jul 2025"
                className="w-full px-2 py-1.5 rounded font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
            </div>
            <div>
              <label className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>IPC₁ (mes anterior al reajuste)</label>
              <input value={ipc1} onChange={e => setIpc1(e.target.value)} placeholder="Ej: 140.25" type="number" step="0.01"
                className="w-full px-2 py-1.5 rounded font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
            </div>
            <div>
              <label className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Diesel₁ DIRPLAN ($/lt)</label>
              <input value={diesel1} onChange={e => setDiesel1(e.target.value)} placeholder="Ej: 1120000" type="number"
                className="w-full px-2 py-1.5 rounded font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
            </div>
            <div>
              <label className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Dólar₁ SII Observado Prom</label>
              <input value={dolar1} onChange={e => setDolar1(e.target.value)} placeholder="Ej: 950.30" type="number" step="0.01"
                className="w-full px-2 py-1.5 rounded font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
            </div>
            <button onClick={calcular} disabled={loading} className="w-full py-2 rounded font-space text-[10px] font-bold tracking-wider cursor-pointer"
              style={{ background: `${ACC}20`, border: `1px solid ${ACC}`, color: ACC }}>{loading ? "Calculando..." : "CALCULAR FR"}</button>
          </div>

          {result && (
            <div className="mt-3 rounded p-3" style={{ background: "#0a1218", border: `1px solid ${ACC}40` }}>
              <div className="font-space text-[9px] font-bold mb-2" style={{ color: ACC }}>RESULTADO: {result.periodo}</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Var IPC</span><span className="font-space text-[9px] font-bold" style={{ color: result.variaciones.ipc > 0 ? "#ff6b35" : "#00ff88" }}>{result.variaciones.ipc > 0 ? "+" : ""}{result.variaciones.ipc}%</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Var Diesel</span><span className="font-space text-[9px] font-bold" style={{ color: result.variaciones.diesel > 0 ? "#ff6b35" : "#00ff88" }}>{result.variaciones.diesel > 0 ? "+" : ""}{result.variaciones.diesel}%</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Var Dólar</span><span className="font-space text-[9px] font-bold" style={{ color: result.variaciones.dolar > 0 ? "#ff6b35" : "#00ff88" }}>{result.variaciones.dolar > 0 ? "+" : ""}{result.variaciones.dolar}%</span></div>
                <div className="border-t mt-2 pt-2" style={{ borderColor: "#0d2035" }}>
                  <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>FR Fijo (100% IPC)</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{result.fr_fijo}</span></div>
                  <div className="flex justify-between mt-1"><span className="font-exo text-[8px]" style={{ color: ACC }}>FR Variable (60/30/10)</span><span className="font-space text-[11px] font-bold" style={{ color: ACC }}>{result.fr_variable}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
        <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: ACC }}>HISTORIAL DE REAJUSTES</div>
        {(data?.historial || []).length === 0 ? (
          <div className="font-exo text-[9px] text-center py-4" style={{ color: "#3a6080" }}>Sin reajustes calculados aún. Usa la calculadora para registrar el primer reajuste.</div>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-7 gap-2 px-2 py-1" style={{ background: "#0a1218" }}>
              {["PERÍODO", "FECHA", "IPC₁", "DIESEL₁", "DÓLAR₁", "FR FIJO", "FR VAR"].map(h => (
                <div key={h} className="font-space text-[7px] font-bold" style={{ color: "#3a6080" }}>{h}</div>
              ))}
            </div>
            {(data?.historial || []).map((r: any, i: number) => (
              <div key={i} className="grid grid-cols-7 gap-2 px-2 py-1" style={{ borderBottom: "1px solid #0d203520" }}>
                <div className="font-space text-[8px] font-bold" style={{ color: ACC }}>{r.periodo}</div>
                <div className="font-exo text-[7px]" style={{ color: "#5a8090" }}>{r.fecha_aplicacion?.slice(0, 10)}</div>
                <div className="font-space text-[8px]" style={{ color: "#c8e8ff" }}>{parseFloat(r.ipc1).toFixed(2)}</div>
                <div className="font-space text-[8px]" style={{ color: "#c8e8ff" }}>{Math.round(parseFloat(r.diesel1)).toLocaleString("es-CL")}</div>
                <div className="font-space text-[8px]" style={{ color: "#c8e8ff" }}>${parseFloat(r.dolar1).toFixed(2)}</div>
                <div className="font-space text-[8px] font-bold" style={{ color: "#c8e8ff" }}>{parseFloat(r.fr_fijo).toFixed(4)}</div>
                <div className="font-space text-[8px] font-bold" style={{ color: ACC }}>{parseFloat(r.fr_variable).toFixed(4)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
