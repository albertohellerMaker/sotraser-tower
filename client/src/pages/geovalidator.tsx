import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Map as MapIcon, CheckCircle, RefreshCw, MapPin, Clock, Gauge, Truck, ChevronDown, ChevronUp, Eye, Check, X, AlertTriangle, Cpu, Search, ArrowLeft, Route, Fuel, Users, Database, Activity, Brain, TrendingUp, Play, Loader2, RotateCcw, Info, Calendar, Droplets, Radio } from "lucide-react";
import MapaEnVivo from "./geo-tabs/mapa-en-vivo";
import ViajesCerrados from "./geo-tabs/viajes-cerrados";
import AnalisisIATab from "./geo-tabs/analisis-ia-tab";
import EstacionesTab from "./geo-tabs/estaciones-tab";

type GeoTab = "mapa" | "viajes" | "conductores" | "camiones" | "ia" | "recopilacion" | "aprendizaje" | "estaciones" | "rendimiento";

interface CamionLive {
  camionId: number;
  patente: string;
  modelo: string;
  conductor: string | null;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  rumbo: number;
  timestamp: string | null;
  estado: string;
  ageMinutes: number;
  fuelLevel: number | null;
}

interface GeoViaje {
  id: number;
  camionId: number;
  patente: string;
  contrato: string;
  origenNombre: string | null;
  destinoNombre: string | null;
  origenTimestamp: string | null;
  destinoTimestamp: string | null;
  kmGps: string | null;
  duracionMinutos: number | null;
  velocidadMaxima: string | null;
  velocidadPromedio: string | null;
  validacionEstado: string;
  validacionDetalle: any;
  sigetraKmDeltaPct: string | null;
  sigetraLitros: string | null;
  sigetraSurtidorEnRuta: boolean | null;
  validadoManualmente: boolean;
  notas: string | null;
}

interface GeoBase {
  id: number;
  nombre: string;
  lat: string;
  lng: string;
  radioMetros: number;
  contrato: string;
}

const estadoColors: Record<string, string> = {
  VALIDADO: "#00c97a",
  REVISAR: "#ffcc00",
  ANOMALIA: "#ff2244",
  PENDIENTE: "#3a6080",
};

const estadoLabels: Record<string, string> = {
  VALIDADO: "VALIDADO",
  REVISAR: "REVISAR",
  ANOMALIA: "ANOMALIA",
  PENDIENTE: "PENDIENTE",
};

function EstadoBadge({ estado }: { estado: string }) {
  const color = estadoColors[estado] || "#3a6080";
  return (
    <span className="font-exo text-[10px] font-bold px-2 py-0.5 rounded" style={{
      background: color + "20",
      border: `1px solid ${color}`,
      color,
    }} data-testid={`badge-estado-${estado}`}>
      {estadoLabels[estado] || estado}
    </span>
  );
}

function CamionStatusDot({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    EN_MOVIMIENTO: "#00c97a",
    DETENIDO_RECIENTE: "#ffcc00",
    DETENIDO: "#ff2244",
    "SIN_SEÑAL": "#3a6080",
  };
  return <div className="w-2 h-2 rounded-full" style={{ background: colors[estado] || "#3a6080" }} />;
}

function CamionesTab() {
  const CONTRATOS = [
    { id: "TODOS", label: "TODOS", color: "#c8e8ff" },
    { id: "CENCOSUD", label: "CENCOSUD", color: "#00d4ff" },
    { id: "ANGLO-COCU", label: "ANGLO-COCU", color: "#1A8FFF" },
    { id: "ANGLO-CARGAS VARIAS", label: "A-CARGAS VAR", color: "#FF6B35" },
    { id: "ANGLO-CAL", label: "ANGLO-CAL", color: "#00C49A" },
  ];

  const [contrato, setContrato] = useState("TODOS");
  const [busq, setBusq] = useState("");
  const [sortBy, setSortBy] = useState<"patente" | "diffLt" | "diffPct" | "litrosSig" | "litrosEcu">("diffLt");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const contratoColor = CONTRATOS.find(c => c.id === contrato)?.color || "#c8e8ff";

  const contractQueries = CONTRATOS.filter(c => c.id !== "TODOS");
  const queries = useQueries({
    queries: contractQueries.map(c => {
      const params = c.id === "CENCOSUD" ? "contrato=CENCOSUD" : `contrato=${c.id.split("-")[0]}&subfaena=${c.id.split("-").slice(1).join("-")}`;
      return {
        queryKey: ["/api/geo/cruce-mensual", c.id],
        queryFn: () => fetch(`/api/geo/cruce-mensual?${params}`).then(r => r.json()),
        refetchInterval: 120000,
      };
    }),
  });

  const isLoading = queries.some(q => q.isLoading);

  const q0 = queries[0]?.data;
  const q1 = queries[1]?.data;
  const q2 = queries[2]?.data;
  const q3 = queries[3]?.data;

  const allData = useMemo(() => {
    const merged: Record<string, any> = {};
    contractQueries.forEach((c, i) => {
      const data = queries[i]?.data;
      if (!data?.camiones) return;
      for (const cam of data.camiones) {
        if (!merged[cam.patente]) {
          merged[cam.patente] = { ...cam, contrato: c.id };
        }
      }
    });
    return Object.values(merged);
  }, [q0, q1, q2, q3]);

  const { filtered, sinTelemetria } = useMemo(() => {
    let list = contrato === "TODOS" ? allData : allData.filter((c: any) => c.contrato === contrato);
    if (busq.trim()) {
      const b = busq.toLowerCase();
      list = list.filter((c: any) => c.patente?.toLowerCase().includes(b));
    }
    const sortFns: Record<string, (a: any, b: any) => number> = {
      patente: (a, b) => a.patente.localeCompare(b.patente),
      diffLt: (a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia),
      diffPct: (a, b) => Math.abs(b.diferenciaPct) - Math.abs(a.diferenciaPct),
      litrosSig: (a, b) => b.litrosSigetra - a.litrosSigetra,
      litrosEcu: (a, b) => b.litrosEcu - a.litrosEcu,
    };
    const sorted = [...list].sort(sortFns[sortBy] || sortFns.diffLt);
    const confiables = sorted.filter((c: any) => (c.confianza || "BAJA") !== "BAJA");
    const noConfiables = sorted.filter((c: any) => (c.confianza || "BAJA") === "BAJA");
    return { filtered: confiables, sinTelemetria: noConfiables };
  }, [allData, contrato, busq, sortBy]);

  const totals = useMemo(() => {
    const t = { camiones: filtered.length, litrosSig: 0, litrosEcu: 0, cargas: 0, viajes: 0, km: 0 };
    for (const c of filtered) {
      t.litrosSig += c.litrosSigetra || 0;
      t.litrosEcu += c.litrosEcu || 0;
      t.cargas += c.cargasSigetra || 0;
      t.viajes += c.viajesEcu || 0;
      t.km += c.kmEcu || 0;
    }
    return t;
  }, [filtered]);

  const fN = (n: number) => Math.round(n).toLocaleString("es-CL");

  const diffColor = (diff: number, pct: number) => {
    if (Math.abs(diff) < 50) return "#00c97a";
    if (Math.abs(pct) > 30) return "#ff2244";
    if (Math.abs(pct) > 15) return "#ffcc00";
    return "#c8e8ff";
  };

  const getContratoColor = (id: string) => CONTRATOS.find(c => c.id === id)?.color || "#3a6080";

  const barMax = useMemo(() => {
    let max = 0;
    for (const c of filtered) {
      if (c.litrosSigetra > max) max = c.litrosSigetra;
      if (c.litrosEcu > max) max = c.litrosEcu;
    }
    return max || 1;
  }, [filtered]);

  return (
    <div data-testid="geo-camiones">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-space text-[16px] font-bold tracking-[0.12em]" style={{ color: "#c8e8ff" }}>
            CONSUMO ECU POR CAMION
          </h2>
          <p className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
            Acumulado mensual por camion — consumo ECU Volvo (desde 01-MAR)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {CONTRATOS.map(c => (
          <button key={c.id} onClick={() => { setContrato(c.id); setExpandedRow(null); }}
            data-testid={`camiones-filter-${c.id}`}
            className="font-exo text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all tracking-[0.08em]"
            style={{
              background: contrato === c.id ? c.color + "20" : "transparent",
              border: `1px solid ${contrato === c.id ? c.color : "#0d2035"}`,
              color: contrato === c.id ? c.color : "#3a6080",
            }}>
            {c.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar patente..."
            data-testid="camiones-search"
            className="font-exo text-[11px] pl-7 pr-3 py-1.5 rounded w-40"
            style={{ background: "#091018", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "CAMIONES", val: totals.camiones, color: contratoColor },
          { label: "LT ECU", val: fN(totals.litrosEcu), color: "#00d4ff" },
          { label: "KM VOLVO", val: fN(totals.km), color: "#3a6080" },
        ].map(k => (
          <div key={k.label} className="dash-card px-3 py-2.5" data-testid={`camiones-kpi-${k.label.toLowerCase().replace(/ /g, "-")}`}>
            <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
            <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "#3a6080" }} />
          <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Cargando datos...</div>
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          <table className="w-full" data-testid="camiones-table">
            <thead>
              <tr style={{ background: "#091018" }}>
                {[
                  { key: "patente", label: "PATENTE", w: "w-20" },
                  { key: "contrato", label: "CONTRATO", w: "w-24" },
                  { key: "litrosEcu", label: "LT ECU", w: "w-24" },
                  { key: "viajes", label: "SNAPS", w: "w-16" },
                  { key: "confianza", label: "CONFIANZA", w: "w-20" },
                  { key: "km", label: "KM ECU", w: "w-20" },
                  { key: "rend", label: "REND ECU", w: "w-16" },
                  { key: "bar", label: "COMPARATIVO", w: "flex-1" },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => ["patente", "diffLt", "diffPct", "litrosSig", "litrosEcu"].includes(col.key) ? setSortBy(col.key as any) : null}
                    className={`font-exo text-[9px] tracking-[0.12em] text-left px-2.5 py-2.5 ${col.w} ${["patente", "diffLt", "diffPct", "litrosSig", "litrosEcu"].includes(col.key) ? "cursor-pointer hover:text-[#c8e8ff]" : ""}`}
                    style={{ color: sortBy === col.key ? "#00d4ff" : "#3a6080", borderBottom: "1px solid #0d2035" }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <Fragment key={c.patente}>
                  <tr onClick={() => setExpandedRow(expandedRow === c.patente ? null : c.patente)}
                    data-testid={`camiones-row-${c.patente}`}
                    className="cursor-pointer transition-colors hover:bg-[#0d203520]"
                    style={{ borderBottom: "1px solid #0d2035" }}>
                    <td className="font-space text-[12px] font-bold px-2.5 py-2.5" style={{ color: "#00d4ff" }}>{c.patente}</td>
                    <td className="font-exo text-[10px] px-2.5 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: getContratoColor(c.contrato) + "20", color: getContratoColor(c.contrato) }}>
                        {CONTRATOS.find(ct => ct.id === c.contrato)?.label || c.contrato}
                      </span>
                    </td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#00d4ff" }}>{fN(c.litrosEcu)}</td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{c.viajesEcu}</td>
                    <td className="px-2.5 py-2.5">
                      <span className="font-exo text-[9px] font-bold px-2 py-0.5 rounded" style={{
                        background: c.confianza === "ALTA" ? "#00c97a20" : c.confianza === "MEDIA" ? "#ffcc0020" : "#ff224420",
                        color: c.confianza === "ALTA" ? "#00c97a" : c.confianza === "MEDIA" ? "#ffcc00" : "#ff2244",
                      }} data-testid={`confianza-${c.patente}`}>
                        {c.confianza || "BAJA"}
                      </span>
                    </td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{fN(c.kmEcu)}</td>
                    <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: c.rendimientoEcu > 0 && c.rendimientoEcu < 2 ? "#ff2244" : c.rendimientoEcu < 2.5 ? "#ffcc00" : "#00c97a" }}>
                      {c.rendimientoEcu > 0 ? c.rendimientoEcu.toFixed(2) : "--"}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <div className="flex items-center gap-1">
                        <div className="font-exo text-[8px] w-5" style={{ color: "#3a6080" }}>ECU</div>
                        <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: "#0d2035" }}>
                          <div className="h-full rounded-sm" style={{ width: `${Math.min((c.litrosEcu / barMax) * 100, 100)}%`, background: "#00d4ff" }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                  {expandedRow === c.patente && (
                    <tr>
                      <td colSpan={8} style={{ background: "#060d15", borderBottom: "1px solid #0d2035" }}>
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="dash-card p-3">
                              <div className="font-exo text-[8px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>KM ECU VOLVO</div>
                              <div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{fN(c.kmEcu)}</div>
                            </div>
                            <div className="dash-card p-3">
                              <div className="font-exo text-[8px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>REND ECU</div>
                              <div className="font-space text-[14px] font-bold" style={{ color: c.rendimientoEcu > 0 ? "#00d4ff" : "#3a6080" }}>
                                {c.rendimientoEcu > 0 ? `${c.rendimientoEcu.toFixed(2)} km/L` : "--"}
                              </div>
                            </div>
                            <div className="dash-card p-3">
                              <div className="font-exo text-[8px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>LT ECU CONSUMIDOS</div>
                              <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>
                                {fN(c.litrosEcu)} L
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="font-exo text-[9px] mb-1" style={{ color: "#3a6080" }}>ECU: {fN(c.litrosEcu)} L</div>
                              <div className="h-5 rounded overflow-hidden" style={{ background: "#0d2035" }}>
                                <div className="h-full rounded" style={{ width: `${Math.min((c.litrosEcu / barMax) * 100, 100)}%`, background: "#00d4ff" }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length > 0 && (
                <tr style={{ background: "#091018", borderTop: "2px solid #0d2035" }}>
                  <td className="font-space text-[11px] font-bold px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>TOTAL</td>
                  <td className="font-exo text-[10px] px-2.5 py-2.5" style={{ color: "#3a6080" }}>{filtered.length} cam</td>
                  <td className="font-space text-[11px] font-bold px-2.5 py-2.5" style={{ color: "#00d4ff" }}>{fN(totals.litrosEcu)}</td>
                  <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{fN(totals.viajes)}</td>
                  <td />
                  <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: "#c8e8ff" }}>{fN(totals.km)}</td>
                  <td className="font-space text-[11px] px-2.5 py-2.5" style={{ color: totals.km > 0 && totals.litrosEcu > 0 ? "#00c97a" : "#3a6080" }}>
                    {totals.litrosEcu > 0 ? (totals.km / totals.litrosEcu).toFixed(2) : "--"}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Truck className="w-8 h-8 mx-auto mb-3" style={{ color: "#3a6080" }} />
              <div className="font-space text-[13px] font-bold" style={{ color: "#3a6080" }}>Sin camiones</div>
            </div>
          )}
        </div>
      )}

      {sinTelemetria.length > 0 && !isLoading && (
        <div className="mt-5" data-testid="sin-telemetria-section">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" style={{ color: "#3a6080" }} />
            <h3 className="font-space text-[13px] font-bold tracking-[0.1em]" style={{ color: "#3a6080" }}>
              SIN TELEMETRIA SUFICIENTE
            </h3>
            <span className="font-exo text-[10px] px-2 py-0.5 rounded" style={{ background: "#ff224415", color: "#ff2244" }}>
              {sinTelemetria.length} camiones — menos de 5 snapshots ECU
            </span>
          </div>
          <p className="font-exo text-[10px] mb-3" style={{ color: "#3a6080" }}>
            Estos camiones tienen datos ECU insuficientes para un cruce confiable. Excluidos del analisis principal.
          </p>
          <div className="dash-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ background: "#091018" }}>
                  {["PATENTE", "CONTRATO", "LT ECU", "SNAPS", "CONFIANZA"].map(h => (
                    <th key={h} className="font-exo text-[9px] tracking-[0.12em] text-left px-2.5 py-2"
                      style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sinTelemetria.map((c: any) => (
                  <tr key={c.patente} style={{ borderBottom: "1px solid #0d203530" }} data-testid={`sin-tel-row-${c.patente}`}>
                    <td className="font-space text-[11px] font-bold px-2.5 py-2" style={{ color: "#3a6080" }}>{c.patente}</td>
                    <td className="font-exo text-[10px] px-2.5 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: getContratoColor(c.contrato) + "20", color: getContratoColor(c.contrato) }}>
                        {CONTRATOS.find(ct => ct.id === c.contrato)?.label || c.contrato}
                      </span>
                    </td>
                    <td className="font-space text-[11px] px-2.5 py-2" style={{ color: "#3a6080" }}>{fN(c.litrosEcu)}</td>
                    <td className="font-space text-[11px] px-2.5 py-2" style={{ color: "#3a6080" }}>{c.viajesEcu}</td>
                    <td className="px-2.5 py-2">
                      <span className="font-exo text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "#ff224420", color: "#ff2244" }}>
                        BAJA
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const CONTRATOS_GEO = [
  { id: "CENCOSUD", label: "CENCOSUD", color: "#00d4ff" },
  { id: "ANGLO", label: "ANGLO", color: "#FF6B35", subfaenas: [
    { id: "ANGLO-COCU", label: "COCU", color: "#1A8FFF" },
    { id: "ANGLO-CARGAS VARIAS", label: "CARGAS VARIAS", color: "#FF6B35" },
    { id: "ANGLO-CAL", label: "CAL", color: "#00C49A" },
  ]},
];

function ConductoresTab() {
  const [selectedContrato, setSelectedContrato] = useState("CENCOSUD");
  const [selectedSubfaena, setSelectedSubfaena] = useState("");

  const contratoParam = selectedContrato;
  const subfaenaParam = selectedSubfaena;

  const { data: conductoresData, isLoading } = useQuery<any>({
    queryKey: ["/api/geo/conductores", contratoParam, subfaenaParam],
    queryFn: async () => {
      let url = `/api/geo/conductores?contrato=${encodeURIComponent(contratoParam)}`;
      if (subfaenaParam) url += `&subfaena=${encodeURIComponent(subfaenaParam)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const [expandedConductor, setExpandedConductor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"litros" | "rend_asc" | "rend_desc">("litros");

  const activeColor = selectedSubfaena
    ? (CONTRATOS_GEO.find(c => c.id === "ANGLO")?.subfaenas?.find(s => s.id === selectedSubfaena)?.color || "#FF6B35")
    : (CONTRATOS_GEO.find(c => c.id === selectedContrato)?.color || "#00d4ff");

  const filtered = useMemo(() => {
    if (!conductoresData?.conductores) return [];
    let list = conductoresData.conductores;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((c: any) =>
        c.nombre.toLowerCase().includes(term) || c.camiones.some((p: string) => p.includes(term))
      );
    }
    if (sortBy === "rend_asc") {
      list = [...list].sort((a: any, b: any) => (a.rendimiento || 999) - (b.rendimiento || 999));
    } else if (sortBy === "rend_desc") {
      list = [...list].sort((a: any, b: any) => (b.rendimiento || 0) - (a.rendimiento || 0));
    }
    return list;
  }, [conductoresData, searchTerm, sortBy]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#00d4ff" }} />
    </div>
  );

  return (
    <div data-testid="conductores-tab">
      <div className="flex items-center gap-2 mb-3">
        {CONTRATOS_GEO.map(c => (
          <button key={c.id}
            onClick={() => { setSelectedContrato(c.id); setSelectedSubfaena(""); setExpandedConductor(null); }}
            data-testid={`btn-contrato-${c.id}`}
            className="font-space text-[10px] font-bold tracking-wider px-3 py-1.5 cursor-pointer transition-all"
            style={{
              background: selectedContrato === c.id ? c.color + "20" : "#0a1520",
              border: `1px solid ${selectedContrato === c.id ? c.color : "#0d2035"}`,
              color: selectedContrato === c.id ? c.color : "#3a6080",
            }}>
            {c.label}
          </button>
        ))}
        {selectedContrato === "ANGLO" && CONTRATOS_GEO.find(c => c.id === "ANGLO")?.subfaenas?.map(sf => (
          <button key={sf.id}
            onClick={() => { setSelectedSubfaena(selectedSubfaena === sf.id ? "" : sf.id); setExpandedConductor(null); }}
            data-testid={`btn-subfaena-${sf.id}`}
            className="font-space text-[9px] font-bold tracking-wider px-2.5 py-1 cursor-pointer transition-all"
            style={{
              background: selectedSubfaena === sf.id ? sf.color + "20" : "#0a1520",
              border: `1px solid ${selectedSubfaena === sf.id ? sf.color : "#0d2035"}`,
              color: selectedSubfaena === sf.id ? sf.color : "#3a6080",
            }}>
            {sf.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: activeColor }}>
            CONDUCTORES {selectedSubfaena || selectedContrato}
          </div>
          <div className="font-exo text-[10px] px-2 py-0.5 rounded" style={{ background: activeColor + "15", border: `1px solid ${activeColor}30`, color: activeColor }}>
            {conductoresData?.totalConductores || 0} conductores
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            Desde {conductoresData?.desde || "01-03-2026"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {([
              { id: "litros" as const, label: "Mas litros" },
              { id: "rend_asc" as const, label: "Peor rend" },
              { id: "rend_desc" as const, label: "Mejor rend" },
            ]).map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                data-testid={`btn-sort-${s.id}`}
                className="font-exo text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer transition-all"
                style={{
                  background: sortBy === s.id ? (s.id === "rend_asc" ? "#ff224420" : s.id === "rend_desc" ? "#00c97a20" : "#00d4ff15") : "#0d203530",
                  border: `1px solid ${sortBy === s.id ? (s.id === "rend_asc" ? "#ff2244" : s.id === "rend_desc" ? "#00c97a" : "#00d4ff") : "#0d2035"}`,
                  color: sortBy === s.id ? (s.id === "rend_asc" ? "#ff2244" : s.id === "rend_desc" ? "#00c97a" : "#00d4ff") : "#3a6080",
                }}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#3a6080" }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar conductor o patente..."
              data-testid="input-search-conductor"
              className="pl-7 pr-3 py-1.5 rounded font-exo text-[11px]"
              style={{ background: "#0d203550", border: "1px solid #0d2035", color: "#c8e8ff", width: "220px" }}
            />
          </div>
        </div>
      </div>

      <div className="rounded overflow-hidden" style={{ border: "1px solid #0d2035" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "#0d203540" }}>
              {["CONDUCTOR", "CAMIONES", "CARGAS", "LITROS TOTAL", "KM TOTAL", "REND km/L", "ULT. CARGA"].map(h => (
                <th key={h} className="px-3 py-2 text-left font-space text-[10px] font-bold tracking-wider" style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((cond: any) => (
              <Fragment key={cond.nombre}>
                <tr
                  onClick={() => setExpandedConductor(expandedConductor === cond.nombre ? null : cond.nombre)}
                  className="cursor-pointer transition-all"
                  style={{
                    background: expandedConductor === cond.nombre ? "#00d4ff08" : "transparent",
                    borderBottom: "1px solid #0d203540",
                  }}
                  data-testid={`row-conductor-${cond.nombre.replace(/[^a-zA-Z]/g, "").slice(0, 15)}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#00d4ff" }} />
                      <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{cond.nombre}</span>
                      {expandedConductor === cond.nombre ? <ChevronUp className="w-3 h-3" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "#3a6080" }} />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {cond.camiones.map((p: string) => (
                        <span key={p} className="font-space text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#ff660015", border: "1px solid #ff660030", color: "#ff6600" }}>{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-space text-[11px]" style={{ color: "#c8e8ff" }}>{cond.cargas}</td>
                  <td className="px-3 py-2 font-space text-[11px] font-bold" style={{ color: "#ff6600" }}>{Math.round(cond.litrosTotales).toLocaleString("es-CL")} L</td>
                  <td className="px-3 py-2 font-space text-[11px]" style={{ color: "#c8e8ff" }}>{cond.kmTotales > 0 ? cond.kmTotales.toLocaleString("es-CL") : "--"}</td>
                  <td className="px-3 py-2 font-space text-[11px] font-bold" style={{ color: cond.rendimiento >= 3.5 ? "#00c97a" : cond.rendimiento > 0 ? "#ff2244" : "#3a6080" }}>
                    {cond.rendimiento > 0 ? cond.rendimiento.toFixed(2) : "--"}
                  </td>
                  <td className="px-3 py-2 font-exo text-[10px]" style={{ color: "#3a6080" }}>
                    {cond.ultimaCarga ? new Date(cond.ultimaCarga).toLocaleDateString("es-CL") : "--"}
                  </td>
                </tr>
                {expandedConductor === cond.nombre && (
                  <tr>
                    <td colSpan={7} className="px-3 py-2" style={{ background: "#0d203515" }}>
                      <div className="ml-6 space-y-1 max-h-[300px] overflow-y-auto">
                        <div className="font-space text-[10px] font-bold tracking-wider mb-2" style={{ color: "#00d4ff" }}>
                          DETALLE DE CARGAS ({cond.cargasDetalle.length})
                        </div>
                        {cond.cargasDetalle.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-1.5 rounded" style={{ background: "#0d203530", border: "1px solid #0d203560" }}>
                            <span className="font-exo text-[10px] w-24 flex-shrink-0" style={{ color: "#c8e8ff" }}>
                              {new Date(c.fecha).toLocaleDateString("es-CL")} {new Date(c.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="font-space text-[10px] font-bold w-14 text-right flex-shrink-0" style={{ color: "#ff6600" }}>{c.litros.toFixed(1)} L</span>
                            <span className="font-space text-[10px] w-12 flex-shrink-0 px-1.5 py-0.5 rounded text-center" style={{ background: "#ff660015", border: "1px solid #ff660030", color: "#ff6600" }}>{c.patente}</span>
                            <span className="font-exo text-[9px] flex-1 truncate" style={{ color: "#3a6080" }}>{c.lugar}</span>
                            <span className="font-exo text-[9px] w-16 text-right flex-shrink-0" style={{ color: "#3a6080" }}>{c.km > 0 ? `${c.km.toLocaleString("es-CL")} km` : "--"}</span>
                            <span className="font-space text-[10px] w-16 text-right flex-shrink-0 font-bold" style={{ color: c.rend >= 3.5 ? "#00c97a" : c.rend > 0 && c.rend < 100 ? "#ff2244" : "#3a6080" }}>
                              {c.rend > 0 && c.rend < 100 ? `${c.rend.toFixed(2)} km/L` : "--"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecopilacionTab() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/geo/stats"],
    refetchInterval: 30000,
  });

  const ingestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/geo/ingest-volvo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geo/stats"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} />
      </div>
    );
  }

  const kpis = [
    { label: "PUNTOS GPS TOTAL", value: stats?.totalPuntos?.toLocaleString() || "0", color: "#00d4ff" },
    { label: "CAMIONES RASTREADOS", value: stats?.totalCamiones || 0, color: "#00c97a" },
    { label: "PUNTOS HOY", value: stats?.puntosHoy?.toLocaleString() || "0", color: "#ffcc00" },
    { label: "PUNTOS 7 DIAS", value: stats?.puntos7d?.toLocaleString() || "0", color: "#ff6600" },
  ];

  return (
    <div data-testid="recopilacion-tab">
      <div className="flex items-center justify-between mb-4">
        <div className="font-exo text-[13px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
          RECOPILACION DE DATOS GPS
        </div>
        <button
          onClick={() => ingestMutation.mutate()}
          disabled={ingestMutation.isPending}
          data-testid="button-ingest-manual"
          className="flex items-center gap-2 px-4 py-2 font-exo text-[11px] font-bold tracking-wider rounded cursor-pointer"
          style={{
            background: "rgba(0,212,255,0.12)",
            border: "1px solid #00d4ff",
            color: "#00d4ff",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${ingestMutation.isPending ? "animate-spin" : ""}`} />
          {ingestMutation.isPending ? "INGESTING..." : "INGESTAR AHORA"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-lg p-4" style={{
            background: "rgba(6,13,20,0.6)",
            border: `1px solid ${k.color}30`,
          }} data-testid={`kpi-recopilacion-${i}`}>
            <div className="font-exo text-[10px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
              {k.label}
            </div>
            <div className="font-space text-[24px] font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg p-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
            PRIMER PUNTO REGISTRADO
          </div>
          <div className="font-space text-[14px]" style={{ color: "#c8e8ff" }}>
            {stats?.primerPunto ? new Date(stats.primerPunto).toLocaleString("es-CL") : "---"}
          </div>
        </div>
        <div className="rounded-lg p-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
            ULTIMO PUNTO REGISTRADO
          </div>
          <div className="font-space text-[14px]" style={{ color: "#c8e8ff" }}>
            {stats?.ultimoPunto ? new Date(stats.ultimoPunto).toLocaleString("es-CL") : "---"}
          </div>
        </div>
      </div>

      <div className="rounded-lg p-4" style={{
        background: "rgba(6,13,20,0.6)",
        border: "1px solid #0d2035",
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <div className="font-exo text-[12px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
            HISTORIAL DIARIO (ULTIMOS 14 DIAS)
          </div>
        </div>
        <div className="font-exo text-[10px] tracking-wider mb-2" style={{ color: "#3a6080" }}>
          INGESTION AUTOMATICA CADA 5 MINUTOS - TODOS LOS CONTRATOS
        </div>

        {stats?.porDia?.length > 0 ? (
          <div className="space-y-1">
            <div className="grid grid-cols-[120px_1fr_80px_80px] gap-2 py-1 border-b" style={{ borderColor: "#0d2035" }}>
              <div className="font-exo text-[10px] font-bold tracking-wider" style={{ color: "#3a6080" }}>FECHA</div>
              <div className="font-exo text-[10px] font-bold tracking-wider" style={{ color: "#3a6080" }}>VOLUMEN</div>
              <div className="font-exo text-[10px] font-bold tracking-wider text-right" style={{ color: "#3a6080" }}>PUNTOS</div>
              <div className="font-exo text-[10px] font-bold tracking-wider text-right" style={{ color: "#3a6080" }}>CAMIONES</div>
            </div>
            {stats.porDia.map((d: any, i: number) => {
              const maxPuntos = Math.max(...stats.porDia.map((x: any) => x.puntos));
              const pct = maxPuntos > 0 ? (d.puntos / maxPuntos) * 100 : 0;
              return (
                <div key={i} className="grid grid-cols-[120px_1fr_80px_80px] gap-2 py-1.5 items-center" data-testid={`row-dia-${i}`}>
                  <div className="font-space text-[12px]" style={{ color: "#c8e8ff" }}>
                    {new Date(d.dia).toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short" })}
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, #00d4ff, #00c97a)`,
                    }} />
                  </div>
                  <div className="font-space text-[12px] text-right" style={{ color: "#00d4ff" }}>
                    {d.puntos.toLocaleString()}
                  </div>
                  <div className="font-space text-[12px] text-right" style={{ color: "#00c97a" }}>
                    {d.camiones}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Database className="w-8 h-8 mx-auto mb-2" style={{ color: "#3a6080" }} />
            <div className="font-exo text-[12px]" style={{ color: "#3a6080" }}>
              SIN DATOS AUN - LA INGESTION AUTOMATICA COMENZARA A ACUMULAR PUNTOS GPS
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg p-4" style={{
        background: "rgba(0,212,255,0.05)",
        border: "1px solid rgba(0,212,255,0.15)",
      }}>
        <div className="font-exo text-[11px] font-bold tracking-wider mb-2" style={{ color: "#00d4ff" }}>
          COMO FUNCIONA LA RECOPILACION
        </div>
        <div className="font-rajdhani text-[13px] leading-relaxed space-y-1" style={{ color: "#6a90aa" }}>
          <p>Cada 5 minutos se consulta Volvo Connect por la posicion GPS de todos los camiones con VIN registrado.</p>
          <p>Los puntos se almacenan con coordenadas, velocidad, rumbo y odometro para reconstruir viajes.</p>
          <p>Con suficientes datos se podran detectar patrones: rutas habituales, paradas sospechosas, desvios y tiempos muertos.</p>
          <p>Mientras mas datos se acumulen, mejor sera la deteccion de anomalias en el comportamiento de cada camion.</p>
        </div>
      </div>
    </div>
  );
}

function AprendizajeTab() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/viajes/stats"],
  });

  const { data: progress } = useQuery<any>({
    queryKey: ["/api/viajes/sync-progress"],
    refetchInterval: 30000,
  });

  const { data: autoSyncStatus } = useQuery<any>({
    queryKey: ["/api/viajes/auto-sync"],
    refetchInterval: 30000,
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

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/viajes/recalcular-scores"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/stats"] });
    },
  });

  const corredoresMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/viajes/clusterizar-corredores"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/viajes/corredores"] });
      recalcMutation.mutate();
    },
  });

  const { data: corredores } = useQuery<any[]>({
    queryKey: ["/api/viajes/corredores"],
  });

  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [showExplicacion, setShowExplicacion] = useState(false);

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

  const anomalias = filtroEstado === "todos"
    ? stats?.anomalias || []
    : (stats?.anomalias || []).filter((a: any) => a.estado === filtroEstado);

  return (
    <div data-testid="data-viajes-tab">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <div className="font-exo text-[13px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
            DATA VIAJES
          </div>
          <button onClick={() => setShowExplicacion(!showExplicacion)}
            data-testid="button-explicacion"
            className="px-2 py-1 font-exo text-[9px] font-bold tracking-wider rounded cursor-pointer"
            style={{ background: "#00d4ff15", border: "1px solid #00d4ff40", color: "#00d4ff" }}>
            {showExplicacion ? "CERRAR" : "QUE HACE?"}
          </button>
        </div>
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-2 px-3 py-1.5 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
            style={{
              background: autoSyncStatus?.active ? "rgba(0,201,122,0.12)" : "rgba(58,96,128,0.1)",
              border: `1px solid ${autoSyncStatus?.active ? "#00c97a" : "#3a6080"}`,
              color: autoSyncStatus?.active ? "#00c97a" : "#3a6080",
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{
              background: autoSyncStatus?.active ? "#00c97a" : "#3a608050",
              boxShadow: autoSyncStatus?.active ? "0 0 6px #00c97a80" : "none",
            }} />
            SYNC AUTO
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || progress?.status === "running"}
            data-testid="button-sync-viajes"
            className="flex items-center gap-2 px-3 py-1.5 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
            style={{
              background: "rgba(0,212,255,0.12)",
              border: "1px solid #00d4ff",
              color: "#00d4ff",
              opacity: progress?.status === "running" ? 0.5 : 1,
            }}
          >
            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            SYNC
          </button>
          <button
            onClick={() => corredoresMutation.mutate()}
            disabled={corredoresMutation.isPending || recalcMutation.isPending}
            data-testid="button-clusterizar"
            className="flex items-center gap-2 px-3 py-1.5 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
            style={{
              background: "rgba(0,255,136,0.08)",
              border: "1px solid #00ff8840",
              color: "#00ff88",
              opacity: corredoresMutation.isPending ? 0.5 : 1,
            }}
          >
            <Route className="w-3 h-3" />
            APRENDER RUTAS
          </button>
        </div>
      </div>

      {showExplicacion && (
        <div className="rounded-lg p-4 mb-4" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid #00d4ff30" }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-3" style={{ color: "#00d4ff" }}>
            COMO FUNCIONA DATA VIAJES
          </div>
          <div className="space-y-2 font-exo text-[11px]" style={{ color: "#6a90aa" }}>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#00d4ff" }} />
              <span><strong style={{ color: "#c8e8ff" }}>SYNC</strong> — Toma los datos ECU de Volvo Connect (combustible, km, velocidad) y los puntos GPS para reconstruir viajes automaticamente. Un viaje empieza cuando el camion se mueve y termina cuando se detiene mas de 90 minutos en ruta general, hasta 8 horas en base o 6 horas en faena minera. El sistema adapta el umbral segun el lugar.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#00ff88" }} />
              <span><strong style={{ color: "#c8e8ff" }}>APRENDER RUTAS</strong> — Agrupa los viajes por origen y destino con radio adaptativo (1-8km segun distancia del viaje) y separados por contrato. Cada corredor guarda el rendimiento promedio, desviacion, km y duracion tipica de esa ruta.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ffcc00" }} />
              <span><strong style={{ color: "#c8e8ff" }}>SCORE INTELIGENTE</strong> — Cada viaje se compara contra el promedio de su corredor especifico. Un camion en ruta Santiago-Temuco se evalua contra otros viajes Santiago-Temuco, no contra un numero fijo. Si el corredor no tiene suficientes viajes (min 5), se usa el promedio del contrato como referencia.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ff2244" }} />
              <span><strong style={{ color: "#c8e8ff" }}>ANOMALIAS</strong> — Los viajes con rendimiento muy por debajo del corredor (mas de 2 desviaciones estandar) se marcan como anomalia. A mas viajes acumulados, mas preciso el scoring.</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-6 gap-3 mb-4">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-lg p-3" style={{
            background: "rgba(6,13,20,0.6)",
            border: `1px solid ${k.color}30`,
          }} data-testid={`kpi-data-viajes-${i}`}>
            <div className="font-exo text-[9px] font-bold tracking-wider mb-1" style={{ color: "#3a6080" }}>
              {k.label}
            </div>
            <div className="font-space text-[20px] font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {(corredores || []).length > 0 && (
        <div className="rounded-lg p-4 mb-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-exo text-[11px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
              CORREDORES APRENDIDOS ({(corredores || []).length} rutas)
            </div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
              Baselines de rendimiento por ruta — min {MIN_VIAJES_CORREDOR} viajes
            </div>
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_100px_80px_70px_70px_60px] gap-2 py-1 border-b" style={{ borderColor: "#0d2035" }}>
              {["CORREDOR", "CONTRATO", "REND PROM", "DESV", "KM PROM", "VIAJES"].map(h => (
                <div key={h} className="font-exo text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
              ))}
            </div>
            {(corredores || []).slice(0, 15).map((c: any, i: number) => {
              const rendColor = c.rendimientoPromedio >= 3.5 ? "#00c97a" : c.rendimientoPromedio >= 2.5 ? "#ffcc00" : "#ff2244";
              return (
                <div key={i} className="grid grid-cols-[1fr_100px_80px_70px_70px_60px] gap-2 py-1.5 items-center"
                  data-testid={`row-corredor-${i}`}
                  style={{ borderBottom: "1px solid rgba(13,32,53,0.3)" }}>
                  <div className="font-exo text-[10px] truncate" style={{ color: "#c8e8ff" }}>
                    {c.nombre}
                  </div>
                  <div className="font-exo text-[9px] truncate" style={{ color: "#3a6080" }}>
                    {c.contrato}
                  </div>
                  <div className="font-space text-[11px] font-bold" style={{ color: rendColor }}>
                    {c.rendimientoPromedio.toFixed(2)} km/L
                  </div>
                  <div className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                    +/-{c.rendimientoDesviacion.toFixed(2)}
                  </div>
                  <div className="font-space text-[10px]" style={{ color: "#4a7090" }}>
                    {c.kmPromedio.toFixed(0)} km
                  </div>
                  <div className="font-space text-[10px] text-center" style={{ color: "#4a7090" }}>
                    {c.totalViajes}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats?.porContrato?.length > 0 && (
        <div className="rounded-lg p-4 mb-4" style={{
          background: "rgba(6,13,20,0.6)",
          border: "1px solid #0d2035",
        }}>
          <div className="font-exo text-[11px] font-bold tracking-wider mb-3" style={{ color: "#c8e8ff" }}>
            RENDIMIENTO POR CONTRATO (km/L promedio ECU)
          </div>
          <div className="space-y-2">
            {stats.porContrato.map((c: any, i: number) => {
              const maxRend = Math.max(...stats.porContrato.map((x: any) => x.rendimientoAvg || 0));
              const pct = maxRend > 0 ? ((c.rendimientoAvg || 0) / maxRend) * 100 : 0;
              const rendColor = (c.rendimientoAvg || 0) >= 3.5 ? "#00c97a" : (c.rendimientoAvg || 0) >= 2.5 ? "#ffcc00" : "#ff2244";
              return (
                <div key={i} className="grid grid-cols-[180px_1fr_80px_80px_60px] gap-2 items-center" data-testid={`row-contrato-${i}`}>
                  <div className="font-exo text-[11px] font-bold truncate" style={{ color: "#c8e8ff" }}>
                    {c.contrato}
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      background: rendColor,
                    }} />
                  </div>
                  <div className="font-space text-[12px] text-right font-bold" style={{ color: rendColor }}>
                    {c.rendimientoAvg ?? "--"} km/L
                  </div>
                  <div className="font-space text-[11px] text-right" style={{ color: "#3a6080" }}>
                    {c.kmAvg} km avg
                  </div>
                  <div className="font-space text-[11px] text-right" style={{ color: "#3a6080" }}>
                    {c.count} viajes
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg p-4" style={{
        background: "rgba(6,13,20,0.6)",
        border: "1px solid #0d2035",
      }}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-exo text-[11px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>
            VIAJES CON ANOMALIAS DETECTADAS
          </div>
          <div className="flex gap-1">
            {["todos", "REVISAR", "ANOMALIA"].map(est => (
              <button key={est} onClick={() => setFiltroEstado(est)}
                data-testid={`filter-estado-${est}`}
                className="px-3 py-1 font-exo text-[10px] font-bold tracking-wider rounded cursor-pointer"
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
          <div className="space-y-1">
            <div className="grid grid-cols-[70px_90px_80px_65px_65px_65px_85px_1fr_40px] gap-2 py-1 border-b" style={{ borderColor: "#0d2035" }}>
              {["PATENTE", "CONTRATO", "FECHA", "KM ECU", "L ECU", "REND", "CUADRATURA", "CORREDOR", "SC"].map(h => (
                <div key={h} className="font-exo text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>{h}</div>
              ))}
            </div>
            {anomalias.map((a: any, i: number) => {
              const rend = parseFloat(a.rendimiento_real) || 0;
              const corrRend = parseFloat(a.corredor_rend_promedio) || 0;
              const rendColor = corrRend > 0
                ? (rend >= corrRend * 0.85 ? "#00c97a" : rend >= corrRend * 0.7 ? "#ffcc00" : "#ff2244")
                : (rend >= 3.5 ? "#00c97a" : rend >= 2.5 ? "#ffcc00" : "#ff2244");
              const score = a.score_anomalia || 0;
              const scoreColor = score >= 50 ? "#ff2244" : score >= 20 ? "#ffcc00" : "#00c97a";
              const litrosSigetra = parseFloat(a.litros_cargados_sigetra || 0);
              const delta = a.delta_cuadratura != null ? parseFloat(a.delta_cuadratura) : null;
              const cruzado = a.sigetra_cruzado === true;
              return (
                <div key={i} className="grid grid-cols-[70px_90px_80px_65px_65px_65px_85px_1fr_40px] gap-2 py-1.5 items-center"
                  data-testid={`row-anomalia-${i}`}
                  style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}>
                  <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</div>
                  <div className="font-exo text-[9px] truncate" style={{ color: "#3a6080" }}>{a.contrato}</div>
                  <div className="font-space text-[10px]" style={{ color: "#6a90aa" }}>
                    {a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "--"}
                  </div>
                  <div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{parseFloat(a.km_ecu || 0).toFixed(0)} km</div>
                  <div className="font-space text-[10px]" style={{ color: "#00d4ff" }}>{parseFloat(a.litros_consumidos_ecu || 0).toFixed(1)} L</div>
                  <div className="font-space text-[11px] font-bold" style={{ color: rendColor }}>
                    {rend.toFixed(2)}
                    {corrRend > 0 && (
                      <span className="font-exo text-[8px] ml-0.5" style={{ color: "#3a6080" }}>/{corrRend.toFixed(1)}</span>
                    )}
                  </div>
                  <div className="font-exo text-[9px]" style={{ color: !cruzado ? "#3a6080" : delta != null && delta > 15 ? "#ff2244" : delta != null && delta > 0 ? "#ffcc00" : "#4a7090" }}>
                    {!cruzado ? (
                      <span style={{ color: "#3a608060" }}>PENDIENTE</span>
                    ) : litrosSigetra > 0 ? (
                      <span>{litrosSigetra.toFixed(0)}L surt {delta != null ? (delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)) + "L" : ""}</span>
                    ) : (
                      <span style={{ color: "#3a608060" }}>SIN MATCH</span>
                    )}
                  </div>
                  <div className="font-exo text-[9px] truncate" style={{ color: a.corredor_nombre ? "#4a7090" : "#1e3a50" }}>
                    {a.corredor_nombre || (a.origen_nombre && a.destino_nombre ? `${a.origen_nombre} → ${a.destino_nombre}` : "--")}
                  </div>
                  <div className="font-space text-[11px] font-bold text-center" style={{ color: scoreColor }}>{score}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: "#00c97a" }} />
            <div className="font-exo text-[12px]" style={{ color: "#3a6080" }}>
              {stats?.totalViajes > 0 ? "SIN ANOMALIAS EN EL FILTRO SELECCIONADO" : "EJECUTAR SYNC PARA ANALIZAR VIAJES"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const MIN_VIAJES_CORREDOR = 5;

const CONTRATO_COLORS: Record<string, string> = {
  "CENCOSUD": "#00d4ff",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-COCU": "#00ff88",
};

function RendimientoECUTab() {
  const { data: rendData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/geo/rendimiento-contratos"],
    refetchInterval: 300000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: '#4a7090' }}>Cargando rendimiento...</span>
      </div>
    );
  }

  const contratos = rendData || [];
  const maxRend = Math.max(...contratos.map((c: any) => c.rendimiento_promedio || 0), 5);
  const allBajoMeta = contratos.flatMap((c: any) => c.bajo_meta || []);

  return (
    <div data-testid="rendimiento-ecu-tab">
      <div className="mb-4">
        <div className="font-space text-[16px] font-bold tracking-[0.15em]" style={{ color: '#00d4ff' }}>
          RENDIMIENTO ECU POR CONTRATO
        </div>
        <div className="font-exo text-[11px] tracking-wider mt-1" style={{ color: '#4a7090' }}>
          Basado en datos Volvo Connect (ultimos 7 dias)
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {contratos.map((c: any) => {
          const color = CONTRATO_COLORS[c.nombre] || c.color || '#00d4ff';
          const rend = c.rendimiento_promedio || 0;
          const meta = c.meta_kmL || 2.1;
          const pct = Math.min((rend / maxRend) * 100, 100);
          const cumpleMeta = rend >= meta;

          return (
            <div key={c.nombre} className="p-3" style={{ background: '#091018', border: '1px solid #0d2035' }} data-testid={`rend-contrato-${c.nombre}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="font-exo text-[12px] font-bold tracking-wider" style={{ color: '#c8e8ff' }}>{c.nombre}</span>
                  <span className="font-rajdhani text-[11px]" style={{ color: '#4a7090' }}>
                    {c.camiones_con_datos}/{c.camiones_total} camiones
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-space text-[14px] font-bold" style={{ color }}>{rend > 0 ? rend.toFixed(1) : '-'} km/L</span>
                  <span className="font-rajdhani text-[11px]" style={{ color: '#4a7090' }}>meta {meta.toFixed(2)}</span>
                  <span className="font-space text-[12px]" style={{ color: cumpleMeta ? '#00ff88' : '#ffcc00' }}>
                    {cumpleMeta ? '\u2713' : '\u26A0'}
                  </span>
                </div>
              </div>
              <div className="h-3 rounded-sm overflow-hidden" style={{ background: '#0a1520' }}>
                <div className="h-full rounded-sm transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}33, ${color})`,
                  }}
                />
              </div>
              {(c.bajo_meta?.length || 0) > 0 && (
                <div className="font-rajdhani text-[11px] mt-1" style={{ color: '#ff2244' }}>
                  {c.bajo_meta.length} camion{c.bajo_meta.length > 1 ? 'es' : ''} bajo meta (&lt;70%)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allBajoMeta.length > 0 && (
        <div>
          <div className="font-exo text-[12px] font-bold tracking-wider mb-2" style={{ color: '#ff2244' }}>
            CAMIONES BAJO META
          </div>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #0d2035' }}>
                <th className="text-left font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>PATENTE</th>
                <th className="text-left font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>CONTRATO</th>
                <th className="text-right font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>REND. REAL</th>
                <th className="text-right font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>META</th>
                <th className="text-right font-exo text-[10px] font-bold tracking-wider py-2 px-2" style={{ color: '#4a7090' }}>DIFERENCIA</th>
              </tr>
            </thead>
            <tbody>
              {allBajoMeta.map((cam: any, idx: number) => (
                <tr key={`${cam.patente}-${idx}`} style={{
                  borderBottom: '1px solid #0a1520',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(9,16,24,0.5)',
                }} data-testid={`rend-bajo-${cam.patente}`}>
                  <td className="font-space text-[12px] font-bold py-2 px-2" style={{ color: '#c8e8ff' }}>{cam.patente}</td>
                  <td className="font-rajdhani text-[12px] py-2 px-2" style={{ color: CONTRATO_COLORS[cam.contrato] || '#c8e8ff' }}>{cam.contrato}</td>
                  <td className="font-space text-[12px] text-right py-2 px-2" style={{ color: '#ff2244' }}>
                    {cam.rendimiento_real != null ? `${cam.rendimiento_real} km/L` : '-'}
                  </td>
                  <td className="font-space text-[12px] text-right py-2 px-2" style={{ color: '#4a7090' }}>{cam.meta?.toFixed(2)}</td>
                  <td className="font-space text-[12px] text-right py-2 px-2" style={{ color: '#ff2244' }}>
                    {cam.diferencia_pct != null ? `${cam.diferencia_pct}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 font-rajdhani text-[11px]" style={{ color: '#4a7090' }}>
        Solo camiones con telemetria Volvo activa. Datos de los ultimos 7 dias.
      </div>
    </div>
  );
}

export default function GeoValidator({ initialTab }: { initialTab?: GeoTab } = {}) {
  const [tab, setTab] = useState<GeoTab>(initialTab || "mapa");

  const subtabs: { id: GeoTab; label: string; icon: typeof MapIcon }[] = [
    { id: "mapa", label: "MAPA", icon: MapIcon },
    { id: "recopilacion", label: "RECOPILACION", icon: Database },
    { id: "aprendizaje", label: "DATA VIAJES", icon: TrendingUp },
    { id: "viajes", label: "VIAJES CERRADOS", icon: Route },
    { id: "rendimiento", label: "RENDIMIENTO", icon: Gauge },
    { id: "estaciones", label: "ESTACIONES", icon: Fuel },
    { id: "conductores", label: "CONDUCTORES", icon: Users },
    { id: "camiones", label: "CAMIONES", icon: Truck },
    { id: "ia", label: "IA", icon: Cpu },
  ];

  return (
    <div data-testid="geovalidator">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="font-space text-[18px] font-bold tracking-[0.2em]" style={{ color: "#00d4ff" }}>
            GEOVALIDATOR
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {subtabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                data-testid={`geo-tab-${t.id}`}
                className={`flex items-center gap-1.5 px-3 py-2 font-exo text-[10px] font-bold tracking-[0.12em] cursor-pointer transition-all border-b-2 ${
                  tab === t.id
                    ? "border-[#00d4ff] text-[#00d4ff]"
                    : "border-transparent text-[#4a7090] hover:text-[#c8e8ff]"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "mapa" && <MapaEnVivo />}
      {tab === "recopilacion" && <RecopilacionTab />}
      {tab === "aprendizaje" && <AprendizajeTab />}
      {tab === "viajes" && <ViajesCerrados />}
      {tab === "rendimiento" && <RendimientoECUTab />}
      {tab === "estaciones" && <EstacionesTab />}
      {tab === "conductores" && <ConductoresTab />}
      {tab === "camiones" && <CamionesTab />}
      {tab === "ia" && <AnalisisIATab />}
    </div>
  );
}
