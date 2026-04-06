import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusTag, getStatusVariant } from "@/components/status-tag";
import { FichaCamionModal } from "@/components/ficha-camion-modal";
import { CargaModal } from "@/components/carga-modal";
import { statsCamion, fN, fL, f$, PRECIO, rendColor, type CamionStats } from "@/lib/fuel-utils";
import { AlertTriangle, Search, FileText, Plus } from "lucide-react";
import type { Faena, Camion, Carga } from "@shared/schema";

export default function Camiones() {
  const [faenaFil, setFaenaFil] = useState<string>("all");
  const [estadoFil, setEstadoFil] = useState("todos");
  const [busq, setBusq] = useState("");
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [cargaId, setCargaId] = useState<number | null>(null);

  const { data: faenas = [], isLoading: loadingFaenas } = useQuery<Faena[]>({ queryKey: ["/api/faenas"] });
  const { data: camionesRaw = [], isLoading: loadingCamiones } = useQuery<Camion[]>({ queryKey: ["/api/camiones"], queryFn: () => fetch("/api/camiones").then(r => r.json()) });
  const { data: cargasRaw = [], isLoading: loadingCargas } = useQuery<Carga[]>({ queryKey: ["/api/cargas"] });

  const isLoading = loadingFaenas || loadingCamiones || loadingCargas;

  const camStats: CamionStats[] = useMemo(() =>
    camionesRaw.map(cam => {
      const cams = cargasRaw.filter(c => c.camionId === cam.id);
      return statsCamion(cam, cams);
    }), [camionesRaw, cargasRaw]);

  const filtrados = useMemo(() => {
    let d = camStats;
    if (faenaFil !== "all") d = d.filter(c => c.faenaId === parseInt(faenaFil));
    if (estadoFil !== "todos") d = d.filter(c => c.estado === estadoFil.toUpperCase());
    if (busq) d = d.filter(c =>
      c.patente.toLowerCase().includes(busq.toLowerCase()) ||
      c.conductor?.toLowerCase().includes(busq.toLowerCase())
    );
    const order: Record<string, number> = { CRITICO: 0, ALERTA: 1, OK: 2 };
    return d.sort((a, b) => order[a.estado] - order[b.estado]);
  }, [camStats, faenaFil, estadoFil, busq]);

  const criticos = filtrados.filter(c => c.estado === "CRITICO");

  const fichaStats = fichaId ? camStats.find(c => c.id === fichaId) : null;

  if (isLoading) {
    return (
      <div className="space-y-5" data-testid="camiones-loading">
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-40" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="camiones-view">
      <div className="flex gap-1.5 flex-wrap items-center" data-testid="faena-filters">
        {[{ id: "all", nombre: "Todas las faenas", color: undefined } as const, ...faenas].map(f => (
          <button
            key={f.id}
            onClick={() => setFaenaFil(String(f.id))}
            data-testid={`filter-faena-${f.id}`}
            className={`px-3.5 py-1.5 text-[11px] font-mono cursor-pointer border whitespace-nowrap transition-all ${
              String(faenaFil) === String(f.id)
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border text-muted-foreground bg-transparent"
            }`}
            style={
              f.id !== "all" && String(faenaFil) === String(f.id)
                ? { borderColor: `${f.color}80`, color: f.color, backgroundColor: `${f.color}15` }
                : undefined
            }
          >
            {f.nombre}
            {f.id !== "all" && (
              <span className="ml-1.5 opacity-60">
                ({camionesRaw.filter(c => c.faenaId === f.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {criticos.length > 0 && (
        <div data-testid="criticos-section">
          <div className="text-[11px] font-mono text-red-400 tracking-[0.2em] uppercase mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            ACCION INMEDIATA — POSIBLE ROBO O FRAUDE
          </div>
          {criticos.map(cam => {
            const faena = faenas.find(f => f.id === cam.faenaId);
            const criticCarga = cam.cargasAnalizadas.find(c => c.estado === "CRITICO");
            return (
              <div key={cam.id}
                className="bg-red-500/5 border border-red-500/25 p-3 px-4 mb-2 flex justify-between items-center"
                style={{ borderLeftWidth: 4, borderLeftColor: "#FF2D4A" }}
                data-testid={`critico-alert-${cam.id}`}>
                <div className="flex gap-5 items-center">
                  <div>
                    <div className="text-base font-mono font-bold text-primary">{cam.patente}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {cam.modelo} · {faena && <span style={{ color: faena.color }}>{faena.nombre}</span>}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-mono text-muted-foreground mb-0.5">TARJETA</div>
                    <div className="text-base font-mono text-foreground">{criticCarga?.litrosSurtidor}L</div>
                  </div>
                  <div className="text-xl text-red-400 font-bold">/=</div>
                  <div className="text-center">
                    <div className="text-xs font-mono text-muted-foreground mb-0.5">TELEMETRIA</div>
                    <div className="text-base font-mono text-emerald-400">{criticCarga?.litrosEcu}L</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-mono text-muted-foreground mb-0.5">DIFERENCIA TOTAL</div>
                    <div className="text-lg font-mono font-bold text-red-400">+{cam.litDesv}L</div>
                    <div className="text-xs text-red-400">{f$(cam.litDesv * PRECIO)}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCargaId(cam.id)} data-testid={`button-add-carga-${cam.id}`}>
                    <Plus className="w-3 h-3 mr-1" /> Carga
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setFichaId(cam.id)} data-testid={`button-ver-ficha-${cam.id}`}>
                    VER FICHA
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap" data-testid="search-filters">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar patente o conductor..."
            className="pl-8 w-56 font-mono text-xs bg-card"
            data-testid="input-search" />
        </div>
        {["todos", "CRITICO", "ALERTA", "OK"].map(f => (
          <button key={f} onClick={() => setEstadoFil(f)}
            data-testid={`filter-estado-${f.toLowerCase()}`}
            className={`px-3.5 py-1.5 text-xs font-mono tracking-[0.1em] cursor-pointer border uppercase transition-all ${
              estadoFil === f
                ? f === "CRITICO" ? "border-red-500/50 text-red-400 bg-red-500/10"
                : f === "ALERTA" ? "border-amber-400/50 text-amber-400 bg-amber-400/10"
                : f === "OK" ? "border-emerald-400/50 text-emerald-400 bg-emerald-400/10"
                : "border-muted-foreground/30 text-muted-foreground bg-muted/30"
                : "border-border text-muted-foreground"
            }`}>
            {f === "todos" ? "Todos" : f}
          </button>
        ))}
        <div className="ml-auto text-[11px] font-mono text-muted-foreground">
          {filtrados.length} camiones
        </div>
      </div>

      <div className="bg-card border border-border" data-testid="truck-table">
        <div className="grid grid-cols-[76px_140px_1fr_80px_80px_80px_70px_70px_90px] px-4 py-2 border-b border-border bg-muted/30 text-xs font-mono text-muted-foreground tracking-[0.2em]">
          <div>ESTADO</div><div>PATENTE</div><div>FAENA / MODELO</div><div>SURT.</div><div>ECU</div><div>DIF</div><div>REND.</div><div>RALENTI</div><div>ACCIONES</div>
        </div>

        {filtrados.length === 0 && (
          <div className="py-12 text-center text-muted-foreground font-mono text-xs" data-testid="text-empty-table">
            Sin camiones con este filtro.
          </div>
        )}

        {filtrados.map((cam, i) => {
          const faena = faenas.find(f => f.id === cam.faenaId);
          const totS = cam.cargasAnalizadas.reduce((a, c) => a + c.litrosSurtidor, 0);
          const totE = cam.cargasAnalizadas.reduce((a, c) => a + c.litrosEcu, 0);
          return (
            <div key={cam.id}
              className={`grid grid-cols-[76px_140px_1fr_80px_80px_80px_70px_70px_90px] px-4 py-3 items-center cursor-pointer transition-colors hover:bg-muted/20 ${
                i < filtrados.length - 1 ? "border-b border-border/20" : ""
              } ${cam.estado === "CRITICO" ? "bg-red-500/[0.03]" : ""}`}
              onClick={() => setFichaId(cam.id)}
              data-testid={`truck-row-${cam.id}`}>

              <StatusTag label={cam.estado === "OK" ? "OK" : cam.estado} variant={getStatusVariant(cam.estado)} />

              <div>
                <div className="text-sm font-mono font-bold text-primary">{cam.patente}</div>
                <div className={`text-[11px] font-mono mt-0.5 ${cam.syncOk ? "text-emerald-400" : "text-red-400"}`}>
                  {cam.syncOk ? "sync OK" : "sin sync"}
                </div>
              </div>

              <div>
                {faena && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: faena.color }} />
                    <span className="text-[11px] text-muted-foreground">{faena.nombre}</span>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground/60">{cam.modelo}</div>
              </div>

              <div className="text-xs font-mono text-foreground">{fL(totS)}</div>
              <div className="text-xs font-mono text-emerald-400">{fL(totE)}</div>
              <div className={`text-[13px] font-mono font-bold ${
                cam.litDesv > 0 ? cam.estado === "CRITICO" ? "text-red-400" : cam.estado === "ALERTA" ? "text-amber-400" : "text-emerald-400" : "text-muted-foreground"
              }`}>
                {cam.litDesv > 0 ? `+${cam.litDesv}L` : "\u2014"}
              </div>
              <div className={`text-[13px] font-mono font-bold ${rendColor(cam.rendProm, cam.metaKmL)}`}>
                {cam.rendProm ?? "\u2014"}
              </div>
              <div className={`text-xs font-mono ${cam.pctRal != null && cam.pctRal > 15 ? "text-amber-400" : "text-muted-foreground"}`}>
                {cam.pctRal != null ? `${cam.pctRal}%` : "\u2014"}
              </div>

              <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-mono"
                  onClick={() => setCargaId(cam.id)} data-testid={`button-add-carga-row-${cam.id}`}>
                  +L
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-mono"
                  onClick={() => setFichaId(cam.id)} data-testid={`button-ficha-row-${cam.id}`}>
                  <FileText className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {fichaStats && (
        <FichaCamionModal cam={fichaStats} faenas={faenas} open={!!fichaId} onClose={() => setFichaId(null)} />
      )}

      {cargaId && (
        <CargaModal camionId={cargaId} open={!!cargaId} onClose={() => setCargaId(null)} />
      )}
    </div>
  );
}
