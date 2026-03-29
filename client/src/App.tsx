import { useState, useMemo, useEffect, createContext, useContext } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import OperativeBrain from "@/pages/operative-brain";
import WisetrackPage from "@/pages/wisetrack";
import ViajesTMS from "@/pages/viajes-tms";
import EstacionesTab from "@/pages/geo-tabs/estaciones-tab";
import CombustibleTMS from "@/pages/combustible-tms";
import GeoValidator from "@/pages/geovalidator";
import { Map as MapIcon, Truck, Fuel, Brain, AlertTriangle, BarChart3, Settings, Loader2, MapPin, X } from "lucide-react";
import { APIProvider, Map as GMap, AdvancedMarker } from "@vis.gl/react-google-maps";

// ── Navigation Context ──
type MainTab = "flota" | "viajes" | "contratos" | "combustible" | "camiones" | "control" | "brain" | "sistema" | "foco";

interface NavContext {
  tab: MainTab;
  setTab: (t: MainTab) => void;
  selectedPatente: string | null;
  setSelectedPatente: (p: string | null) => void;
  selectedContrato: string | null;
  setSelectedContrato: (c: string | null) => void;
  navigateTo: (tab: MainTab, patente?: string, contrato?: string) => void;
}

const NavigationContext = createContext<NavContext>({
  tab: "flota", setTab: () => {}, selectedPatente: null, setSelectedPatente: () => {},
  selectedContrato: null, setSelectedContrato: () => {}, navigateTo: () => {},
});

export function useNavigation() { return useContext(NavigationContext); }

// ── Splash ──
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const dur = 2000;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 30;
      setProgress(Math.min((elapsed / dur) * 100, 100));
      if (elapsed >= dur) { clearInterval(timer); setTimeout(onDone, 300); }
    }, 30);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center" style={{ background: '#020508' }}>
      <div className="font-space text-[32px] font-bold tracking-[0.3em] mb-1" style={{ color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.3)' }}>
        SOTRASER
      </div>
      <div className="font-exo text-[11px] tracking-[0.3em] font-extralight mb-8" style={{ color: '#4a7090' }}>
        PLATAFORMA INTEGRADA DE FLOTA
      </div>
      <div className="w-64 h-1 overflow-hidden mb-4" style={{ background: '#0d2035' }}>
        <div className="h-full transition-all duration-100" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #00d4ff, #00ff88)' }} />
      </div>
      <div className="font-exo text-[11px] tracking-wider" style={{ color: '#4a7090' }}>
        Conectando sistemas...
      </div>
    </div>
  );
}

// ── Live Clock ──
function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
      setTime(`${months[now.getMonth()]} ${now.getDate()} · ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-space text-[11px]" style={{ color: '#4a7090' }}>{time}</span>;
}

// ── Tab definitions ──
const MAIN_TABS: { id: MainTab; label: string; icon: typeof MapIcon; color: string }[] = [
  { id: "flota", label: "FLOTA", icon: MapIcon, color: "#00d4ff" },
  { id: "viajes", label: "VIAJES", icon: Truck, color: "#00ff88" },
  { id: "contratos", label: "CONTRATOS", icon: BarChart3, color: "#a855f7" },
  { id: "combustible", label: "COMBUSTIBLE", icon: Fuel, color: "#ff6b35" },
  { id: "camiones", label: "CAMIONES", icon: Truck, color: "#06b6d4" },
  { id: "control", label: "CONTROL", icon: AlertTriangle, color: "#ff2244" },
  { id: "brain", label: "BRAIN", icon: Brain, color: "#a855f7" },
  { id: "sistema", label: "SISTEMA", icon: Settings, color: "#3a6080" },
];

// ── Contratos Unificado ──
function ContratosUnificado() {
  const { navigateTo } = useNavigation();
  const { data } = useQuery<any>({ queryKey: ["/api/viajes-tms/contratos-resumen"], queryFn: () => fetch("/api/viajes-tms/contratos-resumen").then(r => r.json()), staleTime: 5 * 60000 });
  const [sel, setSel] = useState<string | null>(null);
  const [selRuta, setSelRuta] = useState<{ origen: string; destino: string } | null>(null);
  const { data: det } = useQuery<any>({ queryKey: ["/api/viajes-tms/contratos-detalle", sel], queryFn: () => fetch(`/api/viajes-tms/contratos-detalle/${encodeURIComponent(sel!)}`).then(r => r.json()), enabled: !!sel, staleTime: 5 * 60000 });
  const { data: circuitosData } = useQuery<any>({ queryKey: ["/api/viajes-tms/circuitos-contrato", sel], queryFn: () => fetch(`/api/viajes-tms/circuitos-contrato/${encodeURIComponent(sel!)}`).then(r => r.json()), enabled: !!sel, staleTime: 5 * 60000 });
  const { data: contDet } = useQuery<any>({ queryKey: ["/api/viajes-tms/contrato-detalle", sel], queryFn: () => fetch(`/api/viajes-tms/contrato-detalle/${encodeURIComponent(sel!)}`).then(r => r.json()), enabled: !!sel, staleTime: 5 * 60000 });

  const contratos = data?.contratos || [];
  const conGps = contratos.filter((c: any) => parseInt(c.viajes || 0) > 0);
  const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
  const CC = (c: string) => { if (!c) return "#3a6080"; const u = c.toUpperCase(); if (u.includes("ANGLO") && u.includes("COCU")) return "#00ff88"; if (u.includes("ANGLO")) return "#22c55e"; if (u.includes("CENCOSUD")) return "#00d4ff"; if (u.includes("MININCO")) return "#84cc16"; if (u.includes("SAN JORGE")) return "#fbbf24"; if (u.includes("GLENCORE")) return "#ff6b35"; if (u.includes("INDURA")) return "#a78bfa"; if (u.includes("BLUEX")) return "#f472b6"; if (u.includes("ESTANQUE")) return "#06b6d4"; if (u.includes("WALMART")) return "#00d4ff"; const h = c.split("").reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0); return ["#a855f7","#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6"][h % 6]; };
  const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
  const circuitos = circuitosData?.circuitos || [];
  const totalCircuitos = circuitosData?.total_circuitos || 0;

  const kG = { cam: contratos.reduce((s: number, c: any) => s + parseInt(c.camiones || 0), 0), km: contratos.reduce((s: number, c: any) => s + parseFloat(c.km_mes || 0), 0), vj: contratos.reduce((s: number, c: any) => s + parseInt(c.viajes || 0), 0) };

  return (
    <div style={{ background: "#020508" }}>
      {/* ═══ CONTRACT SELECTOR ═══ */}
      <div className="flex items-center gap-0 border-b overflow-x-auto" style={{ borderColor: "#0d2035" }}>
        <button onClick={() => setSel(null)} className="px-4 py-2.5 font-space text-[9px] font-bold tracking-wider cursor-pointer flex-shrink-0"
          style={{ color: !sel ? "#a855f7" : "#3a6080", borderBottom: !sel ? "2px solid #a855f7" : "2px solid transparent", background: !sel ? "#a855f708" : "transparent" }}>TODOS</button>
        {conGps.map((c: any) => (
          <button key={c.contrato} onClick={() => { setSel(c.contrato); setSelRuta(null); }} className="px-3 py-2.5 font-space text-[9px] font-bold tracking-wider cursor-pointer flex-shrink-0"
            style={{ color: sel === c.contrato ? CC(c.contrato) : "#3a6080", borderBottom: sel === c.contrato ? `2px solid ${CC(c.contrato)}` : "2px solid transparent", background: sel === c.contrato ? `${CC(c.contrato)}08` : "transparent" }}>
            {c.contrato.replace("ANGLO-", "").substring(0, 12)} <span className="ml-1 opacity-60">{c.viajes}</span>
          </button>
        ))}
      </div>

      {!sel ? (
        /* ═══ VISTA TODOS: Grid de contratos ═══ */
        <div className="p-4">
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[{ l: "CONTRATOS", v: conGps.length, c: "#a855f7" }, { l: "CAMIONES", v: kG.cam, c: "#00d4ff" }, { l: "KM MES", v: fN(kG.km), c: "#00ff88" }, { l: "VIAJES", v: fN(kG.vj), c: "#c8e8ff" }].map(k => (
              <div key={k.l} className="px-4 py-3 text-center" style={{ background: "#060d14", borderTop: `3px solid ${k.c}`, borderRadius: 8 }}>
                <div className="font-space text-[24px] font-bold" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {conGps.map((c: any) => {
              const color = CC(c.contrato); const rend = parseFloat(c.km_l || 0); const diasMes = new Date().getDate(); const pct = diasMes > 0 ? Math.min(100, Math.round((parseInt(c.dias_activos || 0) / diasMes) * 100)) : 0;
              return (
                <button key={c.contrato} onClick={() => { setSel(c.contrato); setSelRuta(null); }} className="text-left p-4 cursor-pointer transition-all hover:scale-[1.01]"
                  style={{ background: "#060d14", border: `1px solid ${color}20`, borderTop: `3px solid ${color}`, borderRadius: 8 }}>
                  <div className="flex items-start justify-between mb-3">
                    <div><div className="font-space text-[12px] font-bold" style={{ color }}>{c.contrato}</div><div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{c.camiones} camiones</div></div>
                    <span className="font-space text-[14px] font-bold" style={{ color: RC(rend) }}>{rend > 0 ? rend.toFixed(2) : "--"}<span className="text-[8px] ml-0.5" style={{ color: "#3a6080" }}>km/L</span></span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>KM</div><div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km_mes || 0))}</div></div>
                    <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>VIAJES</div><div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{c.viajes}</div></div>
                    <div><div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>ACTIV.</div><div className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{pct}%</div></div>
                  </div>
                  <div className="h-1.5 w-full" style={{ background: "#0d2035", borderRadius: 3 }}><div className="h-full" style={{ width: `${pct}%`, background: color, borderRadius: 3, opacity: 0.7 }} /></div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ═══ VISTA CONTRATO: TMS Layout ═══ */
        <div style={{ height: "calc(100vh - 115px)" }}>
          {/* KPIs del contrato */}
          {contDet?.kpis && (
            <div className="grid grid-cols-8 gap-0 border-b" style={{ borderColor: "#0d2035" }}>
              {[
                { l: "CAMIONES", v: contDet.kpis.camiones, c: CC(sel) },
                { l: "VIAJES", v: fN(contDet.kpis.viajes), c: "#c8e8ff" },
                { l: "KM TOTAL", v: fN(parseFloat(contDet.kpis.km_total || 0)), c: "#a855f7" },
                { l: "KM/L ECU", v: contDet.kpis.rend_promedio || "--", c: RC(parseFloat(contDet.kpis.rend_promedio || 0)) },
                { l: "HORAS", v: fN(parseFloat(contDet.kpis.horas_total || 0)), c: "#c8e8ff" },
                { l: "DÍAS", v: `${contDet.kpis.dias_activos}/${contDet.kpis.dias_mes}`, c: "#c8e8ff" },
                { l: "DOBLE CHECK", v: contDet.kpis.doble_validados || 0, c: "#00ffcc" },
                { l: "CONDUCTOR", v: `${Math.round((contDet.kpis.con_conductor || 0) / Math.max(contDet.kpis.viajes, 1) * 100)}%`, c: "#c8e8ff" },
              ].map(k => (
                <div key={k.l} className="px-3 py-2.5 text-center" style={{ background: "#060d14", borderRight: "1px solid #0d2035" }}>
                  <div className="font-space text-[16px] font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="font-exo text-[6px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* 3 columnas: Rutas | Detalle | Camiones */}
          <div className="flex" style={{ height: "calc(100% - 55px)" }}>
            {/* COL 1: Circuitos (viajes agrupados por camion+dia) */}
            <div className="w-[35%] overflow-auto border-r" style={{ borderColor: "#0d2035" }}>
              <div className="px-3 py-2 sticky top-0 z-10" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>CIRCUITOS · {circuitos.length} rutas · {totalCircuitos} viajes/día</span>
              </div>
              {circuitos.map((circ: any, i: number) => {
                const activa = selRuta?.origen === circ.origen && selRuta?.destino === circ.destino;
                return (
                  <div key={i} onClick={() => setSelRuta(activa ? null : { origen: circ.origen || "?", destino: circ.destino || "?" })}
                    className="px-3 py-2.5 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)] border-b" style={{ borderColor: "#0a1520", background: activa ? "#00d4ff06" : "transparent", borderLeft: activa ? "3px solid #00d4ff" : "3px solid transparent" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-exo text-[9px] font-bold" style={{ color: activa ? "#00d4ff" : "#c8e8ff" }}>{(circ.origen || "?").substring(0, 25)}</span>
                      <span className="font-space text-[11px] font-bold" style={{ color: RC(circ.rend_promedio) }}>{circ.rend_promedio || "--"}</span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>→</span>
                      <span className="font-exo text-[9px]" style={{ color: "#5a8090" }}>{(circ.destino || "?").substring(0, 25)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{circ.total}x · {circ.camiones}cam · {circ.km_promedio}km prom</span>
                      <span className="font-exo text-[8px] font-bold" style={{ color: CC(sel || "") }}>{totalCircuitos > 0 ? Math.round(circ.total / totalCircuitos * 100) : 0}%</span>
                    </div>
                  </div>
                );
              })}
              {circuitos.length === 0 && <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Cargando circuitos...</div>}
            </div>

            {/* COL 2: Detalle circuito seleccionado */}
            <div className="w-[35%] overflow-auto border-r" style={{ borderColor: "#0d2035" }}>
              {!selRuta ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center"><MapPin className="w-8 h-8 mx-auto mb-2" style={{ color: "#0d2035" }} /><div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Selecciona un circuito para ver detalle</div></div>
                </div>
              ) : (() => {
                const circ = circuitos.find((c: any) => c.origen === selRuta.origen && c.destino === selRuta.destino);
                if (!circ) return <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin datos</div>;
                return (
                  <>
                    <div className="px-3 py-2 sticky top-0 z-10 flex items-center justify-between" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
                      <div>
                        <div className="font-exo text-[9px] font-bold" style={{ color: "#00d4ff" }}>{selRuta.origen} → {selRuta.destino}</div>
                        <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{circ.total}x este mes · {circ.camiones} camiones · {circ.km_promedio}km prom</div>
                      </div>
                      <button onClick={() => setSelRuta(null)} className="cursor-pointer"><X className="w-3 h-3" style={{ color: "#3a6080" }} /></button>
                    </div>
                    {/* Viajes del circuito */}
                    <div className="px-3 py-1.5" style={{ background: "#060d14", borderBottom: "1px solid #0d2035" }}>
                      <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>DETALLE POR DÍA</span>
                    </div>
                    {circ.viajes.map((v: any, i: number) => (
                      <div key={i} className="px-3 py-2.5 border-b" style={{ borderColor: "#0a1520" }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{v.patente}</span>
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{v.fecha}</span>
                          </div>
                          <span className="font-space text-[12px] font-bold" style={{ color: RC(parseFloat(v.rend_promedio || 0)) }}>{v.rend_promedio || "--"} km/L</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{v.km_total}km · {v.paradas} paradas · {v.horas_total}h</span>
                          {v.vel_max > 105 && <span className="font-exo text-[8px] font-bold" style={{ color: "#ff2244" }}>{v.vel_max}km/h</span>}
                        </div>
                        {v.hora_salida && <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>{v.hora_salida?.substring(11, 16)} → {v.hora_llegada?.substring(11, 16)} · {v.conductor?.split(",")[0] || ""}</div>}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            {/* COL 3: Camiones del contrato */}
            <div className="w-[30%] overflow-auto">
              <div className="px-3 py-2 sticky top-0 z-10" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
                <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: "#3a6080" }}>CAMIONES · {det?.camiones?.length || 0}</span>
              </div>
              {(det?.camiones || []).map((cam: any, i: number) => {
                const rend = parseFloat(cam.rend_promedio || 0); const pct = Math.min(100, (rend / 4.5) * 100);
                return (
                  <div key={cam.patente} className="flex items-center gap-2 px-3 py-2 border-b transition-all hover:bg-[rgba(255,255,255,0.02)]" style={{ borderColor: "#0a1520" }}>
                    <span className="font-space text-[11px] font-bold w-16" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
                    <div className="flex-1 h-1.5" style={{ background: "#0d2035", borderRadius: 2 }}><div className="h-full" style={{ width: `${pct}%`, background: RC(rend), borderRadius: 2 }} /></div>
                    <span className="font-space text-[11px] font-bold w-10 text-right" style={{ color: RC(rend) }}>{rend > 0 ? rend.toFixed(2) : "--"}</span>
                    <span className="font-exo text-[8px] w-8 text-right" style={{ color: "#3a6080" }}>{cam.viajes}v</span>
                    <span className="text-[9px] w-4">{cam.estado === "OK" ? "✅" : cam.estado === "CRITICO" ? "🔴" : "⚠️"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Control Center (alerts + speed + fuel deviations) ──
function MiniMapaGoogle({ lat, lng, titulo, velocidad }: { lat?: number; lng?: number; titulo: string; velocidad?: number }) {
  if (!lat || !lng) return <div className="flex items-center justify-center" style={{ height: 200, background: "#0a1520", borderRadius: 6 }}><span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin ubicación GPS</span></div>;
  return (
    <div style={{ height: 220, borderRadius: 6, overflow: "hidden", border: "1px solid #0d2035" }}>
      <APIProvider apiKey="AIzaSyC2Sq4RSutNYqwnAyykQau4meFMnmucTlc">
        <GMap defaultCenter={{ lat, lng }} defaultZoom={13} mapId="sotraser-alert" style={{ height: "100%", width: "100%" }} disableDefaultUI gestureHandling="greedy">
          <AdvancedMarker position={{ lat, lng }}>
            <div style={{ width: 24, height: 24, background: "#ff2244", border: "3px solid #fff", borderRadius: "50%", boxShadow: "0 0 12px #ff2244", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: "bold" }}>!</div>
          </AdvancedMarker>
        </GMap>
      </APIProvider>
    </div>
  );
}

function ControlCenter() {
  const { navigateTo } = useNavigation();
  const [subTab, setSubTab] = useState<"resumen" | "velocidad" | "combustible" | "historial">("resumen");
  const [selAlerta, setSelAlerta] = useState<any>(null);
  const { data: ubicAlerta } = useQuery<any>({ queryKey: ["/api/control/ubicacion-alerta", selAlerta?.patente, selAlerta?.tipo], queryFn: () => fetch(`/api/control/ubicacion-alerta?patente=${selAlerta.patente}&tipo=${selAlerta.tipo}`).then(r => r.json()), enabled: !!selAlerta });
  const { data: alertas } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], queryFn: () => fetch("/api/cerebro/camiones-alerta").then(r => r.json()), refetchInterval: 60000 });
  const { data: irregularidades } = useQuery<any>({ queryKey: ["/api/estaciones/irregularidades"], queryFn: () => fetch("/api/estaciones/irregularidades?dias=30").then(r => r.json()), staleTime: 5 * 60000 });
  const { data: anomalias } = useQuery<any>({ queryKey: ["/api/brain/anomalias-macro"], queryFn: () => fetch("/api/brain/anomalias-macro").then(r => r.json()), staleTime: 10 * 60000 });

  const excesos = alertas?.filter((a: any) => a.tipo === "VELOCIDAD") || [];
  const sinGps = alertas?.filter((a: any) => a.tipo === "SIN_GPS") || [];
  const irregResumen = irregularidades?.resumen || {};
  const anomaliasArr = anomalias?.anomalias || anomalias || [];

  const SUB_TABS = [
    { id: "resumen", label: "RESUMEN", count: (excesos.length + (irregResumen.total || 0) + (Array.isArray(anomaliasArr) ? anomaliasArr.length : 0)) },
    { id: "velocidad", label: "VELOCIDAD", count: excesos.length },
    { id: "combustible", label: "COMBUSTIBLE", count: irregResumen.total || 0 },
    { id: "historial", label: "HISTORIAL", count: 0 },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "EXCESO\nVELOCIDAD", value: excesos.length, color: "#ff2244" },
          { label: "DESVIACIÓN\nCOMBUSTIBLE", value: irregResumen.total || 0, color: "#ff6b35" },
          { label: "RUTA\nANÓMALA", value: Array.isArray(anomaliasArr) ? anomaliasArr.length : 0, color: "#ffcc00" },
          { label: "SIN GPS\n>2 HORAS", value: sinGps.length, color: "#3a6080" },
          { label: "TOTAL\nALERTAS", value: (excesos.length + (irregResumen.total || 0) + sinGps.length), color: "#ff2244" },
        ].map(k => (
          <div key={k.label} className="px-3 py-3 text-center" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.color}` }}>
            <div className="font-space text-[24px] font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="font-exo text-[7px] tracking-wider uppercase whitespace-pre-line" style={{ color: "#3a6080" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id as any)}
            className="px-4 py-2 font-exo text-[10px] font-bold tracking-wider cursor-pointer transition-all"
            style={{ background: subTab === t.id ? "#ff224415" : "transparent", border: `1px solid ${subTab === t.id ? "#ff224440" : "#0d2035"}`, borderTop: subTab === t.id ? "2px solid #ff2244" : "2px solid transparent", color: subTab === t.id ? "#ff2244" : "#3a6080" }}>
            {t.label} {t.count > 0 && <span className="ml-1 px-1.5 py-0.5 text-[8px]" style={{ background: "#ff224420", borderRadius: 3 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === "resumen" && (
        <div className="space-y-2">
          {excesos.slice(0, 5).map((a: any, i: number) => (
            <div key={`vel-${i}`} onClick={() => setSelAlerta({ ...a, tipo: "VELOCIDAD" })} className="flex items-center justify-between px-4 py-3 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: "3px solid #ff2244", borderRadius: "0 6px 6px 0" }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[8px] px-1.5 py-0.5 font-bold" style={{ color: "#ff2244", background: "#ff224415", borderRadius: 3 }}>VELOCIDAD</span>
                  <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{a.contrato}</span>
                </div>
                <div className="font-exo text-[10px] mt-1" style={{ color: "#c8e8ff" }}>{a.descripcion}</div>
                {a.conductor && <div className="font-exo text-[9px] mt-0.5" style={{ color: "#3a6080" }}>Conductor: {a.conductor}</div>}
              </div>
              <span className="font-space text-[16px] font-bold" style={{ color: "#ff2244" }}>{a.dato}</span>
            </div>
          ))}
          {Array.isArray(anomaliasArr) && anomaliasArr.slice(0, 3).map((a: any, i: number) => (
            <div key={`anom-${i}`} className="flex items-center justify-between px-4 py-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: "3px solid #ffcc00", borderRadius: "0 6px 6px 0" }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[8px] px-1.5 py-0.5 font-bold" style={{ color: "#ffcc00", background: "#ffcc0015", borderRadius: 3 }}>{a.tipo === "RUTA_ANOMALA" ? "RUTA" : "VELOCIDAD"}</span>
                  <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{a.contrato}</span>
                </div>
                <div className="font-exo text-[10px] mt-1" style={{ color: "#c8e8ff" }}>
                  {a.detalle?.destino_habitual && `Habitual: ${a.detalle.destino_habitual} → Hoy: ${a.detalle.destino_actual}`}
                  {a.detalle?.vel_hoy && `Velocidad hoy: ${a.detalle.vel_hoy}km/h vs histórico ${a.detalle.vel_historica}km/h (${a.detalle.diff_pct}%)`}
                </div>
              </div>
              <button onClick={() => navigateTo("camiones", a.patente)} className="px-2 py-1 font-exo text-[8px] cursor-pointer" style={{ color: "#ffcc00", border: "1px solid #ffcc0030", borderRadius: 3 }}>VER FICHA</button>
            </div>
          ))}
        </div>
      )}

      {subTab === "velocidad" && (
        <div className="space-y-2">
          {excesos.length === 0 && <div className="text-center py-8 font-exo text-[11px]" style={{ color: "#3a6080" }}>Sin excesos de velocidad hoy</div>}
          {excesos.map((a: any, i: number) => (
            <div key={i} onClick={() => setSelAlerta({ ...a, tipo: "VELOCIDAD" })} className="flex items-center justify-between px-4 py-3 cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: "3px solid #ff2244", borderRadius: "0 6px 6px 0" }}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-space text-[13px] font-bold" style={{ color: "#ff2244" }}>{a.dato}</span>
                  <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{a.contrato}</span>
                </div>
                <div className="font-exo text-[10px] mt-1" style={{ color: "#c8e8ff" }}>{a.descripcion}</div>
                {a.conductor && <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Conductor: {a.conductor}</div>}
              </div>
              <span className="font-space text-[18px] font-bold" style={{ color: "#ff2244" }}>{a.dato}</span>
            </div>
          ))}
        </div>
      )}

      {subTab === "combustible" && (
        <div className="space-y-2">
          {!irregularidades && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: "#3a6080" }} /></div>}
          {irregularidades && Object.entries(irregularidades.irregularidades || {}).map(([tipo, items]: [string, any]) => (
            Array.isArray(items) && items.slice(0, 5).map((ir: any, i: number) => (
              <div key={`${tipo}-${i}`} className="flex items-center justify-between px-4 py-3" style={{ background: "#060d14", border: "1px solid #0d2035", borderLeft: "3px solid #ff6b35", borderRadius: "0 6px 6px 0" }}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-exo text-[8px] px-1.5 py-0.5 font-bold" style={{ color: "#ff6b35", background: "#ff6b3515", borderRadius: 3 }}>{tipo.toUpperCase().replace(/_/g, " ")}</span>
                    <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{ir.patente}</span>
                  </div>
                  <div className="font-exo text-[10px] mt-1" style={{ color: "#c8e8ff" }}>
                    {ir.km_ant && `km: ${Math.round(ir.km_ant)} → ${Math.round(ir.km_act)}`}
                    {ir.litros && ` · ${ir.litros}lt`}
                    {ir.estacion && ` · ${ir.estacion}`}
                  </div>
                </div>
                <button onClick={() => navigateTo("camiones", ir.patente)} className="px-2 py-1 font-exo text-[8px] cursor-pointer" style={{ color: "#06b6d4", border: "1px solid #06b6d430", borderRadius: 3 }}>FICHA</button>
              </div>
            ))
          ))}
        </div>
      )}

      {subTab === "historial" && (
        <div className="text-center py-12 font-exo text-[11px]" style={{ color: "#3a6080" }}>
          Historial de alertas gestionadas — próximamente
        </div>
      )}

      {/* Panel detalle alerta */}
      {selAlerta && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="flex-1" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setSelAlerta(null)} />
          <div className="w-[400px] overflow-y-auto" style={{ background: "#060d14", borderLeft: "1px solid #0d2035" }}>
            <div className="px-4 py-3 flex items-center justify-between sticky top-0 z-10" style={{ background: "#060d14", borderBottom: "1px solid #0d2035" }}>
              <div className="flex items-center gap-2">
                <span className="font-exo text-[8px] font-bold px-2 py-1" style={{ color: "#ff2244", background: "#ff224415", borderRadius: 4 }}>{selAlerta.tipo}</span>
                <span className="font-space text-[14px] font-bold" style={{ color: "#c8e8ff" }}>{selAlerta.patente}</span>
              </div>
              <button onClick={() => setSelAlerta(null)} className="cursor-pointer"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
            </div>

            <div className="p-4 space-y-4">
              {/* Mini mapa Google */}
              <MiniMapaGoogle lat={ubicAlerta?.lat} lng={ubicAlerta?.lng} titulo={selAlerta.patente} velocidad={selAlerta.tipo === "VELOCIDAD" ? parseFloat(selAlerta.dato) : undefined} />

              {/* Detalle */}
              <div className="space-y-2">
                {selAlerta.tipo === "VELOCIDAD" && (
                  <>
                    <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Velocidad máxima</span>
                      <span className="font-space text-[14px] font-bold" style={{ color: "#ff2244" }}>{selAlerta.dato}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Límite</span>
                      <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>105 km/h</span>
                    </div>
                    {ubicAlerta?.velocidad && (
                      <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Exceso</span>
                        <span className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>+{Math.round(ubicAlerta.velocidad - 105)} km/h</span>
                      </div>
                    )}
                    {ubicAlerta?.hora && (
                      <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Hora</span>
                        <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{ubicAlerta.hora.substring(0, 19)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Contrato</span>
                  <span className="font-exo text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{selAlerta.contrato}</span>
                </div>
                {selAlerta.conductor && (
                  <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Conductor</span>
                    <span className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{selAlerta.conductor}</span>
                  </div>
                )}
                {ubicAlerta?.lat && (
                  <div className="flex justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Coordenadas</span>
                    <a href={`https://www.google.com/maps?q=${ubicAlerta.lat},${ubicAlerta.lng}`} target="_blank" rel="noopener" className="font-space text-[10px]" style={{ color: "#00d4ff" }}>{ubicAlerta.lat.toFixed(4)}, {ubicAlerta.lng.toFixed(4)}</a>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                <button onClick={() => { setFocoAlerta({ ...selAlerta, lat: ubicAlerta?.lat, lng: ubicAlerta?.lng, velocidad: ubicAlerta?.velocidad, hora: ubicAlerta?.hora }); setSelAlerta(null); setTab("foco"); }}
                  className="flex-1 py-2.5 font-exo text-[10px] font-bold cursor-pointer text-center" style={{ color: "#fff", background: "#ff2244", borderRadius: 6 }}>VER EN MAPA</button>
                <button onClick={() => { navigateTo("camiones", selAlerta.patente); setSelAlerta(null); }}
                  className="flex-1 py-2.5 font-exo text-[10px] font-bold cursor-pointer text-center" style={{ color: "#06b6d4", border: "1px solid #06b6d430", borderRadius: 6 }}>VER FICHA</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sistema ──
function SistemaTab() {
  const { data: estado } = useQuery<any>({ queryKey: ["/api/brain/estado-sistema"], queryFn: () => fetch("/api/brain/estado-sistema").then(r => r.json()), refetchInterval: 60000 });
  const { data: matching } = useQuery<any>({ queryKey: ["/api/cruzado/resumen"], queryFn: () => fetch("/api/cruzado/resumen").then(r => r.json()), staleTime: 5 * 60000 });
  const { data: sistemaEstado } = useQuery<any>({ queryKey: ["/api/sistema/estado"], queryFn: () => fetch("/api/sistema/estado").then(r => r.json()), staleTime: 60000 });
  const { data: comparacion } = useQuery<any>({ queryKey: ["/api/brain/comparacion-fuentes"], queryFn: () => fetch("/api/brain/comparacion-fuentes").then(r => r.json()), staleTime: 10 * 60000 });
  const { data: geocercasData, refetch: refetchGeo } = useQuery<any>({ queryKey: ["/api/viajes-tms/geocercas"], queryFn: () => fetch("/api/viajes-tms/geocercas").then(r => r.json()), staleTime: 60000 });
  const { data: puntosDesc, refetch: refetchPuntos } = useQuery<any>({ queryKey: ["/api/viajes-tms/puntos-desconocidos"], queryFn: () => fetch("/api/viajes-tms/puntos-desconocidos").then(r => r.json()), staleTime: 60000 });
  const [geoFilter, setGeoFilter] = useState("activas");
  const [geoSearch, setGeoSearch] = useState("");

  const statusColor = (s: string) => s === "OK" ? "#00ff88" : s === "LENTO" ? "#ffcc00" : "#ff2244";
  const precColor = (p: string) => p === "EXCELENTE" ? "#00ff88" : p === "BUENA" ? "#00d4ff" : p === "ACEPTABLE" ? "#ffcc00" : "#ff2244";

  const toggleGeocerca = async (id: number) => {
    await fetch(`/api/viajes-tms/geocercas/${id}/toggle`, { method: "POST" });
    refetchGeo();
  };
  const renameGeocerca = async (id: number) => {
    const nombre = prompt("Nuevo nombre:");
    if (!nombre) return;
    await fetch(`/api/viajes-tms/geocercas/${id}/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
    refetchGeo();
  };

  const [geoSugerencias, setGeoSugerencias] = useState<{ lat: number; lng: number; sugerencias: any[] } | null>(null);

  const autoGeocode = async (lat: number, lng: number) => {
    const r = await fetch("/api/viajes-tms/auto-geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
    const d = await r.json();
    if (d.sugerencias?.length > 0) {
      setGeoSugerencias({ lat, lng, sugerencias: d.sugerencias });
    } else if (d.nombre) {
      const confirmar = confirm(`Google Maps sugiere: "${d.nombre}"\n\n¿Crear geocerca?`);
      if (confirmar) {
        await fetch("/api/viajes-tms/georefernciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng, nombre: d.nombre }) });
        refetchPuntos(); refetchGeo();
      }
    } else { alert("No se pudo geocodificar"); }
  };

  const geoManual = async (lat: number, lng: number) => {
    // First get Google suggestions
    const r = await fetch("/api/viajes-tms/auto-geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
    const d = await r.json();
    if (d.sugerencias?.length > 0) {
      setGeoSugerencias({ lat, lng, sugerencias: d.sugerencias });
    } else {
      const nombre = prompt(`Punto: ${lat.toFixed(3)}, ${lng.toFixed(3)}\n\nNo hay sugerencias. Ingresa el nombre manualmente:`);
      if (!nombre) return;
      await fetch("/api/viajes-tms/georefernciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng, nombre }) });
      refetchPuntos(); refetchGeo();
    }
  };

  const seleccionarSugerencia = async (nombre: string) => {
    if (!geoSugerencias) return;
    await fetch("/api/viajes-tms/georefernciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: geoSugerencias.lat, lng: geoSugerencias.lng, nombre }) });
    setGeoSugerencias(null);
    refetchPuntos(); refetchGeo();
  };

  const geoNombreCustom = async () => {
    if (!geoSugerencias) return;
    const nombre = prompt("Nombre personalizado:");
    if (!nombre) return;
    await fetch("/api/viajes-tms/georefernciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: geoSugerencias.lat, lng: geoSugerencias.lng, nombre }) });
    setGeoSugerencias(null);
    refetchPuntos(); refetchGeo();
  };

  const filteredGeo = useMemo(() => {
    if (!geocercasData?.geocercas) return [];
    let list = geocercasData.geocercas;
    if (geoFilter === "activas") list = list.filter((g: any) => g.activa);
    if (geoFilter === "inactivas") list = list.filter((g: any) => !g.activa);
    if (geoFilter === "bases") list = list.filter((g: any) => g.nivel === 1 && g.activa);
    if (geoSearch) { const s = geoSearch.toLowerCase(); list = list.filter((g: any) => g.nombre?.toLowerCase().includes(s) || g.contrato?.toLowerCase().includes(s)); }
    return list;
  }, [geocercasData, geoFilter, geoSearch]);

  return (
    <div className="space-y-4">
      {/* Syncs */}
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>FUENTES DE DATOS</span>
        </div>
        <div className="p-4 space-y-3">
          {estado && [
            { name: "Volvo Connect", status: estado.volvo?.estado, ago: estado.volvo?.hace_minutos + " min", detail: `${estado.volvo?.vins_activos} VINs` },
            { name: "WiseTrack GPS", status: estado.ultimo_sync_volvo ? "OK" : "FALLO", ago: "-", detail: "477 vehículos" },
            { name: "Sigetra Cargas", status: estado.sigetra?.estado, ago: estado.sigetra?.hace_minutos + " min", detail: "816 patentes" },
          ].map(s => (
            <div key={s.name} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 6 }}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{ background: statusColor(s.status), boxShadow: `0 0 6px ${statusColor(s.status)}` }} />
                <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{s.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{s.detail}</span>
                <span className="font-space text-[10px]" style={{ color: statusColor(s.status) }}>{s.ago}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Matching */}
      {matching && (
        <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>MATCHING 3 FUENTES</span>
          </div>
          <div className="p-4 grid grid-cols-4 gap-3">
            {[
              { label: "EN 3 SISTEMAS", value: matching.camiones_3_sistemas, color: "#00ff88" },
              { label: "VOLVO TOTAL", value: matching.volvo_total, color: "#00d4ff" },
              { label: "WISETRACK", value: matching.wt_total, color: "#10b981" },
              { label: "SIGETRA", value: matching.sig_total, color: "#ff6b35" },
            ].map(k => (
              <div key={k.label} className="text-center px-3 py-3" style={{ background: "#0a1520", borderRadius: 6, borderTop: `2px solid ${k.color}` }}>
                <div className="font-space text-[20px] font-bold" style={{ color: k.color }}>{k.value}</div>
                <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sistema estado */}
      {sistemaEstado && (
        <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#3a6080" }}>MOTOR DE APRENDIZAJE</span>
          </div>
          <div className="p-4 grid grid-cols-5 gap-3">
            {[
              { label: "DÍAS", value: sistemaEstado.dias_aprendiendo },
              { label: "VIAJES", value: sistemaEstado.total_viajes_procesados },
              { label: "CORREDORES", value: sistemaEstado.total_corredores_conocidos },
              { label: "CONDUCTORES", value: sistemaEstado.total_conductores_analizados },
              { label: "MADUREZ", value: `${sistemaEstado.madurez_pct}%` },
            ].map(k => (
              <div key={k.label} className="text-center px-2 py-2" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{k.value}</div>
                <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard explicativo */}
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>COMO FUNCIONA EL SISTEMA</span>
        </div>
        <div className="p-4 space-y-4">
          {/* Flujo de datos */}
          <div className="space-y-3">
            <div className="font-exo text-[10px] font-bold tracking-wider uppercase" style={{ color: "#3a6080" }}>FUENTES DE DATOS (entrada)</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderLeft: "3px solid #00d4ff" }}>
                <div className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>VOLVO CONNECT</div>
                <div className="font-exo text-[9px] mt-1 space-y-1" style={{ color: "#4a7090" }}>
                  <div>API oficial Volvo RFMS</div>
                  <div>Sync cada 90 segundos</div>
                  <div>Datos: GPS, velocidad, odometro, combustible consumido, distancia total</div>
                  <div>Solo camiones Volvo con VIN registrado</div>
                  <div style={{ color: "#00ff88" }}>100 VINs activos · datos ECU precisos</div>
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderLeft: "3px solid #10b981" }}>
                <div className="font-space text-[11px] font-bold" style={{ color: "#10b981" }}>WISETRACK GPS</div>
                <div className="font-exo text-[9px] mt-1 space-y-1" style={{ color: "#4a7090" }}>
                  <div>Scraping portal telemetria.wisetrack.cl</div>
                  <div>Sync cada 90 segundos</div>
                  <div>Datos: GPS, velocidad, RPM, temperatura motor, nivel estanque, conductor</div>
                  <div>Toda la flota Sotraser + subcontratos</div>
                  <div style={{ color: "#10b981" }}>477 vehiculos · 39 contratos</div>
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderLeft: "3px solid #ff6b35" }}>
                <div className="font-space text-[11px] font-bold" style={{ color: "#ff6b35" }}>SIGETRA CARGAS</div>
                <div className="font-exo text-[9px] mt-1 space-y-1" style={{ color: "#4a7090" }}>
                  <div>API Sigetra combustible</div>
                  <div>Sync cada 1 hora</div>
                  <div>Datos: litros cargados, estacion, km odometro, conductor, guia</div>
                  <div>Todas las cargas de combustible de la empresa</div>
                  <div style={{ color: "#ff6b35" }}>816 patentes · 106 estaciones</div>
                </div>
              </div>
            </div>
          </div>

          {/* Procesamiento */}
          <div className="space-y-3">
            <div className="font-exo text-[10px] font-bold tracking-wider uppercase" style={{ color: "#3a6080" }}>PROCESAMIENTO (que hace el sistema)</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[10px] font-bold mb-1" style={{ color: "#a855f7" }}>GPS UNIFICADO</div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                  Fusiona Volvo + WiseTrack en una sola tabla. Prioriza Volvo cuando tiene senal reciente (&lt;30min). Si no, usa WiseTrack. Deduplicacion por hash (1 punto por camion por minuto). 581 camiones unicos.
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[10px] font-bold mb-1" style={{ color: "#a855f7" }}>DETECCION DE VIAJES</div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                  Analiza puntos GPS consecutivos. Cuando un camion se mueve &gt;20km entre paradas de &gt;10min, se crea un viaje. Busca origen/destino en 209 geocercas operacionales. Calcula km, rendimiento, duracion.
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[10px] font-bold mb-1" style={{ color: "#a855f7" }}>GEOCERCAS INTELIGENTES</div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                  209 zonas operacionales detectadas automaticamente desde patrones reales de parada. 26 confirmadas manualmente (minas, plantas, CDs). Radio 1-3km segun tipo. Minimo 10 minutos dentro para validar. Se actualizan solas con nueva data.
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[10px] font-bold mb-1" style={{ color: "#a855f7" }}>MATCHING IDENTIDADES</div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                  Tabla camion_identidades vincula patentes numericas (Volvo) con alfanumericas (Sigetra/WiseTrack). Ejemplo: 1614 = KZZX38 (mismo camion). 176 VINs con multiples IDs. Permite cruzar datos de las 3 fuentes sin duplicados.
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[10px] font-bold mb-1" style={{ color: "#a855f7" }}>CORREDORES OPERACIONALES</div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                  Agrupa viajes similares (mismo origen/destino, mismo contrato) en corredores. Calcula rendimiento promedio, km promedio, desviacion tipica. Se usa para detectar anomalias (viaje fuera del corredor habitual).
                </div>
              </div>
              <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[10px] font-bold mb-1" style={{ color: "#a855f7" }}>CUADRATURA SIGETRA</div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>
                  Cruza viajes GPS con cargas Sigetra. Para cada par de cargas (A y B) calcula km reales vs km declarados, litros consumidos vs cargados. Detecta desviaciones de combustible y errores de digitacion de km.
                </div>
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="space-y-3">
            <div className="font-exo text-[10px] font-bold tracking-wider uppercase" style={{ color: "#3a6080" }}>SALIDAS (que se muestra)</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { tab: "FLOTA", desc: "Mapa en vivo 581 camiones, estado, posicion, velocidad" },
                { tab: "VIAJES", desc: "Viajes por dia/mes, ranking km/L, alertas rendimiento" },
                { tab: "CONTRATOS", desc: "KPIs por faena, tendencias, top/bottom camiones" },
                { tab: "COMBUSTIBLE", desc: "Estaciones, cargas, irregularidades, gestion fraude" },
                { tab: "CAMIONES", desc: "Ficha completa: calendario, cargas, conductores, 3 fuentes" },
                { tab: "CONTROL", desc: "Alertas velocidad, desviaciones combustible, rutas anomalas" },
                { tab: "BRAIN", desc: "Chat IA con datos reales, predicciones, anomalias macro" },
                { tab: "SISTEMA", desc: "Esta pagina - estado syncs, matching, motor aprendizaje" },
              ].map(t => (
                <div key={t.tab} className="p-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                  <div className="font-space text-[9px] font-bold" style={{ color: "#00d4ff" }}>{t.tab}</div>
                  <div className="font-exo text-[8px]" style={{ color: "#4a7090" }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Diagrama flujo simple */}
          <div className="p-3 text-center" style={{ background: "#0a1520", borderRadius: 6 }}>
            <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#3a6080" }}>FLUJO DE DATOS</div>
            <div className="font-space text-[10px] leading-relaxed" style={{ color: "#c8e8ff" }}>
              <span style={{ color: "#00d4ff" }}>VOLVO API</span> + <span style={{ color: "#10b981" }}>WISETRACK</span> + <span style={{ color: "#ff6b35" }}>SIGETRA</span>
              <br />
              <span style={{ color: "#3a6080" }}>cada 90s &nbsp;&nbsp;&nbsp; cada 90s &nbsp;&nbsp;&nbsp; cada 1h</span>
              <br />
              <span style={{ color: "#3a6080" }}>↓ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ↓ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ↓</span>
              <br />
              <span style={{ color: "#a855f7" }}>GPS UNIFICADO</span> (581 camiones, prioridad Volvo)
              <br />
              <span style={{ color: "#3a6080" }}>↓</span>
              <br />
              <span style={{ color: "#a855f7" }}>MOTOR VIAJES</span> (detecta inicio/fin, geocercas, km/L)
              <br />
              <span style={{ color: "#3a6080" }}>↓</span>
              <br />
              <span style={{ color: "#a855f7" }}>CORREDORES + CUADRATURA</span> (agrupa rutas, cruza Sigetra)
              <br />
              <span style={{ color: "#3a6080" }}>↓</span>
              <br />
              <span style={{ color: "#00ff88" }}>APP</span> (7 tabs con datos en tiempo real)
            </div>
          </div>
        </div>
      </div>

      {/* Snapshots en tiempo real */}
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00ff88" }}>SNAPSHOTS EN TIEMPO REAL</span>
          <span className="font-exo text-[9px] ml-3" style={{ color: "#3a6080" }}>Cada punto GPS capturado se guarda como snapshot. Es la base de todo el sistema.</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderLeft: "3px solid #00d4ff" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>VOLVO CONNECT</span>
                <span className="font-exo text-[8px]" style={{ color: estado?.volvo?.estado === "OK" ? "#00ff88" : "#ffcc00" }}>{estado?.volvo?.estado || "?"}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Snapshots totales</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>22,076</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>VINs activos</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{estado?.volvo?.vins_activos || 100}</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Frecuencia</span><span className="font-exo text-[9px]" style={{ color: "#00d4ff" }}>cada 90 seg</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Ultimo sync</span><span className="font-exo text-[9px]" style={{ color: "#00ff88" }}>{estado?.volvo?.hace_minutos || "?"} min</span></div>
                <div className="font-exo text-[7px] mt-1" style={{ color: "#3a6080" }}>Captura: fuel_used, distance, lat, lng, speed, heading, odometer, fuel_level</div>
              </div>
            </div>
            <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderLeft: "3px solid #10b981" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-space text-[10px] font-bold" style={{ color: "#10b981" }}>WISETRACK GPS</span>
                <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>OK</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Snapshots totales</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>252,394</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Vehiculos</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>477</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Frecuencia</span><span className="font-exo text-[9px]" style={{ color: "#10b981" }}>cada 5 min</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Contratos</span><span className="font-exo text-[9px]" style={{ color: "#10b981" }}>39 faenas</span></div>
                <div className="font-exo text-[7px] mt-1" style={{ color: "#3a6080" }}>Captura: lat, lng, vel, rumbo, RPM, temp_motor, nivel_estanque, conductor, km_total, consumo</div>
              </div>
            </div>
            <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderLeft: "3px solid #ff6b35" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-space text-[10px] font-bold" style={{ color: "#ff6b35" }}>SIGETRA CARGAS</span>
                <span className="font-exo text-[8px]" style={{ color: estado?.sigetra?.estado === "OK" ? "#00ff88" : "#ffcc00" }}>{estado?.sigetra?.estado || "?"}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Cargas totales</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>13,510</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Patentes</span><span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>817</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Frecuencia</span><span className="font-exo text-[9px]" style={{ color: "#ff6b35" }}>cada 1 hora</span></div>
                <div className="flex justify-between"><span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Estaciones</span><span className="font-exo text-[9px]" style={{ color: "#ff6b35" }}>106</span></div>
                <div className="font-exo text-[7px] mt-1" style={{ color: "#3a6080" }}>Captura: litros, km_anterior, km_actual, conductor, proveedor, guia, faena, rend_real</div>
              </div>
            </div>
          </div>

          {/* GPS Unificado */}
          <div className="p-3" style={{ background: "#0a1520", borderRadius: 6, borderTop: "2px solid #a855f7" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-space text-[10px] font-bold" style={{ color: "#a855f7" }}>GPS UNIFICADO (tabla maestra)</span>
              <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>ACTIVO</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center"><div className="font-space text-[18px] font-bold" style={{ color: "#a855f7" }}>420,294</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>REGISTROS TOTALES</div></div>
              <div className="text-center"><div className="font-space text-[18px] font-bold" style={{ color: "#c8e8ff" }}>581</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>CAMIONES UNICOS</div></div>
              <div className="text-center"><div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}>Volvo</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>PRIORIDAD SI &lt;30min</div></div>
              <div className="text-center"><div className="font-space text-[18px] font-bold" style={{ color: "#10b981" }}>WT</div><div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>FALLBACK</div></div>
            </div>
            <div className="font-exo text-[8px] mt-2" style={{ color: "#3a6080" }}>
              Fusiona ambas fuentes GPS. Deduplicacion por hash (1 punto/camion/minuto). Vista ultima_posicion_camion da la mejor posicion disponible para cada camion. Alimenta el mapa de FLOTA (581 camiones) y el motor de viajes.
            </div>
          </div>

          {/* Pipeline */}
          <div className="p-3" style={{ background: "#0a1520", borderRadius: 6 }}>
            <div className="font-exo text-[9px] font-bold mb-2" style={{ color: "#3a6080" }}>PIPELINE DE PROCESAMIENTO</div>
            <div className="grid grid-cols-6 gap-1 text-center">
              {[
                { label: "SNAPSHOT", desc: "GPS raw", color: "#00d4ff", n: "420K" },
                { label: "VIAJES", desc: "Detectados", color: "#00ff88", n: "3,344+3,215" },
                { label: "GEOCERCAS", desc: "5 niveles", color: "#a855f7", n: "248" },
                { label: "CORREDORES", desc: "Rutas agrupadas", color: "#ffcc00", n: "919" },
                { label: "CUADRATURA", desc: "Cruce Sigetra", color: "#ff6b35", n: "243 ops" },
                { label: "KPIs", desc: "Dashboard", color: "#00ffcc", n: "7 tabs" },
              ].map(s => (
                <div key={s.label} className="p-2" style={{ background: "#060d14", borderRadius: 4, borderTop: `2px solid ${s.color}` }}>
                  <div className="font-space text-[10px] font-bold" style={{ color: s.color }}>{s.n}</div>
                  <div className="font-exo text-[7px] font-bold" style={{ color: s.color }}>{s.label}</div>
                  <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Puntos desconocidos — para georeferenciación */}
      {puntosDesc && puntosDesc.total > 0 && (
        <div style={{ background: "#060d14", border: "1px solid #ff6b3530", borderLeft: "3px solid #ff6b35", borderRadius: 8 }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4" style={{ color: "#ff6b35" }} />
              <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>PUNTOS SIN GEOCERCA</span>
              <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{puntosDesc.total} puntos donde camiones paran pero no tienen nombre</span>
            </div>
          </div>
          <div className="p-3 space-y-1">
            {puntosDesc.puntos.slice(0, 20).map((p: any, i: number) => (
              <div key={`${p.lat}-${p.lng}-${i}`} className="flex items-center justify-between px-3 py-2" style={{ background: "#0a1520", borderRadius: 4 }}>
                <div className="flex items-center gap-3">
                  <span className="font-exo text-[8px] font-bold px-1.5 py-0.5" style={{ color: p.tipo === "ORIGEN" ? "#00d4ff" : "#a855f7", background: p.tipo === "ORIGEN" ? "#00d4ff12" : "#a855f712", borderRadius: 3 }}>{p.tipo}</span>
                  <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{p.lat.toFixed(3)}, {p.lng.toFixed(3)}</span>
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{p.veces}x · {p.camiones} cam · {p.contratos?.substring(0, 25)}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => autoGeocode(p.lat, p.lng)} className="px-2 py-1 font-exo text-[8px] font-bold cursor-pointer" style={{ color: "#00d4ff", border: "1px solid #00d4ff30", borderRadius: 3 }}>AUTO</button>
                  <button onClick={() => geoManual(p.lat, p.lng)} className="px-2 py-1 font-exo text-[8px] font-bold cursor-pointer" style={{ color: "#00ff88", border: "1px solid #00ff8830", borderRadius: 3 }}>MANUAL</button>
                  <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener" className="px-2 py-1 font-exo text-[8px] font-bold" style={{ color: "#ffcc00", border: "1px solid #ffcc0030", borderRadius: 3 }}>MAPS</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel de sugerencias Google Maps */}
      {geoSugerencias && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-[500px]" style={{ background: "#060d14", border: "1px solid #00d4ff40", borderRadius: 12 }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
              <div>
                <div className="font-space text-[13px] font-bold" style={{ color: "#00d4ff" }}>GOOGLE MAPS SUGIERE</div>
                <div className="font-exo text-[9px] mt-0.5" style={{ color: "#3a6080" }}>Punto: {geoSugerencias.lat.toFixed(3)}, {geoSugerencias.lng.toFixed(3)}</div>
              </div>
              <button onClick={() => setGeoSugerencias(null)} className="cursor-pointer p-1"><X className="w-4 h-4" style={{ color: "#3a6080" }} /></button>
            </div>
            <div className="p-4 space-y-2">
              {geoSugerencias.sugerencias.map((s: any, i: number) => {
                const confColor = s.confianza >= 90 ? "#00ff88" : s.confianza >= 70 ? "#00d4ff" : s.confianza >= 50 ? "#ffcc00" : "#3a6080";
                return (
                  <button key={i} onClick={() => seleccionarSugerencia(s.nombre)}
                    className="w-full text-left p-3 cursor-pointer transition-all hover:scale-[1.01]"
                    style={{ background: "#0a1520", border: `1px solid ${i === 0 ? "#00d4ff30" : "#0d2035"}`, borderLeft: `3px solid ${confColor}`, borderRadius: 6 }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-exo text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{s.nombre}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-space text-[12px] font-bold" style={{ color: confColor }}>{s.confianza}%</span>
                        <span className="font-exo text-[7px] px-1.5 py-0.5" style={{ color: confColor, background: `${confColor}15`, borderRadius: 3 }}>{s.tipo_precision}</span>
                      </div>
                    </div>
                    <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{s.address?.substring(0, 80)}</div>
                  </button>
                );
              })}
              <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                <button onClick={geoNombreCustom} className="flex-1 py-2 font-exo text-[10px] font-bold cursor-pointer text-center" style={{ color: "#ffcc00", border: "1px solid #ffcc0030", borderRadius: 6 }}>NOMBRE PERSONALIZADO</button>
                <a href={`https://www.google.com/maps?q=${geoSugerencias.lat},${geoSugerencias.lng}`} target="_blank" rel="noopener"
                  className="px-4 py-2 font-exo text-[10px] font-bold text-center" style={{ color: "#00d4ff", border: "1px solid #00d4ff30", borderRadius: 6 }}>VER EN MAPS</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gestión de geocercas */}
      <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="flex items-center gap-3">
            <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#a855f7" }}>GEOCERCAS OPERACIONALES</span>
            <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{geocercasData?.activas || 0} activas · {geocercasData?.inactivas || 0} inactivas</span>
          </div>
          <div className="flex gap-1">
            {[{ id: "activas", l: "ACTIVAS" }, { id: "bases", l: "BASES" }, { id: "inactivas", l: "INACTIVAS" }, { id: "todas", l: "TODAS" }].map(f => (
              <button key={f.id} onClick={() => setGeoFilter(f.id)} className="px-2 py-1 font-exo text-[8px] font-bold cursor-pointer"
                style={{ color: geoFilter === f.id ? "#a855f7" : "#3a6080", background: geoFilter === f.id ? "#a855f710" : "transparent", border: `1px solid ${geoFilter === f.id ? "#a855f730" : "#0d2035"}`, borderRadius: 3 }}>{f.l}</button>
            ))}
          </div>
        </div>
        <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
          <input value={geoSearch} onChange={e => setGeoSearch(e.target.value)} placeholder="Buscar geocerca por nombre o contrato..."
            className="w-full px-3 py-1.5 font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 4, color: "#c8e8ff" }} />
        </div>
        <div className="overflow-auto" style={{ maxHeight: "400px" }}>
          <table className="w-full">
            <thead className="sticky top-0 z-10"><tr style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
              {["NOMBRE", "LAT/LNG", "RADIO", "TIPO", "NIVEL", "CONTRATO", "CONF.", "ACCIONES"].map(h => (
                <th key={h} className="px-2 py-1.5 text-left font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filteredGeo.map((g: any) => (
                <tr key={g.id} style={{ borderBottom: "1px solid #0a1520", opacity: g.activa ? 1 : 0.4 }}>
                  <td className="px-2 py-1.5 font-exo text-[10px] font-bold" style={{ color: g.activa ? "#c8e8ff" : "#3a6080", maxWidth: "200px" }}>{g.nombre?.substring(0, 35)}</td>
                  <td className="px-2 py-1.5 font-space text-[8px]" style={{ color: "#3a6080" }}>{g.lat?.toFixed(3)}, {g.lng?.toFixed(3)}</td>
                  <td className="px-2 py-1.5 font-space text-[10px]" style={{ color: g.radio_metros > 1000 ? "#ffcc00" : "#c8e8ff" }}>{g.radio_metros}m</td>
                  <td className="px-2 py-1.5"><span className="font-exo text-[7px] px-1.5 py-0.5" style={{ color: "#3a6080", background: "#0a1520", borderRadius: 3 }}>{g.tipo}</span></td>
                  <td className="px-2 py-1.5 font-space text-[10px]" style={{ color: g.nivel === 1 ? "#00d4ff" : "#3a6080" }}>{g.nivel === 1 ? "BASE" : "50m"}</td>
                  <td className="px-2 py-1.5 font-exo text-[8px]" style={{ color: "#3a6080" }}>{g.contrato?.substring(0, 12) || "-"}</td>
                  <td className="px-2 py-1.5"><span className="font-exo text-[7px]" style={{ color: g.confirmada ? "#00ff88" : g.confianza === "ALTA" ? "#00d4ff" : "#3a6080" }}>{g.confirmada ? "MANUAL" : g.confianza}</span></td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <button onClick={() => toggleGeocerca(g.id)} className="px-1.5 py-0.5 font-exo text-[7px] cursor-pointer" style={{ color: g.activa ? "#ff2244" : "#00ff88", border: `1px solid ${g.activa ? "#ff224430" : "#00ff8830"}`, borderRadius: 3 }}>{g.activa ? "DESACT." : "ACTIVAR"}</button>
                      <button onClick={() => renameGeocerca(g.id)} className="px-1.5 py-0.5 font-exo text-[7px] cursor-pointer" style={{ color: "#00d4ff", border: "1px solid #00d4ff30", borderRadius: 3 }}>RENOMBRAR</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredGeo.length === 0 && <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin geocercas para este filtro</div>}
        </div>
      </div>

      {/* Comparación de precisión entre fuentes */}
      {comparacion && (
        <div style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>COMPARACION DE PRECISION ENTRE FUENTES</span>
          </div>
          <div className="p-4 space-y-4">
            {/* GPS Volvo vs WiseTrack */}
            {comparacion.gps_comparacion?.length > 0 && (
              <div>
                <div className="font-exo text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>GPS: VOLVO vs WISETRACK (diferencia en metros)</div>
                <div className="overflow-auto" style={{ maxHeight: "250px" }}>
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: "1px solid #0d2035" }}>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>CAMION</th>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>DIFF METROS</th>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>MUESTRAS</th>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>PRECISION</th>
                    </tr></thead>
                    <tbody>
                      {comparacion.gps_comparacion.map((c: any) => (
                        <tr key={c.patente} style={{ borderBottom: "1px solid #0a1520" }}>
                          <td className="px-3 py-1.5 font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                          <td className="px-3 py-1.5 font-space text-[11px]" style={{ color: c.diff_metros < 50 ? "#00ff88" : c.diff_metros < 200 ? "#00d4ff" : "#ffcc00" }}>{c.diff_metros}m</td>
                          <td className="px-3 py-1.5 font-space text-[10px]" style={{ color: "#3a6080" }}>{c.comparaciones}</td>
                          <td className="px-3 py-1.5"><span className="font-exo text-[8px] font-bold px-1.5 py-0.5" style={{ color: precColor(c.precision), background: `${precColor(c.precision)}15`, borderRadius: 3 }}>{c.precision}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* KM Volvo ECU vs Sigetra */}
            {comparacion.km_comparacion?.length > 0 && (
              <div>
                <div className="font-exo text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>KM: VOLVO ECU vs SIGETRA DECLARADO (7 dias)</div>
                <div className="overflow-auto" style={{ maxHeight: "250px" }}>
                  <table className="w-full">
                    <thead><tr style={{ borderBottom: "1px solid #0d2035" }}>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>CAMION</th>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>KM VOLVO</th>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>KM SIGETRA</th>
                      <th className="text-left px-3 py-1 font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>DIFF</th>
                    </tr></thead>
                    <tbody>
                      {comparacion.km_comparacion.map((c: any) => (
                        <tr key={c.patente} style={{ borderBottom: "1px solid #0a1520" }}>
                          <td className="px-3 py-1.5 font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                          <td className="px-3 py-1.5 font-space text-[11px]" style={{ color: "#00d4ff" }}>{c.km_volvo?.toLocaleString("es-CL")}</td>
                          <td className="px-3 py-1.5 font-space text-[11px]" style={{ color: "#ff6b35" }}>{c.km_sigetra?.toLocaleString("es-CL")}</td>
                          <td className="px-3 py-1.5 font-space text-[11px] font-bold" style={{ color: c.diff_pct !== null && Math.abs(c.diff_pct) < 5 ? "#00ff88" : Math.abs(c.diff_pct || 0) < 15 ? "#ffcc00" : "#ff2244" }}>
                            {c.diff_pct !== null ? `${c.diff_pct > 0 ? "+" : ""}${c.diff_pct}%` : "--"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Geocercas inteligentes */}
            {comparacion.geocercas && (
              <div>
                <div className="font-exo text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>SISTEMA GEOCERCAS INTELIGENTE (5 NIVELES)</div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { nivel: 5, label: "DOBLE VALID.", desc: "≤5m exacto", color: "#00ffcc" },
                    { nivel: 1, label: "BASE", desc: "3-5km radio", color: "#00d4ff" },
                    { nivel: 2, label: "PUNTO 50m", desc: "Destino exacto", color: "#00ff88" },
                    { nivel: 3, label: "ASOCIADO", desc: "<10km cercano", color: "#ffcc00" },
                    { nivel: 4, label: "NUEVO", desc: "Auto-aprende", color: "#ff6b35" },
                  ].map(n => {
                    const data = comparacion.geocercas.niveles?.find((l: any) => l.nivel === n.nivel);
                    return (
                      <div key={n.nivel} className="text-center p-2" style={{ background: "#0a1520", borderRadius: 6, borderTop: `2px solid ${n.color}` }}>
                        <div className="font-space text-[16px] font-bold" style={{ color: n.color }}>{data?.total || 0}</div>
                        <div className="font-exo text-[8px] font-bold" style={{ color: n.color }}>{n.label}</div>
                        <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{n.desc}</div>
                      </div>
                    );
                  })}
                </div>
                {comparacion.geocercas.puntos_nuevos && (
                  <div className="mt-2 px-3 py-2 flex items-center gap-3" style={{ background: "#0a1520", borderRadius: 6 }}>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Puntos nuevos detectados: <span style={{ color: "#c8e8ff" }}>{comparacion.geocercas.puntos_nuevos.total || 0}</span></span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Listos para promover (3+ veces): <span style={{ color: "#ffcc00" }}>{comparacion.geocercas.puntos_nuevos.listos_promover || 0}</span></span>
                    <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Ya promovidos: <span style={{ color: "#00ff88" }}>{comparacion.geocercas.puntos_nuevos.promovidos || 0}</span></span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Camiones Unificado ──
function CamionesUnificado() {
  const { selectedPatente, setSelectedPatente } = useNavigation();
  const [search, setSearch] = useState("");
  const [filtroFuente, setFiltroFuente] = useState("todos");
  const { data: fleet } = useQuery<any>({ queryKey: ["/api/wisetrack/fleet"], queryFn: () => fetch("/api/wisetrack/fleet").then(r => r.json()), staleTime: 60000 });
  const { data: matching } = useQuery<any>({ queryKey: ["/api/wisetrack/matching"], queryFn: () => fetch("/api/wisetrack/matching").then(r => r.json()), staleTime: 5 * 60000 });
  const { data: detalle } = useQuery<any>({
    queryKey: ["/api/wt/camion-detalle", selectedPatente],
    queryFn: () => fetch(`/api/wt/camion-detalle/${selectedPatente}`).then(r => r.json()),
    enabled: !!selectedPatente, staleTime: 60000,
  });
  const { data: mesMes } = useQuery<any>({
    queryKey: ["/api/camion/mes-completo", selectedPatente],
    queryFn: () => fetch(`/api/camion/mes-completo/${selectedPatente}`).then(r => r.json()),
    enabled: !!selectedPatente, staleTime: 5 * 60000,
  });

  const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
  const getRendColor = (r: number) => r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : "#ff2244";

  const camiones = useMemo(() => {
    let list = fleet?.vehiculos || [];
    if (search) {
      const s = search.toUpperCase();
      list = list.filter((c: any) => (c.patente_norm || "").includes(s) || (c.movil || "").toUpperCase().includes(s) || (c.contrato || "").toUpperCase().includes(s));
    }
    return list.slice(0, 200);
  }, [fleet, search]);

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar patente, número interno o contrato..."
          className="flex-1 px-4 py-2.5 font-exo text-[11px] outline-none" style={{ background: "#0a1520", border: "1px solid #0d2035", borderRadius: 6, color: "#c8e8ff" }} />
      </div>

      {/* Grid or detail */}
      {!selectedPatente ? (
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
          {camiones.map((c: any) => (
            <div key={c.patente_norm || c.movil} onClick={() => setSelectedPatente(c.patente_norm || c.patente)}
              className="px-2 py-2 text-center cursor-pointer transition-all hover:opacity-80" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 6 }}>
              <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.movil || c.patente_norm}</div>
              <div className="font-exo text-[8px]" style={{ color: c.contrato?.includes("ANGLO") ? "#00ff88" : c.contrato?.includes("CENCOSUD") ? "#00d4ff" : "#3a6080" }}>{(c.contrato || "").substring(0, 12)}</div>
              <div className="font-space text-[10px] font-bold mt-0.5" style={{ color: getRendColor(c.rendimiento || 0) }}>
                {c.rendimiento ? parseFloat(c.rendimiento).toFixed(2) : "--"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "#060d14", border: "1px solid #06b6d430", borderTop: "2px solid #06b6d4", borderRadius: 8 }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedPatente(null)} className="font-exo text-[10px] px-2 py-1 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>← VOLVER</button>
              <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{selectedPatente}</span>
              {detalle?.contrato && <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{detalle.contrato}</span>}
            </div>
          </div>
          <div className="p-4">
            {/* KPIs */}
            {detalle && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "KM MES", value: fN(detalle.km_mes || 0), color: "#00d4ff" },
                  { label: "KM/L", value: detalle.rendimiento ? parseFloat(detalle.rendimiento).toFixed(2) : "--", color: getRendColor(detalle.rendimiento || 0) },
                  { label: "VIAJES", value: detalle.viajes_mes || 0, color: "#a855f7" },
                  { label: "DÍAS ACT.", value: detalle.dias_activos || 0, color: "#00ff88" },
                ].map(k => (
                  <div key={k.label} className="text-center px-3 py-3" style={{ background: "#0a1520", borderRadius: 6, borderTop: `2px solid ${k.color}` }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: k.color }}>{k.value}</div>
                    <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Calendario mensual si hay datos Volvo */}
            {mesMes?.calendario && (
              <div className="mb-4" style={{ background: "#0a1520", borderRadius: 6, padding: "12px" }}>
                <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#3a6080" }}>CALENDARIO MARZO</div>
                <div className="grid grid-cols-7 gap-1">
                  {["L","M","M","J","V","S","D"].map(d => (
                    <div key={d} className="text-center font-exo text-[7px]" style={{ color: "#3a6080" }}>{d}</div>
                  ))}
                  {/* Offset for first day */}
                  {Array.from({ length: (new Date(2026, 2, 1).getDay() + 6) % 7 }).map((_, i) => <div key={`e-${i}`} />)}
                  {mesMes.calendario.map((dia: any) => {
                    const bg = !dia.activo ? "#0d2035" : dia.rendimiento >= 2.85 ? "#00ff8830" : dia.rendimiento >= 2.3 ? "#ffcc0030" : "#ff224430";
                    return (
                      <div key={dia.fecha} className="text-center py-1" style={{ background: bg, borderRadius: 3 }}>
                        <div className="font-space text-[9px]" style={{ color: dia.activo ? "#c8e8ff" : "#3a6080" }}>{dia.dia}</div>
                        {dia.activo && dia.rendimiento > 0 && (
                          <div className="font-space text-[7px]" style={{ color: dia.rendimiento >= 2.85 ? "#00ff88" : dia.rendimiento >= 2.3 ? "#ffcc00" : "#ff2244" }}>
                            {dia.rendimiento.toFixed(1)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App Shell ──
// Welcome screen
function WelcomeScreen({ onTower, onMando }: { onTower: () => void; onMando: () => void }) {
  const [hora, setHora] = useState(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
  useEffect(() => { const t = setInterval(() => setHora(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })), 1000); return () => clearInterval(t); }, []);
  const { data: stats } = useQuery<any>({ queryKey: ["/api/welcome/stats"], queryFn: () => fetch("/api/welcome/stats").then(r => r.json()), refetchInterval: 60000 });
  const fecha = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#020508", backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(0,212,255,0.03) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(168,85,247,0.03) 0%, transparent 60%)" }}>
      <div className="text-center mb-12">
        <div className="font-exo text-[11px] tracking-[0.4em] uppercase mb-3" style={{ color: "#3a6080" }}>SOTRASER S.A.</div>
        <div className="font-space text-[48px] font-bold tracking-wider leading-none mb-2" style={{ color: "#c8e8ff" }}>{hora}</div>
        <div className="font-exo text-[12px] capitalize" style={{ color: "#3a6080" }}>{fecha}</div>
        {stats && (
          <div className="flex items-center gap-6 justify-center mt-6">
            {[{ l: "ACTIVOS", v: stats.activos, c: "#00ff88" }, { l: "KM/L HOY", v: stats.rend_hoy || "--", c: stats.rend_hoy >= 2.85 ? "#00ff88" : "#ffcc00" }, { l: "ALERTAS", v: stats.alertas, c: stats.alertas > 0 ? "#ff2244" : "#3a6080" }, { l: "AGENTES", v: `${stats.agentes_ok}/8`, c: "#a855f7" }].map(s => (
              <div key={s.l} className="text-center"><div className="font-space text-[18px] font-bold" style={{ color: s.c }}>{s.v}</div><div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{s.l}</div></div>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-6 w-full max-w-3xl px-8">
        <button onClick={onTower} className="group p-8 text-left cursor-pointer transition-all duration-300 hover:scale-[1.02]"
          style={{ background: "#060d14", border: "1px solid #00d4ff20", borderTop: "3px solid #00d4ff", borderRadius: 12 }}>
          <div className="text-[36px] mb-4">🗼</div>
          <div className="font-space text-[20px] font-bold tracking-wider mb-2" style={{ color: "#00d4ff" }}>TOWER</div>
          <div className="font-exo text-[10px] uppercase tracking-wider mb-4" style={{ color: "#3a6080" }}>Control Operacional</div>
          {["GPS en tiempo real · 581 vehículos", "Viajes, contratos y rendimiento", "Alertas y control de flota", "Combustible y conductores"].map(item => (
            <div key={item} className="flex items-center gap-2 font-exo text-[9px] mb-1" style={{ color: "#5a8090" }}><div className="w-1 h-1 rounded-full" style={{ background: "#00d4ff" }} />{item}</div>
          ))}
          <div className="mt-6 flex items-center gap-2 font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>ENTRAR <span className="group-hover:translate-x-1 transition-transform">→</span></div>
        </button>
        <button onClick={onMando} className="group p-8 text-left cursor-pointer transition-all duration-300 hover:scale-[1.02]"
          style={{ background: "#060d14", border: "1px solid #a855f720", borderTop: "3px solid #a855f7", borderRadius: 12 }}>
          <div className="text-[36px] mb-4">🤖</div>
          <div className="font-space text-[20px] font-bold tracking-wider mb-2" style={{ color: "#a855f7" }}>CENTRO DE MANDO</div>
          <div className="font-exo text-[10px] uppercase tracking-wider mb-4" style={{ color: "#3a6080" }}>Inteligencia Operacional</div>
          {["8 agentes trabajando 24/7", "Gerente de Operaciones Bot", "Arquitecto · Jefe técnico IA", "Parámetros auto-adaptativos"].map(item => (
            <div key={item} className="flex items-center gap-2 font-exo text-[9px] mb-1" style={{ color: "#7a5090" }}><div className="w-1 h-1 rounded-full" style={{ background: "#a855f7" }} />{item}</div>
          ))}
          <div className="mt-6 flex items-center gap-2 font-space text-[10px] font-bold" style={{ color: "#a855f7" }}>ENTRAR <span className="group-hover:translate-x-1 transition-transform">→</span></div>
        </button>
      </div>
      <div className="mt-12 font-exo text-[8px] tracking-wider" style={{ color: "#1a3040" }}>SOTRASER TOWER · Sistema de Gestión de Flota · v2.0</div>
    </div>
  );
}

function AppShell() {
  const [modo, setModo] = useState<"WELCOME" | "TOWER" | "MANDO">("WELCOME");
  const [tab, setTab] = useState<MainTab>("flota");
  const [showSplash, setShowSplash] = useState(true);
  const [selectedPatente, setSelectedPatente] = useState<string | null>(null);
  const [selectedContrato, setSelectedContrato] = useState<string | null>(null);
  const [focoAlerta, setFocoAlerta] = useState<any>(null);

  const { data: kpiData } = useQuery<any>({ queryKey: ["/api/cerebro/estado-general"], refetchInterval: 120000 });
  const { data: alertas } = useQuery<any[]>({ queryKey: ["/api/cerebro/camiones-alerta"], refetchInterval: 120000 });
  const alertCount = useMemo(() => alertas?.filter((a: any) => a.severidad === "ALTA" || a.severidad === "CRITICA").length || 0, [alertas]);

  const navigateTo = (t: MainTab, patente?: string, contrato?: string) => {
    if (patente) setSelectedPatente(patente);
    if (contrato) setSelectedContrato(contrato);
    setTab(t);
  };

  const navCtx: NavContext = { tab, setTab, selectedPatente, setSelectedPatente, selectedContrato, setSelectedContrato, navigateTo };

  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;

  if (modo === "WELCOME") return <WelcomeScreen onTower={() => setModo("TOWER")} onMando={() => setModo("MANDO")} />;

  if (modo === "MANDO") return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: "#0d2035", background: "#040a10" }}>
        <div className="flex items-center gap-4">
          <button onClick={() => setModo("WELCOME")} className="font-exo text-[9px] cursor-pointer" style={{ color: "#3a6080" }}>← Inicio</button>
          <div className="flex items-center gap-2"><span className="text-[14px]">🤖</span><span className="font-space text-[13px] font-bold tracking-wider" style={{ color: "#a855f7" }}>CENTRO DE MANDO</span></div>
        </div>
      </div>
      <div className="overflow-auto p-4" style={{ height: "calc(100vh - 52px)" }}><OperativeBrain /></div>
    </div>
  );

  return (
    <NavigationContext.Provider value={navCtx}>
      <div className="min-h-screen" style={{ background: "#020508", color: "#c8e8ff" }}>
        {/* ── TOP BAR ── */}
        <div className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(2,5,8,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #0d2035" }}>
          {/* Row 1: Brand + KPIs */}
          <div className="flex items-center justify-between px-4 h-[36px]">
            <div className="flex items-center gap-3">
              <button onClick={() => setModo("WELCOME")} className="font-space text-[14px] font-bold tracking-[0.2em] cursor-pointer hover:opacity-80" style={{ color: "#00d4ff", background: "none", border: "none" }}>SOTRASER</button>
              <span className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>TOWER</span>
              <div className="w-px h-4 mx-1" style={{ background: "#0d2035" }} />
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00ff88", animation: "blink 2s infinite", boxShadow: "0 0 4px #00ff88" }} />
                <span className="font-exo text-[9px] font-bold" style={{ color: "#00ff88" }}>LIVE</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {kpiData && (
                <>
                  <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{kpiData.camiones_activos} activos</span>
                  <span className="font-space text-[10px]" style={{ color: kpiData.rendimiento_promedio >= 2.85 ? "#00ff88" : "#ffcc00" }}>{kpiData.rendimiento_promedio} km/L</span>
                  {alertCount > 0 && (
                    <span className="font-space text-[10px] px-1.5 py-0.5" style={{ color: "#ff2244", background: "#ff224415", borderRadius: 3 }}>
                      {alertCount} alertas
                    </span>
                  )}
                </>
              )}
              <LiveClock />
            </div>
          </div>

          {/* Row 2: Tabs */}
          <div className="flex items-center px-4 h-[36px] gap-1" style={{ borderTop: "1px solid #0a1520" }}>
            {MAIN_TABS.map(t => {
              const isActive = tab === t.id;
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-[10px] font-bold tracking-[0.1em] cursor-pointer transition-all"
                  style={{
                    background: isActive ? `${t.color}10` : "transparent",
                    borderTop: isActive ? `2px solid ${t.color}` : "2px solid transparent",
                    borderBottom: "none",
                    color: isActive ? t.color : "#3a6080",
                  }}>
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.id === "control" && alertCount > 0 && (
                    <span className="ml-1 w-4 h-4 flex items-center justify-center text-[8px] font-bold rounded-full" style={{ background: "#ff2244", color: "#fff" }}>{alertCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div style={{ paddingTop: "72px" }}>
          <div className="p-4 max-w-[1600px] mx-auto">
            {tab === "flota" && <WisetrackPage onBack={() => {}} initialTab="mapa" embedded key="flota" />}
            {tab === "viajes" && <ViajesTMS />}
            {tab === "contratos" && <ContratosUnificado />}
            {tab === "combustible" && <EstacionesTab />}
            {tab === "camiones" && <CamionesUnificado />}
            {tab === "control" && <ControlCenter />}
            {tab === "brain" && <OperativeBrain />}
            {tab === "sistema" && <SistemaTab />}
            {tab === "foco" && focoAlerta && (
              <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ background: "#060d14", borderBottom: "1px solid #ff224440" }}>
                  <div className="flex items-center gap-3">
                    <span className="font-exo text-[9px] font-bold px-2 py-1" style={{ color: "#ff2244", background: "#ff224420", borderRadius: 4 }}>{focoAlerta.tipo}</span>
                    <span className="font-space text-[16px] font-bold" style={{ color: "#c8e8ff" }}>{focoAlerta.patente}</span>
                    <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{focoAlerta.contrato}</span>
                    {focoAlerta.conductor && <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>· {focoAlerta.conductor}</span>}
                    {focoAlerta.tipo === "VELOCIDAD" && <span className="font-space text-[18px] font-bold ml-3" style={{ color: "#ff2244" }}>{focoAlerta.dato || (focoAlerta.velocidad ? Math.round(focoAlerta.velocidad) + " km/h" : "")}</span>}
                    {focoAlerta.hora && <span className="font-exo text-[9px] ml-3" style={{ color: "#3a6080" }}>{typeof focoAlerta.hora === "string" ? focoAlerta.hora.substring(0, 19) : ""}</span>}
                  </div>
                  <button onClick={() => { setTab("control"); setFocoAlerta(null); }} className="px-4 py-2 font-exo text-[10px] font-bold cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 6 }}>← VOLVER A CONTROL</button>
                </div>

                {/* Mapa full screen */}
                <div style={{ flex: 1 }}>
                  <APIProvider apiKey="AIzaSyC2Sq4RSutNYqwnAyykQau4meFMnmucTlc">
                    <GMap defaultCenter={{ lat: focoAlerta.lat || -33.45, lng: focoAlerta.lng || -70.65 }} defaultZoom={focoAlerta.lat ? 15 : 6} mapId="sotraser-foco"
                      style={{ width: "100%", height: "100%" }} gestureHandling="greedy" mapTypeControl streetViewControl zoomControl>
                      {focoAlerta.lat && focoAlerta.lng && (
                        <>
                          <AdvancedMarker position={{ lat: focoAlerta.lat, lng: focoAlerta.lng }}>
                            <div style={{ width: 40, height: 40, background: "#ff2244", border: "3px solid #fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", fontWeight: "bold", boxShadow: "0 0 20px rgba(255,34,68,0.6)", animation: "pulse 2s infinite" }}>!</div>
                          </AdvancedMarker>
                          {/* Info overlay */}
                          <div style={{ position: "absolute", bottom: 20, left: 20, background: "rgba(6,13,20,0.95)", border: "1px solid #ff224440", borderRadius: 8, padding: "12px 16px", zIndex: 10, backdropFilter: "blur(8px)" }}>
                            <div className="font-space text-[14px] font-bold" style={{ color: "#ff2244" }}>{focoAlerta.tipo === "VELOCIDAD" ? (focoAlerta.dato || Math.round(focoAlerta.velocidad || 0) + " km/h") : focoAlerta.tipo}</div>
                            <div className="font-space text-[12px] font-bold mt-1" style={{ color: "#c8e8ff" }}>{focoAlerta.patente} · {focoAlerta.contrato}</div>
                            {focoAlerta.conductor && <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>{focoAlerta.conductor}</div>}
                            {focoAlerta.descripcion && <div className="font-exo text-[9px] mt-1" style={{ color: "#c8e8ff" }}>{focoAlerta.descripcion}</div>}
                            <div className="font-exo text-[8px] mt-1" style={{ color: "#3a6080" }}>{focoAlerta.lat?.toFixed(5)}, {focoAlerta.lng?.toFixed(5)}</div>
                          </div>
                        </>
                      )}
                    </GMap>
                  </APIProvider>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </NavigationContext.Provider>
  );
}

// ── Root ──
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
