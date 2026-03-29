import { useState, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { statsCamion, fN, type CamionStats, type Percentiles } from "@/lib/fuel-utils";
import { X, Truck, Loader2, Fuel, ChevronRight, Calendar } from "lucide-react";
import type { Faena, Camion, Carga } from "@shared/schema";

const VisionCEO = lazy(() => import("./vision-ceo"));

interface HeroData {
  totalCamiones: number;
  totalFaenas: number;
  litros30d: number;
  km30d: number;
  cargas30d: number;
  rendPromedio: number;
  camionesConVin: number;
  camionesOnline: number;
  conductores: number;
}

interface FaenaRow {
  id: number;
  nombre: string;
  color: string;
  camiones: number;
  litros30d: number;
  rendPromedio: number;
  criticos: number;
  alertas: number;
  estado: string;
}

interface SistemaData {
  volvo: { status: string; vehiculos: number; configured: boolean; health: number; error?: string };
  sigetra: { status: string; connected: boolean; user: string; health: number };
  ia: { status: string; configured: boolean; model: string; health: number };
  ultimoSync: string;
  healthGeneral: number;
}

function AnimatedRings() {
  return (
    <div className="relative w-[160px] h-[160px] mx-auto">
      <div className="absolute inset-0 rounded-full" style={{ border: '1px solid rgba(0,212,255,0.1)', animation: 'ringRotate 12s linear infinite' }} />
      <div className="absolute inset-[12px] rounded-full" style={{ border: '1px solid rgba(0,212,255,0.15)', animation: 'ringRotateReverse 8s linear infinite' }} />
      <div className="absolute inset-[24px] rounded-full" style={{ border: '1px dashed rgba(0,212,255,0.2)', animation: 'ringRotate 5s linear infinite' }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="octagonal w-[90px] h-[90px] flex items-center justify-center" style={{
          background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
          border: '1px solid rgba(0,212,255,0.3)',
          animation: 'glowPulse 3s ease-in-out infinite'
        }}>
          <span className="text-4xl">&#9981;</span>
        </div>
      </div>
    </div>
  );
}

function PercentileBar({ label, value, color, maxVal }: { label: string; value: number; color: string; maxVal: number }) {
  const pct = maxVal > 0 ? Math.min((value / maxVal) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="font-exo text-[11px] tracking-wider w-7" style={{ color: '#3a6080' }}>{label}</span>
      <div className="flex-1 h-[6px] rounded-sm overflow-hidden" style={{ background: '#0d2035' }}>
        <div className="h-full rounded-sm transition-all duration-1000" style={{ width: `${pct}%`, background: color, animation: 'barFill 1s ease-out' }} />
      </div>
      <span className="font-space text-[11px] font-bold w-16 text-right" style={{ color }}>{value > 0 ? `${value.toFixed(2)} km/L` : '\u2014'}</span>
    </div>
  );
}

type FaenaDetailData = {
  faena: Faena;
  camiones: (Camion & { litros30d: number; rendimiento: number; cargas: number; viajes: number })[];
  contrato: { id: number; nombre: string; totalViajes: number | null } | null;
  viajes: { id: number; codigo: string; camionPatente: string; fechaSalida: string; estado: string; km: number; rendimiento: number; litros: number }[];
  resumen: { totalCamiones: number; litros30d: number; rendPromedio: number; criticos: number; alertas: number; totalViajes: number; totalKmViajes: number; cargas: number };
};

function formatFecha(d: string | null | undefined) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function FaenaDetailModal({ faenaId, onClose }: { faenaId: number; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery<FaenaDetailData>({
    queryKey: ["/api/dashboard/faena", faenaId],
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(2,5,8,0.88)' }}
        onClick={onClose}>
        <div className="dash-card p-8 max-w-lg w-full text-center" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#00d4ff' }} />
          <div className="font-exo text-[11px] mt-3" style={{ color: '#3a6080' }}>Cargando faena...</div>
          <button onClick={onClose} className="mt-4 font-exo text-xs px-3 py-1 cursor-pointer border transition-all hover:bg-[rgba(255,255,255,0.05)]"
            style={{ color: '#3a6080', borderColor: '#0d2035' }}>Cancelar</button>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(2,5,8,0.88)' }}
        onClick={onClose}>
        <div className="dash-card p-8 max-w-lg w-full text-center" onClick={e => e.stopPropagation()}>
          <div className="font-space text-[13px] font-bold" style={{ color: '#ff2244' }}>Error al cargar faena</div>
          <div className="font-exo text-[11px] mt-2" style={{ color: '#3a6080' }}>No se pudo obtener la informacion de esta faena.</div>
          <div className="flex gap-3 justify-center mt-4">
            <button onClick={() => refetch()} className="font-exo text-xs px-3 py-1 cursor-pointer border transition-all hover:bg-[rgba(0,212,255,0.05)]"
              style={{ color: '#00d4ff', borderColor: 'rgba(0,212,255,0.2)' }}>Reintentar</button>
            <button onClick={onClose} className="font-exo text-xs px-3 py-1 cursor-pointer border transition-all hover:bg-[rgba(255,255,255,0.05)]"
              style={{ color: '#3a6080', borderColor: '#0d2035' }}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  const { faena, camiones, contrato, viajes, resumen } = data;
  const estado = resumen.criticos > resumen.totalCamiones * 0.3 ? 'critica' : (resumen.alertas > resumen.totalCamiones * 0.2 || resumen.criticos > 0) ? 'alerta' : 'operativa';
  const estadoColor = estado === 'critica' ? '#ff2244' : estado === 'alerta' ? '#ffcc00' : '#00ff88';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto" style={{ background: 'rgba(2,5,8,0.88)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="faena-detail-modal">
      <div className="dash-card w-full max-w-3xl mx-4" style={{ border: `1px solid ${faena.color || 'rgba(0,212,255,0.15)'}30` }}>

        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid #0d2035' }}>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: faena.color, boxShadow: `0 0 8px ${faena.color}50` }} />
            <div>
              <div className="font-space text-lg font-bold tracking-[0.1em]" style={{ color: '#c8e8ff' }}>{faena.nombre}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-space text-[11px] font-bold px-2 py-0.5 border uppercase" style={{
                  color: estadoColor, borderColor: `${estadoColor}40`, background: `${estadoColor}08`
                }}>{estado}</span>
                {contrato && (
                  <span className="font-exo text-xs" style={{ color: '#3a6080' }}>Contrato TMS: {contrato.nombre}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.05)] rounded"
            data-testid="btn-close-faena-modal">
            <X className="w-4 h-4" style={{ color: '#3a6080' }} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4" style={{ borderBottom: '1px solid #0d2035' }}>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>CAMIONES</div>
            <div className="font-space text-xl font-bold" style={{ color: '#00d4ff' }}>{resumen.totalCamiones}</div>
          </div>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>LITROS 30D</div>
            <div className="font-space text-xl font-bold" style={{ color: '#c8e8ff' }}>{resumen.litros30d.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>RENDIMIENTO</div>
            <div className="font-space text-xl font-bold" style={{ color: resumen.rendPromedio >= 3.5 ? '#00ff88' : resumen.rendPromedio >= 2.5 ? '#c8e8ff' : '#ffcc00' }}>
              {resumen.rendPromedio > 0 ? resumen.rendPromedio : '\u2014'}
            </div>
            <div className="font-exo text-xs" style={{ color: '#3a6080' }}>km/L promedio</div>
          </div>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>CARGAS</div>
            <div className="font-space text-xl font-bold" style={{ color: '#c8e8ff' }}>{resumen.cargas}</div>
            <div className="font-exo text-xs" style={{ color: '#3a6080' }}>ultimos 30 dias</div>
          </div>
          {resumen.criticos > 0 && (
            <div>
              <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>CRITICOS</div>
              <div className="font-space text-xl font-bold" style={{ color: '#ff2244' }}>{resumen.criticos}</div>
              <div className="font-exo text-xs" style={{ color: '#3a6080' }}>rend &lt; 1.5 km/L</div>
            </div>
          )}
          {resumen.alertas > 0 && (
            <div>
              <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>ALERTAS</div>
              <div className="font-space text-xl font-bold" style={{ color: '#ffcc00' }}>{resumen.alertas}</div>
            </div>
          )}
          {resumen.totalViajes > 0 && (
            <div>
              <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>VIAJES TMS</div>
              <div className="font-space text-xl font-bold" style={{ color: '#00d4ff' }}>{resumen.totalViajes}</div>
              <div className="font-exo text-xs" style={{ color: '#3a6080' }}>{resumen.totalKmViajes.toLocaleString()} km</div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-2" style={{ borderBottom: '1px solid #0d2035' }}>
          <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#c8e8ff' }}>
            CAMIONES ({camiones.length})
          </div>
          <div className="max-h-[300px] overflow-y-auto space-y-0">
            <div className="flex items-center gap-3 px-3 py-1.5 sticky top-0" style={{ background: '#020508' }}>
              <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '90px' }}>PATENTE</span>
              <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1" style={{ color: '#3a6080' }}>MODELO</span>
              <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '70px' }}>LITROS</span>
              <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '55px' }}>KM/L</span>
              <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '50px' }}>CARGAS</span>
              <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '50px' }}>SYNC</span>
            </div>
            {camiones.map(cam => (
              <div key={cam.id} className="flex items-center gap-3 px-3 py-2 transition-all hover:bg-[rgba(0,212,255,0.03)]"
                style={{ borderBottom: '1px solid #0d2035' }}
                data-testid={`faena-camion-${cam.id}`}>
                <div className="flex items-center gap-2" style={{ width: '90px' }}>
                  <Truck className="w-3 h-3 flex-shrink-0" style={{ color: cam.syncOk ? '#00ff88' : '#3a6080' }} />
                  <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>{cam.patente}</span>
                </div>
                <span className="font-exo text-xs flex-1 truncate" style={{ color: '#3a6080' }}>{cam.modelo}</span>
                <span className="font-space text-xs text-right" style={{ color: cam.litros30d > 0 ? '#c8e8ff' : '#3a6080', width: '70px' }}>
                  {cam.litros30d > 0 ? cam.litros30d.toLocaleString() : '\u2014'}
                </span>
                <span className="font-space text-xs text-right" style={{
                  color: cam.rendimiento >= 3.5 ? '#00ff88' : cam.rendimiento >= 2.0 ? '#c8e8ff' : cam.rendimiento > 0 ? '#ffcc00' : '#3a6080',
                  width: '55px'
                }}>
                  {cam.rendimiento > 0 ? cam.rendimiento : '\u2014'}
                </span>
                <span className="font-space text-xs text-right" style={{ color: '#3a6080', width: '50px' }}>
                  {cam.cargas > 0 ? cam.cargas : '\u2014'}
                </span>
                <span className="text-right" style={{ width: '50px' }}>
                  {cam.syncOk
                    ? <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
                    : <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#3a6080' }} />
                  }
                </span>
              </div>
            ))}
            {camiones.length === 0 && (
              <div className="py-6 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>Sin camiones asignados a esta faena</div>
            )}
          </div>
        </div>

        {viajes.length > 0 && (
          <div className="p-4 space-y-2">
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#00d4ff' }}>
              ULTIMOS VIAJES ({viajes.length})
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-0">
              {viajes.map(v => (
                <div key={v.id} className="flex items-center gap-3 px-3 py-2 transition-all hover:bg-[rgba(0,212,255,0.03)]"
                  style={{ borderBottom: '1px solid #0d2035' }}
                  data-testid={`faena-viaje-${v.id}`}>
                  <span className="font-space text-xs font-bold" style={{ color: '#c8e8ff', width: '110px' }}>{v.codigo}</span>
                  <span className="font-space text-xs" style={{ color: '#00d4ff', width: '50px' }}>{v.camionPatente}</span>
                  <span className="font-exo text-[11px]" style={{ color: '#3a6080', width: '100px' }}>{formatFecha(v.fechaSalida)}</span>
                  <span className="font-space text-xs text-right" style={{ color: '#c8e8ff', width: '55px' }}>{v.km > 0 ? `${v.km} km` : '\u2014'}</span>
                  <span className="font-space text-xs text-right" style={{
                    color: v.rendimiento >= 3.5 ? '#00ff88' : v.rendimiento > 0 ? '#c8e8ff' : '#3a6080', width: '50px'
                  }}>
                    {v.rendimiento > 0 ? v.rendimiento : '\u2014'}
                  </span>
                  <span className="font-space text-xs text-right" style={{ color: '#3a6080', width: '45px' }}>{v.litros > 0 ? `${v.litros}L` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status, fast }: { status: 'ok' | 'warn' | 'crit'; fast?: boolean }) {
  const colors = { ok: '#00ff88', warn: '#ffcc00', crit: '#ff2244' };
  return (
    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{
      background: colors[status],
      boxShadow: `0 0 6px ${colors[status]}`,
      animation: fast ? 'blinkFast 0.6s infinite' : status !== 'ok' ? 'blink 2s infinite' : undefined
    }} />
  );
}

function HealthBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="font-exo text-[11px] tracking-wider" style={{ color: '#3a6080' }}>{label}</span>
        <span className="font-space text-xs font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: '#0d2035' }}>
        <div className="h-full rounded-sm transition-all duration-1000" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function getTurno(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return "AM";
  if (h >= 14 && h < 22) return "PM";
  return "NOCHE";
}

export default function Dashboard() {
  const [showCEO, setShowCEO] = useState(false);
  const [selectedFaenaId, setSelectedFaenaId] = useState<number | null>(null);
  const { data: faenas = [] } = useQuery<Faena[]>({ queryKey: ["/api/faenas"] });
  const { data: camionesRaw = [], isLoading: loadingCamiones } = useQuery<Camion[]>({ queryKey: ["/api/camiones", "volvo"], queryFn: () => fetch("/api/camiones?soloVolvo=true").then(r => r.json()) });
  const { data: cargasRaw = [], isLoading: loadingCargas } = useQuery<Carga[]>({ queryKey: ["/api/cargas"] });
  const { data: percentiles } = useQuery<Percentiles>({ queryKey: ["/api/flota/percentiles"] });
  const { data: heroData } = useQuery<HeroData>({ queryKey: ["/api/dashboard/hero"], refetchInterval: 120000 });
  const { data: faenasData } = useQuery<FaenaRow[]>({ queryKey: ["/api/dashboard/faenas"], refetchInterval: 120000 });
  const { data: sistemaData } = useQuery<SistemaData>({ queryKey: ["/api/dashboard/sistema"], refetchInterval: 60000 });
  const { data: iaResumen } = useQuery<{ resumen: string; cached?: boolean }>({ queryKey: ["/api/ia/resumen-dashboard"], refetchInterval: 1800000 });

  const isLoading = loadingCamiones || loadingCargas;

  const camStats: CamionStats[] = useMemo(() =>
    camionesRaw.map(cam => {
      const cams = cargasRaw.filter(c => c.camionId === cam.id);
      return statsCamion(cam, cams);
    }), [camionesRaw, cargasRaw]);

  const criticos = camStats.filter(c => c.estado === "CRITICO");
  const alertas = camStats.filter(c => c.estado === "ALERTA");
  const rendValues = camStats.map(c => c.rendProm).filter((r): r is number => r != null);
  const rendFlota = rendValues.length > 0 ? +(rendValues.reduce((a, b) => a + b, 0) / rendValues.length).toFixed(2) : null;
  const turno = getTurno();
  const p90Max = percentiles ? Math.max(percentiles.p90, rendFlota || 0) * 1.1 : 3;

  if (isLoading) {
    return (
      <div className="space-y-5" data-testid="dashboard-loading">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="dash-bg min-h-screen -mx-5 -mt-5 px-5 pt-5 pb-10" data-testid="dashboard-view">
      <div className="dash-scanlines" />
      <div className="dash-content max-w-[1400px] mx-auto space-y-5">

        <div className="flex justify-end mb-[-8px]">
          <button
            onClick={() => setShowCEO(true)}
            data-testid="btn-vision-ceo"
            className="font-bold text-[13px] px-5 py-2.5 rounded-lg cursor-pointer transition-all hover:brightness-110 hover:scale-[1.02] active:scale-100"
            style={{
              background: "linear-gradient(135deg, #00d4ff, #0055aa)",
              color: "#ffffff",
              fontFamily: "Helvetica, Arial, sans-serif",
              border: "none",
              boxShadow: "0 2px 12px rgba(0,212,255,0.3)",
            }}
          >
            {"\ud83d\udc54"} VISION CEO
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="hero-section">
          <div className="corner-cut-tl dash-card relative overflow-hidden" data-testid="hero-logo-panel">
            <div className="absolute top-0 left-0 w-12 h-[1px]" style={{ background: '#00d4ff' }} />
            <div className="absolute top-0 left-0 w-[1px] h-12" style={{ background: '#00d4ff' }} />
            <div className="absolute bottom-0 right-0 w-12 h-[1px]" style={{ background: '#00d4ff' }} />
            <div className="absolute bottom-0 right-0 w-[1px] h-12" style={{ background: '#00d4ff' }} />

            <div className="p-6 flex flex-col items-center justify-center min-h-[280px]">
              <AnimatedRings />
              <div className="mt-4 text-center">
                <div className="font-space text-[28px] font-bold tracking-[0.4em]" style={{ color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.3)' }} data-testid="text-hero-sotraser">
                  SOTRASER
                </div>
                <div className="font-exo text-[11px] font-extralight tracking-[0.35em] mt-1" style={{ color: '#3a6080' }}>
                  CONTROL OPERACIONAL DE FLOTA
                </div>
                <div className="font-space text-[11px] mt-2" style={{ color: '#1a3550' }}>
                  VOLVO rFMS &middot; SIGETRA &middot; ANTHROPIC AI
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-3 grid grid-cols-3 gap-4" style={{ borderColor: '#0d2035' }}>
              <div className="text-center">
                <div className="font-exo text-xs tracking-[0.2em] mb-1" style={{ color: '#3a6080' }}>LITROS 30D</div>
                <div className="font-space text-base font-bold" style={{ color: '#ffcc00' }} data-testid="text-hero-litros">
                  {heroData ? fN(Math.round(heroData.litros30d)) : '\u2014'}
                </div>
              </div>
              <div className="text-center border-x" style={{ borderColor: '#0d2035' }}>
                <div className="font-exo text-xs tracking-[0.2em] mb-1" style={{ color: '#3a6080' }}>KM TOTAL</div>
                <div className="font-space text-base font-bold" style={{ color: '#c8e8ff' }} data-testid="text-hero-km">
                  {heroData ? fN(Math.round(heroData.km30d)) : '\u2014'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-exo text-xs tracking-[0.2em] mb-1" style={{ color: '#3a6080' }}>CARGAS</div>
                <div className="font-space text-base font-bold" style={{ color: '#c8e8ff' }} data-testid="text-hero-cargas">
                  {heroData ? fN(heroData.cargas30d) : '\u2014'}
                </div>
              </div>
            </div>
          </div>

          <div className="corner-cut-tr dash-card relative overflow-hidden" data-testid="hero-ia-panel">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center border" style={{ borderColor: '#0d2035', animation: 'glowPulse 3s ease-in-out infinite' }}>
                    <span className="text-sm">&#129302;</span>
                  </div>
                  <span className="font-exo text-[11px] tracking-[0.2em] font-light" style={{ color: '#3a6080' }}>
                    INTELIGENCIA ARTIFICIAL &middot; DIAGNOSTICO
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusDot status="ok" />
                  <span className="font-exo text-[11px] tracking-wider" style={{ color: '#00ff88' }}>ACTIVO</span>
                </div>
              </div>

              <div className="mb-4 pl-3.5" style={{ borderLeft: '2px solid #00d4ff' }}>
                <p className="font-exo text-[14px] font-light leading-relaxed" style={{ color: '#c8e8ff', lineHeight: '1.7' }} data-testid="text-ia-insight">
                  {iaResumen?.resumen || "Cargando diagnostico de flota..."}
                </p>
              </div>

              <div className="mb-4">
                <div className="font-exo text-xs tracking-[0.2em] uppercase mb-3" style={{ color: '#3a6080' }}>
                  REFERENCIA PERCENTIL &middot; FLOTA REAL
                </div>
                <div className="space-y-2">
                  <PercentileBar label="P90" value={percentiles?.p90 || 0} color="#00ff88" maxVal={p90Max} />
                  <PercentileBar label="P75" value={percentiles?.p75 || 0} color="#00d4ff" maxVal={p90Max} />
                  <PercentileBar label="P50" value={percentiles?.p50 || 0} color="#3a6080" maxVal={p90Max} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2" data-testid="hero-tags">
                <span className="px-2.5 py-1 font-space text-[11px] font-bold border" style={{
                  color: criticos.length > 0 ? '#ff2244' : '#00ff88',
                  borderColor: criticos.length > 0 ? 'rgba(255,34,68,0.4)' : 'rgba(0,255,136,0.3)',
                  background: criticos.length > 0 ? 'rgba(255,34,68,0.08)' : 'rgba(0,255,136,0.05)'
                }} data-testid="tag-criticos">
                  {criticos.length} CRITICOS
                </span>
                <span className="px-2.5 py-1 font-space text-[11px] font-bold border" style={{
                  color: alertas.length > 0 ? '#ffcc00' : '#00ff88',
                  borderColor: alertas.length > 0 ? 'rgba(255,204,0,0.4)' : 'rgba(0,255,136,0.3)',
                  background: alertas.length > 0 ? 'rgba(255,204,0,0.08)' : 'rgba(0,255,136,0.05)'
                }} data-testid="tag-alertas">
                  {alertas.length} ALERTAS
                </span>
                <span className="px-2.5 py-1 font-space text-[11px] font-bold border" style={{
                  color: '#ffcc00', borderColor: 'rgba(255,204,0,0.3)', background: 'rgba(255,204,0,0.05)'
                }}>
                  {heroData?.cargas30d || 0} CARGAS 30D
                </span>
                <span className="px-2.5 py-1 font-space text-[11px] border" style={{ color: '#3a6080', borderColor: '#0d2035' }} data-testid="tag-updated">
                  ACTUALIZADO {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="kpi-grid">
          {[
            { label: 'CAMIONES ACTIVOS', value: camStats.length, accent: '#00d4ff', sub: `${heroData?.camionesOnline || 0} online` },
            { label: 'CRITICOS', value: criticos.length, accent: '#ff2244', sub: criticos.length ? `${criticos.length} requieren atencion` : 'Sin criticos' },
            { label: 'ALERTAS', value: alertas.length, accent: '#ffcc00', sub: alertas.length ? `${alertas.length} en observacion` : 'Sin alertas' },
            { label: 'REND. FLOTA', value: rendFlota != null ? rendFlota : '\u2014', accent: '#00ff88', sub: `KM/L · ${heroData?.totalCamiones || 0} CAMIONES` },
            { label: 'CARGAS 30D', value: heroData?.cargas30d || 0, accent: '#3a6080', sub: `${heroData?.totalFaenas || 0} FAENAS ACTIVAS` },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              className="dash-card dash-card-accent relative p-4 transition-all"
              style={{ borderTopWidth: 2, borderTopColor: kpi.accent, animationDelay: `${i * 0.08}s`, animation: 'fadeInUp 0.5s ease-out both' }}
              data-testid={`kpi-${kpi.label.toLowerCase().replace(/[\s.]/g, "-")}`}
            >
              <div className="font-exo text-xs tracking-[0.2em] uppercase mb-2" style={{ color: '#3a6080' }}>
                {kpi.label}
              </div>
              <div className="font-space text-2xl font-bold" style={{ color: kpi.accent }} data-testid={`kpi-value-${i}`}>
                {kpi.value}
              </div>
              <div className="font-exo text-[11px] mt-1" style={{ color: '#3a6080' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          <div className="dash-card" data-testid="panel-faenas">
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#0d2035' }}>
              <span className="font-exo text-xs tracking-[0.2em] font-semibold uppercase" style={{ color: '#c8e8ff' }}>
                FAENAS ACTIVAS
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: '#0d2035' }}>
              {(faenasData || []).filter(f => f.camiones > 0).map((f, i) => {
                const dotStatus = f.estado === 'critica' ? 'crit' : f.estado === 'alerta' ? 'warn' : 'ok';
                return (
                  <div key={f.nombre} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[rgba(0,212,255,0.05)] cursor-pointer" style={{ borderColor: '#0d2035' }} data-testid={`faena-row-${i}`}
                    onClick={() => setSelectedFaenaId(f.id)}>
                    <StatusDot status={dotStatus} fast={dotStatus === 'crit'} />
                    <span className="font-rajdhani text-[13px] font-medium flex-1 truncate" style={{ color: f.color || '#c8e8ff' }}>
                      {f.nombre}
                    </span>
                    <span className="font-space text-xs" style={{ color: '#3a6080' }}>{f.camiones} cam</span>
                    <span className="font-space text-[11px] font-bold w-16 text-right" style={{ color: f.rendPromedio >= (percentiles?.p75 || 1.5) ? '#00ff88' : f.rendPromedio >= (percentiles?.p50 || 1.2) ? '#00d4ff' : '#ffcc00' }}>
                      {f.rendPromedio > 0 ? f.rendPromedio.toFixed(2) : '\u2014'} km/L
                    </span>
                    <span className="font-space text-[11px] font-bold px-2 py-0.5 border uppercase" style={{
                      color: f.estado === 'critica' ? '#ff2244' : f.estado === 'alerta' ? '#ffcc00' : '#00ff88',
                      borderColor: f.estado === 'critica' ? 'rgba(255,34,68,0.3)' : f.estado === 'alerta' ? 'rgba(255,204,0,0.3)' : 'rgba(0,255,136,0.2)',
                      background: f.estado === 'critica' ? 'rgba(255,34,68,0.06)' : f.estado === 'alerta' ? 'rgba(255,204,0,0.06)' : 'rgba(0,255,136,0.04)'
                    }}>
                      {f.estado}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#3a6080' }} />
                  </div>
                );
              })}
              {!faenasData && (
                <div className="px-4 py-6 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>
                  Cargando faenas...
                </div>
              )}
              {faenasData && faenasData.filter(f => f.camiones > 0).length === 0 && (
                <div className="px-4 py-6 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>
                  Sin faenas activas con camiones asignados
                </div>
              )}
            </div>
          </div>

          <div className="dash-card" data-testid="panel-sistema">
            <div className="p-4 border-b" style={{ borderColor: '#0d2035' }}>
              <span className="font-exo text-xs tracking-[0.2em] font-semibold uppercase" style={{ color: '#c8e8ff' }}>
                SISTEMA
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-2">
                {[
                  { name: 'VOLVO rFMS', ok: sistemaData?.volvo?.status === 'connected', label: 'CONECTADO' },
                  { name: 'SIGETRA', ok: sistemaData?.sigetra?.connected ?? false, label: 'CONECTADO' },
                  { name: 'ANTHROPIC IA', ok: sistemaData?.ia?.status === 'available', label: 'ACTIVO' },
                ].map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <StatusDot status={s.ok ? 'ok' : 'crit'} />
                    <span className="font-space text-xs font-bold flex-1" style={{ color: '#c8e8ff' }}>{s.name}</span>
                    <span className="font-exo text-[11px]" style={{ color: s.ok ? '#00ff88' : '#ff2244' }}>{s.ok ? s.label : 'DESCONECTADO'}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 space-y-2.5" style={{ borderColor: '#0d2035' }}>
                <HealthBar label="Volvo rFMS" value={sistemaData?.volvo?.health || 0}
                  color={(sistemaData?.volvo?.health || 0) > 70 ? '#00ff88' : (sistemaData?.volvo?.health || 0) > 50 ? '#ffcc00' : '#ff2244'} />
                <HealthBar label="Sigetra" value={sistemaData?.sigetra?.health || 0} color="#00d4ff" />
                <HealthBar label="IA Claude" value={sistemaData?.ia?.health || 0}
                  color={(sistemaData?.ia?.health || 0) > 80 ? '#00ff88' : (sistemaData?.ia?.health || 0) > 60 ? '#ffcc00' : '#ff2244'} />
              </div>

              <div className="border-t pt-3 space-y-1" style={{ borderColor: '#0d2035' }}>
                <div className="flex justify-between">
                  <span className="font-space text-[11px]" style={{ color: '#1a3550' }}>ULTIMO SYNC</span>
                  <span className="font-space text-[11px]" style={{ color: '#3a6080' }}>{sistemaData?.ultimoSync || '\u2014'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-space text-[11px]" style={{ color: '#1a3550' }}>DATOS DESDE</span>
                  <span className="font-space text-[11px]" style={{ color: '#3a6080' }}>01-03-2026</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-space text-[11px]" style={{ color: '#1a3550' }}>PERCENTIL P90</span>
                  <span className="font-space text-[11px] font-bold" style={{ color: '#00ff88' }}>{percentiles?.p90?.toFixed(2) || '\u2014'} km/L</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-[11px] font-space tracking-[0.15em]" style={{ color: '#3a6080' }} data-testid="text-system-note">
          Sistema de medicion activo desde 01-03-2026 &middot; Turno actual: {turno}
          {percentiles && !percentiles.calibrando && (
            <span> &middot; Ref. P90: {percentiles.p90.toFixed(2)} km/L</span>
          )}
        </div>

      </div>

      {selectedFaenaId !== null && (
        <FaenaDetailModal faenaId={selectedFaenaId} onClose={() => setSelectedFaenaId(null)} />
      )}

      {showCEO && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(2,5,8,0.98)" }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
          </div>
        }>
          <VisionCEO onClose={() => setShowCEO(false)} />
        </Suspense>
      )}
    </div>
  );
}
