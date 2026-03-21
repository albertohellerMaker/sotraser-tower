import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { RefreshCw, TrendingUp, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

const CONTRATO_COLORS: Record<string, string> = {
  "CENCOSUD": "#00d4ff",
  "ANGLO-COCU": "#00ff88",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
};

type AnomaSort = "patente" | "fecha" | "km" | "rend" | "score";

export default function Aprendizaje() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/viajes/stats"],
  });

  const { data: progress } = useQuery<any>({
    queryKey: ["/api/viajes/sync-progress"],
    refetchInterval: 3000,
  });

  const { data: autoSyncStatus } = useQuery<any>({
    queryKey: ["/api/viajes/auto-sync"],
    refetchInterval: 5000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/viajes/sync-historico?dias=90"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/sync-progress"] });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/viajes/stats"] }), 15000);
    },
  });

  const autoSyncMutation = useMutation({
    mutationFn: (enable: boolean) => apiRequest("POST", `/api/viajes/auto-sync?enable=${enable}&interval=30`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/auto-sync"] });
    },
  });

  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [anomaSort, setAnomaSort] = useState<AnomaSort>("score");
  const [anomaDir, setAnomaDIr] = useState<"asc" | "desc">("desc");

  const handleAnomaSort = (col: AnomaSort) => {
    if (anomaSort === col) setAnomaDIr(d => d === "asc" ? "desc" : "asc");
    else { setAnomaSort(col); setAnomaDIr("desc"); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
      </div>
    );
  }

  const estadoColors: Record<string, string> = {
    NORMAL: "#00c97a",
    REVISAR: "#ffcc00",
    ANOMALIA: "#ff2244",
  };

  const cuadrados = stats?.cuadratura?.cruzados || 0;
  const totalViajes = stats?.totalViajes || 0;
  const pctCuad = totalViajes > 0 ? Math.round((cuadrados / totalViajes) * 100) : 0;

  const kpis = [
    { label: "VIAJES ANALIZADOS", value: totalViajes.toLocaleString(), color: "#00d4ff" },
    { label: "CAMIONES", value: stats?.totalCamiones || 0, color: "#00c97a" },
    { label: "NORMALES", value: stats?.porEstado?.find((e: any) => e.estado === "NORMAL")?.count || 0, color: "#00c97a" },
    { label: "REVISAR", value: stats?.porEstado?.find((e: any) => e.estado === "REVISAR")?.count || 0, color: "#ffcc00" },
    { label: "ANOMALIAS", value: stats?.porEstado?.find((e: any) => e.estado === "ANOMALIA")?.count || 0, color: "#ff2244" },
    { label: `CUADRATURA ${pctCuad}%`, value: `${cuadrados}/${totalViajes}`, color: "#ff6b35" },
  ];

  const anomaliasFilt = filtroEstado === "todos"
    ? stats?.anomalias || []
    : (stats?.anomalias || []).filter((a: any) => a.estado === filtroEstado);

  const anomalias = [...anomaliasFilt].sort((a: any, b: any) => {
    let va: any, vb: any;
    if (anomaSort === "patente") { va = a.patente; vb = b.patente; }
    else if (anomaSort === "fecha") { va = a.fecha_inicio || ""; vb = b.fecha_inicio || ""; }
    else if (anomaSort === "km") { va = parseFloat(a.km_ecu || 0); vb = parseFloat(b.km_ecu || 0); }
    else if (anomaSort === "rend") { va = parseFloat(a.rendimiento_real || 0); vb = parseFloat(b.rendimiento_real || 0); }
    else { va = a.score_anomalia || 0; vb = b.score_anomalia || 0; }
    if (va < vb) return anomaDir === "asc" ? -1 : 1;
    if (va > vb) return anomaDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div data-testid="aprendizaje-page">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6" style={{ background: "#00d4ff" }} />
          <TrendingUp className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <div className="font-rajdhani text-xl font-bold" style={{ color: "#c8e8ff" }}>
            APRENDIZAJE DE VIAJES
          </div>
        </div>
        <div className="flex items-center gap-3">
          {progress?.status === "running" && (
            <div className="flex items-center gap-2 font-exo text-[10px]" style={{ color: "#ffcc00" }}>
              <RefreshCw className="w-3 h-3 animate-spin" />
              SYNC {progress.procesados}/{progress.totalCamiones}
            </div>
          )}
          <button
            onClick={() => autoSyncMutation.mutate(!autoSyncStatus?.active)}
            disabled={autoSyncMutation.isPending}
            data-testid="button-auto-sync"
            className="flex items-center gap-2 px-3 py-2 font-exo text-[10px] font-bold tracking-wider cursor-pointer transition-all"
            style={{
              background: autoSyncStatus?.active ? "rgba(0,201,122,0.12)" : "rgba(58,96,128,0.1)",
              border: `1px solid ${autoSyncStatus?.active ? "#00c97a" : "#3a6080"}`,
              color: autoSyncStatus?.active ? "#00c97a" : "#3a6080",
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{
              background: autoSyncStatus?.active ? "#00c97a" : "#3a608050",
              boxShadow: autoSyncStatus?.active ? "0 0 6px #00c97a80" : "none",
            }} />
            TIEMPO REAL
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || progress?.status === "running"}
            data-testid="button-sync-viajes"
            className="flex items-center gap-2 px-4 py-2 font-exo text-[11px] font-bold tracking-wider cursor-pointer transition-all"
            style={{
              background: "rgba(0,212,255,0.12)",
              border: "1px solid #00d4ff",
              color: "#00d4ff",
              opacity: progress?.status === "running" ? 0.5 : 1,
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            SYNC HISTORICO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        {kpis.map((k, i) => (
          <div key={i} className="dash-card px-3 py-3" data-testid={`kpi-aprendizaje-${i}`}>
            <div className="font-exo text-[10px] font-bold tracking-[0.15em] mb-1.5" style={{ color: "#4a7090" }}>
              {k.label}
            </div>
            <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {stats?.porContrato?.length > 0 && (
        <div className="dash-card px-0 py-0 mb-4">
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #0d2035" }}>
            <Gauge className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
            <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
              RENDIMIENTO POR CONTRATO
            </span>
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>km/L promedio ECU</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {stats.porContrato.map((c: any, i: number) => {
              const maxRend = Math.max(...stats.porContrato.map((x: any) => x.rendimientoAvg || 0));
              const pct = maxRend > 0 ? ((c.rendimientoAvg || 0) / maxRend) * 100 : 0;
              const rendColor = (c.rendimientoAvg || 0) >= 3.5 ? "#00c97a" : (c.rendimientoAvg || 0) >= 2.5 ? "#ffcc00" : "#ff2244";
              const cColor = CONTRATO_COLORS[c.contrato] || "#c8e8ff";
              return (
                <div key={i} data-testid={`row-contrato-${i}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-3" style={{ background: cColor }} />
                      <span className="font-exo text-[11px] font-bold" style={{ color: cColor }}>{c.contrato}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-space text-[12px] font-bold" style={{ color: rendColor }}>{c.rendimientoAvg ?? "--"} km/L</span>
                      <span className="font-space text-[10px]" style={{ color: "#3a6080" }}>{c.kmAvg} km avg</span>
                      <span className="font-space text-[10px]" style={{ color: "#3a6080" }}>{c.count} viajes</span>
                    </div>
                  </div>
                  <div className="w-full h-2 overflow-hidden" style={{ background: "#0d2035" }}>
                    <div className="h-full transition-all duration-700" style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${rendColor}80 0%, ${rendColor} 100%)`,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dash-card px-0 py-0">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
            VIAJES CON ANOMALIAS DETECTADAS
          </span>
          <div className="flex gap-1">
            {["todos", "REVISAR", "ANOMALIA"].map(est => (
              <button key={est} onClick={() => setFiltroEstado(est)}
                data-testid={`filter-estado-${est}`}
                className="px-3 py-1 font-exo text-[10px] font-bold tracking-wider cursor-pointer transition-all"
                style={{
                  background: filtroEstado === est ? (estadoColors[est] || "#00d4ff") + "20" : "transparent",
                  border: `1px solid ${filtroEstado === est ? (estadoColors[est] || "#00d4ff") : "#0d2035"}`,
                  color: filtroEstado === est ? (estadoColors[est] || "#00d4ff") : "#3a6080",
                }}>
                {est === "todos" ? "TODOS" : est}
              </button>
            ))}
          </div>
        </div>

        {anomalias.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="tabla-anomalias">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d2035" }}>
                  <AnomaHeader label="PATENTE" col="patente" current={anomaSort} dir={anomaDir} onClick={handleAnomaSort} align="left" />
                  <th className="text-left px-3 py-2 font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#4a7090" }}>CONTRATO</th>
                  <AnomaHeader label="FECHA" col="fecha" current={anomaSort} dir={anomaDir} onClick={handleAnomaSort} />
                  <AnomaHeader label="KM ECU" col="km" current={anomaSort} dir={anomaDir} onClick={handleAnomaSort} />
                  <th className="text-right px-3 py-2 font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#4a7090" }}>L ECU</th>
                  <AnomaHeader label="REND" col="rend" current={anomaSort} dir={anomaDir} onClick={handleAnomaSort} />
                  <th className="text-right px-3 py-2 font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#4a7090" }}>CUADRATURA</th>
                  <AnomaHeader label="SCORE" col="score" current={anomaSort} dir={anomaDir} onClick={handleAnomaSort} />
                </tr>
              </thead>
              <tbody>
                {anomalias.map((a: any, i: number) => {
                  const rend = parseFloat(a.rendimiento_real) || 0;
                  const rendColor = rend >= 3.5 ? "#00c97a" : rend >= 2.5 ? "#ffcc00" : "#ff2244";
                  const score = a.score_anomalia || 0;
                  const scoreColor = score >= 50 ? "#ff2244" : score >= 20 ? "#ffcc00" : "#00c97a";
                  const isEven = i % 2 === 0;
                  return (
                    <tr key={i}
                      data-testid={`row-anomalia-${i}`}
                      className="transition-all hover:bg-[#0d1e30]"
                      style={{
                        borderBottom: "1px solid #0d203540",
                        background: isEven ? "#091018" : "#0a1420",
                      }}>
                      <td className="px-3 py-2.5">
                        <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-exo text-[10px]" style={{ color: CONTRATO_COLORS[a.contrato] || "#3a6080" }}>{a.contrato}</span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="font-space text-[10px]" style={{ color: "#6a90aa" }}>
                          {a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--"}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{parseFloat(a.km_ecu || 0).toFixed(0)} km</span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="font-space text-[11px]" style={{ color: "#00d4ff" }}>{parseFloat(a.litros_consumidos_ecu || 0).toFixed(1)} L</span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="font-space text-[11px] font-bold" style={{ color: rendColor }}>{rend.toFixed(2)} km/L</span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        {a.sigetra_cruzado ? (
                          parseFloat(a.litros_cargados_sigetra || 0) === 0 && a.delta_cuadratura == null ? (
                            <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>SIN MATCH</span>
                          ) : <div>
                            <span className="font-space text-[10px]" style={{ color: "#ff6b35" }}>
                              {parseFloat(a.litros_cargados_sigetra || 0).toFixed(0)}L surt
                            </span>
                            {a.delta_cuadratura != null && (
                              <span className="font-space text-[10px] ml-1" style={{ color: parseFloat(a.delta_cuadratura) > 15 ? "#ff2244" : "#00c97a" }}>
                                {parseFloat(a.delta_cuadratura) >= 0 ? "+" : ""}{parseFloat(a.delta_cuadratura).toFixed(0)}L
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-exo text-[9px]" style={{ color: "#4a7090" }}>PENDIENTE</span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <div className="inline-flex items-center justify-center w-8 h-5 font-space text-[11px] font-bold"
                          style={{ color: scoreColor, background: `${scoreColor}12`, border: `1px solid ${scoreColor}30` }}>
                          {score}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: "#00c97a" }} />
            <div className="font-exo text-[12px]" style={{ color: "#3a6080" }}>
              {stats?.totalViajes > 0 ? "SIN ANOMALIAS EN EL FILTRO SELECCIONADO" : "EJECUTAR SYNC HISTORICO PARA ANALIZAR VIAJES"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Gauge({ className, style }: { className?: string; style?: any }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

function AnomaHeader({ label, col, current, dir, onClick, align }: {
  label: string; col: string; current: string; dir: string; onClick: (col: any) => void; align?: string;
}) {
  const active = current === col;
  return (
    <th className={`${align === "left" ? "text-left" : "text-right"} px-3 py-2 cursor-pointer select-none`} onClick={() => onClick(col)}>
      <span className="font-exo text-[10px] font-bold tracking-[0.15em] inline-flex items-center gap-1"
        style={{ color: active ? "#00d4ff" : "#4a7090" }}>
        {label}
        {active && (dir === "desc" ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />)}
      </span>
    </th>
  );
}
