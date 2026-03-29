import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Navigation, TrendingUp, TrendingDown, Fuel, Truck, ChevronDown, ChevronUp,
  BarChart3, AlertTriangle, Info, MapPin, Target
} from "lucide-react";
import { getErrorFleetNums, isErrorCarga } from "@/pages/errores";

interface FusionCarga {
  numGuia: number;
  fecha: string;
  litros: number;
  odometro: number | null;
  kmRecorrido: number | null;
  rendimiento: number | null;
  lugar: string | null;
  tarjeta: string | null;
  conductor: string | null;
}

interface FusionTruck {
  fleetNum: string;
  patenteReal: string | null;
  vin: string | null;
  modeloVolvo: string;
  faenaSigetra: string | null;
  conductorSigetra: string | null;
  totalLitrosSigetra: number;
  totalCargas: number;
  rendPromedio: number;
  odometroSigetra: number | null;
  odometroVolvo: number | null;
  deltaOdometro: number | null;
  fuelLevelVolvo: number | null;
  totalFuelUsedVolvo: number | null;
  litrosVolvoPeriodo: number | null;
  engineHoursVolvo: number | null;
  gpsVolvo: { latitude: number | null; longitude: number | null } | null;
  alertLevel: "ok" | "alerta" | "critico";
  cargas: FusionCarga[];
}

interface FusionResponse {
  from: string;
  to: string;
  totalTrucksMatched: number;
  totalLitros: number;
  totalCargas: number;
  alertCount: number;
  trucks: FusionTruck[];
}

interface RouteDefinition {
  id: string;
  name: string;
  keywords: string[][];
  distanciaRef: number;
}

const KNOWN_ROUTES: RouteDefinition[] = [
  {
    id: "stgo-concepcion",
    name: "Santiago - Concepcion",
    keywords: [
      ["quilicura", "santiago", "pudahuel", "evc vespucio", "evc colorado"],
      ["concepcion", "ruta 5 sur km 484", "ruta 5 sur km 518", "longitudinal sur km 275", "carretera panamericana sur km 265"],
    ],
    distanciaRef: 500,
  },
  {
    id: "stgo-losangeles",
    name: "Santiago - Los Angeles",
    keywords: [
      ["quilicura", "santiago", "pudahuel", "evc vespucio", "evc colorado"],
      ["los angeles", "longitudinal sur 5 km. 409", "ruta 5 km 409"],
    ],
    distanciaRef: 520,
  },
  {
    id: "stgo-coquimbo",
    name: "Santiago - Coquimbo / La Serena",
    keywords: [
      ["quilicura", "santiago", "pudahuel", "evc vespucio", "evc colorado"],
      ["coquimbo", "la serena", "ruta 5 norte km 838", "panamericana norte km 455", "carretera panamericana norte km 455"],
    ],
    distanciaRef: 470,
  },
  {
    id: "stgo-antofagasta",
    name: "Santiago - Antofagasta",
    keywords: [
      ["quilicura", "santiago", "pudahuel", "evc vespucio", "evc colorado"],
      ["antofagasta", "ruta 5 norte km 1392", "ruta 5 norte km 1398", "ruta 5 norte km 1351", "panamericana norte km 1354", "panamericana norte km. 10", "panamericana norte km 975", "punta diamante"],
    ],
    distanciaRef: 1350,
  },
  {
    id: "stgo-temuco",
    name: "Santiago - Temuco / Araucania",
    keywords: [
      ["quilicura", "santiago", "pudahuel", "evc vespucio", "evc colorado"],
      ["temuco", "ruta 5 sur km 904", "ruta 5 sur km 906", "trafun", "ruta 5 km 786"],
    ],
    distanciaRef: 680,
  },
  {
    id: "losangeles-temuco",
    name: "Los Angeles - Temuco",
    keywords: [
      ["los angeles"],
      ["temuco", "ruta 5 sur km 904", "ruta 5 sur km 906", "trafun"],
    ],
    distanciaRef: 300,
  },
];

function matchesZone(lugar: string, keywords: string[]): boolean {
  const lug = lugar.toLowerCase().trim();
  return keywords.some(kw => lug.includes(kw));
}

interface RouteTrip {
  fleetNum: string;
  patente: string | null;
  conductor: string | null;
  fecha: string;
  lugarOrigen: string;
  lugarDestino: string;
  litros: number;
  km: number;
  rendimiento: number;
}

interface RouteAnalysis {
  route: RouteDefinition;
  trips: RouteTrip[];
  avgRendimiento: number;
  p75Rendimiento: number;
  totalLitros: number;
  totalKm: number;
  bestTrip: RouteTrip | null;
  worstTrip: RouteTrip | null;
  truckCount: number;
}

function calcPercentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function fN(n: number): string {
  return n.toLocaleString("es-CL");
}

const DATA_START_DATE = "2026-03-01";

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const minDate = new Date(DATA_START_DATE + "T00:00:00");
  const effectiveFrom = from < minDate ? minDate : from;
  return { from: effectiveFrom.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function RendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
      <div className={`h-full rounded-md ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AnalizadorRutas() {
  const [days, setDays] = useState(30);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

  const range = useMemo(() => getDateRange(days), [days]);

  const { data: fusion, isLoading, isError } = useQuery<FusionResponse>({
    queryKey: [`/api/sigetra/fusion?from=${range.from}&to=${range.to}`],
    refetchInterval: 600000,
  });

  const errorNums = useMemo(() => {
    if (!fusion?.trucks) return new Set<string>();
    return getErrorFleetNums(fusion.trucks);
  }, [fusion]);

  const routeAnalyses = useMemo(() => {
    if (!fusion?.trucks) return [];

    const cleanTrucks = fusion.trucks
      .filter(t => !errorNums.has(t.fleetNum))
      .map(t => ({
        ...t,
        cargas: t.cargas.filter(c => !isErrorCarga(c) && c.litros > 0),
      }));

    const analyses: RouteAnalysis[] = [];

    KNOWN_ROUTES.forEach(route => {
      const trips: RouteTrip[] = [];

      cleanTrucks.forEach(truck => {
        const sortedCargas = [...truck.cargas].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

        for (let i = 0; i < sortedCargas.length; i++) {
          const carga = sortedCargas[i];
          if (!carga.lugar) continue;

          const isInOrigin = matchesZone(carga.lugar, route.keywords[0]);
          const isInDest = matchesZone(carga.lugar, route.keywords[1]);

          if (!isInDest && !isInOrigin) continue;

          const minKm = route.distanciaRef * 0.3;
          const maxKm = route.distanciaRef * 3;

          if (isInDest && i > 0) {
            const prev = sortedCargas[i - 1];
            if (prev.lugar && matchesZone(prev.lugar, route.keywords[0])) {
              const km = carga.kmRecorrido != null && carga.kmRecorrido > 0 ? carga.kmRecorrido : 0;
              const litros = carga.litros;
              if (litros > 0 && km >= minKm && km <= maxKm) {
                const rend = km / litros;
                if (rend > 0.5 && rend < 10) {
                  trips.push({
                    fleetNum: truck.fleetNum,
                    patente: truck.patenteReal,
                    conductor: carga.conductor || truck.conductorSigetra,
                    fecha: carga.fecha,
                    lugarOrigen: prev.lugar,
                    lugarDestino: carga.lugar,
                    litros,
                    km,
                    rendimiento: rend,
                  });
                }
              }
            }
          }

          if (isInOrigin && i > 0) {
            const prev = sortedCargas[i - 1];
            if (prev.lugar && matchesZone(prev.lugar, route.keywords[1])) {
              const km = carga.kmRecorrido != null && carga.kmRecorrido > 0 ? carga.kmRecorrido : 0;
              const litros = carga.litros;
              if (litros > 0 && km >= minKm && km <= maxKm) {
                const rend = km / litros;
                if (rend > 0.5 && rend < 10) {
                  trips.push({
                    fleetNum: truck.fleetNum,
                    patente: truck.patenteReal,
                    conductor: carga.conductor || truck.conductorSigetra,
                    fecha: carga.fecha,
                    lugarOrigen: prev.lugar,
                    lugarDestino: carga.lugar,
                    litros,
                    km,
                    rendimiento: rend,
                  });
                }
              }
            }
          }
        }
      });

      if (trips.length === 0) return;

      const rendValues = trips.map(t => t.rendimiento);
      const avgRendimiento = rendValues.length > 0 ? rendValues.reduce((s, v) => s + v, 0) / rendValues.length : 0;
      const p75Rendimiento = calcPercentile(rendValues, 75);
      const totalLitros = trips.reduce((s, t) => s + t.litros, 0);
      const totalKm = trips.reduce((s, t) => s + t.km, 0);
      const uniqueTrucks = new Set(trips.map(t => t.fleetNum));

      const sortedByRend = [...trips].sort((a, b) => b.rendimiento - a.rendimiento);
      const bestTrip = sortedByRend[0] || null;
      const worstTrip = sortedByRend.length > 1 ? sortedByRend[sortedByRend.length - 1] : null;

      analyses.push({
        route,
        trips,
        avgRendimiento,
        p75Rendimiento,
        totalLitros,
        totalKm,
        bestTrip,
        worstTrip,
        truckCount: uniqueTrucks.size,
      });
    });

    analyses.sort((a, b) => b.trips.length - a.trips.length);
    return analyses;
  }, [fusion, errorNums]);

  const globalMax = useMemo(() => {
    return routeAnalyses.reduce((max, r) => Math.max(max, r.avgRendimiento, r.p75Rendimiento), 0);
  }, [routeAnalyses]);

  const totalTrips = routeAnalyses.reduce((s, r) => s + r.trips.length, 0);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="rutas-analizador-loading">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="analizador-rutas-page">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-violet-400" />
          <h1 className="text-sm font-mono font-bold tracking-[0.15em] uppercase text-foreground" data-testid="text-analizador-title">
            Analizador de Rutas
          </h1>
        </div>
        <span className="text-xs font-mono text-muted-foreground">Rendimiento ideal por ruta de carretera</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground tracking-[0.15em]">PERIODO:</span>
        {[14, 30, 60].map(d => (
          <button key={d} onClick={() => setDays(d)}
            data-testid={`btn-analizador-days-${d}`}
            className={`px-3 py-1 text-xs font-mono font-bold border cursor-pointer transition-colors ${
              days === d ? "bg-violet-500/20 border-violet-500 text-violet-400" : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {d}D
          </button>
        ))}
      </div>

      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-2" data-testid="analizador-error">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] font-mono text-red-400">Error al obtener datos.</span>
        </div>
      )}

      {fusion && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Navigation className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">RUTAS DETECTADAS</span>
              </div>
              <div className="text-2xl font-mono font-bold text-violet-400" data-testid="text-rutas-detectadas">{routeAnalyses.length}</div>
              <div className="text-xs font-mono text-muted-foreground">de {KNOWN_ROUTES.length} configuradas</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Truck className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">VIAJES TOTALES</span>
              </div>
              <div className="text-2xl font-mono font-bold text-blue-400" data-testid="text-viajes-total">{totalTrips}</div>
              <div className="text-xs font-mono text-muted-foreground">tramos identificados</div>
            </div>
            <div className="bg-card border border-border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono text-muted-foreground tracking-[0.2em]">MEJOR RUTA</span>
              </div>
              {routeAnalyses.length > 0 ? (
                <>
                  <div className="text-sm font-mono font-bold text-foreground truncate" data-testid="text-mejor-ruta">
                    {[...routeAnalyses].sort((a, b) => b.avgRendimiento - a.avgRendimiento)[0].route.name}
                  </div>
                  <div className="text-lg font-mono font-bold text-emerald-400">
                    {[...routeAnalyses].sort((a, b) => b.avgRendimiento - a.avgRendimiento)[0].avgRendimiento.toFixed(2)} km/L
                  </div>
                </>
              ) : (
                <div className="text-lg font-mono font-bold text-muted-foreground">{"\u2014"}</div>
              )}
            </div>
          </div>

          <div className="bg-violet-500/5 border border-violet-500/20 p-3 flex items-start gap-2" data-testid="note-analizador">
            <Info className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-violet-400/80">
              <span className="font-bold text-violet-400">Analizador de Rutas:</span> Identifica viajes entre ciudades analizando la secuencia de lugares de carga en Sigetra.
              Cuando un camion carga en una zona de origen (ej: Quilicura/Santiago) y su siguiente carga es en una zona de destino (ej: Ruta 5 Norte KM 1392/Antofagasta),
              se detecta como un viaje en esa ruta. El rendimiento ideal (P75) muestra la eficiencia alcanzable.
              Rutas configuradas: {KNOWN_ROUTES.map(r => r.name).join(", ")}.
            </div>
          </div>

          <div className="space-y-3">
            {routeAnalyses.map(analysis => {
              const isExpanded = expandedRoute === analysis.route.id;
              const sortedTrips = [...analysis.trips].sort((a, b) => b.rendimiento - a.rendimiento);

              return (
                <Card key={analysis.route.id} className="overflow-visible" data-testid={`card-route-${analysis.route.id}`}>
                  <CardHeader
                    className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 cursor-pointer"
                    onClick={() => setExpandedRoute(isExpanded ? null : analysis.route.id)}
                    data-testid={`btn-expand-route-${analysis.route.id}`}
                  >
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                      <Navigation className="w-4 h-4 text-violet-400 flex-shrink-0" />
                      <CardTitle className="text-sm font-mono font-bold tracking-[0.1em] uppercase truncate" data-testid={`text-route-name-${analysis.route.id}`}>
                        {analysis.route.name}
                      </CardTitle>
                      <span className="text-xs font-mono text-muted-foreground">
                        {analysis.trips.length} viajes · {analysis.truckCount} camiones · ~{fN(analysis.route.distanciaRef)} km ref
                      </span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em]">REND. PROMEDIO</div>
                        <div className={`text-lg font-mono font-bold ${
                          analysis.avgRendimiento >= 1.8 ? "text-emerald-400" : analysis.avgRendimiento >= 1.2 ? "text-amber-400" : "text-red-400"
                        }`} data-testid={`text-route-rend-${analysis.route.id}`}>
                          {analysis.avgRendimiento.toFixed(2)} km/L
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-5 gap-3 mb-3">
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">OPTIMO (P75)</div>
                        <div className="text-sm font-mono font-bold text-cyan-400" data-testid={`text-route-p75-${analysis.route.id}`}>
                          {analysis.p75Rendimiento.toFixed(2)} km/L
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">L/100KM</div>
                        <div className="text-sm font-mono font-bold text-foreground">
                          {analysis.avgRendimiento > 0 ? (100 / analysis.avgRendimiento).toFixed(1) : "\u2014"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">LITROS TOTAL</div>
                        <div className="text-sm font-mono font-bold text-amber-400">{fN(Math.round(analysis.totalLitros))} L</div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">KM TOTAL</div>
                        <div className="text-sm font-mono font-bold text-blue-400">{fN(Math.round(analysis.totalKm))}</div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] mb-0.5">VIAJES</div>
                        <div className="text-sm font-mono font-bold text-foreground">{analysis.trips.length}</div>
                      </div>
                    </div>

                    {analysis.bestTrip && analysis.worstTrip && (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            <span className="text-xs font-mono text-emerald-400 tracking-[0.15em]">MEJOR VIAJE</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-foreground" data-testid={`text-best-trip-${analysis.route.id}`}>
                            N.{analysis.bestTrip.fleetNum} ({analysis.bestTrip.fecha?.slice(0, 10)})
                          </div>
                          <div className="text-sm font-mono font-bold text-emerald-400">
                            {analysis.bestTrip.rendimiento.toFixed(2)} km/L
                          </div>
                        </div>
                        <div className="bg-red-500/5 border border-red-500/20 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingDown className="w-3 h-3 text-red-400" />
                            <span className="text-xs font-mono text-red-400 tracking-[0.15em]">PEOR VIAJE</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-foreground" data-testid={`text-worst-trip-${analysis.route.id}`}>
                            N.{analysis.worstTrip.fleetNum} ({analysis.worstTrip.fecha?.slice(0, 10)})
                          </div>
                          <div className="text-sm font-mono font-bold text-red-400">
                            {analysis.worstTrip.rendimiento.toFixed(2)} km/L
                          </div>
                        </div>
                      </div>
                    )}

                    <RendBar value={analysis.avgRendimiento} max={globalMax} color="bg-violet-500" />

                    {isExpanded && (
                      <div className="mt-4 border border-border bg-background">
                        <div className="grid grid-cols-[3.5rem_4rem_1fr_1fr_5rem_5rem_5rem_4.5rem] gap-1.5 bg-card px-3 py-2 border-b border-border">
                          <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">N.INT</span>
                          <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">FECHA</span>
                          <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">ORIGEN</span>
                          <span className="text-xs font-mono font-bold text-muted-foreground tracking-[0.15em]">DESTINO</span>
                          <span className="text-xs font-mono font-bold text-amber-400/70 tracking-[0.15em] text-right">LITROS</span>
                          <span className="text-xs font-mono font-bold text-blue-400/70 tracking-[0.15em] text-right">KM</span>
                          <span className="text-xs font-mono font-bold text-emerald-400/70 tracking-[0.15em] text-right">REND.</span>
                          <span className="text-xs font-mono font-bold text-cyan-400/70 tracking-[0.15em] text-right">vs P75</span>
                        </div>
                        <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                          {sortedTrips.map((trip, idx) => {
                            const vsP75 = analysis.p75Rendimiento > 0 ? ((trip.rendimiento - analysis.p75Rendimiento) / analysis.p75Rendimiento) * 100 : 0;
                            const isTop = idx === 0 && sortedTrips.length > 1;
                            const isBottom = idx === sortedTrips.length - 1 && sortedTrips.length > 1;
                            return (
                              <div
                                key={`${trip.fleetNum}-${trip.fecha}-${idx}`}
                                className={`grid grid-cols-[3.5rem_4rem_1fr_1fr_5rem_5rem_5rem_4.5rem] gap-1.5 px-3 py-2 items-center ${
                                  isTop ? "bg-emerald-500/5" : isBottom ? "bg-red-500/5" : ""
                                }`}
                                data-testid={`row-trip-${analysis.route.id}-${idx}`}
                              >
                                <span className="text-xs font-mono font-bold text-foreground">{trip.fleetNum}</span>
                                <span className="text-[11px] font-mono text-muted-foreground">{trip.fecha?.slice(5, 10)}</span>
                                <span className="text-[11px] font-mono text-foreground truncate">{trip.lugarOrigen?.substring(0, 25)}</span>
                                <span className="text-[11px] font-mono text-foreground truncate">{trip.lugarDestino?.substring(0, 25)}</span>
                                <span className="text-xs font-mono text-amber-400 text-right">{fN(Math.round(trip.litros))}</span>
                                <span className="text-xs font-mono text-blue-400 text-right">{fN(Math.round(trip.km))}</span>
                                <span className={`text-xs font-mono font-bold text-right ${
                                  trip.rendimiento >= 1.8 ? "text-emerald-400" : trip.rendimiento >= 1.2 ? "text-amber-400" : "text-red-400"
                                }`}>
                                  {trip.rendimiento.toFixed(2)}
                                </span>
                                <span className={`text-xs font-mono font-bold text-right ${vsP75 >= 0 ? "text-emerald-400" : vsP75 >= -15 ? "text-amber-400" : "text-red-400"}`}>
                                  {vsP75 >= 0 ? "+" : ""}{vsP75.toFixed(0)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {routeAnalyses.length === 0 && (
            <div className="p-8 text-center border border-border bg-card" data-testid="analizador-empty">
              <div className="text-[11px] font-mono text-muted-foreground mb-2">
                No se detectaron viajes en las rutas configuradas para el periodo seleccionado.
              </div>
              <div className="text-xs font-mono text-muted-foreground/60">
                Las rutas se detectan cuando un camion carga combustible en una zona de origen y su siguiente carga es en la zona de destino.
                Intente ampliar el periodo o verifique que existen cargas en las zonas configuradas.
              </div>
            </div>
          )}

          <div className="bg-background border border-border p-3" data-testid="rutas-config-info">
            <div className="text-xs font-mono text-muted-foreground tracking-[0.15em] uppercase mb-2">Rutas configuradas</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KNOWN_ROUTES.map(route => {
                const analysis = routeAnalyses.find(a => a.route.id === route.id);
                return (
                  <div key={route.id} className={`p-2 border ${analysis ? "border-violet-500/30 bg-violet-500/5" : "border-border/50"}`}>
                    <div className="text-xs font-mono font-bold text-foreground">{route.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">~{fN(route.distanciaRef)} km</div>
                    {analysis ? (
                      <div className="text-xs font-mono text-violet-400 font-bold mt-0.5">
                        {analysis.trips.length} viajes · {analysis.avgRendimiento.toFixed(2)} km/L
                      </div>
                    ) : (
                      <div className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">Sin datos</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
