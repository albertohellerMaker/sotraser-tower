import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Route, Activity, Gauge, Zap, Clock, X, MapPin, Map as MapIcon } from "lucide-react";
import MapaCamionMes from "./mapa-camion-mes";

const CONTRATOS = [
  { id: "TODOS", label: "TODOS", color: "#c8e8ff" },
  { id: "CENCOSUD", label: "CENCOSUD", color: "#00d4ff" },
  { id: "ANGLO-COCU", label: "ANGLO-COCU", color: "#00ff88" },
  { id: "ANGLO-CAL", label: "ANGLO-CAL", color: "#ffcc00" },
  { id: "ANGLO-CARGAS VARIAS", label: "A-CARGAS VAR", color: "#ff6b35" },
];

const ESTADO_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  ALERTA: { label: "ALERTA", color: "#ff2244", order: 0 },
  SIN_SENAL: { label: "SIN SENAL", color: "#ff2244", order: 1 },
  DETENIDO: { label: "DETENIDO", color: "#ffcc00", order: 2 },
  EN_RUTA: { label: "EN RUTA", color: "#00ff88", order: 3 },
  INACTIVO: { label: "INACTIVO", color: "#3a6080", order: 4 },
};

export default function Contratos({ initialContrato, initialPatente }: { initialContrato?: string; initialPatente?: string }) {
  const [contrato, setContrato] = useState(initialContrato || "TODOS");
  const [panelPatente, setPanelPatente] = useState<string | null>(initialPatente || null);
  const [mapaPatente, setMapaPatente] = useState<string | null>(null);

  useEffect(() => {
    if (initialPatente) setPanelPatente(initialPatente);
  }, [initialPatente]);

  const results = useQuery<any>({
    queryKey: ["/api/cerebro/contrato", contrato],
    queryFn: async () => {
      if (contrato === "TODOS") {
        const all = await Promise.all(
          CONTRATOS.filter(c => c.id !== "TODOS").map(c =>
            fetch(`/api/cerebro/contrato/${encodeURIComponent(c.id)}`).then(r => r.json())
          )
        );
        const camiones = all.flatMap(r => r.camiones?.map((c: any) => ({ ...c, contrato: r.contrato })) || []);
        const rutasTodas = all.flatMap(r => r.rutas_frecuentes?.map((rt: any) => ({ ...rt, contrato: r.contrato })) || []);
        return {
          contrato: "TODOS",
          camiones,
          kpis: {
            total: camiones.length,
            activos: camiones.filter((c: any) => c.estado === "EN_RUTA" || c.estado === "DETENIDO").length,
            km_hoy: camiones.reduce((s: number, c: any) => s + (c.km_hoy || 0), 0),
            rendimiento: null,
            alertas: camiones.filter((c: any) => c.estado === "SIN_SENAL").length,
          },
          rutas_frecuentes: rutasTodas,
        };
      }
      const r = await fetch(`/api/cerebro/contrato/${encodeURIComponent(contrato)}`);
      return r.json();
    },
    refetchInterval: 120000,
  });

  const data = results.data;
  const isLoading = results.isLoading;

  const camiones = useMemo(() => {
    if (!data?.camiones) return [];
    return [...data.camiones].sort((a: any, b: any) => {
      const oa = ESTADO_CONFIG[a.estado]?.order ?? 5;
      const ob = ESTADO_CONFIG[b.estado]?.order ?? 5;
      if (oa !== ob) return oa - ob;
      return (b.km_hoy || 0) - (a.km_hoy || 0);
    });
  }, [data?.camiones]);

  const kpis = data?.kpis || {};
  const cc = CONTRATOS.find(c => c.id === contrato)?.color || "#c8e8ff";
  const panelCamion = panelPatente ? camiones.find((c: any) => c.patente === panelPatente) : null;

  const kpiItems = [
    { label: "ACTIVOS", value: `${kpis.activos || 0} / ${kpis.total || 0}`, color: cc, icon: Activity },
    { label: "KM HOY", value: (kpis.km_hoy || 0).toLocaleString(), color: "#c8e8ff", icon: Route },
    { label: "RENDIMIENTO", value: kpis.rendimiento ? `${kpis.rendimiento} km/L` : "--", color: "#00ff88", icon: Gauge },
    { label: "HORAS ACTIVO", value: "--", color: "#00d4ff", icon: Clock },
    { label: "ALERTAS", value: kpis.alertas || 0, color: kpis.alertas > 0 ? "#ff2244" : "#3a6080", icon: Zap },
  ];

  return (
    <div className="space-y-4" data-testid="contratos-page">
      <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ borderBottom: "1px solid #0d2035" }}>
        {CONTRATOS.map(c => (
          <button key={c.id}
            onClick={() => { setContrato(c.id); setPanelPatente(null); }}
            data-testid={`btn-contrato-${c.id}`}
            className="px-4 py-2 font-exo text-[10px] font-bold tracking-[0.1em] cursor-pointer transition-all whitespace-nowrap"
            style={{
              background: contrato === c.id ? `${c.color}10` : "transparent",
              borderBottom: contrato === c.id ? `2px solid ${c.color}` : "2px solid transparent",
              color: contrato === c.id ? c.color : "#3a6080",
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3a6080" }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {kpiItems.map((k, i) => {
              const Icon = k.icon;
              return (
                <div key={i} className="p-3" style={{ background: '#091018', border: '1px solid #0d2035' }} data-testid={`kpi-${i}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: `${k.color}50` }} />
                    <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>{k.value}</div>
                  </div>
                  <div className="font-exo text-[10px] font-bold tracking-[0.15em] text-right" style={{ color: "#4a7090" }}>{k.label}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="grid-camiones">
            {camiones.map((c: any) => {
              const est = ESTADO_CONFIG[c.estado] || ESTADO_CONFIG.INACTIVO;
              const rend = c.rendimiento || 0;
              const score = rend > 0 ? Math.min(Math.round((rend / 3.5) * 80), 100) : 0;
              const scoreColor = score >= 80 ? "#00ff88" : score >= 60 ? "#ffcc00" : "#ff2244";

              return (
                <div key={c.patente}
                  onClick={() => setPanelPatente(c.patente)}
                  data-testid={`card-camion-${c.patente}`}
                  className="p-3 cursor-pointer transition-all group"
                  style={{
                    background: '#060d14',
                    border: `1px solid #0d2035`,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${est.color}40`)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#0d2035')}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    {score > 0 && (
                      <div className="w-7 h-5 flex items-center justify-center font-space text-[10px] font-bold"
                        style={{ color: scoreColor, background: `${scoreColor}12`, border: `1px solid ${scoreColor}30` }}>
                        {score}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <div className="w-2 h-2 rounded-full" style={{
                        background: est.color,
                        boxShadow: c.estado === "EN_RUTA" ? `0 0 6px ${est.color}60` : "none",
                      }} />
                      <span
                        className="font-space text-[12px] font-bold cursor-pointer transition-all"
                        style={{ color: "#c8e8ff" }}
                        onClick={(e) => { e.stopPropagation(); setMapaPatente(c.patente); }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#00d4ff")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#c8e8ff")}
                        title="Ver mapa del mes"
                        data-testid={`btn-mapa-${c.patente}`}
                      >
                        {c.patente}
                      </span>
                      <MapIcon className="w-3 h-3 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "#00d4ff" }}
                        onClick={(e) => { e.stopPropagation(); setMapaPatente(c.patente); }}
                      />
                    </div>
                  </div>

                  {c.conductor && (
                    <div className="font-rajdhani text-[11px] mb-1.5 truncate" style={{ color: "#4a7090" }}>{c.conductor}</div>
                  )}

                  <div className="w-full h-px mb-1.5" style={{ background: '#0d2035' }} />

                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-space text-[11px] font-bold" style={{ color: rend > 0 ? (rend >= 2.85 ? "#00ff88" : "#ffcc00") : "#3a6080" }}>
                      {rend > 0 ? `${rend} km/L` : "--"}
                    </span>
                    <span className="font-space text-[10px]" style={{ color: "#1a3a55" }}>&middot;</span>
                    <span className="font-space text-[11px]" style={{ color: c.km_hoy > 0 ? "#c8e8ff" : "#3a6080" }}>
                      {c.km_hoy > 0 ? `${c.km_hoy.toLocaleString()} km` : "0 km"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="font-exo text-[9px] font-bold" style={{ color: est.color }}>{est.label}</span>
                      {c.vel_actual > 0 && (
                        <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>&middot; {Math.round(c.vel_actual)} km/h</span>
                      )}
                    </div>
                    <span className="font-space text-[9px]" style={{ color: "#3a6080" }}>{c.hace_cuanto || ""}</span>
                  </div>

                  {contrato === "TODOS" && c.contrato && (
                    <div className="mt-1.5">
                      <span className="font-exo text-[8px] px-1.5 py-0.5" style={{
                        color: CONTRATOS.find(ct => ct.id === c.contrato)?.color || "#3a6080",
                        background: `${CONTRATOS.find(ct => ct.id === c.contrato)?.color || "#3a6080"}10`,
                        border: `1px solid ${CONTRATOS.find(ct => ct.id === c.contrato)?.color || "#3a6080"}20`,
                      }}>
                        {c.contrato}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {(data?.rutas_frecuentes || []).length > 0 && (
            <div className="px-0 py-0" style={{ background: '#091018', border: '1px solid #0d2035' }}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid #0d2035" }}>
                <Route className="w-3.5 h-3.5" style={{ color: "#ffcc00" }} />
                <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
                  RUTAS MAS FRECUENTES {contrato !== "TODOS" ? `\u2014 ${contrato}` : ""}
                </span>
              </div>
              <table className="w-full" data-testid="tabla-rutas">
                <thead>
                  <tr style={{ borderBottom: "1px solid #0d2035" }}>
                    <th className="text-left px-3 py-2 font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#4a7090" }}>RUTA</th>
                    <th className="text-right px-3 py-2 font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#4a7090" }}>VIAJES</th>
                    <th className="text-right px-3 py-2 font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#4a7090" }}>KM PROM</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.rutas_frecuentes || []).slice(0, 10).map((r: any, i: number) => (
                    <tr key={i}
                      style={{ borderBottom: "1px solid #0d203530", background: i % 2 === 0 ? "#091018" : "#0a1420" }}
                      data-testid={`ruta-${i}`}>
                      <td className="px-3 py-2.5">
                        <div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{r.ruta}</div>
                        {contrato === "TODOS" && r.contrato && (
                          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{r.contrato}</div>
                        )}
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{r.viajes}</span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{r.km_prom}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {panelPatente && panelCamion && !mapaPatente && (
        <>
          <div className="fixed inset-0 z-[45]" style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setPanelPatente(null)} />
          <PanelLateral camion={panelCamion} onClose={() => setPanelPatente(null)} onOpenMapa={(p: string) => { setPanelPatente(null); setMapaPatente(p); }} />
        </>
      )}

      {mapaPatente && (
        <MapaCamionMes patente={mapaPatente} onClose={() => setMapaPatente(null)} />
      )}
    </div>
  );
}

function PanelLateral({ camion, onClose, onOpenMapa }: { camion: any; onClose: () => void; onOpenMapa?: (p: string) => void }) {
  const est = ESTADO_CONFIG[camion.estado] || ESTADO_CONFIG.INACTIVO;
  const rend = camion.rendimiento || 0;
  const cc = CONTRATOS.find(c => c.id === camion.contrato)?.color || "#3a6080";

  const { data: perfil } = useQuery<any>({
    queryKey: ["/api/ceo/investigar", camion.patente],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/ceo/investigar/${camion.patente}`);
        if (!r.ok) return null;
        return r.json();
      } catch { return null; }
    },
  });

  return (
    <div className="fixed top-0 right-0 bottom-0 z-[50] w-[380px] panel-lateral overflow-y-auto"
      style={{ background: '#060d14', borderLeft: '1px solid #0d2035' }}
      data-testid="panel-lateral-camion">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
        <div>
          <div className="font-space text-[18px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>{camion.patente}</div>
          <div className="font-rajdhani text-[12px]" style={{ color: "#4a7090" }}>{camion.modelo || "Volvo FH"}</div>
        </div>
        <div className="flex items-center gap-2">
          {camion.contrato && (
            <span className="font-exo text-[9px] px-2 py-0.5" style={{ color: cc, border: `1px solid ${cc}30`, background: `${cc}08` }}>
              {camion.contrato}
            </span>
          )}
          <button onClick={onClose} className="p-1 cursor-pointer hover:opacity-70" data-testid="btn-cerrar-panel">
            <X className="w-4 h-4" style={{ color: "#4a7090" }} />
          </button>
        </div>
      </div>

      {camion.conductor && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="font-rajdhani text-[13px]" style={{ color: "#c8e8ff" }}>{camion.conductor}</div>
        </div>
      )}

      {onOpenMapa && (
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #0d2035" }}>
          <button
            onClick={() => onOpenMapa(camion.patente)}
            className="w-full flex items-center justify-center gap-2 py-2 cursor-pointer transition-all font-exo text-[10px] font-bold tracking-[0.15em]"
            style={{ color: "#00d4ff", background: "#00d4ff08", border: "1px solid #00d4ff30" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#00d4ff15"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#00d4ff08"; }}
            data-testid="btn-ver-mapa-mes"
          >
            <MapIcon className="w-3.5 h-3.5" />
            VER MAPA DEL MES
          </button>
        </div>
      )}

      <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="font-exo text-[9px] tracking-[0.15em] font-bold mb-2" style={{ color: "#4a7090" }}>AHORA</div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{
            background: est.color,
            boxShadow: camion.estado === "EN_RUTA" ? `0 0 6px ${est.color}60` : "none",
          }} />
          <span className="font-exo text-[11px] font-bold" style={{ color: est.color }}>{est.label}</span>
          {camion.vel_actual > 0 && (
            <span className="font-space text-[12px] font-bold ml-1" style={{ color: "#c8e8ff" }}>{Math.round(camion.vel_actual)} km/h</span>
          )}
        </div>
        {camion.ultima_posicion && (
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin className="w-3 h-3" style={{ color: "#3a6080" }} />
            <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>{camion.ultima_posicion}</span>
          </div>
        )}
        <div className="font-space text-[10px]" style={{ color: "#3a6080" }}>
          {camion.hace_cuanto ? `Hace ${camion.hace_cuanto}` : "Sin datos recientes"}
        </div>
      </div>

      <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="font-exo text-[9px] tracking-[0.15em] font-bold mb-2" style={{ color: "#4a7090" }}>HOY</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{(camion.km_hoy || 0).toLocaleString()}</div>
            <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>KM</div>
          </div>
          <div>
            <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{camion.litros_hoy ? camion.litros_hoy.toFixed(1) : "--"}</div>
            <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>LITROS ECU</div>
          </div>
          <div>
            <div className="font-space text-[16px] font-bold" style={{ color: rend >= 2.85 ? "#00ff88" : rend > 0 ? "#ffcc00" : "#3a6080" }}>
              {rend > 0 ? rend.toFixed(1) : "--"}
            </div>
            <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>KM/L</div>
          </div>
        </div>
      </div>

      {perfil?.historial && perfil.historial.length > 0 && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="font-exo text-[9px] tracking-[0.15em] font-bold mb-2" style={{ color: "#4a7090" }}>ULTIMAS 2 SEMANAS</div>
          <div className="flex items-end gap-1 h-[50px]">
            {perfil.historial.slice(-14).map((d: any, i: number) => {
              const r = d.rendimiento || 0;
              const maxR = 5;
              const h = r > 0 ? Math.max((r / maxR) * 100, 10) : 5;
              const barColor = r >= 2.85 ? "#00ff88" : r > 0 ? "#ffcc00" : "#0d2035";
              return (
                <div key={i} className="flex-1" style={{ height: `${h}%`, background: barColor, opacity: 0.7, minWidth: 4 }}
                  title={`${d.fecha}: ${r > 0 ? r.toFixed(1) : '-'} km/L`} />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-space text-[9px]" style={{ color: "#3a6080" }}>14 dias</span>
            <span className="font-exo text-[9px]" style={{ color: "#ff2244" }}>meta 2.85</span>
          </div>
        </div>
      )}

      {perfil?.perfil_camion ? (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="font-exo text-[9px] tracking-[0.15em] font-bold mb-2" style={{ color: "#4a7090" }}>PERFIL APRENDIDO</div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Jornadas registradas</span>
              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{perfil.perfil_camion.total_jornadas || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-rajdhani text-[11px]" style={{ color: "#4a7090" }}>Rend. promedio</span>
              <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{perfil.perfil_camion.rendimiento_promedio || "--"} km/L</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="font-exo text-[9px] tracking-[0.15em] font-bold mb-2" style={{ color: "#4a7090" }}>PERFIL APRENDIDO</div>
          <div className="font-rajdhani text-[11px]" style={{ color: "#3a6080" }}>Acumulando datos — necesita 5+ jornadas</div>
        </div>
      )}
    </div>
  );
}
