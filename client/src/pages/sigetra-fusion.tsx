import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck, Fuel, Search, Wifi, WifiOff, AlertTriangle, Check,
  ArrowRightLeft, Database, ChevronDown, ChevronUp, Calendar,
  MapPin, Clock
} from "lucide-react";

interface FusionCarga {
  numGuia: number;
  fecha: string;
  litros: number;
  odometro: number | null;
  kmRecorrido: number | null;
  rendimiento: number | null;
  lugar: string | null;
  conductor: string | null;
}

interface FusionTruck {
  fleetNum: string;
  patenteReal: string | null;
  vin: string | null;
  modeloVolvo: string;
  faenaSigetra: string | null;
  conductorSigetra: string | null;
  litrosCargados: number;
  litrosQuemadosEcu: number | null;
  deltaCuadratura: number | null;
  totalCargas: number;
  snapshotsAyer: number;
  kmEcuAyer: number | null;
  sinDatosEcuAyer: boolean;
  rendPromedio: number;
  odometroSigetra: number | null;
  odometroVolvo: number | null;
  fuelLevelVolvo: number | null;
  engineHoursVolvo: number | null;
  gpsVolvo: { latitude: number | null; longitude: number | null } | null;
  alertLevel: "ok" | "alerta" | "critico";
  cargas: FusionCarga[];
}

interface FusionResponse {
  fechaCuadratura: string;
  proximaActualizacion: string;
  totalCamiones: number;
  conDatosEcu: number;
  sinDatosEcu: number;
  totalLitrosCargados: number;
  totalLitrosEcu: number;
  totalCargas: number;
  alertCount: number;
  vinFilterActive?: boolean;
  camionesConVin?: number;
  camionesSinVin?: number;
  trucks: FusionTruck[];
}

interface ConnectionStatus {
  connected?: boolean;
  status?: string;
  configured?: boolean;
  message: string;
  user: string;
}

interface FaenaGroup {
  faena: string;
  trucks: FusionTruck[];
  totalLitros: number;
  totalCargas: number;
  alertCount: number;
}

function fN(n: number): string {
  return n.toLocaleString("es-CL");
}

function formatDateTime(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatFechaCuadratura(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}

function computeCuadratura(t: FusionTruck): number | null {
  if (t.litrosQuemadosEcu == null || t.litrosQuemadosEcu <= 0 || t.litrosCargados <= 0) return null;
  return (Math.min(t.litrosQuemadosEcu, t.litrosCargados) / Math.max(t.litrosQuemadosEcu, t.litrosCargados)) * 100;
}

function groupByFaena(trucks: FusionTruck[]): FaenaGroup[] {
  const map: Record<string, FusionTruck[]> = {};
  for (const t of trucks) {
    const key = t.faenaSigetra || "Sin Faena";
    if (!map[key]) map[key] = [];
    map[key].push(t);
  }
  const groups: FaenaGroup[] = Object.keys(map).map((faena: string) => {
    const grpTrucks = map[faena];
    return {
      faena,
      trucks: grpTrucks,
      totalLitros: grpTrucks.reduce((s: number, t: FusionTruck) => s + t.litrosCargados, 0),
      totalCargas: grpTrucks.reduce((s: number, t: FusionTruck) => s + t.totalCargas, 0),
      alertCount: grpTrucks.filter((t: FusionTruck) => t.alertLevel !== "ok").length,
    };
  });
  groups.sort((a: FaenaGroup, b: FaenaGroup) => {
    if (a.faena === "Sin Faena") return 1;
    if (b.faena === "Sin Faena") return -1;
    return a.faena.localeCompare(b.faena);
  });
  return groups;
}

export default function SigetraFusion() {
  const [busq, setBusq] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [collapsedFaenas, setCollapsedFaenas] = useState<Set<string>>(new Set());

  const { data: sigetraStatus, isLoading: loadingSigetra } = useQuery<ConnectionStatus>({
    queryKey: ["/api/sigetra/status"],
  });

  const { data: volvoStatus, isLoading: loadingVolvo } = useQuery<ConnectionStatus>({
    queryKey: ["/api/volvo/status"],
  });

  const { data: fusion, isLoading: loadingFusion, isError: errorFusion } = useQuery<FusionResponse>({
    queryKey: ["/api/sigetra/fusion"],
    enabled: sigetraStatus?.connected === true,
    refetchInterval: 600000,
  });

  const filtered = useMemo(() => {
    if (!fusion?.trucks?.length) return [];
    if (!busq.trim()) return fusion.trucks;
    const q = busq.toLowerCase();
    return fusion.trucks.filter(t =>
      t.fleetNum.includes(q) ||
      t.patenteReal?.toLowerCase().includes(q) ||
      t.vin?.toLowerCase().includes(q) ||
      t.faenaSigetra?.toLowerCase().includes(q) ||
      t.conductorSigetra?.toLowerCase().includes(q)
    );
  }, [fusion, busq]);

  const faenaGroups = useMemo(() => groupByFaena(filtered), [filtered]);

  const toggleFaena = (faena: string) => {
    setCollapsedFaenas(prev => {
      const next = new Set(prev);
      if (next.has(faena)) next.delete(faena);
      else next.add(faena);
      return next;
    });
  };

  const isLoading = loadingSigetra || loadingVolvo;

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="fusion-loading">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="fusion-container">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wifi className={`w-3.5 h-3.5 ${sigetraStatus?.connected ? "text-emerald-400" : "text-red-400"}`} />
          <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">SIGETRA</span>
          {sigetraStatus?.connected && <Check className="w-3 h-3 text-emerald-400" />}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <Wifi className={`w-3.5 h-3.5 ${volvoStatus?.connected ? "text-emerald-400" : "text-red-400"}`} />
          <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">VOLVO rFMS</span>
          {volvoStatus?.connected && <Check className="w-3 h-3 text-emerald-400" />}
        </div>
      </div>

      {fusion?.vinFilterActive && (
        <div className="bg-blue-500/5 border border-blue-500/20 p-2 flex items-center gap-2" data-testid="fusion-vin-filter-banner">
          <Database className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-[11px] font-mono text-blue-400">
            Mostrando {fusion.camionesConVin} camiones con telemetria Volvo activa. {fusion.camionesSinVin} camiones sin VIN excluidos del analisis.
          </span>
        </div>
      )}

      {!sigetraStatus?.connected && (
        <div className="bg-red-500/10 border border-red-500/30 p-4" data-testid="fusion-sigetra-error">
          <div className="flex items-center gap-2 mb-2">
            <WifiOff className="w-4 h-4 text-red-400" />
            <span className="text-xs font-mono font-bold text-red-400">SIGETRA NO CONECTADO</span>
          </div>
          <p className="text-[11px] font-mono text-red-400/80">
            {sigetraStatus?.message || "No se pudo conectar con Sigetra Web. Verifique las credenciales."}
          </p>
        </div>
      )}

      {fusion && (
        <div className="bg-card border border-border p-4" data-testid="cuadratura-header">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-sm font-mono font-bold tracking-[0.1em] text-foreground">
                  CUADRATURA DEL DIA: {formatFechaCuadratura(fusion.fechaCuadratura)}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">
                    Proxima actualizacion: {fusion.proximaActualizacion}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block">CON ECU</span>
                <span className="text-sm font-mono font-bold text-emerald-400" data-testid="text-con-ecu">{fusion.conDatosEcu}</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-right">
                <span className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block">SIN ECU</span>
                <span className="text-sm font-mono font-bold text-amber-400" data-testid="text-sin-ecu">{fusion.sinDatosEcu}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {fusion && (() => {
        const trucksConEcu = fusion.trucks.filter(t => !t.sinDatosEcuAyer && t.litrosQuemadosEcu != null && t.litrosQuemadosEcu > 0);
        const totalDelta = trucksConEcu.reduce((s, t) => s + (t.deltaCuadratura ?? 0), 0);

        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-card border border-border p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">CAMIONES</span>
                </div>
                <div className="text-2xl font-mono font-bold text-primary" data-testid="text-total-camiones">{fusion.totalCamiones}</div>
                <div className="text-xs font-mono text-muted-foreground">con actividad ayer</div>
              </div>
              <div className="bg-card border border-border p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Fuel className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">LT CARGADOS</span>
                </div>
                <div className="text-2xl font-mono font-bold text-amber-400" data-testid="text-litros-cargados">{fN(fusion.totalLitrosCargados)}</div>
                <div className="text-xs font-mono text-muted-foreground">Sigetra ({fusion.totalCargas} cargas)</div>
              </div>
              <div className="bg-card border border-border p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">LT QUEMADOS ECU</span>
                </div>
                <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-litros-ecu">{fN(fusion.totalLitrosEcu)}</div>
                <div className="text-xs font-mono text-muted-foreground">Volvo rFMS ({fusion.conDatosEcu} camiones)</div>
              </div>
              <div className="bg-card border border-border p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-primary" />
                  <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">DELTA TOTAL</span>
                </div>
                <div className={`text-2xl font-mono font-bold ${totalDelta > 50 ? "text-red-400" : totalDelta > 0 ? "text-amber-400" : "text-emerald-400"}`} data-testid="text-delta-total">
                  {totalDelta > 0 ? "+" : ""}{fN(Math.round(totalDelta))} L
                </div>
                <div className="text-xs font-mono text-muted-foreground">cargados - quemados</div>
              </div>
            </div>

            {fusion.conDatosEcu === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 flex items-center gap-3" data-testid="no-ecu-ayer-banner">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <span className="text-[11px] font-mono font-bold text-amber-400 block">SIN SNAPSHOTS ECU PARA EL DIA DE AYER</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    No hay datos Volvo del {formatFechaCuadratura(fusion.fechaCuadratura).toLowerCase()}. El cruce estara disponible manana con los datos de hoy.
                  </span>
                </div>
              </div>
            )}

            {fusion.alertCount > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 p-2.5 flex items-center gap-2" data-testid="alert-count-banner">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-[11px] font-mono font-bold text-red-400">
                  {fusion.alertCount} camion{fusion.alertCount > 1 ? "es" : ""} con delta sospechoso (cargaron mas de lo que quemo la ECU)
                </span>
              </div>
            )}
          </>
        );
      })()}

      {loadingFusion && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {errorFusion && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="fusion-error">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] font-mono text-red-400">Error al obtener datos de fusion. Intente nuevamente.</span>
        </div>
      )}

      {fusion && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={busq} onChange={e => setBusq(e.target.value)}
                placeholder="Buscar patente, VIN, faena..."
                className="pl-8 font-mono text-xs bg-card"
                data-testid="input-fusion-search" />
            </div>
            <span className="text-xs font-mono text-muted-foreground">{filtered.length} resultados en {faenaGroups.length} faenas</span>
          </div>

          <div className="space-y-3">
            {faenaGroups.map(group => {
              const isCollapsed = collapsedFaenas.has(group.faena);
              return (
                <div key={group.faena} className="border border-border bg-card overflow-hidden" data-testid={`faena-group-${group.faena}`}>
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 bg-background border-b border-border cursor-pointer transition-colors hover:bg-primary/5 flex-wrap"
                    onClick={() => toggleFaena(group.faena)}
                    data-testid={`btn-faena-toggle-${group.faena}`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-mono font-bold text-foreground tracking-[0.1em]">{group.faena}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">
                        <Truck className="w-3 h-3 inline mr-1" />{group.trucks.length} camiones
                      </span>
                      <span className="text-xs font-mono text-amber-400">
                        <Fuel className="w-3 h-3 inline mr-1" />{fN(Math.round(group.totalLitros))} L
                      </span>
                      <span className="text-xs font-mono text-blue-400">
                        {group.totalCargas} cargas
                      </span>
                      {group.alertCount > 0 && (
                        <span className="text-xs font-mono text-red-400">
                          <AlertTriangle className="w-3 h-3 inline mr-1" />{group.alertCount} alertas
                        </span>
                      )}
                    </div>
                    <div className="flex-1" />
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  {!isCollapsed && (
                    <>
                      <div className="grid grid-cols-[60px_80px_90px_90px_70px_60px_60px_60px] gap-0 bg-background/50 border-b border-border/50 px-3 py-1.5">
                        <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">N.INT</span>
                        <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">PATENTE</span>
                        <span className="text-xs font-mono font-bold text-amber-400/70 tracking-[0.15em]">LT CARG.</span>
                        <span className="text-xs font-mono font-bold text-blue-400/70 tracking-[0.15em]">LT ECU</span>
                        <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">DELTA</span>
                        <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">CARGAS</span>
                        <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">CUAD.</span>
                        <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">ESTADO</span>
                      </div>

                      <div className="max-h-[500px] overflow-y-auto">
                        {group.trucks.map(t => {
                          const cuad = computeCuadratura(t);
                          return (
                          <div key={t.fleetNum}>
                            <div
                              className={`grid grid-cols-[60px_80px_90px_90px_70px_60px_60px_60px] gap-0 px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors hover:bg-primary/5 ${
                                t.alertLevel === "critico" ? "bg-red-500/5" : t.alertLevel === "alerta" ? "bg-amber-500/5" : ""
                              }`}
                              style={{ borderLeftWidth: 3, borderLeftColor: t.sinDatosEcuAyer ? "#3a6080" : t.alertLevel === "critico" ? "#FF2D4A" : t.alertLevel === "alerta" ? "#FFB020" : "#00C87A" }}
                              onClick={() => setExpandedRow(expandedRow === t.fleetNum ? null : t.fleetNum)}
                              data-testid={`row-fusion-${t.fleetNum}`}
                            >
                              <span className="text-xs font-mono font-bold text-foreground">{t.fleetNum}</span>
                              <span className="text-xs font-mono text-muted-foreground">{t.patenteReal || "\u2014"}</span>
                              <span className="text-xs font-mono font-bold text-amber-400">{t.litrosCargados > 0 ? `${fN(Math.round(t.litrosCargados))} L` : "\u2014"}</span>
                              <span className="text-xs font-mono font-bold text-blue-400">
                                {t.sinDatosEcuAyer
                                  ? <span className="text-[11px] text-muted-foreground font-normal">Sin ECU</span>
                                  : t.litrosQuemadosEcu != null ? `${fN(Math.round(t.litrosQuemadosEcu))} L` : "\u2014"
                                }
                              </span>
                              <span className={`text-xs font-mono font-bold ${
                                t.sinDatosEcuAyer ? "text-muted-foreground" :
                                t.deltaCuadratura != null && t.deltaCuadratura > 50 ? "text-red-400" :
                                t.deltaCuadratura != null && t.deltaCuadratura > 20 ? "text-amber-400" :
                                t.deltaCuadratura != null ? "text-emerald-400" : "text-muted-foreground"
                              }`}>
                                {t.sinDatosEcuAyer ? "\u2014" : t.deltaCuadratura != null ? `${t.deltaCuadratura > 0 ? "+" : ""}${Math.round(t.deltaCuadratura)}` : "\u2014"}
                              </span>
                              <span className="text-xs font-mono text-muted-foreground">{t.totalCargas}</span>
                              <span className={`text-xs font-mono font-bold ${cuad === null ? "text-muted-foreground" : cuad >= 95 ? "text-emerald-400" : cuad >= 85 ? "text-amber-400" : "text-red-400"}`} data-testid={`text-cuad-${t.fleetNum}`}>
                                {cuad === null ? "\u2014" : `${cuad.toFixed(0)}%`}
                              </span>
                              <div className="flex items-center gap-1">
                                {t.sinDatosEcuAyer ? (
                                  <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                                ) : (
                                  <span className={`w-2 h-2 rounded-full ${
                                    t.alertLevel === "critico" ? "bg-red-500" : t.alertLevel === "alerta" ? "bg-amber-500" : "bg-emerald-500"
                                  }`} />
                                )}
                                {expandedRow === t.fleetNum ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                              </div>
                            </div>

                            {expandedRow === t.fleetNum && (
                              <div className="bg-background border-b border-border p-4">
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">INFORMACION CAMION</div>
                                    <div className="space-y-1 text-[11px] font-mono">
                                      <div><span className="text-muted-foreground">Interno:</span> <span className="text-foreground font-bold">{t.fleetNum}</span></div>
                                      <div><span className="text-muted-foreground">Patente:</span> <span className="text-foreground">{t.patenteReal || "\u2014"}</span></div>
                                      <div><span className="text-muted-foreground">VIN:</span> <span className="text-foreground text-xs">{t.vin || "\u2014"}</span></div>
                                      <div><span className="text-muted-foreground">Modelo:</span> <span className="text-foreground">{t.modeloVolvo}</span></div>
                                      <div><span className="text-muted-foreground">Conductor:</span> <span className="text-foreground">{t.conductorSigetra || "\u2014"}</span></div>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">SIGETRA (AYER)</div>
                                    <div className="space-y-1 text-[11px] font-mono">
                                      <div><span className="text-muted-foreground">Litros cargados:</span> <span className="text-amber-400 font-bold">{fN(Math.round(t.litrosCargados))} L</span></div>
                                      <div><span className="text-muted-foreground">Cargas:</span> <span className="text-foreground">{t.totalCargas}</span></div>
                                      <div><span className="text-muted-foreground">Rendimiento:</span> <span className="text-foreground">{t.rendPromedio > 0 ? `${t.rendPromedio.toFixed(2)} km/L` : "\u2014"}</span></div>
                                      <div><span className="text-muted-foreground">Odometro:</span> <span className="text-foreground">{t.odometroSigetra != null ? `${fN(t.odometroSigetra)} km` : "\u2014"}</span></div>
                                      <div><span className="text-muted-foreground">Faena:</span> <span className="text-foreground">{t.faenaSigetra || "\u2014"}</span></div>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-1">VOLVO ECU (AYER)</div>
                                    <div className="space-y-1 text-[11px] font-mono">
                                      {t.sinDatosEcuAyer ? (
                                        <div className="bg-amber-500/10 border border-amber-500/30 p-2 mt-1">
                                          <span className="text-xs font-mono text-amber-400">Sin datos ECU ayer</span>
                                        </div>
                                      ) : (
                                        <>
                                          <div><span className="text-muted-foreground">Litros quemados:</span> <span className="text-blue-400 font-bold">{t.litrosQuemadosEcu != null ? `${fN(Math.round(t.litrosQuemadosEcu))} L` : "\u2014"}</span></div>
                                          <div><span className="text-muted-foreground">KM recorridos:</span> <span className="text-foreground">{t.kmEcuAyer != null ? `${fN(t.kmEcuAyer)} km` : "\u2014"}</span></div>
                                          <div><span className="text-muted-foreground">Snapshots:</span> <span className="text-foreground">{t.snapshotsAyer}</span></div>
                                        </>
                                      )}
                                      <div><span className="text-muted-foreground">Nivel tanque:</span> <span className={`font-bold ${t.fuelLevelVolvo != null ? (t.fuelLevelVolvo < 15 ? "text-red-400" : t.fuelLevelVolvo < 30 ? "text-amber-400" : "text-emerald-400") : "text-muted-foreground"}`}>{t.fuelLevelVolvo != null ? `${t.fuelLevelVolvo}%` : "\u2014"}</span></div>
                                      <div><span className="text-muted-foreground">Odometro ECU:</span> <span className="text-blue-400">{t.odometroVolvo != null ? `${fN(t.odometroVolvo)} km` : "\u2014"}</span></div>
                                    </div>
                                  </div>
                                </div>

                                {!t.sinDatosEcuAyer && t.litrosQuemadosEcu != null && t.litrosQuemadosEcu > 0 && t.litrosCargados > 0 && (() => {
                                  const cuadDetail = computeCuadratura(t);
                                  return (
                                    <div className={`border p-3 mb-3 ${cuadDetail != null && cuadDetail >= 95 ? "bg-emerald-500/10 border-emerald-500/30" : cuadDetail != null && cuadDetail >= 50 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/5 border-red-500/20"}`} data-testid={`cuadratura-detail-${t.fleetNum}`}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <ArrowRightLeft className={`w-3.5 h-3.5 ${cuadDetail != null && cuadDetail >= 95 ? "text-emerald-400" : cuadDetail != null && cuadDetail >= 50 ? "text-amber-400" : "text-red-400"}`} />
                                        <span className={`text-xs font-mono font-bold tracking-[0.15em] ${cuadDetail != null && cuadDetail >= 95 ? "text-emerald-400" : cuadDetail != null && cuadDetail >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                          CUADRATURA DEL DIA
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-3">
                                        <div>
                                          <div className="text-xs font-mono text-muted-foreground mb-0.5">CARGADOS (SIGETRA)</div>
                                          <div className="text-sm font-mono font-bold text-amber-400">{fN(Math.round(t.litrosCargados))} L</div>
                                        </div>
                                        <div>
                                          <div className="text-xs font-mono text-muted-foreground mb-0.5">QUEMADOS (ECU)</div>
                                          <div className="text-sm font-mono font-bold text-blue-400">{fN(Math.round(t.litrosQuemadosEcu))} L</div>
                                        </div>
                                        <div>
                                          <div className="text-xs font-mono text-muted-foreground mb-0.5">DELTA</div>
                                          <div className={`text-sm font-mono font-bold ${t.deltaCuadratura != null && t.deltaCuadratura > 50 ? "text-red-400" : t.deltaCuadratura != null && t.deltaCuadratura > 20 ? "text-amber-400" : "text-emerald-400"}`}>
                                            {t.deltaCuadratura != null ? `${t.deltaCuadratura > 0 ? "+" : ""}${fN(Math.round(t.deltaCuadratura))} L` : "\u2014"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {t.cargas.length > 0 && (
                                  <>
                                    <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-2">CARGAS DEL DIA ({t.cargas.length})</div>
                                    <div className="border border-border/50 max-h-[200px] overflow-y-auto">
                                      <div className="grid grid-cols-[1fr_70px_80px_80px_70px_1fr] gap-0 bg-card/50 px-2 py-1.5 border-b border-border/30 sticky top-0">
                                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">FECHA</span>
                                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">LITROS</span>
                                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">ODOMETRO</span>
                                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">KM REC.</span>
                                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">REND.</span>
                                        <span className="text-[7px] font-mono text-muted-foreground tracking-[0.1em]">LUGAR</span>
                                      </div>
                                      {t.cargas.map((c, i) => (
                                        <div key={i} className="grid grid-cols-[1fr_70px_80px_80px_70px_1fr] gap-0 px-2 py-1.5 border-b border-border/20 text-xs font-mono">
                                          <span className="text-muted-foreground">{formatDateTime(c.fecha)}</span>
                                          <span className="text-amber-400 font-bold">{c.litros.toFixed(1)}</span>
                                          <span className="text-foreground">{c.odometro != null ? fN(c.odometro) : "\u2014"}</span>
                                          <span className="text-foreground">{c.kmRecorrido != null ? fN(c.kmRecorrido) : "\u2014"}</span>
                                          <span className="text-foreground">{c.rendimiento != null ? c.rendimiento.toFixed(1) : "\u2014"}</span>
                                          <span className="text-muted-foreground truncate">{c.lugar || "\u2014"}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {faenaGroups.length === 0 && !loadingFusion && (
              <div className="p-8 text-center text-[11px] font-mono text-muted-foreground border border-border bg-card" data-testid="fusion-empty">
                {busq ? "Sin resultados para la busqueda" : "No se encontraron camiones con datos del dia de ayer"}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
