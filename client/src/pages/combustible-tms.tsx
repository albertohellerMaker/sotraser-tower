import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fuel, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Shield, X } from "lucide-react";

const RC = (r: string) => r === "OK" ? "#00ff88" : r === "SOSPECHOSO" ? "#ffcc00" : r?.includes("FRAUDE") ? "#ff2244" : r === "CARGA_SIN_SUBIDA" ? "#a855f7" : "#3a6080";
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");

type Vista = "RESUMEN" | "CARGAS" | "RANKING" | "ADN";

export default function CombustibleTMS() {
  const [vista, setVista] = useState<Vista>("RESUMEN");
  const [contrato, setContrato] = useState("TODOS");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [selPatente, setSelPatente] = useState<string | null>(null);

  const { data: resumen } = useQuery<any>({ queryKey: ["/api/combustible/resumen", contrato], queryFn: () => fetch(`/api/combustible/resumen?contrato=${contrato}`).then(r => r.json()), enabled: vista === "RESUMEN", staleTime: 300000 });
  const { data: cargasDia } = useQuery<any>({ queryKey: ["/api/combustible/cargas-dia", fecha, contrato], queryFn: () => fetch(`/api/combustible/cargas-dia?fecha=${fecha}&contrato=${contrato}`).then(r => r.json()), enabled: vista === "CARGAS" });
  const { data: ranking } = useQuery<any>({ queryKey: ["/api/combustible/ranking-camiones", contrato], queryFn: () => fetch(`/api/combustible/ranking-camiones?contrato=${contrato}`).then(r => r.json()), enabled: vista === "RANKING" });
  const { data: adnData } = useQuery<any>({ queryKey: ["/api/combustible/adn", selPatente], queryFn: () => fetch(`/api/combustible/adn/${selPatente}`).then(r => r.json()), enabled: vista === "ADN" && !!selPatente });

  const cambiarFecha = (d: number) => { const dt = new Date(fecha); dt.setDate(dt.getDate() + d); setFecha(dt.toISOString().slice(0, 10)); };
  const stats = resumen?.stats || {};

  return (
    <div style={{ background: "#020508" }}>
      {/* KPIs */}
      <div className="grid grid-cols-6 gap-0 border-b" style={{ borderColor: "#0d2035" }}>
        {[
          { l: "VALIDADAS", v: stats.total || 0, c: "#c8e8ff" },
          { l: "OK", v: stats.ok || 0, c: "#00ff88" },
          { l: "SOSPECHOSAS", v: stats.sospechosos || 0, c: "#ffcc00" },
          { l: "FRAUDE", v: stats.fraudes || 0, c: "#ff2244" },
          { l: "SIN SUBIDA", v: stats.sin_subida || 0, c: "#a855f7" },
          { l: "LT SOSPECH.", v: stats.litros_sospechosos || 0, c: "#ff6b35" },
        ].map(k => (
          <div key={k.l} className="px-4 py-3 text-center" style={{ background: "#060d14", borderRight: "1px solid #0d2035" }}>
            <div className="font-space text-[20px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b" style={{ borderColor: "#0d2035", background: "#0a1218" }}>
        <div className="flex gap-0">
          {(["RESUMEN", "CARGAS", "RANKING", "ADN"] as Vista[]).map(v => (
            <button key={v} onClick={() => setVista(v)} className="px-4 py-2 font-space text-[9px] font-bold tracking-[0.15em] cursor-pointer"
              style={{ color: vista === v ? "#ff6b35" : "#3a6080", borderBottom: vista === v ? "2px solid #ff6b35" : "2px solid transparent", background: vista === v ? "#ff6b3508" : "transparent" }}>{v}</button>
          ))}
        </div>
        {vista === "CARGAS" && (
          <div className="flex items-center gap-2">
            <button onClick={() => cambiarFecha(-1)} className="p-1 cursor-pointer" style={{ color: "#3a6080" }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-exo text-[11px] font-bold w-32 text-center" style={{ color: "#c8e8ff" }}>{new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}</span>
            <button onClick={() => cambiarFecha(1)} disabled={fecha >= new Date().toISOString().slice(0, 10)} className="p-1 cursor-pointer disabled:opacity-30" style={{ color: "#3a6080" }}><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
        {vista === "ADN" && (
          <input value={selPatente || ""} onChange={e => setSelPatente(e.target.value.toUpperCase())} placeholder="Patente..." className="px-3 py-1.5 font-space text-[11px] outline-none w-40" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff" }} />
        )}
      </div>

      {/* Content */}
      <div className="overflow-auto" style={{ height: "calc(100vh - 190px)" }}>

        {/* RESUMEN */}
        {vista === "RESUMEN" && (
          <div className="p-4 space-y-3">
            {(resumen?.alertas || []).length === 0 && <div className="text-center py-12 font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin alertas de combustible activas</div>}
            {(resumen?.alertas || []).map((a: any, i: number) => (
              <div key={a.id || i} className="p-4" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: `4px solid ${RC(a.resultado)}`, borderRadius: "0 8px 8px 0" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-exo text-[8px] font-bold px-2 py-1" style={{ color: RC(a.resultado), background: `${RC(a.resultado)}15`, borderRadius: 4 }}>{a.resultado?.replace(/_/g, " ")}</span>
                    <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{a.contrato}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-space text-[16px] font-bold" style={{ color: "#ff2244" }}>{a.litros_diferencia > 0 ? "+" : ""}{Math.round(a.litros_diferencia || 0)}L</span>
                    {a.diferencia_pct && <span className="font-exo text-[9px] ml-2" style={{ color: "#3a6080" }}>{Math.round(a.diferencia_pct)}%</span>}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>DECLARADO</div><div className="font-space text-[12px]" style={{ color: "#c8e8ff" }}>{a.litros_declarados}L</div></div>
                  <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>ECU CONFIRMA</div><div className="font-space text-[12px]" style={{ color: a.litros_confirmados_ecu ? "#00ff88" : "#3a6080" }}>{a.litros_confirmados_ecu ? Math.round(a.litros_confirmados_ecu) + "L" : "--"}</div></div>
                  <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>NIVEL</div><div className="font-space text-[12px]" style={{ color: "#c8e8ff" }}>{a.nivel_antes_pct ? `${Math.round(a.nivel_antes_pct)}% → ${Math.round(a.nivel_despues_pct)}%` : "--"}</div></div>
                  <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>ESTACIÓN</div><div className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{a.estacion?.substring(0, 20) || "--"}</div></div>
                  <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>CONDUCTOR</div><div className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{a.conductor || "--"}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CARGAS DEL DIA */}
        {vista === "CARGAS" && (
          <div className="flex-1 overflow-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead className="sticky top-0 z-10"><tr style={{ background: "#0a1520", borderBottom: "2px solid #0d2035" }}>
                {["HORA", "CAMIÓN", "CONTRATO", "LITROS", "ECU", "DELTA", "NIVEL", "ESTACIÓN", "RESULTADO"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(cargasDia?.cargas || []).map((c: any, i: number) => (
                  <tr key={c.id || i} style={{ height: 38, background: i % 2 === 0 ? "#060d14" : "#070e16", borderBottom: "1px solid #0a1825", borderLeft: `3px solid ${RC(c.resultado)}` }}>
                    <td className="px-3 py-1 font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{c.fecha?.substring(11, 16)}</td>
                    <td className="px-3 py-1 font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                    <td className="px-3 py-1 font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.contrato?.substring(0, 12)}</td>
                    <td className="px-3 py-1 font-space text-[11px]" style={{ color: "#c8e8ff" }}>{Math.round(c.litros)}L</td>
                    <td className="px-3 py-1 font-space text-[11px]" style={{ color: c.litros_confirmados_ecu ? "#00ff88" : "#3a6080" }}>{c.litros_confirmados_ecu ? Math.round(c.litros_confirmados_ecu) + "L" : "--"}</td>
                    <td className="px-3 py-1 font-space text-[11px] font-bold" style={{ color: c.diferencia_pct > 15 ? "#ff2244" : c.diferencia_pct > 5 ? "#ffcc00" : "#00ff88" }}>{c.diferencia_pct != null ? `${c.diferencia_pct}%` : "--"}</td>
                    <td className="px-3 py-1 font-exo text-[10px]" style={{ color: "#3a6080" }}>{c.nivel_antes_pct ? `${Math.round(c.nivel_antes_pct)}→${Math.round(c.nivel_despues_pct)}%` : "--"}</td>
                    <td className="px-3 py-1 font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.estacion?.substring(0, 18)}</td>
                    <td className="px-3 py-1"><span className="font-exo text-[8px] font-bold px-1.5 py-0.5" style={{ color: RC(c.resultado), background: `${RC(c.resultado)}15`, borderRadius: 3 }}>{c.resultado?.replace(/_/g, " ") || "PENDIENTE"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(cargasDia?.cargas || []).length === 0 && <div className="text-center py-12 font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin cargas para este día</div>}
          </div>
        )}

        {/* RANKING */}
        {vista === "RANKING" && (
          <div className="p-4 space-y-1">
            {(ranking?.camiones || []).map((c: any, i: number) => {
              const pctOk = c.total > 0 ? Math.round((c.ok / c.total) * 100) : 0;
              return (
                <div key={c.patente} onClick={() => { setSelPatente(c.patente); setVista("ADN"); }}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]"
                  style={{ background: i % 2 === 0 ? "#060d14" : "#070e16", borderLeft: `3px solid ${c.alertas > 0 ? "#ff2244" : "#00ff88"}`, borderRadius: 4 }}>
                  <span className="font-space text-[13px] font-bold w-20" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                  <span className="font-exo text-[8px] w-24" style={{ color: "#3a6080" }}>{c.contrato?.substring(0, 14)}</span>
                  <div className="flex-1 h-2" style={{ background: "#0d2035", borderRadius: 3 }}>
                    <div className="h-full" style={{ width: `${pctOk}%`, background: pctOk >= 90 ? "#00ff88" : pctOk >= 70 ? "#ffcc00" : "#ff2244", borderRadius: 3 }} />
                  </div>
                  <span className="font-space text-[12px] font-bold w-12 text-right" style={{ color: pctOk >= 90 ? "#00ff88" : pctOk >= 70 ? "#ffcc00" : "#ff2244" }}>{pctOk}%</span>
                  <span className="font-exo text-[9px] w-20 text-right" style={{ color: "#3a6080" }}>{c.total} cargas</span>
                  <span className="font-exo text-[9px] w-20 text-right" style={{ color: c.alertas > 0 ? "#ff2244" : "#3a6080" }}>{c.alertas} alertas</span>
                  {c.litros_sosp > 0 && <span className="font-space text-[10px] font-bold" style={{ color: "#ff6b35" }}>{c.litros_sosp}L</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* ADN */}
        {vista === "ADN" && (
          <div className="p-4 space-y-4">
            {!selPatente && <div className="text-center py-12 font-exo text-[11px]" style={{ color: "#3a6080" }}>Ingresa una patente arriba para ver su ADN de combustible</div>}
            {selPatente && adnData?.adn && (
              <div>
                <div className="p-4 mb-4" style={{ background: "#060d14", border: "1px solid #ff6b3530", borderTop: "3px solid #ff6b35", borderRadius: 8 }}>
                  <div className="font-space text-[16px] font-bold mb-3" style={{ color: "#ff6b35" }}>{selPatente} · ADN COMBUSTIBLE</div>
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      { l: "RENDIMIENTO", v: adnData.adn.rend_promedio ? `${adnData.adn.rend_promedio} km/L` : "--", c: "#00ff88" },
                      { l: "DESVIACIÓN", v: adnData.adn.rend_desviacion ? `±${adnData.adn.rend_desviacion}` : "--" },
                      { l: "ESTANQUE EST.", v: adnData.adn.estanque_estimado_litros ? `${adnData.adn.estanque_estimado_litros}L` : "--" },
                      { l: "KM ENTRE CARGAS", v: adnData.adn.km_entre_cargas_promedio ? `${adnData.adn.km_entre_cargas_promedio}km` : "--" },
                      { l: "CONFIANZA", v: adnData.adn.confianza || "--", c: adnData.adn.confianza === "ALTA" ? "#00ff88" : adnData.adn.confianza === "MEDIA" ? "#ffcc00" : "#3a6080" },
                    ].map(k => (
                      <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", borderRadius: 6 }}>
                        <div className="font-space text-[14px] font-bold" style={{ color: (k as any).c || "#c8e8ff" }}>{k.v}</div>
                        <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 font-exo text-[9px]" style={{ color: "#3a6080" }}>
                    Rango normal: {adnData.adn.rend_minimo_normal?.toFixed(2)} — {adnData.adn.rend_maximo_normal?.toFixed(2)} km/L · {adnData.adn.n_periodos_aprendizaje} períodos analizados
                  </div>
                </div>
                <div className="font-exo text-[9px] font-bold tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>HISTORIAL DE CARGAS</div>
                <div className="space-y-1">
                  {(adnData?.historial || []).map((h: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2" style={{ background: i % 2 === 0 ? "#060d14" : "#070e16", borderLeft: `3px solid ${RC(h.resultado)}`, borderRadius: 4 }}>
                      <span className="font-exo text-[10px] w-28" style={{ color: "#c8e8ff" }}>{h.fecha?.substring(0, 16)}</span>
                      <span className="font-space text-[11px] w-16" style={{ color: "#c8e8ff" }}>{Math.round(h.litros_declarados || 0)}L</span>
                      <span className="font-space text-[11px] w-16" style={{ color: h.litros_confirmados_ecu ? "#00ff88" : "#3a6080" }}>{h.litros_confirmados_ecu ? Math.round(h.litros_confirmados_ecu) + "L" : "--"}</span>
                      <span className="font-exo text-[10px] w-20" style={{ color: "#3a6080" }}>{h.nivel_antes_pct ? `${Math.round(h.nivel_antes_pct)}→${Math.round(h.nivel_despues_pct)}%` : "--"}</span>
                      <span className="font-exo text-[9px] flex-1" style={{ color: "#3a6080" }}>{h.estacion?.substring(0, 25)}</span>
                      <span className="font-exo text-[8px] font-bold px-1.5 py-0.5" style={{ color: RC(h.resultado), background: `${RC(h.resultado)}15`, borderRadius: 3 }}>{h.resultado?.replace(/_/g, " ") || "PENDIENTE"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selPatente && !adnData?.adn && <div className="text-center py-12 font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin ADN para {selPatente} — necesita más períodos de operación</div>}
          </div>
        )}
      </div>
    </div>
  );
}
