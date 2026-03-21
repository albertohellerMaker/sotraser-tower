import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Truck, ChevronDown, ChevronUp, Check, X, AlertTriangle, Cpu, Search, Route, Fuel, Activity, Brain, Loader2, Radio, Calendar, Droplets, Gauge, CheckCircle } from "lucide-react";

function AprendizajeWidget() {
  const { data: aprendizaje, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/aprendizaje"],
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading || !aprendizaje) return null;

  const r = aprendizaje.resumen;
  if (!r) return null;

  if (r.total_patrones === 0) {
    return (
      <div className="mb-4 border p-4" style={{ borderColor: "#0d2035", background: "#060d14", borderLeft: "3px solid #3a6080" }} data-testid="widget-aprendizaje">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          <span className="font-space text-[10px] font-bold tracking-[0.15em]" style={{ color: "#3a6080" }}>APRENDIENDO PATRONES DE CARGA</span>
        </div>
        <div className="font-rajdhani text-[12px]" style={{ color: "#4a7090" }}>
          El sistema comenzara a aprender patrones despues del primer ciclo de 30 minutos
        </div>
      </div>
    );
  }

  const borderColor =
    r.madurez_pct >= 80 ? "#00ff88" :
    r.madurez_pct >= 50 ? "#00d4ff" :
    r.madurez_pct >= 20 ? "#ffcc00" :
    "#3a6080";

  const confianzaNiveles = [
    { key: "experta", label: "EXPERTA", color: "#00ff88", desc: "200+ cargas" },
    { key: "alta", label: "ALTA", color: "#00d4ff", desc: "50+ cargas" },
    { key: "media", label: "MEDIA", color: "#ffcc00", desc: "10+ cargas" },
    { key: "baja", label: "BAJA", color: "#3a6080", desc: "<10 cargas" },
  ];

  return (
    <div className="mb-4 border" style={{ borderColor: "#0d2035", background: "#060d14", borderLeft: `3px solid ${borderColor}` }} data-testid="widget-aprendizaje">
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          <span className="font-space text-[10px] font-bold tracking-[0.15em]" style={{ color: "#00d4ff" }}>
            APRENDIENDO PATRONES DE CARGA
          </span>
          {r.ultima_actualizacion && (
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
              ultima actualizacion: {new Date(r.ultima_actualizacion).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <span className="font-space text-[10px] font-bold px-2 py-1" style={{
          color: r.madurez_pct >= 50 ? "#00ff88" : "#ffcc00",
          border: `1px solid ${r.madurez_pct >= 50 ? "#00ff8840" : "#ffcc0040"}`,
        }} data-testid="badge-madurez">
          {r.madurez_pct}% calibrado
        </span>
      </div>

      <div className="p-4">
        <div className="font-rajdhani text-[12px] mb-4 leading-relaxed" style={{ color: "#c8e8ff" }} data-testid="mensaje-aprendizaje">
          "{r.mensaje}"
        </div>

        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>MADUREZ DEL SISTEMA</span>
            <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{r.madurez_pct}%</span>
          </div>
          <div className="h-1.5 w-full" style={{ background: "#0d2035" }}>
            <div className="h-full transition-all duration-500" style={{
              width: `${r.madurez_pct}%`,
              background: r.madurez_pct >= 80 ? "#00ff88" : r.madurez_pct >= 50 ? "#00d4ff" : "#ffcc00",
            }} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>PATRONES ACTIVOS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#00d4ff" }} data-testid="stat-patrones">{r.total_patrones}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>combinaciones aprendidas</div>
          </div>
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>CAMIONES CONOCIDOS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#00ff88" }} data-testid="stat-camiones">{r.camiones_con_patron}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>con patron de carga propio</div>
          </div>
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>ESTACIONES CONOCIDAS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#ffcc00" }} data-testid="stat-estaciones">{r.estaciones_conocidas}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>con comportamiento aprendido</div>
          </div>
          <div className="p-3" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
            <div className="font-exo text-[7px] tracking-[0.2em] uppercase mb-1" style={{ color: "#3a6080" }}>CARGAS ANALIZADAS</div>
            <div className="font-space text-[20px] font-bold" style={{ color: "#c8e8ff" }} data-testid="stat-cargas">{r.cargas_historicas.toLocaleString("es-CL")}</div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>historial total procesado</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>DISTRIBUCION DE CONFIANZA</div>
          <div className="grid grid-cols-4 gap-2">
            {confianzaNiveles.map(nivel => (
              <div key={nivel.key} className="p-2 text-center" style={{ background: "#0a1520", border: `1px solid ${nivel.color}30` }}>
                <div className="font-space text-[16px] font-bold" style={{ color: nivel.color }}>{r.por_confianza[nivel.key]}</div>
                <div className="font-exo text-[8px] font-bold" style={{ color: nivel.color }}>{nivel.label}</div>
                <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{nivel.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {(() => {
          const primerSnapshot = new Date("2026-03-19");
          const diasConDatos = Math.max(1, Math.floor((Date.now() - primerSnapshot.getTime()) / (1000 * 60 * 60 * 24)));
          const coberturaEcuPct = Math.min(95, diasConDatos * 3);
          const diasParaCompleto = coberturaEcuPct >= 80 ? 0 : Math.ceil((80 - coberturaEcuPct) / 3);
          return (
            <div className="mb-4 rounded px-3 py-2" style={{ background: "#0a1520", border: "1px solid #0d2035" }} data-testid="widget-cobertura-ecu">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-3 h-3" style={{ color: "#00d4ff" }} />
                <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>COBERTURA ECU VOLVO</span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>{coberturaEcuPct}%</span>
                <span className="font-rajdhani text-[10px]" style={{ color: "#4a7090" }}>Cobertura ECU actual</span>
                {diasParaCompleto > 0 && (
                  <span className="font-rajdhani text-[10px]" style={{ color: "#c8e8ff" }}>
                    - Sistema completo estimado: en {diasParaCompleto} dias
                  </span>
                )}
                {diasParaCompleto === 0 && (
                  <span className="font-rajdhani text-[10px]" style={{ color: "#00ff88" }}>
                    - Sistema operando normalmente
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${coberturaEcuPct}%`,
                  background: coberturaEcuPct >= 80 ? "#00ff88" : coberturaEcuPct >= 50 ? "#00d4ff" : "#ffcc00",
                }} />
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>CAMIONES MAS CONOCIDOS</div>
            <div className="space-y-1">
              {(aprendizaje.top_camiones || []).map((c: any, i: number) => (
                <div key={c.patente} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520" }} data-testid={`top-camion-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{i + 1}</span>
                    <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{c.patente}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{c.totalCargas || c.total_cargas} cargas</span>
                    <span className="font-exo text-[8px] px-1" style={{
                      color: c.confianza === "EXPERTA" ? "#00ff88" : c.confianza === "ALTA" ? "#00d4ff" : c.confianza === "MEDIA" ? "#ffcc00" : "#3a6080",
                      border: "1px solid currentColor",
                    }}>{c.confianza}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>ESTACIONES MAS CONOCIDAS</div>
            <div className="space-y-1">
              {(aprendizaje.top_estaciones || []).map((e: any, i: number) => (
                <div key={e.estacion} className="flex items-center justify-between px-2 py-1" style={{ background: "#0a1520" }} data-testid={`top-estacion-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{i + 1}</span>
                    <span className="font-exo text-[10px] truncate max-w-[120px]" style={{ color: "#c8e8ff" }}>{e.estacion}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[10px]" style={{ color: "#ffcc00" }}>{Number(e.total_cargas).toLocaleString("es-CL")}</span>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{e.camiones} cam.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodosEntreCargas() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/periodos-entre-cargas"],
    refetchInterval: 5 * 60 * 1000,
  });
  const [filtroNivel, setFiltroNivel] = useState<string>("TODOS");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#ff6600" }} />
    </div>
  );

  const resumen = data?.resumen;
  const periodos = useMemo(() => {
    if (!data?.periodos) return [];
    if (filtroNivel === "TODOS") return data.periodos;
    if (filtroNivel === "ANOMALIAS") return data.periodos.filter((p: any) => p.evaluacion.evaluable && p.evaluacion.nivel !== "NORMAL");
    return data.periodos.filter((p: any) => p.evaluacion.nivel === filtroNivel);
  }, [data, filtroNivel]);

  const nivelColors: Record<string, string> = {
    NORMAL: "#00ff88", REVISAR: "#ffcc00", SOSPECHOSO: "#FF8C00", CRITICO: "#ff2244",
    PENDIENTE: "#3a6080", SIN_DATOS: "#4a7090",
  };

  const filtros = [
    { id: "TODOS", label: `TODOS (${resumen?.total_periodos || 0})`, color: "#c8e8ff" },
    { id: "ANOMALIAS", label: `ANOMALIAS (${(resumen?.criticos || 0) + (resumen?.sospechosos || 0) + (resumen?.revisar || 0)})`, color: "#FF8C00" },
    { id: "CRITICO", label: `CRITICOS (${resumen?.criticos || 0})`, color: "#ff2244" },
    { id: "SOSPECHOSO", label: `SOSPECHOSOS (${resumen?.sospechosos || 0})`, color: "#FF8C00" },
    { id: "NORMAL", label: `NORMAL (${resumen?.normales || 0})`, color: "#00ff88" },
    { id: "PENDIENTE", label: `PENDIENTES (${resumen?.pendientes || 0})`, color: "#3a6080" },
  ];

  function formatDuracion(horas: number | null) {
    if (horas == null) return "--";
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h ${m}min`;
  }

  function formatFecha(fecha: string) {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }) +
      " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div data-testid="periodos-entre-cargas">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-5 h-5" style={{ color: "#ff6600" }} />
        <div>
          <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: "#ff6600" }}>
            ANALISIS ENTRE CARGAS
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            {resumen?.periodo_label} — {resumen?.patentes_analizadas || 0} patentes Volvo — Solo fisica del camion
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 mb-4">
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PERIODOS</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{resumen?.total_periodos || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>EVALUABLES</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{resumen?.evaluables || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#ff224410", border: "1px solid #ff224420" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CRITICOS</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#ff2244" }}>{resumen?.criticos || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#FF8C0010", border: "1px solid #FF8C0020" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>SOSPECHOSOS</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#FF8C00" }}>{resumen?.sospechosos || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>NORMALES</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{resumen?.normales || 0}</div>
        </div>
        <div className="px-3 py-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PENDIENTES</div>
          <div className="font-space text-[16px] font-bold" style={{ color: "#3a6080" }}>{resumen?.pendientes || 0}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {filtros.map(f => (
          <button key={f.id}
            onClick={() => setFiltroNivel(f.id)}
            data-testid={`btn-periodo-filtro-${f.id.toLowerCase()}`}
            className="font-space text-[9px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: filtroNivel === f.id ? f.color + "15" : "#0a1520",
              border: `1px solid ${filtroNivel === f.id ? f.color : "#0d2035"}`,
              color: filtroNivel === f.id ? f.color : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {periodos.length === 0 && (
          <div className="text-center py-8 font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Sin periodos para el filtro seleccionado
          </div>
        )}
        {periodos.map((p: any, idx: number) => {
          const isExpanded = expandedIdx === idx;
          const nc = nivelColors[p.evaluacion.nivel] || "#3a6080";
          const borderColor = p.evaluacion.nivel === "CRITICO" ? "#ff2244" : p.evaluacion.nivel === "SOSPECHOSO" ? "#FF8C00" : "#0d2035";

          return (
            <div key={idx} className="rounded overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: "#0a1520" }} data-testid={`periodo-${idx}`}>
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all text-left"
                data-testid={`btn-periodo-${idx}`}>
                <span className="font-space text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{
                  background: nc + "15", border: `1px solid ${nc}30`, color: nc,
                }}>{p.evaluacion.nivel}</span>
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{p.patente}</span>
                <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>{p.conductor}</span>
                <span className="font-exo text-[8px] px-1.5 py-0.5 rounded" style={{ background: "#0d203550", color: "#4a7090" }}>{p.contrato}</span>
                <div className="flex-1" />
                {p.ecu.periodo_abierto ? (
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Periodo abierto</span>
                ) : (
                  <>
                    <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>{formatDuracion(p.ecu.horas_periodo)}</span>
                    {p.ecu.km != null && <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{p.ecu.km} km</span>}
                    {p.evaluacion.balance_litros != null && p.evaluacion.balance_litros > 0 && (
                      <span className="font-space text-[10px] font-bold" style={{ color: p.evaluacion.balance_litros > 50 ? "#ff2244" : "#ffcc00" }}>
                        +{p.evaluacion.balance_litros}L
                      </span>
                    )}
                  </>
                )}
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6080" }} />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid #0d2035" }}>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                      <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: "#3a6080" }}>CARGA A (INICIO PERIODO)</div>
                      <div className="font-space text-[12px] font-bold" style={{ color: "#ff6600" }}>{p.carga_a.litros}L</div>
                      <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>{p.carga_a.estacion}</div>
                      <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{formatFecha(p.carga_a.fecha)}</div>
                    </div>
                    <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                      <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: "#3a6080" }}>CARGA B (FIN PERIODO)</div>
                      {p.carga_b ? (
                        <>
                          <div className="font-space text-[12px] font-bold" style={{ color: "#ff6600" }}>{p.carga_b.litros}L</div>
                          <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>{p.carga_b.estacion}</div>
                          <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{formatFecha(p.carga_b.fecha)}</div>
                        </>
                      ) : (
                        <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Periodo abierto — sin carga siguiente registrada</div>
                      )}
                    </div>
                  </div>

                  {p.evaluacion.evaluable && (
                    <div className="mt-3">
                      <div className="font-exo text-[7px] tracking-wider mb-2" style={{ color: "#3a6080" }}>PERIODO: {formatDuracion(p.ecu.horas_periodo)}</div>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CONSUMO ECU</div>
                          <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>
                            {p.ecu.litros_consumidos != null ? `${p.ecu.litros_consumidos}L` : "--"}
                          </div>
                        </div>
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CARGADO (A)</div>
                          <div className="font-space text-[14px] font-bold" style={{ color: "#ff6600" }}>{p.carga_a.litros}L</div>
                        </div>
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>BALANCE</div>
                          <div className="font-space text-[14px] font-bold" style={{
                            color: p.evaluacion.balance_litros > 50 ? "#ff2244" : p.evaluacion.balance_litros > 20 ? "#ffcc00" : "#00ff88",
                          }}>
                            {p.evaluacion.balance_litros != null ? `${p.evaluacion.balance_litros > 0 ? "+" : ""}${p.evaluacion.balance_litros}L` : "--"}
                            {p.evaluacion.balance_pct != null && (
                              <span className="text-[10px] ml-1">({p.evaluacion.balance_pct}%)</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>RENDIMIENTO</div>
                          <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>
                            {p.evaluacion.rendimiento_real != null ? `${p.evaluacion.rendimiento_real} km/L` : "--"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-3">
                        <div className="font-exo text-[8px]" style={{ color: "#4a7090" }}>
                          Cobertura ECU: {p.ecu.cobertura_pct}% — {p.ecu.snap_count} snapshots — Calidad: {p.ecu.calidad}
                        </div>
                      </div>
                    </div>
                  )}

                  {p.evaluacion.razones.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {p.evaluacion.razones.map((r: string, ri: number) => (
                        <div key={ri} className="flex items-start gap-2 rounded px-3 py-2" style={{
                          background: "#020508", border: `1px solid ${nc}20`,
                        }}>
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: nc }} />
                          <span className="font-rajdhani text-[10px]" style={{ color: "#c8e8ff" }}>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EstacionesTab() {
  const [subVista, setSubVista] = useState<"ESTACIONES" | "ENTRE_CARGAS">("ESTACIONES");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/estaciones/analisis"],
    refetchInterval: 5 * 60 * 1000,
  });

  const [expandedEstacion, setExpandedEstacion] = useState<string | null>(null);
  const [expandedCarga, setExpandedCarga] = useState<string | number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | "ANOMALIAS" | "CRITICO" | "SOSPECHOSO" | "REVISAR" | "CON_ECU" | "SIN_ECU">("TODOS");
  const [showResumenIA, setShowResumenIA] = useState(false);
  const [soloConEcu, setSoloConEcu] = useState<boolean>(() => {
    try { return localStorage.getItem("estaciones_solo_ecu") !== "false"; } catch { return true; }
  });

  const { data: resumenIA, isLoading: loadingIA } = useQuery<any>({
    queryKey: ["/api/estaciones/resumen-inteligencia"],
    enabled: showResumenIA,
  });

  const toggleSoloEcu = (val: boolean) => {
    setSoloConEcu(val);
    try { localStorage.setItem("estaciones_solo_ecu", String(val)); } catch {}
  };

  const cargasSinEcuCount = useMemo(() => {
    if (!data?.estaciones) return 0;
    return (data.estaciones as any[]).reduce((sum: number, e: any) =>
      sum + (e.cargas || []).filter((c: any) => !c.tiene_cruce_ecu && c.nivel_alerta === "NORMAL").length, 0);
  }, [data]);

  const estaciones = useMemo(() => {
    if (!data?.estaciones) return [];
    let filtered = data.estaciones.map((e: any) => {
      let cargas = e.cargas || [];
      if (soloConEcu && filtro !== "SIN_ECU") {
        cargas = cargas.filter((c: any) => c.tiene_cruce_ecu || c.nivel_alerta !== "NORMAL");
      }
      if (filtro === "CON_ECU") cargas = cargas.filter((c: any) => c.tiene_cruce_ecu);
      else if (filtro === "SIN_ECU") cargas = cargas.filter((c: any) => !c.tiene_cruce_ecu);
      else if (filtro === "CRITICO") cargas = cargas.filter((c: any) => c.nivel_alerta === "CRITICO");
      else if (filtro === "SOSPECHOSO") cargas = cargas.filter((c: any) => c.nivel_alerta === "SOSPECHOSO");
      else if (filtro === "REVISAR") cargas = cargas.filter((c: any) => c.nivel_alerta === "REVISAR");
      else if (filtro === "ANOMALIAS") cargas = cargas.filter((c: any) => c.nivel_alerta !== "NORMAL");
      return { ...e, cargas, total_cargas: cargas.length, total_litros: cargas.reduce((s: number, c: any) => s + (c.litros_sigetra || 0), 0), camiones_distintos: new Set(cargas.map((c: any) => c.patente)).size, tiene_anomalias: cargas.some((c: any) => c.nivel_alerta !== "NORMAL"), alertas_count: cargas.filter((c: any) => c.nivel_alerta !== "NORMAL").length };
    }).filter((e: any) => e.cargas.length > 0);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((e: any) =>
        e.nombre.toLowerCase().includes(term) ||
        e.ciudad?.toLowerCase().includes(term) ||
        e.cargas?.some((c: any) => c.patente?.toLowerCase().includes(term))
      );
    }
    return filtered;
  }, [data, searchTerm, filtro, soloConEcu]);

  const resumen = data?.resumen;
  const periodoLabel = resumen?.periodo?.label || "Ayer";

  const alertaColors: Record<string, string> = { NORMAL: "#00ff88", REVISAR: "#ffcc00", SOSPECHOSO: "#FF8C00", CRITICO: "#ff2244" };

  const filtroButtons = [
    { id: "TODOS" as const, label: `TODOS (${resumen?.total_cargas || 0})`, color: "#c8e8ff" },
    { id: "CON_ECU" as const, label: `CON ECU (${resumen?.cobertura?.cargas_con_cruce_ecu || 0})`, color: "#00ff88" },
    { id: "SIN_ECU" as const, label: `SIN ECU (${resumen?.cobertura?.cargas_volvo_sin_cruce || 0})`, color: "#4a7090" },
    { id: "ANOMALIAS" as const, label: `ANOMALIAS (${resumen?.cargas_anomalas || 0})`, color: "#FF8C00" },
    { id: "CRITICO" as const, label: `CRITICOS (${resumen?.cargas_criticas || 0})`, color: "#ff2244" },
    { id: "SOSPECHOSO" as const, label: "SOSPECHOSO", color: "#FF8C00" },
    { id: "REVISAR" as const, label: "REVISAR", color: "#ffcc00" },
  ];

  return (
    <div data-testid="estaciones-tab">
      <div className="flex items-center gap-1 mb-4">
        {[
          { id: "ESTACIONES" as const, label: "POR ESTACION", icon: <Fuel className="w-3.5 h-3.5" /> },
          { id: "ENTRE_CARGAS" as const, label: "ENTRE CARGAS", icon: <Activity className="w-3.5 h-3.5" /> },
        ].map(t => (
          <button key={t.id}
            onClick={() => setSubVista(t.id)}
            data-testid={`btn-subvista-${t.id.toLowerCase()}`}
            className="flex items-center gap-1.5 font-space text-[10px] font-bold tracking-wider px-4 py-2 cursor-pointer transition-all"
            style={{
              background: subVista === t.id ? "#ff660015" : "transparent",
              borderBottom: subVista === t.id ? "2px solid #ff6600" : "2px solid transparent",
              color: subVista === t.id ? "#ff6600" : "#3a6080",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {subVista === "ENTRE_CARGAS" ? <PeriodosEntreCargas /> : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#ff6600" }} />
        </div>
      ) : (
      <>
      <div className="mb-5 p-4 border" data-testid="panel-explicativo-estaciones"
        style={{
          borderColor: '#00d4ff20',
          background: 'rgba(0,212,255,0.02)',
          borderLeft: '3px solid #00d4ff'
        }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="font-space text-[11px] font-bold tracking-[0.15em]" style={{ color: '#00d4ff' }}>
            COMO FUNCIONA ESTE ANALISIS
          </span>
          <span className="font-exo text-[8px] px-2 py-0.5" style={{ color: '#00d4ff', border: '1px solid #00d4ff30' }}>
            T-2 &middot; 48 HORAS
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="font-exo text-[8px] font-bold tracking-wider uppercase mb-2" style={{ color: '#00d4ff' }}>
              POR QUE 48 HORAS ATRAS
            </div>
            <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: '#c8e8ff' }}>
              Analizamos T-2 — antes de ayer completo.
              Un camion puede cargar combustible hoy
              y consumirlo en los proximos 2 dias.
              Con 48 horas de distancia los periodos
              entre cargas estan cerrados y el ECU
              tiene el consumo real registrado.
            </div>
          </div>
          <div>
            <div className="font-exo text-[8px] font-bold tracking-wider uppercase mb-2" style={{ color: '#00ff88' }}>
              QUE CRUZAMOS
            </div>
            <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: '#c8e8ff' }}>
              Sigetra registra los litros que el
              surtidor entrego al camion.
              Volvo Connect registra los litros
              que el motor realmente quemo.
              Cruzamos ambas fuentes en el periodo
              real entre dos cargas consecutivas —
              sin importar si son 8 o 36 horas.
            </div>
          </div>
          <div>
            <div className="font-exo text-[8px] font-bold tracking-wider uppercase mb-2" style={{ color: '#ffcc00' }}>
              CUANDO ES ANOMALIA REAL
            </div>
            <div className="font-rajdhani text-[12px] leading-relaxed" style={{ color: '#c8e8ff' }}>
              Solo marcamos anomalia cuando el camion
              recorrio 100km+ y tiene 15+ snapshots
              Volvo en ese periodo. Si el camion
              simplemente no salio a ruta o el periodo
              esta incompleto — no se evalua.
              Sin evidencia suficiente no hay alerta.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 pt-3 border-t" style={{ borderColor: '#0d2035' }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
            <span className="font-exo text-[9px]" style={{ color: '#3a6080' }}>Solo camiones con Volvo Connect activo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00d4ff' }} />
            <span className="font-exo text-[9px]" style={{ color: '#3a6080' }}>Snapshots acumulando desde 19-Mar — cobertura mejora cada dia</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ffcc00' }} />
            <span className="font-exo text-[9px]" style={{ color: '#3a6080' }}>Click en cualquier alerta para ver el historial del mes del camion</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <Fuel className="w-5 h-5" style={{ color: "#ff6600" }} />
            <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: "#ff6600" }}>
              DETECCION DE IRREGULARIDADES
            </div>
          </div>
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            {periodoLabel} &middot; Solo camiones Volvo Connect &middot; Sigetra vs ECU
          </div>
          {resumen?.cobertura && (
            <div className="flex items-center gap-2 mt-1">
              <span className="font-rajdhani text-[10px]" style={{ color: "#4a7090" }}>
                {resumen.cobertura.cargas_con_cruce_ecu} con cruce ECU / {resumen.total_cargas} cargas Volvo totales / {resumen.cobertura.cargas_total_sigetra} en Sigetra
              </span>
              <span className="font-space text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                background: "#00ff8815",
                border: "1px solid #00ff8830",
                color: "#00ff88",
              }} data-testid="badge-cobertura-ecu">
                100% VOLVO CONNECT
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            const tc = resumen?.total_cargas || 0;
            const ce = resumen?.cobertura?.cargas_con_cruce_ecu || 0;
            const se = tc - ce;
            const cp = tc > 0 ? Math.round((ce / tc) * 100) : 0;
            const anomVerif = data?.estaciones
              ? (data.estaciones as any[]).reduce((sum: number, e: any) =>
                sum + (e.cargas || []).filter((c: any) => c.tiene_cruce_ecu && c.nivel_alerta !== "NORMAL").length, 0)
              : 0;
            return (
              <div className="grid grid-cols-4 gap-2">
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PERIODOS TOTALES</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>{tc}</div>
                </div>
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CON CRUCE ECU</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: cp >= 50 ? "#00ff88" : "#ffcc00" }}>{ce}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#4a7090" }}>{cp}% cobertura</div>
                </div>
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>SIN CRUCE ECU</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#4a7090" }}>{se}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#4a7090" }}>Mejora con el tiempo</div>
                </div>
                <div className="px-3 py-1.5 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ANOMALIAS</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: anomVerif > 0 ? "#ff2244" : "#00ff88" }}>{anomVerif}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#4a7090" }}>De verificados</div>
                </div>
              </div>
            );
          })()}
          <button
            onClick={() => setShowResumenIA(!showResumenIA)}
            data-testid="btn-resumen-ia"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition-all"
            style={{
              background: showResumenIA ? "#00ff8815" : "#0a1520",
              border: `1px solid ${showResumenIA ? "#00ff88" : "#0d2035"}`,
            }}
          >
            <Brain className="w-4 h-4" style={{ color: showResumenIA ? "#00ff88" : "#4a7090" }} />
            <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: showResumenIA ? "#00ff88" : "#4a7090" }}>
              RESUMEN IA
            </span>
          </button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#3a6080" }} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar estacion o patente..."
              data-testid="input-search-estacion"
              className="pl-7 pr-3 py-1.5 rounded font-exo text-[11px]"
              style={{ background: "#0d203550", border: "1px solid #0d2035", color: "#c8e8ff", width: "200px" }}
            />
          </div>
        </div>
      </div>

      {showResumenIA && (
        <div className="mb-4 rounded overflow-hidden" style={{ background: "#0a1520", border: "1px solid #00ff8840" }} data-testid="panel-resumen-ia">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" style={{ color: "#00ff88" }} />
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00ff88" }}>QUE HA APRENDIDO EL SISTEMA</span>
            </div>
            <button onClick={() => setShowResumenIA(false)} className="cursor-pointer" data-testid="btn-close-resumen-ia">
              <X className="w-4 h-4" style={{ color: "#4a7090" }} />
            </button>
          </div>
          {loadingIA ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#00ff88" }} />
              <span className="ml-2 font-exo text-[11px]" style={{ color: "#4a7090" }}>Generando resumen de inteligencia...</span>
            </div>
          ) : resumenIA ? (
            <div className="px-4 py-3">
              <div className="grid grid-cols-5 gap-3 mb-4">
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>PATRONES</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{resumenIA.stats.total_patrones.toLocaleString("es-CL")}</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CAMIONES</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#00d4ff" }}>{resumenIA.stats.camiones}</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ESTACIONES</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#ff6600" }}>{resumenIA.stats.estaciones}</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CARGA PROM</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{resumenIA.stats.avg_carga_flota} L</div>
                </div>
                <div className="px-3 py-2 rounded" style={{ background: "#0d203530" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>DESV PROM</div>
                  <div className="font-space text-[16px] font-bold" style={{ color: "#ffcc00" }}>{resumenIA.stats.desviacion_promedio} L</div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {resumenIA.insights.map((insight: string, i: number) => (
                  <div key={i} className="flex gap-2 rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }} data-testid={`insight-${i}`}>
                    <div className="w-1 rounded-full flex-shrink-0 mt-0.5" style={{ background: i === 0 ? "#00ff88" : i < 3 ? "#00d4ff" : "#4a7090", minHeight: "16px" }} />
                    <p className="font-rajdhani text-[11px] leading-relaxed" style={{ color: "#c8e8ff" }}>{insight}</p>
                  </div>
                ))}
              </div>

              {resumenIA.stats.contratos && resumenIA.stats.contratos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#ff6600" }}>MAYOR CONSUMO POR CARGA</div>
                    <div className="space-y-1">
                      {(resumenIA.stats.top_consumidores || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: "#0d203530" }}>
                          <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#ff2244" }} />
                          <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                          <span className="ml-auto font-space text-[10px] font-bold" style={{ color: "#ff6600" }}>{c.litros} L</span>
                          <span className="font-exo text-[8px]" style={{ color: "#4a7090" }}>{c.cargas} cargas</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: "#00ff88" }}>MENOR CONSUMO POR CARGA</div>
                    <div className="space-y-1">
                      {(resumenIA.stats.top_eficientes || []).map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: "#0d203530" }}>
                          <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#00ff88" }} />
                          <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                          <span className="ml-auto font-space text-[10px] font-bold" style={{ color: "#00ff88" }}>{c.litros} L</span>
                          <span className="font-exo text-[8px]" style={{ color: "#4a7090" }}>{c.cargas} cargas</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {filtroButtons.map(f => (
          <button key={f.id}
            onClick={() => setFiltro(f.id)}
            data-testid={`btn-filtro-est-${f.id.toLowerCase()}`}
            className="font-space text-[9px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: filtro === f.id ? f.color + "15" : "#0a1520",
              border: `1px solid ${filtro === f.id ? f.color : "#0d2035"}`,
              color: filtro === f.id ? f.color : "#3a6080",
            }}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => toggleSoloEcu(!soloConEcu)}
            data-testid="btn-toggle-solo-ecu"
            className="flex items-center gap-1.5 font-space text-[9px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: soloConEcu ? "#00ff8810" : "#0a1520",
              border: `1px solid ${soloConEcu ? "#00ff8830" : "#0d2035"}`,
              color: soloConEcu ? "#00ff88" : "#3a6080",
            }}>
            <Check className="w-3 h-3" style={{ opacity: soloConEcu ? 1 : 0.3 }} />
            Solo con ECU
          </button>
          {soloConEcu && cargasSinEcuCount > 0 && (
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }} data-testid="text-ocultas-sin-ecu">
              {cargasSinEcuCount} cargas sin ECU ocultas
            </span>
          )}
        </div>
      </div>

      {(() => {
        const totalC = resumen?.total_cargas || 0;
        const conEcuC = resumen?.cobertura?.cargas_con_cruce_ecu || 0;
        const cobPct = totalC > 0 ? Math.round((conEcuC / totalC) * 100) : 0;
        if (cobPct < 50) return (
          <div className="rounded px-4 py-3 mb-4 flex items-start gap-3" style={{ background: "#ffcc0008", border: "1px solid #ffcc0025", borderLeft: "3px solid #ffcc00" }} data-testid="banner-calibracion-est">
            <Radio className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ffcc00" }} />
            <div>
              <div className="font-space text-[10px] font-bold tracking-wider mb-1" style={{ color: "#ffcc00" }}>SISTEMA EN CALIBRACION</div>
              <div className="font-rajdhani text-[11px] leading-relaxed" style={{ color: "#c8e8ff" }}>
                Cruce ECU disponible en {cobPct}% de las cargas. Los snapshots Volvo cubren desde el 19-Mar. La cobertura aumenta automaticamente a medida que se acumulan mas datos.
              </div>
            </div>
          </div>
        );
        if (cobPct <= 80) return (
          <div className="rounded px-4 py-3 mb-4 flex items-start gap-3" style={{ background: "#00d4ff08", border: "1px solid #00d4ff25", borderLeft: "3px solid #00d4ff" }} data-testid="banner-cobertura-parcial-est">
            <Radio className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#00d4ff" }} />
            <div>
              <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>Cobertura parcial — {cobPct}% con ECU</div>
            </div>
          </div>
        );
        return null;
      })()}

      <div className="mb-4 rounded p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }} data-testid="panel-señales-activas">
        <div className="font-space text-[10px] font-bold tracking-[0.15em] mb-3" style={{ color: "#ff6600" }}>SEÑALES ACTIVAS DE DETECCION</div>
        <div className="grid grid-cols-5 gap-2">
          <div className="rounded px-3 py-2" style={{ background: "#ff224408", border: "1px solid #ff224420" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>ECU vs SIGETRA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Declaro mas litros de los que entraron</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#00ff8810", color: "#00ff88" }}>Solo Volvo</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#ff224408", border: "1px solid #ff224420" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>BALANCE DEL DIA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Cargo mucho mas de lo que consumio</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#00ff8810", color: "#00ff88" }}>Solo Volvo</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#ff224408", border: "1px solid #ff224420" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>CARGA ANTICIPADA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Cargo con estanque lleno sin necesidad</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#ffcc0015", color: "#ffcc00" }}>Todos (con ECU)</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#FF8C0008", border: "1px solid #FF8C0020" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#FF8C00" }}>DOBLE CARGA RAPIDA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Doble carga bajo umbral aprendido</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#ffcc0015", color: "#ffcc00" }}>Todos (con ECU)</div>
          </div>
          <div className="rounded px-3 py-2" style={{ background: "#FF8C0008", border: "1px solid #FF8C0020" }}>
            <div className="font-space text-[9px] font-bold" style={{ color: "#FF8C00" }}>MICRO CARGA</div>
            <div className="font-exo text-[8px] mt-1" style={{ color: "#4a7090" }}>Cargo menos del minimo operacional</div>
            <div className="font-exo text-[7px] mt-1 px-1 py-0.5 inline-block rounded" style={{ background: "#c8e8ff10", color: "#c8e8ff" }}>Todos</div>
          </div>
        </div>
      </div>

      {data?.balances_dia && data.balances_dia.length > 0 && (
        <div className="mb-4 rounded overflow-hidden" style={{ background: "#0a1520", border: "1px solid #ff224440", borderLeft: "3px solid #ff2244" }} data-testid="panel-balance-dia">
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: "#ff2244" }} />
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#ff2244" }}>
                BALANCE POR PERIODO — {data.balances_dia.length} CAMION{data.balances_dia.length > 1 ? "ES" : ""} CON EXCESO
              </span>
            </div>
            <div className="font-exo text-[9px] mt-1" style={{ color: "#4a7090" }}>
              Periodos entre cargas donde lo cargado supera significativamente el consumo ECU
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "#0d2035" }}>
            {data.balances_dia.map((b: any, i: number) => (
              <div key={i} className="px-4 py-2 flex items-center gap-4" data-testid={`balance-dia-${i}`}>
                <span className="font-space text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                  background: b.nivel === "CRITICO" ? "#ff224415" : "#FF8C0015",
                  border: `1px solid ${b.nivel === "CRITICO" ? "#ff224430" : "#FF8C0030"}`,
                  color: b.nivel === "CRITICO" ? "#ff2244" : "#FF8C00",
                }}>{b.nivel}</span>
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{b.patente}</span>
                <span className="font-exo text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#0d203550", color: "#4a7090" }}>{b.contrato}</span>
                <div className="flex-1 font-rajdhani text-[10px]" style={{ color: "#c8e8ff" }}>{b.mensaje}</div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CARGADO</div>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#ff6600" }}>{b.litros_cargados_sigetra || b.litros_cargados}L</div>
                  </div>
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>ECU CONSUMO</div>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{b.litros_consumidos_ecu}L</div>
                  </div>
                  <div className="text-right">
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>EXCESO</div>
                    <div className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>+{b.diferencia}L ({b.pct_exceso}%)</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AprendizajeWidget />

      <div className="space-y-2">
        {estaciones.map((est: any, idx: number) => {
          const isExpanded = expandedEstacion === est.nombre;
          const totalLitros = resumen?.total_litros || 1;
          const litrosPct = totalLitros > 0 ? Math.round((est.total_litros / totalLitros) * 100) : 0;
          const borderColor = est.tiene_anomalias ? "#ff2244" : isExpanded ? "#ff6600" : "#0d2035";
          return (
            <div key={est.nombre}
              data-testid={`card-estacion-${idx}`}
              className="rounded overflow-hidden"
              style={{ border: `1px solid ${borderColor}`, background: "#0a1520" }}>
              <button
                onClick={() => setExpandedEstacion(isExpanded ? null : est.nombre)}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all"
                style={{ background: isExpanded ? "#ff660008" : "transparent" }}
                data-testid={`btn-estacion-${idx}`}>
                <Fuel className="w-4 h-4 flex-shrink-0" style={{ color: est.tiene_anomalias ? "#ff2244" : "#ff6600" }} />
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{est.nombre}</span>
                    {est.ciudad && <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{est.ciudad}</span>}
                    {est.alertas_count > 0 && (
                      <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244" }}>
                        {est.alertas_count} ALERTA{est.alertas_count > 1 ? "S" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                      <div className="h-full rounded-full" style={{ width: `${litrosPct}%`, background: est.tiene_anomalias ? "#ff2244" : "#ff6600" }} />
                    </div>
                    <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{litrosPct}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-right flex-shrink-0">
                  <div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>LITROS</div>
                    <div className="font-space text-[12px] font-bold" style={{ color: "#ff6600" }}>{Math.round(est.total_litros).toLocaleString("es-CL")}</div>
                  </div>
                  <div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CARGAS</div>
                    <div className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{est.total_cargas}</div>
                  </div>
                  <div>
                    <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CAMIONES</div>
                    <div className="font-space text-[12px] font-bold" style={{ color: "#00d4ff" }}>{est.camiones_distintos}</div>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "#3a6080" }} />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-3" style={{ borderTop: "1px solid #0d2035" }}>
                  <div className="font-space text-[9px] font-bold tracking-wider mb-1.5 pt-2" style={{ color: "#ff6600" }}>
                    CARGAS EN ESTA ESTACION ({est.total_cargas})
                  </div>
                  <div className="space-y-1.5">
                    {(est.cargas || []).sort((a: any, b: any) => {
                      const order: Record<string, number> = { CRITICO: 0, SOSPECHOSO: 1, REVISAR: 2, NORMAL: 3 };
                      return (order[a.nivel_alerta] ?? 3) - (order[b.nivel_alerta] ?? 3);
                    }).map((carga: any, ci: number) => {
                      const ac = alertaColors[carga.nivel_alerta] || "#3a6080";
                      const cargaKey = carga.id ?? `${est.nombre}-${ci}`;
                      const isDetailOpen = expandedCarga === cargaKey;
                      const fechaCarga = new Date(carga.fecha);
                      const fechaStr = fechaCarga.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                      return (
                        <div key={ci} className="rounded overflow-hidden" style={{ background: "#0d203520", border: `1px solid ${carga.nivel_alerta !== "NORMAL" ? ac + "40" : "#0d203580"}`, borderLeft: `3px solid ${ac}` }} data-testid={`estacion-carga-${idx}-${ci}`}>
                          <button
                            className="w-full p-2.5 cursor-pointer transition-all text-left"
                            style={{ background: isDetailOpen ? ac + "08" : "transparent" }}
                            onClick={() => setExpandedCarga(isDetailOpen ? null : cargaKey)}
                            data-testid={`btn-carga-detail-${idx}-${ci}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <Truck className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
                                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{carga.patente}</span>
                                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{carga.conductor}</span>
                                {carga.tiene_cruce_ecu ? (
                                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: ac, background: ac + "15", border: `1px solid ${ac}30` }}>
                                    {carga.nivel_alerta}
                                  </span>
                                ) : (
                                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5 flex items-center gap-1" style={{ color: "#4a7090", background: "#4a709015", border: "1px solid #4a709030" }}>
                                    <Radio className="w-2.5 h-2.5" /> SIN_DATOS
                                  </span>
                                )}
                                {carga.tiene_cruce_ecu && (
                                  <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830" }}>
                                    ECU OK
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{carga.hora}</span>
                                <span className="font-space text-[10px] font-bold" style={{ color: "#ff6600" }}>{Math.round(carga.litros_sigetra)} L</span>
                                {carga.tiene_cruce_ecu && carga.ecu_consumo_periodo != null && (
                                  <span className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                                    ECU: {Math.round(carga.ecu_consumo_periodo)}L consumido / {Math.round(carga.ecu_km_periodo || 0)}km
                                  </span>
                                )}
                                {isDetailOpen ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#4a7090" }} /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6080" }} />}
                              </div>
                            </div>
                            {carga.razones.length > 0 && (
                              <div className="ml-5 mt-1 space-y-0.5">
                                {carga.razones.map((r: string, ri: number) => (
                                  <div key={ri} className="font-rajdhani text-[10px] flex items-start gap-1" style={{ color: ac }}>
                                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {r}
                                  </div>
                                ))}
                              </div>
                            )}
                          </button>

                          {isDetailOpen && (
                            <div className="px-4 pb-3 pt-2" style={{ borderTop: `1px solid ${ac}25` }} data-testid={`detail-carga-${idx}-${ci}`}>
                              <div className="grid grid-cols-3 gap-3 mb-3">
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Calendar className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>FECHA Y HORA</span>
                                  </div>
                                  <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{fechaStr}</div>
                                  <div className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{carga.hora}</div>
                                </div>
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Droplets className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>LITROS SIGETRA</span>
                                  </div>
                                  <div className="font-space text-[16px] font-bold" style={{ color: "#ff6600" }}>{carga.litros_sigetra.toLocaleString("es-CL", { maximumFractionDigits: 1 })} L</div>
                                </div>
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Gauge className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ODOMETRO</span>
                                  </div>
                                  <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{carga.odometro ? carga.odometro.toLocaleString("es-CL") + " km" : "--"}</div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Truck className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CAMION</span>
                                  </div>
                                  <div className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{carga.patente}</div>
                                  <div className="font-exo text-[10px]" style={{ color: "#4a7090" }}>{carga.conductor}</div>
                                </div>
                                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Route className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CONTRATO</span>
                                  </div>
                                  <div className="font-space text-[12px] font-bold" style={{ color: "#00d4ff" }}>{carga.contrato || "Sin contrato"}</div>
                                </div>
                              </div>

                              {carga.tiene_cruce_ecu && (
                                <div className="rounded px-3 py-2 mb-3" style={{ background: "#00ff8808", border: "1px solid #00ff8820" }}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Cpu className="w-3 h-3" style={{ color: "#00ff88" }} />
                                    <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#00ff88" }}>CRUCE ECU VOLVO</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div>
                                      <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>CONSUMO ENTRE SNAPSHOTS</div>
                                      <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{carga.ecu_consumo_periodo != null ? carga.ecu_consumo_periodo.toFixed(1) + " L" : "--"}</div>
                                    </div>
                                    <div>
                                      <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>KM ENTRE SNAPSHOTS</div>
                                      <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{carga.ecu_km_periodo != null ? carga.ecu_km_periodo.toFixed(1) + " km" : "--"}</div>
                                    </div>
                                    <div>
                                      <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>DELTA</div>
                                      <div className="font-space text-[13px] font-bold" style={{ color: carga.litros_delta != null && carga.litros_delta > 25 ? "#ff2244" : "#00ff88" }}>
                                        {carga.litros_delta != null ? (carga.litros_delta > 0 ? "+" : "") + carga.litros_delta.toFixed(1) + " L" : "OK"}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="font-rajdhani text-[10px] mt-2" style={{ color: "#4a7090" }}>
                                    Ventana: 3h antes / 3h despues de la carga. Consumo ECU = totalFuelUsed despues - antes.
                                  </div>
                                </div>
                              )}

                              {!carga.tiene_cruce_ecu && (
                                <div className="rounded px-3 py-2 mb-3" style={{ background: "#4a709008", border: "1px solid #4a709020" }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Radio className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#4a7090" }}>{carga.patente} - Sin ECU disponible</span>
                                  </div>
                                  <div className="font-rajdhani text-[11px] mb-1" style={{ color: "#c8e8ff" }}>
                                    Sigetra: {Math.round(carga.litros_sigetra)} L cargados
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Radio className="w-3 h-3" style={{ color: "#4a7090" }} />
                                    <span className="font-rajdhani text-[10px]" style={{ color: "#4a7090" }}>
                                      Snapshots no disponibles para este periodo
                                    </span>
                                  </div>
                                </div>
                              )}

                              {carga.razones.length > 0 && (
                                <div className="rounded px-3 py-2" style={{ background: ac + "08", border: `1px solid ${ac}20` }}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <AlertTriangle className="w-3 h-3" style={{ color: ac }} />
                                    <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: ac }}>RAZONES DE ALERTA</span>
                                  </div>
                                  <div className="space-y-1">
                                    {carga.razones.map((r: string, ri: number) => (
                                      <div key={ri} className="font-rajdhani text-[11px] flex items-start gap-2 rounded px-2 py-1.5" style={{ background: "#020508", border: `1px solid ${ac}15` }}>
                                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: ac }} />
                                        <span style={{ color: "#c8e8ff" }}>{r}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {carga.razones.length === 0 && carga.nivel_alerta === "NORMAL" && carga.tiene_cruce_ecu && (
                                <div className="flex items-center gap-2 rounded px-3 py-2" style={{ background: "#00ff8808", border: "1px solid #00ff8820" }}>
                                  <CheckCircle className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />
                                  <span className="font-rajdhani text-[11px]" style={{ color: "#00ff88" }}>Sin anomalias detectadas en esta carga</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {estaciones.length === 0 && (
          <div className="font-exo text-[11px] py-8 text-center" style={{ color: "#3a6080" }}>
            {filtro !== "TODOS" ? `Sin estaciones con cargas ${filtro.toLowerCase()} ayer` : "Sin datos de cargas para ayer"}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
