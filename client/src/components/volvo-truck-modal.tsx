import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusTag } from "@/components/status-tag";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { Camion, Faena } from "@shared/schema";
import { fN, fK } from "@/lib/fuel-utils";
import { MapPin, Gauge, Fuel, User, Thermometer, Zap, Navigation, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface UnifiedStatus {
  vin: string;
  createdDateTime: string | null;
  gps: {
    latitude: number | null;
    longitude: number | null;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    positionDateTime: string | null;
  };
  fuelLevel: number | null;
  engineHours: number | null;
  totalDistance: number | null;
  totalFuelUsed: number | null;
  engineSpeed: number | null;
  wheelBasedSpeed: number | null;
  ambientTemperature: number | null;
  driverId: string | null;
  driverWorkingState: string | null;
  catalystFuelLevel: number | null;
  grossWeight: number | null;
}

interface VolvoTruckModalProps {
  camion: Camion;
  status: UnifiedStatus | null;
  faena: Faena | null;
  open: boolean;
  onClose: () => void;
}

function formatDateTime(iso?: string): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function formatCoord(val?: number | null, decimals = 6): string {
  if (val == null) return "\u2014";
  return val.toFixed(decimals);
}

function DataCell({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-background border border-border p-2.5" data-testid={`volvo-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5 uppercase">
        {label}
      </div>
      <div className="text-base font-mono font-bold" style={{ color: color || "hsl(var(--foreground))" }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span style={{ color }} className="opacity-70">{icon}</span>
      <span className="text-[11px] font-mono tracking-[0.15em] uppercase font-bold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

interface TruckLocationData {
  patente: string;
  vin: string | null;
  modelo: string;
  currentGps: { latitude: number | null; longitude: number | null; speed: number | null; positionDateTime: string | null } | null;
  locations: { fecha: string; lugar: string | null; litros: number; odometro: number | null; kmRecorrido: number | null; conductor: string | null; faena: string | null; numGuia: number }[];
  lugarSummary: { lugar: string; count: number; totalLitros: number; lastDate: string }[];
  totalCargas: number;
  periodo: { from: string; to: string };
}

function LeafletMap({ latitude, longitude, speed, patente, locations }: {
  latitude: number;
  longitude: number;
  speed: number | null;
  patente: string;
  locations?: { fecha: string; lugar: string | null; litros: number; lat?: number; lon?: number }[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([latitude, longitude], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const truckIcon = L.divIcon({
      className: "custom-truck-marker",
      html: `<div style="
        width: 32px; height: 32px; background: #1A8FFF; border: 2px solid #fff;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4); position: relative;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
        <div style="position:absolute;top:-8px;right:-8px;width:12px;height:12px;background:${speed != null && speed > 0 ? '#00C87A' : '#6b7280'};border:2px solid #1a1a2e;border-radius:50%;"></div>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    L.marker([latitude, longitude], { icon: truckIcon })
      .addTo(map)
      .bindPopup(`<div style="font-family:monospace;font-size:11px;"><strong>${esc(patente)}</strong><br/>Lat: ${latitude.toFixed(5)}<br/>Lon: ${longitude.toFixed(5)}${speed != null ? `<br/>Vel: ${Math.round(speed)} km/h` : ""}</div>`);

    mapInstanceRef.current = map;

    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, speed, patente]);

  return (
    <div ref={mapRef} className="w-full h-[260px] rounded-sm" data-testid="leaflet-map" />
  );
}

function TruckLocationSection({ patente, open }: { patente: string; open: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading, isError } = useQuery<TruckLocationData>({
    queryKey: [`/api/volvo/truck-locations/${patente}?from=${from}&to=${to}`],
    enabled: open,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 p-4">
        <SectionHeader icon={<Navigation className="w-3.5 h-3.5" />} label="Geolocalizacion - Lugares del Mes" color="#FF2D4A" />
        <div className="text-[11px] font-mono text-red-400 text-center py-2" data-testid="text-geo-error">
          Error al cargar datos de geolocalizacion. Verifique la conexion.
        </div>
      </div>
    );
  }

  const gps = data?.currentGps;
  const hasGps = gps && gps.latitude != null && gps.longitude != null;
  const hasCargas = data && data.totalCargas > 0;
  const visibleLocations = hasCargas ? (showAll ? data.locations : data.locations.slice(0, 8)) : [];

  if (!hasGps && !hasCargas) {
    return (
      <div className="bg-background border border-border p-4">
        <SectionHeader icon={<Navigation className="w-3.5 h-3.5" />} label="Geolocalizacion - Lugares del Mes" color="#1A8FFF" />
        <div className="text-[11px] font-mono text-muted-foreground text-center py-4">
          Sin datos de ubicaciones ni GPS para el periodo {from} a {to}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionHeader icon={<Navigation className="w-3.5 h-3.5" />} label="Geolocalizacion - Lugares del Mes" color="#1A8FFF" />

      {hasGps && (
        <div className="border border-border overflow-hidden" data-testid="map-container">
          <div className="bg-background px-3 py-1.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3 text-emerald-400" />
              <span className="text-[11px] font-mono text-emerald-400 tracking-[0.1em] uppercase font-bold">Posicion actual GPS</span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {gps.latitude!.toFixed(5)}, {gps.longitude!.toFixed(5)}
              {gps.speed != null && gps.speed > 0 && <span className="ml-2 text-emerald-400">{Math.round(gps.speed)} km/h</span>}
            </span>
          </div>
          <LeafletMap
            latitude={gps.latitude!}
            longitude={gps.longitude!}
            speed={gps.speed}
            patente={patente}
          />
          {gps.positionDateTime && (
            <div className="bg-background px-3 py-1 border-t border-border">
              <span className="text-xs font-mono text-muted-foreground">Ultima posicion: {formatDateTime(gps.positionDateTime)}</span>
            </div>
          )}
        </div>
      )}

      {hasCargas && data!.lugarSummary.length > 0 && (
        <div className="bg-background border border-border" data-testid="lugar-summary">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-[11px] font-mono text-amber-400 tracking-[0.1em] uppercase font-bold">
              Resumen lugares de carga ({data!.periodo.from} a {data!.periodo.to})
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {data!.lugarSummary.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_3.5rem_5rem_6rem] gap-2 px-3 py-1.5 items-center" data-testid={`lugar-summary-row-${i}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                  <span className="text-[11px] font-mono font-bold text-foreground truncate">{s.lugar}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground text-right">{s.count}x</span>
                <span className="text-xs font-mono font-bold text-amber-400 text-right">{fN(Math.round(s.totalLitros))} L</span>
                <span className="text-[11px] font-mono text-muted-foreground text-right">{formatDateTime(s.lastDate).split(",")[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasCargas && (
        <div className="bg-background border border-border" data-testid="location-detail-table">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-mono text-primary tracking-[0.1em] uppercase font-bold">
              Detalle cargas ({data!.totalCargas} registros)
            </span>
            {data!.locations.length > 8 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="flex items-center gap-1 text-[11px] font-mono text-primary hover:text-primary/80 cursor-pointer"
                data-testid="btn-toggle-locations"
              >
                {showAll ? "Ver menos" : `Ver todos (${data!.totalCargas})`}
                {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
          <div className="grid grid-cols-[5.5rem_1fr_4rem_5rem_5.5rem] gap-1.5 px-3 py-1.5 border-b border-border">
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">FECHA</span>
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">LUGAR</span>
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">LITROS</span>
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] text-right">KM REC.</span>
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">CONDUCTOR</span>
          </div>
          <div className="divide-y divide-border/30 max-h-[300px] overflow-y-auto">
            {visibleLocations.map((loc, i) => (
              <div key={`${loc.numGuia}-${i}`} className="grid grid-cols-[5.5rem_1fr_4rem_5rem_5.5rem] gap-1.5 px-3 py-1.5 items-center" data-testid={`location-row-${i}`}>
                <span className="text-xs font-mono text-muted-foreground">{formatDateTime(loc.fecha).split(",")[0]}</span>
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="w-2.5 h-2.5 text-primary/60 flex-shrink-0" />
                  <span className="text-xs font-mono text-foreground truncate">{loc.lugar || "\u2014"}</span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 text-right">{fN(Math.round(loc.litros))}</span>
                <span className="text-xs font-mono text-foreground text-right">{loc.kmRecorrido != null ? fN(Math.round(loc.kmRecorrido)) : "\u2014"}</span>
                <span className="text-[11px] font-mono text-muted-foreground truncate">{loc.conductor || "\u2014"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function VolvoTruckModal({ camion, status: passedStatus, faena, open, onClose }: VolvoTruckModalProps) {
  const { data: liveStatus, isLoading, isError } = useQuery<UnifiedStatus>({
    queryKey: ["/api/volvo/vehicle-status", camion.vin],
    enabled: open && !!camion.vin,
  });

  const status = liveStatus || passedStatus;
  const gps = status?.gps;

  const totalDistKm = status?.totalDistance != null ? Math.round(status.totalDistance / 1000) : null;
  const totalEngineHours = status?.engineHours != null ? Math.round(status.engineHours) : null;
  const totalFuelUsed = status?.totalFuelUsed != null ? Math.round(status.totalFuelUsed) : null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[900px] bg-card border-border p-0 gap-0 overflow-y-auto max-h-[92vh]">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground">
            Volvo Connect — {camion.patente}
          </DialogTitle>
          <DialogDescription className="sr-only">Datos telematicos Volvo Connect para camion {camion.patente}</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-5">
          <div
            className="bg-background border border-border p-4 flex justify-between items-start gap-4 flex-wrap"
            style={{ borderLeftWidth: 4, borderLeftColor: faena?.color || "#1A8FFF" }}
          >
            <div>
              <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                <span className="text-xl font-mono font-bold text-primary" data-testid="text-volvo-patente">{camion.patente}</span>
                {faena && <StatusTag label={faena.nombre} variant="custom" color={faena.color} />}
                {camion.syncOk ? (
                  <StatusTag label="SYNC OK" variant="ok" dot />
                ) : (
                  <StatusTag label="SIN SYNC" variant="critico" dot />
                )}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">
                {camion.modelo} · VIN: <span className="text-foreground" data-testid="text-volvo-vin">{camion.vin || "\u2014"}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] uppercase mb-0.5">ULTIMA SYNC</div>
              <div className={`text-[11px] font-mono ${camion.syncOk ? "text-emerald-400" : "text-red-400"}`} data-testid="text-volvo-sync">
                {camion.syncAt || "Sin sincronizar"}
              </div>
              {status?.createdDateTime && (
                <>
                  <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] uppercase mb-0.5 mt-1.5">DATO RFMS</div>
                  <div className="text-[11px] font-mono text-blue-400" data-testid="text-volvo-rfms-time">
                    {formatDateTime(status.createdDateTime)}
                  </div>
                </>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              </div>
            </div>
          )}

          {!isLoading && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} label="Posicion GPS" color="#1A8FFF" />
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <DataCell label="Latitud" value={formatCoord(gps?.latitude)} color="#1A8FFF" />
                  <DataCell label="Longitud" value={formatCoord(gps?.longitude)} color="#1A8FFF" />
                  <DataCell label="Altitud" value={gps?.altitude != null ? `${Math.round(gps.altitude)} m` : "\u2014"} />
                  <DataCell label="Rumbo" value={gps?.heading != null ? `${Math.round(gps.heading)}\u00b0` : "\u2014"} />
                  <DataCell label="Velocidad GPS" value={gps?.speed != null ? `${Math.round(gps.speed)} km/h` : "\u2014"} color={gps?.speed && gps.speed > 0 ? "#00C87A" : undefined} />
                  <DataCell label="Ultima posicion" value={formatDateTime(gps?.positionDateTime)} sub="Hora GPS" />
                </div>

                <SectionHeader icon={<User className="w-3.5 h-3.5" />} label="Conductor" color="#A78BFA" />
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <DataCell label="Conductor" value={camion.conductor || status?.driverId || "\u2014"} color="#A78BFA" />
                  <DataCell label="Estado trabajo" value={status?.driverWorkingState || "\u2014"} color={status?.driverWorkingState === "DRIVING" ? "#00C87A" : status?.driverWorkingState === "RESTING" ? "#FFB020" : undefined} />
                </div>

                <SectionHeader icon={<Thermometer className="w-3.5 h-3.5" />} label="Ambiente" color="#38BDF8" />
                <div className="grid grid-cols-2 gap-2">
                  <DataCell label="Temp. ambiente" value={status?.ambientTemperature != null ? `${status.ambientTemperature}\u00b0C` : "\u2014"} color="#38BDF8" />
                  <DataCell label="AdBlue" value={status?.catalystFuelLevel != null ? `${status.catalystFuelLevel}%` : "\u2014"} />
                </div>
              </div>

              <div>
                <SectionHeader icon={<Gauge className="w-3.5 h-3.5" />} label="Motor & Distancia" color="#00C87A" />
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <DataCell label="Distancia total" value={totalDistKm != null ? fK(totalDistKm) : (camion.odometro ? fK(camion.odometro) : "\u2014")} color="#00C87A" />
                  <DataCell label="Horas motor" value={totalEngineHours != null ? `${fN(totalEngineHours)} h` : (camion.horasMotor ? `${fN(camion.horasMotor)} h` : "\u2014")} />
                  <DataCell label="Combustible usado" value={totalFuelUsed != null ? `${fN(totalFuelUsed)} L` : "\u2014"} sub="Total acumulado ECU" />
                  <DataCell label="RPM motor" value={status?.engineSpeed != null ? `${fN(Math.round(status.engineSpeed))} rpm` : "\u2014"} color={status?.engineSpeed && status.engineSpeed > 1800 ? "#FFB020" : undefined} />
                </div>

                <SectionHeader icon={<Fuel className="w-3.5 h-3.5" />} label="Combustible" color="#FFB020" />
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <DataCell label="Nivel tanque" value={status?.fuelLevel != null ? `${status.fuelLevel}%` : "\u2014"} color={status?.fuelLevel != null ? (status.fuelLevel < 15 ? "#FF2D4A" : status.fuelLevel < 30 ? "#FFB020" : "#00C87A") : undefined} />
                  <DataCell label="Vel. rueda" value={status?.wheelBasedSpeed != null ? `${Math.round(status.wheelBasedSpeed)} km/h` : "\u2014"} />
                </div>

                <SectionHeader icon={<Zap className="w-3.5 h-3.5" />} label="Peso & Tacografo" color="#F97316" />
                <div className="grid grid-cols-2 gap-2">
                  <DataCell label="Peso bruto" value={status?.grossWeight != null ? `${fN(Math.round(status.grossWeight))} kg` : "\u2014"} />
                  <DataCell label="Vel. tacografo" value={"\u2014"} />
                </div>
              </div>
            </div>
          )}

          <TruckLocationSection patente={camion.patente} open={open} />

          {isError && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 text-[11px] text-red-400 font-mono" data-testid="text-volvo-error">
              Error al consultar datos rFMS en tiempo real. Se muestran datos en cache si estan disponibles.
            </div>
          )}

          {!isLoading && !isError && !status && camion.vin && (
            <div className="bg-amber-400/5 border border-amber-400/20 p-3 text-[11px] text-amber-400 font-mono" data-testid="text-volvo-no-data">
              Sin datos rFMS disponibles para VIN {camion.vin}. Verifique que el vehiculo esta registrado en Volvo Connect y que la API rFMS esta activada.
            </div>
          )}

          {!camion.vin && (
            <div className="bg-blue-500/5 border border-blue-500/20 p-3 text-[11px] text-blue-400 font-mono" data-testid="text-volvo-no-vin">
              Este camion no tiene VIN registrado. Sincronice con Volvo Connect o ingrese el VIN manualmente para obtener datos telematicos.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
