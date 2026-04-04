import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Map as GMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Truck, TrendingUp, AlertTriangle, Fuel, Activity, MapPin, DollarSign, Target, ChevronLeft, Bot, RefreshCw, Send, Loader2, Settings, Brain, Route, Zap, Eye, Check, X, Map, ChevronDown, ChevronUp, Navigation, Search } from "lucide-react";
import MapaGeocercasCencosud from "@/components/mapa-geocercas-cencosud";

const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
const fP = (n: number) => `$${fN(n)}`;
type Tab = "EN_VIVO" | "RESUMEN" | "VIAJES" | "ERR" | "RUTAS" | "FLOTA" | "AGENTE" | "TARIFAS" | "MAPA";

function MapPanner({ lat, lng, zoom }: { lat: number | null; lng: number | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (map && lat != null && lng != null) {
      map.panTo({ lat, lng });
      map.setZoom(zoom);
    }
  }, [map, lat, lng, zoom]);
  return null;
}

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
              <GMap
                mapId="mapeo-interactivo"
                center={mapCenter}
                zoom={mapZoom}
                gestureHandling="greedy"
                disableDefaultUI={true}
                style={{ width: "100%", height: "100%" }}
              >
                {selected.origen_lat && selected.origen_lng && (
                  <AdvancedMarker position={{ lat: selected.origen_lat, lng: selected.origen_lng }}>
                    <div style={{ background: "#00ff88", borderRadius: "50%", width: 16, height: 16, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#000", fontSize: 8, fontWeight: "bold" }}>O</span>
                    </div>
                  </AdvancedMarker>
                )}
                {selected.destino_lat && selected.destino_lng && (
                  <AdvancedMarker position={{ lat: selected.destino_lat, lng: selected.destino_lng }}>
                    <div style={{ background: "#ff2244", borderRadius: "50%", width: 16, height: 16, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#fff", fontSize: 8, fontWeight: "bold" }}>D</span>
                    </div>
                  </AdvancedMarker>
                )}
              </GMap>
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

export default function CencosudView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("EN_VIVO");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  const { data: mes } = useQuery<any>({ queryKey: ["/api/cencosud/resumen-mes"], queryFn: () => fetch("/api/cencosud/resumen-mes").then(r => r.json()), staleTime: 120000 });
  const { data: dash } = useQuery<any>({ queryKey: ["/api/cencosud/dashboard", fecha], queryFn: () => fetch(`/api/cencosud/dashboard?fecha=${fecha}`).then(r => r.json()), staleTime: 60000 });
  const mesActual = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const { data: plMes } = useQuery<any>({ queryKey: ["/api/cencosud/pl/mes", mesActual], queryFn: () => fetch(`/api/cencosud/pl/mes?mes=${mesActual}`).then(r => r.json()), staleTime: 120000 });
  const { data: plDia } = useQuery<any>({ queryKey: ["/api/cencosud/pl/dia", fecha], queryFn: () => fetch(`/api/cencosud/pl/dia?fecha=${fecha}`).then(r => r.json()), staleTime: 60000 });
  const { data: enVivoData } = useQuery<any>({ queryKey: ["/api/cencosud/en-vivo"], queryFn: () => fetch("/api/cencosud/en-vivo").then(r => r.json()), refetchInterval: 30000, enabled: tab === "EN_VIVO" });
  const [seguir, setSeguir] = useState<string | null>(null);
  const prevTab = useRef<Tab>("EN_VIVO");
  useEffect(() => { if (prevTab.current === "EN_VIVO" && tab !== "EN_VIVO") setSeguir(null); prevTab.current = tab; }, [tab]);
  const { data: trailData } = useQuery<any>({ queryKey: ["/api/cencosud/en-vivo/trail", seguir], queryFn: () => fetch(`/api/cencosud/en-vivo/trail/${seguir}`).then(r => r.json()), refetchInterval: 30000, enabled: !!seguir && tab === "EN_VIVO" });
  const { data: errData } = useQuery<any>({ queryKey: ["/api/cencosud/err", fecha], queryFn: () => fetch(`/api/cencosud/err?fecha=${fecha}`).then(r => r.json()), staleTime: 60000, enabled: tab === "ERR" });
  const { data: viajesMes } = useQuery<any>({ queryKey: ["/api/cencosud/viajes-mes"], queryFn: () => fetch("/api/cencosud/viajes-mes").then(r => r.json()), staleTime: 120000, enabled: tab === "VIAJES" });
  const { data: flotaData } = useQuery<any>({ queryKey: ["/api/cencosud/flota"], queryFn: () => fetch("/api/cencosud/flota").then(r => r.json()), staleTime: 300000, enabled: tab === "FLOTA" });
  const { data: tarifasData } = useQuery<any>({ queryKey: ["/api/cencosud/tarifas"], queryFn: () => fetch("/api/cencosud/tarifas").then(r => r.json()), staleTime: 600000, enabled: tab === "TARIFAS" });
  const { data: sinMapear } = useQuery<any>({ queryKey: ["/api/cencosud/sin-mapear"], queryFn: () => fetch("/api/cencosud/sin-mapear").then(r => r.json()), staleTime: 300000 });
  const { data: saEstado } = useQuery<any>({ queryKey: ["/api/cencosud/agente/estado"], queryFn: () => fetch("/api/cencosud/agente/estado").then(r => r.json()), refetchInterval: 60000, enabled: tab === "AGENTE" });
  const { data: saMsgs, refetch: refetchSaMsgs } = useQuery<any>({ queryKey: ["/api/cencosud/agente/mensajes"], queryFn: () => fetch("/api/cencosud/agente/mensajes").then(r => r.json()), refetchInterval: 30000, enabled: tab === "AGENTE" });
  const { data: paramData, refetch: refetchParams } = useQuery<any>({ queryKey: ["/api/cencosud/parametros"], queryFn: () => fetch("/api/cencosud/parametros").then(r => r.json()), staleTime: 300000, enabled: tab === "AGENTE" });
  const { data: intelData, refetch: refetchIntel } = useQuery<any>({ queryKey: ["/api/cencosud/agente/inteligencia"], queryFn: () => fetch("/api/cencosud/agente/inteligencia").then(r => r.json()), refetchInterval: 120000, enabled: tab === "AGENTE" });

  const f = mes?.flota || {};
  const fi = mes?.financiero || {};
  const p = mes?.productividad || {};

  return (
    <div className="min-h-screen" style={{ background: "#020508" }}>
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-3" style={{ background: "#060d14", borderBottom: "2px solid #00d4ff" }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="cursor-pointer p-1" style={{ color: "#3a6080" }}><ChevronLeft className="w-5 h-5" /></button>
          <div className="w-8 h-8 rounded flex items-center justify-center font-space text-[11px] font-bold" style={{ background: "#00d4ff15", border: "1px solid #00d4ff30", color: "#00d4ff" }}>C</div>
          <div>
            <div className="font-space text-[14px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>CENCOSUD RETAIL</div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Contrato Ago 2025 - Jul 2029 · 83 camiones · 7 lotes</div>
          </div>
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
        <div className="flex gap-0">
          {(["EN_VIVO", "RESUMEN", "VIAJES", "ERR", "RUTAS", "FLOTA", "AGENTE", "TARIFAS", "MAPA"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex items-center gap-1.5 px-4 py-2 font-space text-[9px] font-bold tracking-wider cursor-pointer"
              style={{ color: tab === t ? (t === "EN_VIVO" ? "#00ff88" : "#00d4ff") : "#3a6080", borderBottom: tab === t ? `2px solid ${t === "EN_VIVO" ? "#00ff88" : "#00d4ff"}` : "2px solid transparent" }}>
              {t === "EN_VIVO" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 6px #00ff88", animation: "blink 2s infinite" }} />}
              {t === "EN_VIVO" ? "EN VIVO" : t}
              {t === "EN_VIVO" && enVivoData?.resumen && <span className="ml-1 text-[8px] px-1 py-0.5" style={{ background: "#00ff8815", borderRadius: 3 }}>{enVivoData.resumen.en_ruta}</span>}
            </button>
          ))}
        </div>
        {(tab === "ERR" || tab === "RUTAS") && (
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
                          {cam.origen && (
                            <div className="flex items-center gap-1 mb-0.5 ml-5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#00d4ff", border: "1.5px solid #00d4ff80" }} />
                              <span className="font-exo text-[9px] font-bold" style={{ color: "#00d4ff" }}>{cam.origen.nombre || cam.origen}</span>
                              {cam.hora_salida && <span className="font-exo text-[8px]" style={{ color: "#5a8090" }}>{String(cam.hora_salida).substring(11, 16)}</span>}
                            </div>
                          )}
                          {cam.destino_probable && (
                            <div className="flex items-center gap-1 ml-5">
                              <span className="w-2 h-2 flex-shrink-0" style={{ background: "#a855f7", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                              <span className="font-exo text-[9px] font-bold" style={{ color: "#a855f7" }}>{cam.destino_probable.nombre}</span>
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
                <GMap
                  defaultCenter={{ lat: -33.45, lng: -70.65 }}
                  defaultZoom={6}
                  mapId="cencosud-en-vivo"
                  style={{ width: "100%", height: "100%" }}
                  gestureHandling="greedy"
                >
                  <MapPanner lat={selCam?.lat || null} lng={selCam?.lng || null} zoom={selCam ? 10 : 6} />

                  {/* Geocercas Cencosud — subtle diamonds */}
                  {(!seguir) && geos.map((g: any) => (
                    <AdvancedMarker key={`geo-${g.nombre}`} position={{ lat: g.lat, lng: g.lng }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ width: 8, height: 8, background: "#00d4ff30", border: "1px solid #00d4ff50", transform: "rotate(45deg)" }} />
                        <span style={{ fontSize: 7, color: "#00d4ff60", fontFamily: "Space Grotesk", fontWeight: 600, whiteSpace: "nowrap", textShadow: "0 0 3px #000" }}>{g.nombre}</span>
                      </div>
                    </AdvancedMarker>
                  ))}

                  {/* Trucks en ruta */}
                  {ruta.map((cam: any) => {
                    const sel = seguir === cam.patente;
                    return (
                      <AdvancedMarker key={cam.patente} position={{ lat: cam.lat, lng: cam.lng }} onClick={() => setSeguir(sel ? null : cam.patente)} zIndex={sel ? 100 : 10}>
                        <div style={{
                          background: sel ? "#00ff88" : "#060d14",
                          border: `2px solid #00ff88`,
                          borderRadius: 6, padding: sel ? "4px 8px" : "2px 6px",
                          boxShadow: sel ? "0 0 20px rgba(0,255,136,0.6), 0 0 40px rgba(0,255,136,0.2)" : "0 1px 4px rgba(0,0,0,0.5)",
                          display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                          transition: "all 0.3s ease",
                          transform: sel ? "scale(1.2)" : "scale(1)",
                        }}>
                          <Truck style={{ width: sel ? 12 : 10, height: sel ? 12 : 10, color: sel ? "#060d14" : "#00ff88" }} />
                          <span style={{ fontSize: sel ? 10 : 9, fontWeight: 700, color: sel ? "#060d14" : "#00ff88", fontFamily: "Space Grotesk" }}>{cam.patente}</span>
                          {sel && cam.velocidad > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: "#060d14", fontFamily: "Space Grotesk" }}>{Math.round(cam.velocidad)}km/h</span>}
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                  {/* Trucks en CD */}
                  {cd.map((cam: any) => {
                    const sel = seguir === cam.patente;
                    return (
                      <AdvancedMarker key={cam.patente} position={{ lat: cam.lat, lng: cam.lng }} onClick={() => setSeguir(sel ? null : cam.patente)} zIndex={sel ? 100 : 5}>
                        <div style={{
                          background: sel ? "#00d4ff" : "#060d14",
                          border: `2px solid #00d4ff`,
                          borderRadius: 6, padding: sel ? "4px 8px" : "2px 6px",
                          boxShadow: sel ? "0 0 20px rgba(0,212,255,0.5)" : "0 1px 3px rgba(0,0,0,0.5)",
                          display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                          transition: "all 0.3s ease",
                          transform: sel ? "scale(1.2)" : "scale(1)",
                        }}>
                          <MapPin style={{ width: sel ? 12 : 10, height: sel ? 12 : 10, color: sel ? "#060d14" : "#00d4ff" }} />
                          <span style={{ fontSize: sel ? 10 : 9, fontWeight: 700, color: sel ? "#060d14" : "#00d4ff", fontFamily: "Space Grotesk" }}>{cam.patente}</span>
                        </div>
                      </AdvancedMarker>
                    );
                  })}

                  {/* Trail for followed truck — denser dots with opacity gradient */}
                  {seguir && trail.length > 1 && trail.map((p: any, i: number) => {
                    if (i % 2 !== 0) return null;
                    const opacity = 0.15 + (i / trail.length) * 0.7;
                    return (
                      <AdvancedMarker key={`trail-${i}`} position={{ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: `rgba(0,255,136,${opacity})`, border: "0.5px solid rgba(0,255,136,0.3)" }} />
                      </AdvancedMarker>
                    );
                  })}

                  {/* Origin marker — where truck started */}
                  {seguir && isEnRuta && origenObj?.lat && (
                    <AdvancedMarker position={{ lat: origenObj.lat, lng: origenObj.lng }} zIndex={50}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{
                          background: "#00d4ff", border: "3px solid #fff", borderRadius: "50%",
                          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, color: "#060d14", fontWeight: 900, fontFamily: "Space Grotesk",
                          boxShadow: "0 0 12px rgba(0,212,255,0.6), 0 2px 8px rgba(0,0,0,0.5)",
                        }}>O</div>
                        <div style={{
                          background: "rgba(6,13,20,0.9)", border: "1px solid #00d4ff60", borderRadius: 4,
                          padding: "2px 6px", whiteSpace: "nowrap",
                        }}>
                          <span style={{ fontSize: 8, color: "#00d4ff", fontWeight: 700, fontFamily: "Space Grotesk" }}>{origenObj.nombre}</span>
                        </div>
                      </div>
                    </AdvancedMarker>
                  )}

                  {/* Destination marker */}
                  {seguir && isEnRuta && destObj && (
                    <AdvancedMarker position={{ lat: destObj.lat, lng: destObj.lng }} zIndex={50}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{
                          background: "#a855f7", border: "3px solid #fff", borderRadius: "50%",
                          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, color: "#fff", fontWeight: 900, fontFamily: "Space Grotesk",
                          boxShadow: "0 0 12px rgba(168,85,247,0.6), 0 2px 8px rgba(0,0,0,0.5)",
                        }}>D</div>
                        <div style={{
                          background: "rgba(6,13,20,0.9)", border: "1px solid #a855f760", borderRadius: 4,
                          padding: "2px 6px", whiteSpace: "nowrap",
                        }}>
                          <span style={{ fontSize: 8, color: "#a855f7", fontWeight: 700, fontFamily: "Space Grotesk" }}>{destObj.nombre}</span>
                          <span style={{ fontSize: 7, color: "#5a8090", fontFamily: "Exo 2", marginLeft: 4 }}>~{destObj.km_restante} km</span>
                        </div>
                      </div>
                    </AdvancedMarker>
                  )}

                  {/* Geocerca for CD truck when selected */}
                  {seguir && selCam?.geocerca && !isEnRuta && (
                    <AdvancedMarker position={{ lat: selCam.lat, lng: selCam.lng }} zIndex={1}>
                      <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
                        <div style={{ background: "rgba(6,13,20,0.9)", border: "1px solid #00d4ff60", borderRadius: 4, padding: "2px 6px" }}>
                          <span style={{ fontSize: 8, color: "#00d4ff", fontWeight: 700, fontFamily: "Space Grotesk" }}>{selCam.geocerca}</span>
                        </div>
                      </div>
                    </AdvancedMarker>
                  )}
                </GMap>

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
                      <div className="flex items-start gap-2 mb-2" style={{ marginLeft: 2 }}>
                        <div className="flex flex-col items-center gap-0.5 pt-0.5">
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00d4ff", border: "1.5px solid #fff" }} />
                          <div style={{ width: 1, height: 20, background: "linear-gradient(#00d4ff40, #a855f740)" }} />
                          <div style={{ width: 8, height: 8, background: "#a855f7", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", border: "1.5px solid #fff" }} />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                          <div>
                            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#5a8090" }}>Origen</div>
                            <div className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{origenObj?.nombre || "Desconocido"}</div>
                            {selCam.hora_salida && <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Salió {String(selCam.hora_salida).substring(11, 16)}</div>}
                          </div>
                          <div>
                            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#5a8090" }}>Destino probable</div>
                            <div className="font-space text-[11px] font-bold" style={{ color: "#a855f7" }}>{destObj?.nombre || "—"}</div>
                            {destObj && <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>~{destObj.km_restante} km restantes</div>}
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

        {/* ═══ RESUMEN ═══ */}
        {tab === "RESUMEN" && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-8 gap-2">
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
                  <div key={k.l} onClick={() => k.go && setTab(k.go)} className={`rounded-lg p-3 ${k.go ? "cursor-pointer hover:opacity-90 transition-all" : ""}`} style={{ background: "#060d14", borderTop: `2px solid ${k.c}`, border: "1px solid #0d2035" }}>
                    <Icon className="w-3.5 h-3.5 mb-1.5" style={{ color: `${k.c}50` }} />
                    <div className="font-space text-[16px] font-bold leading-none" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[6px] tracking-wider uppercase mt-1" style={{ color: "#3a6080" }}>{k.l}{k.go ? " >" : ""}</div>
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
              <div className="grid grid-cols-8 gap-2">
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
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
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
                        <tr key={v.id} style={{ background: i % 2 === 0 ? "transparent" : "#0a152030" }}>
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
              <div className="grid grid-cols-5 gap-2">
                {[
                  { l: "CAMIONES", v: e.camiones || 0, c: "#00d4ff" },
                  { l: "VIAJES", v: e.viajes || 0, c: "#a855f7" },
                  { l: "CRUZADOS", v: `${e.viajes_cruzados || 0} (${e.pct_cruzados || 0}%)`, c: (e.pct_cruzados || 0) > 50 ? "#00ff88" : "#ffcc00" },
                  { l: "KM TOTAL", v: fN(e.km_total || 0), c: "#00ff88" },
                  { l: "KM/L", v: e.rend_promedio || "--", c: RC(e.rend_promedio || 0) },
                ].map(k => (
                  <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                    <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* P&L del dia */}
              {plDia && (
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { l: "INGRESO DIA", v: fP(plDia.ingreso_total || 0), c: "#00ff88" },
                    { l: "COSTO DIESEL", v: fP(plDia.costo_diesel_total || 0), c: "#ff6b35" },
                    { l: "COSTO CVM", v: fP(plDia.costo_cvm_total || 0), c: "#ff6b35" },
                    { l: "COSTO TOTAL", v: fP(plDia.costo_total || 0), c: "#ff6b35" },
                    { l: "MARGEN", v: `${fP(plDia.margen_total || 0)} (${plDia.margen_pct || 0}%)`, c: (plDia.margen_total || 0) >= 0 ? "#00ff88" : "#ff2244" },
                  ].map(k => (
                    <div key={k.l} className="text-center p-2 rounded" style={{ background: "#060d14", borderTop: `2px solid ${k.c}` }}>
                      <div className="font-space text-[12px] font-bold" style={{ color: k.c }}>{k.v}</div>
                      <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
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
                        <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{
                          color: r.estado_match === "CRUZADO" ? "#00ff88" : r.estado_match === "PARCIAL" ? "#ffcc00" : "#ff2244",
                          border: `1px solid ${r.estado_match === "CRUZADO" ? "#00ff8830" : r.estado_match === "PARCIAL" ? "#ffcc0030" : "#ff224430"}`,
                        }}>{r.estado_match}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="font-exo text-[9px] mt-2" style={{ color: "#3a6080" }}>
              Total ingreso estimado dia: <span className="font-space font-bold" style={{ color: "#00ff88" }}>{fP(dash.ingreso_estimado || 0)}</span>
            </div>
          </>
        )}

        {/* ═══ FLOTA ═══ */}
        {tab === "FLOTA" && flotaData && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="font-exo text-[8px] tracking-wider uppercase" style={{ color: "#00d4ff" }}>
                FLOTA CENCOSUD · {flotaData.total}/{flotaData.contratados} CAMIONES ACTIVOS
              </span>
              <div className="font-space text-[11px] font-bold" style={{ color: flotaData.total >= 58 ? "#00ff88" : "#ff6b35" }}>
                {Math.round(flotaData.total / flotaData.contratados * 100)}%
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: "#0d2035" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(flotaData.total / flotaData.contratados * 100))}%`, background: flotaData.total >= 58 ? "#00ff88" : "#ff6b35" }} />
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d2035" }}>
                    {["PATENTE", "CONDUCTOR", "VIAJES", "KM MES", "KM PROY", "% META", "KM/L", "DIAS", "ESTADO"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(flotaData.camiones || []).map((c: any, i: number) => (
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
                        <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{
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
          </>
        )}

        {tab === "AGENTE" && <SuperAgentePanel saEstado={saEstado} saMsgs={saMsgs} refetchSaMsgs={refetchSaMsgs} paramData={paramData} refetchParams={refetchParams} intelData={intelData} refetchIntel={refetchIntel} />}

        {/* ═══ TARIFAS ═══ */}
        {tab === "TARIFAS" && tarifasData && (
          <>
            <div className="font-exo text-[8px] tracking-wider uppercase mb-2" style={{ color: "#00d4ff" }}>
              TARIFAS CONTRATO · {(tarifasData.tarifas || []).length} RUTAS · 7 LOTES
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d2035" }}>
                    {["LOTE", "CLASE", "ORIGEN", "DESTINO", "TARIFA"].map(h => (
                      <th key={h} className="font-exo text-[7px] tracking-wider text-left px-3 py-2" style={{ color: "#3a6080" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(tarifasData.tarifas || []).map((t: any, i: number) => (
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
          </>
        )}

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
              <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
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
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>CREADOS</div>
                  </div>
                  <div className="text-center p-2 rounded" style={{ background: "#0a1520" }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}>{tr.total || 0}</div>
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>VIAJES 30D</div>
                  </div>
                  <div className="text-center p-2 rounded" style={{ background: "#0a1520" }}>
                    <div className="font-space text-[18px] font-bold" style={{ color: tr.consolidados > 0 ? "#00ff88" : "#3a6080" }}>{tr.total > 0 ? Math.round(tr.consolidados / tr.total * 100) : 0}%</div>
                    <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>RATIO</div>
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
