import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronRight, Truck, Calendar, Fuel, TrendingUp } from "lucide-react";

interface DiaData {
  total: number;
  km: number;
  camiones: string[];
}

interface CamionResumen {
  patente: string;
  modelo: string;
  viajes: number;
  km: number;
  litros: number;
  rendimiento: number;
}

interface FaenaResumen {
  id: number;
  nombre: string;
  color: string;
  totalCamiones: number;
  litros30d: number;
  rendPromedio: number;
  contrato: { id: number; nombre: string } | null;
  totalViajes: number;
  totalKm: number;
  viajesPorDia: Record<string, DiaData>;
  camionResumen: CamionResumen[];
}

function generarDiasDesdeMarzo(): string[] {
  const dias: string[] = [];
  const inicio = new Date("2026-03-01");
  const hoy = new Date();
  const d = new Date(inicio);
  while (d <= hoy) {
    dias.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dias.reverse();
}

function formatDia(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  const dia = d.getDate().toString().padStart(2, "0");
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const mes = meses[d.getMonth()];
  const dow = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"][d.getDay()];
  return `${dow} ${dia} ${mes}`;
}

function FaenaCard({ faena }: { faena: FaenaResumen }) {
  const [expanded, setExpanded] = useState(false);
  const [showCamiones, setShowCamiones] = useState(false);
  const dias = useMemo(() => generarDiasDesdeMarzo(), []);

  const diasConViajes = dias.filter(d => faena.viajesPorDia[d]);
  const maxViajesDia = Math.max(1, ...Object.values(faena.viajesPorDia).map(v => v.total));

  return (
    <div className="dash-card overflow-hidden" style={{ border: `1px solid ${faena.color}20` }}>
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
        onClick={() => setExpanded(!expanded)}
        data-testid={`faena-resumen-card-${faena.id}`}>
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: faena.color, boxShadow: `0 0 8px ${faena.color}50` }} />
        {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#00d4ff' }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#3a6080' }} />}
        <div className="flex-1 min-w-0">
          <div className="font-space text-[14px] font-bold tracking-[0.08em]" style={{ color: '#c8e8ff' }}>{faena.nombre}</div>
          <div className="flex items-center gap-3 mt-0.5">
            {faena.contrato && (
              <span className="font-exo text-[11px]" style={{ color: '#3a6080' }}>TMS: {faena.contrato.nombre}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="font-space text-[16px] font-bold" style={{ color: '#00d4ff' }}>{faena.totalViajes}</div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>VIAJES</div>
          </div>
          <div className="text-right">
            <div className="font-space text-[14px] font-bold" style={{ color: '#c8e8ff' }}>{faena.totalKm.toLocaleString()}</div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>KM</div>
          </div>
          <div className="text-right">
            <div className="font-space text-[14px] font-bold" style={{ color: '#c8e8ff' }}>{faena.litros30d.toLocaleString()}</div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>LITROS</div>
          </div>
          <div className="text-right">
            <div className="font-space text-[14px] font-bold" style={{ color: faena.rendPromedio >= 3.5 ? '#00ff88' : faena.rendPromedio >= 2.5 ? '#c8e8ff' : '#ffcc00' }}>
              {faena.rendPromedio > 0 ? faena.rendPromedio : '\u2014'}
            </div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>KM/L</div>
          </div>
          <div className="text-right">
            <div className="font-space text-[14px] font-bold" style={{ color: '#c8e8ff' }}>{faena.totalCamiones}</div>
            <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>CAMIONES</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #0d2035' }}>
          <div className="flex gap-1 px-5 py-2" style={{ borderBottom: '1px solid #0d2035' }}>
            <button
              className={`font-exo text-xs tracking-[0.1em] px-3 py-1.5 cursor-pointer transition-all ${!showCamiones ? 'font-bold' : ''}`}
              style={{
                color: !showCamiones ? '#00d4ff' : '#3a6080',
                background: !showCamiones ? 'rgba(0,212,255,0.08)' : 'transparent',
                border: `1px solid ${!showCamiones ? 'rgba(0,212,255,0.2)' : '#0d2035'}`
              }}
              onClick={() => setShowCamiones(false)}
              data-testid={`btn-viajes-dia-${faena.id}`}>
              <Calendar className="w-3 h-3 inline mr-1.5" />VIAJES POR DIA
            </button>
            <button
              className={`font-exo text-xs tracking-[0.1em] px-3 py-1.5 cursor-pointer transition-all ${showCamiones ? 'font-bold' : ''}`}
              style={{
                color: showCamiones ? '#00d4ff' : '#3a6080',
                background: showCamiones ? 'rgba(0,212,255,0.08)' : 'transparent',
                border: `1px solid ${showCamiones ? 'rgba(0,212,255,0.2)' : '#0d2035'}`
              }}
              onClick={() => setShowCamiones(true)}
              data-testid={`btn-camion-resumen-${faena.id}`}>
              <Truck className="w-3 h-3 inline mr-1.5" />RESUMEN POR CAMION
            </button>
          </div>

          {!showCamiones ? (
            <div className="max-h-[400px] overflow-y-auto">
              <div className="flex items-center gap-3 px-5 py-1.5 sticky top-0" style={{ background: '#020508', zIndex: 1, borderBottom: '1px solid #0d2035' }}>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '90px' }}>FECHA</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '55px' }}>VIAJES</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1" style={{ color: '#3a6080' }}>ACTIVIDAD</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '70px', textAlign: 'right' }}>KM</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '60px', textAlign: 'right' }}>CAMIONES</span>
              </div>
              {dias.map(dia => {
                const d = faena.viajesPorDia[dia];
                if (!d) return (
                  <div key={dia} className="flex items-center gap-3 px-5 py-1.5" style={{ borderBottom: '1px solid #0d203510' }}>
                    <span className="font-space text-xs" style={{ color: '#1a3050', width: '90px' }}>{formatDia(dia)}</span>
                    <span className="font-space text-xs" style={{ color: '#1a3050', width: '55px' }}>{'\u2014'}</span>
                    <div className="flex-1 h-[4px] rounded-sm" style={{ background: '#0d2035' }} />
                    <span style={{ width: '70px' }} />
                    <span style={{ width: '60px' }} />
                  </div>
                );
                const barPct = Math.min((d.total / maxViajesDia) * 100, 100);
                return (
                  <div key={dia} className="flex items-center gap-3 px-5 py-2 transition-all hover:bg-[rgba(0,212,255,0.03)]"
                    style={{ borderBottom: '1px solid #0d2035' }}
                    data-testid={`dia-row-${dia}`}>
                    <span className="font-space text-xs font-bold" style={{ color: '#c8e8ff', width: '90px' }}>{formatDia(dia)}</span>
                    <span className="font-space text-[12px] font-bold" style={{ color: '#00d4ff', width: '55px' }}>{d.total}</span>
                    <div className="flex-1 h-[6px] rounded-sm overflow-hidden" style={{ background: '#0d2035' }}>
                      <div className="h-full rounded-sm transition-all" style={{
                        width: `${barPct}%`,
                        background: `linear-gradient(90deg, ${faena.color}, #00d4ff)`,
                        boxShadow: `0 0 4px ${faena.color}40`
                      }} />
                    </div>
                    <span className="font-space text-xs text-right" style={{ color: '#c8e8ff', width: '70px' }}>{d.km > 0 ? d.km.toLocaleString() : '\u2014'}</span>
                    <span className="font-space text-xs text-right" style={{ color: '#3a6080', width: '60px' }}>{d.camiones.length}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <div className="flex items-center gap-3 px-5 py-1.5 sticky top-0" style={{ background: '#020508', zIndex: 1, borderBottom: '1px solid #0d2035' }}>
                <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '70px' }}>PATENTE</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1" style={{ color: '#3a6080' }}>MODELO</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '55px' }}>VIAJES</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '70px' }}>KM</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '70px' }}>LITROS</span>
                <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '55px' }}>KM/L</span>
              </div>
              {faena.camionResumen.map(cam => (
                <div key={cam.patente} className="flex items-center gap-3 px-5 py-2 transition-all hover:bg-[rgba(0,212,255,0.03)]"
                  style={{ borderBottom: '1px solid #0d2035' }}
                  data-testid={`camion-resumen-${cam.patente}`}>
                  <div className="flex items-center gap-2" style={{ width: '70px' }}>
                    <Truck className="w-3 h-3 flex-shrink-0" style={{ color: '#00d4ff' }} />
                    <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>{cam.patente}</span>
                  </div>
                  <span className="font-exo text-xs flex-1 truncate" style={{ color: '#3a6080' }}>{cam.modelo}</span>
                  <span className="font-space text-[11px] font-bold text-right" style={{ color: '#00d4ff', width: '55px' }}>{cam.viajes}</span>
                  <span className="font-space text-xs text-right" style={{ color: '#c8e8ff', width: '70px' }}>{cam.km > 0 ? cam.km.toLocaleString() : '\u2014'}</span>
                  <span className="font-space text-xs text-right" style={{ color: '#c8e8ff', width: '70px' }}>{cam.litros > 0 ? cam.litros.toLocaleString() : '\u2014'}</span>
                  <span className="font-space text-xs font-bold text-right" style={{
                    color: cam.rendimiento >= 3.5 ? '#00ff88' : cam.rendimiento >= 2.0 ? '#c8e8ff' : cam.rendimiento > 0 ? '#ffcc00' : '#3a6080',
                    width: '55px'
                  }}>
                    {cam.rendimiento > 0 ? cam.rendimiento : '\u2014'}
                  </span>
                </div>
              ))}
              {faena.camionResumen.length === 0 && (
                <div className="px-5 py-6 text-center font-exo text-[11px]" style={{ color: '#3a6080' }}>
                  Sin datos de camiones para esta faena
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Faenas() {
  const { data, isLoading } = useQuery<FaenaResumen[]>({
    queryKey: ["/api/faenas/resumen"],
    refetchInterval: 120000,
  });

  const faenas = data || [];

  const totales = useMemo(() => {
    return {
      faenas: faenas.length,
      viajes: faenas.reduce((s, f) => s + f.totalViajes, 0),
      km: Math.round(faenas.reduce((s, f) => s + f.totalKm, 0)),
      litros: faenas.reduce((s, f) => s + f.litros30d, 0),
      camiones: faenas.reduce((s, f) => s + f.totalCamiones, 0),
    };
  }, [faenas]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="faenas-loading">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#00d4ff' }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: '#3a6080' }}>Cargando resumenes de faenas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="faenas-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-space text-[18px] font-bold tracking-[0.12em] uppercase" style={{ color: '#c8e8ff' }}>
            Resumenes por Faena
          </h2>
          <p className="font-exo text-[11px] mt-1" style={{ color: '#3a6080' }}>
            Viajes detectados desde 01-03-2026 agrupados por dia y camion
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>FAENAS</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#00d4ff' }}>{totales.faenas}</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>VIAJES TOTALES</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#00d4ff' }}>{totales.viajes}</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>KM TOTALES</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#c8e8ff' }}>{totales.km.toLocaleString()}</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>LITROS 30D</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#c8e8ff' }}>{totales.litros.toLocaleString()}</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>CAMIONES</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#c8e8ff' }}>{totales.camiones}</div>
        </div>
      </div>

      <div className="space-y-3">
        {faenas.map(f => (
          <FaenaCard key={f.id} faena={f} />
        ))}
      </div>

      {faenas.length === 0 && (
        <div className="dash-card px-8 py-12 text-center">
          <div className="font-space text-[14px] font-bold" style={{ color: '#3a6080' }}>Sin faenas con datos</div>
          <div className="font-exo text-[11px] mt-2" style={{ color: '#3a6080' }}>
            No se encontraron faenas con camiones asignados
          </div>
        </div>
      )}
    </div>
  );
}
