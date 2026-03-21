import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Truck, Fuel, AlertTriangle, Activity, Clock, MapPin,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Users, Route, Gauge, BarChart3, Shield, Zap,
  CheckCircle, XCircle, Eye, Filter, RefreshCw, Radio
} from "lucide-react";

type ControlTab = "panel" | "flota" | "combustible" | "operaciones";

const CONTROL_TABS: { id: ControlTab; label: string; icon: typeof Activity }[] = [
  { id: "panel", label: "PANEL", icon: Activity },
  { id: "flota", label: "FLOTA", icon: Truck },
  { id: "combustible", label: "COMBUSTIBLE", icon: Fuel },
  { id: "operaciones", label: "OPERACIONES", icon: Route },
];

function KPICard({ label, value, sub, color, icon: Icon, trend }: {
  label: string; value: string | number; sub?: string; color: string;
  icon: typeof Activity; trend?: "up" | "down" | null;
}) {
  return (
    <div className="rounded px-4 py-3" style={{ background: "#091018", border: "1px solid #0d2035" }} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span className="font-exo text-[8px] font-bold tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>{label}</span>
        </div>
        {trend === "up" && <TrendingUp className="w-3 h-3" style={{ color: "#00ff88" }} />}
        {trend === "down" && <TrendingDown className="w-3 h-3" style={{ color: "#ff2244" }} />}
      </div>
      <div className="font-space text-[22px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-rajdhani text-[10px] mt-0.5" style={{ color: "#4a7090" }}>{sub}</div>}
    </div>
  );
}

function PanelTab() {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/cerebro/estado-general"], refetchInterval: 60000 });
  const { data: alertas } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 60000 });
  const { data: estaciones } = useQuery<any>({ queryKey: ["/api/estaciones/analisis"], refetchInterval: 300000 });

  const criticos = useMemo(() => alertas?.filter((a: any) => a.severidad === "CRITICA").length || 0, [alertas]);
  const contratos = estado?.por_contrato || [];

  const totalCargas = estaciones?.resumen?.total_cargas || 0;
  const totalLitros = estaciones?.resumen?.total_litros || 0;
  const conEcu = estaciones?.resumen?.cobertura?.cargas_con_cruce_ecu || 0;

  return (
    <div data-testid="control-panel-tab">
      <div className="flex items-center gap-3 mb-5">
        <Activity className="w-5 h-5" style={{ color: "#00d4ff" }} />
        <span className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>PANEL DE CONTROL</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: "#00ff88", animation: "blink 2s infinite" }} />
          <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: "#00ff88" }}>EN VIVO</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <KPICard label="FLOTA ACTIVA" value={`${estado?.camiones_activos || 0}/${estado?.total_camiones || 0}`} sub="camiones en ruta" color="#00d4ff" icon={Truck} />
        <KPICard label="KM HOY" value={(estado?.km_hoy || 0).toLocaleString("es-CL")} sub="kilometros recorridos" color="#00ff88" icon={Route} trend="up" />
        <KPICard label="RENDIMIENTO" value={`${estado?.rendimiento_promedio || 0} km/L`} sub="promedio flota" color="#ffcc00" icon={Gauge} />
        <KPICard label="ALERTAS" value={criticos} sub={`de ${alertas?.length || 0} totales`} color={criticos > 0 ? "#ff2244" : "#00ff88"} icon={AlertTriangle} />
        <KPICard label="CARGAS HOY" value={totalCargas} sub={`${Math.round(totalLitros).toLocaleString("es-CL")} litros`} color="#ff6600" icon={Fuel} />
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {contratos.map((c: any) => {
          const colores: Record<string, string> = { "CENCOSUD": "#00d4ff", "ANGLO-CARGAS VARIAS": "#ff6b35", "ANGLO-CAL": "#ffcc00", "ANGLO-COCU": "#00ff88" };
          const col = colores[c.contrato] || "#4a7090";
          return (
            <div key={c.contrato} className="rounded px-4 py-3" style={{ background: "#091018", border: `1px solid ${col}20`, borderLeft: `3px solid ${col}` }} data-testid={`contrato-card-${c.contrato}`}>
              <div className="font-space text-[10px] font-bold tracking-wider mb-1" style={{ color: col }}>{c.contrato}</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ACTIVOS</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{c.activos}/{c.total_camiones}</div>
                </div>
                <div>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>KM HOY</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{(c.km_hoy || 0).toLocaleString("es-CL")}</div>
                </div>
                <div>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>RENDIMIENTO</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: col }}>{c.rendimiento || 0} km/L</div>
                </div>
                <div>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ALERTAS</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: c.alertas > 0 ? "#ff2244" : "#00ff88" }}>{c.alertas || 0}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded px-4 py-3" style={{ background: "#091018", border: "1px solid #0d2035" }}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
            <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#ff2244" }}>ALERTAS CRITICAS</span>
            <span className="font-space text-[10px] font-bold ml-auto px-2 py-0.5" style={{ background: "#ff224415", color: "#ff2244", border: "1px solid #ff224430" }}>{criticos}</span>
          </div>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {(alertas || []).slice(0, 15).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "#020508", border: "1px solid #0d2035" }} data-testid={`alerta-${i}`}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.severidad === "CRITICA" ? "#ff2244" : "#ffcc00" }} />
                <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{a.patente}</span>
                <span className="font-rajdhani text-[10px] flex-1 truncate" style={{ color: "#4a7090" }}>{a.descripcion}</span>
                <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: a.severidad === "CRITICA" ? "#ff2244" : "#ffcc00", background: a.severidad === "CRITICA" ? "#ff224410" : "#ffcc0010" }}>{a.severidad}</span>
              </div>
            ))}
            {(!alertas || alertas.length === 0) && (
              <div className="flex items-center gap-2 py-4 justify-center">
                <CheckCircle className="w-4 h-4" style={{ color: "#00ff88" }} />
                <span className="font-rajdhani text-[11px]" style={{ color: "#00ff88" }}>Sin alertas criticas</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded px-4 py-3" style={{ background: "#091018", border: "1px solid #0d2035" }}>
          <div className="flex items-center gap-2 mb-3">
            <Fuel className="w-3.5 h-3.5" style={{ color: "#ff6600" }} />
            <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#ff6600" }}>ESTACIONES - RESUMEN</span>
            <span className="font-space text-[10px] font-bold ml-auto px-2 py-0.5" style={{ background: "#00ff8815", color: "#00ff88", border: "1px solid #00ff8830" }}>{conEcu} CON ECU</span>
          </div>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {(estaciones?.estaciones || []).slice(0, 10).map((est: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "#020508", border: `1px solid ${est.tiene_anomalias ? "#ff224420" : "#0d2035"}` }} data-testid={`est-resumen-${i}`}>
                <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: est.tiene_anomalias ? "#ff2244" : "#00d4ff" }} />
                <span className="font-space text-[10px] font-bold truncate flex-1" style={{ color: "#c8e8ff" }}>{est.nombre}</span>
                <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>{est.total_cargas} cargas</span>
                <span className="font-space text-[9px] font-bold" style={{ color: "#ff6600" }}>{Math.round(est.total_litros).toLocaleString("es-CL")} L</span>
                {est.tiene_anomalias && <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: "#ff2244" }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlotaTab() {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/cerebro/estado-general"], refetchInterval: 60000 });
  const { data: alertas } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 60000 });
  const [filtroContrato, setFiltroContrato] = useState<string>("TODOS");

  const contratos = estado?.por_contrato || [];
  const contratoNames = ["TODOS", ...contratos.map((c: any) => c.contrato)];

  const alertasFiltradas = useMemo(() => {
    if (!alertas) return [];
    if (filtroContrato === "TODOS") return alertas;
    return alertas.filter((a: any) => a.contrato === filtroContrato);
  }, [alertas, filtroContrato]);

  const sinGps = alertasFiltradas.filter((a: any) => a.tipo === "SIN_GPS");
  const otrasAlertas = alertasFiltradas.filter((a: any) => a.tipo !== "SIN_GPS");

  return (
    <div data-testid="control-flota-tab">
      <div className="flex items-center gap-3 mb-5">
        <Truck className="w-5 h-5" style={{ color: "#00d4ff" }} />
        <span className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>CONTROL DE FLOTA</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          {contratoNames.map(c => {
            const colores: Record<string, string> = { "TODOS": "#c8e8ff", "CENCOSUD": "#00d4ff", "ANGLO-CARGAS VARIAS": "#ff6b35", "ANGLO-CAL": "#ffcc00", "ANGLO-COCU": "#00ff88" };
            const col = colores[c] || "#4a7090";
            const active = filtroContrato === c;
            return (
              <button key={c} onClick={() => setFiltroContrato(c)}
                className="px-2 py-1 font-space text-[8px] font-bold tracking-wider cursor-pointer transition-all"
                style={{ background: active ? col + "15" : "transparent", color: active ? col : "#3a6080", border: `1px solid ${active ? col + "40" : "#0d203540"}` }}
                data-testid={`filtro-contrato-${c}`}
              >{c}</button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <KPICard label="TOTAL FLOTA" value={estado?.total_camiones || 0} sub={`${estado?.camiones_activos || 0} activos ahora`} color="#00d4ff" icon={Truck} />
        <KPICard label="SIN GPS" value={sinGps.length} sub="sin senal" color={sinGps.length > 0 ? "#ff2244" : "#00ff88"} icon={MapPin} />
        <KPICard label="OTRAS ALERTAS" value={otrasAlertas.length} sub="por resolver" color={otrasAlertas.length > 0 ? "#ffcc00" : "#00ff88"} icon={AlertTriangle} />
      </div>

      <div className="rounded px-4 py-3" style={{ background: "#091018", border: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>CAMIONES CON ALERTAS ({alertasFiltradas.length})</span>
        </div>
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {alertasFiltradas.map((a: any, i: number) => {
            const colores: Record<string, string> = { "CENCOSUD": "#00d4ff", "ANGLO-CARGAS VARIAS": "#ff6b35", "ANGLO-CAL": "#ffcc00", "ANGLO-COCU": "#00ff88" };
            const col = colores[a.contrato] || "#4a7090";
            return (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: "#020508", border: "1px solid #0d2035" }} data-testid={`flota-alerta-${i}`}>
                <Truck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: col }} />
                <span className="font-space text-[11px] font-bold w-[70px]" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                <span className="font-space text-[8px] font-bold px-1.5 py-0.5 w-[120px] text-center truncate" style={{ color: col, background: col + "10", border: `1px solid ${col}30` }}>{a.contrato}</span>
                <span className="font-rajdhani text-[10px] flex-1 truncate" style={{ color: "#4a7090" }}>{a.conductor}</span>
                <span className="font-rajdhani text-[10px] flex-1 truncate" style={{ color: "#c8e8ff" }}>{a.descripcion}</span>
                <span className="font-space text-[8px] font-bold px-1.5 py-0.5" style={{ color: a.severidad === "CRITICA" ? "#ff2244" : "#ffcc00", background: a.severidad === "CRITICA" ? "#ff224410" : "#ffcc0010", border: `1px solid ${a.severidad === "CRITICA" ? "#ff224430" : "#ffcc0030"}` }}>{a.severidad}</span>
              </div>
            );
          })}
          {alertasFiltradas.length === 0 && (
            <div className="flex items-center gap-2 py-6 justify-center">
              <CheckCircle className="w-4 h-4" style={{ color: "#00ff88" }} />
              <span className="font-rajdhani text-[12px]" style={{ color: "#00ff88" }}>Sin alertas en el filtro seleccionado</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CombustibleTab() {
  const { data: estaciones, isLoading } = useQuery<any>({ queryKey: ["/api/estaciones/analisis"], refetchInterval: 300000 });
  const [filtroEcu, setFiltroEcu] = useState<"TODOS" | "CON_ECU" | "SIN_ECU">("TODOS");
  const [expandedEst, setExpandedEst] = useState<string | null>(null);

  const resumen = estaciones?.resumen;
  const estacionesList = useMemo(() => {
    if (!estaciones?.estaciones) return [];
    return estaciones.estaciones.map((e: any) => {
      let cargas = e.cargas || [];
      if (filtroEcu === "CON_ECU") cargas = cargas.filter((c: any) => c.tiene_cruce_ecu);
      else if (filtroEcu === "SIN_ECU") cargas = cargas.filter((c: any) => !c.tiene_cruce_ecu);
      return { ...e, cargas, total_cargas: cargas.length, total_litros: cargas.reduce((s: number, c: any) => s + (c.litros_sigetra || 0), 0) };
    }).filter((e: any) => e.cargas.length > 0);
  }, [estaciones, filtroEcu]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#ff6600" }} />
    </div>
  );

  return (
    <div data-testid="control-combustible-tab">
      <div className="flex items-center gap-3 mb-5">
        <Fuel className="w-5 h-5" style={{ color: "#ff6600" }} />
        <span className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>CONTROL DE COMBUSTIBLE</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          {(["TODOS", "CON_ECU", "SIN_ECU"] as const).map(f => {
            const labels: Record<string, string> = { TODOS: `TODOS (${resumen?.total_cargas || 0})`, CON_ECU: `CON ECU (${resumen?.cobertura?.cargas_con_cruce_ecu || 0})`, SIN_ECU: `SIN ECU (${resumen?.cobertura?.cargas_volvo_sin_cruce || 0})` };
            const colors: Record<string, string> = { TODOS: "#c8e8ff", CON_ECU: "#00ff88", SIN_ECU: "#4a7090" };
            const col = colors[f];
            return (
              <button key={f} onClick={() => setFiltroEcu(f)}
                className="px-2 py-1 font-space text-[8px] font-bold tracking-wider cursor-pointer transition-all"
                style={{ background: filtroEcu === f ? col + "15" : "transparent", color: filtroEcu === f ? col : "#3a6080", border: `1px solid ${filtroEcu === f ? col + "40" : "#0d203540"}` }}
                data-testid={`filtro-ecu-${f}`}
              >{labels[f]}</button>
            );
          })}
        </div>
      </div>

      {(() => {
        const totalCargas2 = resumen?.total_cargas || 0;
        const conEcu2 = resumen?.cobertura?.cargas_con_cruce_ecu || 0;
        const sinEcu2 = totalCargas2 - conEcu2;
        const coberturaPct = totalCargas2 > 0 ? Math.round((conEcu2 / totalCargas2) * 100) : 0;
        const anomaliasVerificadas = estaciones?.estaciones
          ? (estaciones.estaciones as any[]).reduce((sum: number, e: any) =>
            sum + (e.cargas || []).filter((c: any) => c.tiene_cruce_ecu && c.nivel_alerta !== "NORMAL").length, 0)
          : 0;
        return (
          <>
            {coberturaPct < 50 && (
              <div className="rounded px-4 py-3 mb-4 flex items-start gap-3" style={{ background: "#ffcc0008", border: "1px solid #ffcc0025", borderLeft: "3px solid #ffcc00" }} data-testid="banner-calibracion-ctrl">
                <Radio className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ffcc00" }} />
                <div>
                  <div className="font-space text-[10px] font-bold tracking-wider mb-1" style={{ color: "#ffcc00" }}>SISTEMA EN CALIBRACION</div>
                  <div className="font-rajdhani text-[11px] leading-relaxed" style={{ color: "#c8e8ff" }}>
                    Cruce ECU disponible en {coberturaPct}% de las cargas. Los snapshots Volvo cubren desde el 19-Mar. La cobertura aumenta automaticamente a medida que se acumulan mas datos.
                  </div>
                </div>
              </div>
            )}
            {coberturaPct >= 50 && coberturaPct <= 80 && (
              <div className="rounded px-4 py-3 mb-4 flex items-start gap-3" style={{ background: "#00d4ff08", border: "1px solid #00d4ff25", borderLeft: "3px solid #00d4ff" }} data-testid="banner-cobertura-parcial-ctrl">
                <Radio className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#00d4ff" }} />
                <div>
                  <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>Cobertura parcial — {coberturaPct}% con ECU</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <KPICard label="PERIODOS TOTALES" value={totalCargas2} sub={`en ${resumen?.total_estaciones || 0} estaciones`} color="#00d4ff" icon={Fuel} />
              <KPICard label="CON CRUCE ECU" value={conEcu2} sub={`${coberturaPct}% de cobertura`} color={coberturaPct >= 50 ? "#00ff88" : "#ffcc00"} icon={CheckCircle} />
              <KPICard label="SIN CRUCE ECU" value={sinEcu2} sub="Mejora con el tiempo" color="#4a7090" icon={Radio} />
              <KPICard label="ANOMALIAS DETECTADAS" value={anomaliasVerificadas} sub="De los periodos verificados" color={anomaliasVerificadas > 0 ? "#ff2244" : "#00ff88"} icon={AlertTriangle} />
            </div>
          </>
        );
      })()}

      <div className="space-y-2">
        {estacionesList.map((est: any, i: number) => (
          <div key={i} className="rounded" style={{ background: "#091018", border: `1px solid ${est.tiene_anomalias ? "#ff224420" : "#0d2035"}` }} data-testid={`ctrl-estacion-${i}`}>
            <button className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all text-left" onClick={() => setExpandedEst(expandedEst === est.nombre ? null : est.nombre)}>
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: est.tiene_anomalias ? "#ff2244" : "#00d4ff" }} />
              <span className="font-space text-[11px] font-bold flex-1" style={{ color: "#c8e8ff" }}>{est.nombre}</span>
              <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>{est.total_cargas} cargas</span>
              <span className="font-space text-[10px] font-bold" style={{ color: "#ff6600" }}>{Math.round(est.total_litros).toLocaleString("es-CL")} L</span>
              <span className="font-space text-[9px]" style={{ color: "#4a7090" }}>{est.camiones_distintos} camiones</span>
              {est.tiene_anomalias && <AlertTriangle className="w-3 h-3" style={{ color: "#ff2244" }} />}
              {expandedEst === est.nombre ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "#4a7090" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />}
            </button>
            {expandedEst === est.nombre && (
              <div className="px-4 pb-3 space-y-1" style={{ borderTop: "1px solid #0d2035" }}>
                {est.cargas.map((c: any, ci: number) => {
                  const ac: Record<string, string> = { NORMAL: "#00ff88", REVISAR: "#ffcc00", SOSPECHOSO: "#FF8C00", CRITICO: "#ff2244" };
                  const col = ac[c.nivel_alerta] || "#3a6080";
                  return (
                    <div key={ci} className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "#020508", border: `1px solid ${c.tiene_cruce_ecu && c.nivel_alerta !== "NORMAL" ? col + "30" : "#0d2035"}`, borderLeft: `3px solid ${c.tiene_cruce_ecu ? col : "#4a7090"}` }}>
                      <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#00d4ff" }} />
                      <span className="font-space text-[10px] font-bold w-[65px]" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                      <span className="font-rajdhani text-[10px] w-[120px] truncate" style={{ color: "#4a7090" }}>{c.conductor}</span>
                      <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{c.hora}</span>
                      <span className="font-space text-[10px] font-bold" style={{ color: "#ff6600" }}>{Math.round(c.litros_sigetra)} L</span>
                      {c.tiene_cruce_ecu && (
                        <span className="font-space text-[7px] font-bold px-1.5 py-0.5" style={{ color: col, background: col + "15", border: `1px solid ${col}30` }}>{c.nivel_alerta}</span>
                      )}
                      {c.tiene_cruce_ecu ? (
                        <>
                          <span className="font-space text-[7px] font-bold px-1.5 py-0.5" style={{ color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830" }}>ECU OK</span>
                          {c.ecu_consumo_periodo != null && (
                            <span className="font-space text-[9px] ml-auto" style={{ color: "#4a7090" }}>
                              ECU: {Math.round(c.ecu_consumo_periodo)}L / {Math.round(c.ecu_km_periodo || 0)}km
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="font-space text-[7px] font-bold px-1.5 py-0.5 flex items-center gap-1" style={{ color: "#4a7090", background: "#4a709015", border: "1px solid #4a709030" }}>
                            <Radio className="w-2.5 h-2.5" /> SIN_DATOS
                          </span>
                          <span className="font-rajdhani text-[9px] ml-auto" style={{ color: "#4a7090" }}>Snapshots no disponibles</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OperacionesTab() {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/cerebro/estado-general"], refetchInterval: 60000 });
  const contratos = estado?.por_contrato || [];

  return (
    <div data-testid="control-operaciones-tab">
      <div className="flex items-center gap-3 mb-5">
        <Route className="w-5 h-5" style={{ color: "#00d4ff" }} />
        <span className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>OPERACIONES</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {contratos.map((c: any) => {
          const colores: Record<string, string> = { "CENCOSUD": "#00d4ff", "ANGLO-CARGAS VARIAS": "#ff6b35", "ANGLO-CAL": "#ffcc00", "ANGLO-COCU": "#00ff88" };
          const col = colores[c.contrato] || "#4a7090";
          const pctActivos = c.total_camiones > 0 ? Math.round((c.activos / c.total_camiones) * 100) : 0;
          return (
            <div key={c.contrato} className="rounded px-5 py-4" style={{ background: "#091018", border: `1px solid ${col}20` }} data-testid={`op-contrato-${c.contrato}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full" style={{ background: col }} />
                <span className="font-space text-[12px] font-bold tracking-wider" style={{ color: col }}>{c.contrato}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: "#3a6080" }}>UTILIZACION</div>
                  <div className="flex items-end gap-2">
                    <span className="font-space text-[24px] font-bold" style={{ color: col }}>{pctActivos}%</span>
                    <span className="font-rajdhani text-[10px] pb-1" style={{ color: "#4a7090" }}>{c.activos}/{c.total_camiones}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full mt-1" style={{ background: "#0d2035" }}>
                    <div className="h-full rounded-full" style={{ width: `${pctActivos}%`, background: col }} />
                  </div>
                </div>
                <div>
                  <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: "#3a6080" }}>RENDIMIENTO</div>
                  <div className="flex items-end gap-2">
                    <span className="font-space text-[24px] font-bold" style={{ color: "#c8e8ff" }}>{c.rendimiento || 0}</span>
                    <span className="font-rajdhani text-[10px] pb-1" style={{ color: "#4a7090" }}>km/L</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>KM HOY</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{(c.km_hoy || 0).toLocaleString("es-CL")}</div>
                </div>
                <div className="rounded px-3 py-2" style={{ background: "#020508", border: "1px solid #0d2035" }}>
                  <div className="font-exo text-[7px] tracking-wider" style={{ color: "#3a6080" }}>ALERTAS</div>
                  <div className="font-space text-[14px] font-bold" style={{ color: c.alertas > 0 ? "#ff2244" : "#00ff88" }}>{c.alertas || 0}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Control() {
  const [tab, setTab] = useState<ControlTab>("panel");

  return (
    <div data-testid="control-page">
      <div className="flex items-center gap-1.5 mb-5">
        {CONTROL_TABS.map(t => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all"
              style={{
                background: active ? "rgba(0,212,255,0.08)" : "transparent",
                border: `1px solid ${active ? "rgba(0,212,255,0.25)" : "#0d203540"}`,
                borderBottom: active ? "2px solid #00d4ff" : "2px solid transparent",
              }}
              data-testid={`ctrl-tab-${t.id}`}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: active ? "#00d4ff" : "#3a6080" }} />
              <span className="font-space text-[9px] font-bold tracking-[0.15em]" style={{ color: active ? "#00d4ff" : "#3a6080" }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "panel" && <PanelTab />}
      {tab === "flota" && <FlotaTab />}
      {tab === "combustible" && <CombustibleTab />}
      {tab === "operaciones" && <OperacionesTab />}
    </div>
  );
}
