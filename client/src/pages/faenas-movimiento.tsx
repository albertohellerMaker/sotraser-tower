import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronRight, Truck, Navigation, Fuel, Clock, MapPin, Radio } from "lucide-react";

interface TruckLive {
  id: number;
  patente: string;
  modelo: string;
  vin: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number | null;
  gpsTime: string;
  gpsAgeMin: number;
  fuelLevel: number | null;
  engineHours: number | null;
  totalDistance: number | null;
  driverWorkingState: string | null;
  isMoving: boolean;
  isRecent: boolean;
  estado: "EN_RUTA" | "DETENIDO" | "INACTIVO";
}

interface FaenaLive {
  faenaId: number;
  nombre: string;
  color: string;
  trucks: TruckLive[];
  enRuta: number;
  detenidos: number;
  inactivos: number;
  totalOnline: number;
}

interface EnMovimientoData {
  faenas: FaenaLive[];
  totals: {
    totalOnline: number;
    enRuta: number;
    detenidos: number;
    inactivos: number;
    faenasActivas: number;
  };
}

function timeAgo(min: number): string {
  if (min < 1) return "ahora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function estadoBadge(estado: string) {
  const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    EN_RUTA: { color: "#00ff88", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.3)", label: "EN RUTA" },
    DETENIDO: { color: "#ffcc00", bg: "rgba(255,204,0,0.08)", border: "rgba(255,204,0,0.3)", label: "DETENIDO" },
    INACTIVO: { color: "#3a6080", bg: "rgba(58,96,128,0.08)", border: "rgba(58,96,128,0.3)", label: "INACTIVO" },
  };
  const c = cfg[estado] || cfg.INACTIVO;
  return (
    <span className="font-space text-xs font-bold px-2 py-0.5 uppercase tracking-[0.1em]"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

function FaenaLiveCard({ faena }: { faena: FaenaLive }) {
  const [expanded, setExpanded] = useState(faena.enRuta > 0);

  return (
    <div className="dash-card overflow-hidden" style={{ border: `1px solid ${faena.color}20` }}>
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
        onClick={() => setExpanded(!expanded)}
        data-testid={`faena-live-card-${faena.faenaId}`}>
        {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#00d4ff' }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#3a6080' }} />}
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: faena.color, boxShadow: `0 0 8px ${faena.color}50` }} />
        <div className="flex-1 min-w-0">
          <div className="font-space text-[14px] font-bold tracking-[0.08em]" style={{ color: '#c8e8ff' }}>{faena.nombre}</div>
        </div>
        <div className="flex items-center gap-4">
          {faena.enRuta > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88', animation: 'blink 2s infinite' }} />
              <span className="font-space text-[14px] font-bold" style={{ color: '#00ff88' }}>{faena.enRuta}</span>
              <span className="font-exo text-xs tracking-[0.1em] uppercase" style={{ color: '#3a6080' }}>EN RUTA</span>
            </div>
          )}
          {faena.detenidos > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ffcc00' }} />
              <span className="font-space text-[13px] font-bold" style={{ color: '#ffcc00' }}>{faena.detenidos}</span>
              <span className="font-exo text-xs tracking-[0.1em] uppercase" style={{ color: '#3a6080' }}>DET</span>
            </div>
          )}
          {faena.inactivos > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#3a6080' }} />
              <span className="font-space text-[13px]" style={{ color: '#3a6080' }}>{faena.inactivos}</span>
              <span className="font-exo text-xs tracking-[0.1em] uppercase" style={{ color: '#3a6080' }}>INACT</span>
            </div>
          )}
          <div className="text-right ml-2">
            <div className="font-space text-[12px]" style={{ color: '#3a6080' }}>{faena.totalOnline} online</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #0d2035' }}>
          <div className="flex items-center gap-3 px-5 py-1.5 sticky top-0" style={{ background: '#020508', zIndex: 1, borderBottom: '1px solid #0d2035' }}>
            <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '55px' }}>ESTADO</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080', width: '70px' }}>PATENTE</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase flex-1" style={{ color: '#3a6080' }}>MODELO</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '55px' }}>VEL</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '50px' }}>FUEL</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '70px' }}>GPS</span>
            <span className="font-exo text-xs tracking-[0.15em] uppercase text-right" style={{ color: '#3a6080', width: '80px' }}>POSICION</span>
          </div>
          {faena.trucks.map(truck => (
            <div key={truck.id} className="flex items-center gap-3 px-5 py-2.5 transition-all hover:bg-[rgba(0,212,255,0.03)]"
              style={{ borderBottom: '1px solid #0d2035' }}
              data-testid={`truck-live-${truck.patente}`}>
              <div style={{ width: '55px' }}>{estadoBadge(truck.estado)}</div>
              <div className="flex items-center gap-1.5" style={{ width: '70px' }}>
                <Truck className="w-3 h-3 flex-shrink-0" style={{
                  color: truck.estado === "EN_RUTA" ? '#00ff88' : truck.estado === "DETENIDO" ? '#ffcc00' : '#3a6080'
                }} />
                <span className="font-space text-[11px] font-bold" style={{ color: '#c8e8ff' }}>{truck.patente}</span>
              </div>
              <span className="font-exo text-xs flex-1 truncate" style={{ color: '#3a6080' }}>{truck.modelo}</span>
              <div className="text-right" style={{ width: '55px' }}>
                {truck.speed > 0 ? (
                  <span className="font-space text-[11px] font-bold" style={{ color: '#00ff88' }}>
                    {Math.round(truck.speed)} km/h
                  </span>
                ) : (
                  <span className="font-space text-xs" style={{ color: '#3a6080' }}>0</span>
                )}
              </div>
              <div className="text-right" style={{ width: '50px' }}>
                {truck.fuelLevel != null ? (
                  <span className="font-space text-xs" style={{
                    color: truck.fuelLevel > 50 ? '#00ff88' : truck.fuelLevel > 20 ? '#ffcc00' : '#ff2244'
                  }}>
                    {Math.round(truck.fuelLevel)}%
                  </span>
                ) : (
                  <span className="font-space text-xs" style={{ color: '#3a6080' }}>{'\u2014'}</span>
                )}
              </div>
              <div className="text-right" style={{ width: '70px' }}>
                <span className="font-exo text-[11px]" style={{
                  color: truck.gpsAgeMin < 15 ? '#00ff88' : truck.gpsAgeMin < 60 ? '#c8e8ff' : '#ffcc00'
                }}>
                  {timeAgo(truck.gpsAgeMin)}
                </span>
              </div>
              <div className="text-right" style={{ width: '80px' }}>
                <span className="font-space text-xs" style={{ color: '#3a6080' }}>
                  {truck.lat.toFixed(3)}, {truck.lng.toFixed(3)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FaenasEnMovimiento() {
  const { data, isLoading } = useQuery<EnMovimientoData>({
    queryKey: ["/api/faenas/en-movimiento"],
    refetchInterval: 60000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="movimiento-loading">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#00d4ff' }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: '#3a6080' }}>Consultando estado de flota...</span>
      </div>
    );
  }

  const { faenas, totals } = data;

  return (
    <div className="space-y-5" data-testid="faenas-movimiento-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-space text-[18px] font-bold tracking-[0.12em] uppercase" style={{ color: '#c8e8ff' }}>
            Faenas en Movimiento
          </h2>
          <p className="font-exo text-[11px] mt-1" style={{ color: '#3a6080' }}>
            Estado en tiempo real de camiones por faena via Volvo rFMS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5" style={{ color: '#00ff88', animation: 'blink 2s infinite' }} />
          <span className="font-space text-xs font-bold" style={{ color: '#00ff88' }}>LIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>ONLINE</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#00d4ff' }}>{totals.totalOnline}</div>
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>camiones con GPS</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>EN RUTA</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#00ff88' }}>{totals.enRuta}</div>
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>en movimiento</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>DETENIDOS</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#ffcc00' }}>{totals.detenidos}</div>
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>motor encendido</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>INACTIVOS</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#3a6080' }}>{totals.inactivos}</div>
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>sin actividad reciente</div>
        </div>
        <div className="dash-card px-4 py-3">
          <div className="font-exo text-xs tracking-[0.15em] uppercase" style={{ color: '#3a6080' }}>FAENAS</div>
          <div className="font-space text-2xl font-bold" style={{ color: '#c8e8ff' }}>{totals.faenasActivas}</div>
          <div className="font-exo text-xs" style={{ color: '#3a6080' }}>con camiones online</div>
        </div>
      </div>

      <div className="space-y-3">
        {faenas.map(f => (
          <FaenaLiveCard key={f.faenaId} faena={f} />
        ))}
      </div>

      {faenas.length === 0 && (
        <div className="dash-card px-8 py-12 text-center">
          <div className="font-space text-[14px] font-bold" style={{ color: '#3a6080' }}>Sin camiones online</div>
          <div className="font-exo text-[11px] mt-2" style={{ color: '#3a6080' }}>
            No se detectaron camiones con GPS activo en las ultimas 6 horas
          </div>
        </div>
      )}

      <div className="text-[11px] font-space tracking-[0.15em]" style={{ color: '#3a6080' }}>
        Datos via Volvo rFMS API &middot; Auto-refresh cada 60s &middot; EN RUTA: vel &gt; 2 km/h &middot; DETENIDO: GPS &lt; 1h &middot; INACTIVO: GPS &lt; 6h
      </div>
    </div>
  );
}
