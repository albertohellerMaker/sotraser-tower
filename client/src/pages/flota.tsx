import { useState, useMemo } from "react";
import Camiones from "@/pages/camiones";
import MicroCargas from "@/pages/micro-cargas";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info, Truck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type FlotaSub = "envivo" | "combustible";

const FLOTA_TABS: { id: FlotaSub; label: string }[] = [
  { id: "envivo", label: "EN VIVO" },
  { id: "combustible", label: "COMBUSTIBLE" },
];

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help ml-1 align-middle">
          <Info className="w-3 h-3" style={{ color: "#3a6080" }} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs font-exo" style={{ background: "#1a2a3a", color: "#ffffff", border: "1px solid #2a4a5a" }}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function AccordionSection({ title, defaultOpen, children, tooltip }: { title: string; defaultOpen?: boolean; children: React.ReactNode; tooltip?: string }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ border: "1px solid #0d2035" }} className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
        style={{ background: "#091018" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>{title}</span>
          {tooltip && <InfoTip text={tooltip} />}
        </div>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: "#3a6080" }} /> : <ChevronRight className="w-4 h-4" style={{ color: "#3a6080" }} />}
      </button>
      {open && <div className="p-4" style={{ borderTop: "1px solid #0d2035" }}>{children}</div>}
    </div>
  );
}

function RendimientoTable() {
  const { data: fusion = [] } = useQuery<any[]>({ queryKey: ["/api/datos/fusion"] });

  const trucks = fusion.map((t: any) => {
    const cargas = t.cargas || [];
    const rendVals = cargas.map((c: any) => c.rendimiento).filter((r: any) => r > 0 && r <= 20);
    const rendProm = rendVals.length > 0 ? +(rendVals.reduce((a: number, b: number) => a + b, 0) / rendVals.length).toFixed(2) : 0;
    return { patente: t.patenteReal || t.fleetNum, faena: t.faena || t.contrato || "Sin faena", rend: rendProm, cargas: cargas.length };
  }).filter((t: any) => t.cargas > 0).sort((a: any, b: any) => a.rend - b.rend);

  const allRend = trucks.map((t: any) => t.rend).filter((r: number) => r > 0).sort((a: number, b: number) => a - b);
  const p50 = allRend.length > 0 ? allRend[Math.floor(allRend.length * 0.5)] : 0;
  const p75 = allRend.length > 0 ? allRend[Math.floor(allRend.length * 0.75)] : 0;
  const p90 = allRend.length > 0 ? allRend[Math.floor(allRend.length * 0.9)] : 0;

  function getPercentilColor(rend: number) {
    if (rend >= p90) return "#00ff88";
    if (rend >= p75) return "#00d4ff";
    if (rend >= p50) return "#ffcc00";
    return "#ff2244";
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <span className="font-exo text-[11px]" style={{ color: "#3a6080" }}>
          P50: {p50.toFixed(2)} | P75: {p75.toFixed(2)} | P90: {p90.toFixed(2)} km/L
        </span>
        <InfoTip text="P90 = el 90% de los camiones rinde menos que este. Significa que esta entre los mejores." />
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #0d2035" }}>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>Camion</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>Faena</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase text-right" style={{ color: "#3a6080" }}>km/L</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase text-right" style={{ color: "#3a6080" }}>Cargas</th>
              <th className="py-2 px-3 font-exo text-[11px] tracking-wider uppercase" style={{ color: "#3a6080" }}>Nivel</th>
            </tr>
          </thead>
          <tbody>
            {trucks.slice(0, 50).map((t: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(13,32,53,0.5)" }}
                className="hover:bg-[rgba(0,212,255,0.02)] transition-colors">
                <td className="py-2 px-3 font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{t.patente}</td>
                <td className="py-2 px-3 font-exo text-xs" style={{ color: "#3a6080" }}>{t.faena}</td>
                <td className="py-2 px-3 font-space text-[11px] font-bold text-right" style={{ color: getPercentilColor(t.rend) }}>{t.rend > 0 ? t.rend.toFixed(2) : "N/D"}</td>
                <td className="py-2 px-3 font-exo text-xs text-right" style={{ color: "#3a6080" }}>{t.cargas}</td>
                <td className="py-2 px-3">
                  <span className="font-space text-xs font-bold px-2 py-0.5" style={{
                    color: getPercentilColor(t.rend),
                    border: `1px solid ${getPercentilColor(t.rend)}40`,
                    background: `${getPercentilColor(t.rend)}10`,
                  }}>
                    {t.rend >= p90 ? "P90+" : t.rend >= p75 ? "P75+" : t.rend >= p50 ? "P50+" : "<P50"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Flota({ initialSub }: { initialSub?: string }) {
  const [activeSub, setActiveSub] = useState<FlotaSub>((initialSub as FlotaSub) || "envivo");

  const { data: contracts } = useQuery<any[]>({ queryKey: ["/api/contratos"], queryFn: () => fetch("/api/contratos").then(r => r.json()) });
  const { data: microData } = useQuery<any>({ queryKey: ["/api/datos/micro-cargas"] });
  const microBadge = (microData?.totals?.criticos || 0) + (microData?.totals?.sospechosos || 0);

  const totalCamiones = useMemo(() => (contracts || []).reduce((s: number, c: any) => s + (c.camiones || 0), 0), [contracts]);

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-3">
          <Truck className="w-4 h-4" style={{ color: "#00d4ff" }} />
          <span className="font-space text-[13px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
            FLOTA SOTRASER
          </span>
          <span className="font-exo text-xs px-2 py-0.5 rounded" style={{ background: "#00d4ff10", border: "1px solid #00d4ff25", color: "#00d4ff" }}>
            {totalCamiones} camiones
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 pb-2" style={{ borderBottom: "1px solid #0d2035" }}>
        {FLOTA_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveSub(t.id)}
            className={`px-4 py-2 font-exo text-xs font-bold tracking-[0.15em] cursor-pointer transition-all border-b-2 ${
              activeSub === t.id
                ? "border-[#00d4ff] text-[#00d4ff]"
                : "border-transparent text-[#3a6080] hover:text-[#c8e8ff]"
            }`}>
            {t.label}
            {t.id === "combustible" && microBadge > 0 && (
              <span className="ml-1.5 font-space text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                style={{ background: "#ff2244", color: "#020508" }}>
                {microBadge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeSub === "envivo" && <Camiones />}

      {activeSub === "combustible" && (
        <div className="space-y-0">
          <AccordionSection title="CARGAS SOSPECHOSAS"
            tooltip="Carga de poco combustible con señales que podrían indicar desvío. Requiere verificación.">
            <MicroCargas />
          </AccordionSection>
          <AccordionSection title="RENDIMIENTO">
            <RendimientoTable />
          </AccordionSection>
        </div>
      )}
    </div>
  );
}
