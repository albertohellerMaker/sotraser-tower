import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VolvoTruckModal } from "@/components/volvo-truck-modal";
import { fN } from "@/lib/fuel-utils";
import {
  Truck, MapPin, Gauge, Clock, Fuel, Thermometer, Search,
  Radio, Wifi, WifiOff, AlertTriangle, List, Map as MapIcon,
  AlertCircle, Link2Off, Shield
} from "lucide-react";
import type { Faena, Camion } from "@shared/schema";
import { createDarkMap, addInfoWindow, fitBoundsToPoints, clearMarkers, isGoogleMapsReady } from "@/lib/google-maps-utils";

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

function createColorIconHtml(color: string): string {
  return `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14"/><path d="M5 17a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg>
  </div>`;
}

function TruckMap({ camiones, statusMap, faenas, onSelectVin }: {
  camiones: Camion[];
  statusMap: Map<string, UnifiedStatus>;
  faenas: Faena[];
  onSelectVin: (vin: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<(google.maps.Marker | google.maps.marker.AdvancedMarkerElement)[]>([]);

  useEffect(() => {
    if (!mapRef.current || !isGoogleMapsReady()) return;

    clearMarkers(markersRef.current as any);

    const map = mapInstanceRef.current || createDarkMap(mapRef.current, {
      center: { lat: -33.45, lng: -70.65 },
      zoom: 6,
    });
    mapInstanceRef.current = map;

    const points: { lat: number; lng: number }[] = [];

    (window as any).__volvoSelectVin__ = (vin: string) => onSelectVin(vin);

    camiones.forEach(cam => {
      if (!cam.vin) return;
      const vs = statusMap.get(cam.vin);
      const gps = vs?.gps;
      if (!gps || gps.latitude == null || gps.longitude == null) return;

      const lat = gps.latitude!;
      const lng = gps.longitude!;
      points.push({ lat, lng });

      const isOnline = !!vs;
      const hasData = vs && (vs.fuelLevel != null || vs.totalDistance != null);
      const color = isOnline && hasData ? "#22c55e" : isOnline ? "#eab308" : "#6b7280";

      const faena = faenas.find(f => f.id === cam.faenaId);
      const distKm = vs?.totalDistance ? Math.round(vs.totalDistance / 1000) : cam.odometro;
      const fuelLvl = vs?.fuelLevel;
      const speed = vs?.wheelBasedSpeed;

      const popupContent = `
        <div style="font-family:monospace;font-size:11px;min-width:180px;">
          <div style="font-weight:bold;font-size:13px;margin-bottom:4px;color:#1a8fff;">${cam.patente}</div>
          <div style="font-size:10px;color:#888;margin-bottom:6px;">${cam.modelo || ""}</div>
          ${faena ? `<div style="font-size:10px;margin-bottom:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${faena.color};margin-right:4px;vertical-align:middle;"></span>${faena.nombre}</div>` : ""}
          ${cam.conductor ? `<div style="font-size:10px;margin-bottom:2px;">Conductor: ${cam.conductor}</div>` : ""}
          ${distKm ? `<div style="font-size:10px;margin-bottom:2px;">Km: ${fN(distKm)}</div>` : ""}
          ${fuelLvl != null ? `<div style="font-size:10px;margin-bottom:2px;">Combustible: ${fuelLvl}%</div>` : ""}
          ${speed != null && speed > 0 ? `<div style="font-size:10px;margin-bottom:2px;">Velocidad: ${speed.toFixed(0)} km/h</div>` : ""}
          <div style="margin-top:6px;"><a href="#" onclick="window.__volvoSelectVin__('${cam.vin}');return false;" style="color:#1a8fff;text-decoration:underline;font-size:10px;">Ver ficha completa</a></div>
        </div>
      `;

      const el = document.createElement("div");
      el.innerHTML = createColorIconHtml(color);
      el.style.cursor = "pointer";

      if (google.maps.marker?.AdvancedMarkerElement) {
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat, lng }, content: el });
        addInfoWindow(map, marker, popupContent);
        markersRef.current.push(marker);
      } else {
        const marker = new google.maps.Marker({ map, position: { lat, lng } });
        addInfoWindow(map, marker, popupContent);
        markersRef.current.push(marker);
      }
    });

    fitBoundsToPoints(map, points, 40, 12);

    return () => {
      delete (window as any).__volvoSelectVin__;
    };
  }, [camiones, statusMap, faenas, onSelectVin]);

  return (
    <div
      ref={mapRef}
      className="w-full border border-border"
      style={{ height: "500px" }}
      data-testid="volvo-map"
    />
  );
}

function DiagnosticsSection({ camiones, statusMap, faenas, onSelectVin }: {
  camiones: Camion[];
  statusMap: Map<string, UnifiedStatus>;
  faenas: Faena[];
  onSelectVin: (vin: string) => void;
}) {
  const noVin = camiones.filter(c => c.syncOk && !c.vin);

  const noDataVins = useMemo(() => {
    const now = Date.now();
    const h48 = 48 * 60 * 60 * 1000;
    return camiones.filter(c => {
      if (!c.vin || !c.syncOk) return false;
      const vs = statusMap.get(c.vin);
      if (!vs) return true;
      if (vs.createdDateTime) {
        const dt = new Date(vs.createdDateTime).getTime();
        return now - dt > h48;
      }
      return false;
    });
  }, [camiones, statusMap]);

  const unassigned = camiones.filter(c => c.syncOk && (!c.faenaId || c.faenaId === 0));

  const inactive = useMemo(() => {
    return camiones.filter(c => {
      if (!c.vin || !c.syncOk) return false;
      const vs = statusMap.get(c.vin);
      if (!vs) return true;
      const speed = vs.wheelBasedSpeed;
      const engineSpeed = vs.engineSpeed;
      return (speed == null || speed === 0) && (engineSpeed == null || engineSpeed === 0);
    });
  }, [camiones, statusMap]);

  const hasIssues = noVin.length > 0 || noDataVins.length > 0 || unassigned.length > 0 || inactive.length > 0;

  if (!hasIssues) return null;

  return (
    <div className="space-y-3" data-testid="volvo-diagnostics">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <AlertCircle className="w-4 h-4 text-amber-400" />
        <span className="text-[11px] font-mono font-bold tracking-[0.15em] uppercase text-amber-400">
          Diagnosticos
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {noVin.length > 0 && (
          <Card className="p-3" data-testid="diag-no-vin">
            <div className="flex items-center gap-2 mb-2">
              <Link2Off className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-muted-foreground">
                Sin VIN asignado
              </span>
              <Badge variant="secondary" className="text-[11px]">{noVin.length}</Badge>
            </div>
            <div className="space-y-1">
              {noVin.map(c => (
                <div key={c.id} className="text-[11px] font-mono text-muted-foreground" data-testid={`diag-novin-${c.id}`}>
                  {c.patente} — {c.modelo}
                </div>
              ))}
            </div>
          </Card>
        )}

        {noDataVins.length > 0 && (
          <Card className="p-3" data-testid="diag-no-data-48h">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-amber-400">
                Sin datos rFMS 48h
              </span>
              <Badge variant="secondary" className="text-[11px]">{noDataVins.length}</Badge>
            </div>
            <div className="space-y-1">
              {noDataVins.map(c => (
                <div key={c.id} className="text-[11px] font-mono text-muted-foreground" data-testid={`diag-nodata-${c.id}`}>
                  {c.patente} — VIN: {c.vin}
                </div>
              ))}
            </div>
          </Card>
        )}

        {inactive.length > 0 && (
          <Card className="p-3" data-testid="diag-inactive">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-muted-foreground/60" />
              <span className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-muted-foreground">
                Inactivos
              </span>
              <Badge variant="secondary" className="text-[11px]">{inactive.length}</Badge>
            </div>
            <div className="space-y-1">
              {inactive.slice(0, 10).map(c => (
                <div
                  key={c.id}
                  className="text-[11px] font-mono text-muted-foreground cursor-pointer hover:text-primary"
                  onClick={() => c.vin && onSelectVin(c.vin)}
                  data-testid={`diag-inactive-${c.id}`}
                >
                  {c.patente}
                </div>
              ))}
              {inactive.length > 10 && (
                <div className="text-xs font-mono text-muted-foreground/60">
                  y {inactive.length - 10} mas...
                </div>
              )}
            </div>
          </Card>
        )}

        {unassigned.length > 0 && (
          <Card className="p-3" data-testid="diag-unassigned">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-amber-400">
                Sin faena asignada
              </span>
              <Badge variant="secondary" className="text-[11px]">{unassigned.length}</Badge>
            </div>
            <div className="space-y-1">
              {unassigned.map(c => (
                <div key={c.id} className="flex items-center justify-between" data-testid={`diag-unassigned-${c.id}`}>
                  <span className="text-[11px] font-mono text-muted-foreground">{c.patente}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function TruckCard({ cam, vs, faenaColor, onClick }: {
  cam: Camion;
  vs: UnifiedStatus | null;
  faenaColor: string;
  onClick: () => void;
}) {
  const gps = vs?.gps;
  const distKm = vs?.totalDistance ? Math.round(vs.totalDistance / 1000) : cam.odometro;
  const engineH = vs?.engineHours ? Math.round(vs.engineHours * 10) / 10 : cam.horasMotor;
  const fuelLvl = vs?.fuelLevel;
  const speed = vs?.wheelBasedSpeed;
  const temp = vs?.ambientTemperature;
  const hasLiveData = !!vs;

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border p-3 cursor-pointer transition-all hover:border-primary/40 hover:bg-primary/[0.02]"
      style={{ borderLeftWidth: 3, borderLeftColor: faenaColor }}
      data-testid={`volvo-truck-card-${cam.id}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-sm font-mono font-bold text-primary">{cam.patente}</div>
          <div className="text-xs font-mono text-muted-foreground">{cam.modelo}</div>
        </div>
        <div className={`flex items-center gap-1 text-[11px] font-mono ${hasLiveData ? "text-emerald-400" : "text-muted-foreground/50"}`}>
          {hasLiveData ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {hasLiveData ? "LIVE" : "OFF"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Gauge className="w-3 h-3 flex-shrink-0" />
          <span>{distKm ? `${fN(distKm)} km` : "\u2014"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>{engineH ? `${fN(engineH, 1)} h` : "\u2014"}</span>
        </div>
        {fuelLvl != null && (
          <div className="flex items-center gap-1.5">
            <Fuel className="w-3 h-3 flex-shrink-0 text-amber-400" />
            <span className={fuelLvl < 20 ? "text-red-400" : fuelLvl < 40 ? "text-amber-400" : "text-emerald-400"}>
              {fuelLvl}%
            </span>
          </div>
        )}
        {speed != null && speed > 0 && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>{speed.toFixed(0)} km/h</span>
          </div>
        )}
        {gps && gps.latitude != null && (
          <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground/70">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{gps.latitude?.toFixed(4)}, {gps.longitude?.toFixed(4)}</span>
          </div>
        )}
        {temp != null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Thermometer className="w-3 h-3 flex-shrink-0" />
            <span>{temp.toFixed(0)}C</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Volvo() {
  const [faenaFil, setFaenaFil] = useState<string>("all");
  const [busq, setBusq] = useState("");
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"lista" | "mapa">("lista");

  const { data: faenas = [], isLoading: loadingF } = useQuery<Faena[]>({ queryKey: ["/api/faenas"] });
  const { data: camiones = [], isLoading: loadingC } = useQuery<Camion[]>({ queryKey: ["/api/camiones", "volvo"], queryFn: () => fetch("/api/camiones?soloVolvo=true").then(r => r.json()) });
  const { data: fleetStatus = [], isLoading: loadingS, isError: errorS } = useQuery<UnifiedStatus[]>({
    queryKey: ["/api/volvo/fleet-status"],
    refetchInterval: 300000,
  });

  const isLoading = loadingF || loadingC || loadingS;

  const statusMap = useMemo(() => {
    const map = new Map<string, UnifiedStatus>();
    fleetStatus.forEach(s => map.set(s.vin, s));
    return map;
  }, [fleetStatus]);

  const filtered = useMemo(() => {
    let list = camiones.filter(c => c.syncOk);
    if (faenaFil !== "all") list = list.filter(c => c.faenaId === parseInt(faenaFil));
    if (busq) list = list.filter(c =>
      c.patente.toLowerCase().includes(busq.toLowerCase()) ||
      c.vin?.toLowerCase().includes(busq.toLowerCase()) ||
      c.conductor?.toLowerCase().includes(busq.toLowerCase())
    );
    return list;
  }, [camiones, faenaFil, busq]);

  const { onlineTrucks, offlineTrucks } = useMemo(() => {
    const online: Camion[] = [];
    const offline: Camion[] = [];
    for (const c of filtered) {
      if (c.vin && statusMap.has(c.vin)) {
        online.push(c);
      } else {
        offline.push(c);
      }
    }
    return { onlineTrucks: online, offlineTrucks: offline };
  }, [filtered, statusMap]);

  const groupByFaena = (trucks: Camion[]) => {
    const groups: { faena: Faena | null; trucks: Camion[] }[] = [];
    const faenaMap = new Map<number, Camion[]>();

    trucks.forEach(c => {
      const key = c.faenaId || 0;
      if (!faenaMap.has(key)) faenaMap.set(key, []);
      faenaMap.get(key)!.push(c);
    });

    faenaMap.forEach((trks, faenaId) => {
      const faena = faenas.find(f => f.id === faenaId) || null;
      groups.push({ faena, trucks: trks });
    });

    groups.sort((a, b) => {
      if (!a.faena) return 1;
      if (!b.faena) return -1;
      return a.faena.nombre.localeCompare(b.faena.nombre);
    });

    return groups;
  };

  const onlineGrouped = useMemo(() => groupByFaena(onlineTrucks), [onlineTrucks, faenas]);
  const offlineGrouped = useMemo(() => groupByFaena(offlineTrucks), [offlineTrucks, faenas]);

  const selectedCamion = selectedVin ? camiones.find(c => c.vin === selectedVin) : null;
  const selectedStatus = selectedVin ? statusMap.get(selectedVin) || null : null;
  const totalWithGps = fleetStatus.filter(s => s.gps.latitude != null).length;

  const handleSelectVin = useMemo(() => (vin: string) => setSelectedVin(vin), []);

  if (isLoading) {
    return (
      <div className="space-y-5" data-testid="volvo-loading">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const renderFaenaGroup = (group: { faena: Faena | null; trucks: Camion[] }) => (
    <div key={group.faena?.id ?? 0}>
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-border">
        {group.faena ? (
          <>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.faena.color }} />
            <span className="text-[13px] font-mono font-bold tracking-[0.1em] uppercase" style={{ color: group.faena.color }}>
              {group.faena.nombre}
            </span>
          </>
        ) : (
          <>
            <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
            <span className="text-[13px] font-mono font-bold tracking-[0.1em] uppercase text-muted-foreground">
              Sin Asignar
            </span>
          </>
        )}
        <span className="text-xs font-mono text-muted-foreground ml-1">
          ({group.trucks.length} camiones)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 mb-5">
        {group.trucks.map(cam => (
          <TruckCard
            key={cam.id}
            cam={cam}
            vs={cam.vin ? statusMap.get(cam.vin) || null : null}
            faenaColor={group.faena?.color || "#5A7A9A"}
            onClick={() => cam.vin && setSelectedVin(cam.vin)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="volvo-view">
      <div className="grid grid-cols-4 gap-3" data-testid="volvo-kpi-grid">
        <div className="bg-card border border-border p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">FLOTA rFMS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-primary" data-testid="text-fleet-count">{filtered.length}</div>
          <div className="text-xs font-mono text-muted-foreground">{camiones.filter(c => c.syncOk).length} sincronizados</div>
        </div>
        <div className="bg-card border border-border p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">ONLINE</span>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400" data-testid="text-online-count">{onlineTrucks.length}</div>
          <div className="text-xs font-mono text-muted-foreground">reportando telemetria</div>
        </div>
        <div className="bg-card border border-border p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <WifiOff className="w-4 h-4 text-muted-foreground/50" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">OFFLINE</span>
          </div>
          <div className="text-2xl font-mono font-bold text-muted-foreground" data-testid="text-offline-count">{offlineTrucks.length}</div>
          <div className="text-xs font-mono text-muted-foreground">sin telemetria</div>
        </div>
        <div className="bg-card border border-border p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Radio className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">CON GPS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-gps-count">{totalWithGps}</div>
          <div className="text-xs font-mono text-muted-foreground">posicion disponible</div>
        </div>
      </div>

      {errorS && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="volvo-error-banner">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-[11px] font-mono text-red-400">Error al obtener telemetria Volvo. Los datos pueden estar desactualizados.</span>
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap" data-testid="volvo-filters">
        <div className="flex border border-border overflow-visible">
          <Button
            variant={viewMode === "lista" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("lista")}
            className="gap-1.5 text-xs font-mono font-bold tracking-[0.1em] rounded-none"
            data-testid="btn-view-lista"
          >
            <List className="w-3.5 h-3.5" />
            LISTA
          </Button>
          <Button
            variant={viewMode === "mapa" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("mapa")}
            className="gap-1.5 text-xs font-mono font-bold tracking-[0.1em] rounded-none"
            data-testid="btn-view-mapa"
          >
            <MapIcon className="w-3.5 h-3.5" />
            MAPA
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar patente, VIN o conductor..."
            className="pl-8 w-64 font-mono text-xs bg-card"
            data-testid="input-volvo-search" />
        </div>
        {[{ id: "all", nombre: "Todas las faenas", color: undefined } as const, ...faenas,
          { id: 0, nombre: "Sin Asignar", color: "#5A7A9A" } as any].map((f: any) => (
          <button
            key={f.id}
            onClick={() => setFaenaFil(String(f.id))}
            data-testid={`volvo-filter-faena-${f.id}`}
            className={`px-3 py-1.5 text-xs font-mono cursor-pointer border whitespace-nowrap transition-all ${
              String(faenaFil) === String(f.id)
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border text-muted-foreground bg-transparent"
            }`}
            style={
              f.id !== "all" && String(faenaFil) === String(f.id) && f.color
                ? { borderColor: `${f.color}80`, color: f.color, backgroundColor: `${f.color}15` }
                : undefined
            }
          >
            {f.nombre}
            <span className="ml-1 opacity-60">
              ({f.id === "all"
                ? filtered.length
                : f.id === 0
                  ? camiones.filter(c => c.syncOk && (c.faenaId === 0 || !c.faenaId)).length
                  : camiones.filter(c => c.syncOk && c.faenaId === f.id).length})
            </span>
          </button>
        ))}
      </div>

      {viewMode === "mapa" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              Online
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              Offline
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              Sin datos
            </div>
          </div>
          <TruckMap
            camiones={filtered}
            statusMap={statusMap}
            faenas={faenas}
            onSelectVin={handleSelectVin}
          />
        </div>
      ) : (
        <>
          {onlineTrucks.length > 0 && (
            <div data-testid="volvo-online-section">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-emerald-500/30">
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-mono font-bold text-emerald-400 tracking-[0.15em] uppercase">
                  Online / Trabajando
                </span>
                <span className="text-xs font-mono text-emerald-400/60">({onlineTrucks.length})</span>
              </div>
              {onlineGrouped.map(renderFaenaGroup)}
            </div>
          )}

          {offlineTrucks.length > 0 && (
            <div data-testid="volvo-offline-section">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-muted-foreground/20">
                <WifiOff className="w-4 h-4 text-muted-foreground/50" />
                <span className="text-[11px] font-mono font-bold text-muted-foreground/60 tracking-[0.15em] uppercase">
                  Offline
                </span>
                <span className="text-xs font-mono text-muted-foreground/40">({offlineTrucks.length})</span>
              </div>
              {offlineGrouped.map(renderFaenaGroup)}
            </div>
          )}
        </>
      )}

      {filtered.length === 0 && (
        <div className="py-16 text-center text-muted-foreground font-mono text-xs" data-testid="text-no-volvo-trucks">
          Sin camiones sincronizados con Volvo. Sincroniza la flota desde Configuracion.
        </div>
      )}

      <DiagnosticsSection
        camiones={camiones}
        statusMap={statusMap}
        faenas={faenas}
        onSelectVin={handleSelectVin}
      />

      {selectedCamion && selectedVin && (
        <VolvoTruckModal
          camion={selectedCamion}
          status={selectedStatus || null}
          faena={faenas.find(f => f.id === selectedCamion.faenaId) || null}
          open={!!selectedVin}
          onClose={() => setSelectedVin(null)}
        />
      )}
    </div>
  );
}
