import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, MapPin, Fuel, Ban, FileDown, CheckCircle } from "lucide-react";

interface MicroCargaRecord {
  numGuia: number;
  patente: string;
  conductor: string | null;
  fecha: string;
  litros: number;
  lugar: string | null;
  faena: string | null;
  signals: string[];
  riesgo: "CRITICO" | "SOSPECHOSO";
  fuelLevelActual: number | null;
}

interface MicroCargasData {
  registros: MicroCargaRecord[];
  totals: {
    criticos: number;
    sospechosos: number;
    normales: number;
    totalCargas: number;
    cargasPequenas: number;
  };
  desde: string;
}

function SignalBadge({ signal }: { signal: string }) {
  const cfg: Record<string, { icon: any; label: string; color: string; bg: string }> = {
    MULTIPLE_DIA: { icon: MapPin, label: "MULTIPLE DIA", color: "#ffcc00", bg: "rgba(255,204,0,0.08)" },
    SIN_MOVIMIENTO: { icon: Ban, label: "SIN MOVIMIENTO", color: "#ff2244", bg: "rgba(255,34,68,0.08)" },
    TANQUE_LLENO: { icon: Fuel, label: "TANQUE LLENO", color: "#ff6b35", bg: "rgba(255,107,53,0.08)" },
  };
  const c = cfg[signal] || cfg.MULTIPLE_DIA;
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1 font-space text-xs font-bold px-2 py-0.5 uppercase tracking-[0.08em]"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}30` }}>
      <Icon className="w-2.5 h-2.5" />
      {c.label}
    </span>
  );
}

function ExpandedDetail({ record }: { record: MicroCargaRecord }) {
  return (
    <div className="px-5 py-4 space-y-3" style={{ background: "rgba(0,212,255,0.02)", borderTop: "1px solid #0d2035" }}>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>PATENTE</div>
          <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{record.patente}</div>
        </div>
        <div>
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CONDUCTOR</div>
          <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{record.conductor || "Sin datos"}</div>
        </div>
        <div>
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>LUGAR</div>
          <div className="font-exo text-[11px]" style={{ color: "#c8e8ff" }}>{record.lugar || "Sin datos"}</div>
        </div>
        <div>
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>NIVEL TANQUE ACTUAL</div>
          <div className="font-space text-[13px] font-bold" style={{
            color: record.fuelLevelActual != null
              ? record.fuelLevelActual > 80 ? "#ff2244" : record.fuelLevelActual > 50 ? "#ffcc00" : "#00ff88"
              : "#3a6080"
          }}>
            {record.fuelLevelActual != null ? `${Math.round(record.fuelLevelActual)}%` : "N/D"}
          </div>
        </div>
      </div>
      <div>
        <div className="font-exo text-xs tracking-[0.15em] uppercase mb-1" style={{ color: "#3a6080" }}>SENALES DETECTADAS</div>
        <div className="space-y-1">
          {record.signals.includes("MULTIPLE_DIA") && (
            <div className="font-exo text-xs" style={{ color: "#ffcc00" }}>
              Multiples cargas pequenas en distintos puntos el mismo dia. Patron consistente con desvio de combustible.
            </div>
          )}
          {record.signals.includes("SIN_MOVIMIENTO") && (
            <div className="font-exo text-xs" style={{ color: "#ff2244" }}>
              Carga registrada sin movimiento GPS detectado. El camion no muestra actividad cercana al momento de la carga.
            </div>
          )}
          {record.signals.includes("TANQUE_LLENO") && (
            <div className="font-exo text-xs" style={{ color: "#ff6b35" }}>
              El nivel de combustible indica tanque sobre 80% al momento de consulta. Carga posiblemente no ingreso al tanque.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MicroCargas() {
  const [expandedGuia, setExpandedGuia] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<MicroCargasData>({
    queryKey: ["/api/datos/micro-cargas"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="micro-cargas-loading">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: "#3a6080" }}>Analizando cargas sospechosas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-card px-8 py-12 text-center" data-testid="micro-cargas-error">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#ff2244" }} />
        <div className="font-space text-[14px] font-bold" style={{ color: "#ff2244" }}>Error al cargar datos</div>
        <div className="font-exo text-[11px] mt-2" style={{ color: "#3a6080" }}>{(error as Error).message}</div>
      </div>
    );
  }

  if (!data) return null;
  const { registros, totals } = data;

  return (
    <div className="space-y-5" data-testid="micro-cargas-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-space text-[18px] font-bold tracking-[0.12em] uppercase" style={{ color: "#c8e8ff" }}>
            Micro-Cargas Sospechosas
          </h2>
          <p className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>
            Analizando desde 01-03-2026 &middot; {totals.totalCargas.toLocaleString()} cargas totales &middot; {totals.cargasPequenas} bajo {100}L
          </p>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 font-space text-xs font-bold tracking-[0.1em] uppercase transition-all hover:opacity-80"
          style={{ color: "#00d4ff", border: "1px solid #00d4ff30", background: "rgba(0,212,255,0.05)" }}
          data-testid="btn-export-sospechosos">
          <FileDown className="w-3.5 h-3.5" />
          EXPORTAR SOSPECHOSOS
        </button>
      </div>

      <div className="flex items-center gap-4">
        {totals.criticos > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 dash-card" data-testid="badge-criticos">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ff2244", boxShadow: "0 0 8px #ff224480" }} />
            <span className="font-space text-[16px] font-bold" style={{ color: "#ff2244" }}>{totals.criticos}</span>
            <span className="font-exo text-xs tracking-[0.1em] uppercase" style={{ color: "#ff2244" }}>CRITICOS</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 dash-card" data-testid="badge-sospechosos">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ffcc00" }} />
          <span className="font-space text-[16px] font-bold" style={{ color: "#ffcc00" }}>{totals.sospechosos}</span>
          <span className="font-exo text-xs tracking-[0.1em] uppercase" style={{ color: "#ffcc00" }}>SOSPECHOSOS</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 dash-card" data-testid="badge-normales">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#00ff88" }} />
          <span className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>{totals.normales}</span>
          <span className="font-exo text-xs tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>NORMALES (ocultos)</span>
        </div>
      </div>

      {registros.length === 0 ? (
        <div className="dash-card px-8 py-12 text-center" data-testid="micro-cargas-empty">
          <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "#00ff88" }} />
          <div className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>Sin cargas sospechosas detectadas</div>
          <div className="font-exo text-[11px] mt-2" style={{ color: "#3a6080" }}>
            Todas las cargas pequenas del periodo son consistentes con los datos GPS y niveles de tanque.
          </div>
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: "1px solid #0d2035", background: "#020508" }}>
            <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "70px" }}>RIESGO</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "70px" }}>PATENTE</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "140px" }}>CONDUCTOR</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "130px" }}>FECHA</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "60px" }}>LITROS</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1" style={{ color: "#3a6080" }}>SENALES</span>
          </div>

          {registros.map(r => (
            <div key={r.numGuia}>
              <div
                className="flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
                style={{ borderBottom: "1px solid #0d2035" }}
                onClick={() => setExpandedGuia(expandedGuia === r.numGuia ? null : r.numGuia)}
                data-testid={`micro-carga-row-${r.numGuia}`}
              >
                <div style={{ width: "70px" }}>
                  {r.riesgo === "CRITICO" ? (
                    <span className="inline-flex items-center gap-1 font-space text-[11px] font-bold px-2 py-0.5"
                      style={{ color: "#ff2244", background: "rgba(255,34,68,0.1)", border: "1px solid rgba(255,34,68,0.3)" }}>
                      CRITICO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-space text-[11px] font-bold px-2 py-0.5"
                      style={{ color: "#ffcc00", background: "rgba(255,204,0,0.08)", border: "1px solid rgba(255,204,0,0.3)" }}>
                      SOSPECHOSO
                    </span>
                  )}
                </div>
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff", width: "70px" }}>{r.patente}</span>
                <span className="font-exo text-xs truncate" style={{ color: "#c8e8ff", width: "140px" }}>{r.conductor || "---"}</span>
                <span className="font-space text-xs" style={{ color: "#3a6080", width: "130px" }}>{r.fecha}</span>
                <span className="font-space text-[11px] font-bold text-right" style={{ color: "#ffcc00", width: "60px" }}>{r.litros.toFixed(1)}L</span>
                <div className="flex items-center gap-1.5 flex-1">
                  {r.signals.map(s => <SignalBadge key={s} signal={s} />)}
                </div>
                {expandedGuia === r.numGuia
                  ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "#00d4ff" }} />
                  : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#3a6080" }} />}
              </div>
              {expandedGuia === r.numGuia && <ExpandedDetail record={r} />}
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] font-space tracking-[0.15em]" style={{ color: "#3a6080" }}>
        Senales: MULTIPLE DIA = 2+ cargas &lt;100L en distintos puntos mismo dia &middot; SIN MOVIMIENTO = sin GPS activo &middot; TANQUE LLENO = nivel &gt;80%
      </div>
    </div>
  );
}
