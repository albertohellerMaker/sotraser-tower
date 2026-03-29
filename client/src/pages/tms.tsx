import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, MapPin, ChevronLeft, X, Loader2, CheckCircle, Circle,
  Truck, Navigation, ArrowRight, Lock, ExternalLink, Fuel, Eye, BarChart3,
  Map as MapIcon, Brain, FileText, RefreshCw, ChevronDown, ChevronRight,
  Clock, TrendingUp, TrendingDown, Gauge, Route, Calendar,
} from "lucide-react";
import type { Camion, Faena, TmsContrato, TmsViaje, TmsParada, TmsPunto } from "@shared/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type TmsViajeWithParadas = TmsViaje & { paradas: TmsParada[] };
type ContratoFull = TmsContrato & {
  camiones: Camion[];
  viajes: TmsViajeWithParadas[];
  puntos: TmsPunto[];
  stats: { totalCamiones: number; totalViajes: number; totalKm: number; totalLitros: number; rendimientoProm: number };
};
type TruckWithStats = Camion & { viajesCount: number; kmTotal: number };
type ContratoListItem = TmsContrato & { faenaNombre?: string; truckCount: number; trucks: TruckWithStats[] };

const ESTADO_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  DETECTADO: { border: '#00d4ff', text: '#00d4ff', bg: 'rgba(0,212,255,0.06)' },
  CONFIRMADO: { border: '#00ff88', text: '#00ff88', bg: 'rgba(0,255,136,0.06)' },
  EN_RUTA: { border: '#00ff88', text: '#00ff88', bg: 'rgba(0,255,136,0.06)' },
  COMPLETADO: { border: '#3a6080', text: '#3a6080', bg: 'rgba(58,96,128,0.06)' },
  CANCELADO: { border: '#ff2244', text: '#ff2244', bg: 'rgba(255,34,68,0.06)' },
};

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="dash-card p-3">
      <div className="font-exo text-xs tracking-[0.2em] uppercase" style={{ color: '#3a6080' }}>{label}</div>
      <div className="font-space text-xl font-bold mt-1" style={{ color: color || '#c8e8ff' }}>{value}</div>
      {sub && <div className="font-exo text-[11px] mt-0.5" style={{ color: '#3a6080' }}>{sub}</div>}
    </div>
  );
}

type TruckDetailData = {
  camion: Camion;
  viajes: TmsViajeWithParadas[];
  ultimoViaje: TmsViajeWithParadas | null;
  viajeSimilarPropuesto: {
    promedioHistorico: { km: number; rendimiento: number; litros: number; rangoKm: [number, number]; rangoRendimiento: [number, number]; totalViajesAnalizados: number };
    viajeMasSimilar: { codigo: string; fecha: string; km: number; rendimiento: number; litros: number } | null;
    mejorViaje: { codigo: string; fecha: string; km: number; rendimiento: number };
    peorViaje: { codigo: string; fecha: string; km: number; rendimiento: number };
    comparacionUltimoViaje: { kmVsPromedio: number; rendVsPromedio: number };
    proximoViajeProbable: { kmEstimado: number; litrosEstimados: number; rendimientoEsperado: number; basadoEn: string };
  } | null;
  resumen: { totalViajes: number; totalKm: number; totalLitros: number; rendimientoProm: number };
  viajesProyectados: { tipo: string; codigo: string; fecha: string; km: number; rendimiento: number; litros: number; estado: string; viajeId: number | null }[];
  resumenMes: { totalViajes: number; viajesReales: number; viajesProyectados: number; kmTotal: number; litrosTotal: number };
};

function formatFecha(d: string | null | undefined) {
  if (!d) return "\u2014";
  const date = new Date(d);
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TruckDetailModal({ contratoId, camionId, onClose }: { contratoId: number; camionId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<TruckDetailData>({
    queryKey: ["/api/tms/contratos", contratoId, "camion", camionId],
  });

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(2,5,8,0.85)' }}>
        <div className="dash-card p-8 max-w-lg w-full text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#00d4ff' }} />
          <div className="font-exo text-[11px] mt-3" style={{ color: '#3a6080' }}>Cargando datos del camion...</div>
        </div>
      </div>
    );
  }

  const { camion, viajes, ultimoViaje, viajeSimilarPropuesto: prop, resumen, viajesProyectados, resumenMes } = data;
  const lastKm = parseFloat(ultimoViaje?.kmRecorridos || "0") || 0;
  const lastRend = parseFloat(ultimoViaje?.rendimientoReal || "0") || 0;
  const mesNombre = new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto" style={{ background: 'rgba(2,5,8,0.88)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="truck-detail-modal">
      <div className="dash-card w-full max-w-2xl mx-4" style={{ border: '1px solid rgba(0,212,255,0.15)' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid #0d2035' }}>
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5" style={{ color: camion.syncOk ? '#00ff88' : '#3a6080' }} />
            <div>
              <div className="font-space text-lg font-bold tracking-[0.1em]" style={{ color: '#c8e8ff' }}>{camion.patente}</div>
              <div className="font-exo text-xs" style={{ color: '#3a6080' }}>
                {camion.modelo} {camion.conductor ? `\u00b7 ${camion.conductor}` : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.05)] rounded"
            data-testid="btn-close-truck-modal">
            <X className="w-4 h-4" style={{ color: '#3a6080' }} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4" style={{ borderBottom: '1px solid #0d2035' }}>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>VIAJES</div>
            <div className="font-space text-xl font-bold" style={{ color: '#00d4ff' }}>{resumen.totalViajes}</div>
          </div>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>KM TOTAL</div>
            <div className="font-space text-xl font-bold" style={{ color: '#c8e8ff' }}>{resumen.totalKm.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>LITROS</div>
            <div className="font-space text-xl font-bold" style={{ color: '#c8e8ff' }}>{resumen.totalLitros > 0 ? resumen.totalLitros.toLocaleString() : '\u2014'}</div>
          </div>
          <div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>RENDIMIENTO</div>
            <div className="font-space text-xl font-bold" style={{ color: resumen.rendimientoProm >= 3.5 ? '#00ff88' : resumen.rendimientoProm >= 2.5 ? '#c8e8ff' : '#ffcc00' }}>
              {resumen.rendimientoProm > 0 ? `${resumen.rendimientoProm}` : '\u2014'}
            </div>
            <div className="font-exo text-xs" style={{ color: '#3a6080' }}>km/L</div>
          </div>
          {camion.odometro && (
            <div>
              <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>ODOMETRO</div>
              <div className="font-space text-base font-bold" style={{ color: '#c8e8ff' }}>{camion.odometro.toLocaleString()}</div>
              <div className="font-exo text-xs" style={{ color: '#3a6080' }}>km</div>
            </div>
          )}
          {camion.horasMotor && (
            <div>
              <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>HORAS MOTOR</div>
              <div className="font-space text-base font-bold" style={{ color: '#c8e8ff' }}>{camion.horasMotor.toLocaleString()}</div>
              <div className="font-exo text-xs" style={{ color: '#3a6080' }}>hrs</div>
            </div>
          )}
          {camion.vin && (
            <div className="col-span-2">
              <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>VIN</div>
              <div className="font-space text-xs font-bold" style={{ color: '#3a6080' }}>{camion.vin}</div>
            </div>
          )}
        </div>

        {ultimoViaje && (
          <div className="p-4 space-y-3" style={{ borderBottom: '1px solid #0d2035' }}>
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#00d4ff' }}>ULTIMO VIAJE</div>
            <div className="dash-card p-3 space-y-2" style={{ borderLeft: '3px solid #00d4ff' }}>
              <div className="flex items-center justify-between">
                <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>{ultimoViaje.codigo}</span>
                <span className="font-space text-xs px-2 py-0.5 rounded"
                  style={{ background: ESTADO_COLORS[ultimoViaje.estado]?.bg || 'rgba(58,96,128,0.06)', color: ESTADO_COLORS[ultimoViaje.estado]?.text || '#3a6080' }}>
                  {ultimoViaje.estado}
                </span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-exo text-xs flex items-center gap-1" style={{ color: '#3a6080' }}>
                  <Calendar className="w-3 h-3" /> {formatFecha(ultimoViaje.fechaSalida as any)}
                </span>
                <span className="font-space text-xs" style={{ color: '#c8e8ff' }}>{lastKm} km</span>
                {lastRend > 0 && <span className="font-space text-xs" style={{ color: lastRend >= 3.5 ? '#00ff88' : '#c8e8ff' }}>{lastRend} km/L</span>}
                {parseFloat(ultimoViaje.litrosSigetra || "0") > 0 && (
                  <span className="font-space text-xs" style={{ color: '#3a6080' }}>{ultimoViaje.litrosSigetra} L</span>
                )}
              </div>
              {ultimoViaje.origenNombre && (
                <div className="font-exo text-xs" style={{ color: '#3a6080' }}>
                  {ultimoViaje.origenNombre} {ultimoViaje.destinoNombre ? `\u2192 ${ultimoViaje.destinoNombre}` : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {viajesProyectados.length > 0 && resumenMes && (
          <div className="p-4 space-y-3" style={{ borderBottom: '1px solid #0d2035' }}>
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold flex items-center gap-2" style={{ color: '#00ff88' }}>
              <Route className="w-3.5 h-3.5" /> VIAJES DEL MES &middot; {mesNombre}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="dash-card p-2.5" style={{ borderLeft: '2px solid #00ff88' }}>
                <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>TOTAL</div>
                <div className="font-space text-lg font-bold" style={{ color: '#00d4ff' }}>{resumenMes.totalViajes}</div>
              </div>
              <div className="dash-card p-2.5" style={{ borderLeft: '2px solid #00d4ff' }}>
                <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>REALES</div>
                <div className="font-space text-lg font-bold" style={{ color: '#00d4ff' }}>{resumenMes.viajesReales}</div>
              </div>
              <div className="dash-card p-2.5" style={{ borderLeft: '2px solid #ffcc00' }}>
                <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>PROYECTADOS</div>
                <div className="font-space text-lg font-bold" style={{ color: '#ffcc00' }}>{resumenMes.viajesProyectados}</div>
              </div>
              <div className="dash-card p-2.5">
                <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>KM MES</div>
                <div className="font-space text-lg font-bold" style={{ color: '#c8e8ff' }}>{resumenMes.kmTotal.toLocaleString()}</div>
              </div>
              <div className="dash-card p-2.5">
                <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>LITROS MES</div>
                <div className="font-space text-lg font-bold" style={{ color: '#c8e8ff' }}>{resumenMes.litrosTotal > 0 ? resumenMes.litrosTotal.toLocaleString() : '\u2014'}</div>
              </div>
            </div>

            {prop && (
              <div className="grid grid-cols-2 gap-3">
                <div className="dash-card p-2.5" style={{ borderLeft: '2px solid #00ff88' }}>
                  <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>MEJOR VIAJE</div>
                  <div className="font-space text-xs font-bold" style={{ color: '#00ff88' }}>{prop.mejorViaje.rendimiento} km/L</div>
                  <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>{prop.mejorViaje.codigo} &middot; {prop.mejorViaje.km} km</div>
                </div>
                <div className="dash-card p-2.5" style={{ borderLeft: '2px solid #ffcc00' }}>
                  <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>PEOR VIAJE</div>
                  <div className="font-space text-xs font-bold" style={{ color: '#ffcc00' }}>{prop.peorViaje.rendimiento} km/L</div>
                  <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>{prop.peorViaje.codigo} &middot; {prop.peorViaje.km} km</div>
                </div>
              </div>
            )}

            <div className="space-y-1 max-h-[350px] overflow-y-auto" data-testid="viajes-proyectados-list">
              <div className="flex items-center gap-3 px-3 py-1.5 sticky top-0" style={{ background: '#020508' }}>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '80px' }}>TIPO</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '120px' }}>CODIGO</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '100px' }}>FECHA</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '55px' }}>KM</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '50px' }}>KM/L</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '50px' }}>LITROS</span>
              </div>
              {viajesProyectados.map((vp, i) => {
                const isReal = vp.tipo === "REAL";
                return (
                  <div key={`${vp.codigo}-${i}`}
                    className="flex items-center gap-3 px-3 py-2 rounded transition-all hover:bg-[rgba(0,212,255,0.03)]"
                    style={{ borderBottom: '1px solid #0d2035' }}
                    data-testid={`viaje-proy-${i}`}>
                    <span className="font-space text-xs px-1.5 py-0.5 rounded" style={{
                      background: isReal ? 'rgba(0,212,255,0.08)' : 'rgba(255,204,0,0.08)',
                      color: isReal ? '#00d4ff' : '#ffcc00',
                      width: '80px', textAlign: 'center'
                    }}>
                      {isReal ? 'REAL' : 'PROYECTADO'}
                    </span>
                    <span className="font-space text-xs font-bold" style={{ color: isReal ? '#c8e8ff' : '#3a6080', width: '120px' }}>{vp.codigo}</span>
                    <span className="font-exo text-[11px]" style={{ color: '#3a6080', width: '100px' }}>{formatFecha(vp.fecha)}</span>
                    <span className="font-space text-xs text-right" style={{ color: isReal ? '#c8e8ff' : '#3a6080', width: '55px' }}>
                      {vp.km > 0 ? vp.km : '\u2014'}
                    </span>
                    <span className="font-space text-xs text-right" style={{
                      color: vp.rendimiento >= 3.5 ? '#00ff88' : vp.rendimiento > 0 ? (isReal ? '#c8e8ff' : '#3a6080') : '#3a6080',
                      width: '50px'
                    }}>
                      {vp.rendimiento > 0 ? vp.rendimiento : '\u2014'}
                    </span>
                    <span className="font-space text-xs text-right" style={{ color: '#3a6080', width: '50px' }}>
                      {vp.litros > 0 ? vp.litros : '\u2014'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viajesProyectados.length === 0 && viajes.length > 0 && (
          <div className="p-4 space-y-2" style={{ borderBottom: '1px solid #0d2035' }}>
            <div className="font-exo text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#c8e8ff' }}>
              HISTORIAL DE VIAJES ({viajes.length})
            </div>
            <div className="space-y-1 max-h-[250px] overflow-y-auto">
              {viajes.map(v => {
                const vKm = parseFloat(v.kmRecorridos || "0") || 0;
                const vRend = parseFloat(v.rendimientoReal || "0") || 0;
                const vLitros = parseFloat(v.litrosSigetra || "0") || 0;
                return (
                  <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded transition-all hover:bg-[rgba(0,212,255,0.03)]"
                    style={{ borderBottom: '1px solid #0d2035' }}
                    data-testid={`viaje-hist-${v.id}`}>
                    <span className="font-space text-xs px-1.5 py-0.5 rounded" style={{
                      background: ESTADO_COLORS[v.estado]?.bg, color: ESTADO_COLORS[v.estado]?.text, minWidth: '70px', textAlign: 'center'
                    }}>{v.estado}</span>
                    <span className="font-space text-xs font-bold" style={{ color: '#c8e8ff', width: '110px' }}>{v.codigo}</span>
                    <span className="font-exo text-[11px]" style={{ color: '#3a6080', width: '100px' }}>{formatFecha(v.fechaSalida as any)}</span>
                    <span className="font-space text-xs text-right" style={{ color: '#c8e8ff', width: '60px' }}>{vKm > 0 ? `${vKm} km` : '\u2014'}</span>
                    <span className="font-space text-xs text-right" style={{ color: vRend >= 3.5 ? '#00ff88' : vRend > 0 ? '#c8e8ff' : '#3a6080', width: '55px' }}>
                      {vRend > 0 ? `${vRend}` : '\u2014'}
                    </span>
                    <span className="font-space text-xs text-right" style={{ color: '#3a6080', width: '50px' }}>{vLitros > 0 ? `${vLitros}L` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viajes.length === 0 && viajesProyectados.length === 0 && (
          <div className="p-4 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>Sin viajes registrados para este camion</div>
        )}
      </div>
    </div>
  );
}

function ContractSelector({ onSelect }: { onSelect: (id: number) => void }) {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFaenaId, setSelectedFaenaId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState("");
  const [syncResult, setSyncResult] = useState<{ faenasCreadas: number; contratosCreados: number; totalViajes: number; contratosAnalizados: number } | null>(null);
  const autoSyncTriggered = useRef(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [truckModal, setTruckModal] = useState<{ contratoId: number; camionId: number } | null>(null);

  const { data: contratos = [], isLoading } = useQuery<ContratoListItem[]>({ queryKey: ["/api/tms/contratos"] });
  const { data: faenas = [] } = useQuery<Faena[]>({ queryKey: ["/api/faenas"] });

  const availableFaenas = faenas.filter(f => !contratos.find(c => c.faenaId === f.id));

  const sortedContratos = useMemo(() => {
    return [...contratos].sort((a, b) => {
      const aViajes = a.totalViajes || 0;
      const bViajes = b.totalViajes || 0;
      if (aViajes > 0 && bViajes === 0) return -1;
      if (aViajes === 0 && bViajes > 0) return 1;
      if (bViajes !== aViajes) return bViajes - aViajes;
      return (b.truckCount || 0) - (a.truckCount || 0);
    });
  }, [contratos]);

  const SYNC_STEPS = [
    "Conectando con Sigetra...",
    "Leyendo faenas de Sigetra...",
    "Asignando camiones a faenas...",
    "Creando contratos TMS...",
    "Conectando con Volvo rFMS...",
    "Analizando historial GPS...",
    "Detectando paradas y viajes...",
    "Correlacionando combustible Sigetra vs ECU...",
    "Calculando rendimiento por viaje...",
  ];

  const handleAutoSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < SYNC_STEPS.length) {
        setSyncStep(SYNC_STEPS[stepIdx]);
        stepIdx++;
      }
    }, 4000);

    try {
      const res = await apiRequest("POST", "/api/tms/auto-sync");
      const data = await res.json();
      clearInterval(interval);
      setSyncResult(data);
      setSyncStep("");
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/faenas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/camiones"] });
      toast({ title: "Sincronizacion completada", description: `${data.contratosCreados} contratos, ${data.totalViajes} viajes detectados` });
    } catch (e: any) {
      clearInterval(interval);
      setSyncStep("");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!isLoading && contratos.length === 0 && !autoSyncTriggered.current) {
      autoSyncTriggered.current = true;
      handleAutoSync();
    }
  }, [isLoading, contratos.length]);

  const handleCreate = async () => {
    if (!selectedFaenaId) return;
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/tms/contratos", { faenaId: selectedFaenaId });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos"] });
      toast({ title: "Contrato creado", description: data.nombre });
      onSelect(data.id);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
      setShowCreate(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  }

  return (
    <div className="space-y-5" data-testid="tms-contract-selector">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-space text-lg font-bold tracking-[0.2em]" style={{ color: '#00d4ff' }}>TMS &middot; GESTION DE TRANSPORTE</div>
          <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>Contratos generados automaticamente desde Sigetra + Volvo GPS</div>
        </div>
        <button onClick={handleAutoSync} disabled={syncing}
          className="octagonal flex items-center gap-2 px-4 py-2 font-space text-xs font-bold cursor-pointer transition-all hover:shadow-[0_0_16px_rgba(0,212,255,0.25)] disabled:opacity-50"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
          data-testid="btn-auto-sync">
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          SINCRONIZAR
        </button>
      </div>

      {syncing && (
        <div className="dash-card p-6 text-center space-y-3" data-testid="sync-progress">
          <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: '#00d4ff' }} />
          <div className="font-rajdhani text-base font-semibold" style={{ color: '#c8e8ff' }}>Sincronizacion automatica en progreso</div>
          {syncStep && (
            <div className="font-exo text-[12px] animate-pulse" style={{ color: '#00d4ff' }}>{syncStep}</div>
          )}
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>
            Creando contratos desde Sigetra y detectando viajes con Volvo GPS...
          </div>
        </div>
      )}

      {syncResult && !syncing && (
        <div className="dash-card p-4 space-y-2" style={{ borderLeft: '3px solid #00ff88' }} data-testid="sync-result">
          <div className="font-space text-xs font-bold tracking-[0.15em]" style={{ color: '#00ff88' }}>SINCRONIZACION COMPLETADA</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
            <div>
              <div className="font-space text-lg font-bold" style={{ color: '#00d4ff' }}>{syncResult.faenasCreadas}</div>
              <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>FAENAS CREADAS</div>
            </div>
            <div>
              <div className="font-space text-lg font-bold" style={{ color: '#00d4ff' }}>{syncResult.contratosCreados}</div>
              <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>CONTRATOS CREADOS</div>
            </div>
            <div>
              <div className="font-space text-lg font-bold" style={{ color: '#c8e8ff' }}>{syncResult.contratosAnalizados}</div>
              <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>ANALIZADOS</div>
            </div>
            <div>
              <div className="font-space text-lg font-bold" style={{ color: '#00ff88' }}>{syncResult.totalViajes}</div>
              <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>VIAJES DETECTADOS</div>
            </div>
          </div>
        </div>
      )}

      {!syncing && (
        <>
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              className="octagonal flex items-center gap-2 px-5 py-2.5 font-space text-[11px] font-bold cursor-pointer transition-all hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
              data-testid="btn-nuevo-contrato">
              <Plus className="w-4 h-4" /> NUEVO CONTRATO DESDE FAENA
            </button>
          ) : (
            <div className="dash-card p-4 space-y-3" data-testid="form-nuevo-contrato">
              <div className="font-exo text-[11px] tracking-[0.2em]" style={{ color: '#3a6080' }}>SELECCIONAR FAENA</div>
              {availableFaenas.length === 0 ? (
                <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>Todas las faenas ya tienen contrato TMS</div>
              ) : (
                <div className="space-y-2">
                  {availableFaenas.map(f => (
                    <button key={f.id} onClick={() => setSelectedFaenaId(f.id)}
                      className={`w-full text-left px-4 py-3 border cursor-pointer transition-all ${selectedFaenaId === f.id ? 'border-[rgba(0,212,255,0.4)] bg-[rgba(0,212,255,0.06)]' : 'border-[#0d2035] hover:border-[rgba(0,212,255,0.2)]'}`}
                      data-testid={`faena-option-${f.id}`}>
                      <div className="font-rajdhani text-sm font-semibold" style={{ color: selectedFaenaId === f.id ? '#00d4ff' : '#c8e8ff' }}>{f.nombre}</div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowCreate(false); setSelectedFaenaId(null); }}
                  className="px-4 py-2 font-space text-xs font-bold cursor-pointer border" style={{ borderColor: '#0d2035', color: '#3a6080' }}>
                  CANCELAR
                </button>
                <button onClick={handleCreate} disabled={!selectedFaenaId || creating}
                  className="px-4 py-2 font-space text-xs font-bold cursor-pointer border transition-all disabled:opacity-40"
                  style={{ borderColor: 'rgba(0,212,255,0.3)', color: '#00d4ff', background: 'rgba(0,212,255,0.06)' }}
                  data-testid="btn-confirmar-contrato">
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "CREAR CONTRATO"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-exo text-[11px] tracking-[0.2em] uppercase" style={{ color: '#3a6080' }}>
            {sortedContratos.length} CONTRATOS &middot; {sortedContratos.reduce((s, c) => s + (c.truckCount || 0), 0)} CAMIONES ASIGNADOS
          </span>
          <span className="font-exo text-[11px]" style={{ color: '#3a6080' }}>
            ordenados por actividad
          </span>
        </div>

        {sortedContratos.map((c, idx) => {
          const isExpanded = expandedId === c.id;
          const viajes = c.totalViajes || 0;
          const km = parseFloat(c.kmTotal || "0");
          const hasActivity = viajes > 0;
          const borderColor = hasActivity ? '#00d4ff' : '#0d2035';

          return (
            <div key={c.id} className="dash-card overflow-hidden transition-all" style={{ borderLeft: `3px solid ${borderColor}` }}
              data-testid={`contrato-card-${c.id}`}>
              <div className="flex items-center">
                <button
                  className="flex-1 flex items-center gap-3 px-4 py-3 cursor-pointer text-left transition-all hover:bg-[rgba(0,212,255,0.03)]"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  data-testid={`contrato-expand-${c.id}`}>
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#00d4ff' }} />
                    : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#3a6080' }} />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-rajdhani text-sm font-bold truncate" style={{ color: hasActivity ? '#c8e8ff' : '#3a6080' }}>{c.nombre}</span>
                      {!hasActivity && (
                        <span className="font-space text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,204,0,0.1)', color: '#ffcc00' }}>SIN VIAJES</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="font-space text-xs" style={{ color: '#3a6080' }}>
                        {c.truckCount} camiones
                      </span>
                      {hasActivity && (
                        <>
                          <span className="font-space text-xs" style={{ color: '#00d4ff' }}>{viajes} viajes</span>
                          <span className="font-space text-xs" style={{ color: '#3a6080' }}>{km.toLocaleString()} km</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  className="px-4 py-3 flex items-center gap-1 cursor-pointer font-space text-[11px] font-bold transition-all hover:bg-[rgba(0,212,255,0.06)]"
                  style={{ color: '#00d4ff', borderLeft: '1px solid #0d2035' }}
                  onClick={() => onSelect(c.id)}
                  data-testid={`contrato-enter-${c.id}`}>
                  ABRIR <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid #0d2035' }}>
                  {c.trucks && c.trucks.length > 0 ? (
                    <div className="divide-y" style={{ borderColor: '#0d2035' }}>
                      <div className="px-4 py-1.5 flex items-center gap-4" style={{ background: 'rgba(0,212,255,0.02)' }}>
                        <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '120px' }}>PATENTE</span>
                        <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1" style={{ color: '#3a6080' }}>CONDUCTOR</span>
                        <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '60px' }}>VIAJES</span>
                        <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '70px' }}>KM</span>
                        <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '50px' }}>SYNC</span>
                      </div>
                      {c.trucks.map(t => (
                        <div key={t.id} className="px-4 py-2 flex items-center gap-4 transition-all hover:bg-[rgba(0,212,255,0.04)] cursor-pointer" style={{ borderColor: '#0d2035' }}
                          onClick={() => setTruckModal({ contratoId: c.id, camionId: t.id })}
                          data-testid={`truck-row-${t.id}`}>
                          <div className="flex items-center gap-2" style={{ width: '120px' }}>
                            <Truck className="w-3 h-3 flex-shrink-0" style={{ color: t.syncOk ? '#00ff88' : '#3a6080' }} />
                            <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>{t.patente}</span>
                          </div>
                          <span className="font-exo text-xs flex-1 truncate" style={{ color: '#3a6080' }}>{t.conductor || '\u2014'}</span>
                          <span className="font-space text-xs text-right" style={{ color: t.viajesCount > 0 ? '#00d4ff' : '#3a6080', width: '60px' }}>
                            {t.viajesCount > 0 ? t.viajesCount : '\u2014'}
                          </span>
                          <span className="font-space text-xs text-right" style={{ color: '#3a6080', width: '70px' }}>
                            {t.kmTotal > 0 ? t.kmTotal.toLocaleString() : '\u2014'}
                          </span>
                          <span className="text-right" style={{ width: '50px' }}>
                            {t.syncOk
                              ? <CheckCircle className="w-3 h-3 inline" style={{ color: '#00ff88' }} />
                              : <Circle className="w-3 h-3 inline" style={{ color: '#3a6080' }} />
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>Sin camiones asignados</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {contratos.length === 0 && !syncing && (
          <div className="dash-card p-8 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: '#0d2035' }} />
            <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>No hay contratos creados. Presiona SINCRONIZAR para generar automaticamente desde Sigetra.</div>
          </div>
        )}
      </div>

      {truckModal && (
        <TruckDetailModal
          contratoId={truckModal.contratoId}
          camionId={truckModal.camionId}
          onClose={() => setTruckModal(null)}
        />
      )}
    </div>
  );
}

const DATA_START = "2026-03-01";
const TMS_SUBTABS = ["RESUMEN", "VIAJES", "MAPA", "ANALISIS IA"] as const;
type TmsSubTab = typeof TMS_SUBTABS[number];

function ContractView({ contratoId, onBack }: { contratoId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<TmsSubTab>("RESUMEN");

  const { data: contrato, isLoading } = useQuery<ContratoFull>({
    queryKey: ["/api/tms/contratos", contratoId],
    refetchInterval: 120000,
  });

  if (isLoading || !contrato) {
    return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-4" data-testid="tms-contract-view">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 px-3 py-1.5 font-space text-xs font-bold cursor-pointer border transition-all hover:border-[#00d4ff]"
          style={{ borderColor: '#0d2035', color: '#3a6080' }} data-testid="btn-back-contratos">
          <ChevronLeft className="w-3 h-3" /> CONTRATOS
        </button>
        <div>
          <div className="font-space text-base font-bold tracking-[0.15em]" style={{ color: '#00d4ff' }}>{contrato.nombre}</div>
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>
            {contrato.stats.totalCamiones} camiones &middot; {contrato.stats.totalViajes} viajes &middot; {contrato.stats.totalKm.toLocaleString()} km
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b pb-1" style={{ borderColor: '#0d2035' }}>
        {TMS_SUBTABS.map(tab => {
          const Icon = tab === "RESUMEN" ? BarChart3 : tab === "VIAJES" ? Truck : tab === "MAPA" ? MapIcon : Brain;
          return (
            <button key={tab} onClick={() => setSubTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-space text-[11px] font-bold cursor-pointer transition-all ${
                subTab === tab ? 'text-[#00d4ff] border-b-2' : 'text-[#3a6080] hover:text-[#c8e8ff]'
              }`}
              style={subTab === tab ? { borderBottomColor: '#00d4ff' } : {}}
              data-testid={`subtab-${tab.toLowerCase().replace(" ", "-")}`}>
              <Icon className="w-3 h-3" /> {tab}
            </button>
          );
        })}
      </div>

      {subTab === "RESUMEN" && <ResumenTab contrato={contrato} />}
      {subTab === "VIAJES" && <ViajesTab contratoId={contratoId} camiones={contrato.camiones} contratoNombre={contrato.nombre} />}
      {subTab === "MAPA" && <MapaTab contratoId={contratoId} camiones={contrato.camiones} />}
      {subTab === "ANALISIS IA" && <AnalisisTab contratoId={contratoId} nombre={contrato.nombre} />}
    </div>
  );
}

function ResumenTab({ contrato }: { contrato: ContratoFull }) {
  const { toast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState("");

  const steps = [
    "Obteniendo GPS de camiones...",
    "Detectando paradas y movimientos...",
    "Identificando rutas frecuentes...",
    "Consultando Sigetra...",
    "Generando analisis con IA...",
  ];

  const handleAnalyze = async () => {
    setAnalyzing(true);
    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        setAnalyzeStep(steps[stepIdx]);
        stepIdx++;
      }
    }, 3000);

    try {
      const res = await apiRequest("POST", `/api/tms/contratos/${contrato.id}/analizar`);
      const data = await res.json();
      clearInterval(interval);
      setAnalyzeStep(`Listo \u2014 ${data.viajesDetectados} viajes detectados`);
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos", contrato.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos"] });
      toast({ title: "Analisis completado", description: `${data.viajesDetectados} viajes detectados` });
      setTimeout(() => { setAnalyzing(false); setAnalyzeStep(""); }, 2000);
    } catch (e: any) {
      clearInterval(interval);
      setAnalyzing(false);
      setAnalyzeStep("");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4" data-testid="tab-resumen">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="CAMIONES" value={String(contrato.stats.totalCamiones)} color="#00d4ff" />
        <KpiCard label="VIAJES" value={String(contrato.stats.totalViajes)} color="#00d4ff" />
        <KpiCard label="KM TOTAL" value={contrato.stats.totalKm.toLocaleString()} sub="km" />
        <KpiCard label="RENDIMIENTO" value={contrato.stats.rendimientoProm > 0 ? `${contrato.stats.rendimientoProm}` : '\u2014'} sub="km/L" color={contrato.stats.rendimientoProm >= 2 ? '#00ff88' : '#ffcc00'} />
        <KpiCard label="LITROS" value={contrato.stats.totalLitros > 0 ? contrato.stats.totalLitros.toLocaleString() : '\u2014'} sub="L totales" />
      </div>

      {contrato.stats.totalViajes === 0 ? (
        <div className="dash-card p-8 text-center space-y-4">
          <Search className="w-10 h-10 mx-auto" style={{ color: '#00d4ff' }} />
          <div className="font-rajdhani text-base font-semibold" style={{ color: '#c8e8ff' }}>Analisis pendiente</div>
          <div className="font-exo text-[12px] max-w-sm mx-auto" style={{ color: '#3a6080', lineHeight: '1.7' }}>
            Presiona Detectar para analizar el historial de esta flota desde {DATA_START}
          </div>
          <button onClick={handleAnalyze} disabled={analyzing}
            className="octagonal px-8 py-3 font-space text-[11px] font-bold cursor-pointer transition-all hover:shadow-[0_0_16px_rgba(0,212,255,0.25)] disabled:opacity-60"
            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
            data-testid="btn-analizar">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Search className="w-4 h-4 inline mr-2" />}
            DETECTAR VIAJES
          </button>
          {analyzing && analyzeStep && (
            <div className="font-exo text-[11px] animate-pulse" style={{ color: '#00d4ff' }}>{analyzeStep}</div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-exo text-xs" style={{ color: '#3a6080' }}>Ultimo analisis: {contrato.stats.totalViajes} viajes detectados</span>
          <button onClick={handleAnalyze} disabled={analyzing}
            className="flex items-center gap-1 px-3 py-1.5 font-space text-[11px] font-bold cursor-pointer border transition-all hover:border-[#00d4ff] disabled:opacity-50"
            style={{ borderColor: '#0d2035', color: '#3a6080' }}
            data-testid="btn-actualizar-analisis">
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR
          </button>
          {analyzing && analyzeStep && (
            <span className="font-exo text-xs animate-pulse" style={{ color: '#00d4ff' }}>{analyzeStep}</span>
          )}
        </div>
      )}

      <div className="dash-card">
        <div className="p-3 border-b" style={{ borderColor: '#0d2035' }}>
          <span className="font-exo text-[11px] tracking-[0.2em] font-semibold uppercase" style={{ color: '#c8e8ff' }}>CAMIONES DEL CONTRATO</span>
        </div>
        <div className="divide-y" style={{ borderColor: '#0d2035' }}>
          {contrato.camiones.map(cam => {
            const camViajes = contrato.viajes.filter(v => v.camionId === cam.id);
            const camKm = camViajes.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0);
            return (
              <div key={cam.id} className="px-4 py-2.5 flex items-center justify-between" style={{ borderColor: '#0d2035' }} data-testid={`camion-row-${cam.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Truck className="w-4 h-4 flex-shrink-0" style={{ color: cam.syncOk ? '#00ff88' : '#3a6080' }} />
                  <div>
                    <span className="font-space text-xs font-bold" style={{ color: '#c8e8ff' }}>{cam.patente}</span>
                    {cam.conductor && <span className="font-exo text-xs ml-2" style={{ color: '#3a6080' }}>{cam.conductor}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-space text-[11px]" style={{ color: '#3a6080' }}>{camViajes.length} viajes</span>
                  <span className="font-space text-[11px]" style={{ color: '#3a6080' }}>{Math.round(camKm).toLocaleString()} km</span>
                  {cam.syncAt && <span className="font-exo text-xs" style={{ color: '#3a6080' }}>{cam.syncAt}</span>}
                </div>
              </div>
            );
          })}
          {contrato.camiones.length === 0 && (
            <div className="p-4 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>Sin camiones asignados a esta faena</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ViajesTab({ contratoId, camiones, contratoNombre }: { contratoId: number; camiones: Camion[]; contratoNombre: string }) {
  const { toast } = useToast();
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroCamion, setFiltroCamion] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCrear, setShowCrear] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: viajes = [], isLoading } = useQuery<TmsViajeWithParadas[]>({
    queryKey: ["/api/tms/contratos", contratoId, "viajes", filtroEstado, filtroCamion],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtroEstado !== "TODOS") params.set("estado", filtroEstado);
      if (filtroCamion) params.set("camion_id", String(filtroCamion));
      const res = await fetch(`/api/tms/contratos/${contratoId}/viajes?${params}`);
      return res.json();
    },
  });

  const confirmarMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("POST", `/api/tms/viajes/${id}/confirmar`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos", contratoId, "viajes"] });
      toast({ title: "Viaje confirmado" });
    },
  });

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return viajes;
    const s = searchTerm.toLowerCase();
    return viajes.filter(v => v.codigo.toLowerCase().includes(s) || (v.conductor || "").toLowerCase().includes(s));
  }, [viajes, searchTerm]);

  return (
    <div className="space-y-3" data-testid="tab-viajes">
      <div className="flex items-center gap-2 flex-wrap">
        {["TODOS", "DETECTADO", "CONFIRMADO", "EN_RUTA", "COMPLETADO"].map(est => (
          <button key={est} onClick={() => setFiltroEstado(est)}
            className={`px-3 py-1.5 font-space text-[11px] font-bold cursor-pointer border transition-all ${
              filtroEstado === est ? 'border-[rgba(0,212,255,0.3)] text-[#00d4ff] bg-[rgba(0,212,255,0.1)]' : 'border-[#0d2035] text-[#3a6080]'
            }`}
            data-testid={`filter-${est.toLowerCase()}`}>{est.replace("_", " ")}</button>
        ))}
        <select value={filtroCamion || ""} onChange={e => setFiltroCamion(e.target.value ? parseInt(e.target.value) : null)}
          className="px-2 py-1.5 font-space text-[11px] bg-transparent border cursor-pointer" style={{ borderColor: '#0d2035', color: '#3a6080' }}
          data-testid="filter-camion">
          <option value="">Todos los camiones</option>
          {camiones.map(c => <option key={c.id} value={c.id}>{c.patente}</option>)}
        </select>
        <div className="flex-1 min-w-[150px] max-w-xs relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#3a6080' }} />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..."
            className="w-full pl-7 pr-3 py-1.5 font-space text-[11px] bg-transparent border outline-none"
            style={{ borderColor: '#0d2035', color: '#c8e8ff' }} data-testid="input-search-viajes" />
        </div>
        <button onClick={() => setShowCrear(true)}
          className="flex items-center gap-1 px-3 py-1.5 font-space text-[11px] font-bold cursor-pointer border transition-all hover:shadow-[0_0_8px_rgba(0,212,255,0.2)]"
          style={{ borderColor: 'rgba(0,212,255,0.3)', color: '#00d4ff', background: 'rgba(0,212,255,0.06)' }}
          data-testid="btn-crear-viaje-manual">
          <Plus className="w-3 h-3" /> CREAR VIAJE MANUAL
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : filtered.length === 0 ? (
        <div className="dash-card p-8 text-center">
          <Truck className="w-8 h-8 mx-auto mb-2" style={{ color: '#0d2035' }} />
          <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>
            {viajes.length === 0 ? "Analisis pendiente \u2014 presiona Detectar para analizar historial de esta flota" : "Sin resultados para este filtro"}
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1" data-testid="viajes-list">
          {filtered.map(viaje => {
            const colors = ESTADO_COLORS[viaje.estado] || ESTADO_COLORS.DETECTADO;
            const cam = camiones.find(c => c.id === viaje.camionId);
            const isExpanded = expandedId === viaje.id;

            return (
              <div key={viaje.id} className="dash-card overflow-hidden" style={{ borderLeft: `3px solid ${colors.border}` }}
                data-testid={`viaje-card-${viaje.id}`}>
                <div className="p-3 cursor-pointer hover:bg-[rgba(0,212,255,0.02)] transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : viaje.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isExpanded ? <ChevronDown className="w-3 h-3" style={{ color: '#3a6080' }} /> : <ChevronRight className="w-3 h-3" style={{ color: '#3a6080' }} />}
                      <span className="font-space text-xs font-bold" style={{ color: '#00d4ff' }}>{viaje.codigo}</span>
                      <span className="px-2 py-0.5 font-space text-xs font-bold border uppercase" style={{
                        color: colors.text, borderColor: colors.border, background: colors.bg
                      }}>{viaje.estado.replace("_", " ")}</span>
                      {viaje.detectadoPorIa && (
                        <span className="px-1.5 py-0.5 font-space text-[7px] border" style={{ borderColor: 'rgba(0,212,255,0.3)', color: '#00d4ff', background: 'rgba(0,212,255,0.06)' }}>
                          IA
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 ml-5">
                    <div className="font-rajdhani text-[12px]" style={{ color: '#c8e8ff' }}>
                      Cam {cam?.patente || '?'} {viaje.conductor ? `· ${viaje.conductor}` : ''}
                    </div>
                    <div className="font-exo text-xs flex items-center gap-1 flex-wrap" style={{ color: '#3a6080' }}>
                      {viaje.origenNombre && <span>{viaje.origenNombre}</span>}
                      {viaje.origenNombre && viaje.destinoNombre && <ArrowRight className="w-3 h-3" />}
                      {viaje.destinoNombre && <span>{viaje.destinoNombre}</span>}
                      {viaje.fechaSalida && <span>&middot; {new Date(viaje.fechaSalida).toLocaleDateString("es-CL")}</span>}
                      {viaje.kmRecorridos && <span>&middot; {parseFloat(viaje.kmRecorridos).toLocaleString()} km</span>}
                      {viaje.rendimientoReal && <span>&middot; {viaje.rendimientoReal} km/L</span>}
                    </div>
                    {(viaje.litrosSigetra || viaje.litrosEcu) && (
                      <div className="font-space text-[11px] mt-0.5 flex items-center gap-2" style={{ color: '#3a6080' }}>
                        {viaje.litrosSigetra && <span>Sigetra: {viaje.litrosSigetra}L</span>}
                        {viaje.litrosEcu && <span>ECU: {viaje.litrosEcu}L</span>}
                        {viaje.diferenciaLitros && (
                          <span style={{ color: Math.abs(parseFloat(viaje.diferenciaLitros)) > 15 ? '#ff2244' : '#00ff88' }}>
                            Dif: {parseFloat(viaje.diferenciaLitros) > 0 ? '+' : ''}{viaje.diferenciaLitros}L
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: '#0d2035' }}>
                    {viaje.paradas.length > 0 && (
                      <div>
                        <div className="font-exo text-xs tracking-[0.2em] mb-2" style={{ color: '#3a6080' }}>PARADAS ({viaje.paradas.length})</div>
                        {viaje.paradas.map((p, i) => (
                          <div key={p.id} className="flex items-center gap-2 py-1">
                            <CheckCircle className="w-3 h-3 flex-shrink-0" style={{ color: p.estado === "COMPLETADO" ? '#00ff88' : '#3a6080' }} />
                            <span className="font-rajdhani text-[11px]" style={{ color: '#c8e8ff' }}>{p.nombre || `Parada ${i + 1}`}</span>
                            <span className="font-exo text-[11px]" style={{ color: '#3a6080' }}>{p.tipo}</span>
                            {p.horaReal && <span className="font-space text-xs" style={{ color: '#3a6080' }}>{new Date(p.horaReal).toLocaleString("es-CL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      {viaje.estado === "DETECTADO" && (
                        <button onClick={() => confirmarMut.mutate(viaje.id)}
                          className="px-3 py-1.5 font-space text-[11px] font-bold cursor-pointer border transition-all hover:shadow-[0_0_8px_rgba(0,255,136,0.2)]"
                          style={{ borderColor: 'rgba(0,255,136,0.3)', color: '#00ff88', background: 'rgba(0,255,136,0.06)' }}
                          data-testid={`btn-confirmar-${viaje.id}`}>
                          <CheckCircle className="w-3 h-3 inline mr-1" /> CONFIRMAR
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCrear && (
        <CreateViajeManualModal contratoId={contratoId} camiones={camiones} contratoNombre={contratoNombre}
          onClose={() => setShowCrear(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos", contratoId, "viajes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos", contratoId] });
          }} />
      )}
    </div>
  );
}

function CreateViajeManualModal({ contratoId, camiones, contratoNombre, onClose, onCreated }: {
  contratoId: number; camiones: Camion[]; contratoNombre: string; onClose: () => void; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [camionId, setCamionId] = useState<number | null>(null);
  const [conductor, setConductor] = useState("");
  const [origenNombre, setOrigenNombre] = useState("");
  const [destinoNombre, setDestinoNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedCamion = camiones.find(c => c.id === camionId);
  useEffect(() => {
    if (selectedCamion?.conductor) setConductor(selectedCamion.conductor);
  }, [camionId]);

  const handleCreate = async () => {
    if (!camionId) { toast({ title: "Error", description: "Selecciona un camion", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiRequest("POST", `/api/tms/contratos/${contratoId}/viajes`, {
        camionId,
        conductor: conductor || undefined,
        origenNombre: origenNombre || undefined,
        destinoNombre: destinoNombre || undefined,
        notas: notas || undefined,
        estado: "CONFIRMADO",
      });
      toast({ title: "Viaje creado" });
      onCreated();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose} data-testid="modal-crear-viaje">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto mx-4" style={{ background: '#020508', border: '1px solid #0d2035' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#0d2035' }}>
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" style={{ color: '#00d4ff' }} />
            <span className="font-space text-sm font-bold tracking-[0.15em]" style={{ color: '#c8e8ff' }}>VIAJE MANUAL</span>
          </div>
          <button onClick={onClose} className="p-1 cursor-pointer hover:opacity-70" data-testid="btn-close-crear"><X className="w-5 h-5" style={{ color: '#3a6080' }} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="font-exo text-[11px] tracking-wider block mb-1" style={{ color: '#3a6080' }}>CAMION</label>
            <select value={camionId || ""} onChange={e => setCamionId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 font-space text-xs bg-transparent border outline-none cursor-pointer"
              style={{ borderColor: '#0d2035', color: '#c8e8ff' }} data-testid="select-camion">
              <option value="">Seleccionar</option>
              {camiones.map(c => <option key={c.id} value={c.id}>{c.patente} {c.conductor ? `- ${c.conductor}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="font-exo text-[11px] tracking-wider block mb-1" style={{ color: '#3a6080' }}>CONDUCTOR</label>
            <input value={conductor} onChange={e => setConductor(e.target.value)}
              className="w-full px-3 py-2 font-space text-xs bg-transparent border outline-none"
              style={{ borderColor: '#0d2035', color: '#c8e8ff' }} data-testid="input-conductor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-exo text-[11px] tracking-wider block mb-1" style={{ color: '#3a6080' }}>ORIGEN</label>
              <input value={origenNombre} onChange={e => setOrigenNombre(e.target.value)}
                className="w-full px-3 py-2 font-space text-xs bg-transparent border outline-none"
                style={{ borderColor: '#0d2035', color: '#c8e8ff' }} data-testid="input-origen" />
            </div>
            <div>
              <label className="font-exo text-[11px] tracking-wider block mb-1" style={{ color: '#3a6080' }}>DESTINO</label>
              <input value={destinoNombre} onChange={e => setDestinoNombre(e.target.value)}
                className="w-full px-3 py-2 font-space text-xs bg-transparent border outline-none"
                style={{ borderColor: '#0d2035', color: '#c8e8ff' }} data-testid="input-destino" />
            </div>
          </div>
          <div>
            <label className="font-exo text-[11px] tracking-wider block mb-1" style={{ color: '#3a6080' }}>NOTAS</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full px-3 py-2 font-space text-xs bg-transparent border outline-none resize-none"
              style={{ borderColor: '#0d2035', color: '#c8e8ff' }} data-testid="input-notas" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2 font-space text-xs font-bold cursor-pointer border" style={{ borderColor: '#0d2035', color: '#3a6080' }}>CANCELAR</button>
            <button onClick={handleCreate} disabled={saving}
              className="flex-1 py-2 font-space text-xs font-bold cursor-pointer border transition-all disabled:opacity-40"
              style={{ borderColor: 'rgba(0,212,255,0.3)', color: '#00d4ff', background: 'rgba(0,212,255,0.06)' }}
              data-testid="btn-crear-viaje">
              {saving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "CREAR VIAJE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapaTab({ contratoId, camiones }: { contratoId: number; camiones: Camion[] }) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [filtroCamion, setFiltroCamion] = useState<number | null>(null);
  const [showPuntos, setShowPuntos] = useState(true);
  const [showRutas, setShowRutas] = useState(true);
  const [showLive, setShowLive] = useState(true);
  const { toast } = useToast();

  const { data: mapData } = useQuery<{
    puntos: TmsPunto[];
    routes: any[];
    livePositions: { camionId: number; patente: string; lat: number; lng: number; speed: number }[];
  }>({
    queryKey: ["/api/tms/contratos", contratoId, "mapa"],
    refetchInterval: 120000,
  });

  const editPuntoMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/tms/puntos/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos", contratoId, "mapa"] });
      toast({ title: "Punto actualizado" });
    },
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { center: [-33.45, -70.65], zoom: 6, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(mapRef.current);
    markersRef.current = L.layerGroup().addTo(mapRef.current);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markersRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markersRef.current || !mapData) return;
    markersRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    if (showPuntos) {
      for (const p of mapData.puntos) {
        if (filtroCamion && p.camionId !== filtroCamion) continue;
        const lat = parseFloat(String(p.lat));
        const lng = parseFloat(String(p.lng));
        if (isNaN(lat) || isNaN(lng)) continue;
        bounds.push([lat, lng]);

        const size = Math.min(24, 8 + (p.vecesVisitado || 1) * 2);
        const color = (p.vecesVisitado || 1) >= 5 ? '#00ff88' : (p.vecesVisitado || 1) >= 2 ? '#00d4ff' : '#3a6080';

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #020508;box-shadow:0 0 6px ${color};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;color:#020508;font-family:monospace">${(p.vecesVisitado || 1) > 1 ? p.vecesVisitado : ''}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        });

        const cam = camiones.find(c => c.id === p.camionId);
        marker.bindPopup(`<div style="font-family:monospace;font-size:11px;min-width:180px">
          <b>${p.nombreInferido || 'Punto sin nombre'}</b><br/>
          Tipo: ${p.tipo || 'N/A'}<br/>
          Visitas: ${p.vecesVisitado || 1}<br/>
          Duracion prom: ${p.duracionPromedioMin || 0} min<br/>
          Camion: ${cam?.patente || '?'}<br/>
          ${p.confirmado ? '<span style="color:green">Confirmado</span>' : '<span style="color:gray">Sin confirmar</span>'}
        </div>`);
        marker.addTo(markersRef.current!);
      }
    }

    if (showRutas) {
      for (const route of mapData.routes) {
        if (filtroCamion && route.camionId !== filtroCamion) continue;
        const pts: L.LatLngExpression[] = [];
        if (route.origenLat && route.origenLng) {
          const lat = parseFloat(route.origenLat);
          const lng = parseFloat(route.origenLng);
          if (!isNaN(lat) && !isNaN(lng)) { pts.push([lat, lng]); bounds.push([lat, lng]); }
        }
        for (const p of route.paradas || []) {
          if (p.lat && p.lng) {
            const lat = parseFloat(p.lat);
            const lng = parseFloat(p.lng);
            if (!isNaN(lat) && !isNaN(lng)) { pts.push([lat, lng]); bounds.push([lat, lng]); }
          }
        }
        if (route.destinoLat && route.destinoLng) {
          const lat = parseFloat(route.destinoLat);
          const lng = parseFloat(route.destinoLng);
          if (!isNaN(lat) && !isNaN(lng)) { pts.push([lat, lng]); bounds.push([lat, lng]); }
        }
        if (pts.length >= 2) {
          const cam = camiones.find(c => c.id === route.camionId);
          const color = ESTADO_COLORS[route.estado]?.border || '#3a6080';
          const line = L.polyline(pts, { color, weight: 2, opacity: 0.5, dashArray: "6 4" });
          line.bindTooltip(`${cam?.patente || '?'} · ${route.codigo} · ${route.kmRecorridos || '?'} km`, { sticky: true });
          line.addTo(markersRef.current!);
        }
      }
    }

    if (showLive) {
      for (const pos of mapData.livePositions) {
        if (filtroCamion && pos.camionId !== filtroCamion) continue;
        bounds.push([pos.lat, pos.lng]);
        L.marker([pos.lat, pos.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#00ff88;border:3px solid #020508;box-shadow:0 0 10px #00ff88,0 0 20px rgba(0,255,136,0.3)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).bindPopup(`<div style="font-family:monospace;font-size:11px"><b>${pos.patente}</b><br/>Vel: ${pos.speed} km/h<br/>GPS en vivo</div>`)
          .addTo(markersRef.current!);
      }
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [30, 30], maxZoom: 12 });
    }
  }, [mapData, filtroCamion, showPuntos, showRutas, showLive]);

  return (
    <div className="space-y-3" data-testid="tab-mapa">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filtroCamion || ""} onChange={e => setFiltroCamion(e.target.value ? parseInt(e.target.value) : null)}
          className="px-2 py-1.5 font-space text-[11px] bg-transparent border cursor-pointer" style={{ borderColor: '#0d2035', color: '#3a6080' }}>
          <option value="">Todos los camiones</option>
          {camiones.map(c => <option key={c.id} value={c.id}>{c.patente}</option>)}
        </select>
        <label className="flex items-center gap-1 font-space text-[11px] cursor-pointer" style={{ color: showPuntos ? '#00d4ff' : '#3a6080' }}>
          <input type="checkbox" checked={showPuntos} onChange={e => setShowPuntos(e.target.checked)} className="w-3 h-3" /> Puntos
        </label>
        <label className="flex items-center gap-1 font-space text-[11px] cursor-pointer" style={{ color: showRutas ? '#00d4ff' : '#3a6080' }}>
          <input type="checkbox" checked={showRutas} onChange={e => setShowRutas(e.target.checked)} className="w-3 h-3" /> Rutas
        </label>
        <label className="flex items-center gap-1 font-space text-[11px] cursor-pointer" style={{ color: showLive ? '#00ff88' : '#3a6080' }}>
          <input type="checkbox" checked={showLive} onChange={e => setShowLive(e.target.checked)} className="w-3 h-3" /> GPS en vivo
        </label>
      </div>
      <div ref={containerRef} className="w-full border" style={{ height: 'calc(100vh - 320px)', minHeight: '400px', background: '#091018', borderColor: '#0d2035' }} />
    </div>
  );
}

function AnalisisTab({ contratoId, nombre }: { contratoId: number; nombre: string }) {
  const { toast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await apiRequest("POST", `/api/tms/contratos/${contratoId}/analizar`);
      const data = await res.json();
      setResultado(data.iaResumen || "Sin resultados de IA disponibles.");
      queryClient.invalidateQueries({ queryKey: ["/api/tms/contratos", contratoId] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const sections = useMemo(() => {
    if (!resultado) return [];
    const parts: { title: string; content: string; color: string }[] = [];
    const lines = resultado.split("\n");
    let currentTitle = "";
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^\d+\.\s*\*?\*?([^*]+)\*?\*?\s*$/);
      const boldMatch = line.match(/^\*\*(.+?)\*\*\s*$/);

      if (headerMatch || boldMatch) {
        if (currentTitle) {
          parts.push({ title: currentTitle, content: currentContent.join("\n").trim(), color: '#c8e8ff' });
        }
        currentTitle = (headerMatch?.[1] || boldMatch?.[1] || line).trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    if (currentTitle) {
      parts.push({ title: currentTitle, content: currentContent.join("\n").trim(), color: '#c8e8ff' });
    }

    if (parts.length === 0 && resultado) {
      parts.push({ title: "ANALISIS", content: resultado, color: '#c8e8ff' });
    }

    return parts.map(p => {
      let color = '#c8e8ff';
      const tl = p.title.toLowerCase();
      if (tl.includes("resumen")) color = '#00d4ff';
      if (tl.includes("alerta")) color = '#ff2244';
      if (tl.includes("recomend")) color = '#00ff88';
      return { ...p, color };
    });
  }, [resultado]);

  return (
    <div className="space-y-4" data-testid="tab-analisis">
      <div className="flex items-center gap-3">
        <button onClick={handleAnalyze} disabled={analyzing}
          className="octagonal flex items-center gap-2 px-5 py-2.5 font-space text-[11px] font-bold cursor-pointer transition-all hover:shadow-[0_0_16px_rgba(0,212,255,0.25)] disabled:opacity-60"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
          data-testid="btn-analisis-ia">
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {analyzing ? "ANALIZANDO..." : "EJECUTAR ANALISIS IA"}
        </button>
      </div>

      {analyzing && (
        <div className="dash-card p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: '#00d4ff' }} />
          <div className="font-exo text-[11px] animate-pulse" style={{ color: '#00d4ff' }}>Analizando contrato {nombre} con Claude...</div>
        </div>
      )}

      {!analyzing && sections.length > 0 && (
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="dash-card p-4" style={{ borderLeft: `3px solid ${s.color}` }}>
              <div className="font-exo text-[11px] tracking-[0.2em] font-semibold uppercase mb-2" style={{ color: s.color }}>{s.title}</div>
              <div className="font-rajdhani text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#c8e8ff' }}>{s.content}</div>
            </div>
          ))}
        </div>
      )}

      {!analyzing && sections.length === 0 && !resultado && (
        <div className="dash-card p-8 text-center">
          <Brain className="w-8 h-8 mx-auto mb-2" style={{ color: '#0d2035' }} />
          <div className="font-exo text-[11px]" style={{ color: '#3a6080' }}>Presiona "EJECUTAR ANALISIS IA" para obtener un analisis completo del contrato.</div>
        </div>
      )}
    </div>
  );
}

export default function TMS() {
  const [selectedContratoId, setSelectedContratoId] = useState<number | null>(null);

  return (
    <div className="dash-bg min-h-screen -mx-5 -mt-5 px-5 pt-5 pb-10" data-testid="tms-view">
      <div className="dash-scanlines" />
      <div className="dash-content max-w-[1400px] mx-auto">
        {selectedContratoId ? (
          <ContractView contratoId={selectedContratoId} onBack={() => setSelectedContratoId(null)} />
        ) : (
          <ContractSelector onSelect={setSelectedContratoId} />
        )}
      </div>
    </div>
  );
}
