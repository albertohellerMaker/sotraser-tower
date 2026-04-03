import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, Truck, MapPin, TrendingUp, BarChart3, Activity, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export default function OperativeBrain() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/brain/resumen-ejecutivo"],
    queryFn: () => fetch("/api/brain/resumen-ejecutivo").then(r => r.json()),
    refetchInterval: 5 * 60000,
  });

  const t = data?.totales || {};
  const contratos = data?.contratos || [];
  const tendencia = data?.tendencia_7d || [];

  const maxKm = Math.max(...tendencia.map((d: any) => parseInt(d.km || 0)), 1);

  return (
    <div className="min-h-screen p-4 space-y-4" style={{ background: "#020508" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5" style={{ color: "#a855f7" }} />
            <span className="font-space text-[16px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>RESUMEN EJECUTIVO</span>
          </div>
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            Multi-contrato · {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#a855f7" }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3">
            {[
              { icon: Activity, label: "GPS ACTIVOS", value: `${t.camiones_activos || 0}/${t.camiones_total || 0}`, color: "#00d4ff" },
              { icon: MapPin, label: "VIAJES HOY", value: t.viajes_hoy || 0, color: "#a855f7" },
              { icon: BarChart3, label: "VIAJES MES", value: (t.viajes_mes || 0).toLocaleString(), color: "#00ff88" },
              { icon: TrendingUp, label: "KM MES", value: (t.km_mes || 0).toLocaleString(), color: "#fbbf24" },
              { icon: Truck, label: "CONTRATOS", value: t.contratos_activos || 0, color: "#f97316" },
            ].map(k => (
              <div key={k.label} className="text-center p-4 rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.color}` }}>
                <k.icon className="w-4 h-4 mx-auto mb-2" style={{ color: k.color, opacity: 0.5 }} />
                <div className="font-space text-[22px] font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
                <div className="font-exo text-[7px] tracking-[0.12em] uppercase mt-2" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {tendencia.length > 1 && (
            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#a855f7" }}>ACTIVIDAD ÚLTIMOS 7 DÍAS</div>
              <div className="flex items-end gap-1" style={{ height: 80 }}>
                {tendencia.map((d: any, i: number) => {
                  const km = parseInt(d.km || 0);
                  const h = Math.max(4, (km / maxKm) * 70);
                  const dia = new Date(d.dia).toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
                  const isToday = i === tendencia.length - 1;
                  return (
                    <div key={d.dia} className="flex-1 flex flex-col items-center gap-1">
                      <span className="font-space text-[7px]" style={{ color: "#3a6080" }}>{parseInt(d.viajes)}</span>
                      <div className="w-full rounded-t" style={{
                        height: h,
                        background: isToday ? "linear-gradient(to top, #a855f7, #c084fc)" : "linear-gradient(to top, #0d2035, #1a3a55)",
                        border: isToday ? "1px solid #a855f7" : "1px solid #0d203580",
                      }} />
                      <span className="font-exo text-[6px] uppercase" style={{ color: isToday ? "#a855f7" : "#3a6080" }}>{dia}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>viajes/día</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>
                  Promedio: {Math.round(tendencia.reduce((s: number, d: any) => s + parseInt(d.viajes || 0), 0) / tendencia.length)} viajes · {Math.round(tendencia.reduce((s: number, d: any) => s + parseInt(d.km || 0), 0) / tendencia.length).toLocaleString()} km/día
                </span>
              </div>
            </div>
          )}

          <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
              <span className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#a855f7" }}>CONTRATOS ACTIVOS</span>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ background: "#0d2035" }}>
                  {["CONTRATO", "CAM", "HOY", "SEMANA", "MES", "KM TOTAL", "KM PROM", "FACTURACIÓN"].map(h => (
                    <th key={h} className="font-exo text-[7px] tracking-wider font-bold text-left px-3 py-2" style={{ color: "#a855f7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contratos.map((c: any, i: number) => {
                  const trendPrev = tendencia.length >= 2 ? parseInt(tendencia[tendencia.length - 2]?.viajes || 0) : 0;
                  const trendCurr = parseInt(c.viajes_hoy || 0);

                  return (
                    <tr key={c.contrato} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                      <td className="px-3 py-2">
                        <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.contrato}</span>
                      </td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.camiones}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-space text-[10px] font-bold" style={{ color: c.viajes_hoy > 0 ? "#00ff88" : "#3a6080" }}>{c.viajes_hoy}</span>
                        </div>
                      </td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.viajes_semana}</td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.viajes_mes}</td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{(c.km_total || 0).toLocaleString()}</td>
                      <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.km_prom}</td>
                      <td className="px-3 py-2">
                        {c.billing ? (
                          <div className="flex items-center gap-2">
                            <span className="font-space text-[10px] font-bold" style={{ color: c.billing.facturables > 0 ? "#00ff88" : "#ffcc00" }}>
                              {c.billing.facturables}/{c.billing.total}
                            </span>
                            {c.billing.monto > 0 && (
                              <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#00ff88", background: "#00ff8810" }}>
                                ${(c.billing.monto / 1000000).toFixed(1)}M
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-exo text-[8px]" style={{ color: "#3a608060" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-4 py-2 flex justify-between" style={{ background: "#0a1520", borderTop: "1px solid #0d2035" }}>
              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                {contratos.length} contratos · {contratos.reduce((s: number, c: any) => s + c.camiones, 0)} camiones
              </span>
              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                {(contratos.reduce((s: number, c: any) => s + c.km_total, 0)).toLocaleString()} km totales este mes
              </span>
            </div>
          </div>

          {contratos.filter((c: any) => c.billing).length > 0 && (
            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #00ff8830" }}>
              <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#00ff88" }}>FACTURACIÓN T-1</div>
              <div className="grid grid-cols-2 gap-3">
                {contratos.filter((c: any) => c.billing).map((c: any) => {
                  const pct = c.billing.total > 0 ? Math.round(c.billing.facturables / c.billing.total * 100) : 0;
                  const pctColor = pct >= 90 ? "#00ff88" : pct >= 70 ? "#fbbf24" : pct >= 50 ? "#f97316" : "#ff2244";
                  return (
                    <div key={c.contrato} className="p-3 rounded-lg" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.contrato}</span>
                        <span className="font-space text-[14px] font-bold" style={{ color: pctColor }}>{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pctColor }} />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.billing.facturables} de {c.billing.total} viajes</span>
                        {c.billing.monto > 0 && (
                          <span className="font-exo text-[8px] font-bold" style={{ color: "#00ff88" }}>${(c.billing.monto).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
