import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, AlertTriangle, TrendingUp, TrendingDown, Minus, Award,
  ChevronDown, ChevronUp, MapPin, Fuel, Gauge, Activity, Zap,
  Target, Shield, BarChart3, Clock, Eye, User, Filter
} from "lucide-react";

const PURPLE = "#a855f7";
const CYAN = "#00d4ff";
const SUCCESS = "#00ff88";
const ERROR = "#ff2244";
const WARNING = "#ffcc00";
const TEXT_MAIN = "#c8e8ff";
const TEXT_MUTED = "#4a7090";
const TEXT_DIM = "#3a6080";
const BG_CARD = "#091018";
const BG_DEEP = "#020508";
const BORDER = "#0d2035";

const CONTRATO_COLORS: Record<string, string> = {
  "CENCOSUD": "#00d4ff",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-COCU": "#00ff88",
  "X ASIGNAR": "#4a7090",
};

function scoreColor(score: number): string {
  if (score >= 85) return SUCCESS;
  if (score >= 72) return CYAN;
  if (score >= 58) return WARNING;
  if (score >= 42) return "#ff6b35";
  return ERROR;
}

function badgeConfig(badge: string): { label: string; color: string } {
  switch (badge) {
    case "optimo": return { label: "OPTIMO", color: SUCCESS };
    case "mejoro": return { label: "MEJORO", color: SUCCESS };
    case "estable": return { label: "NORMAL", color: CYAN };
    case "atencion": return { label: "REVISAR", color: WARNING };
    case "alerta": return { label: "ALERTA", color: "#ff6b35" };
    case "critico": return { label: "CRITICO", color: ERROR };
    case "nuevo": return { label: "NUEVO", color: TEXT_MUTED };
    default: return { label: "NORMAL", color: TEXT_MUTED };
  }
}

function MiniBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-exo text-[6px] tracking-wider uppercase" style={{ color: TEXT_DIM }}>{label}</span>
      <div className="w-10 h-1.5 rounded-full" style={{ background: BORDER }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-space text-[7px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function KPICard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: typeof Users;
}) {
  return (
    <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="font-exo text-[7px] font-bold tracking-[0.15em] uppercase" style={{ color: TEXT_DIM }}>{label}</span>
      </div>
      <div className="font-space text-[22px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-rajdhani text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{sub}</div>}
    </div>
  );
}

function HistoricoChart({ semanas }: { semanas: any[] }) {
  if (semanas.length < 2) {
    return (
      <div className="flex items-center justify-center py-6">
        <span className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>Necesita al menos 2 semanas para grafico historico</span>
      </div>
    );
  }

  const maxScore = 100;
  const chartW = 400;
  const chartH = 120;
  const paddingX = 40;
  const paddingY = 20;
  const usableW = chartW - paddingX * 2;
  const usableH = chartH - paddingY * 2;

  const points = semanas.map((s, i) => ({
    x: paddingX + (i / (semanas.length - 1)) * usableW,
    y: paddingY + usableH - (s.score / maxScore) * usableH,
    score: s.score,
    semana: s.semana,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{ maxHeight: 140 }}>
      <line x1={paddingX} y1={paddingY} x2={paddingX} y2={chartH - paddingY} stroke={BORDER} strokeWidth="1" />
      <line x1={paddingX} y1={chartH - paddingY} x2={chartW - paddingX} y2={chartH - paddingY} stroke={BORDER} strokeWidth="1" />

      {[25, 50, 75, 100].map(v => {
        const y = paddingY + usableH - (v / maxScore) * usableH;
        return (
          <g key={v}>
            <line x1={paddingX} y1={y} x2={chartW - paddingX} y2={y} stroke={`${BORDER}60`} strokeWidth="0.5" strokeDasharray="4" />
            <text x={paddingX - 4} y={y + 3} textAnchor="end" fill={TEXT_DIM} fontSize="7" fontFamily="Space Mono">{v}</text>
          </g>
        );
      })}

      <path d={pathD} fill="none" stroke={PURPLE} strokeWidth="2" />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={BG_DEEP} stroke={scoreColor(p.score)} strokeWidth="1.5" />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fill={scoreColor(p.score)} fontSize="7" fontFamily="Space Mono" fontWeight="bold">{p.score}</text>
          <text x={p.x} y={chartH - 4} textAnchor="middle" fill={TEXT_DIM} fontSize="5" fontFamily="Exo 2">{p.semana.replace(/^\d+-/, "")}</text>
        </g>
      ))}
    </svg>
  );
}

function EventosMap({ eventos, containerRef }: { eventos: any[]; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const mapRef = useRef<any>(null);
  const mapInitialized = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapInitialized.current) return;
    if (!(window as any).L) return;

    const L = (window as any).L;
    const map = L.map(containerRef.current, {
      center: [-33.45, -70.65],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;
    mapInitialized.current = true;

    return () => {
      map.remove();
      mapInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const map = mapRef.current;

    map.eachLayer((layer: any) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    const eventColors: Record<string, string> = {
      frenada_brusca: "#ff6b35",
      exceso_velocidad: ERROR,
      rpm_fuera_rango: WARNING,
    };

    const geoEvents = eventos.filter(e => e.lat && e.lng);

    if (geoEvents.length > 0) {
      const bounds: [number, number][] = [];
      for (const ev of geoEvents) {
        const color = eventColors[ev.tipo] || TEXT_MUTED;
        const safeDesc = String(ev.descripcion || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const safeTipo = String(ev.tipo || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        L.circleMarker([ev.lat, ev.lng], {
          radius: 5,
          fillColor: color,
          color: color,
          fillOpacity: 0.8,
          weight: 1,
        }).addTo(map).bindPopup(
          `<div style="font-family:Space Mono;font-size:10px;color:${TEXT_MAIN};background:${BG_DEEP};padding:8px;border-radius:4px;">
            <div style="color:${color};font-weight:bold;">${safeTipo.toUpperCase()}</div>
            <div>${safeDesc}</div>
            <div style="color:${TEXT_DIM};font-size:8px;">${ev.fecha || ""}</div>
          </div>`,
          { className: "driver-event-popup" }
        );
        bounds.push([ev.lat, ev.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [20, 20] });
      else if (bounds.length === 1) map.setView(bounds[0], 10);
    }
  }, [eventos]);

  if (eventos.filter(e => e.lat && e.lng).length === 0) {
    return (
      <div className="rounded px-4 py-6" style={{ background: BG_DEEP, border: `1px solid ${BORDER}` }}>
        <div className="text-center">
          <MapPin className="w-5 h-5 mx-auto mb-2" style={{ color: TEXT_DIM }} />
          <div className="font-rajdhani text-[11px]" style={{ color: TEXT_MUTED }}>Sin coordenadas de eventos disponibles</div>
          {eventos.length > 0 && (
            <div className="mt-3">
              <div className="font-space text-[9px] font-bold mb-2" style={{ color: TEXT_DIM }}>EVENTOS REGISTRADOS</div>
              <div className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>
                {eventos.length} eventos sin coordenadas — datos disponibles solo en tabla
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function DriverRow({ driver, isExpanded, onToggle }: { driver: any; isExpanded: boolean; onToggle: () => void }) {
  const sc = scoreColor(driver.score);
  const bc = badgeConfig(driver.badge);
  const TrendIcon = driver.tendencia === "up" ? TrendingUp : driver.tendencia === "down" ? TrendingDown : Minus;
  const trendColor = driver.tendencia === "up" ? SUCCESS : driver.tendencia === "down" ? ERROR : TEXT_DIM;

  return (
    <div className="rounded overflow-hidden" style={{ border: `1px solid ${isExpanded ? `${PURPLE}30` : BORDER}` }} data-testid={`driver-row-${driver.vin}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-all"
        style={{ background: isExpanded ? `${PURPLE}08` : BG_CARD }}
        onClick={onToggle}
        data-testid={`driver-toggle-${driver.vin}`}
      >
        <div className="w-8 text-center">
          <User className="w-4 h-4 mx-auto" style={{ color: sc }} />
        </div>

        <div className="flex-1 text-left">
          <div className="font-space text-[10px] font-bold" style={{ color: TEXT_MAIN }}>{driver.conductor}</div>
          <div className="flex items-center gap-1.5">
            <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>{driver.patente}</span>
            {driver.contrato && (
              <span className="font-exo text-[6px] tracking-wider px-1 py-px rounded" style={{
                color: CONTRATO_COLORS[driver.contrato] || TEXT_DIM,
                background: `${CONTRATO_COLORS[driver.contrato] || TEXT_DIM}10`,
                border: `1px solid ${CONTRATO_COLORS[driver.contrato] || TEXT_DIM}25`,
              }}>{driver.contrato}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-20 h-2 rounded-full" style={{ background: BORDER }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${driver.score}%`, background: sc }} />
          </div>
          <span className="font-space text-[14px] font-bold w-8 text-right" style={{ color: sc }}>{driver.score}</span>
        </div>

        <div className="flex items-center gap-1 w-12 justify-center">
          <TrendIcon className="w-3 h-3" style={{ color: trendColor }} />
          <span className="font-space text-[8px] font-bold" style={{ color: trendColor }}>
            {driver.tendenciaDelta > 0 ? "+" : ""}{driver.tendenciaDelta}
          </span>
        </div>

        <span className="font-space text-[7px] font-bold px-2 py-0.5 rounded" style={{
          color: bc.color,
          background: `${bc.color}12`,
          border: `1px solid ${bc.color}30`,
        }} data-testid={`badge-${driver.vin}`}>{bc.label}</span>

        <div className="flex items-center gap-2">
          <MiniBar value={driver.anticipacion} color={scoreColor(driver.anticipacion)} label="ANT" />
          <MiniBar value={driver.velocidad} color={scoreColor(driver.velocidad)} label="VEL" />
          <MiniBar value={driver.motor} color={scoreColor(driver.motor)} label="MOT" />
          <MiniBar value={driver.combustible} color={scoreColor(driver.combustible)} label="CMB" />
        </div>

        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} />}
      </button>

      {isExpanded && <DriverDetail driver={driver} />}
    </div>
  );
}

function DriverDetail({ driver }: { driver: any }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const { data: detalle } = useQuery<any>({ queryKey: ["/api/drivers", driver.vin, "detalle"], enabled: true });
  const [filtroTipoEvento, setFiltroTipoEvento] = useState<string>("todos");
  const [filtroSemana, setFiltroSemana] = useState<string>("todas");

  const eventosRaw = detalle?.eventos || [];
  const eventos = useMemo(() => {
    let filtered = eventosRaw;
    if (filtroTipoEvento !== "todos") filtered = filtered.filter((e: any) => e.tipo === filtroTipoEvento);
    if (filtroSemana !== "todas") filtered = filtered.filter((e: any) => {
      const d = new Date(e.fecha);
      const start = new Date(d.getFullYear(), 0, 1);
      const wn = Math.ceil((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
      return `${d.getFullYear()}-W${String(wn).padStart(2, "0")}` === filtroSemana;
    });
    return filtered;
  }, [eventosRaw, filtroTipoEvento, filtroSemana]);
  const scoreInfo = driver.scoreInfo || {};
  const cats = [
    { key: "anticipacion", label: "ANTICIPACION", value: driver.anticipacion, icon: Eye, info: scoreInfo.anticipacion },
    { key: "velocidad", label: "VELOCIDAD", value: driver.velocidad, icon: Gauge, info: scoreInfo.velocidad },
    { key: "motor", label: "MOTOR", value: driver.motor, icon: Activity, info: scoreInfo.motor },
    { key: "combustible", label: "COMBUSTIBLE", value: driver.combustible, icon: Fuel, info: scoreInfo.combustible },
  ];

  return (
    <div className="px-4 pb-4 space-y-3" style={{ background: `${BG_DEEP}` }} data-testid={`driver-detail-${driver.vin}`}>
      {driver.nivel && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ background: `${driver.nivelColor || PURPLE}08`, border: `1px solid ${driver.nivelColor || PURPLE}20` }}>
          <div className="w-2 h-2 rounded-full" style={{ background: driver.nivelColor }} />
          <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: driver.nivelColor }}>{driver.nivel}</span>
          <span className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>
            {driver.nivel === "OPTIMO" ? "Desempeno destacado (85+)" :
             driver.nivel === "NORMAL" ? "Dentro del rango esperado (72+)" :
             driver.nivel === "REVISAR" ? "Requiere seguimiento (58+)" :
             driver.nivel === "ALERTA" ? "Bajo el estandar minimo (42+)" :
             "Situacion critica (<42)"}
          </span>
        </div>
      )}

      <div className="rounded p-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
        <div className="font-space text-[9px] font-bold tracking-wider mb-2" style={{ color: PURPLE }}>SCORE HISTORICO SEMANAL</div>
        <HistoricoChart semanas={driver.semanas || []} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {cats.map(c => {
          const avg = driver.semanas && driver.semanas.length > 0
            ? Math.round(driver.semanas.reduce((s: number, sem: any) => s + (sem[c.key] || 0), 0) / driver.semanas.length)
            : c.value;
          const delta = c.value - avg;
          const Icon = c.icon;
          return (
            <div key={c.key} className="rounded px-3 py-2.5" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3 h-3" style={{ color: scoreColor(c.value) }} />
                <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>{c.label}</span>
              </div>
              <div className="font-space text-[18px] font-bold" style={{ color: scoreColor(c.value) }}>{c.value}</div>
              <div className="font-rajdhani text-[9px]" style={{ color: delta >= 0 ? SUCCESS : ERROR }}>
                {delta >= 0 ? "+" : ""}{delta} vs baseline ({avg})
              </div>
              {c.info && (
                <div className="font-exo text-[7px] mt-0.5" style={{ color: c.info.fuente === "ESTATICO" ? TEXT_DIM : CYAN }}>
                  {c.info.fuente === "ESTATICO"
                    ? "Calibrando — parametros conservadores"
                    : c.info.contexto}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {driver.mejorSemana && driver.peorSemana && (
        <div className="flex gap-2">
          <div className="flex-1 rounded px-3 py-2" style={{ background: `${SUCCESS}08`, border: `1px solid ${SUCCESS}20` }}>
            <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>MEJOR SEMANA</span>
            <div className="font-space text-[11px] font-bold" style={{ color: SUCCESS }}>{driver.mejorSemana.semana} - {driver.mejorSemana.score} pts</div>
          </div>
          <div className="flex-1 rounded px-3 py-2" style={{ background: `${ERROR}08`, border: `1px solid ${ERROR}20` }}>
            <span className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>PEOR SEMANA</span>
            <div className="font-space text-[11px] font-bold" style={{ color: ERROR }}>{driver.peorSemana.semana} - {driver.peorSemana.score} pts</div>
          </div>
        </div>
      )}

      <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${PURPLE}20` }}>
        <div className="flex items-center gap-2 mb-1.5">
          <Target className="w-3.5 h-3.5" style={{ color: PURPLE }} />
          <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: PURPLE }}>ANALISIS CEREBRO</span>
        </div>
        <div className="font-rajdhani text-[11px] leading-relaxed" style={{ color: TEXT_MAIN }}>{driver.textoIA}</div>
      </div>

      <div className="rounded overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: BG_CARD }}>
          <MapPin className="w-3.5 h-3.5" style={{ color: "#ff6b35" }} />
          <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: TEXT_MAIN }}>MAPA DE EVENTOS</span>
          <span className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>{eventos.length} eventos</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <select
              value={filtroTipoEvento}
              onChange={e => setFiltroTipoEvento(e.target.value)}
              className="font-space text-[8px] px-2 py-1 rounded outline-none cursor-pointer"
              style={{ background: BG_DEEP, color: TEXT_MAIN, border: `1px solid ${BORDER}` }}
              data-testid="filtro-tipo-evento"
            >
              <option value="todos">TODOS</option>
              <option value="frenada_brusca">FRENADA BRUSCA</option>
              <option value="exceso_velocidad">EXCESO VELOCIDAD</option>
              <option value="rpm_fuera_rango">RPM FUERA RANGO</option>
            </select>
            <select
              value={filtroSemana}
              onChange={e => setFiltroSemana(e.target.value)}
              className="font-space text-[8px] px-2 py-1 rounded outline-none cursor-pointer"
              style={{ background: BG_DEEP, color: TEXT_MAIN, border: `1px solid ${BORDER}` }}
              data-testid="filtro-semana-evento"
            >
              <option value="todas">TODAS LAS SEMANAS</option>
              {(driver.semanas || []).map((s: any) => (
                <option key={s.semana} value={s.semana}>{s.semana}</option>
              ))}
            </select>
          </div>
        </div>
        <div ref={mapContainerRef} style={{ height: 200, background: BG_DEEP }} data-testid={`driver-map-${driver.vin}`} />
        <EventosMap eventos={eventos} containerRef={mapContainerRef} />
      </div>
    </div>
  );
}

function ZonaComparativo() {
  const { data: zonas, isLoading } = useQuery<any[]>({ queryKey: ["/api/drivers/comparativo-zona"] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${PURPLE} transparent ${PURPLE} ${PURPLE}` }} />
      </div>
    );
  }

  if (!zonas || zonas.length === 0) {
    return (
      <div className="text-center py-4">
        <span className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>Sin datos de zona disponibles</span>
      </div>
    );
  }

  const zonaColors: Record<string, string> = { NORTE: "#ff6b35", CENTRO: CYAN, SUR: SUCCESS };

  return (
    <div className="space-y-3" data-testid="zona-comparativo">
      {zonas.map(z => (
        <div key={z.zona} className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3 mb-2">
            <MapPin className="w-4 h-4" style={{ color: zonaColors[z.zona] || CYAN }} />
            <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: zonaColors[z.zona] || CYAN }}>ZONA {z.zona}</span>
            <span className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>{z.totalConductores} conductores</span>
            {z.kmPromedioZona > 0 && (
              <span className="font-rajdhani text-[9px]" style={{ color: TEXT_DIM }}>{z.kmPromedioZona} km/sem promedio</span>
            )}
            <div className="flex-1" />
            <span className="font-space text-[14px] font-bold" style={{ color: scoreColor(z.scorePromedio) }}>{z.scorePromedio}</span>
            <span className="font-exo text-[7px]" style={{ color: TEXT_DIM }}>PROMEDIO</span>
          </div>

          {z.sobrePromedio.length > 0 && (
            <div className="mb-1.5">
              <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: SUCCESS }}>SOBRE PROMEDIO</div>
              <div className="flex flex-wrap gap-1.5">
                {z.sobrePromedio.slice(0, 6).map((d: any, i: number) => (
                  <span key={i} className="font-space text-[8px] px-2 py-0.5 rounded" style={{ background: `${SUCCESS}10`, border: `1px solid ${SUCCESS}20`, color: TEXT_MAIN }}>
                    {d.conductor.split(",")[0]} <span style={{ color: SUCCESS }}>+{d.delta}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {z.bajoPromedio.length > 0 && (
            <div>
              <div className="font-exo text-[7px] tracking-wider mb-1" style={{ color: ERROR }}>BAJO PROMEDIO</div>
              <div className="flex flex-wrap gap-1.5">
                {z.bajoPromedio.slice(0, 6).map((d: any, i: number) => (
                  <span key={i} className="font-space text-[8px] px-2 py-0.5 rounded" style={{ background: `${ERROR}10`, border: `1px solid ${d.contexto ? `${WARNING}30` : `${ERROR}20`}`, color: TEXT_MAIN }}>
                    {d.conductor.split(",")[0]} <span style={{ color: ERROR }}>{d.delta}</span>
                    {d.contexto && <span className="ml-1" style={{ color: WARNING, fontSize: "7px" }} title={d.contexto}>*</span>}
                  </span>
                ))}
              </div>
              {z.bajoPromedio.some((d: any) => d.contexto) && (
                <div className="font-rajdhani text-[8px] mt-1" style={{ color: WARNING }}>
                  * Conductor con ruta mas exigente (mas km o geocercas) — contexto considerado
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DriversTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/drivers/evaluaciones"], refetchInterval: 300000 });
  const [expandedVin, setExpandedVin] = useState<string | null>(null);
  const [filtroContrato, setFiltroContrato] = useState<string>("TODOS");

  const allDrivers = data?.drivers || [];
  const kpis = data?.kpis || {};
  const porContrato: any[] = data?.porContrato || [];

  const drivers = useMemo(() => {
    if (filtroContrato === "TODOS") return allDrivers;
    return allDrivers.filter((d: any) => d.contrato === filtroContrato);
  }, [allDrivers, filtroContrato]);

  const filteredKpis = useMemo(() => {
    if (filtroContrato === "TODOS") return kpis;
    const dd = drivers;
    const total = dd.length;
    if (total === 0) return { totalMonitoreados: 0, conAlerta: 0, scorePromedioFlota: 0, scoreAnteriorPromedio: 0, deltaFlota: 0, mayorMejora: { nombre: "--", delta: 0 }, mayorCaida: { nombre: "--", delta: 0 } };
    const alertas = dd.filter((d: any) => d.badge === "alerta" || d.badge === "atencion").length;
    const avg = Math.round(dd.reduce((s: number, d: any) => s + d.score, 0) / total);
    let mejora = { nombre: dd[0].conductor, delta: -Infinity };
    let caida = { nombre: dd[0].conductor, delta: Infinity };
    for (const d of dd) {
      if (d.tendenciaDelta > mejora.delta) mejora = { nombre: d.conductor, delta: d.tendenciaDelta };
      if (d.tendenciaDelta < caida.delta) caida = { nombre: d.conductor, delta: d.tendenciaDelta };
    }
    if (mejora.delta <= 0) mejora = { nombre: "--", delta: 0 };
    if (caida.delta >= 0) caida = { nombre: "--", delta: 0 };
    return {
      totalMonitoreados: total,
      conAlerta: alertas,
      scorePromedioFlota: avg,
      scoreAnteriorPromedio: avg,
      deltaFlota: 0,
      mayorMejora: mejora,
      mayorCaida: caida,
    };
  }, [drivers, filtroContrato, kpis]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="drivers-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${PURPLE} transparent ${PURPLE} ${PURPLE}` }} />
          <span className="font-space text-[10px] tracking-wider" style={{ color: TEXT_MUTED }}>CARGANDO EVALUACIONES VOLVO CONNECT...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="drivers-tab">
      <div className="flex items-center gap-1.5" data-testid="filtro-contratos">
        <button
          onClick={() => setFiltroContrato("TODOS")}
          className="flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-all"
          style={{
            background: filtroContrato === "TODOS" ? `${PURPLE}12` : "transparent",
            border: `1px solid ${filtroContrato === "TODOS" ? `${PURPLE}40` : `${BORDER}40`}`,
            borderBottom: filtroContrato === "TODOS" ? `2px solid ${PURPLE}` : "2px solid transparent",
          }}
          data-testid="filtro-contrato-todos"
        >
          <Filter className="w-3 h-3" style={{ color: filtroContrato === "TODOS" ? PURPLE : TEXT_DIM }} />
          <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: filtroContrato === "TODOS" ? PURPLE : TEXT_DIM }}>TODOS</span>
          <span className="font-space text-[8px] font-bold" style={{ color: filtroContrato === "TODOS" ? PURPLE : TEXT_MUTED }}>{allDrivers.length}</span>
        </button>
        {porContrato.map((pc: any) => {
          const cc = CONTRATO_COLORS[pc.contrato] || TEXT_MUTED;
          const active = filtroContrato === pc.contrato;
          return (
            <button
              key={pc.contrato}
              onClick={() => setFiltroContrato(pc.contrato)}
              className="flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-all"
              style={{
                background: active ? `${cc}12` : "transparent",
                border: `1px solid ${active ? `${cc}40` : `${BORDER}40`}`,
                borderBottom: active ? `2px solid ${cc}` : "2px solid transparent",
              }}
              data-testid={`filtro-contrato-${pc.contrato.toLowerCase().replace(/\s/g, "-")}`}
            >
              <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: active ? cc : TEXT_DIM }}>{pc.contrato}</span>
              <span className="font-space text-[8px] font-bold" style={{ color: active ? cc : TEXT_MUTED }}>{pc.total}</span>
              <div className="w-6 h-1 rounded-full ml-0.5" style={{ background: BORDER }}>
                <div className="h-full rounded-full" style={{ width: `${pc.scorePromedio}%`, background: scoreColor(pc.scorePromedio) }} />
              </div>
              <span className="font-space text-[7px]" style={{ color: scoreColor(pc.scorePromedio) }}>{pc.scorePromedio}</span>
            </button>
          );
        })}
      </div>

      {filtroContrato !== "TODOS" && (
        <div className="rounded px-4 py-3 flex items-center gap-4" style={{ background: `${CONTRATO_COLORS[filtroContrato] || PURPLE}08`, border: `1px solid ${CONTRATO_COLORS[filtroContrato] || PURPLE}20` }} data-testid="contrato-resumen">
          <div className="w-1.5 h-10 rounded-full" style={{ background: CONTRATO_COLORS[filtroContrato] || PURPLE }} />
          <div>
            <div className="font-space text-[12px] font-bold tracking-wider" style={{ color: CONTRATO_COLORS[filtroContrato] || PURPLE }}>{filtroContrato}</div>
            <div className="font-rajdhani text-[10px]" style={{ color: TEXT_MUTED }}>{drivers.length} conductores monitoreados</div>
          </div>
          <div className="flex-1" />
          <div className="text-center px-4">
            <div className="font-space text-[18px] font-bold" style={{ color: scoreColor(filteredKpis.scorePromedioFlota) }}>{filteredKpis.scorePromedioFlota}</div>
            <div className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>SCORE PROMEDIO</div>
          </div>
          <div className="text-center px-4">
            <div className="font-space text-[18px] font-bold" style={{ color: filteredKpis.conAlerta > 0 ? ERROR : SUCCESS }}>{filteredKpis.conAlerta}</div>
            <div className="font-exo text-[7px] tracking-wider" style={{ color: TEXT_DIM }}>ALERTAS</div>
          </div>
          <button onClick={() => setFiltroContrato("TODOS")} className="font-space text-[8px] px-2 py-1 rounded cursor-pointer" style={{ color: TEXT_MUTED, border: `1px solid ${BORDER}` }} data-testid="btn-limpiar-filtro">LIMPIAR</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3" data-testid="drivers-kpis">
        <KPICard
          label="CONDUCTORES MONITOREADOS"
          value={filteredKpis.totalMonitoreados || 0}
          sub={filtroContrato === "TODOS" ? "Volvo Connect activos" : filtroContrato}
          color={CYAN}
          icon={Users}
        />
        <KPICard
          label="CON ALERTA ESTA SEMANA"
          value={filteredKpis.conAlerta || 0}
          sub={filteredKpis.conAlerta > 0 ? "Requieren atencion" : "Sin alertas"}
          color={filteredKpis.conAlerta > 0 ? ERROR : SUCCESS}
          icon={AlertTriangle}
        />
        <KPICard
          label="SCORE PROMEDIO"
          value={filteredKpis.scorePromedioFlota || 0}
          sub={filtroContrato === "TODOS"
            ? `${filteredKpis.deltaFlota > 0 ? "+" : ""}${filteredKpis.deltaFlota || 0} vs semana anterior`
            : `${filtroContrato}`}
          color={scoreColor(filteredKpis.scorePromedioFlota || 0)}
          icon={BarChart3}
        />
        <KPICard
          label="MEJORA / CAIDA"
          value={filteredKpis.mayorMejora?.nombre?.split(",")[0] || "--"}
          sub={filteredKpis.mayorCaida?.nombre !== "--"
            ? `Caida: ${filteredKpis.mayorCaida?.nombre?.split(",")[0] || "--"} (${filteredKpis.mayorCaida?.delta || 0})`
            : "Sin cambios significativos"}
          color={PURPLE}
          icon={Award}
        />
      </div>

      <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-4 h-4" style={{ color: CONTRATO_COLORS[filtroContrato] || CYAN }} />
          <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: CONTRATO_COLORS[filtroContrato] || CYAN }}>
            RANKING CONDUCTORES {filtroContrato !== "TODOS" ? `— ${filtroContrato}` : ""}
          </span>
          <span className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>{drivers.length} conductores | Semana actual</span>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: SUCCESS }} />
              <span className="font-exo text-[7px]" style={{ color: TEXT_DIM }}>85+</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: CYAN }} />
              <span className="font-exo text-[7px]" style={{ color: TEXT_DIM }}>72-84</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: WARNING }} />
              <span className="font-exo text-[7px]" style={{ color: TEXT_DIM }}>58-71</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: "#ff6b35" }} />
              <span className="font-exo text-[7px]" style={{ color: TEXT_DIM }}>42-57</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: ERROR }} />
              <span className="font-exo text-[7px]" style={{ color: TEXT_DIM }}>&lt;42</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-1.5 mb-1" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="w-8" />
          <span className="flex-1 font-exo text-[6px] tracking-wider uppercase" style={{ color: TEXT_DIM }}>CONDUCTOR / PATENTE</span>
          <span className="w-28 font-exo text-[6px] tracking-wider uppercase text-center" style={{ color: TEXT_DIM }}>SCORE</span>
          <span className="w-12 font-exo text-[6px] tracking-wider uppercase text-center" style={{ color: TEXT_DIM }}>TEND.</span>
          <span className="w-16 font-exo text-[6px] tracking-wider uppercase text-center" style={{ color: TEXT_DIM }}>BADGE</span>
          <span className="w-48 font-exo text-[6px] tracking-wider uppercase text-center" style={{ color: TEXT_DIM }}>CATEGORIAS</span>
          <div className="w-3.5" />
        </div>

        <div className="space-y-1" data-testid="drivers-ranking">
          {drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Users className="w-6 h-6 mb-2" style={{ color: TEXT_DIM }} />
              <span className="font-rajdhani text-[11px]" style={{ color: TEXT_MUTED }}>Sin conductores Volvo Connect activos</span>
              <span className="font-rajdhani text-[9px] mt-1" style={{ color: TEXT_DIM }}>Verificar sincronizacion de camiones con VIN</span>
            </div>
          ) : (
            drivers.map((d: any) => (
              <DriverRow
                key={d.vin}
                driver={d}
                isExpanded={expandedVin === d.vin}
                onToggle={() => setExpandedVin(expandedVin === d.vin ? null : d.vin)}
              />
            ))
          )}
        </div>
      </div>

      <div className="rounded px-4 py-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3 mb-3">
          <MapPin className="w-4 h-4" style={{ color: PURPLE }} />
          <span className="font-space text-[10px] font-bold tracking-wider" style={{ color: PURPLE }}>COMPARATIVO POR ZONA</span>
          <span className="font-rajdhani text-[9px]" style={{ color: TEXT_MUTED }}>Agrupacion automatica por geocercas visitadas</span>
        </div>
        <ZonaComparativo />
      </div>

      <div className="flex items-center gap-4 px-2 py-2" style={{ borderTop: `1px solid ${BORDER}` }}>
        <Clock className="w-3 h-3" style={{ color: TEXT_DIM }} />
        <span className="font-rajdhani text-[9px]" style={{ color: TEXT_DIM }}>
          Datos desde 01 Marzo 2026 | Baseline: promedio ponderado con peso decreciente | Umbral alerta: ajustado por variabilidad individual (min 4 semanas) | Contrato asignado via Volvo Connect / faena
        </span>
      </div>
    </div>
  );
}
