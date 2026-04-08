import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LeafletMap, MapPanner, FitBounds, DivMarker, CircleMarker, Polyline, useMap } from "@/components/leaflet-map";
import { Marker } from "react-leaflet";
import L from "leaflet";
import { Truck, TrendingUp, AlertTriangle, Fuel, Activity, MapPin, DollarSign, Target, ChevronLeft, Bot, RefreshCw, Send, Loader2, Settings, Brain, Route, Zap, Eye, Check, X, Map, ChevronDown, ChevronUp, Navigation, Search, Flag, Gauge, Clock, Play, Pause } from "lucide-react";
import MapaGeocercasCencosud from "@/components/mapa-geocercas-cencosud";

const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
const fP = (n: number) => `$${fN(n)}`;
type Tab = "EN_VIVO" | "CONTROL" | "RESUMEN" | "VIAJES" | "ERR" | "RUTAS" | "FLOTA" | "AGENTE" | "TARIFAS" | "MAPA";

function MapeoInteractivo() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [origenManual, setOrigenManual] = useState("");
  const [destinoManual, setDestinoManual] = useState("");
  const [filtro, setFiltro] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, ok: boolean} | null>(null);
  const [showDropO, setShowDropO] = useState(false);
  const [showDropD, setShowDropD] = useState(false);

  const { data, refetch } = useQuery<any>({
    queryKey: ["/api/cencosud/viajes-sin-tarifa-mapa"],
    queryFn: () => fetch("/api/cencosud/viajes-sin-tarifa-mapa").then(r => r.json()),
    staleTime: 60000,
  });

  const viajes = (data?.viajes || []).filter((v: any) => {
    if (!filtro) return true;
    const f = filtro.toLowerCase();
    return (v.patente || "").toLowerCase().includes(f) ||
      (v.origen_nombre || "").toLowerCase().includes(f) ||
      (v.destino_nombre || "").toLowerCase().includes(f);
  });
  const nombres = data?.nombres_contrato || [];

  const mapCenter = useMemo(() => {
    if (selected?.origen_lat && selected?.destino_lat) {
      return { lat: (selected.origen_lat + selected.destino_lat) / 2, lng: (selected.origen_lng + selected.destino_lng) / 2 };
    }
    if (selected?.origen_lat) return { lat: selected.origen_lat, lng: selected.origen_lng };
    return { lat: -33.45, lng: -70.65 };
  }, [selected]);

  const mapZoom = useMemo(() => {
    if (selected?.origen_lat && selected?.destino_lat) {
      const latDiff = Math.abs(selected.origen_lat - selected.destino_lat);
      const lngDiff = Math.abs(selected.origen_lng - selected.destino_lng);
      const maxDiff = Math.max(latDiff, lngDiff);
      if (maxDiff > 5) return 5;
      if (maxDiff > 2) return 7;
      if (maxDiff > 0.5) return 9;
      return 11;
    }
    return 6;
  }, [selected]);

  const handleMapear = async (orC: string, deC: string) => {
    if (!selected || !orC || !deC) return;
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/cencosud/mapear-viaje", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viaje_id: selected.id,
          origen_nombre: selected.origen_nombre,
          destino_nombre: selected.destino_nombre,
          origen_contrato: orC,
          destino_contrato: deC,
        }),
      }).then(r => r.json());
      if (r.ok) {
        setFeedback({ msg: `Mapeado: ${r.ruta}${r.tarifa_match ? ` · Tarifa: $${Math.round(r.tarifa_match.tarifa).toLocaleString("es-CL")}` : " · Sin tarifa en tarifario"}. ${r.viajes_afectados} viajes afectados.`, ok: true });
        setSelected(null);
        setOrigenManual("");
        setDestinoManual("");
        refetch();
        qc.invalidateQueries({ queryKey: ["/api/cencosud/viajes-mes"] });
        qc.invalidateQueries({ queryKey: ["/api/cencosud/resumen-mes"] });
      } else {
        setFeedback({ msg: r.error || "Error", ok: false });
      }
    } catch (e: any) { setFeedback({ msg: e.message, ok: false }); }
    setSaving(false);
  };

  const handleDescartar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/cencosud/descartar-viaje", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viaje_id: selected.id, motivo: "No es Cencosud" }),
      });
      if (!resp.ok) throw new Error("Error al descartar");
      const r = await resp.json();
      if (r.ok) {
        setFeedback({ msg: "Viaje descartado", ok: true });
        setSelected(null);
        refetch();
      } else {
        setFeedback({ msg: r.error || "Error al descartar", ok: false });
      }
    } catch (e: any) {
      setFeedback({ msg: e.message || "Error de conexión", ok: false });
    }
    setSaving(false);
  };

  const filteredNombresO = nombres.filter((n: string) => n.toLowerCase().includes(origenManual.toLowerCase()));
  const filteredNombresD = nombres.filter((n: string) => n.toLowerCase().includes(destinoManual.toLowerCase()));

  return (
    <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #ffcc0030" }}>
      <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <Map className="w-3.5 h-3.5" style={{ color: "#ffcc00" }} />
          <span className="font-exo text-[9px] tracking-wider uppercase font-bold" style={{ color: "#ffcc00" }}>
            MAPEO INTERACTIVO · {viajes.length} viajes sin tarifa
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
            <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar patente o lugar..."
              className="font-exo text-[9px] pl-6 pr-3 py-1 rounded outline-none w-48"
              style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
          </div>
        </div>
      </div>

      {feedback && (
        <div className="mx-4 mt-2 px-3 py-2 rounded flex items-center gap-2" style={{ background: feedback.ok ? "#00ff8815" : "#ff224415", border: `1px solid ${feedback.ok ? "#00ff8840" : "#ff224440"}` }}>
          {feedback.ok ? <Check className="w-3.5 h-3.5" style={{ color: "#00ff88" }} /> : <X className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />}
          <span className="font-exo text-[9px]" style={{ color: feedback.ok ? "#00ff88" : "#ff2244" }}>{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto cursor-pointer"><X className="w-3 h-3" style={{ color: "#3a6080" }} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-0" style={{ height: 420 }}>
        <div className="overflow-auto border-r" style={{ borderColor: "#0d2035" }}>
          {viajes.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>No hay viajes sin tarifa</span>
            </div>
          )}
          {viajes.map((v: any) => {
            const isSelected = selected?.id === v.id;
            const hasSugerencia = (v.sugerencias || []).length > 0;
            return (
              <div key={v.id} onClick={() => { setSelected(v); setOrigenManual(v.origen_contrato || ""); setDestinoManual(v.destino_contrato || ""); setShowDropO(false); setShowDropD(false); }}
                className="px-3 py-2 cursor-pointer transition-all"
                style={{ background: isSelected ? "#0a2540" : "transparent", borderBottom: "1px solid #0d2035", borderLeft: isSelected ? "3px solid #00d4ff" : "3px solid transparent" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{v.patente}</span>
                    <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{v.dia?.slice(5)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-space text-[8px]" style={{ color: "#c8e8ff" }}>{Math.round(v.km || 0)} km</span>
                    {hasSugerencia && <span className="px-1 rounded font-exo text-[6px] font-bold" style={{ background: "#00d4ff20", color: "#00d4ff" }}>IA</span>}
                  </div>
                </div>
                <div className="mt-0.5">
                  <span className="font-exo text-[7px]" style={{ color: v.origen_contrato ? "#00ff88" : "#ffcc00" }}>
                    {(v.origen_nombre || "Sin origen").substring(0, 30)}
                  </span>
                  <span className="font-exo text-[7px] mx-1" style={{ color: "#3a6080" }}>→</span>
                  <span className="font-exo text-[7px]" style={{ color: v.destino_contrato ? "#00ff88" : "#ffcc00" }}>
                    {(v.destino_nombre || "Sin destino").substring(0, 30)}
                  </span>
                </div>
                {hasSugerencia && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <Brain className="w-2.5 h-2.5" style={{ color: "#00d4ff50" }} />
                    <span className="font-exo text-[6px]" style={{ color: "#00d4ff" }}>
                      Sugerencia: {v.sugerencias[0].origen} → {v.sugerencias[0].destino}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col">
          <div style={{ height: 200, background: "#0a1520" }}>
            {selected ? (
              <LeafletMap center={[mapCenter.lat, mapCenter.lng]} zoom={mapZoom}>
                {selected.origen_lat && selected.origen_lng && (
                  <DivMarker position={[selected.origen_lat, selected.origen_lng]} html={`<div style="background:#00ff88;border-radius:50%;width:16px;height:16px;border:2px solid #fff;display:flex;align-items:center;justify-content:center"><span style="color:#000;font-size:8px;font-weight:bold">O</span></div>`} size={[16, 16]} />
                )}
                {selected.destino_lat && selected.destino_lng && (
                  <DivMarker position={[selected.destino_lat, selected.destino_lng]} html={`<div style="background:#ff2244;border-radius:50%;width:16px;height:16px;border:2px solid #fff;display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:8px;font-weight:bold">D</span></div>`} size={[16, 16]} />
                )}
              </LeafletMap>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Navigation className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Selecciona un viaje para ver en mapa</span>
                </div>
              </div>
            )}
          </div>

          {selected ? (
            <div className="flex-1 overflow-auto p-3 space-y-2" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px] font-bold tracking-wider uppercase" style={{ color: "#00d4ff" }}>
                MAPEAR VIAJE · {selected.patente} · {Math.round(selected.km || 0)} km
              </div>

              {(selected.sugerencias || []).length > 0 && (
                <div className="space-y-1">
                  <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Sugerencias del sistema:</div>
                  {selected.sugerencias.slice(0, 3).map((s: any, i: number) => (
                    <button key={i} onClick={() => handleMapear(s.origen, s.destino)} disabled={saving}
                      className="w-full text-left px-2 py-1.5 rounded cursor-pointer transition-all hover:opacity-90 flex items-center justify-between"
                      style={{ background: i === 0 ? "#00d4ff15" : "#0a1520", border: `1px solid ${i === 0 ? "#00d4ff40" : "#0d2035"}` }}>
                      <div className="flex items-center gap-2">
                        {i === 0 && <Brain className="w-3 h-3" style={{ color: "#00d4ff" }} />}
                        <span className="font-exo text-[8px]" style={{ color: i === 0 ? "#00d4ff" : "#c8e8ff" }}>
                          {s.origen} → {s.destino}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-space text-[7px]" style={{ color: "#00ff88" }}>{fP(s.tarifa)}</span>
                        <span className="font-exo text-[6px] px-1 rounded" style={{ background: "#0d2035", color: "#3a6080" }}>L{s.lote}</span>
                        <Check className="w-3 h-3" style={{ color: "#00ff88" }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>
                  {(selected.sugerencias || []).length > 0 ? "O ingresa manualmente:" : "Selecciona ruta del tarifario:"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <div className="font-exo text-[6px] uppercase mb-0.5" style={{ color: "#00ff88" }}>Origen</div>
                    <div className="font-exo text-[7px] mb-0.5 truncate" style={{ color: "#3a6080" }}>GPS: {(selected.origen_nombre || "?").substring(0, 25)}</div>
                    <input value={origenManual} onChange={e => { setOrigenManual(e.target.value); setShowDropO(true); }} onFocus={() => setShowDropO(true)}
                      placeholder="Buscar nombre contrato..."
                      className="w-full font-exo text-[9px] px-2 py-1 rounded outline-none"
                      style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
                    {showDropO && filteredNombresO.length > 0 && (
                      <div className="absolute z-50 w-full mt-0.5 rounded overflow-auto" style={{ background: "#0a1520", border: "1px solid #0d2035", maxHeight: 100 }}>
                        {filteredNombresO.map((n: string) => (
                          <div key={n} onClick={() => { setOrigenManual(n); setShowDropO(false); }}
                            className="px-2 py-1 cursor-pointer font-exo text-[8px] hover:opacity-80"
                            style={{ color: "#c8e8ff", borderBottom: "1px solid #0d203530", background: origenManual === n ? "#00d4ff15" : "transparent" }}>
                            {n}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <div className="font-exo text-[6px] uppercase mb-0.5" style={{ color: "#ff2244" }}>Destino</div>
                    <div className="font-exo text-[7px] mb-0.5 truncate" style={{ color: "#3a6080" }}>GPS: {(selected.destino_nombre || "?").substring(0, 25)}</div>
                    <input value={destinoManual} onChange={e => { setDestinoManual(e.target.value); setShowDropD(true); }} onFocus={() => setShowDropD(true)}
                      placeholder="Buscar nombre contrato..."
                      className="w-full font-exo text-[9px] px-2 py-1 rounded outline-none"
                      style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
                    {showDropD && filteredNombresD.length > 0 && (
                      <div className="absolute z-50 w-full mt-0.5 rounded overflow-auto" style={{ background: "#0a1520", border: "1px solid #0d2035", maxHeight: 100 }}>
                        {filteredNombresD.map((n: string) => (
                          <div key={n} onClick={() => { setDestinoManual(n); setShowDropD(false); }}
                            className="px-2 py-1 cursor-pointer font-exo text-[8px] hover:opacity-80"
                            style={{ color: "#c8e8ff", borderBottom: "1px solid #0d203530", background: destinoManual === n ? "#00d4ff15" : "transparent" }}>
                            {n}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleMapear(origenManual, destinoManual)}
                    disabled={saving || !origenManual || !destinoManual}
                    className="flex-1 py-1.5 rounded font-exo text-[8px] font-bold tracking-wider uppercase cursor-pointer disabled:opacity-30 transition-all"
                    style={{ background: "#00ff8820", border: "1px solid #00ff8840", color: "#00ff88" }}>
                    {saving ? <Loader2 className="w-3 h-3 mx-auto animate-spin" /> : "CONFIRMAR MAPEO"}
                  </button>
                  <button onClick={handleDescartar} disabled={saving}
                    className="px-3 py-1.5 rounded font-exo text-[8px] tracking-wider uppercase cursor-pointer disabled:opacity-30"
                    style={{ background: "#ff224415", border: "1px solid #ff224430", color: "#ff2244" }}>
                    NO ES CENCOSUD
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="text-center p-4">
                <MapPin className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a608050" }} />
                <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Selecciona un viaje de la lista izquierda</div>
                <div className="font-exo text-[7px] mt-1" style={{ color: "#3a608080" }}>
                  Verás la ruta en el mapa y podrás asignar origen/destino del tarifario
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CencosudView({ onBack, gpsSource = "wisetrack", onNavigate }: { onBack: () => void; gpsSource?: "wisetrack"; onNavigate?: (tab: string) => void }) {
  const [tab, setTab] = useState<Tab>("EN_VIVO");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [filtroFlota, setFiltroFlota] = useState("");
  const [filtroCtrl, setFiltroCtrl] = useState("");
  const [filtroTarifas, setFiltroTarifas] = useState("");
  const [sortFlota, setSortFlota] = useState<{ col: string; asc: boolean }>({ col: "patente", asc: true });
  const [sortCtrl, setSortCtrl] = useState<{ col: string; asc: boolean }>({ col: "patente", asc: true });

  const enVivoUrl = gpsSource === "wisetrack" ? "/api/wisetrack/tms/en-vivo" : "/api/cencosud/en-vivo";
  const trailUrlBase = gpsSource === "wisetrack" ? "/api/wisetrack/tms/en-vivo/trail" : "/api/cencosud/en-vivo/trail";

  const { data: mes } = useQuery<any>({ queryKey: ["/api/cencosud/resumen-mes"], queryFn: () => fetch("/api/cencosud/resumen-mes").then(r => r.json()), staleTime: 120000 });
  const { data: dash } = useQuery<any>({ queryKey: ["/api/cencosud/dashboard", fecha], queryFn: () => fetch(`/api/cencosud/dashboard?fecha=${fecha}`).then(r => r.json()), staleTime: 60000 });
  const mesActual = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const { data: plMes } = useQuery<any>({ queryKey: ["/api/cencosud/pl/mes", mesActual], queryFn: () => fetch(`/api/cencosud/pl/mes?mes=${mesActual}`).then(r => r.json()), staleTime: 120000 });
  const { data: plDia } = useQuery<any>({ queryKey: ["/api/cencosud/pl/dia", fecha], queryFn: () => fetch(`/api/cencosud/pl/dia?fecha=${fecha}`).then(r => r.json()), staleTime: 60000 });
  const { data: enVivoData } = useQuery<any>({ queryKey: [enVivoUrl], queryFn: () => fetch(enVivoUrl).then(r => r.json()), refetchInterval: 30000, enabled: tab === "EN_VIVO" });
  const [seguir, setSeguir] = useState<string | null>(null);
  const [alertaMapOpen, setAlertaMapOpen] = useState<any>(null);
  const [viajeRutaId, setViajeRutaId] = useState<number | null>(null);
  const prevTab = useRef<Tab>("EN_VIVO");
  useEffect(() => { if (prevTab.current === "EN_VIVO" && tab !== "EN_VIVO") setSeguir(null); prevTab.current = tab; }, [tab]);
  const { data: trailData } = useQuery<any>({ queryKey: [trailUrlBase, seguir], queryFn: () => fetch(`${trailUrlBase}/${seguir}`).then(r => r.json()), refetchInterval: 30000, enabled: !!seguir && tab === "EN_VIVO" });
  const { data: errData } = useQuery<any>({ queryKey: ["/api/cencosud/err", fecha], queryFn: () => fetch(`/api/cencosud/err?fecha=${fecha}`).then(r => r.json()), staleTime: 60000, enabled: tab === "ERR" });
  const { data: viajesMes } = useQuery<any>({ queryKey: ["/api/cencosud/viajes-mes"], queryFn: () => fetch("/api/cencosud/viajes-mes").then(r => r.json()), staleTime: 120000, enabled: tab === "VIAJES" });
  const { data: flotaData } = useQuery<any>({ queryKey: ["/api/cencosud/flota"], queryFn: () => fetch("/api/cencosud/flota").then(r => r.json()), staleTime: 300000, enabled: tab === "FLOTA" });
  const { data: tarifasData } = useQuery<any>({ queryKey: ["/api/cencosud/tarifas"], queryFn: () => fetch("/api/cencosud/tarifas").then(r => r.json()), staleTime: 600000, enabled: tab === "TARIFAS" });
  const { data: sinMapear } = useQuery<any>({ queryKey: ["/api/cencosud/sin-mapear"], queryFn: () => fetch("/api/cencosud/sin-mapear").then(r => r.json()), staleTime: 300000 });
  const { data: saEstado } = useQuery<any>({ queryKey: ["/api/cencosud/agente/estado"], queryFn: () => fetch("/api/cencosud/agente/estado").then(r => r.json()), refetchInterval: 60000, enabled: tab === "AGENTE" });
  const { data: saMsgs, refetch: refetchSaMsgs } = useQuery<any>({ queryKey: ["/api/cencosud/agente/mensajes"], queryFn: () => fetch("/api/cencosud/agente/mensajes").then(r => r.json()), refetchInterval: 30000, enabled: tab === "AGENTE" });
  const { data: paramData, refetch: refetchParams } = useQuery<any>({ queryKey: ["/api/cencosud/parametros"], queryFn: () => fetch("/api/cencosud/parametros").then(r => r.json()), staleTime: 300000, enabled: tab === "AGENTE" });
  const { data: intelData, refetch: refetchIntel } = useQuery<any>({ queryKey: ["/api/cencosud/agente/inteligencia"], queryFn: () => fetch("/api/cencosud/agente/inteligencia").then(r => r.json()), refetchInterval: 120000, enabled: tab === "AGENTE" });
  const { data: ctrlData, isLoading: ctrlLoading, isError: ctrlError, refetch: refetchCtrl } = useQuery<any>({ queryKey: ["/api/cencosud/control-diario", fecha], queryFn: () => fetch(`/api/cencosud/control-diario?fecha=${fecha}`).then(r => { if (!r.ok) throw new Error("Error cargando control diario"); return r.json(); }), staleTime: 30000, enabled: tab === "CONTROL" });

  const f = mes?.flota || {};
  const fi = mes?.financiero || {};
  const p = mes?.productividad || {};

  return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-3" style={{ background: "#060d14", borderBottom: "2px solid #00d4ff" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded flex items-center justify-center font-space text-[11px] font-bold" style={{ background: "#00d4ff15", border: "1px solid #00d4ff30", color: "#00d4ff" }}>C</div>
          <div>
            <div className="flex items-center gap-2">
              <div className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>CENCOSUD RETAIL</div>
              <span className="font-exo text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#06b6d420", border: "1px solid #06b6d440", color: "#06b6d4" }}>GPS: WISETRACK</span>
            </div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Contrato Ago 2025 - Jul 2029 · 83 camiones · 7 lotes</div>
          </div>
          {onNavigate && (
            <div className="flex items-center gap-1 ml-4 border-l pl-4" style={{ borderColor: "#0d2035" }}>
              {[
                { id: "flota", label: "FLOTA" },
                { id: "camiones", label: "CAMIONES" },
                { id: "sistema", label: "SISTEMA" },
              ].map(t => (
                <button key={t.id} onClick={() => onNavigate(t.id)}
                  className="px-2.5 py-1 font-exo text-[8px] font-bold tracking-wider cursor-pointer rounded"
                  style={{ color: "#3a6080", background: "transparent", border: "1px solid #0d2035" }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>INGRESO MES</div>
            <div className="font-space text-[14px] font-bold" style={{ color: "#00ff88" }}>{fP(plMes?.ingreso_total || fi.ingreso_acumulado || 0)}</div>
          </div>
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>COSTO MES</div>
            <div className="font-space text-[14px] font-bold" style={{ color: "#ff6b35" }}>{fP(plMes?.costo_total || 0)}</div>
          </div>
          <div className="text-right">
            <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>MARGEN</div>
            <div className="font-space text-[14px] font-bold" style={{ color: (plMes?.margen_total || 0) >= 0 ? "#00ff88" : "#ff2244" }}>
              {fP(plMes?.margen_total || 0)}
              {plMes?.margen_pct != null && <span className="text-[9px] ml-1" style={{ color: "#3a6080" }}>({plMes.margen_pct}%)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center justify-between px-4 py-1" style={{ background: "#0a1218", borderBottom: "1px solid #0d2035" }}>
        <div className="flex gap-0 overflow-x-auto">
          {([
            { t: "EN_VIVO" as Tab, icon: <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 6px #00ff88", animation: "blink 2s infinite" }} />, label: "EN VIVO", color: "#00ff88" },
            { t: "CONTROL" as Tab, icon: <Activity size={11} />, label: "CONTROL", color: "#ffcc00" },
            { t: "RESUMEN" as Tab, icon: <TrendingUp size={11} />, label: "RESUMEN", color: "#00d4ff" },
            { t: "VIAJES" as Tab, icon: <Route size={11} />, label: "VIAJES", color: "#a855f7" },
            { t: "ERR" as Tab, icon: <DollarSign size={11} />, label: "ERR", color: "#00ff88" },
            { t: "RUTAS" as Tab, icon: <Navigation size={11} />, label: "RUTAS", color: "#00d4ff" },
            { t: "FLOTA" as Tab, icon: <Truck size={11} />, label: "FLOTA", color: "#00d4ff" },
            { t: "AGENTE" as Tab, icon: <Brain size={11} />, label: "AGENTE", color: "#a855f7" },
            { t: "TARIFAS" as Tab, icon: <Target size={11} />, label: "TARIFAS", color: "#00ff88" },
            { t: "MAPA" as Tab, icon: <MapPin size={11} />, label: "MAPA", color: "#00d4ff" },
          ]).map(({ t, icon, label, color }) => (
            <button key={t} onClick={() => setTab(t)} className="flex items-center gap-1.5 px-3 py-2 font-space text-[9px] font-bold tracking-wider cursor-pointer whitespace-nowrap"
              style={{ color: tab === t ? color : "#3a6080", borderBottom: tab === t ? `2px solid ${color}` : "2px solid transparent" }}>
              {icon}
              {label}
              {t === "EN_VIVO" && enVivoData?.resumen && <span className="ml-1 text-[8px] px-1 py-0.5" style={{ background: "#00ff8815", borderRadius: 3 }}>{enVivoData.resumen.en_ruta}</span>}
            </button>
          ))}
        </div>
        {(tab === "ERR" || tab === "RUTAS" || tab === "CONTROL") && (
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="font-exo text-[10px] px-3 py-1 rounded outline-none cursor-pointer"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        )}
      </div>

      <div className="p-4 space-y-4 overflow-auto" style={{ height: "calc(100vh - 120px)" }}>

        {/* ═══ EN VIVO ═══ */}
        {tab === "EN_VIVO" && (() => {
          const ev = enVivoData;
          const res = ev?.resumen || {};
          const ruta = ev?.en_ruta || [];
          const cd = ev?.en_cd || [];
          const sg = ev?.sin_gps || [];
          const geos = ev?.geocercas || [];
          const selCam = seguir ? ruta.find((c: any) => c.patente === seguir) || cd.find((c: any) => c.patente === seguir) : null;
          const trail = trailData?.puntos || [];
          const isEnRuta = selCam && ruta.some((c: any) => c.patente === seguir);
          const origenObj = selCam?.origen;
          const destObj = selCam?.destino_probable;
          const entregaObj = selCam?.entrega;
          const fase = selCam?.fase;

          return (
            <div className="flex gap-3" style={{ height: "calc(100vh - 140px)" }}>
              {/* LEFT: List */}
              <div className="w-[380px] flex-shrink-0 flex flex-col overflow-hidden" style={{ background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 }}>
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-0 border-b" style={{ borderColor: "#0d2035" }}>
                  {[
                    { l: "EN RUTA", v: res.en_ruta || 0, c: "#00ff88" },
                    { l: "EN CD", v: res.en_cd || 0, c: "#00d4ff" },
                    { l: "SIN GPS", v: res.sin_gps || 0, c: res.sin_gps > 0 ? "#ff6b35" : "#3a6080" },
                  ].map(k => (
                    <div key={k.l} className="px-3 py-2.5 text-center" style={{ borderRight: "1px solid #0d2035" }}>
                      <div className="font-space text-[20px] font-bold" style={{ color: k.c }}>{k.v}</div>
                      <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* Trucks list */}
                <div className="flex-1 overflow-auto">
                  {ruta.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 sticky top-0 z-10" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
                        <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: "#00ff88" }}>EN RUTA · {ruta.length}</span>
                      </div>
                      {ruta.map((cam: any) => (
                        <div key={cam.patente} onClick={() => setSeguir(seguir === cam.patente ? null : cam.patente)}
                          className="px-3 py-2.5 cursor-pointer transition-all border-b"
                          style={{
                            borderColor: "#0a1520",
                            background: seguir === cam.patente ? "linear-gradient(90deg, #00ff8812 0%, transparent 100%)" : "transparent",
                            borderLeft: seguir === cam.patente ? "3px solid #00ff88" : "3px solid transparent",
                          }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Truck className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />
                                {cam.velocidad > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "#00ff88", animation: "blink 1.5s infinite" }} />}
                              </div>
                              <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
                              <span className="font-space text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: cam.velocidad > 0 ? "#00ff88" : "#ff6b35", background: cam.velocidad > 0 ? "#00ff8812" : "#ff6b3512" }}>{Math.round(cam.velocidad)} km/h</span>
                            </div>
                            <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{cam.km_recorridos} km</span>
                          </div>
                          {cam.fase && (
                            <div className="flex items-center gap-1 mb-0.5 ml-5">
                              <span className="font-space text-[7px] font-bold px-1.5 py-0.5 rounded" style={{
                                background: cam.fase === "ida" ? "#a855f715" : "#00d4ff15",
                                color: cam.fase === "ida" ? "#a855f7" : "#00d4ff",
                                border: `1px solid ${cam.fase === "ida" ? "#a855f730" : "#00d4ff30"}`,
                              }}>{cam.fase === "ida" ? "IDA" : cam.fase === "vuelta" ? "VUELTA" : "—"}</span>
                            </div>
                          )}
                          {cam.origen && (
                            <div className="flex items-center gap-1 mb-0.5 ml-5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#00d4ff", border: "1.5px solid #00d4ff80" }} />
                              <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>CD:</span>
                              <span className="font-exo text-[9px] font-bold" style={{ color: "#00d4ff" }}>{cam.origen.nombre}</span>
                              {cam.hora_salida && <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>{String(cam.hora_salida).substring(11, 16)}</span>}
                            </div>
                          )}
                          {cam.entrega && (
                            <div className="flex items-center gap-1 mb-0.5 ml-5">
                              <Check className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#00ff88" }} />
                              <span className="font-exo text-[9px] font-bold" style={{ color: "#00ff88" }}>{cam.entrega.nombre}</span>
                              {cam.entrega.hora && <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>{String(cam.entrega.hora).substring(11, 16)}</span>}
                            </div>
                          )}
                          {cam.destino_probable && (
                            <div className="flex items-center gap-1 ml-5">
                              <Navigation className="w-2.5 h-2.5 flex-shrink-0" style={{ color: cam.fase === "vuelta" ? "#00d4ff" : "#a855f7" }} />
                              <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>→</span>
                              <span className="font-exo text-[9px] font-bold" style={{ color: cam.fase === "vuelta" ? "#00d4ff" : "#a855f7" }}>{cam.destino_probable.nombre}</span>
                              <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>~{cam.destino_probable.km_restante} km</span>
                            </div>
                          )}
                          {cam.conductor && <div className="font-exo text-[8px] mt-0.5 ml-5" style={{ color: "#3a6080" }}>{cam.conductor}</div>}
                        </div>
                      ))}
                    </>
                  )}

                  {cd.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 sticky top-0 z-10" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
                        <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>EN CD / GEOCERCA · {cd.length}</span>
                      </div>
                      {cd.map((cam: any) => (
                        <div key={cam.patente} onClick={() => setSeguir(seguir === cam.patente ? null : cam.patente)}
                          className="px-3 py-2 cursor-pointer transition-all border-b"
                          style={{
                            borderColor: "#0a1520",
                            background: seguir === cam.patente ? "linear-gradient(90deg, #00d4ff08 0%, transparent 100%)" : "transparent",
                            borderLeft: seguir === cam.patente ? "3px solid #00d4ff" : "3px solid transparent",
                          }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3 h-3" style={{ color: "#00d4ff" }} />
                              <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{cam.patente}</span>
                            </div>
                            <span className="font-exo text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: "#00d4ff", background: "#00d4ff12" }}>{cam.geocerca}</span>
                          </div>
                          {cam.conductor && <div className="font-exo text-[8px] mt-0.5 ml-5" style={{ color: "#3a6080" }}>{cam.conductor}</div>}
                        </div>
                      ))}
                    </>
                  )}

                  {sg.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 sticky top-0 z-10" style={{ background: "#0a1520", borderBottom: "1px solid #0d2035" }}>
                        <span className="font-space text-[8px] font-bold tracking-wider" style={{ color: "#ff6b35" }}>SIN GPS · {sg.length}</span>
                      </div>
                      {sg.map((cam: any) => (
                        <div key={cam.patente} className="px-3 py-2 border-b" style={{ borderColor: "#0a1520" }}>
                          <div className="flex items-center justify-between">
                            <span className="font-space text-[11px] font-bold" style={{ color: "#5a8090" }}>{cam.patente}</span>
                            <span className="font-exo text-[8px]" style={{ color: "#ff6b35" }}>{Math.round(cam.minutos_sin_gps / 60)}h sin señal</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {!ev && <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#3a6080" }} /></div>}
                  {ev && ruta.length === 0 && cd.length === 0 && (
                    <div className="text-center py-12">
                      <Truck className="w-8 h-8 mx-auto mb-2" style={{ color: "#0d2035" }} />
                      <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin actividad Cencosud detectada hoy</div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Map */}
              <div className="flex-1 rounded-lg overflow-hidden relative" style={{ border: "1px solid #0d2035" }}>
                <LeafletMap center={[-33.45, -70.65]} zoom={6}>
                  <MapPanner lat={selCam?.lat || null} lng={selCam?.lng || null} zoom={selCam ? 10 : 6} />

                  {(!seguir) && geos.map((g: any) => {
                    const esCD = g.tipo === "cd";
                    const html = esCD
                      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:12px;height:12px;border-radius:50%;background:#00d4ff40;border:2px solid #00d4ff80"></div><span style="font-size:8px;color:#00d4ff80;font-family:Space Grotesk;font-weight:600;white-space:nowrap;text-shadow:0 0 3px #000">${g.nombre}</span></div>`
                      : `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:6px;height:6px;background:#a855f730;border:1px solid #a855f750;transform:rotate(45deg)"></div><span style="font-size:6px;color:#a855f750;font-family:Space Grotesk;font-weight:600;white-space:nowrap;text-shadow:0 0 3px #000">${g.nombre}</span></div>`;
                    return <DivMarker key={`geo-${g.nombre}`} position={[g.lat, g.lng]} html={html} size={esCD ? [80, 30] : [60, 20]} />;
                  })}

                  {ruta.map((cam: any) => {
                    const sel = seguir === cam.patente;
                    const html = `<div style="background:${sel ? '#00ff88' : '#060d14'};border:2px solid #00ff88;border-radius:6px;padding:${sel ? '4px 8px' : '2px 6px'};box-shadow:${sel ? '0 0 20px rgba(0,255,136,0.6)' : '0 1px 4px rgba(0,0,0,0.5)'};display:flex;align-items:center;gap:4px;cursor:pointer;transform:${sel ? 'scale(1.2)' : 'scale(1)'}"><svg xmlns="http://www.w3.org/2000/svg" width="${sel ? 12 : 10}" height="${sel ? 12 : 10}" viewBox="0 0 24 24" fill="none" stroke="${sel ? '#060d14' : '#00ff88'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg><span style="font-size:${sel ? 10 : 9}px;font-weight:700;color:${sel ? '#060d14' : '#00ff88'};font-family:Space Grotesk">${cam.patente}</span>${sel && cam.velocidad > 0 ? `<span style="font-size:8px;font-weight:700;color:#060d14;font-family:Space Grotesk">${Math.round(cam.velocidad)}km/h</span>` : ''}</div>`;
                    return <DivMarker key={cam.patente} position={[cam.lat, cam.lng]} html={html} size={[120, 30]} onClick={() => setSeguir(sel ? null : cam.patente)} zIndexOffset={sel ? 1000 : 100} />;
                  })}

                  {cd.map((cam: any) => {
                    const sel = seguir === cam.patente;
                    const html = `<div style="background:${sel ? '#00d4ff' : '#060d14'};border:2px solid #00d4ff;border-radius:6px;padding:${sel ? '4px 8px' : '2px 6px'};box-shadow:${sel ? '0 0 20px rgba(0,212,255,0.5)' : '0 1px 3px rgba(0,0,0,0.5)'};display:flex;align-items:center;gap:4px;cursor:pointer;transform:${sel ? 'scale(1.2)' : 'scale(1)'}"><svg xmlns="http://www.w3.org/2000/svg" width="${sel ? 12 : 10}" height="${sel ? 12 : 10}" viewBox="0 0 24 24" fill="none" stroke="${sel ? '#060d14' : '#00d4ff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span style="font-size:${sel ? 10 : 9}px;font-weight:700;color:${sel ? '#060d14' : '#00d4ff'};font-family:Space Grotesk">${cam.patente}</span></div>`;
                    return <DivMarker key={cam.patente} position={[cam.lat, cam.lng]} html={html} size={[100, 30]} onClick={() => setSeguir(sel ? null : cam.patente)} zIndexOffset={sel ? 1000 : 50} />;
                  })}

                  {seguir && trail.length > 1 && trail.filter((_: any, i: number) => i % 2 === 0).map((p: any, i: number) => {
                    const opacity = 0.15 + (i / (trail.length / 2)) * 0.7;
                    return <DivMarker key={`trail-${i}`} position={[parseFloat(p.lat), parseFloat(p.lng)]} html={`<div style="width:5px;height:5px;border-radius:50%;background:rgba(0,255,136,${opacity});border:0.5px solid rgba(0,255,136,0.3)"></div>`} size={[5, 5]} />;
                  })}

                  {seguir && isEnRuta && origenObj?.lat && (
                    <DivMarker position={[origenObj.lat, origenObj.lng]} zIndexOffset={500} html={`<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="background:#00d4ff;border:3px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#060d14;font-weight:900;font-family:Space Grotesk;box-shadow:0 0 12px rgba(0,212,255,0.6)">O</div><div style="background:rgba(6,13,20,0.9);border:1px solid #00d4ff60;border-radius:4px;padding:2px 6px;white-space:nowrap"><span style="font-size:8px;color:#00d4ff;font-weight:700;font-family:Space Grotesk">${origenObj.nombre}</span></div></div>`} size={[100, 50]} />
                  )}

                  {seguir && isEnRuta && entregaObj && (
                    <DivMarker position={[entregaObj.lat, entregaObj.lng]} zIndexOffset={500} html={`<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="background:#00ff88;border:3px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(0,255,136,0.6)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#060d14" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div style="background:rgba(6,13,20,0.9);border:1px solid #00ff8860;border-radius:4px;padding:2px 6px;white-space:nowrap"><span style="font-size:8px;color:#00ff88;font-weight:700;font-family:Space Grotesk">${entregaObj.nombre}</span></div></div>`} size={[100, 50]} />
                  )}

                  {seguir && isEnRuta && destObj && (() => {
                    const c = fase === "vuelta" ? "#00d4ff" : "#a855f7";
                    const tc = fase === "vuelta" ? "#060d14" : "#fff";
                    const label = fase === "vuelta" ? "CD" : "D";
                    return <DivMarker position={[destObj.lat, destObj.lng]} zIndexOffset={500} html={`<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="background:${c};border:3px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;color:${tc};font-weight:900;font-family:Space Grotesk;box-shadow:0 0 12px ${c}99">${label}</div><div style="background:rgba(6,13,20,0.9);border:1px solid ${c}60;border-radius:4px;padding:2px 6px;white-space:nowrap"><span style="font-size:8px;color:${c};font-weight:700;font-family:Space Grotesk">${destObj.nombre}</span><span style="font-size:7px;color:#5a8090;font-family:Exo 2;margin-left:4px">~${destObj.km_restante} km</span></div></div>`} size={[120, 50]} />;
                  })()}

                  {seguir && selCam?.geocerca && !isEnRuta && (
                    <DivMarker position={[selCam.lat, selCam.lng]} html={`<div style="position:absolute;top:24px;left:50%;transform:translateX(-50%);white-space:nowrap"><div style="background:rgba(6,13,20,0.9);border:1px solid #00d4ff60;border-radius:4px;padding:2px 6px"><span style="font-size:8px;color:#00d4ff;font-weight:700;font-family:Space Grotesk">${selCam.geocerca}</span></div></div>`} size={[100, 40]} />
                  )}
                </LeafletMap>

                {/* Route info panel for followed truck */}
                {seguir && selCam && (
                  <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(6,13,20,0.95)", border: `1px solid ${isEnRuta ? "#00ff8840" : "#00d4ff40"}`, borderRadius: 10, padding: "14px 18px", zIndex: 10, backdropFilter: "blur(10px)", minWidth: 260, maxWidth: 320 }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4" style={{ color: isEnRuta ? "#00ff88" : "#00d4ff" }} />
                        <span className="font-space text-[15px] font-bold" style={{ color: "#c8e8ff" }}>{selCam.patente}</span>
                        {isEnRuta && <span className="font-space text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: selCam.velocidad > 0 ? "#060d14" : "#ff6b35", background: selCam.velocidad > 0 ? "#00ff88" : "#ff6b3520" }}>{Math.round(selCam.velocidad)} km/h</span>}
                      </div>
                      <button onClick={() => setSeguir(null)} className="cursor-pointer p-1 rounded hover:bg-[#ffffff10] transition-all"><X className="w-3.5 h-3.5" style={{ color: "#5a8090" }} /></button>
                    </div>

                    {isEnRuta && (
                      <div className="mb-2">
                        {fase && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-space text-[8px] font-bold px-2 py-0.5 rounded" style={{
                              background: fase === "ida" ? "#a855f720" : "#00d4ff20",
                              color: fase === "ida" ? "#a855f7" : "#00d4ff",
                              border: `1px solid ${fase === "ida" ? "#a855f740" : "#00d4ff40"}`,
                            }}>{fase === "ida" ? "IDA → ENTREGA" : fase === "vuelta" ? "VUELTA → CD" : "EN RUTA"}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-2" style={{ marginLeft: 2 }}>
                          <div className="flex flex-col items-center gap-0.5 pt-0.5">
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00d4ff", border: "1.5px solid #fff" }} />
                            {entregaObj && <>
                              <div style={{ width: 1, height: 16, background: "#00d4ff40" }} />
                              <Check style={{ width: 10, height: 10, color: "#00ff88" }} />
                            </>}
                            <div style={{ width: 1, height: 16, background: fase === "vuelta" ? "#00d4ff40" : "#a855f740" }} />
                            <div style={{ width: 8, height: 8, background: fase === "vuelta" ? "#00d4ff" : "#a855f7", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <div>
                              <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#5a8090" }}>CD Origen</div>
                              <div className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{origenObj?.nombre || "Desconocido"}</div>
                              {selCam.hora_salida && <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Salió {String(selCam.hora_salida).substring(11, 16)}</div>}
                            </div>
                            {entregaObj && (
                              <div>
                                <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#5a8090" }}>Entregó en</div>
                                <div className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{entregaObj.nombre}</div>
                                {entregaObj.hora && <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>{String(entregaObj.hora).substring(11, 16)}</div>}
                              </div>
                            )}
                            <div>
                              <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#5a8090" }}>{fase === "vuelta" ? "Volviendo a" : "Destino probable"}</div>
                              <div className="font-space text-[11px] font-bold" style={{ color: fase === "vuelta" ? "#00d4ff" : "#a855f7" }}>{destObj?.nombre || "—"}</div>
                              {destObj && <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>~{destObj.km_restante} km</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {!isEnRuta && selCam.geocerca && (
                      <div className="mb-2">
                        <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#5a8090" }}>Estacionado en</div>
                        <div className="font-space text-[12px] font-bold" style={{ color: "#00d4ff" }}>{selCam.geocerca}</div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                      {selCam.km_recorridos > 0 && <span className="font-exo text-[9px]" style={{ color: "#5a8090" }}>{selCam.km_recorridos} km hoy</span>}
                      {selCam.conductor && <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{selCam.conductor}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ═══ CONTROL OPERACIONAL DIARIO ═══ */}
        {tab === "CONTROL" && (() => {
          if (ctrlLoading) return <div className="text-center py-20 font-exo text-[#3a6080]"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Cargando control diario...</div>;
          if (ctrlError) return <div className="text-center py-20 font-exo"><AlertTriangle size={24} className="mx-auto mb-2" style={{ color: "#ff6b35" }} /><div style={{ color: "#ff6b35" }}>Error cargando datos</div><button onClick={() => refetchCtrl()} className="mt-3 px-4 py-1.5 rounded font-space text-[10px]" style={{ background: "#0d2035", color: "#00d4ff", border: "1px solid #0d2035" }}>REINTENTAR</button></div>;
          if (!ctrlData?.resumen) return <div className="text-center py-20 font-exo text-[#3a6080]">Sin datos para {fecha}</div>;
          const r = ctrlData.resumen;
          const cams = ctrlData.camiones || [];
          const exc = ctrlData.excesos_detalle || [];
          const vjs = ctrlData.viajes || [];
          const velHora = ctrlData.velocidad_por_hora || [];
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { label: "CAMIONES", value: r.camiones_activos, color: "#00d4ff", icon: <Truck size={14} /> },
                  { label: "KM TOTAL", value: fN(r.km_total), color: "#00ff88", icon: <Route size={14} /> },
                  { label: "LITROS", value: r.litros_total?.toFixed(1), color: "#ffcc00", icon: <Fuel size={14} /> },
                  { label: "REND km/L", value: r.rendimiento_flota?.toFixed(2), color: RC(r.rendimiento_flota), icon: <TrendingUp size={14} /> },
                  { label: "EXCESOS >90", value: r.excesos_90, color: r.excesos_90 > 0 ? "#ff6b35" : "#00ff88", icon: <Zap size={14} /> },
                  { label: "CRÍTICOS >105", value: r.excesos_105, color: r.excesos_105 > 0 ? "#ff2244" : "#00ff88", icon: <AlertTriangle size={14} /> },
                  { label: "VEL MÁX", value: `${r.vel_max_flota} km/h`, color: r.vel_max_flota > 105 ? "#ff2244" : r.vel_max_flota > 90 ? "#ff6b35" : "#00ff88", icon: <Activity size={14} /> },
                  { label: "VIAJES", value: r.viajes_total, color: "#00d4ff", icon: <MapPin size={14} /> },
                  { label: "CRUZADOS", value: `${r.viajes_cruzados}/${r.viajes_total}`, color: r.pct_facturado >= 80 ? "#00ff88" : "#ffcc00", icon: <Check size={14} /> },
                  { label: "INGRESO EST.", value: fP(r.ingreso_estimado), color: "#00ffcc", icon: <DollarSign size={14} /> },
                  { label: "% FACTURADO", value: `${r.pct_facturado}%`, color: r.pct_facturado >= 80 ? "#00ff88" : r.pct_facturado >= 50 ? "#ffcc00" : "#ff6b35", icon: <Target size={14} /> },
                ].map((kpi, i) => (
                  <div key={i} className="p-3 rounded-lg" style={{ background: "#0d1825", border: "1px solid #0d2035" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ color: kpi.color }}>{kpi.icon}</span>
                      <span className="font-space text-[8px] tracking-wider" style={{ color: "#3a6080" }}>{kpi.label}</span>
                    </div>
                    <div className="font-space text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {velHora.length > 0 && (
                <div className="p-4 rounded-lg" style={{ background: "#0d1825", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: "#c8e8ff" }}>VELOCIDAD POR HORA</div>
                  <div className="flex items-end gap-1" style={{ height: 80 }}>
                    {velHora.map((h: any, i: number) => {
                      const maxV = Math.max(...velHora.map((x: any) => parseFloat(x.vel_max) || 0), 1);
                      const pct = (parseFloat(h.vel_max) || 0) / maxV * 100;
                      const color = parseFloat(h.vel_max) > 105 ? "#ff2244" : parseFloat(h.vel_max) > 90 ? "#ff6b35" : "#00d4ff";
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="w-full rounded-t" style={{ height: `${pct}%`, background: color, minHeight: 2, opacity: 0.8 }} title={`${h.hora}h: máx ${h.vel_max}km/h, prom ${h.vel_prom}km/h, ${h.camiones_activos} camiones, ${h.excesos} excesos`} />
                          <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{h.hora}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Hora del día</span>
                    <div className="flex gap-3">
                      <span className="font-exo text-[7px] flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: "#00d4ff" }} />Normal</span>
                      <span className="font-exo text-[7px] flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: "#ff6b35" }} />{">"}90</span>
                      <span className="font-exo text-[7px] flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: "#ff2244" }} />{">"}105</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-lg" style={{ background: "#0d1825", border: "1px solid #0d2035" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-space text-[10px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>DETALLE POR CAMIÓN ({cams.length})</div>
                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
                    <input value={filtroCtrl} onChange={e => setFiltroCtrl(e.target.value)} placeholder="Buscar patente..."
                      className="font-exo text-[9px] pl-6 pr-3 py-1 rounded outline-none w-40"
                      style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
                  </div>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: 400 }}>
                  <table className="w-full text-left">
                    <thead className="sticky top-0" style={{ background: "#0d1825" }}>
                      <tr className="font-space text-[8px] tracking-wider" style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
                        {[
                          { key: "patente", label: "PATENTE", right: false },
                          { key: "conductor", label: "CONDUCTOR", right: false },
                          { key: "km_dia", label: "KM", right: true },
                          { key: "litros_dia", label: "LITROS", right: true },
                          { key: "rendimiento", label: "km/L", right: true },
                          { key: "vel_max", label: "VEL MÁX", right: true },
                          { key: "puntos_sobre_90", label: ">90", right: true },
                          { key: "puntos_sobre_105", label: ">105", right: true },
                          { key: "pct_ralenti", label: "% RALENTÍ", right: true },
                          { key: "tanque_min", label: "TANQUE", right: true },
                        ].map(h => (
                          <th key={h.key} className={`py-2 px-2 cursor-pointer hover:text-[#c8e8ff] transition-colors select-none ${h.right ? "text-right" : ""}`}
                            onClick={() => setSortCtrl(s => ({ col: h.key, asc: s.col === h.key ? !s.asc : true }))}>
                            {h.label} {sortCtrl.col === h.key ? (sortCtrl.asc ? "↑" : "↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cams
                        .filter((c: any) => !filtroCtrl || (c.patente || "").toLowerCase().includes(filtroCtrl.toLowerCase()) || (c.conductor || "").toLowerCase().includes(filtroCtrl.toLowerCase()))
                        .sort((a: any, b: any) => {
                          const col = sortCtrl.col;
                          const va = col === "patente" || col === "conductor" ? (a[col] || "") : parseFloat(a[col]) || 0;
                          const vb = col === "patente" || col === "conductor" ? (b[col] || "") : parseFloat(b[col]) || 0;
                          return sortCtrl.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
                        })
                        .map((c: any, i: number) => (
                        <tr key={i} className="font-exo text-[10px] hover:bg-[#0a1520]" style={{ color: "#c8e8ff", borderBottom: "1px solid #0a1520" }}>
                          <td className="py-1.5 px-2 font-bold" style={{ color: "#00d4ff" }}>{c.patente}</td>
                          <td className="py-1.5 px-2 truncate max-w-[120px]" style={{ color: "#6a8fa8" }}>{c.conductor || "—"}</td>
                          <td className="py-1.5 px-2 text-right font-bold" style={{ color: parseFloat(c.km_dia) > 0 ? "#00ff88" : "#3a6080" }}>{c.km_dia || 0}</td>
                          <td className="py-1.5 px-2 text-right" style={{ color: "#ffcc00" }}>{c.litros_dia || "—"}</td>
                          <td className="py-1.5 px-2 text-right font-bold" style={{ color: RC(parseFloat(c.rendimiento)) }}>{c.rendimiento || "—"}</td>
                          <td className="py-1.5 px-2 text-right font-bold" style={{ color: parseFloat(c.vel_max) > 105 ? "#ff2244" : parseFloat(c.vel_max) > 90 ? "#ff6b35" : "#c8e8ff" }}>{c.vel_max || 0}</td>
                          <td className="py-1.5 px-2 text-right" style={{ color: c.puntos_sobre_90 > 0 ? "#ff6b35" : "#3a6080" }}>{c.puntos_sobre_90}</td>
                          <td className="py-1.5 px-2 text-right" style={{ color: c.puntos_sobre_105 > 0 ? "#ff2244" : "#3a6080" }}>{c.puntos_sobre_105}</td>
                          <td className="py-1.5 px-2 text-right" style={{ color: parseFloat(c.pct_ralenti) > 30 ? "#ff6b35" : "#6a8fa8" }}>{c.pct_ralenti || 0}%</td>
                          <td className="py-1.5 px-2 text-right" style={{ color: c.tanque_min < 20 ? "#ff2244" : "#6a8fa8" }}>{c.tanque_min}–{c.tanque_max}%</td>
                        </tr>
                      ))}
                      {cams.length === 0 && <tr><td colSpan={10} className="py-8 text-center font-exo text-[#3a6080]">Sin datos GPS para esta fecha</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {exc.length > 0 && (
                <div className="p-4 rounded-lg" style={{ background: "#0d1825", border: "1px solid #1a0a0a" }}>
                  <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: "#ff6b35" }}>
                    <AlertTriangle size={12} className="inline mr-1" />EXCESOS DE VELOCIDAD ({exc.length}) <span className="font-exo text-[8px]" style={{ color: "#6a8fa8" }}>· click para ver en mapa</span>
                  </div>
                  <div className="grid gap-1 max-h-[200px] overflow-y-auto">
                    {exc.map((e: any, i: number) => (
                      <div key={i} onClick={() => e.lat && e.lng && setAlertaMapOpen(e)}
                        className="flex items-center justify-between py-1 px-2 rounded cursor-pointer hover:brightness-125 transition-all"
                        style={{ background: "#0a0a15", border: `1px solid ${e.velocidad > 105 ? "#ff224430" : "#ff6b3520"}` }}>
                        <div className="flex items-center gap-3">
                          <MapPin size={10} style={{ color: e.velocidad > 105 ? "#ff2244" : "#ff6b35" }} />
                          <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{e.patente}</span>
                          <span className="font-exo text-[9px]" style={{ color: "#6a8fa8" }}>{e.conductor || ""}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-exo text-[9px]" style={{ color: "#6a8fa8" }}>{new Date(e.hora).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="font-space text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: e.velocidad > 105 ? "#ff2244" : "#ff6b35", background: e.velocidad > 105 ? "#ff224415" : "#ff6b3510" }}>
                            {e.velocidad} km/h
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {vjs.length > 0 && (
                <div className="p-4 rounded-lg" style={{ background: "#0d1825", border: "1px solid #0d2035" }}>
                  <div className="font-space text-[10px] font-bold tracking-wider mb-3" style={{ color: "#c8e8ff" }}>
                    <Route size={12} className="inline mr-1" />VIAJES DEL DÍA ({vjs.length})
                  </div>
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {vjs.map((v: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
                        <div className="flex items-center gap-2">
                          <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>{v.patente}</span>
                          <span className="font-exo text-[9px]" style={{ color: "#6a8fa8" }}>{v.origen_contrato || v.origen_nombre}</span>
                          <span style={{ color: "#3a6080" }}>→</span>
                          <span className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{v.destino_contrato || v.destino_nombre}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-exo text-[9px]" style={{ color: "#6a8fa8" }}>{v.km}km · {v.duracion}min</span>
                          <span className="font-space text-[8px] px-1.5 py-0.5 rounded font-bold" style={{
                            color: v.estado_factura === "CRUZADO" ? "#00ff88" : "#ffcc00",
                            background: v.estado_factura === "CRUZADO" ? "#00ff8815" : "#ffcc0015"
                          }}>
                            {v.estado_factura === "CRUZADO" ? `$${fN(v.tarifa)}` : "PENDIENTE"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {alertaMapOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setAlertaMapOpen(null)}>
                  <div className="w-[90vw] max-w-[700px] rounded-xl overflow-hidden" style={{ background: "#0d1825", border: "1px solid #0d2035" }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={14} style={{ color: alertaMapOpen.velocidad > 105 ? "#ff2244" : "#ff6b35" }} />
                        <span className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{alertaMapOpen.patente}</span>
                        <span className="font-space text-[13px] font-bold" style={{ color: alertaMapOpen.velocidad > 105 ? "#ff2244" : "#ff6b35" }}>{alertaMapOpen.velocidad} km/h</span>
                        <span className="font-exo text-[10px]" style={{ color: "#6a8fa8" }}>{alertaMapOpen.conductor || ""}</span>
                        <span className="font-exo text-[10px]" style={{ color: "#6a8fa8" }}>{new Date(alertaMapOpen.hora).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      </div>
                      <button onClick={() => setAlertaMapOpen(null)} className="cursor-pointer" style={{ color: "#6a8fa8" }}><X size={16} /></button>
                    </div>
                    <div style={{ height: 400 }}>
                      <LeafletMap center={[alertaMapOpen.lat, alertaMapOpen.lng]} zoom={15}>
                        <DivMarker position={[alertaMapOpen.lat, alertaMapOpen.lng]} html={`<div style="display:flex;flex-direction:column;align-items:center"><div style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;font-family:Space Grotesk;background:${alertaMapOpen.velocidad > 105 ? '#ff2244' : '#ff6b35'};color:#fff;box-shadow:0 0 12px ${alertaMapOpen.velocidad > 105 ? '#ff2244' : '#ff6b35'}">${alertaMapOpen.velocidad} km/h</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${alertaMapOpen.velocidad > 105 ? '#ff2244' : '#ff6b35'}"></div></div>`} size={[80, 30]} />
                      </LeafletMap>
                    </div>
                    <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: "1px solid #0d2035" }}>
                      <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
                        GPS: {alertaMapOpen.lat?.toFixed(5)}, {alertaMapOpen.lng?.toFixed(5)}
                      </span>
                      <a href={`https://www.google.com/maps?q=${alertaMapOpen.lat},${alertaMapOpen.lng}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1 rounded font-space text-[9px] font-bold cursor-pointer"
                        style={{ background: "#00d4ff15", color: "#00d4ff", border: "1px solid #00d4ff30" }}>
                        <Navigation size={10} /> ABRIR EN GOOGLE MAPS
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ RESUMEN ═══ */}
        {tab === "RESUMEN" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { l: "CAMIONES", v: `${f.camiones || 0}/83`, c: "#00d4ff", icon: Truck, go: "FLOTA" as Tab },
                { l: "VIAJES MES", v: f.viajes || 0, c: "#a855f7", icon: Activity, go: "VIAJES" as Tab },
                { l: "KM TOTAL", v: fN(parseFloat(f.km) || 0), c: "#00ff88", icon: TrendingUp },
                { l: "KM/L", v: f.rend || "--", c: RC(parseFloat(f.rend) || 0), icon: Fuel },
                { l: "INGRESO MES", v: fP(fi.ingreso_acumulado || 0), c: "#00ff88", icon: DollarSign, go: "ERR" as Tab },
                { l: "% CRUZADOS", v: `${fi.pct_cruzados || 0}%`, c: (fi.pct_cruzados || 0) > 50 ? "#00ff88" : "#ffcc00", icon: Target, go: "VIAJES" as Tab },
                { l: "KM/CAM PROY", v: fN(p.km_proyectado_camion || 0), c: (p.km_proyectado_camion || 0) >= 11000 ? "#00ff88" : "#ff6b35", icon: MapPin },
                { l: "SIN MAPEAR", v: (sinMapear?.sin_mapear || []).length, c: (sinMapear?.sin_mapear || []).length > 20 ? "#ffcc00" : "#3a6080", icon: AlertTriangle, go: "AGENTE" as Tab },
              ].map(k => {
                const Icon = k.icon;
                return (
                  <div key={k.l} onClick={() => k.go && setTab(k.go)} className={`rounded-lg p-3 ${k.go ? "cursor-pointer hover:opacity-90 hover:brightness-110 transition-all" : ""}`} style={{ background: "#060d14", borderTop: `2px solid ${k.c}`, border: "1px solid #0d2035" }}>
                    <Icon className="w-3.5 h-3.5 mb-1.5" style={{ color: `${k.c}50` }} />
                    <div className="font-space text-[16px] font-bold leading-none" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px] tracking-wider uppercase mt-1" style={{ color: "#3a6080" }}>{k.l}{k.go ? " >" : ""}</div>
                  </div>
                );
              })}
            </div>

            {/* Tendencia + Hoy */}
            <div className="grid grid-cols-2 gap-4">
              {/* Tendencia mensual */}
              <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-exo text-[8px] tracking-wider uppercase mb-3" style={{ color: "#00d4ff" }}>TENDENCIA DIARIA · MARZO</div>
                {(mes?.tendencia || []).length > 0 && (
                  <div className="flex items-end gap-0.5" style={{ height: 90 }}>
                    {(mes?.tendencia || []).map((d: any) => {
                      const maxKm = Math.max(...(mes?.tendencia || []).map((t: any) => parseFloat(t.km) || 0));
                      const h = maxKm > 0 ? (parseFloat(d.km) / maxKm) * 80 : 5;
                      return (
                        <div key={d.dia} className="flex-1 flex flex-col items-center gap-0.5">
                          <span className="font-space text-[6px]" style={{ color: RC(parseFloat(d.rend) || 0) }}>{d.rend}</span>
                          <div className="w-full rounded-t" style={{ height: Math.max(3, h), background: `${RC(parseFloat(d.rend) || 0)}80` }} />
                          <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{d.dia.slice(8)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* P&L MES */}
              <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-exo text-[8px] tracking-wider uppercase mb-3" style={{ color: "#00ff88" }}>P&L DEL MES</div>
                {plMes && (
                  <div className="space-y-2">
                    {[
                      { l: "Viajes facturables", v: `${plMes.viajes_facturables || 0} / ${plMes.total_viajes || 0}`, c: "#c8e8ff" },
                      { l: "KM total", v: fN(plMes.km_total || 0), c: "#c8e8ff" },
                      { l: "KM/L promedio", v: plMes.rend_promedio || "--", c: RC(parseFloat(plMes.rend_promedio) || 0) },
                      { l: "Ingreso tarifa", v: fP(plMes.ingreso_total || 0), c: "#00ff88" },
                      { l: "Costo diesel", v: fP(plMes.costo_diesel_total || 0), c: "#ff6b35" },
                      { l: "Costo CVM", v: fP(plMes.costo_cvm_total || 0), c: "#ff6b35" },
                      { l: "Costo total", v: fP(plMes.costo_total || 0), c: "#ff6b35" },
                    ].map(k => (
                      <div key={k.l} className="flex justify-between">
                        <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{k.l}</span>
                        <span className="font-space text-[10px] font-bold" style={{ color: k.c }}>{k.v}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-1" style={{ borderTop: "1px solid #0d2035" }}>
                      <div className="flex justify-between">
                        <span className="font-exo text-[10px] font-bold" style={{ color: "#3a6080" }}>MARGEN BRUTO</span>
                        <span className="font-space text-[13px] font-bold" style={{ color: (plMes.margen_total || 0) >= 0 ? "#00ff88" : "#ff2244" }}>
                          {fP(plMes.margen_total || 0)}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <span className="font-space text-[10px]" style={{ color: (plMes.margen_pct || 0) >= 0 ? "#00ff88" : "#ff2244" }}>
                          {plMes.margen_pct || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Productividad barra */}
            <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#3a6080" }}>PRODUCTIVIDAD vs META CONTRATO</span>
                <span className="font-space text-[10px] font-bold" style={{ color: (p.km_proyectado_camion || 0) >= 11000 ? "#00ff88" : "#ff6b35" }}>
                  {fN(p.km_proyectado_camion || 0)} / {fN(p.meta_km_camion || 11000)} km/cam
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: "#0d2035" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, Math.round((p.km_proyectado_camion || 0) / (p.meta_km_camion || 11000) * 100))}%`,
                  background: (p.km_proyectado_camion || 0) >= 11000 ? "#00ff88" : (p.km_proyectado_camion || 0) >= 6600 ? "#ffcc00" : "#ff2244"
                }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Día {mes?.dia_actual}/{mes?.dias_mes}</span>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{Math.round((p.km_proyectado_camion || 0) / (p.meta_km_camion || 11000) * 100)}% de meta</span>
              </div>
            </div>
          </>
        )}

        {/* ═══ VIAJES MES ═══ */}
        {tab === "VIAJES" && viajesMes && (() => {
          const conT = viajesMes.viajes_con_tarifa || [];
          const sinT = viajesMes.viajes_sin_tarifa || [];
          return (
            <>
              {/* KPIs viajes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {[
                  { l: "TOTAL VIAJES", v: viajesMes.total, c: "#a855f7" },
                  { l: "CON TARIFA", v: viajesMes.con_tarifa, c: "#00ff88" },
                  { l: "SIN TARIFA", v: viajesMes.sin_tarifa, c: "#ffcc00" },
                  { l: "% CRUZADOS", v: `${viajesMes.pct_cruzados}%`, c: viajesMes.pct_cruzados > 50 ? "#00ff88" : "#ffcc00" },
                  { l: "INGRESO MES", v: fP(plMes?.ingreso_total || viajesMes.ingreso_total || 0), c: "#00ff88" },
                  { l: "COSTO MES", v: fP(plMes?.costo_total || 0), c: "#ff6b35" },
                  { l: "MARGEN", v: fP(plMes?.margen_total || 0), c: (plMes?.margen_total || 0) >= 0 ? "#00ff88" : "#ff2244" },
                  { l: "MARGEN %", v: `${plMes?.margen_pct || 0}%`, c: (plMes?.margen_pct || 0) >= 0 ? "#00ff88" : "#ff2244" },
                ].map(k => (
                  <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                    <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* Viajes CON tarifa */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #00ff8830" }}>
                <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#00ff88" }}>
                    VIAJES CON TARIFA ({conT.length}) · {fP(viajesMes.ingreso_total)}
                  </span>
                </div>
                <div className="overflow-auto" style={{ maxHeight: 300 }}>
                  <table className="w-full">
                    <thead><tr style={{ background: "#0a1520" }}>
                      {["FECHA", "PATENTE", "CONDUCTOR", "RUTA CONTRATO", "LOTE", "KM", "KM/L", "INGRESO", "COSTO", "MARGEN"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#00ff88" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {conT.map((v: any, i: number) => (
                        <tr key={v.id} className="cursor-pointer hover:brightness-125" onClick={() => setViajeRutaId(v.id)} style={{ background: viajeRutaId === v.id ? "#0a2540" : i % 2 === 0 ? "transparent" : "#0a152030" }}>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>{v.fecha?.slice(5)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#c8e8ff" }}>{v.patente}</td>
                          <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>{(v.conductor || "").substring(0, 15)}</td>
                          <td className="font-exo text-[9px] px-3 py-1" style={{ color: "#00d4ff" }}>{v.origen_contrato} → {v.destino_contrato}</td>
                          <td className="font-space text-[8px] px-3 py-1" style={{ color: "#3a6080" }}>L{v.lote}</td>
                          <td className="font-space text-[9px] px-3 py-1" style={{ color: "#c8e8ff" }}>{Math.round(v.km || 0)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: RC(v.rend || 0) }}>{v.rend?.toFixed(2) || "--"}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#00ff88" }}>{fP(v.tarifa || v.ingreso_tarifa || 0)}</td>
                          <td className="font-space text-[9px] px-3 py-1" style={{ color: "#ff6b35" }}>{fP(v.costo_total || 0)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: (v.margen_bruto || 0) >= 0 ? "#00ff88" : "#ff2244" }}>{fP(v.margen_bruto || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viajeRutaId && <ViajeReconstructorPanel viajeId={viajeRutaId} onClose={() => setViajeRutaId(null)} />}

              {/* VIAJES SIN TARIFA — SISTEMA INTERACTIVO */}
              <MapeoInteractivo />
            </>
          );
        })()}

        {/* ═══ ERR: Estado de Resultados ═══ */}
        {tab === "ERR" && errData && (() => {
          const e = errData.err || {};
          const fechaLabel = new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
          return (
            <>
              <div className="flex items-center justify-between">
                <div className="font-space text-[12px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>
                  ERR CENCOSUD · {fechaLabel.toUpperCase()}
                </div>
                <div className="font-space text-[18px] font-bold" style={{ color: "#00ff88" }}>{fP(e.ingreso_estimado || 0)}</div>
              </div>

              {/* KPIs ERR */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { l: "CAMIONES", v: e.camiones || 0, c: "#00d4ff" },
                  { l: "VIAJES", v: e.viajes || 0, c: "#a855f7" },
                  { l: "CRUZADOS", v: `${e.viajes_cruzados || 0} (${e.pct_cruzados || 0}%)`, c: (e.pct_cruzados || 0) > 50 ? "#00ff88" : "#ffcc00" },
                  { l: "KM TOTAL", v: fN(e.km_total || 0), c: "#00ff88" },
                  { l: "KM/L", v: e.rend_promedio || "--", c: RC(e.rend_promedio || 0) },
                ].map(k => (
                  <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                    <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* P&L del dia */}
              {plDia && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    { l: "INGRESO DIA", v: fP(plDia.ingreso_total || 0), c: "#00ff88" },
                    { l: "COSTO DIESEL", v: fP(plDia.costo_diesel_total || 0), c: "#ff6b35" },
                    { l: "COSTO CVM", v: fP(plDia.costo_cvm_total || 0), c: "#ff6b35" },
                    { l: "COSTO TOTAL", v: fP(plDia.costo_total || 0), c: "#ff6b35" },
                    { l: "MARGEN", v: `${fP(plDia.margen_total || 0)} (${plDia.margen_pct || 0}%)`, c: (plDia.margen_total || 0) >= 0 ? "#00ff88" : "#ff2244" },
                  ].map(k => (
                    <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                      <div className="font-space text-[12px] font-bold" style={{ color: k.c }}>{k.v}</div>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Por ruta contrato */}
              {(errData.por_ruta || []).length > 0 && (
                <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                  <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#00ff88" }}>FACTURACION POR RUTA</span>
                  </div>
                  <table className="w-full">
                    <thead><tr style={{ background: "#0a1520" }}>
                      {["LOTE", "ORIGEN", "DESTINO", "CLASE", "VIAJES", "KM", "KM/L", "TARIFA", "INGRESO"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#3a6080" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(errData.por_ruta || []).map((r: any, i: number) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
                          <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#00d4ff" }}>L{r.lote}</td>
                          <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.origen}</td>
                          <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.destino}</td>
                          <td className="font-space text-[8px] px-3 py-1.5" style={{ color: "#3a6080" }}>{r.clase}</td>
                          <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.viajes}</td>
                          <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(r.km) || 0)}</td>
                          <td className="font-space text-[9px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(r.rend) || 0) }}>{r.rend || "--"}</td>
                          <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#00ff88" }}>{fP(r.tarifa)}</td>
                          <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#00ff88" }}>{fP(r.tarifa * r.viajes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Circuitos */}
              {(errData.circuitos || []).length > 0 && (
                <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #a855f730" }}>
                  <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                    <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#a855f7" }}>CIRCUITOS DEL DIA · {(errData.circuitos || []).length} camiones con 2+ viajes</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {(errData.circuitos || []).map((c: any) => (
                      <div key={c.patente} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${c.ingreso_circuito > 0 ? "#00ff88" : "#3a6080"}` }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{c.conductor?.substring(0, 18)}</span>
                            <span className="font-space text-[9px]" style={{ color: "#00d4ff" }}>{c.viajes}v · {fN(parseFloat(c.km_circuito) || 0)}km</span>
                          </div>
                          <span className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{c.ingreso_circuito > 0 ? fP(parseInt(c.ingreso_circuito)) : "--"}</span>
                        </div>
                        <div className="font-exo text-[8px] mt-1 flex items-center gap-1 flex-wrap" style={{ color: "#3a6080" }}>
                          {(c.secuencia || []).map((s: string, i: number) => (
                            <span key={i}>
                              {i > 0 && <span style={{ color: "#0d2035" }}> | </span>}
                              <span style={{ color: "#c8e8ff" }}>{s}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Por camión */}
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <span className="font-exo text-[8px] tracking-wider uppercase font-bold" style={{ color: "#3a6080" }}>DETALLE POR CAMION</span>
                </div>
                <table className="w-full">
                  <thead><tr style={{ background: "#0a1520" }}>
                    {["PATENTE", "CONDUCTOR", "VIAJES", "KM", "KM/L", "HORAS", "INGRESO"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(errData.por_camion || []).map((c: any, i: number) => (
                      <tr key={c.patente} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
                        <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                        <td className="font-exo text-[8px] px-3 py-1.5" style={{ color: "#3a6080" }}>{(c.conductor || "").substring(0, 18)}</td>
                        <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.viajes}</td>
                        <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km) || 0)}</td>
                        <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(c.rend) || 0) }}>{c.rend || "--"}</td>
                        <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{c.horas}h</td>
                        <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: parseInt(c.ingreso) > 0 ? "#00ff88" : "#3a6080" }}>{parseInt(c.ingreso) > 0 ? fP(parseInt(c.ingreso)) : "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        {/* ═══ RUTAS ═══ */}
        {tab === "RUTAS" && dash && (
          <>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#00d4ff" }}>
              VIAJES DEL DIA CRUZADOS CON TARIFAS · {dash.viajes_cruzados}/{dash.resumen?.viajes} ({dash.pct_cruzados}%)
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d2035" }}>
                    {["ORIGEN", "DESTINO", "VIAJES", "KM", "KM/L", "LOTE", "TARIFA", "INGRESO", "ESTADO"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(dash.rutas || []).map((r: any, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520", borderBottom: "1px solid #0d203530" }}>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{(r.origen_nombre || "").substring(0, 22)}</td>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{(r.destino_nombre || "").substring(0, 22)}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{r.viajes}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(r.km) || 0)}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(r.rend) || 0) }}>{r.rend || "--"}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{r.lote || "-"}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: r.tarifa ? "#00ff88" : "#3a6080" }}>{r.tarifa ? fP(r.tarifa) : "-"}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#00ff88" }}>{r.ingreso_estimado ? fP(r.ingreso_estimado) : "-"}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-exo text-[8px] px-1.5 py-0.5 rounded" style={{
                          color: r.estado_match === "CRUZADO" ? "#00ff88" : r.estado_match === "PARCIAL" ? "#ffcc00" : "#ff2244",
                          border: `1px solid ${r.estado_match === "CRUZADO" ? "#00ff8830" : r.estado_match === "PARCIAL" ? "#ffcc0030" : "#ff224430"}`,
                        }}>{r.estado_match}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#0d2035", borderTop: "2px solid #00d4ff30" }}>
                    <td colSpan={2} className="font-space text-[9px] font-bold px-3 py-2" style={{ color: "#c8e8ff" }}>TOTAL</td>
                    <td className="font-space text-[10px] font-bold px-3 py-2" style={{ color: "#00d4ff" }}>{(dash.rutas || []).reduce((s: number, r: any) => s + (r.viajes || 0), 0)}</td>
                    <td className="font-space text-[10px] font-bold px-3 py-2" style={{ color: "#c8e8ff" }}>{fN((dash.rutas || []).reduce((s: number, r: any) => s + (parseFloat(r.km) || 0), 0))}</td>
                    <td colSpan={3} className="px-3 py-2" />
                    <td className="font-space text-[10px] font-bold px-3 py-2" style={{ color: "#00ff88" }}>{fP((dash.rutas || []).reduce((s: number, r: any) => s + (r.ingreso_estimado || 0), 0))}</td>
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="font-exo text-[9px] mt-2" style={{ color: "#3a6080" }}>
              Total ingreso estimado dia: <span className="font-space font-bold" style={{ color: "#00ff88" }}>{fP(dash.ingreso_estimado || 0)}</span>
            </div>
          </>
        )}

        {/* ═══ FLOTA ═══ */}
        {tab === "FLOTA" && flotaData && (() => {
          const allCams = flotaData.camiones || [];
          const filteredCams = allCams.filter((c: any) => !filtroFlota || (c.patente || "").toLowerCase().includes(filtroFlota.toLowerCase()) || (c.conductor || "").toLowerCase().includes(filtroFlota.toLowerCase()));
          const sortedCams = [...filteredCams].sort((a: any, b: any) => {
            const col = sortFlota.col;
            const va = col === "patente" || col === "conductor" || col === "estado" ? (a[col] || "") : parseFloat(a[col]) || 0;
            const vb = col === "patente" || col === "conductor" || col === "estado" ? (b[col] || "") : parseFloat(b[col]) || 0;
            return sortFlota.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
          });
          const okCount = allCams.filter((c: any) => c.estado === "OK").length;
          const bajoCount = allCams.filter((c: any) => c.estado === "BAJO").length;
          const critCount = allCams.filter((c: any) => c.estado !== "OK" && c.estado !== "BAJO").length;
          return (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-exo text-[9px] tracking-wider uppercase" style={{ color: "#00d4ff" }}>
                  FLOTA CENCOSUD · {flotaData.total}/{flotaData.contratados} CAMIONES ACTIVOS
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-exo text-[8px] flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: "#00ff88" }} />{okCount} OK</span>
                  <span className="font-exo text-[8px] flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: "#ffcc00" }} />{bajoCount} Bajo</span>
                  <span className="font-exo text-[8px] flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: "#ff2244" }} />{critCount} Crítico</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
                  <input value={filtroFlota} onChange={e => setFiltroFlota(e.target.value)} placeholder="Buscar patente o conductor..."
                    className="font-exo text-[9px] pl-6 pr-3 py-1 rounded outline-none w-52"
                    style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
                </div>
                <div className="font-space text-[11px] font-bold" style={{ color: flotaData.total >= 58 ? "#00ff88" : "#ff6b35" }}>
                  {Math.round(flotaData.total / flotaData.contratados * 100)}%
                </div>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: "#0d2035" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(flotaData.total / flotaData.contratados * 100))}%`, background: flotaData.total >= 58 ? "#00ff88" : "#ff6b35" }} />
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <div className="overflow-auto" style={{ maxHeight: 500 }}>
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr style={{ background: "#0d2035" }}>
                    {[
                      { key: "patente", label: "PATENTE" },
                      { key: "conductor", label: "CONDUCTOR" },
                      { key: "viajes", label: "VIAJES" },
                      { key: "km_mes", label: "KM MES" },
                      { key: "km_proyectado", label: "KM PROY" },
                      { key: "pct_meta", label: "% META" },
                      { key: "rend", label: "KM/L" },
                      { key: "dias_activo", label: "DIAS" },
                      { key: "estado", label: "ESTADO" },
                    ].map(h => (
                      <th key={h.key} className="font-exo text-[7px] tracking-wider text-left px-3 py-2 cursor-pointer hover:text-[#c8e8ff] transition-colors select-none"
                        style={{ color: sortFlota.col === h.key ? "#c8e8ff" : "#3a6080" }}
                        onClick={() => setSortFlota(s => ({ col: h.key, asc: s.col === h.key ? !s.asc : true }))}>
                        {h.label} {sortFlota.col === h.key ? (sortFlota.asc ? "↑" : "↓") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCams.map((c: any, i: number) => (
                    <tr key={c.patente} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.patente}</td>
                      <td className="font-exo text-[8px] px-3 py-1.5" style={{ color: "#3a6080" }}>{(c.conductor || "").substring(0, 18)}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{c.viajes}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{fN(parseFloat(c.km_mes) || 0)}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244" }}>{fN(c.km_proyectado)}</td>
                      <td className="font-space text-[10px] px-3 py-1.5" style={{ color: c.pct_meta >= 100 ? "#00ff88" : c.pct_meta >= 60 ? "#ffcc00" : "#ff2244" }}>{c.pct_meta}%</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: RC(parseFloat(c.rend) || 0) }}>{c.rend || "--"}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{c.dias_activo}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-exo text-[8px] px-1.5 py-0.5 rounded" style={{
                          color: c.estado === "OK" ? "#00ff88" : c.estado === "BAJO" ? "#ffcc00" : "#ff2244",
                          background: c.estado === "OK" ? "#00ff8810" : c.estado === "BAJO" ? "#ffcc0010" : "#ff224410",
                          border: `1px solid ${c.estado === "OK" ? "#00ff8830" : c.estado === "BAJO" ? "#ffcc0030" : "#ff224430"}`,
                        }}>{c.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
          );
        })()}

        {tab === "AGENTE" && <SuperAgentePanel saEstado={saEstado} saMsgs={saMsgs} refetchSaMsgs={refetchSaMsgs} paramData={paramData} refetchParams={refetchParams} intelData={intelData} refetchIntel={refetchIntel} />}

        {/* ═══ TARIFAS ═══ */}
        {tab === "TARIFAS" && tarifasData && (() => {
          const allTarifas = tarifasData.tarifas || [];
          const filtered = allTarifas.filter((t: any) => {
            if (!filtroTarifas) return true;
            const f = filtroTarifas.toLowerCase();
            return (t.origen || "").toLowerCase().includes(f) || (t.destino || "").toLowerCase().includes(f) || `L${t.lote}`.toLowerCase().includes(f);
          });
          const lotes = [...new Set(filtered.map((t: any) => t.lote))].sort();
          return (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="font-exo text-[9px] tracking-wider uppercase" style={{ color: "#00d4ff" }}>
                TARIFAS CONTRATO · {allTarifas.length} RUTAS · {lotes.length} LOTES
              </span>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#3a6080" }} />
                <input value={filtroTarifas} onChange={e => setFiltroTarifas(e.target.value)} placeholder="Buscar ruta o lote..."
                  className="font-exo text-[9px] pl-6 pr-3 py-1 rounded outline-none w-48"
                  style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
              </div>
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <div className="overflow-auto" style={{ maxHeight: 500 }}>
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr style={{ background: "#0d2035" }}>
                    {["LOTE", "CLASE", "ORIGEN", "DESTINO", "TARIFA"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t: any, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#00d4ff" }}>L{t.lote}</td>
                      <td className="font-space text-[9px] px-3 py-1.5" style={{ color: "#3a6080" }}>{t.clase}</td>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{t.origen}</td>
                      <td className="font-exo text-[9px] px-3 py-1.5" style={{ color: "#c8e8ff" }}>{t.destino}</td>
                      <td className="font-space text-[10px] font-bold px-3 py-1.5" style={{ color: "#00ff88" }}>{fP(t.tarifa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
          );
        })()}

        {/* ═══ MAPA — GEOCERCAS KML OFICIAL ═══ */}
        {tab === "MAPA" && (
          <div style={{ margin: "-16px" }}>
            <div style={{ padding: "8px 16px", borderBottom: "1px solid #0d2035", display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={12} color="#00d4ff" />
              <span className="font-exo text-[9px] tracking-wider uppercase" style={{ color: "#00d4ff" }}>
                Geocercas Oficiales · Regla Absoluta · Fuente KML
              </span>
            </div>
            <MapaGeocercasCencosud />
          </div>
        )}

      </div>
    </div>
  );
}

function SuperAgentePanel({ saEstado, saMsgs, refetchSaMsgs, paramData, refetchParams, intelData, refetchIntel }: any) {
  const [msg, setMsg] = useState("");
  const [hist, setHist] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editParam, setEditParam] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [subTab, setSubTab] = useState<"INTEL" | "ALIAS" | "ALERTAS" | "PARAMS" | "CHAT">("INTEL");
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/cencosud/agente/chat-historial").then(r => r.json()).then(d => {
      setHist((d.historial || []).map((h: any) => ({ rol: h.rol, texto: h.mensaje })));
    }).catch(() => {});
  }, []);

  useEffect(() => { chatRef.current?.scrollIntoView({ behavior: "smooth" }); }, [hist]);

  const enviar = async () => {
    if (!msg.trim()) return;
    const texto = msg; setMsg(""); setLoading(true);
    setHist(h => [...h, { rol: "CEO", texto }]);
    try {
      const r = await fetch("/api/cencosud/agente/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: texto }) });
      const d = await r.json();
      setHist(h => [...h, { rol: "AGENTE", texto: d.respuesta }]);
    } catch { setHist(h => [...h, { rol: "AGENTE", texto: "Error de conexión" }]); }
    setLoading(false);
  };

  const guardarParam = async (clave: string) => {
    await fetch(`/api/cencosud/parametros/${clave}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: parseFloat(editVal) }) });
    setEditParam(null); refetchParams();
  };

  const ejecutarAgente = async () => {
    await fetch("/api/cencosud/agente/ejecutar", { method: "POST" });
    refetchSaMsgs(); refetchIntel();
  };

  const mensajes = saMsgs?.mensajes || [];
  const noLeidos = saEstado?.total_no_leidos || 0;
  const params = paramData?.parametros || [];
  const categorias = ["FINANCIERO", "OPERACIONAL", "ALERTAS"];
  const colorTipo = (t: string): string => ({ OPERACION: "#00d4ff", FINANCIERO: "#00ff88", ANOMALIA: "#ff2244", META: "#ffcc00", CONDUCTOR: "#a78bfa", INACTIVIDAD: "#ff6b35" }[t] || "#3a6080");

  const confirmarAlias = async (id: number) => {
    await fetch(`/api/cencosud/alias/${id}/confirmar`, { method: "POST" });
    refetchIntel();
  };

  const intel = intelData || {};
  const al = intel.alias || {};
  const tr = intel.trayectos || {};
  const bl = intel.billing || {};
  const lotes = bl.por_lote || [];
  const aliasRecientes = al.recientes || [];
  const sinMap = intel.sin_mapear || [];

  return (
    <div className="space-y-3">
      <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #00d4ff30", borderTop: "3px solid #00d4ff" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5" style={{ color: "#00d4ff" }} />
            <div>
              <div className="font-space text-[12px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>SUPER AGENTE CENCOSUD</div>
              <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>GPS-Proximity · Consolidación Trayectos · Billing Intelligence · Auto cada 30m</div>
            </div>
            {saEstado?.estado && (
              <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#00ff8815", color: "#00ff88", border: "1px solid #00ff8830" }}>
                {saEstado.estado.ciclos_hoy || 0} ciclos · {saEstado.estado.ultimo_ciclo ? new Date(saEstado.estado.ultimo_ciclo).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--"}
              </span>
            )}
            {noLeidos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{noLeidos} nuevas</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={ejecutarAgente} className="flex items-center gap-1.5 px-3 py-1.5 font-exo text-[8px] cursor-pointer rounded" style={{ color: "#00d4ff", border: "1px solid #00d4ff30" }}>
              <Zap className="w-3 h-3" /> Ejecutar ahora
            </button>
            <button onClick={() => { fetch("/api/cencosud/agente/mensajes/leer", { method: "POST" }).then(() => refetchSaMsgs()); }} className="font-exo text-[7px] px-2 py-1.5 cursor-pointer rounded" style={{ color: "#3a6080", border: "1px solid #0d2035" }}>Marcar leído</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 p-3">
          {[
            { l: "REVENUE MES", v: fP(bl.revenue || 0), c: "#00ff88" },
            { l: "CON TARIFA", v: `${bl.con_tarifa || 0}/${bl.total || 0}`, c: "#00d4ff" },
            { l: "% BILLING", v: `${bl.pct || 0}%`, c: (bl.pct || 0) > 20 ? "#00ff88" : "#ffcc00" },
            { l: "CONSOLIDADOS", v: tr.consolidados || 0, c: "#a855f7" },
            { l: "ALIAS GPS", v: `${al.auto_gps || 0}/${al.total || 0}`, c: "#fbbf24" },
            { l: "CONFIRMADOS", v: al.confirmados || 0, c: "#00ff88" },
            { l: "SIN MAPEAR", v: sinMap.length, c: sinMap.length > 15 ? "#ff2244" : "#3a6080" },
          ].map(k => (
            <div key={k.l} className="text-center p-2 rounded" style={{ background: "#0a1520", borderTop: `2px solid ${k.c}` }}>
              <div className="font-space text-[15px] font-bold" style={{ color: k.c }}>{k.v}</div>
              <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-0" style={{ borderBottom: "1px solid #0d2035" }}>
        {(["INTEL", "ALIAS", "ALERTAS", "PARAMS", "CHAT"] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className="px-4 py-2 font-space text-[9px] font-bold tracking-wider cursor-pointer"
            style={{ color: subTab === t ? "#00d4ff" : "#3a6080", borderBottom: subTab === t ? "2px solid #00d4ff" : "2px solid transparent" }}>
            {t === "INTEL" ? "INTELIGENCIA" : t === "ALIAS" ? "ALIAS GPS" : t === "ALERTAS" ? `ALERTAS${noLeidos > 0 ? ` (${noLeidos})` : ""}` : t === "PARAMS" ? "PARÁMETROS" : "CHAT"}
          </button>
        ))}
      </div>

      {subTab === "INTEL" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #00ff8830", borderTop: "2px solid #00ff88" }}>
            <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
              <DollarSign className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />
              <span className="font-space text-[10px] font-bold" style={{ color: "#00ff88" }}>BILLING POR LOTE</span>
            </div>
            <div className="p-3 space-y-1.5">
              {lotes.length === 0 && <div className="font-exo text-[9px] text-center py-4" style={{ color: "#3a6080" }}>Sin datos billing este mes</div>}
              {lotes.map((l: any) => {
                const maxRev = Math.max(...lotes.map((x: any) => Number(x.rev) || 0), 1);
                const pct = Math.round(((Number(l.rev) || 0) / maxRev) * 100);
                return (
                  <div key={l.lote} className="px-3 py-2 rounded" style={{ background: "#0a1520" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-space text-[10px] font-bold" style={{ color: "#00d4ff" }}>LOTE {l.lote}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{l.trips} viajes</span>
                        <span className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{fP(Number(l.rev))}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full" style={{ background: "#0d2035" }}>
                      <div className="h-1.5 rounded-full" style={{ background: "#00ff88", width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-3 pt-2 mt-1" style={{ borderTop: "1px solid #0d2035" }}>
                <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>TOTAL</span>
                <span className="font-space text-[13px] font-bold" style={{ color: "#00ff88" }}>{fP(bl.revenue || 0)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #a855f730", borderTop: "2px solid #a855f7" }}>
              <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                <Route className="w-3.5 h-3.5" style={{ color: "#a855f7" }} />
                <span className="font-space text-[10px] font-bold" style={{ color: "#a855f7" }}>TRAYECTOS CONSOLIDADOS</span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded" style={{ background: "#0a1520" }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: "#a855f7" }}>{tr.consolidados || 0}</div>
                    <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>CREADOS</div>
                  </div>
                  <div className="text-center p-2 rounded" style={{ background: "#0a1520" }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}>{tr.total || 0}</div>
                    <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>VIAJES 30D</div>
                  </div>
                  <div className="text-center p-2 rounded" style={{ background: "#0a1520" }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: tr.consolidados > 0 ? "#00ff88" : "#3a6080" }}>{tr.total > 0 ? Math.round(tr.consolidados / tr.total * 100) : 0}%</div>
                    <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>RATIO</div>
                  </div>
                </div>
                <div className="font-exo text-[8px] mt-2 px-1" style={{ color: "#3a6080" }}>
                  El agente detecta cadenas CD→A→B→C y las consolida en un trayecto facturable CD→C cuando existe tarifa en el contrato
                </div>
              </div>
            </div>

            {sinMap.length > 0 && (
              <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #ff224430", borderTop: "2px solid #ff2244" }}>
                <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
                  <span className="font-space text-[10px] font-bold" style={{ color: "#ff2244" }}>SIN MAPEAR ({sinMap.length})</span>
                </div>
                <div className="max-h-[180px] overflow-y-auto p-2 space-y-1">
                  {sinMap.slice(0, 15).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1 rounded" style={{ background: "#0a1520" }}>
                      <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{s.nombre?.substring(0, 40)}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{s.tipo}</span>
                        <span className="font-space text-[9px] font-bold" style={{ color: "#ff2244" }}>{s.viajes}v</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "ALIAS" && (
        <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #fbbf2430" }}>
          <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
              <span className="font-space text-[10px] font-bold" style={{ color: "#fbbf24" }}>ALIAS GEOCERCAS ({al.total || 0})</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>{al.auto_gps || 0} auto-GPS</span>
              <span className="font-exo text-[8px]" style={{ color: "#a855f7" }}>{al.manuales || 0} manuales</span>
              <span className="font-exo text-[8px]" style={{ color: "#00ff88" }}>{al.confirmados || 0} confirmados</span>
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead><tr style={{ background: "#0a1520" }}>
                {["GEOCERCA", "→ CONTRATO", "FUENTE", "ESTADO", "FECHA"].map(h => (
                  <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-1.5" style={{ color: "#3a6080" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {aliasRecientes.map((a: any) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #0d203520" }}>
                    <td className="font-exo text-[8px] px-3 py-1" style={{ color: "#c8e8ff" }}>{a.geocerca_nombre?.substring(0, 40)}</td>
                    <td className="font-space text-[9px] font-bold px-3 py-1" style={{ color: "#00d4ff" }}>{a.nombre_contrato}</td>
                    <td className="font-exo text-[7px] px-3 py-1" style={{ color: a.creado_por?.includes("GPS") || a.creado_por?.includes("AGENTE") || a.creado_por?.includes("SUPER") ? "#fbbf24" : "#a855f7" }}>{a.creado_por}</td>
                    <td className="px-3 py-1">
                      {a.confirmado ? (
                        <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#00ff88", border: "1px solid #00ff8830" }}>OK</span>
                      ) : (
                        <button onClick={() => confirmarAlias(a.id)} className="font-exo text-[7px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80" style={{ color: "#ffcc00", border: "1px solid #ffcc0030", background: "#ffcc0008" }}>CONFIRMAR</button>
                      )}
                    </td>
                    <td className="font-exo text-[7px] px-3 py-1" style={{ color: "#3a6080" }}>{a.created_at ? new Date(a.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }) : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "ALERTAS" && (
        <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #00d4ff30" }}>
          <div className="overflow-auto" style={{ maxHeight: 450 }}>
            {mensajes.map((m: any) => (
              <div key={m.id} className="px-4 py-2 border-b" style={{ borderColor: "#0a1520", borderLeft: `3px solid ${!m.leido ? colorTipo(m.tipo) : "transparent"}`, background: !m.leido ? `${colorTipo(m.tipo)}05` : "transparent" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-exo text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ color: colorTipo(m.tipo), border: `1px solid ${colorTipo(m.tipo)}30` }}>{m.tipo}</span>
                    {m.prioridad === "CRITICA" && <span className="font-exo text-[6px] font-bold px-1 rounded" style={{ color: "#ff2244", background: "#ff224410" }}>CRIT</span>}
                  </div>
                  <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{new Date(m.created_at).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="font-exo text-[9px] font-bold mt-0.5" style={{ color: "#c8e8ff" }}>{m.titulo}</div>
                <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>{m.contenido}</div>
              </div>
            ))}
            {mensajes.length === 0 && <div className="text-center py-8 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin alertas en 48h</div>}
          </div>
        </div>
      )}

      {subTab === "PARAMS" && (
        <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #fbbf2430", borderTop: "2px solid #fbbf24" }}>
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
            <Settings className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
            <span className="font-space text-[10px] font-bold" style={{ color: "#fbbf24" }}>PARÁMETROS TMS</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 400 }}>
            {categorias.map(cat => {
              const catParams = params.filter((p: any) => p.categoria === cat);
              if (catParams.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="px-4 py-1.5" style={{ background: "#0a1520" }}>
                    <span className="font-exo text-[7px] tracking-wider uppercase font-bold" style={{ color: cat === "FINANCIERO" ? "#00ff88" : cat === "OPERACIONAL" ? "#00d4ff" : "#ffcc00" }}>{cat}</span>
                  </div>
                  {catParams.map((p: any) => (
                    <div key={p.clave} className="flex items-center justify-between px-4 py-1.5 hover:bg-[rgba(255,255,255,0.02)]" style={{ borderBottom: "1px solid #0d203520" }}>
                      <div>
                        <div className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{p.nombre}</div>
                        <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{p.descripcion?.substring(0, 40)}</div>
                      </div>
                      {editParam === p.clave ? (
                        <div className="flex items-center gap-1">
                          <input value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus className="w-20 px-2 py-0.5 font-space text-[10px] outline-none rounded" style={{ background: "#0a1520", border: "1px solid #fbbf2430", color: "#fbbf24" }} onKeyDown={e => e.key === "Enter" && guardarParam(p.clave)} />
                          <button onClick={() => guardarParam(p.clave)} className="font-exo text-[7px] px-1.5 cursor-pointer" style={{ color: "#00ff88" }}>OK</button>
                          <button onClick={() => setEditParam(null)} className="font-exo text-[7px] px-1 cursor-pointer" style={{ color: "#3a6080" }}>X</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditParam(p.clave); setEditVal(String(p.valor)); }} className="flex items-center gap-1 cursor-pointer" title="Click para editar">
                          <span className="font-space text-[11px] font-bold" style={{ color: "#fbbf24" }}>{Number(p.valor).toLocaleString()}</span>
                          <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{p.unidad}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === "CHAT" && (
        <div className="rounded-lg flex flex-col" style={{ background: "#060d14", border: "1px solid #a855f730", borderTop: "2px solid #a855f7", minHeight: 400 }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
            <span className="font-space text-[11px] font-bold" style={{ color: "#a855f7" }}>CHAT CON EL AGENTE</span>
            <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>Pregunta sobre facturación, rutas, rendimiento, camiones o cualquier dato del contrato</div>
          </div>
          <div className="flex-1 overflow-auto px-4 py-3 space-y-2" style={{ maxHeight: 350 }}>
            {hist.length === 0 && (
              <div className="text-center py-4">
                <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Pregunta lo que necesites sobre el contrato Cencosud</div>
                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                  {["¿Cómo vamos de billing?", "¿Qué lote factura más?", "¿Cuántos trayectos consolidó?", "¿Qué rutas faltan por mapear?", "¿Camión más rentable?", "¿Vamos a llegar a la meta?"].map(s => (
                    <button key={s} onClick={() => setMsg(s)} className="font-exo text-[8px] px-2.5 py-1.5 cursor-pointer rounded" style={{ color: "#a855f7", border: "1px solid #a855f730" }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {hist.map((h, i) => (
              <div key={i} className={`flex ${h.rol === "CEO" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%] px-3 py-2 rounded-lg" style={{ background: h.rol === "CEO" ? "#a855f710" : "#0a1520", border: `1px solid ${h.rol === "CEO" ? "#a855f730" : "#0d2035"}` }}>
                  <div className="font-exo text-[7px] uppercase mb-0.5" style={{ color: h.rol === "CEO" ? "#a855f7" : "#00d4ff" }}>{h.rol === "CEO" ? "TÚ" : "AGENTE"}</div>
                  <div className="font-exo text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{h.texto}</div>
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="px-3 py-2 rounded-lg" style={{ background: "#0a1520" }}><Loader2 className="w-4 h-4 animate-spin" style={{ color: "#a855f7" }} /></div></div>}
            <div ref={chatRef} />
          </div>
          <div className="px-4 pb-3 flex gap-2" style={{ borderTop: "1px solid #0d2035", paddingTop: 10 }}>
            <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pregunta al agente..."
              className="flex-1 px-3 py-2 font-exo text-[10px] outline-none rounded" style={{ background: "#0a1520", border: "1px solid #a855f730", color: "#c8e8ff" }} />
            <button onClick={enviar} disabled={loading || !msg.trim()} className="px-4 py-2 font-space text-[9px] font-bold cursor-pointer rounded disabled:opacity-30"
              style={{ background: "#a855f710", border: "1px solid #a855f730", color: "#a855f7" }}>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const velColor = (v: number) => v <= 0 ? "#3a6080" : v < 40 ? "#00d4ff" : v < 60 ? "#00ff88" : v < 80 ? "#fbbf24" : v < 100 ? "#ff6b35" : "#ff2244";

function FitBoundsRuta({ puntos, tripId }: { puntos: { lat: number; lng: number }[]; tripId?: number }) {
  const map = useMap();
  const fitted = useRef("");
  useEffect(() => {
    if (!map || puntos.length === 0) return;
    const last = puntos[puntos.length - 1];
    const key = `${tripId}-${puntos.length}-${puntos[0]?.lat}-${last?.lat}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const bounds = L.latLngBounds(puntos.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, puntos, tripId]);
  return null;
}

function ViajeReconstructorPanel({ viajeId, onClose }: { viajeId: number; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setProgress(0);
    setPlaying(false);
    fetch(`/api/cencosud/viaje-ruta/${viajeId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [viajeId]);

  useEffect(() => {
    if (!playing || !data?.puntos?.length) return;
    const animate = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;
      setProgress(prev => {
        const next = prev + (delta / 20000);
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      animRef.current = requestAnimationFrame(animate);
    };
    lastTimeRef.current = 0;
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, data]);

  if (loading) return (
    <div className="rounded-lg p-8 flex items-center justify-center gap-3" style={{ background: "#060d14", border: "1px solid #0055ff40" }}>
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#0088ff" }} />
      <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Reconstruyendo ruta GPS...</span>
    </div>
  );

  if (!data?.viaje) return null;

  const v = data.viaje;
  const puntos: { lat: number; lng: number; vel: number; fecha: string }[] = data.puntos || [];
  const trailPath = puntos.map(p => ({ lat: p.lat, lng: p.lng }));
  const cursorIdx = Math.min(Math.floor(progress * puntos.length), puntos.length - 1);
  const cursorPt = puntos[cursorIdx];
  const visiblePath = trailPath.slice(0, cursorIdx + 1);

  const fHora = (s: string) => s ? new Date(s).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--";
  const durH = v.duracion_min ? `${Math.floor(v.duracion_min / 60)}h ${v.duracion_min % 60}m` : "--";

  const paradas = Array.isArray(v.paradas) ? v.paradas : [];

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#060d14", border: "1px solid #0055ff60" }}>
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: "#0a1825", borderBottom: "1px solid #0055ff40" }}>
        <div className="flex items-center gap-2">
          <Route size={14} color="#0088ff" />
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#0088ff" }}>
            RECONSTRUCTOR DE RUTA
          </span>
          <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>
            {v.patente} · {v.conductor?.substring(0, 20) || "Sin conductor"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>{data.total_puntos} puntos GPS</span>
          <button onClick={onClose} className="cursor-pointer p-1 rounded hover:brightness-150" style={{ color: "#3a6080" }}><X size={14} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        <div className="lg:col-span-2" style={{ height: 400 }}>
          {puntos.length > 0 ? (
            <LeafletMap center={[puntos[0].lat, puntos[0].lng]} zoom={10}>
              <FitBoundsRuta puntos={trailPath} tripId={viajeId} />
              <Polyline positions={trailPath.map((p: any) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#0055ff", weight: 3, opacity: 0.3 }} />
              <Polyline positions={visiblePath.map((p: any) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#0088ff", weight: 4, opacity: 0.9 }} />

              <DivMarker position={[trailPath[0].lat, trailPath[0].lng]} html={`<div style="width:16px;height:16px;border-radius:50%;background:#00ff88;border:2px solid #060d14"></div>`} size={[16, 16]} />

              <DivMarker position={[trailPath[trailPath.length - 1].lat, trailPath[trailPath.length - 1].lng]} html={`<div style="width:16px;height:16px;border-radius:50%;background:#ff2244;border:2px solid #060d14"></div>`} size={[16, 16]} />

              {cursorPt && playing && (
                <DivMarker position={[cursorPt.lat, cursorPt.lng]} html={`<div style="width:20px;height:20px;border-radius:50%;background:#0088ff;border:3px solid #fff"></div>`} size={[20, 20]} />
              )}

              {paradas.map((p: any, i: number) => p.lat && p.lng && (
                <DivMarker key={`parada-${i}`} position={[p.lat, p.lng]} html={`<div style="width:12px;height:12px;border-radius:50%;background:#a855f7;border:2px solid #060d14"></div>`} size={[12, 12]} />
              ))}
            </LeafletMap>
          ) : (
            <div className="h-full flex items-center justify-center" style={{ background: "#0a1520" }}>
              <div className="text-center">
                <MapPin size={32} color="#3a6080" className="mx-auto mb-2" />
                <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin puntos GPS para este viaje</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3 overflow-auto" style={{ borderLeft: "1px solid #0d2035", maxHeight: 400 }}>
          <div className="space-y-1">
            <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#0088ff" }}>RUTA</div>
            <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>
              {v.origen_contrato || v.origen_nombre} → {v.destino_contrato || v.destino_nombre}
            </div>
            <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
              {v.fecha_inicio ? new Date(v.fecha_inicio).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }) : ""}
              {" · "}{fHora(v.fecha_inicio)} — {fHora(v.fecha_fin)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "DISTANCIA", v: `${Math.round(v.km || 0)} km`, c: "#00d4ff", icon: Route },
              { l: "DURACIÓN", v: durH, c: "#a855f7", icon: Clock },
              { l: "VEL. MÁX", v: `${Math.round(v.vel_max_gps || v.vel_max || 0)} km/h`, c: velColor(v.vel_max_gps || v.vel_max || 0), icon: Gauge },
              { l: "VEL. PROM", v: `${Math.round(v.vel_prom_gps || v.vel_prom || 0)} km/h`, c: "#00d4ff", icon: Gauge },
              { l: "RENDIMIENTO", v: v.rend ? `${v.rend.toFixed(2)} km/L` : "--", c: RC(v.rend), icon: Fuel },
              { l: "LITROS", v: v.litros ? `${Math.round(v.litros)} L` : "--", c: "#ff6b35", icon: Fuel },
              { l: "% MOVIMIENTO", v: `${v.pct_movimiento || 0}%`, c: "#00ff88", icon: Truck },
              { l: "% DETENIDO", v: `${v.pct_detenido || 0}%`, c: "#ffcc00", icon: Clock },
            ].map(k => (
              <div key={k.l} className="p-2 rounded" style={{ background: "#0a1520", borderLeft: `2px solid ${k.c}` }}>
                <div className="flex items-center gap-1 mb-0.5">
                  <k.icon size={9} color={k.c} />
                  <span className="font-exo text-[6px] tracking-wider uppercase" style={{ color: "#3a6080" }}>{k.l}</span>
                </div>
                <div className="font-space text-[12px] font-bold" style={{ color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {v.ingreso_tarifa && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "INGRESO", v: fP(v.ingreso_tarifa || 0), c: "#00ff88" },
                { l: "COSTO", v: fP(v.costo_total || 0), c: "#ff6b35" },
                { l: "MARGEN", v: fP(v.margen_bruto || 0), c: (v.margen_bruto || 0) >= 0 ? "#00ff88" : "#ff2244" },
              ].map(k => (
                <div key={k.l} className="p-2 rounded text-center" style={{ background: "#0a1520", borderTop: `2px solid ${k.c}` }}>
                  <div className="font-space text-[11px] font-bold" style={{ color: k.c }}>{k.v}</div>
                  <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                </div>
              ))}
            </div>
          )}

          {paradas.length > 0 && (
            <div>
              <div className="font-exo text-[7px] tracking-wider uppercase mb-1" style={{ color: "#a855f7" }}>PARADAS ({paradas.length})</div>
              {paradas.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: "1px solid #0d203530" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#a855f7" }} />
                  <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{p.nombre || `Parada ${i + 1}`}</span>
                  {p.duracion_min != null && <span className="font-space text-[7px]" style={{ color: "#3a6080" }}>{p.duracion_min}min</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {puntos.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-3" style={{ borderTop: "1px solid #0d2035", background: "#0a1520" }}>
          <button onClick={() => { setPlaying(!playing); if (progress >= 1) setProgress(0); }} className="cursor-pointer p-1.5 rounded" style={{ background: "#0088ff20", border: "1px solid #0088ff40", color: "#0088ff" }}>
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <div className="flex-1 h-2 rounded-full overflow-hidden cursor-pointer" style={{ background: "#162a3d" }} onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setProgress((e.clientX - rect.left) / rect.width);
          }}>
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, #0055ff, #0088ff)" }} />
          </div>
          {cursorPt && (
            <span className="font-space text-[9px]" style={{ color: velColor(cursorPt.vel) }}>
              {Math.round(cursorPt.vel)} km/h · {fHora(cursorPt.fecha)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
