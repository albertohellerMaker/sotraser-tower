import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Star, MapPin, Users, Fuel, TrendingUp, ChevronDown, ChevronUp,
  Trophy, Medal, AlertTriangle, Filter, X, Truck, Route, Clock,
  Gauge, MapPinned, Eye, Calendar, BarChart3
} from "lucide-react";
import { getErrorFleetNums, isErrorCarga } from "@/pages/errores";
import { getPercentilCamion } from "@/lib/fuel-utils";

interface FusionCarga {
  numGuia: number;
  fecha: string;
  litros: number;
  odometro: number | null;
  kmRecorrido: number | null;
  rendimiento: number | null;
  lugar: string | null;
  tarjeta: string | null;
  conductor: string | null;
}

interface FusionTruck {
  fleetNum: string;
  patenteReal: string | null;
  vin: string | null;
  modelo: string;
  faena: string | null;
  conductor: string | null;
  totalLitrosSurtidor: number;
  totalCargas: number;
  rendPromedio: number;
  odometroSurtidor: number | null;
  odometroGps: number | null;
  deltaOdometro: number | null;
  fuelLevel: number | null;
  totalFuelUsed: number | null;
  litrosPeriodo: number | null;
  engineHours: number | null;
  gps: { latitude: number | null; longitude: number | null } | null;
  alertLevel: "ok" | "alerta" | "critico";
  cargas: FusionCarga[];
}

interface FusionResponse {
  from: string;
  to: string;
  totalTrucksMatched: number;
  totalLitros: number;
  totalCargas: number;
  alertCount: number;
  vinFilterActive?: boolean;
  camionesConVin?: number;
  camionesSinVin?: number;
  trucks: FusionTruck[];
}

interface DriverStats {
  conductor: string;
  faena: string;
  totalLitros: number;
  totalKm: number;
  rendimiento: number;
  litros100km: number;
  totalCargas: number;
  camiones: string[];
  diasPeriodo: number;
  percentil: number;
}

interface FaenaDriverGroup {
  faena: string;
  drivers: DriverStats[];
  avgRendimiento: number;
  totalLitros: number;
  totalKm: number;
  bestDriver: DriverStats | null;
  worstDriver: DriverStats | null;
}

const DATA_START_DATE = "2026-03-01";

function fN(n: number): string {
  return n.toLocaleString("es-CL");
}

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const startMin = new Date(DATA_START_DATE);
  const effectiveFrom = from < startMin ? startMin : from;
  return { from: effectiveFrom.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

interface ConductorDetalle {
  conductor: string;
  resumen: {
    totalViajes: number;
    totalCargas: number;
    totalEcuLt: number;
    totalEcuKm: number;
    totalSigLt: number;
    rendEcu: number;
    anomalias: number;
    contratos: string[];
    camiones: string[];
  };
  viajes: Array<{
    id: number;
    patente: string;
    modelo: string;
    contrato: string;
    fechaInicio: string;
    fechaFin: string;
    kmEcu: number;
    litrosEcu: number;
    rendimiento: number;
    duracionMin: number;
    velMax: number;
    scoreAnomalia: number;
    estado: string;
    kmSurtidor: number;
    litrosSurtidor: number;
  }>;
  cargas: Array<{
    fecha: string;
    litros: number;
    odometro: number;
    odometroPrevio: number;
    kmRecorrido: number;
    rendimiento: number;
    patente: string;
    lugar: string;
    tarjeta: string;
    faena: string;
    numGuia: number;
  }>;
  porCamion: Array<{
    patente: string;
    viajes: number;
    litrosEcu: number;
    kmEcu: number;
    rendEcu: number;
    cargas: number;
    litrosSig: number;
    kmSig: number;
    rendSig: number;
  }>;
  porZona: Array<{
    zona: string;
    cargas: number;
    litros: number;
    km: number;
    rend: number;
  }>;
  historialMensual: Array<{
    mes: string;
    cargasSig: number;
    litrosSig: number;
    kmSig: number;
    viajesEcu: number;
    litrosEcu: number;
    kmEcu: number;
    rendSig: number;
    rendEcu: number;
    diffLitros: number;
    promLitrosCarga: number;
    promKmViaje: number;
  }>;
  promedios: {
    cargasMes: number;
    litrosSigMes: number;
    litrosEcuMes: number;
    kmEcuMes: number;
    viajesMes: number;
  };
}

function rendColor(r: number): string {
  if (r >= 3.5) return "text-emerald-400";
  if (r >= 2.5) return "text-amber-400";
  return "text-red-400";
}

function estadoTag(estado: string) {
  const colors: Record<string, string> = {
    NORMAL: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    REVISAR: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    ANOMALIA: "bg-red-500/20 text-red-400 border-red-500/40",
  };
  return (
    <span className={`px-1.5 py-0.5 text-xs font-mono font-bold border ${colors[estado] || colors.NORMAL}`}>
      {estado}
    </span>
  );
}

function ConductorDetailModal({ conductorName, onClose, desde, hasta }: { conductorName: string; onClose: () => void; desde: string; hasta: string }) {
  const [tab, setTab] = useState<"viajes" | "cargas" | "camiones" | "zonas" | "historial">("historial");

  const { data, isLoading } = useQuery<ConductorDetalle>({
    queryKey: ["/api/conductores/detalle", conductorName, desde, hasta],
    queryFn: async () => {
      const res = await fetch(`/api/conductores/detalle?nombre=${encodeURIComponent(conductorName)}&desde=${desde}&hasta=${hasta}`);
      if (!res.ok) throw new Error("Error cargando detalle");
      return res.json();
    },
    enabled: !!conductorName,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8" data-testid="modal-conductor-detalle">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-[#020508] border border-[#0d2035] shadow-2xl shadow-cyan-500/10">
        <div className="sticky top-0 z-10 bg-[#020508] border-b border-[#0d2035] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-[#00d4ff]" />
            <div>
              <h2 className="text-base font-mono font-bold tracking-[0.12em] text-[#c8e8ff] uppercase" data-testid="text-modal-conductor-name">
                {conductorName}
              </h2>
              <p className="text-[11px] font-mono text-[#3a6080] tracking-[0.1em]">FICHA DE CONDUCTOR / ANALISIS DE FALLAS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#0d2035] transition-colors cursor-pointer" data-testid="btn-close-modal">
            <X className="w-5 h-5 text-[#3a6080]" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : data ? (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { label: "VIAJES ECU", value: data.resumen.totalViajes, color: "text-[#00d4ff]" },
                { label: "CARGAS SIGETRA", value: data.resumen.totalCargas, color: "text-[#00d4ff]" },
                { label: "LT ECU", value: `${fN(Math.round(data.resumen.totalEcuLt))}`, color: "text-amber-400" },
                { label: "KM ECU", value: `${fN(data.resumen.totalEcuKm)}`, color: "text-[#c8e8ff]" },
                { label: "REND ECU", value: `${data.resumen.rendEcu.toFixed(2)}`, color: rendColor(data.resumen.rendEcu), unit: "km/L" },
                { label: "LT SIGETRA", value: `${fN(Math.round(data.resumen.totalSigLt))}`, color: "text-amber-400" },
                { label: "CAMIONES", value: data.resumen.camiones.length, color: "text-[#c8e8ff]" },
                { label: "ANOMALIAS", value: data.resumen.anomalias, color: data.resumen.anomalias > 0 ? "text-[#ff2244]" : "text-[#00c97a]" },
              ].map((k, i) => (
                <div key={i} className="bg-[#0a1520] border border-[#0d2035] p-2.5">
                  <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em] mb-0.5">{k.label}</div>
                  <div className={`text-lg font-mono font-bold ${k.color}`} data-testid={`kpi-conductor-${k.label.toLowerCase().replace(/\s/g, "-")}`}>
                    {k.value}
                    {(k as any).unit && <span className="text-[11px] text-[#3a6080] ml-1">{(k as any).unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            {data.resumen.contratos.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-[#3a6080] tracking-[0.15em]">CONTRATOS:</span>
                {data.resumen.contratos.map(c => (
                  <span key={c} className="px-2 py-0.5 text-[11px] font-mono font-bold bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/30">{c}</span>
                ))}
                <span className="text-xs font-mono text-[#3a6080] tracking-[0.15em] ml-3">CAMIONES:</span>
                {data.resumen.camiones.map(c => (
                  <span key={c} className="px-1.5 py-0.5 text-[11px] font-mono font-bold bg-[#0d2035] text-[#c8e8ff] border border-[#0d2035]">{c}</span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 border-b border-[#0d2035] pb-0">
              {([
                { key: "historial" as const, label: "HISTORIAL", icon: <Calendar className="w-3.5 h-3.5" />, count: data.historialMensual?.length || 0 },
                { key: "viajes" as const, label: "VIAJES ECU", icon: <Route className="w-3.5 h-3.5" />, count: data.viajes.length },
                { key: "cargas" as const, label: "CARGAS SIGETRA", icon: <Fuel className="w-3.5 h-3.5" />, count: data.cargas.length },
                { key: "camiones" as const, label: "POR CAMION", icon: <Truck className="w-3.5 h-3.5" />, count: data.porCamion.length },
                { key: "zonas" as const, label: "POR ZONA", icon: <MapPinned className="w-3.5 h-3.5" />, count: data.porZona.length },
              ]).map(t => (
                <button key={t.key}
                  data-testid={`tab-conductor-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold tracking-[0.1em] uppercase border-b-2 transition-colors cursor-pointer ${
                    tab === t.key
                      ? "border-[#00d4ff] text-[#00d4ff]"
                      : "border-transparent text-[#3a6080] hover:text-[#c8e8ff]"
                  }`}>
                  {t.icon} {t.label} <span className="text-xs font-mono text-[#3a6080]">({t.count})</span>
                </button>
              ))}
            </div>

            {tab === "historial" && data.historialMensual && (
              <div className="space-y-4" data-testid="tab-historial-content">
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "PROM CARGAS/MES", value: data.promedios?.cargasMes || 0, color: "text-[#00d4ff]" },
                    { label: "PROM LT SIGETRA/MES", value: fN(data.promedios?.litrosSigMes || 0), color: "text-amber-400", unit: "L" },
                    { label: "PROM LT ECU/MES", value: fN(data.promedios?.litrosEcuMes || 0), color: "text-amber-400", unit: "L" },
                    { label: "PROM KM ECU/MES", value: fN(data.promedios?.kmEcuMes || 0), color: "text-[#c8e8ff]", unit: "km" },
                    { label: "PROM VIAJES/MES", value: data.promedios?.viajesMes || 0, color: "text-[#00d4ff]" },
                  ].map((k, i) => (
                    <div key={i} className="bg-[#0a1520] border border-[#0d2035] p-2.5" data-testid={`kpi-historial-${i}`}>
                      <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em] mb-0.5">{k.label}</div>
                      <div className={`text-lg font-mono font-bold ${k.color}`}>
                        {k.value}
                        {(k as any).unit && <span className="text-[11px] text-[#3a6080] ml-1">{(k as any).unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-0">
                  <div className="grid grid-cols-[5.5rem_4rem_5rem_5rem_4rem_4rem_5rem_5rem_4rem_5rem_5rem] gap-1 px-2 pb-1 border-b border-[#0d2035]">
                    {["MES", "CARGAS", "LT SIG", "KM SIG", "REND S", "VIAJES", "LT ECU", "KM ECU", "REND E", "DIFF LT", "PROM/CGA"].map(h => (
                      <span key={h} className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">{h}</span>
                    ))}
                  </div>
                  {data.historialMensual.length === 0 ? (
                    <div className="py-6 text-center text-[11px] font-mono text-[#3a6080]">Sin datos mensuales</div>
                  ) : data.historialMensual.map((m, i) => {
                    const mesLabel = (() => {
                      const [y, mo] = m.mes.split("-");
                      const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
                      return `${meses[parseInt(mo) - 1] || mo} ${y}`;
                    })();
                    const diffColor = Math.abs(m.diffLitros) <= 50 ? "text-[#00c97a]" : m.diffLitros > 0 ? "text-[#ff2244]" : "text-amber-400";
                    return (
                      <div key={m.mes}
                        data-testid={`row-historial-${i}`}
                        className="grid grid-cols-[5.5rem_4rem_5rem_5rem_4rem_4rem_5rem_5rem_4rem_5rem_5rem] gap-1 px-2 py-2 items-center border-b border-[#0d2035]/50 hover:bg-[#0d2035]/30 transition-colors">
                        <span className="text-xs font-mono font-bold text-[#00d4ff]">{mesLabel}</span>
                        <span className="text-xs font-mono font-bold text-[#c8e8ff]">{m.cargasSig}</span>
                        <span className="text-xs font-mono font-bold text-amber-400">{fN(m.litrosSig)}</span>
                        <span className="text-xs font-mono text-[#c8e8ff]">{fN(m.kmSig)}</span>
                        <span className={`text-xs font-mono font-bold ${m.rendSig > 0 ? rendColor(m.rendSig) : "text-[#3a6080]"}`}>
                          {m.rendSig > 0 ? m.rendSig.toFixed(2) : "-"}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#c8e8ff]">{m.viajesEcu}</span>
                        <span className="text-xs font-mono font-bold text-amber-400">{fN(m.litrosEcu)}</span>
                        <span className="text-xs font-mono text-[#c8e8ff]">{fN(m.kmEcu)}</span>
                        <span className={`text-xs font-mono font-bold ${m.rendEcu > 0 ? rendColor(m.rendEcu) : "text-[#3a6080]"}`}>
                          {m.rendEcu > 0 ? m.rendEcu.toFixed(2) : "-"}
                        </span>
                        <span className={`text-xs font-mono font-bold ${diffColor}`}>
                          {m.diffLitros > 0 ? "+" : ""}{fN(m.diffLitros)}
                        </span>
                        <span className="text-xs font-mono text-[#3a6080]">{m.promLitrosCarga} L</span>
                      </div>
                    );
                  })}

                  {data.historialMensual.length > 1 && (() => {
                    const totCargasSig = data.historialMensual.reduce((s, m) => s + m.cargasSig, 0);
                    const totLtSig = data.historialMensual.reduce((s, m) => s + m.litrosSig, 0);
                    const totKmSig = data.historialMensual.reduce((s, m) => s + m.kmSig, 0);
                    const totViajes = data.historialMensual.reduce((s, m) => s + m.viajesEcu, 0);
                    const totLtEcu = data.historialMensual.reduce((s, m) => s + m.litrosEcu, 0);
                    const totKmEcu = data.historialMensual.reduce((s, m) => s + m.kmEcu, 0);
                    const rendSigTot = totLtSig > 0 ? totKmSig / totLtSig : 0;
                    const rendEcuTot = totLtEcu > 0 ? totKmEcu / totLtEcu : 0;
                    const diffTot = totLtSig - totLtEcu;
                    const promCga = totCargasSig > 0 ? Math.round(totLtSig / totCargasSig) : 0;
                    const diffColor = Math.abs(diffTot) <= 50 ? "text-[#00c97a]" : diffTot > 0 ? "text-[#ff2244]" : "text-amber-400";
                    return (
                      <div className="grid grid-cols-[5.5rem_4rem_5rem_5rem_4rem_4rem_5rem_5rem_4rem_5rem_5rem] gap-1 px-2 py-2.5 items-center border-t-2 border-[#00d4ff]/30 bg-[#00d4ff]/5" data-testid="row-historial-total">
                        <span className="text-xs font-mono font-bold text-[#00d4ff]">TOTAL</span>
                        <span className="text-xs font-mono font-bold text-[#c8e8ff]">{totCargasSig}</span>
                        <span className="text-xs font-mono font-bold text-amber-400">{fN(totLtSig)}</span>
                        <span className="text-xs font-mono font-bold text-[#c8e8ff]">{fN(totKmSig)}</span>
                        <span className={`text-xs font-mono font-bold ${rendSigTot > 0 ? rendColor(rendSigTot) : "text-[#3a6080]"}`}>
                          {rendSigTot > 0 ? rendSigTot.toFixed(2) : "-"}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#c8e8ff]">{totViajes}</span>
                        <span className="text-xs font-mono font-bold text-amber-400">{fN(totLtEcu)}</span>
                        <span className="text-xs font-mono font-bold text-[#c8e8ff]">{fN(totKmEcu)}</span>
                        <span className={`text-xs font-mono font-bold ${rendEcuTot > 0 ? rendColor(rendEcuTot) : "text-[#3a6080]"}`}>
                          {rendEcuTot > 0 ? rendEcuTot.toFixed(2) : "-"}
                        </span>
                        <span className={`text-xs font-mono font-bold ${diffColor}`}>
                          {diffTot > 0 ? "+" : ""}{fN(Math.round(diffTot))}
                        </span>
                        <span className="text-xs font-mono text-[#3a6080]">{promCga} L</span>
                      </div>
                    );
                  })()}
                </div>

                {data.historialMensual.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-[#3a6080] tracking-[0.15em] flex items-center gap-2">
                      <BarChart3 className="w-3.5 h-3.5" /> LITROS POR MES (SIGETRA vs ECU)
                    </div>
                    <div className="flex items-end gap-1.5" style={{ height: "120px" }}>
                      {data.historialMensual.map((m, i) => {
                        const maxLt = Math.max(...data.historialMensual.map(x => Math.max(x.litrosSig, x.litrosEcu)), 1);
                        const hSig = (m.litrosSig / maxLt) * 100;
                        const hEcu = (m.litrosEcu / maxLt) * 100;
                        const [, mo] = m.mes.split("-");
                        const meses = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
                        return (
                          <div key={m.mes} className="flex-1 flex flex-col items-center gap-0.5" data-testid={`bar-historial-${i}`}>
                            <div className="w-full flex gap-0.5 items-end" style={{ height: "100px" }}>
                              <div className="flex-1 rounded-t transition-all" style={{ height: `${hSig}%`, background: "#ff660080", minHeight: m.litrosSig > 0 ? "4px" : "0" }} title={`Surtidor: ${fN(m.litrosSig)} L`} />
                              <div className="flex-1 rounded-t transition-all" style={{ height: `${hEcu}%`, background: "#00d4ff80", minHeight: m.litrosEcu > 0 ? "4px" : "0" }} title={`ECU: ${fN(m.litrosEcu)} L`} />
                            </div>
                            <span className="text-xs font-mono text-[#3a6080]">{meses[parseInt(mo) - 1]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 justify-center">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 rounded" style={{ background: "#ff660080" }} />
                        <span className="text-xs font-mono text-[#3a6080]">SURTIDOR</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 rounded" style={{ background: "#00d4ff80" }} />
                        <span className="text-xs font-mono text-[#3a6080]">TELEMETRIA</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "viajes" && (
              <div className="space-y-0">
                <div className="grid grid-cols-[5rem_5rem_8rem_8rem_4rem_4rem_4rem_3.5rem_4.5rem] gap-1 px-2 pb-1 border-b border-[#0d2035]">
                  {["PATENTE", "CONTRATO", "INICIO", "FIN", "KM", "LT", "REND", "VEL", "ESTADO"].map(h => (
                    <span key={h} className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">{h}</span>
                  ))}
                </div>
                {data.viajes.length === 0 ? (
                  <div className="py-6 text-center text-[11px] font-mono text-[#3a6080]">Sin viajes ECU registrados</div>
                ) : data.viajes.map((v, i) => (
                  <div key={v.id}
                    data-testid={`row-viaje-conductor-${i}`}
                    className={`grid grid-cols-[5rem_5rem_8rem_8rem_4rem_4rem_4rem_3.5rem_4.5rem] gap-1 px-2 py-1.5 items-center border-b border-[#0d2035]/50 ${
                      v.estado === "ANOMALIA" ? "bg-red-500/5" : v.estado === "REVISAR" ? "bg-amber-500/5" : ""
                    }`}>
                    <span className="text-xs font-mono font-bold text-[#c8e8ff]">{v.patente}</span>
                    <span className="text-[11px] font-mono text-[#3a6080]">{v.contrato}</span>
                    <span className="text-[11px] font-mono text-[#c8e8ff]">{new Date(v.fechaInicio).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-[11px] font-mono text-[#c8e8ff]">{new Date(v.fechaFin).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-xs font-mono font-bold text-[#c8e8ff]">{Math.round(v.kmEcu)}</span>
                    <span className="text-xs font-mono text-amber-400">{Math.round(v.litrosEcu)}</span>
                    <span className={`text-xs font-mono font-bold ${rendColor(v.rendimiento)}`}>{v.rendimiento.toFixed(2)}</span>
                    <span className="text-[11px] font-mono text-[#3a6080]">{v.velMax > 0 ? Math.round(v.velMax) : "-"}</span>
                    {estadoTag(v.estado)}
                  </div>
                ))}
              </div>
            )}

            {tab === "cargas" && (
              <div className="space-y-0">
                <div className="grid grid-cols-[8rem_5rem_4rem_5rem_5rem_4rem_1fr_5rem] gap-1 px-2 pb-1 border-b border-[#0d2035]">
                  {["FECHA", "PATENTE", "LITROS", "ODOM", "KM REC", "REND", "LUGAR", "GUIA"].map(h => (
                    <span key={h} className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">{h}</span>
                  ))}
                </div>
                {data.cargas.length === 0 ? (
                  <div className="py-6 text-center text-[11px] font-mono text-[#3a6080]">Sin cargas registradas</div>
                ) : data.cargas.map((c, i) => {
                  const badRend = c.rendimiento > 0 && c.rendimiento < 2.0;
                  const highLt = c.litros > 400;
                  return (
                    <div key={i}
                      data-testid={`row-carga-conductor-${i}`}
                      className={`grid grid-cols-[8rem_5rem_4rem_5rem_5rem_4rem_1fr_5rem] gap-1 px-2 py-1.5 items-center border-b border-[#0d2035]/50 ${
                        badRend || highLt ? "bg-red-500/5" : ""
                      }`}>
                      <span className="text-[11px] font-mono text-[#c8e8ff]">
                        {c.fecha ? new Date(c.fecha).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#c8e8ff]">{c.patente}</span>
                      <span className={`text-xs font-mono font-bold ${highLt ? "text-[#ff2244]" : "text-amber-400"}`}>{Math.round(c.litros)}</span>
                      <span className="text-[11px] font-mono text-[#3a6080]">{c.odometro > 0 ? fN(c.odometro) : "-"}</span>
                      <span className="text-[11px] font-mono text-[#c8e8ff]">{c.kmRecorrido > 0 ? fN(Math.round(c.kmRecorrido)) : "-"}</span>
                      <span className={`text-xs font-mono font-bold ${c.rendimiento > 0 ? rendColor(c.rendimiento) : "text-[#3a6080]"}`}>
                        {c.rendimiento > 0 && c.rendimiento < 100 ? c.rendimiento.toFixed(2) : "-"}
                      </span>
                      <span className="text-[11px] font-mono text-[#3a6080] truncate">{c.lugar || "-"}</span>
                      <span className="text-[11px] font-mono text-[#3a6080]">{c.numGuia || "-"}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "camiones" && (
              <div className="space-y-2">
                {data.porCamion.map((pc, i) => {
                  const diffLt = pc.litrosEcu > 0 && pc.litrosSig > 0
                    ? Math.round(pc.litrosSig - pc.litrosEcu)
                    : null;
                  const diffPct = pc.litrosEcu > 0 && pc.litrosSig > 0
                    ? Math.round(((pc.litrosSig - pc.litrosEcu) / pc.litrosEcu) * 100)
                    : null;
                  const suspicious = diffPct !== null && diffPct > 30;
                  return (
                    <div key={pc.patente}
                      data-testid={`card-camion-conductor-${i}`}
                      className={`border p-3 ${suspicious ? "border-[#ff2244]/40 bg-red-500/5" : "border-[#0d2035] bg-[#0a1520]"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Truck className={`w-4 h-4 ${suspicious ? "text-[#ff2244]" : "text-[#00d4ff]"}`} />
                          <span className="text-sm font-mono font-bold text-[#c8e8ff]" data-testid={`text-camion-patente-${i}`}>{pc.patente}</span>
                          {suspicious && (
                            <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-red-500/20 text-[#ff2244] border border-red-500/40">
                              SOSPECHOSO +{diffPct}% LITROS
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">VIAJES ECU</div>
                          <div className="text-sm font-mono font-bold text-[#c8e8ff]">{pc.viajes}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">LT ECU</div>
                          <div className="text-sm font-mono font-bold text-amber-400">{fN(Math.round(pc.litrosEcu))}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">KM ECU</div>
                          <div className="text-sm font-mono font-bold text-[#c8e8ff]">{fN(Math.round(pc.kmEcu))}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">REND ECU</div>
                          <div className={`text-sm font-mono font-bold ${rendColor(pc.rendEcu)}`}>{pc.rendEcu > 0 ? `${pc.rendEcu.toFixed(2)} km/L` : "-"}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">CARGAS SIG</div>
                          <div className="text-sm font-mono font-bold text-[#c8e8ff]">{pc.cargas}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">LT SIGETRA</div>
                          <div className="text-sm font-mono font-bold text-amber-400">{fN(Math.round(pc.litrosSig))}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">KM SIGETRA</div>
                          <div className="text-sm font-mono font-bold text-[#c8e8ff]">{fN(Math.round(pc.kmSig))}</div>
                        </div>
                        <div>
                          <div className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">DIFF LITROS</div>
                          <div className={`text-sm font-mono font-bold ${
                            diffLt === null ? "text-[#3a6080]" : diffLt > 0 ? "text-[#ff2244]" : "text-[#00c97a]"
                          }`}>
                            {diffLt !== null ? `${diffLt > 0 ? "+" : ""}${fN(diffLt)} L` : "-"}
                          </div>
                        </div>
                      </div>
                      {diffLt !== null && diffLt > 50 && (
                        <div className="mt-2 flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3 py-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#ff2244] flex-shrink-0" />
                          <span className="text-[11px] font-mono text-[#ff2244]">
                            Surtidor registra {fN(Math.round(pc.litrosSig))} L cargados vs {fN(Math.round(pc.litrosEcu))} L consumidos por telemetria.
                            Diferencia de +{fN(diffLt)} L ({diffPct}%) en camion {pc.patente}.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "zonas" && (
              <div className="space-y-0">
                <div className="grid grid-cols-[1fr_4rem_5rem_5rem_4.5rem] gap-1 px-2 pb-1 border-b border-[#0d2035]">
                  {["ZONA / ESTACION", "CARGAS", "LITROS", "KM", "REND"].map(h => (
                    <span key={h} className="text-[7px] font-mono text-[#3a6080] tracking-[0.15em]">{h}</span>
                  ))}
                </div>
                {data.porZona.map((z, i) => {
                  const badRend = z.rend > 0 && z.rend < 2.0;
                  return (
                    <div key={z.zona}
                      data-testid={`row-zona-conductor-${i}`}
                      className={`grid grid-cols-[1fr_4rem_5rem_5rem_4.5rem] gap-1 px-2 py-2 items-center border-b border-[#0d2035]/50 ${
                        badRend ? "bg-red-500/5" : ""
                      }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPinned className={`w-3.5 h-3.5 flex-shrink-0 ${badRend ? "text-[#ff2244]" : "text-[#00d4ff]"}`} />
                        <span className="text-xs font-mono font-bold text-[#c8e8ff] truncate">{z.zona}</span>
                      </div>
                      <span className="text-xs font-mono text-[#c8e8ff]">{z.cargas}</span>
                      <span className="text-xs font-mono font-bold text-amber-400">{fN(Math.round(z.litros))} L</span>
                      <span className="text-xs font-mono text-[#c8e8ff]">{fN(Math.round(z.km))} km</span>
                      <span className={`text-xs font-mono font-bold ${z.rend > 0 ? rendColor(z.rend) : "text-[#3a6080]"}`}>
                        {z.rend > 0 ? `${z.rend.toFixed(2)} km/L` : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
      <div className={`h-full rounded-md ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function FaenaRankingCard({ group, expanded, onToggle, onSelectConductor }: {
  group: FaenaDriverGroup;
  expanded: boolean;
  onToggle: () => void;
  onSelectConductor: (name: string) => void;
}) {
  return (
    <Card className="overflow-visible" data-testid={`card-ranking-faena-${group.faena}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <CardTitle className="text-sm font-mono font-bold tracking-[0.1em] uppercase truncate" data-testid={`text-ranking-faena-${group.faena}`}>
            {group.faena}
          </CardTitle>
          <span className="text-xs font-mono text-muted-foreground">{group.drivers.length} conductores</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap flex-shrink-0">
          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em]">REND. PROMEDIO</div>
            <div className={`text-lg font-mono font-bold ${
              group.avgRendimiento >= 1.8 ? "text-emerald-400" : group.avgRendimiento >= 1.2 ? "text-amber-400" : "text-red-400"
            }`} data-testid={`text-ranking-avg-rend-${group.faena}`}>
              {group.avgRendimiento > 0 ? `${group.avgRendimiento.toFixed(2)} km/L` : "\u2014"}
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">CONDUCTORES</div>
            <div className="text-sm font-mono font-bold text-foreground">{group.drivers.length}</div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">L/100KM</div>
            <div className="text-sm font-mono font-bold text-cyan-400">
              {group.totalKm > 0 ? ((group.totalLitros / group.totalKm) * 100).toFixed(1) : "\u2014"}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">LITROS TOTAL</div>
            <div className="text-sm font-mono font-bold text-amber-400">{fN(Math.round(group.totalLitros))} L</div>
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">KM TOTAL</div>
            <div className="text-sm font-mono font-bold text-foreground">{fN(Math.round(group.totalKm))} km</div>
          </div>
        </div>

        {group.drivers.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-mono text-amber-400 tracking-[0.2em] uppercase mb-2 font-bold">TOP 3 CONDUCTORES</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {group.drivers.slice(0, 3).map((d, idx) => {
                const podiumStyles = [
                  { bg: "bg-amber-500/15 border-amber-500/40", label: "text-amber-300", icon: <Trophy className="w-5 h-5 text-amber-400" />, pos: "1ro" },
                  { bg: "bg-gray-500/10 border-gray-400/30", label: "text-gray-300", icon: <Medal className="w-5 h-5 text-gray-400" />, pos: "2do" },
                  { bg: "bg-orange-500/10 border-orange-700/30", label: "text-orange-300", icon: <Medal className="w-5 h-5 text-amber-700" />, pos: "3ro" },
                ];
                const style = podiumStyles[idx];
                return (
                  <div key={d.conductor} onClick={() => onSelectConductor(d.conductor)} className={`border px-3 py-2.5 cursor-pointer hover:brightness-125 transition-all ${style.bg}`} data-testid={`podium-${group.faena}-${idx}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {style.icon}
                      <span className="text-[11px] font-mono font-bold text-muted-foreground tracking-[0.15em]">{style.pos} LUGAR</span>
                    </div>
                    <div className={`text-sm font-mono font-bold truncate ${style.label}`} data-testid={`text-podium-name-${group.faena}-${idx}`}>
                      {d.conductor}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div>
                        <div className={`text-lg font-mono font-bold ${
                          d.percentil >= 75 ? "text-emerald-400" : d.percentil >= 50 ? "text-blue-400" : d.percentil >= 25 ? "text-amber-400" : "text-red-400"
                        }`}>
                          {d.rendimiento.toFixed(2)}
                          <span className="text-[11px] text-muted-foreground ml-1">km/L</span>
                        </div>
                        <div className="text-[11px] font-mono text-cyan-400/70">
                          {d.litros100km.toFixed(1)} L/100km
                        </div>
                      </div>
                      <span className={`text-sm font-mono font-bold ${
                        d.percentil >= 90 ? "text-emerald-400" : d.percentil >= 75 ? "text-emerald-400/70" : d.percentil >= 50 ? "text-blue-400" : "text-amber-400"
                      }`}>P{d.percentil}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-1.5 pt-1.5 border-t border-border/40">
                      <div>
                        <div className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">LITROS</div>
                        <div className="text-xs font-mono font-bold text-foreground">{fN(Math.round(d.totalLitros))}</div>
                      </div>
                      <div>
                        <div className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">KM</div>
                        <div className="text-xs font-mono font-bold text-foreground">{fN(Math.round(d.totalKm))}</div>
                      </div>
                      <div>
                        <div className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">CARGAS</div>
                        <div className="text-xs font-mono font-bold text-foreground">{d.totalCargas}</div>
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-1 truncate">
                      Cam: {d.camiones.join(", ")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-3 space-y-0">
            <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem_4.5rem_5rem_5rem_4rem] gap-1.5 px-2 pb-1.5 border-b border-border">
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">#</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">CONDUCTOR</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">PERCENTIL</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">REND.</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">L/100KM</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">LITROS</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">KM</span>
              <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">CARGAS</span>
            </div>
            {group.drivers.map((d, idx) => {
              const isBest = idx === 0;
              const isWorst = idx === group.drivers.length - 1 && group.drivers.length > 1;
              const rowBg = isBest ? "bg-emerald-500/5" : isWorst ? "bg-red-500/5" : "";

              return (
                <div
                  key={`${d.conductor}-${d.faena}`}
                  data-testid={`row-driver-${idx}`}
                  onClick={() => onSelectConductor(d.conductor)}
                  className={`grid grid-cols-[2.5rem_1fr_5rem_5rem_4.5rem_5rem_5rem_4rem] gap-1.5 px-2 py-1.5 items-center border-b border-border/40 cursor-pointer hover:bg-primary/5 transition-colors ${rowBg}`}
                >
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">
                    {idx === 0 && <Trophy className="w-3.5 h-3.5 text-amber-400 inline" />}
                    {idx === 1 && <Medal className="w-3.5 h-3.5 text-gray-400 inline" />}
                    {idx === 2 && <Medal className="w-3.5 h-3.5 text-amber-700 inline" />}
                    {idx > 2 && `${idx + 1}`}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-bold text-foreground truncate" data-testid={`text-driver-name-${idx}`}>
                      {d.conductor}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {d.camiones.length > 0 ? `Cam: ${d.camiones.join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] font-mono font-bold ${
                      d.percentil >= 90 ? "text-emerald-400" : d.percentil >= 75 ? "text-emerald-400/70" : d.percentil >= 50 ? "text-blue-400" : d.percentil >= 25 ? "text-amber-400" : "text-red-400"
                    }`} data-testid={`text-driver-percentil-${idx}`}>
                      P{d.percentil}
                    </span>
                    <div className={`text-xs font-mono ${
                      d.percentil >= 90 ? "text-emerald-400/70" : d.percentil >= 75 ? "text-blue-400/70" : d.percentil >= 50 ? "text-muted-foreground" : "text-amber-400/70"
                    }`}>
                      {d.percentil >= 90 ? `Top ${100 - d.percentil}%` : d.percentil >= 50 ? `Top ${100 - d.percentil}%` : "Bajo prom."}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] font-mono font-bold ${
                      d.percentil >= 75 ? "text-emerald-400" : d.percentil >= 50 ? "text-blue-400" : d.percentil >= 25 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {d.rendimiento.toFixed(2)}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground ml-0.5">km/L</span>
                  </div>
                  <div className="text-right text-[11px] font-mono font-bold text-cyan-400">{d.litros100km.toFixed(1)}</div>
                  <div className="text-right text-[11px] font-mono text-foreground">{fN(Math.round(d.totalLitros))}</div>
                  <div className="text-right text-[11px] font-mono text-foreground">{fN(Math.round(d.totalKm))}</div>
                  <div className="text-right text-[11px] font-mono text-muted-foreground">{d.totalCargas}</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RankingConductores() {
  const [days, setDays] = useState(7);
  const [expandedFaenas, setExpandedFaenas] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"rendimiento" | "litros" | "conductores">("rendimiento");
  const [faenaFilter, setFaenaFilter] = useState<string>("todas");
  const [selectedConductor, setSelectedConductor] = useState<string | null>(null);

  const range = useMemo(() => getDateRange(days), [days]);
  const { data, isLoading, isError } = useQuery<FusionResponse>({
    queryKey: [`/api/wisetrack/fusion?from=${range.from}&to=${range.to}`],
  });

  const allFaenas = useMemo(() => {
    if (!data) return [];
    const faenaSet = new Set<string>();
    for (const truck of data.trucks) {
      const faena = truck.faena || "Sin Faena";
      faenaSet.add(faena);
    }
    return Array.from(faenaSet).sort();
  }, [data]);

  const driverRankings = useMemo(() => {
    if (!data) return { groups: [], trucksTotal: 0, trucksFiltered: 0 };
    const errorNums = getErrorFleetNums(data.trucks as any);

    let trucksTotal = 0;
    let trucksFiltered = 0;

    const driverMap = new Map<string, {
      conductor: string;
      faena: string;
      totalLitros: number;
      totalKm: number;
      totalCargas: number;
      camiones: Set<string>;
      validCargas: number;
    }>();

    for (const truck of data.trucks) {
      if (errorNums.has(truck.fleetNum)) continue;
      trucksTotal++;

      if (truck.litrosPeriodo != null && truck.litrosPeriodo > 0 && truck.totalLitrosSurtidor > 0) {
        const avg = (truck.litrosPeriodo + truck.totalLitrosSurtidor) / 2;
        const pctDiff = Math.abs(truck.litrosPeriodo - truck.totalLitrosSurtidor) / avg * 100;
        if (pctDiff > 5) { trucksFiltered++; continue; }
      }

      const faena = truck.faena || "Sin Faena";

      for (const c of truck.cargas) {
        if (!c.conductor || c.conductor.trim() === "") continue;
        if (isErrorCarga(c as any)) continue;
        if (c.litros == null || c.litros <= 0) continue;
        if (c.kmRecorrido == null || c.kmRecorrido <= 0) continue;
        if (c.rendimiento == null || c.rendimiento <= 0 || c.rendimiento > 15) continue;

        const fecha = c.fecha ? c.fecha.slice(0, 10) : null;
        if (fecha && fecha < DATA_START_DATE) continue;

        const conductorNorm = c.conductor.trim();
        const key = `${conductorNorm.toLowerCase()}|||${faena}`;
        const existing = driverMap.get(key) || {
          conductor: conductorNorm,
          faena,
          totalLitros: 0,
          totalKm: 0,
          totalCargas: 0,
          camiones: new Set<string>(),
          validCargas: 0,
        };
        existing.totalLitros += c.litros;
        existing.totalKm += c.kmRecorrido;
        existing.totalCargas += 1;
        existing.camiones.add(truck.fleetNum);
        existing.validCargas += 1;
        driverMap.set(key, existing);
      }
    }

    const byFaena = new Map<string, DriverStats[]>();
    const diasPeriodo = days;
    for (const [, d] of driverMap) {
      if (d.validCargas < 2) continue;
      const rend = d.totalKm / d.totalLitros;
      const l100 = d.totalKm > 0 ? (d.totalLitros / d.totalKm) * 100 : 0;
      const stat: DriverStats = {
        conductor: d.conductor,
        faena: d.faena,
        totalLitros: d.totalLitros,
        totalKm: d.totalKm,
        rendimiento: rend,
        litros100km: l100,
        totalCargas: d.totalCargas,
        camiones: Array.from(d.camiones),
        diasPeriodo,
        percentil: 0,
      };
      const arr = byFaena.get(d.faena) || [];
      arr.push(stat);
      byFaena.set(d.faena, arr);
    }

    const allDriversFlat: DriverStats[] = [];
    for (const [, arr] of byFaena) {
      allDriversFlat.push(...arr);
    }
    const allRend = allDriversFlat.map(d => d.rendimiento).filter(v => v > 0);

    for (const d of allDriversFlat) {
      d.percentil = getPercentilCamion(d.rendimiento, allRend);
    }

    const groups: FaenaDriverGroup[] = [];
    for (const [faena, drivers] of Array.from(byFaena.entries())) {
      if (faenaFilter !== "todas" && faena !== faenaFilter) continue;
      drivers.sort((a, b) => b.rendimiento - a.rendimiento);

      const rends = drivers.map(d => d.rendimiento).filter(r => r > 0);
      const avg = rends.length > 0 ? rends.reduce((a, b) => a + b, 0) / rends.length : 0;
      const totalLitros = drivers.reduce((s, d) => s + d.totalLitros, 0);
      const totalKm = drivers.reduce((s, d) => s + d.totalKm, 0);

      groups.push({
        faena,
        drivers,
        avgRendimiento: avg,
        totalLitros,
        totalKm,
        bestDriver: drivers[0] || null,
        worstDriver: drivers[drivers.length - 1] || null,
      });
    }

    if (sortBy === "rendimiento") groups.sort((a, b) => b.avgRendimiento - a.avgRendimiento);
    else if (sortBy === "litros") groups.sort((a, b) => b.totalLitros - a.totalLitros);
    else groups.sort((a, b) => b.drivers.length - a.drivers.length);

    return { groups, trucksTotal, trucksFiltered };
  }, [data, sortBy, days, faenaFilter]);

  const rankingGroups = driverRankings.groups;
  const { trucksTotal, trucksFiltered } = driverRankings;

  const globalKpis = useMemo(() => {
    const totalDrivers = rankingGroups.reduce((s, g) => s + g.drivers.length, 0);
    const totalLitros = rankingGroups.reduce((s, g) => s + g.totalLitros, 0);
    const totalKm = rankingGroups.reduce((s, g) => s + g.totalKm, 0);
    const totalCargas = rankingGroups.reduce((s, g) => s + g.drivers.reduce((sc, d) => sc + d.totalCargas, 0), 0);
    const avgL100 = totalKm > 0 ? (totalLitros / totalKm) * 100 : 0;
    const allRends = rankingGroups.flatMap(g => g.drivers.map(d => d.rendimiento));
    const avgRend = allRends.length > 0 ? allRends.reduce((a, b) => a + b, 0) / allRends.length : 0;
    const topP90 = rankingGroups.flatMap(g => g.drivers).filter(d => d.percentil >= 90).length;
    return { totalDrivers, totalLitros, totalKm, totalCargas, avgL100, avgRend, topP90, faenas: rankingGroups.length };
  }, [rankingGroups]);

  function toggleFaena(f: string) {
    setExpandedFaenas(prev => {
      const n = new Set(prev);
      n.has(f) ? n.delete(f) : n.add(f);
      return n;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-mono font-bold tracking-[0.15em] uppercase" data-testid="text-ranking-title">
            Ranking Conductores
          </h2>
          <p className="text-xs font-mono text-muted-foreground tracking-[0.1em]">
            Eficiencia de combustible por conductor y faena &mdash; datos desde 01-03-2026
            {trucksFiltered > 0 && (
              <span className="ml-2 text-amber-400">
                ({trucksFiltered} de {trucksTotal} camiones excluidos por dif. telemetria/surtidor &gt;5%)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[3, 7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              data-testid={`btn-days-${d}`}
              className={`px-3 py-1.5 text-xs font-mono font-bold tracking-[0.1em] border transition-colors cursor-pointer ${
                days === d ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/50"
              }`}>
              {d}D
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono text-muted-foreground tracking-[0.1em]">FAENA:</span>
          <select
            value={faenaFilter}
            onChange={e => setFaenaFilter(e.target.value)}
            data-testid="select-faena-filter"
            className="bg-muted border border-border px-2 py-0.5 text-[11px] font-mono text-foreground outline-none focus:border-primary cursor-pointer"
          >
            <option value="todas">Todas las faenas</option>
            {allFaenas.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          {(["rendimiento", "litros", "conductores"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              data-testid={`btn-sort-${s}`}
              className={`px-2.5 py-1 text-[11px] font-mono font-bold tracking-[0.1em] uppercase border transition-colors cursor-pointer ${
                sortBy === s ? "bg-primary/20 text-primary border-primary/50" : "bg-card text-muted-foreground border-border hover:border-primary/40"
              }`}>
              {s === "rendimiento" ? "Rendimiento" : s === "litros" ? "Litros" : "Conductores"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">FAENAS</div>
          <div className="text-xl font-mono font-bold text-foreground" data-testid="text-kpi-faenas">{globalKpis.faenas}</div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">CONDUCTORES</div>
          <div className="text-xl font-mono font-bold text-foreground" data-testid="text-kpi-conductores">{globalKpis.totalDrivers}</div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">REND. GLOBAL</div>
          <div className={`text-xl font-mono font-bold ${
            globalKpis.avgRend >= 1.8 ? "text-emerald-400" : globalKpis.avgRend >= 1.2 ? "text-amber-400" : "text-red-400"
          }`} data-testid="text-kpi-rend-global">
            {globalKpis.avgRend > 0 ? `${globalKpis.avgRend.toFixed(2)}` : "\u2014"}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">km/L</div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">L/100KM</div>
          <div className="text-xl font-mono font-bold text-cyan-400" data-testid="text-kpi-l100">
            {globalKpis.avgL100 > 0 ? globalKpis.avgL100.toFixed(1) : "\u2014"}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">litros/100km</div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">LITROS TOTAL</div>
          <div className="text-xl font-mono font-bold text-amber-400" data-testid="text-kpi-litros">{fN(Math.round(globalKpis.totalLitros))}</div>
          <div className="text-[11px] font-mono text-muted-foreground">litros</div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">KM TOTAL</div>
          <div className="text-xl font-mono font-bold text-foreground" data-testid="text-kpi-km">{fN(Math.round(globalKpis.totalKm))}</div>
          <div className="text-[11px] font-mono text-muted-foreground">km</div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">CARGAS</div>
          <div className="text-xl font-mono font-bold text-foreground" data-testid="text-kpi-cargas">{fN(globalKpis.totalCargas)}</div>
          <div className="text-[11px] font-mono text-muted-foreground">total cargas</div>
        </div>
      </div>

      {isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-mono text-red-400">Error al cargar datos de Fusion</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">Verifique la conexion con WiseTrack</p>
          </CardContent>
        </Card>
      ) : rankingGroups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-mono text-muted-foreground">Sin datos de conductores en el periodo seleccionado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rankingGroups.map(g => (
            <FaenaRankingCard
              key={g.faena}
              group={g}
              expanded={expandedFaenas.has(g.faena)}
              onToggle={() => toggleFaena(g.faena)}
              onSelectConductor={(name) => setSelectedConductor(name)}
            />
          ))}
        </div>
      )}

      <div className="bg-amber-500/10 border border-amber-500/30 px-4 py-3">
        <div className="flex items-start gap-2">
          <Star className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs font-mono text-amber-200/80 leading-relaxed">
            <span className="font-bold text-amber-300">Ranking por percentil de rendimiento (km/L):</span>{" "}
            Cada conductor se ubica en un percentil respecto al rendimiento global de todos los conductores de la flota (independiente del filtro de faena).{" "}
            <span className="text-emerald-300">P90+ = Top 10%</span> (excelente),{" "}
            <span className="text-emerald-400/70">P75-P89 = Top 25%</span> (bueno),{" "}
            <span className="text-blue-400">P50-P74 = Sobre promedio</span>,{" "}
            <span className="text-amber-400">P25-P49 = Bajo promedio</span>,{" "}
            <span className="text-red-400">Bajo P25 = Bajo rendimiento</span>.{" "}
            <span className="font-bold text-emerald-300">Filtro de calidad:</span> solo se incluyen camiones donde la diferencia entre litros telemetria y litros surtidor sea &le;5%.{" "}
            Se excluyen conductores con &lt;2 cargas validas y rendimiento &gt;15 km/L o &le;0.{" "}
            <span className="font-bold text-amber-300">Sistema de medicion activo desde 01-03-2026.</span>
          </div>
        </div>
      </div>

      {selectedConductor && (
        <ConductorDetailModal
          conductorName={selectedConductor}
          onClose={() => setSelectedConductor(null)}
          desde={range.from}
          hasta={range.to}
        />
      )}
    </div>
  );
}
