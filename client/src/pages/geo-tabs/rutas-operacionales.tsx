import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

const CYAN = "#00d4ff";
const SUCCESS = "#00ff88";
const WARNING = "#ffcc00";
const ERROR = "#ff2244";
const TEXT_DIM = "#3a6080";
const BORDER = "#0d2035";

const CC: Record<string, string> = {
  "ANGLO-COCU": "#00ff88", "ANGLO-CAL": "#ff6b35",
  "ANGLO-CARGAS VARIAS": "#00d4ff",
};

export default function RutasOperacionales() {
  const [contrato, setContrato] = useState("ANGLO-COCU");
  const [expandido, setExpandido] = useState<number | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/rutas/corredores-operacionales", contrato],
    queryFn: () => fetch(`/api/rutas/corredores-operacionales?contrato=${contrato}`).then(r => r.json()),
    refetchInterval: 5 * 60 * 1000,
  });

  const corredores = data?.corredores || [];

  return (
    <div data-testid="geo-rutas-operacionales">
      {/* Filtro contrato */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {["ANGLO-COCU", "ANGLO-CAL", "ANGLO-CARGAS VARIAS", "TODOS"].map(c => (
            <button key={c} onClick={() => setContrato(c)}
              className="font-exo text-[11px] font-bold px-3 py-1.5 cursor-pointer transition-all"
              style={{
                border: `1px solid ${contrato === c ? CC[c] || CYAN : BORDER}`,
                color: contrato === c ? CC[c] || CYAN : TEXT_DIM,
                background: contrato === c ? `${CC[c] || CYAN}08` : "transparent",
              }}>
              {c === "ANGLO-CARGAS VARIAS" ? "ANGLO-CV" : c}
            </button>
          ))}
        </div>
        <span className="font-exo text-[11px]" style={{ color: TEXT_DIM }}>
          {data?.total_corredores || 0} rutas identificadas
        </span>
      </div>

      {/* KPIs + Meta */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="p-3 text-center" style={{ background: "#060d14", border: `1px solid ${BORDER}` }}>
          <div className="font-space text-[22px] font-bold" style={{ color: CYAN }}>{data?.total_corredores || 0}</div>
          <div className="font-exo text-xs uppercase tracking-wider" style={{ color: TEXT_DIM }}>Rutas</div>
        </div>
        {false ? (
          <MetaKmWidget contrato="" />
        ) : (
          <>
            <div className="p-3 text-center" style={{ background: "#060d14", border: `1px solid ${BORDER}` }}>
              <div className="font-space text-[22px] font-bold" style={{ color: "#c8e8ff" }}>
                {corredores.reduce((s: number, c: any) => s + (c.total_viajes || 0), 0)}
              </div>
              <div className="font-exo text-xs uppercase tracking-wider" style={{ color: TEXT_DIM }}>Viajes</div>
            </div>
            <div className="p-3 text-center" style={{ background: "#060d14", border: `1px solid ${BORDER}` }}>
              <div className="font-space text-[22px] font-bold" style={{ color: SUCCESS }}>
                {corredores.length > 0 ? (corredores.reduce((s: number, c: any) => s + (c.rendimiento_promedio || 0), 0) / corredores.filter((c: any) => c.rendimiento_promedio).length).toFixed(2) : "--"}
              </div>
              <div className="font-exo text-xs uppercase tracking-wider" style={{ color: TEXT_DIM }}>km/L prom</div>
            </div>
          </>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: TEXT_DIM }} /></div>
      )}

      {/* Tabla corredores */}
      {!isLoading && (
        <div style={{ background: "#091018", border: `1px solid ${BORDER}` }}>
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <span className="col-span-4 font-exo text-xs tracking-wider uppercase" style={{ color: TEXT_DIM }}>RUTA</span>
            <span className="col-span-2 font-exo text-xs tracking-wider uppercase" style={{ color: TEXT_DIM }}>CONTRATO</span>
            <span className="col-span-1 font-exo text-xs tracking-wider uppercase text-right" style={{ color: TEXT_DIM }}>VIAJES</span>
            <span className="col-span-1 font-exo text-xs tracking-wider uppercase text-right" style={{ color: TEXT_DIM }}>KM/L</span>
            <span className="col-span-1 font-exo text-xs tracking-wider uppercase text-right" style={{ color: SUCCESS }}>MEJOR</span>
            <span className="col-span-1 font-exo text-xs tracking-wider uppercase text-right" style={{ color: ERROR }}>PEOR</span>
            <span className="col-span-2 font-exo text-xs tracking-wider uppercase text-right" style={{ color: TEXT_DIM }}>CAMIONES</span>
          </div>

          {/* Filas */}
          <div className="overflow-y-auto" style={{ maxHeight: 500 }}>
            {corredores.map((c: any) => {
              const cc = CC[c.contrato] || CYAN;
              const isExp = expandido === c.id;
              const rendColor = c.rendimiento_promedio >= 2.5 ? SUCCESS : c.rendimiento_promedio > 0 ? WARNING : TEXT_DIM;
              return (
                <div key={c.id}>
                  {/* Row */}
                  <div className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 cursor-pointer hover:bg-[#0a1929] transition-all"
                    style={{ borderBottom: `1px solid ${BORDER}20` }}
                    onClick={() => setExpandido(isExp ? null : c.id)}>
                    <div className="col-span-4">
                      <div className="font-exo text-xs truncate" style={{ color: "#c8e8ff" }}>
                        {c.nombre || `${c.origen_nombre || "?"} → ${c.destino_nombre || "?"}`}
                      </div>
                      <div className="font-exo text-xs" style={{ color: TEXT_DIM }}>
                        {c.distancia_promedio_km ? `${Math.round(c.distancia_promedio_km)} km prom` : ""}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="font-exo text-xs px-1.5 py-0.5" style={{ color: cc, border: `1px solid ${cc}25` }}>{c.contrato}</span>
                    </div>
                    <div className="col-span-1 text-right font-space text-[11px] font-bold" style={{ color: CYAN }}>{c.total_viajes}</div>
                    <div className="col-span-1 text-right font-space text-[11px] font-bold" style={{ color: rendColor }}>
                      {c.rendimiento_promedio ? c.rendimiento_promedio.toFixed(2) : "--"}
                    </div>
                    <div className="col-span-1 text-right font-space text-xs" style={{ color: SUCCESS }}>
                      {c.rendimiento_mejor ? c.rendimiento_mejor.toFixed(2) : "--"}
                    </div>
                    <div className="col-span-1 text-right font-space text-xs" style={{ color: ERROR }}>
                      {c.rendimiento_peor ? c.rendimiento_peor.toFixed(2) : "--"}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className="font-space text-xs" style={{ color: TEXT_DIM }}>{c.camiones?.length || c.total_camiones || 0}</span>
                      {isExp ? <ChevronUp className="w-3 h-3" style={{ color: TEXT_DIM }} /> : <ChevronDown className="w-3 h-3" style={{ color: TEXT_DIM }} />}
                    </div>
                  </div>

                  {/* Expanded: comparativa camiones */}
                  {isExp && c.camiones && c.camiones.length > 0 && (
                    <div className="px-4 py-3" style={{ background: "#060d14", borderBottom: `1px solid ${BORDER}30` }}>
                      <div className="font-exo text-xs tracking-wider uppercase mb-2" style={{ color: TEXT_DIM }}>
                        COMPARATIVA DE CAMIONES EN ESTA RUTA
                      </div>
                      <div className="space-y-1">
                        {c.camiones.map((cam: any, i: number) => {
                          const esMejor = i === 0;
                          const esPeor = i === c.camiones.length - 1 && c.camiones.length > 1;
                          const rendCam = parseFloat(cam.rend_promedio || "0");
                          return (
                            <div key={cam.patente} className="flex items-center justify-between px-3 py-2"
                              style={{
                                background: esMejor ? "rgba(0,255,136,0.04)" : esPeor ? "rgba(255,34,68,0.04)" : "#0a1520",
                                borderLeft: `2px solid ${esMejor ? SUCCESS : esPeor ? ERROR : BORDER}`,
                              }}>
                              <div className="flex items-center gap-3">
                                {esMejor && <span className="text-[12px]">🏆</span>}
                                <span className="font-space text-[11px] font-bold" style={{ color: CYAN }}>{cam.patente}</span>
                                <span className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{cam.conductor || "--"}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="font-space text-[13px] font-bold"
                                    style={{ color: esMejor ? SUCCESS : esPeor ? ERROR : WARNING }}>
                                    {rendCam > 0 ? `${rendCam.toFixed(2)} km/L` : "--"}
                                  </div>
                                  <div className="font-exo text-xs" style={{ color: TEXT_DIM }}>
                                    {cam.viajes} viajes · {Math.round(parseFloat(cam.km_total || "0")).toLocaleString()} km
                                  </div>
                                </div>
                                {false && (
                                  <ProyeccionMini patente={cam.patente} contrato="" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Brecha */}
                      {c.rendimiento_mejor && c.rendimiento_peor && c.rendimiento_peor > 0 && c.camiones.length >= 2 && (
                        <div className="mt-2 px-3 py-2" style={{ background: "#0a1520" }}>
                          <span className="font-exo text-[11px]" style={{ color: TEXT_DIM }}>Brecha mejor vs peor: </span>
                          <span className="font-space text-[11px] font-bold" style={{ color: WARNING }}>
                            {((c.rendimiento_mejor - c.rendimiento_peor) / c.rendimiento_peor * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {corredores.length === 0 && !isLoading && (
              <div className="text-center py-12 font-exo text-[11px]" style={{ color: TEXT_DIM }}>
                Sin corredores para este contrato
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Widget Meta km Cencosud ── */
function MetaKmWidget({ contrato }: { contrato: string }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/rutas/meta-flota", contrato],
    queryFn: () => fetch(`/api/rutas/meta-flota?contrato=${contrato}`).then(r => r.json()),
    refetchInterval: 60000,
  });

  if (!data || data.estado === "SIN_META") return (
    <div className="p-3 text-center col-span-2" style={{ background: "#060d14", border: `1px solid ${BORDER}` }}>
      <div className="font-exo text-[11px]" style={{ color: TEXT_DIM }}>Sin meta configurada</div>
    </div>
  );

  const pct = data.km_meta_total > 0 ? Math.round((data.km_actual_total / data.km_meta_total) * 100) : 0;
  const color = pct >= 90 ? SUCCESS : pct >= 70 ? WARNING : ERROR;

  return (
    <div className="p-3 col-span-2" style={{ background: "#060d14", border: `1px solid ${color}20`, borderTop: `2px solid ${color}` }}>
      <div className="font-exo text-xs tracking-wider uppercase mb-1.5" style={{ color: TEXT_DIM }}>
        META MENSUAL CENCOSUD · dia {data.dia_actual}/{data.dias_mes}
      </div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="font-space text-[22px] font-bold" style={{ color }}>{(data.km_actual_total / 1000).toFixed(0)}k</span>
        <span className="font-exo text-xs" style={{ color: TEXT_DIM }}>/ {(data.km_meta_total / 1000).toFixed(0)}k km</span>
        <span className="font-space text-[14px] font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full mb-1.5" style={{ background: BORDER }}>
        <div className="h-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <div className="font-exo text-[11px]" style={{ color: data.proyeccion_cumple ? SUCCESS : ERROR }}>
        {data.proyeccion_cumple
          ? `Proyeccion: ${(data.proyeccion_total / 1000).toFixed(0)}k km`
          : `Proyeccion: ${(data.proyeccion_total / 1000).toFixed(0)}k km · faltan ${data.km_diarios_necesarios} km/dia`}
      </div>
      <div className="font-exo text-xs mt-0.5" style={{ color: TEXT_DIM }}>{data.camiones_activos} camiones activos</div>
    </div>
  );
}

/* ── Mini proyección por camión ── */
function ProyeccionMini({ patente, contrato }: { patente: string; contrato: string }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/rutas/proyeccion-meta", patente, contrato],
    queryFn: () => fetch(`/api/rutas/proyeccion-meta?patente=${patente}&contrato=${contrato}`).then(r => r.json()),
    refetchInterval: 300000,
  });

  if (!data || data.estado === "SIN_META") return null;

  const color = data.estado === "CUMPLIRA" ? SUCCESS : data.estado === "EN_RIESGO" ? WARNING : ERROR;

  return (
    <div className="text-right">
      <div className="font-space text-xs font-bold" style={{ color }}>
        {(data.km_actual / 1000).toFixed(1)}k/{(data.km_meta / 1000).toFixed(0)}k
      </div>
      <div className="font-exo text-[7px]" style={{ color }}>
        {data.estado === "CUMPLIRA" ? "OK" : data.estado === "EN_RIESGO" ? "Riesgo" : "No cumple"}
      </div>
    </div>
  );
}
