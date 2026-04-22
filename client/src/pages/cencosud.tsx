import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LeafletMap, MapPanner, FitBounds, DivMarker, CircleMarker, Polyline, useMap } from "@/components/leaflet-map";

import L from "leaflet";
import { Truck, TrendingUp, AlertTriangle, Fuel, Activity, MapPin, DollarSign, Target, ChevronLeft, Bot, RefreshCw, Send, Loader2, Settings, Brain, Route, Zap, Eye, Check, X, Map, ChevronDown, ChevronUp, Navigation, Search, Flag, Gauge, Clock, Play, Pause } from "lucide-react";
import MapaGeocercasCencosud from "@/components/mapa-geocercas-cencosud";

const RC = (r: number | null) => !r ? "#3a6080" : r >= 3.5 ? "#00ffcc" : r >= 2.85 ? "#00ff88" : r >= 2.3 ? "#ffcc00" : r >= 2.0 ? "#ff6b35" : "#ff2244";
const fN = (n: number) => Math.round(n).toLocaleString("es-CL");
const fP = (n: number) => `$${fN(n)}`;
type Tab = "EN_VIVO" | "BRECHA" | "CONTROL" | "RESUMEN" | "VIAJES" | "ERR" | "RUTAS" | "FLOTA" | "AGENTE" | "TARIFAS" | "MAPA" | "CRUCE" | "PROPUESTAS" | "AUTO" | "ANTIFRAUDE" | "TARJETAS";

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

function CruceSigetraTab() {
  const [dias, setDias] = useState(30);
  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/cencosud/cruce-sigetra", dias],
    queryFn: () => fetch(`/api/cencosud/cruce-sigetra?dias=${dias}`).then(r => r.json()),
    staleTime: 60000,
  });

  if (isLoading) return <div className="text-center py-20 font-exo text-[#3a6080]"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Cruzando Sigetra × WiseTrack...</div>;
  if (!data || data.error) return <div className="text-center py-20 font-exo" style={{ color: "#ff6b35" }}>Error: {data?.error || "sin datos"}</div>;

  const r = data.resumen || {};
  return (
    <div className="space-y-3">
      {/* HERO */}
      <div className="rounded-lg p-4" style={{ background: "linear-gradient(135deg, #1a0f00, #2a1500)", border: "1px solid #ff8800" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-space text-[10px] tracking-wider" style={{ color: "#ff8800" }}>CRUCE SIGETRA × WISETRACK</div>
            <div className="font-exo text-[11px] text-[#94a3b8] mt-0.5">Cargas de combustible vs viajes detectados</div>
          </div>
          <div className="flex items-center gap-2">
            <select value={dias} onChange={e => setDias(parseInt(e.target.value))} className="font-space text-[10px] px-2 py-1 rounded outline-none" style={{ background: "#0a1218", color: "#ff8800", border: "1px solid #ff8800" }}>
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
            </select>
            <button onClick={() => refetch()} className="px-3 py-1.5 rounded font-space text-[9px]" style={{ background: "#ff880020", color: "#ff8800", border: "1px solid #ff8800" }}>{isFetching ? "..." : "REFRESCAR"}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">VIAJES TOTAL</div>
            <div className="font-space text-2xl font-bold text-[#00d4ff] mt-1">{fN(r.viajes_total || 0)}</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">VIAJES CRUZADOS</div>
            <div className="font-space text-2xl font-bold mt-1" style={{ color: r.pct_cruzados > 50 ? "#00ff88" : "#ff6b35" }}>{fN(r.viajes_cruzados || 0)}</div>
            <div className="font-exo text-[9px] mt-0.5" style={{ color: r.pct_cruzados > 50 ? "#00ff88" : "#ff6b35" }}>{r.pct_cruzados || 0}%</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">CARGAS CENCOSUD</div>
            <div className="font-space text-2xl font-bold text-[#ff8800] mt-1">{fN(r.cargas_cenco || 0)}</div>
            <div className="font-exo text-[9px] text-[#94a3b8] mt-0.5">{fN(Math.round(r.litros_cenco || 0))} L</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">PATENTES CON CARGAS</div>
            <div className="font-space text-2xl font-bold text-[#a855f7] mt-1">{r.patentes_con_cargas || 0}</div>
            <div className="font-exo text-[9px] text-[#94a3b8] mt-0.5">de {r.patentes_cenco || 0} flota</div>
          </div>
        </div>
      </div>

      {/* TOP DESVIACIONES */}
      {(data.top_desviaciones?.length > 0) && (
        <div className="rounded-lg p-4" style={{ background: "#0a1218", border: "1px solid #ff224430" }}>
          <div className="font-space text-[10px] tracking-wider mb-3" style={{ color: "#ff2244" }}>⚠ TOP DESVIACIONES km ECU vs SIGETRA</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-exo">
              <thead><tr className="text-[#3a6080] border-b border-[#0d2035]">
                <th className="text-left py-1.5 px-2">Patente</th><th className="text-left">Fecha</th><th className="text-left">Origen</th><th className="text-left">Destino</th>
                <th className="text-right">km ECU</th><th className="text-right">km Sig</th><th className="text-right">Δ%</th>
              </tr></thead>
              <tbody>
                {data.top_desviaciones.map((v: any, i: number) => (
                  <tr key={i} className="border-b border-[#0d2035]/50 hover:bg-[#0d2035]/30">
                    <td className="py-1.5 px-2 text-[#00d4ff] font-bold">{v.patente}</td>
                    <td>{new Date(v.fecha_inicio).toLocaleDateString("es-CL")}</td>
                    <td className="text-[#94a3b8]">{v.origen_nombre}</td>
                    <td className="text-[#94a3b8]">{v.destino_nombre}</td>
                    <td className="text-right text-[#00d4ff]">{Math.round(v.km_ecu || 0)}</td>
                    <td className="text-right text-[#ff8800]">{Math.round(v.km_declarado_sigetra || 0)}</td>
                    <td className="text-right font-bold" style={{ color: Math.abs(v.delta_cuadratura) > 30 ? "#ff2244" : "#ff6b35" }}>{Math.round(v.delta_cuadratura)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CARGAS SIN VIAJE */}
      {(data.cargas_sin_viaje?.length > 0) && (
        <div className="rounded-lg p-4" style={{ background: "#0a1218", border: "1px solid #ff8800" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-space text-[10px] tracking-wider" style={{ color: "#ff8800" }}>⛽ CARGAS SIN VIAJE MATCHEADO ({data.cargas_sin_viaje.length})</div>
            <div className="font-exo text-[9px] text-[#94a3b8]">Cargas de combustible que no se pudieron cruzar con un viaje detectado</div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[10px] font-exo">
              <thead className="sticky top-0" style={{ background: "#0a1218" }}><tr className="text-[#3a6080] border-b border-[#0d2035]">
                <th className="text-left py-1.5 px-2">Fecha</th><th className="text-left">Patente</th>
                <th className="text-right">Litros</th><th className="text-right">km Δ</th>
                <th className="text-left">Lugar</th><th className="text-left">Conductor</th>
              </tr></thead>
              <tbody>
                {data.cargas_sin_viaje.map((c: any) => (
                  <tr key={c.id} className="border-b border-[#0d2035]/50">
                    <td className="py-1 px-2 text-[#94a3b8]">{new Date(c.fecha).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="text-[#00d4ff] font-bold">{c.patente}</td>
                    <td className="text-right text-[#ff8800]">{Math.round(c.litros_surtidor)}</td>
                    <td className="text-right text-[#a855f7]">{(c.km_actual && c.km_anterior) ? fN(c.km_actual - c.km_anterior) : "-"}</td>
                    <td className="text-[#94a3b8]">{c.lugar_consumo}</td>
                    <td className="text-[#94a3b8]">{c.conductor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PATENTES NO MATCH (diagnóstico) */}
      {(data.patentes_no_match?.length > 0) && (
        <div className="rounded-lg p-4" style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
          <div className="font-space text-[10px] tracking-wider mb-3 text-[#3a6080]">DIAGNÓSTICO · Patentes en Sigetra que NO matchean con flota CENCOSUD ({data.patentes_no_match.length})</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {data.patentes_no_match.map((p: any, i: number) => (
              <div key={i} className="rounded p-2" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
                <div className="font-space text-[10px] font-bold text-[#94a3b8]">{p.patente}</div>
                <div className="font-exo text-[8px] text-[#3a6080] mt-0.5">{p.cargas} cargas · {Math.round(p.litros)} L</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PropuestasTab() {
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(ayer);
  const [creando, setCreando] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/cencosud/viajes-propuestos", fecha],
    queryFn: () => fetch(`/api/cencosud/viajes-propuestos?fecha=${fecha}`).then(r => r.json()),
    staleTime: 60000,
  });

  const crearGeocerca = async (parada: any, patente: string) => {
    const nombre = prompt(`Nombre para la geocerca en (${parada.lat?.toFixed(4)}, ${parada.lng?.toFixed(4)})?\nCamión: ${patente}\nDuración: ${Math.round(parada.duracion_min)} min`);
    if (!nombre) return;
    setCreando(`${patente}-${parada.desde}`);
    try {
      const r = await fetch("/api/cencosud/geocerca-desde-punto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, lat: parada.lat, lng: parada.lng, radio_m: 200 })
      }).then(r => r.json());
      if (r.ok) { alert(`✓ Geocerca "${r.geocerca.nombre}" creada (id ${r.geocerca.id})`); refetch(); }
      else alert("Error: " + (r.error || "desconocido"));
    } finally { setCreando(null); }
  };

  if (isLoading) return <div className="text-center py-20 font-exo text-[#3a6080]"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Detectando viajes propuestos...</div>;
  if (!data) return <div className="text-center py-20 font-exo" style={{ color: "#ff6b35" }}>Sin datos</div>;

  const conSugerencia = data.propuestos?.filter((p: any) => p.viaje_sugerido) || [];
  const sinParadas = data.propuestos?.filter((p: any) => !p.paradas?.length) || [];

  return (
    <div className="space-y-3">
      {/* HERO */}
      <div className="rounded-lg p-4" style={{ background: "linear-gradient(135deg, #1a0033, #2a0055)", border: "1px solid #a855f7" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-space text-[10px] tracking-wider" style={{ color: "#a855f7" }}>VIAJES PROPUESTOS · CAMIONES SIN VIAJE DETECTADO</div>
            <div className="font-exo text-[11px] text-[#94a3b8] mt-0.5">Camiones con movimiento GPS pero el reconstructor no detectó viaje</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="font-exo text-[10px] px-3 py-1 rounded outline-none" style={{ background: "#0a1218", color: "#a855f7", border: "1px solid #a855f7" }} />
            <button onClick={() => refetch()} className="px-3 py-1.5 rounded font-space text-[9px]" style={{ background: "#a855f720", color: "#a855f7", border: "1px solid #a855f7" }}>{isFetching ? "..." : "REFRESCAR"}</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">CAMIONES SIN VIAJE</div>
            <div className="font-space text-2xl font-bold text-[#ff6b35] mt-1">{data.total || 0}</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">CON VIAJE SUGERIDO</div>
            <div className="font-space text-2xl font-bold text-[#00ff88] mt-1">{conSugerencia.length}</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">SIN PARADAS CLARAS</div>
            <div className="font-space text-2xl font-bold text-[#ffcc00] mt-1">{sinParadas.length}</div>
          </div>
        </div>
      </div>

      {/* LISTA */}
      <div className="space-y-2">
        {(data.propuestos || []).map((p: any) => (
          <div key={p.patente} className="rounded-lg p-3" style={{ background: "#0a1218", border: `1px solid ${p.viaje_sugerido ? "#00ff8830" : "#0d2035"}` }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-space text-[14px] font-bold text-[#00d4ff]">{p.patente}</span>
                  <span className="font-exo text-[9px] text-[#94a3b8]">{p.puntos} puntos GPS · {p.horas_activas}h activas</span>
                </div>
                <div className="font-exo text-[9px] text-[#3a6080] mt-0.5">
                  {new Date(p.primer_pt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} → {new Date(p.ultimo_pt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {p.viaje_sugerido && (
                <div className="rounded px-3 py-1.5" style={{ background: "#00ff8810", border: "1px solid #00ff88" }}>
                  <div className="font-space text-[9px] font-bold text-[#00ff88]">VIAJE SUGERIDO</div>
                  <div className="font-exo text-[10px] text-white mt-0.5">{p.viaje_sugerido.origen} → {p.viaje_sugerido.destino}</div>
                </div>
              )}
            </div>
            {p.paradas?.length > 0 ? (
              <div className="space-y-1.5 mt-2">
                {p.paradas.map((pa: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[10px] font-exo rounded px-2 py-1" style={{ background: "#060d14" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[#3a6080]">#{i + 1}</span>
                      <span className={pa.lugar_sugerido ? "text-[#00ff88] font-bold" : "text-[#ff6b35]"}>
                        {pa.lugar_sugerido || `(${Number(pa.lat).toFixed(4)}, ${Number(pa.lng).toFixed(4)})`}
                      </span>
                      {pa.dist_m !== null && pa.lugar_sugerido && <span className="text-[#3a6080] text-[8px]">{pa.dist_m}m</span>}
                      <span className="text-[#94a3b8]">· {Math.round(pa.duracion_min)}min</span>
                      <span className="text-[#3a6080] text-[9px]">
                        {new Date(pa.desde).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {!pa.lugar_sugerido && (
                      <button onClick={() => crearGeocerca(pa, p.patente)} disabled={creando === `${p.patente}-${pa.desde}`}
                        className="px-2 py-0.5 rounded font-space text-[8px] font-bold"
                        style={{ background: "#a855f720", color: "#a855f7", border: "1px solid #a855f7" }}>
                        {creando === `${p.patente}-${pa.desde}` ? "..." : "+ GEOCERCA"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-exo text-[9px] text-[#3a6080] italic mt-1">Sin paradas significativas (&gt;20min) detectadas — camión en movimiento continuo o GPS errático</div>
            )}
          </div>
        ))}
        {data.total === 0 && (
          <div className="text-center py-12 font-exo text-[#3a6080]">✓ Todos los camiones CENCOSUD activos tienen viaje detectado este día</div>
        )}
      </div>
    </div>
  );
}

function AutomatizacionTab() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState<string | null>(null);
  const [nombreCustom, setNombreCustom] = useState("");
  const { data: estado, refetch } = useQuery<any>({
    queryKey: ["/api/cencosud/auto-cierre/estado"],
    queryFn: () => fetch("/api/cencosud/auto-cierre/estado").then(r => r.json()),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const ejecutar = async (autoCrear = false) => {
    setRunning(true);
    try {
      const r = await fetch("/api/cencosud/auto-cierre/ejecutar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias_atras: 14, auto_crear: autoCrear, umbral_confianza: 0.85 }),
      }).then(r => r.json());
      setLastResult(r);
      refetch();
    } finally { setRunning(false); }
  };

  const cruzarHistorico = async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/cencosud/auto-cierre/cruzar-rango", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias: 60 }),
      }).then(r => r.json());
      alert(`✓ ${r.total_cruces} cruces aplicados, ${fN(r.total_litros)} L cruzados en ${r.dias_procesados} días`);
      refetch();
    } finally { setRunning(false); }
  };

  const aprobarGeocerca = async (p: any, nombre: string) => {
    if (!nombre || nombre.trim().length < 3) { alert("Nombre inválido"); return; }
    setAprobando(`${p.lat}-${p.lng}`);
    try {
      const r = await fetch("/api/cencosud/auto-cierre/aprobar-geocerca", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), lat: p.lat, lng: p.lng, radio_m: 200 }),
      }).then(r => r.json());
      if (r.ok) {
        alert(`✓ Geocerca "${r.geocerca.nombre}" creada (id ${r.geocerca.id})`);
        // remueve de la lista local
        if (lastResult) {
          setLastResult({
            ...lastResult,
            geocercas_propuestas: lastResult.geocercas_propuestas.filter((x: any) =>
              !(Math.abs(x.lat - p.lat) < 0.0001 && Math.abs(x.lng - p.lng) < 0.0001)
            ),
          });
        }
        refetch();
        setEditandoNombre(null);
      } else alert("Error: " + (r.error || "desconocido"));
    } finally { setAprobando(null); }
  };

  const cruces = estado?.cruces_30d || {};
  const pctCruzados = cruces.total > 0 ? Math.round((cruces.cruzados || 0) * 100 / cruces.total) : 0;

  return (
    <div className="space-y-3">
      {/* HERO */}
      <div className="rounded-lg p-4" style={{ background: "linear-gradient(135deg, #003322, #006644)", border: "1px solid #00ffcc" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-space text-[10px] tracking-wider" style={{ color: "#00ffcc" }}>AGENTE DE CIERRE DE BRECHA · IA</div>
            <div className="font-exo text-[11px] text-[#94a3b8] mt-0.5">Cruza Sigetra automáticamente y propone geocercas nuevas detectando paradas recurrentes</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cruzarHistorico} disabled={running} className="px-3 py-1.5 rounded font-space text-[9px] font-bold disabled:opacity-50"
              style={{ background: "#ff880020", color: "#ff8800", border: "1px solid #ff8800" }}>
              {running ? "..." : "REPROCESAR 60 DÍAS"}
            </button>
            <button onClick={() => ejecutar(false)} disabled={running} className="px-3 py-1.5 rounded font-space text-[9px] font-bold disabled:opacity-50"
              style={{ background: "#00ffcc20", color: "#00ffcc", border: "1px solid #00ffcc" }}>
              {running ? "EJECUTANDO..." : "▶ EJECUTAR CICLO"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">VIAJES CRUZADOS / 30D</div>
            <div className="font-space text-2xl font-bold mt-1" style={{ color: pctCruzados > 30 ? "#00ff88" : "#ff6b35" }}>
              {fN(cruces.cruzados || 0)}<span className="text-[#3a6080] text-base">/{fN(cruces.total || 0)}</span>
            </div>
            <div className="font-exo text-[9px] mt-0.5" style={{ color: pctCruzados > 30 ? "#00ff88" : "#ff6b35" }}>{pctCruzados}% cobertura</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">LITROS CRUZADOS</div>
            <div className="font-space text-2xl font-bold text-[#ff8800] mt-1">{fN(cruces.litros || 0)}</div>
            <div className="font-exo text-[9px] text-[#94a3b8] mt-0.5">L Sigetra ↔ ECU</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">KM SIGETRA</div>
            <div className="font-space text-2xl font-bold text-[#00d4ff] mt-1">{fN(cruces.km || 0)}</div>
            <div className="font-exo text-[9px] text-[#94a3b8] mt-0.5">declarados conductor</div>
          </div>
          <div className="rounded p-3" style={{ background: "#060d14" }}>
            <div className="font-space text-[8px] tracking-wider text-[#3a6080]">PARADAS HUÉRFANAS</div>
            <div className="font-space text-2xl font-bold text-[#a855f7] mt-1">{estado?.paradas_huerfanas_actuales ?? "..."}</div>
            <div className="font-exo text-[9px] text-[#94a3b8] mt-0.5">candidatas a geocerca</div>
          </div>
        </div>
      </div>

      {/* RESULTADO ÚLTIMA EJECUCIÓN */}
      {lastResult && (
        <div className="rounded-lg p-3" style={{ background: "#0a1218", border: "1px solid #00ffcc40" }}>
          <div className="font-space text-[9px] tracking-wider mb-2" style={{ color: "#00ffcc" }}>
            ✓ ÚLTIMA EJECUCIÓN · {lastResult.fecha} · {lastResult.duracion_seg}s
          </div>
          <div className="flex gap-4 font-exo text-[10px] text-[#94a3b8]">
            <div>Cruces nuevos: <span className="text-[#00ff88] font-bold">{lastResult.cruces_aplicados}</span></div>
            <div>Litros: <span className="text-[#ff8800] font-bold">{fN(lastResult.litros_cruzados)}</span></div>
            <div>Km: <span className="text-[#00d4ff] font-bold">{fN(lastResult.km_cruzado)}</span></div>
            <div>Geocercas auto-creadas: <span className="text-[#00ffcc] font-bold">{lastResult.geocercas_creadas}</span></div>
          </div>
        </div>
      )}

      {/* PARADAS HUÉRFANAS — pendientes de aprobar como geocercas */}
      <div className="rounded-lg p-4" style={{ background: "#0a1218", border: "1px solid #a855f7" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-space text-[10px] tracking-wider" style={{ color: "#a855f7" }}>
              📍 PARADAS HUÉRFANAS · CANDIDATAS A GEOCERCA
            </div>
            <div className="font-exo text-[9px] text-[#3a6080] mt-0.5">Lugares donde varios camiones distintos paran ≥20min y no hay geocerca registrada — destinos reales sin nombrar</div>
          </div>
        </div>
        {(lastResult?.geocercas_propuestas?.length > 0 || estado?.paradas_huerfanas_top?.length > 0) ? (
          <div className="space-y-2">
            {(lastResult?.geocercas_propuestas || estado?.paradas_huerfanas_top?.map((p: any) => ({
              ...p, nombre: `Parada (${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)})`, confianza: 0,
            })) || []).map((p: any, i: number) => {
              const id = `${p.lat}-${p.lng}`;
              const isEditing = editandoNombre === id;
              return (
                <div key={i} className="rounded p-3" style={{ background: "#060d14", border: "1px solid #1a2842" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-space text-[11px] font-bold text-white">
                          {isEditing ? (
                            <input autoFocus value={nombreCustom} onChange={e => setNombreCustom(e.target.value)}
                              className="font-space text-[11px] px-2 py-0.5 rounded outline-none w-64"
                              style={{ background: "#0a1218", color: "white", border: "1px solid #00ffcc" }}
                              onKeyDown={e => { if (e.key === "Enter") aprobarGeocerca(p, nombreCustom); }}/>
                          ) : (
                            p.nombre || `Parada (${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)})`
                          )}
                        </span>
                        {p.confianza > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: p.confianza >= 0.85 ? "#00ff8830" : "#ffcc0030", color: p.confianza >= 0.85 ? "#00ff88" : "#ffcc00" }}>
                            IA {Math.round(p.confianza * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="font-exo text-[9px] text-[#94a3b8] mt-1 flex gap-3">
                        <span>{p.camiones} camiones</span>
                        <span>{p.visitas} visitas</span>
                        {p.duracion_promedio_min && <span>{p.duracion_promedio_min} min/parada</span>}
                        <span className="text-[#3a6080]">({Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)})</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {isEditing ? (
                        <>
                          <button onClick={() => aprobarGeocerca(p, nombreCustom)} disabled={aprobando === id}
                            className="px-2 py-1 rounded font-space text-[9px] font-bold"
                            style={{ background: "#00ff8820", color: "#00ff88", border: "1px solid #00ff88" }}>
                            {aprobando === id ? "..." : "✓ CREAR"}
                          </button>
                          <button onClick={() => setEditandoNombre(null)}
                            className="px-2 py-1 rounded font-space text-[9px]"
                            style={{ background: "#0d2035", color: "#94a3b8" }}>X</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditandoNombre(id); setNombreCustom(p.nombre?.startsWith("Parada (") ? "" : (p.nombre || "")); }}
                            className="px-2 py-1 rounded font-space text-[9px] font-bold"
                            style={{ background: "#a855f720", color: "#a855f7", border: "1px solid #a855f7" }}>
                            ✎ NOMBRAR
                          </button>
                          {p.confianza >= 0.85 && (
                            <button onClick={() => aprobarGeocerca(p, p.nombre)} disabled={aprobando === id}
                              className="px-2 py-1 rounded font-space text-[9px] font-bold"
                              style={{ background: "#00ff8820", color: "#00ff88", border: "1px solid #00ff88" }}>
                              {aprobando === id ? "..." : "✓ APROBAR"}
                            </button>
                          )}
                          <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer"
                            className="px-2 py-1 rounded font-space text-[9px]"
                            style={{ background: "#0d2035", color: "#00d4ff" }}>🗺</a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 font-exo text-[#3a6080] text-[11px]">
            ✓ No hay paradas huérfanas — ejecutá el ciclo para detectar nuevas
          </div>
        )}
      </div>

      {/* INFO */}
      <div className="rounded-lg p-3" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
        <div className="font-exo text-[9px] text-[#94a3b8] leading-relaxed">
          <span className="font-bold text-[#00ffcc]">¿Cómo funciona?</span> El agente cruza automáticamente cada carga de combustible Sigetra con el viaje WiseTrack más cercano (±12h, misma patente normalizada). Después escanea las posiciones GPS buscando lugares donde ≥3 camiones distintos paran ≥20min y NO hay geocerca registrada — esos son destinos reales sin nombrar. Las propuestas se muestran arriba para que las apruebes manualmente. Si configurás API key de IA válida, Claude sugiere nombres automáticamente con score de confianza.
        </div>
      </div>
    </div>
  );
}

const COLORES_SISTEMA: Record<string, string> = {
  EVC: "#00ff88", SHELL: "#ffaa00", SIGETRA: "#ff2244", PETROBRAS: "#00d4ff",
  RUTA_EXTERNA: "#a855f7", OTRO: "#7a90a8",
};

function CruceTarjetasTab() {
  const [dias, setDias] = useState(30);
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/combustible/cruce-tarjetas", dias],
    queryFn: () => fetch(`/api/combustible/cruce-tarjetas?dias=${dias}`).then(r => r.json()),
    staleTime: 60000,
  });

  if (isLoading) return <div className="p-8 text-center font-space text-xs" style={{ color: "#3a6080" }}>CRUZANDO TARJETAS…</div>;
  if (!data?.resumen) return <div className="p-8 text-center font-space text-xs" style={{ color: "#ff2244" }}>SIN DATOS</div>;

  const r = data.resumen;
  const maxLitros = Math.max(...data.por_sistema.map((s: any) => s.litros || 0));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-space text-sm font-bold tracking-widest" style={{ color: "#ffaa00" }}>CRUCE TARJETAS · SIGETRA TST × SHELL CARD × EVC</h2>
          <div className="font-space text-[9px] mt-1" style={{ color: "#3a6080" }}>
            Clasificación por estación · {r.total_cargas} cargas · {fN(r.total_litros)} L · ${fN(r.total_clp)} en {data.periodo_dias} días
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <select value={dias} onChange={e => setDias(parseInt(e.target.value))} className="font-space text-[10px] px-2 py-1" style={{ background: "#0a1218", color: "#00d4ff", border: "1px solid #0d2035" }}>
            <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
          </select>
          <button onClick={() => refetch()} className="font-space text-[10px] px-3 py-1 font-bold" style={{ background: "#ffaa0015", color: "#ffaa00", border: "1px solid #ffaa00" }}>ACTUALIZAR</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="p-4" style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#00ff88" }}>RED DOMINANTE</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: COLORES_SISTEMA[r.red_dominante] || "#fff" }}>{r.red_dominante}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#7a90a8" }}>{r.fidelidad_red_pct}% de las cargas</div>
        </div>
        <div className="p-4" style={{ background: "#1a1505", border: "2px solid #ffaa00" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#ffaa00" }}>FUERA DE RED PREFERENTE</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: "#ffaa00" }}>${fN(r.clp_fuera_red)}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#ffd866" }}>{fN(r.litros_fuera_red)} L · ahorro potencial al consolidar</div>
        </div>
        <div className="p-4" style={{ background: "#1a0510", border: "2px solid #ff0066" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#ff0066" }}>GUÍAS DUPLICADAS</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: "#ff0066" }}>{r.guias_duplicadas}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#ff6699" }}>${fN(r.clp_duplicados)} doble cobro</div>
        </div>
        <div className="p-4" style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#7a90a8" }}>CARGAS SIN GUÍA</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: "#ff8800" }}>{r.cargas_sin_guia}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#3a6080" }}>{fN(r.litros_sin_guia)} L sin trazabilidad</div>
        </div>
      </div>

      {/* Distribución por sistema de pago */}
      <div style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
        <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ffaa00", borderBottom: "1px solid #0d2035" }}>
          DISTRIBUCIÓN POR SISTEMA DE PAGO
        </div>
        <div className="p-3 space-y-2">
          {data.por_sistema.map((s: any) => {
            const color = COLORES_SISTEMA[s.sistema] || "#7a90a8";
            const pct = maxLitros > 0 ? (s.litros / maxLitros * 100) : 0;
            return (
              <div key={s.sistema} className="flex items-center gap-3">
                <div className="font-space text-[10px] font-bold w-32" style={{ color }}>{s.sistema}</div>
                <div className="flex-1 h-6 relative" style={{ background: "#060d14" }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: color, opacity: 0.3 }} />
                  <div className="absolute inset-0 flex items-center px-2 font-space text-[10px]" style={{ color: "#fff" }}>
                    {fN(s.litros)} L · {s.cargas} cargas · {s.camiones} camiones · ${fN(s.litros * data.precio_diesel)}
                    {s.sin_guia > 0 && <span className="ml-2" style={{ color: "#ff2244" }}>· {s.sin_guia} sin guía</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Camiones con baja fidelidad */}
      {data.camiones_baja_fidelidad.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ffaa0040" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ffaa00", borderBottom: "1px solid #ffaa0040" }}>
            {`CAMIONES CON BAJA FIDELIDAD A SU RED — ${data.camiones_baja_fidelidad.length} casos (cargan en >15% en otra red)`}
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">RED PRINC.</th><th className="text-right p-2">FIDELIDAD</th><th className="text-right p-2">REDES</th><th className="text-right p-2">CARGAS</th><th className="text-right p-2">CARGAS FUERA</th><th className="text-right p-2">LITROS FUERA</th><th className="text-right p-2">$ FUERA</th>
            </tr></thead>
            <tbody>{data.camiones_baja_fidelidad.slice(0, 30).map((c: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{c.patente}</td>
                <td className="p-2" style={{ color: COLORES_SISTEMA[c.sistema_principal] || "#fff" }}>{c.sistema_principal}</td>
                <td className="p-2 text-right font-bold" style={{ color: parseFloat(c.fidelidad_pct) < 60 ? "#ff2244" : "#ffaa00" }}>{c.fidelidad_pct}%</td>
                <td className="p-2 text-right" style={{ color: c.redes_distintas > 2 ? "#ff2244" : "#7a90a8" }}>{c.redes_distintas}</td>
                <td className="p-2 text-right" style={{ color: "#7a90a8" }}>{c.n_total}</td>
                <td className="p-2 text-right" style={{ color: "#ff8800" }}>{c.cargas_fuera_red}</td>
                <td className="p-2 text-right" style={{ color: "#ffaa00" }}>{c.litros_fuera_red}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ffaa00" }}>${fN(c.litros_fuera_red * data.precio_diesel)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* Saltos de red en <24h */}
      {data.saltos_red.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ff006640" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ff0066", borderBottom: "1px solid #ff006640" }}>
            {`SALTOS DE RED EN <24H — ${data.saltos_red.length} casos (mismo camión cambió de sistema)`}
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">FECHA</th><th className="text-left p-2">DE</th><th className="text-left p-2">A</th><th className="text-right p-2">HRS</th><th className="text-right p-2">LITROS</th><th className="text-left p-2">LUGAR</th><th className="text-left p-2">CONDUCTOR</th>
            </tr></thead>
            <tbody>{data.saltos_red.slice(0, 25).map((s: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{s.patente}</td>
                <td className="p-2">{s.fecha?.slice(0, 16)}</td>
                <td className="p-2" style={{ color: COLORES_SISTEMA[s.sistema_prev] || "#fff" }}>{s.sistema_prev}</td>
                <td className="p-2 font-bold" style={{ color: COLORES_SISTEMA[s.sistema] || "#fff" }}>→ {s.sistema}</td>
                <td className="p-2 text-right" style={{ color: "#ffaa00" }}>{parseFloat(s.horas_desde_anterior).toFixed(1)}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ff0066" }}>{s.litros_surtidor}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{s.lugar_consumo || "—"}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{s.conductor || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* Guías duplicadas */}
      {data.guias_duplicadas.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ff224440" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ff2244", borderBottom: "1px solid #ff224440" }}>
            NÚMEROS DE GUÍA DUPLICADOS — {data.guias_duplicadas.length} casos (posible doble cobro)
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">N° GUÍA</th><th className="text-right p-2">VECES</th><th className="text-left p-2">PATENTES</th><th className="text-right p-2">L TOTAL</th><th className="text-left p-2">PRIMERA</th><th className="text-left p-2">ÚLTIMA</th><th className="text-left p-2">LUGARES</th>
            </tr></thead>
            <tbody>{data.guias_duplicadas.slice(0, 20).map((g: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold" style={{ color: "#ff2244" }}>{g.num_guia}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ff0066" }}>{g.veces}</td>
                <td className="p-2">{g.patentes}</td>
                <td className="p-2 text-right">{g.litros_total}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{g.primera?.slice(0, 16)}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{g.ultima?.slice(0, 16)}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{Array.isArray(g.lugares) ? g.lugares.join(" / ") : ""}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* Estaciones únicas (carga grande en lugar visitado solo 1 vez) */}
      {data.estaciones_unicas.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #a855f740" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#a855f7", borderBottom: "1px solid #a855f740" }}>
            CARGAS EN ESTACIONES VISITADAS UNA SOLA VEZ — {data.estaciones_unicas.length} casos (desvío atípico)
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">FECHA</th><th className="text-right p-2">LITROS</th><th className="text-left p-2">SISTEMA</th><th className="text-left p-2">LUGAR</th><th className="text-left p-2">CONDUCTOR</th>
            </tr></thead>
            <tbody>{data.estaciones_unicas.slice(0, 20).map((e: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{e.patente}</td>
                <td className="p-2">{e.fecha?.slice(0, 16)}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#a855f7" }}>{e.litros_surtidor}</td>
                <td className="p-2" style={{ color: COLORES_SISTEMA[e.sistema] || "#fff" }}>{e.sistema}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{e.lugar_consumo || "—"}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{e.conductor || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* MAPA DE BOMBAS */}
      {data.bombas && data.bombas.length > 0 && (() => {
        const lats = data.bombas.map((b: any) => b.lat);
        const lngs = data.bombas.map((b: any) => b.lng);
        const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        const maxL = Math.max(...data.bombas.map((b: any) => b.litros || 0));
        return (
          <div style={{ background: "#0a1218", border: "1px solid #00d4ff40" }}>
            <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest flex items-center justify-between" style={{ color: "#00d4ff", borderBottom: "1px solid #00d4ff40" }}>
              <span>MAPA DE BOMBAS · {data.bombas.length} estaciones geocodificadas (de {data.resumen.bombas_total})</span>
              <div className="flex gap-3 text-[9px]">
                <span style={{ color: "#00ff88" }}>● EVC</span>
                <span style={{ color: "#ffd700" }}>● SHELL</span>
                <span style={{ color: "#0066ff" }}>● SIGETRA/COPEC</span>
                <span style={{ color: "#ff6600" }}>● PETROBRAS</span>
                <span style={{ color: "#ff2244" }}>● RUTA EXT.</span>
              </div>
            </div>
            <div style={{ height: 480 }}>
              <LeafletMap center={[cLat, cLng]} zoom={5}>
                {data.bombas.map((b: any, i: number) => {
                  const color = COLORES_SISTEMA[b.sistema] || "#7a90a8";
                  const radius = Math.max(6, Math.round((b.litros / maxL) * 28));
                  const html = `<div style="background:${color};border-radius:50%;width:${radius*2}px;height:${radius*2}px;border:1.5px solid #fff;opacity:0.85;box-shadow:0 0 ${radius}px ${color}80"></div>`;
                  return (
                    <DivMarker
                      key={i}
                      position={[b.lat, b.lng]}
                      html={html}
                      size={[radius * 2, radius * 2]}
                    />
                  );
                })}
              </LeafletMap>
            </div>
          </div>
        );
      })()}

      {/* ANOMALIAS DE RENDIMIENTO entre cargas */}
      {data.secuencia_anomalias && data.secuencia_anomalias.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ff006640" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest flex items-center justify-between" style={{ color: "#ff0066", borderBottom: "1px solid #ff006640" }}>
            <span>{`KM RECORRIDOS vs RENDIMIENTO — ${data.secuencia_anomalias.length} anomalías`}</span>
            <span style={{ color: "#ffaa00" }}>{`Pérdida estimada: $${fN(data.resumen.clp_extra_estimado || 0)} (${fN(data.resumen.litros_extra_estimado || 0)} L sospechosos)`}</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th>
              <th className="text-left p-2">FECHA</th>
              <th className="text-right p-2">KM ENTRE</th>
              <th className="text-right p-2">LITROS</th>
              <th className="text-right p-2">REND REAL</th>
              <th className="text-right p-2">REND ESPERADO</th>
              <th className="text-right p-2">L EXTRA</th>
              <th className="text-left p-2">FLAG</th>
              <th className="text-left p-2">LUGAR</th>
            </tr></thead>
            <tbody>{data.secuencia_anomalias.slice(0, 50).map((a: any, i: number) => {
              const flagColor: Record<string, string> = {
                CONSUMO_EXCESIVO: "#ff0066",
                KM_FANTASMA: "#ffaa00",
                CARGA_GRANDE_SIN_KM: "#ff6600",
                KM_NO_AVANZA: "#a855f7",
              };
              const c = flagColor[a.flag] || "#7a90a8";
              const rendCalc = a.km_entre_cargas > 0 && a.litros_surtidor > 0
                ? (a.km_entre_cargas / a.litros_surtidor).toFixed(2) : "—";
              return (
                <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                  <td className="p-2 font-bold">{a.patente}</td>
                  <td className="p-2">{a.fecha?.slice(0, 16)}</td>
                  <td className="p-2 text-right">{a.km_entre_cargas != null ? fN(a.km_entre_cargas) : "—"}</td>
                  <td className="p-2 text-right font-bold">{a.litros_surtidor}</td>
                  <td className="p-2 text-right" style={{ color: c }}>{rendCalc}</td>
                  <td className="p-2 text-right" style={{ color: "#7a90a8" }}>{a.rend_median ?? "—"}</td>
                  <td className="p-2 text-right font-bold" style={{ color: a.litros_extra_estimado > 0 ? "#ff0066" : "#7a90a8" }}>
                    {a.litros_extra_estimado != null ? a.litros_extra_estimado : "—"}
                  </td>
                  <td className="p-2 font-bold" style={{ color: c }}>{a.flag}</td>
                  <td className="p-2" style={{ color: "#7a90a8" }}>{a.lugar_consumo || "—"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="px-3 py-2 font-space text-[9px]" style={{ color: "#3a6080", borderTop: "1px solid #0d2035" }}>
            <b style={{ color: "#ff0066" }}>CONSUMO_EXCESIVO</b>: rend &lt; 60% del histórico del camión ·
            <b style={{ color: "#ffaa00" }}> KM_FANTASMA</b>: rend &gt; 160% (km no reales o carga incompleta) ·
            <b style={{ color: "#ff6600" }}> CARGA_GRANDE_SIN_KM</b>: ≥100 L con &lt;20 km recorridos ·
            <b style={{ color: "#a855f7" }}> KM_NO_AVANZA</b>: odómetro retrocedió o quedó igual
          </div>
        </div>
      )}
    </div>
  );
}

function AntifraudeTab() {
  const [dias, setDias] = useState(30);
  const [contrato, setContrato] = useState("TODOS");
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/combustible/antifraude", dias, contrato],
    queryFn: () => fetch(`/api/combustible/antifraude?dias=${dias}&contrato=${contrato}`).then(r => r.json()),
    staleTime: 60000,
  });

  if (isLoading) return <div className="p-8 text-center font-space text-xs" style={{ color: "#3a6080" }}>ANALIZANDO CRUCES…</div>;
  if (!data || !data.resumen) return <div className="p-8 text-center font-space text-xs" style={{ color: "#ff2244" }}>SIN DATOS</div>;

  const r = data.resumen;
  const cats: { key: keyof typeof r.por_categoria; label: string; color: string; desc: string }[] = [
    { key: "duplicadas", label: "CARGAS DUPLICADAS", color: "#ff0066", desc: "Misma patente, 2+ cargas en <6h" },
    { key: "surtidor_vs_ecu", label: "SURTIDOR > ECU", color: "#ff2244", desc: "Cargado al ticket pero no entró al estanque (>10%)" },
    { key: "sin_movimiento", label: "CARGA SIN MOVIMIENTO", color: "#ff8800", desc: "Cargó >100L pero camión no se movió (<30km)" },
    { key: "sobre_capacidad", label: "SOBRE CAPACIDAD", color: "#ffcc00", desc: "Carga > capacidad real del estanque" },
    { key: "rendimiento_bajo", label: "CONSUMO ANÓMALO", color: "#a855f7", desc: "Rendimiento <75% del histórico (litros se evaporan)" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-space text-sm font-bold tracking-widest" style={{ color: "#ff0066" }}>AUDITORÍA ANTIFRAUDE COMBUSTIBLE</h2>
          <div className="font-space text-[9px] mt-1" style={{ color: "#3a6080" }}>5 cruces automáticos · pérdida estimada en CLP a precio diésel ${data.precio_diesel}/L</div>
        </div>
        <div className="flex gap-2 items-center">
          <select value={dias} onChange={e => setDias(parseInt(e.target.value))} className="font-space text-[10px] px-2 py-1" style={{ background: "#0a1218", color: "#00d4ff", border: "1px solid #0d2035" }}>
            <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
          </select>
          <select value={contrato} onChange={e => setContrato(e.target.value)} className="font-space text-[10px] px-2 py-1" style={{ background: "#0a1218", color: "#00d4ff", border: "1px solid #0d2035" }}>
            <option value="TODOS">TODOS</option><option value="CENCOSUD">CENCOSUD</option><option value="WALMART">WALMART</option>
          </select>
          <button onClick={() => refetch()} className="font-space text-[10px] px-3 py-1 font-bold" style={{ background: "#ff006615", color: "#ff0066", border: "1px solid #ff0066" }}>ACTUALIZAR</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4" style={{ background: "#1a0510", border: "2px solid #ff0066" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#ff0066" }}>PÉRDIDA ESTIMADA TOTAL</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: "#ff0066" }}>${fN(r.clp_perdidos_estimados)}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#ff6699" }}>{fN(r.litros_perdidos_estimados)} L · últimos {data.periodo_dias} días</div>
        </div>
        <div className="p-4" style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#3a6080" }}>ALERTAS DETECTADAS</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: "#ff8800" }}>{r.total_alertas}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#3a6080" }}>casos sospechosos</div>
        </div>
        <div className="p-4" style={{ background: "#0a1218", border: "1px solid #0d2035" }}>
          <div className="font-space text-[9px] tracking-widest" style={{ color: "#3a6080" }}>PROYECCIÓN ANUAL</div>
          <div className="font-orbitron text-2xl font-bold mt-1" style={{ color: "#ffcc00" }}>${fN(Math.round(r.clp_perdidos_estimados * 365 / data.periodo_dias))}</div>
          <div className="font-space text-[10px] mt-1" style={{ color: "#3a6080" }}>si la tendencia continúa</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {cats.map(c => {
          const v = r.por_categoria[c.key];
          return (
            <div key={String(c.key)} className="p-3" style={{ background: "#0a1218", borderTop: `2px solid ${c.color}`, border: "1px solid #0d2035" }}>
              <div className="font-space text-[8px] tracking-widest" style={{ color: c.color }}>{c.label}</div>
              <div className="font-orbitron text-lg font-bold mt-1" style={{ color: "#fff" }}>{v.casos}</div>
              <div className="font-space text-[9px]" style={{ color: c.color }}>${fN(v.clp)}</div>
              <div className="font-space text-[8px] mt-1" style={{ color: "#3a6080" }}>{v.litros} L</div>
            </div>
          );
        })}
      </div>

      {data.duplicadas.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ff006640" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ff0066", borderBottom: "1px solid #ff006640" }}>
            CARGAS DUPLICADAS — {data.duplicadas.length} casos
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">CARGA 1</th><th className="text-left p-2">CARGA 2</th><th className="text-right p-2">HRS</th><th className="text-right p-2">L TOTAL</th><th className="text-left p-2">CONDUCTOR</th><th className="text-left p-2">LUGAR</th>
            </tr></thead>
            <tbody>{data.duplicadas.slice(0, 30).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{d.patente}</td>
                <td className="p-2">{d.fecha1?.slice(0, 16)} <span style={{ color: "#ff8800" }}>({d.litros1}L)</span></td>
                <td className="p-2">{d.fecha2?.slice(0, 16)} <span style={{ color: "#ff8800" }}>({d.litros2}L)</span></td>
                <td className="p-2 text-right" style={{ color: "#ffcc00" }}>{parseFloat(d.horas_diff).toFixed(1)}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ff0066" }}>{Math.round(d.litros_total)}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.conductor || "—"}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.lugar1 || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {data.surtidor_vs_ecu.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ff224440" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ff2244", borderBottom: "1px solid #ff224440" }}>
            SURTIDOR vs ECU — {data.surtidor_vs_ecu.length} cargas no entraron al estanque
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">FECHA</th><th className="text-right p-2">SURTIDOR</th><th className="text-right p-2">ECU</th><th className="text-right p-2">DIFF L</th><th className="text-right p-2">DIFF %</th><th className="text-left p-2">ESTACIÓN</th><th className="text-left p-2">CONDUCTOR</th>
            </tr></thead>
            <tbody>{data.surtidor_vs_ecu.slice(0, 30).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{d.patente}</td>
                <td className="p-2">{d.fecha?.slice(0, 16)}</td>
                <td className="p-2 text-right">{d.litros_surtidor}</td>
                <td className="p-2 text-right" style={{ color: "#7a90a8" }}>{d.litros_ecu}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ff2244" }}>{Math.round(d.diff_litros)}</td>
                <td className="p-2 text-right" style={{ color: "#ff8800" }}>{d.diff_pct}%</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.lugar_consumo || "—"}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.conductor || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {data.sin_movimiento.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ff880040" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ff8800", borderBottom: "1px solid #ff880040" }}>
            CARGAS SIN MOVIMIENTO — {data.sin_movimiento.length} casos
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">FECHA</th><th className="text-right p-2">LITROS</th><th className="text-right p-2">KM REC.</th><th className="text-left p-2">LUGAR</th><th className="text-left p-2">CONDUCTOR</th>
            </tr></thead>
            <tbody>{data.sin_movimiento.slice(0, 20).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{d.patente}</td>
                <td className="p-2">{d.fecha?.slice(0, 16)}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ff8800" }}>{d.litros_surtidor}</td>
                <td className="p-2 text-right" style={{ color: "#ff2244" }}>{d.km_recorridos}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.lugar_consumo || "—"}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.conductor || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {data.sobre_capacidad.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #ffcc0040" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#ffcc00", borderBottom: "1px solid #ffcc0040" }}>
            CARGA SOBRE CAPACIDAD — {data.sobre_capacidad.length} casos (cargó más que el estanque)
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">FECHA</th><th className="text-right p-2">CARGÓ</th><th className="text-right p-2">CAPACIDAD</th><th className="text-right p-2">EXCESO</th><th className="text-left p-2">LUGAR</th>
            </tr></thead>
            <tbody>{data.sobre_capacidad.slice(0, 20).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{d.patente}</td>
                <td className="p-2">{d.fecha?.slice(0, 16)}</td>
                <td className="p-2 text-right">{d.litros_surtidor}</td>
                <td className="p-2 text-right" style={{ color: "#7a90a8" }}>{Math.round(d.capacidad)}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ffcc00" }}>+{Math.round(d.exceso)}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.lugar_consumo || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {data.rendimiento_bajo.length > 0 && (
        <div style={{ background: "#0a1218", border: "1px solid #a855f740" }}>
          <div className="px-3 py-2 font-space text-[10px] font-bold tracking-widest" style={{ color: "#a855f7", borderBottom: "1px solid #a855f740" }}>
            CONSUMO ANÓMALO — {data.rendimiento_bajo.length} viajes con rendimiento sospechosamente bajo
          </div>
          <div className="overflow-x-auto"><table className="w-full font-space text-[10px]">
            <thead><tr style={{ color: "#3a6080", borderBottom: "1px solid #0d2035" }}>
              <th className="text-left p-2">PATENTE</th><th className="text-left p-2">FECHA</th><th className="text-right p-2">REND REAL</th><th className="text-right p-2">REND ADN</th><th className="text-right p-2">CAÍDA</th><th className="text-right p-2">L EXTRA</th><th className="text-left p-2">CONDUCTOR</th>
            </tr></thead>
            <tbody>{data.rendimiento_bajo.slice(0, 20).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #0d2035", color: "#fff" }}>
                <td className="p-2 font-bold">{d.patente}</td>
                <td className="p-2">{d.fecha?.slice(0, 16)}</td>
                <td className="p-2 text-right" style={{ color: "#ff2244" }}>{parseFloat(d.rend_real).toFixed(2)}</td>
                <td className="p-2 text-right" style={{ color: "#7a90a8" }}>{parseFloat(d.rend_adn).toFixed(2)}</td>
                <td className="p-2 text-right font-bold" style={{ color: "#a855f7" }}>−{d.caida_pct}%</td>
                <td className="p-2 text-right font-bold" style={{ color: "#ff2244" }}>{Math.round(parseFloat(d.litros_extra) || 0)}</td>
                <td className="p-2" style={{ color: "#7a90a8" }}>{d.conductor || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function BrechaTab() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(30);
  const [esperadoMes, setEsperadoMes] = useState(800_000_000);
  const [reprocesando, setReprocesando] = useState(false);
  const [reprocResult, setReprocResult] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/cencosud/brecha", dias, esperadoMes],
    queryFn: () => fetch(`/api/cencosud/brecha?dias=${dias}&esperado_mes=${esperadoMes}`).then(r => r.json()),
    staleTime: 60000,
  });

  const { data: wtStatus } = useQuery<any>({
    queryKey: ["/api/wisetrack/status"],
    queryFn: () => fetch("/api/wisetrack/status").then(r => r.json()),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const reprocesar = async (dd: number) => {
    setReprocesando(true);
    setReprocResult(null);
    try {
      const hasta = new Date().toISOString().slice(0, 10);
      const desde = new Date(Date.now() - dd * 86400000).toISOString().slice(0, 10);
      const r = await fetch("/api/cencosud/t1-reconstruir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desde, hasta }),
      }).then(r => r.json());
      setReprocResult(r);
      await refetch();
      qc.invalidateQueries({ queryKey: ["/api/cencosud/viajes-mes"] });
    } catch (e: any) {
      setReprocResult({ error: e.message });
    } finally {
      setReprocesando(false);
    }
  };

  if (isLoading || !data) {
    return <div className="text-center py-20 font-exo text-[#3a6080]"><Loader2 className="animate-spin mx-auto mb-2" size={24} />Calculando brecha...</div>;
  }

  const pctBar = Math.min(100, data.pct_captura || 0);
  const colorBar = pctBar < 30 ? "#ff2244" : pctBar < 60 ? "#ff6b35" : pctBar < 90 ? "#ffcc00" : "#00ff88";

  const wtHealth = wtStatus?.health;
  const wtLag = wtHealth?.lagSec;
  const wtSince = wtHealth?.sinceLastSyncSec;
  const wtMode = wtHealth?.mode;
  const wtErrors = wtHealth?.consecutiveErrors || 0;
  const wtOk = wtHealth?.ok;
  const wtColor = wtOk === false ? "#ff2244"
    : wtMode === "drain" ? "#ffcc00"
    : (wtLag != null && wtLag > 180) ? "#ff6b35"
    : "#00ff88";
  const wtLabel = wtOk === false ? "🔴 SYNC DETENIDO"
    : wtMode === "drain" ? "🟡 DRENANDO BUFFER"
    : "🟢 SYNC OK";
  const fmtSec = (s: number | null | undefined) => {
    if (s == null) return "—";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="p-3 rounded flex items-center gap-4 flex-wrap"
        style={{ background: "#0a1520", border: `1px solid ${wtColor}` }}>
        <div className="font-space text-[10px] tracking-wider font-bold" style={{ color: wtColor }}>
          WISETRACK · {wtLabel}
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            GPS lag: <span style={{ color: "#c8e8ff" }}>{fmtSec(wtLag)}</span>
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            Último sync: <span style={{ color: "#c8e8ff" }}>{fmtSec(wtSince)}</span>
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            Modo: <span style={{ color: "#c8e8ff" }}>{wtMode || "—"}</span>
          </div>
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            Intervalo: <span style={{ color: "#c8e8ff" }}>{wtHealth?.currentIntervalMs ? Math.round(wtHealth.currentIntervalMs / 1000) + "s" : "—"}</span>
          </div>
          {wtErrors > 0 && (
            <div className="font-exo text-[10px]" style={{ color: "#ff6b35" }}>
              Errores seguidos: <span style={{ color: "#ff2244" }}>{wtErrors}</span>
            </div>
          )}
          <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>
            Total: <span style={{ color: "#c8e8ff" }}>{(wtStatus?.api?.totalRecords || 0).toLocaleString("es-CL")} rec</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="font-space text-[10px] tracking-wider" style={{ color: "#3a6080" }}>PERIODO:</div>
        {[7, 15, 30, 60].map(d => (
          <button key={d} onClick={() => setDias(d)}
            className="font-space text-[10px] px-3 py-1 rounded cursor-pointer"
            style={{
              background: dias === d ? "#ff224420" : "#0a1520",
              border: `1px solid ${dias === d ? "#ff2244" : "#0d2035"}`,
              color: dias === d ? "#ff2244" : "#c8e8ff"
            }}>{d}d</button>
        ))}
        <div className="font-space text-[10px] tracking-wider ml-4" style={{ color: "#3a6080" }}>ESPERADO/MES:</div>
        <input type="number" value={esperadoMes} onChange={e => setEsperadoMes(parseInt(e.target.value) || 0)}
          className="font-exo text-[10px] px-2 py-1 rounded outline-none w-32"
          style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
        <button onClick={() => reprocesar(dias)} disabled={reprocesando}
          className="ml-auto font-space text-[10px] tracking-wider px-4 py-1.5 rounded cursor-pointer"
          style={{ background: reprocesando ? "#0d2035" : "#a855f720", border: "1px solid #a855f7", color: "#a855f7" }}>
          {reprocesando ? <><Loader2 size={11} className="inline animate-spin mr-1" />REPROCESANDO {dias}d...</> : `↻ REPROCESAR ÚLTIMOS ${dias}D`}
        </button>
      </div>

      {reprocResult && (
        <div className="p-3 rounded font-exo text-[10px]" style={{ background: reprocResult.error ? "#ff224410" : "#00ff8810", border: `1px solid ${reprocResult.error ? "#ff2244" : "#00ff88"}`, color: reprocResult.error ? "#ff2244" : "#00ff88" }}>
          {reprocResult.error
            ? `Error: ${reprocResult.error}`
            : `✓ Reprocesado: ${(reprocResult.resultados || []).reduce((s: number, r: any) => s + (r.viajes_creados || 0), 0)} viajes en ${(reprocResult.resultados || []).length} días`}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded" style={{ background: "#0a1520", border: "1px solid #ff2244" }}>
          <div className="font-space text-[9px] tracking-wider mb-1" style={{ color: "#ff2244" }}>BRECHA MENSUAL</div>
          <div className="font-exo text-2xl font-bold" style={{ color: "#ff2244" }}>{fP(data.brecha_mensual)}</div>
          <div className="font-space text-[9px] mt-1" style={{ color: "#3a6080" }}>NO FACTURADO</div>
        </div>
        <div className="p-4 rounded" style={{ background: "#0a1520", border: "1px solid #00ff88" }}>
          <div className="font-space text-[9px] tracking-wider mb-1" style={{ color: "#00ff88" }}>DETECTADO/MES</div>
          <div className="font-exo text-2xl font-bold" style={{ color: "#00ff88" }}>{fP(data.detectado_mensualizado)}</div>
          <div className="font-space text-[9px] mt-1" style={{ color: "#3a6080" }}>EN ÚLTIMOS {data.periodo_dias}D × FACTOR {(30/data.periodo_dias).toFixed(2)}</div>
        </div>
        <div className="p-4 rounded" style={{ background: "#0a1520", border: "1px solid #00d4ff" }}>
          <div className="font-space text-[9px] tracking-wider mb-1" style={{ color: "#00d4ff" }}>ESPERADO/MES</div>
          <div className="font-exo text-2xl font-bold" style={{ color: "#00d4ff" }}>{fP(data.esperado_mes)}</div>
          <div className="font-space text-[9px] mt-1" style={{ color: "#3a6080" }}>OBJETIVO CONTRATO</div>
        </div>
      </div>

      <div className="p-4 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
        <div className="flex justify-between mb-2 font-space text-[10px]">
          <span style={{ color: "#c8e8ff" }}>CAPTURA DE FACTURACIÓN</span>
          <span style={{ color: colorBar }}>{data.pct_captura}%</span>
        </div>
        <div className="w-full h-3 rounded" style={{ background: "#0a1218" }}>
          <div className="h-full rounded transition-all" style={{ width: `${pctBar}%`, background: colorBar, boxShadow: `0 0 10px ${colorBar}` }} />
        </div>
        <div className="flex justify-between mt-2 font-space text-[9px]" style={{ color: "#3a6080" }}>
          <span>{data.viajes_facturados} con tarifa</span>
          <span>{data.viajes_sin_tarifa} sin tarifa</span>
          <span>{data.total_viajes} total</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-space text-[10px] tracking-wider mb-2" style={{ color: "#ff6b35" }}>
            <AlertTriangle size={11} className="inline mr-1" />TOP RUTAS SIN TARIFA ({(data.top_sin_tarifa || []).length})
          </div>
          <table className="w-full text-left font-exo text-[10px]">
            <thead>
              <tr style={{ color: "#3a6080" }}>
                <th className="py-1">ORIGEN → DESTINO</th>
                <th className="py-1 text-right">VECES</th>
                <th className="py-1 text-right">KM</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_sin_tarifa || []).map((r: any, i: number) => (
                <tr key={i} style={{ borderTop: "1px solid #0d2035", color: "#c8e8ff" }}>
                  <td className="py-1">{r.origen_nombre} → {r.destino_nombre}</td>
                  <td className="py-1 text-right" style={{ color: "#ff6b35" }}>{r.veces}</td>
                  <td className="py-1 text-right" style={{ color: "#3a6080" }}>{r.km_promedio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
          <div className="font-space text-[10px] tracking-wider mb-2" style={{ color: "#ff2244" }}>
            <Truck size={11} className="inline mr-1" />CAMIONES SIN VIAJE DETECTADO ({(data.camiones_sin_viaje || []).length})
          </div>
          <div className="font-space text-[9px] mb-2" style={{ color: "#3a6080" }}>Camiones con km en GPS pero sin viaje en últimos {data.periodo_dias}d</div>
          <table className="w-full text-left font-exo text-[10px]">
            <thead>
              <tr style={{ color: "#3a6080" }}>
                <th className="py-1">PATENTE</th>
                <th className="py-1 text-right">KM APROX</th>
              </tr>
            </thead>
            <tbody>
              {(data.camiones_sin_viaje || []).map((r: any, i: number) => (
                <tr key={i} style={{ borderTop: "1px solid #0d2035", color: "#c8e8ff" }}>
                  <td className="py-1 font-mono">{r.patente}</td>
                  <td className="py-1 text-right" style={{ color: "#ff2244" }}>{Number(r.km_aprox).toLocaleString("es-CL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 rounded" style={{ background: "#0a1520", border: "1px solid #0d2035" }}>
        <div className="font-space text-[10px] tracking-wider mb-2" style={{ color: "#ffcc00" }}>
          <AlertTriangle size={11} className="inline mr-1" />ORÍGENES QUE NO SON CD ({(data.origen_no_cd || []).length})
        </div>
        <div className="font-space text-[9px] mb-2" style={{ color: "#3a6080" }}>El reglamento dice "los CD mandan" — orígenes que NO son CD/CT/Base son señal de viaje mal detectado</div>
        <div className="grid grid-cols-2 gap-1 font-exo text-[10px]">
          {(data.origen_no_cd || []).map((r: any, i: number) => (
            <div key={i} className="flex justify-between py-1" style={{ borderTop: "1px solid #0d2035" }}>
              <span style={{ color: "#c8e8ff" }}>{r.origen_nombre}</span>
              <span style={{ color: "#ffcc00" }}>{r.veces}×</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResumenEjecutivoTab({ goTab }: { goTab: (t: Tab) => void }) {
  const qc = useQueryClient();
  const mesActual = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const { data: brecha } = useQuery<any>({ queryKey: ["/api/cencosud/brecha", 30], queryFn: () => fetch(`/api/cencosud/brecha?dias=30&esperado_mes=800000000`).then(r => r.json()), staleTime: 60000, refetchInterval: 120000 });
  const { data: mes } = useQuery<any>({ queryKey: ["/api/cencosud/resumen-mes"], queryFn: () => fetch("/api/cencosud/resumen-mes").then(r => r.json()), staleTime: 120000 });
  const { data: plMes } = useQuery<any>({ queryKey: ["/api/cencosud/pl/mes", mesActual], queryFn: () => fetch(`/api/cencosud/pl/mes?mes=${mesActual}`).then(r => r.json()), staleTime: 120000 });
  const { data: enVivo } = useQuery<any>({ queryKey: ["/api/wisetrack/tms/en-vivo"], queryFn: () => fetch("/api/wisetrack/tms/en-vivo").then(r => r.json()), refetchInterval: 30000 });
  const { data: ctrl } = useQuery<any>({ queryKey: ["/api/cencosud/control-diario", hoy], queryFn: () => fetch(`/api/cencosud/control-diario?fecha=${hoy}`).then(r => r.json()), staleTime: 60000 });
  const { data: wt } = useQuery<any>({ queryKey: ["/api/wisetrack/status"], queryFn: () => fetch("/api/wisetrack/status").then(r => r.json()), refetchInterval: 15000 });
  const { data: intel } = useQuery<any>({ queryKey: ["/api/cencosud/agente/inteligencia"], queryFn: () => fetch("/api/cencosud/agente/inteligencia").then(r => r.json()), staleTime: 120000 });
  const { data: sinMapear } = useQuery<any>({ queryKey: ["/api/cencosud/sin-mapear"], queryFn: () => fetch("/api/cencosud/sin-mapear").then(r => r.json()), staleTime: 300000 });

  const ejecutar = async (tipo: string, fn: () => Promise<any>) => {
    setAccionEnCurso(tipo);
    setFeedback(null);
    try {
      const r = await fn();
      setFeedback({ msg: r?.mensaje || r?.message || "Listo", ok: true });
      qc.invalidateQueries();
    } catch (e: any) {
      setFeedback({ msg: e.message || "Error", ok: false });
    } finally {
      setAccionEnCurso(null);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const pct = brecha?.pct_captura || 0;
  const detectado = brecha?.detectado_mensualizado || 0;
  const esperado = brecha?.esperado_mes || 800_000_000;
  const brechaMonto = brecha?.brecha_mensual || 0;
  const colorPct = pct < 30 ? "#ff2244" : pct < 60 ? "#ff6b35" : pct < 90 ? "#ffcc00" : "#00ff88";

  const enRuta = enVivo?.resumen?.en_ruta || 0;
  const enCD = enVivo?.resumen?.en_cd || 0;
  const sinGPS = enVivo?.resumen?.sin_gps || 0;
  const totalActivo = enRuta + enCD + sinGPS;

  const wtHealth = wt?.health;
  const wtOK = wtHealth?.ok && wtHealth?.mode !== "drain";
  const wtLag = wtHealth?.lagSec;

  const f = mes?.flota || {};
  const fi = mes?.financiero || {};
  const ingresoMes = plMes?.ingreso_total || fi.ingreso_acumulado || 0;
  const costoMes = plMes?.costo_total || 0;
  const margen = plMes?.margen_total || 0;
  const margenPct = plMes?.margen_pct || 0;

  const topRutas = (brecha?.top_sin_tarifa || []).slice(0, 6);
  const camionesSinViaje = (brecha?.camiones_sin_viaje || []).slice(0, 6);
  const alertas = (intel?.alertas || []).slice(0, 5);
  const sinMap = (sinMapear?.sin_mapear || []).slice(0, 5);

  const ctrlResumen = ctrl?.resumen || {};
  const cumplimiento = ctrlResumen.pct_cumplimiento ?? null;

  const sectionStyle = { background: "#060d14", border: "1px solid #0d2035", borderRadius: 8 };

  return (
    <div className="space-y-3">
      {/* HERO BANNER */}
      <div className="rounded-lg p-5 relative overflow-hidden" style={{
        background: `linear-gradient(135deg, #060d14 0%, ${colorPct}10 100%)`,
        border: `1px solid ${colorPct}40`,
      }}>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-5">
            <div className="relative" style={{ width: 110, height: 110 }}>
              <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="#0d2035" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke={colorPct} strokeWidth="10"
                  strokeDasharray={`${(pct / 100) * 314} 314`} strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${colorPct})`, transition: "stroke-dasharray 1s" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-space text-[28px] font-bold leading-none" style={{ color: colorPct }}>{pct}%</div>
                <div className="font-exo text-[7px] tracking-widest uppercase mt-0.5" style={{ color: "#5a8090" }}>CAPTURA</div>
              </div>
            </div>
            <div>
              <div className="font-exo text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#5a8090" }}>CONTRATO CENCOSUD · OBJETIVO MENSUAL</div>
              <div className="flex items-baseline gap-3 mb-1">
                <span className="font-space text-[32px] font-bold leading-none" style={{ color: "#00d4ff" }}>{fP(esperado)}</span>
                <span className="font-exo text-[10px]" style={{ color: "#3a6080" }}>esperado</span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-space text-[16px] font-bold" style={{ color: "#00ff88" }}>+{fP(detectado)}</span>
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>detectado</span>
                <span className="font-space text-[16px] font-bold ml-3" style={{ color: "#ff2244" }}>−{fP(brechaMonto)}</span>
                <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>brecha</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden w-[420px] max-w-full" style={{ background: "#0a1218" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: colorPct, boxShadow: `0 0 8px ${colorPct}` }} />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: wtOK ? "#00ff8810" : "#ff224410", border: `1px solid ${wtOK ? "#00ff8840" : "#ff224440"}` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: wtOK ? "#00ff88" : "#ff2244", animation: "blink 2s infinite" }} />
              <span className="font-space text-[9px] font-bold tracking-wider" style={{ color: wtOK ? "#00ff88" : "#ff2244" }}>
                WISETRACK {wtOK ? "OK" : "DEGRADADO"}
              </span>
              {wtLag != null && <span className="font-exo text-[9px]" style={{ color: "#5a8090" }}>· lag {wtLag}s</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => goTab("BRECHA")} className="font-space text-[9px] tracking-wider px-3 py-1.5 rounded cursor-pointer hover:brightness-125 transition"
                style={{ background: "#ff224420", border: "1px solid #ff2244", color: "#ff2244" }}>
                <DollarSign size={10} className="inline mr-1" />ANALIZAR BRECHA
              </button>
              <button onClick={() => goTab("EN_VIVO")} className="font-space text-[9px] tracking-wider px-3 py-1.5 rounded cursor-pointer hover:brightness-125 transition"
                style={{ background: "#00ff8820", border: "1px solid #00ff88", color: "#00ff88" }}>
                <Activity size={10} className="inline mr-1" />OPERACIÓN EN VIVO
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {[
          { l: "INGRESO MES", v: fP(ingresoMes), c: "#00ff88", icon: DollarSign, sub: `${plMes?.viajes_facturables || 0}/${plMes?.total_viajes || 0} viajes`, go: "ERR" as Tab },
          { l: "MARGEN", v: fP(margen), c: margen >= 0 ? "#00ff88" : "#ff2244", icon: TrendingUp, sub: `${margenPct}%` },
          { l: "COSTO MES", v: fP(costoMes), c: "#ff6b35", icon: Fuel, sub: plMes?.rend_promedio ? `${plMes.rend_promedio} km/L` : "—" },
          { l: "FLOTA ACTIVA", v: `${totalActivo}/83`, c: "#00d4ff", icon: Truck, sub: `${enRuta} ruta · ${enCD} CD`, go: "FLOTA" as Tab },
          { l: "EN RUTA AHORA", v: enRuta, c: "#00ff88", icon: Navigation, sub: `${sinGPS} sin GPS`, go: "EN_VIVO" as Tab },
          { l: "VIAJES MES", v: f.viajes || plMes?.total_viajes || 0, c: "#a855f7", icon: Route, sub: `${f.km ? fN(parseFloat(f.km)) : 0} km`, go: "VIAJES" as Tab },
          { l: "CUMPLIM HOY", v: cumplimiento != null ? `${cumplimiento}%` : "—", c: cumplimiento >= 80 ? "#00ff88" : cumplimiento >= 50 ? "#ffcc00" : "#ff6b35", icon: Target, sub: `${ctrlResumen.cumplidos || 0}/${ctrlResumen.total || 0}`, go: "CONTROL" as Tab },
          { l: "SIN MAPEAR", v: sinMapear?.sin_mapear?.length || 0, c: (sinMapear?.sin_mapear?.length || 0) > 20 ? "#ffcc00" : "#3a6080", icon: AlertTriangle, sub: "geocercas faltantes", go: "AGENTE" as Tab },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.l} onClick={() => k.go && goTab(k.go)}
              className={`rounded-lg p-3 ${k.go ? "cursor-pointer hover:brightness-125 transition" : ""}`}
              style={{ background: "#060d14", borderTop: `2px solid ${k.c}`, border: "1px solid #0d2035" }}>
              <div className="flex items-center justify-between mb-1.5">
                <Icon className="w-3.5 h-3.5" style={{ color: `${k.c}80` }} />
                {k.go && <span className="font-space text-[7px]" style={{ color: "#3a6080" }}>›</span>}
              </div>
              <div className="font-space text-[15px] font-bold leading-tight" style={{ color: k.c }}>{k.v}</div>
              <div className="font-exo text-[7px] tracking-wider uppercase mt-1 truncate" style={{ color: "#3a6080" }}>{k.l}</div>
              <div className="font-exo text-[8px] truncate" style={{ color: "#5a8090" }}>{k.sub}</div>
            </div>
          );
        })}
      </div>

      {/* TRES COLUMNAS: OPERACIÓN + OPORTUNIDADES + ALERTAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* OPERACIÓN HOY */}
        <div className="p-4" style={sectionStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-exo text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: "#00ff88" }}>
              <Activity size={10} className="inline mr-1.5" />OPERACIÓN AHORA
            </div>
            <button onClick={() => goTab("EN_VIVO")} className="font-space text-[8px]" style={{ color: "#00d4ff" }}>VER MAPA ›</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { l: "EN RUTA", v: enRuta, c: "#00ff88" },
              { l: "EN CD", v: enCD, c: "#00d4ff" },
              { l: "SIN GPS", v: sinGPS, c: sinGPS > 0 ? "#ff6b35" : "#3a6080" },
            ].map(k => (
              <div key={k.l} className="text-center py-2 rounded" style={{ background: "#0a1218" }}>
                <div className="font-space text-[22px] font-bold leading-none" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[7px] tracking-wider uppercase mt-1" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 max-h-[220px] overflow-auto">
            {(enVivo?.en_ruta || []).slice(0, 6).map((c: any) => (
              <div key={c.patente} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1218" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#00ff88" }} />
                  <span className="font-space text-[10px] font-bold truncate" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-exo text-[9px]" style={{ color: "#5a8090" }}>{c.destino_probable?.nombre || c.entrega?.nombre || "—"}</span>
                  <span className="font-space text-[9px] font-bold" style={{ color: c.velocidad > 0 ? "#00ff88" : "#ff6b35" }}>{Math.round(c.velocidad || 0)}</span>
                </div>
              </div>
            ))}
            {(enVivo?.en_ruta || []).length === 0 && (
              <div className="text-center py-6 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin camiones en ruta ahora</div>
            )}
          </div>
        </div>

        {/* TOP OPORTUNIDADES */}
        <div className="p-4" style={sectionStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-exo text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: "#ffcc00" }}>
              <Target size={10} className="inline mr-1.5" />OPORTUNIDADES $$
            </div>
            <button onClick={() => goTab("BRECHA")} className="font-space text-[8px]" style={{ color: "#00d4ff" }}>VER TODO ›</button>
          </div>
          <div className="font-exo text-[8px] mb-2" style={{ color: "#3a6080" }}>RUTAS SIN TARIFA — cargar al contrato recupera $$ inmediato</div>
          <div className="space-y-1">
            {topRutas.length === 0 && <div className="text-center py-6 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin oportunidades detectadas</div>}
            {topRutas.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded" style={{ background: "#0a1218" }}>
                <div className="min-w-0 flex-1">
                  <div className="font-exo text-[10px] truncate" style={{ color: "#c8e8ff" }}>
                    {r.origen_nombre} → {r.destino_nombre}
                  </div>
                  <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>{r.km_promedio || 0} km · {r.veces}× en 30d</div>
                </div>
                <div className="font-space text-[11px] font-bold ml-2" style={{ color: "#ffcc00" }}>{r.veces}×</div>
              </div>
            ))}
          </div>
          {camionesSinViaje.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px] mb-2" style={{ color: "#ff6b35" }}>CAMIONES CON KM PERO SIN VIAJE: {camionesSinViaje.length}</div>
              <div className="flex flex-wrap gap-1">
                {camionesSinViaje.map((c: any, i: number) => (
                  <span key={i} className="font-space text-[8px] px-1.5 py-0.5 rounded" style={{ background: "#ff224415", color: "#ff6b35" }}>{c.patente}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ALERTAS + SALUD */}
        <div className="p-4" style={sectionStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-exo text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: "#ff2244" }}>
              <AlertTriangle size={10} className="inline mr-1.5" />ALERTAS Y SALUD
            </div>
            <button onClick={() => goTab("AGENTE")} className="font-space text-[8px]" style={{ color: "#00d4ff" }}>AGENTE ›</button>
          </div>
          <div className="space-y-1.5 max-h-[260px] overflow-auto">
            {alertas.length === 0 && sinMap.length === 0 && (
              <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#00ff88" }}>
                <Check size={14} className="inline mr-1" />Sin alertas críticas
              </div>
            )}
            {alertas.map((a: any, i: number) => (
              <div key={i} className="px-2 py-1.5 rounded" style={{ background: "#ff224410", borderLeft: "2px solid #ff2244" }}>
                <div className="font-space text-[9px] font-bold" style={{ color: "#ff6b35" }}>{a.tipo || a.titulo || "Alerta"}</div>
                <div className="font-exo text-[9px]" style={{ color: "#c8e8ff" }}>{a.descripcion || a.mensaje || a.detalle || ""}</div>
              </div>
            ))}
            {sinMap.length > 0 && (
              <div className="px-2 py-1.5 rounded" style={{ background: "#ffcc0010", borderLeft: "2px solid #ffcc00" }}>
                <div className="font-space text-[9px] font-bold" style={{ color: "#ffcc00" }}>{sinMapear.sin_mapear.length} geocercas sin mapear</div>
                <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Top: {sinMap.map((s: any) => s.geocerca || s.nombre).filter(Boolean).slice(0, 3).join(", ")}</div>
              </div>
            )}
            {brecha?.origen_no_cd?.length > 0 && (
              <div className="px-2 py-1.5 rounded" style={{ background: "#ff6b3510", borderLeft: "2px solid #ff6b35" }}>
                <div className="font-space text-[9px] font-bold" style={{ color: "#ff6b35" }}>Viajes con origen no-CD: {brecha.origen_no_cd.length}</div>
                <div className="font-exo text-[8px]" style={{ color: "#5a8090" }}>Top: {brecha.origen_no_cd.slice(0, 2).map((o: any) => `${o.origen_nombre} (${o.veces}×)`).join(", ")}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* P&L + TENDENCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="p-4" style={sectionStyle}>
          <div className="font-exo text-[8px] tracking-[0.2em] uppercase font-bold mb-3" style={{ color: "#00ff88" }}>
            <DollarSign size={10} className="inline mr-1.5" />P&L DEL MES
          </div>
          {plMes ? (
            <div className="space-y-1.5">
              {[
                { l: "Ingreso tarifa", v: fP(plMes.ingreso_total || 0), c: "#00ff88" },
                { l: "Costo diésel", v: fP(plMes.costo_diesel_total || 0), c: "#ff6b35" },
                { l: "Costo CVM", v: fP(plMes.costo_cvm_total || 0), c: "#ff6b35" },
                { l: "Costo total", v: fP(plMes.costo_total || 0), c: "#ff6b35" },
                { l: "Viajes facturables", v: `${plMes.viajes_facturables || 0} / ${plMes.total_viajes || 0}`, c: "#c8e8ff" },
                { l: "KM total", v: fN(plMes.km_total || 0), c: "#c8e8ff" },
                { l: "KM/L promedio", v: plMes.rend_promedio || "—", c: RC(parseFloat(plMes.rend_promedio) || 0) },
              ].map(k => (
                <div key={k.l} className="flex justify-between items-center py-0.5">
                  <span className="font-exo text-[9px]" style={{ color: "#3a6080" }}>{k.l}</span>
                  <span className="font-space text-[10px] font-bold" style={{ color: k.c }}>{k.v}</span>
                </div>
              ))}
              <div className="pt-2 mt-2 flex justify-between items-baseline" style={{ borderTop: "1px solid #0d2035" }}>
                <span className="font-exo text-[10px] font-bold tracking-wider" style={{ color: "#3a6080" }}>MARGEN BRUTO</span>
                <div className="text-right">
                  <div className="font-space text-[16px] font-bold" style={{ color: margen >= 0 ? "#00ff88" : "#ff2244" }}>{fP(margen)}</div>
                  <div className="font-space text-[9px]" style={{ color: margen >= 0 ? "#00ff88" : "#ff2244" }}>{margenPct}%</div>
                </div>
              </div>
            </div>
          ) : <div className="font-exo text-[9px] text-center py-8" style={{ color: "#3a6080" }}>Cargando P&L…</div>}
        </div>

        <div className="p-4" style={sectionStyle}>
          <div className="font-exo text-[8px] tracking-[0.2em] uppercase font-bold mb-3" style={{ color: "#00d4ff" }}>
            <TrendingUp size={10} className="inline mr-1.5" />TENDENCIA DIARIA · KM Y RENDIMIENTO
          </div>
          {(mes?.tendencia || []).length > 0 ? (
            <>
              <div className="flex items-end gap-0.5" style={{ height: 110 }}>
                {(mes?.tendencia || []).map((d: any) => {
                  const maxKm = Math.max(...(mes?.tendencia || []).map((t: any) => parseFloat(t.km) || 0));
                  const h = maxKm > 0 ? (parseFloat(d.km) / maxKm) * 100 : 5;
                  const c = RC(parseFloat(d.rend) || 0);
                  return (
                    <div key={d.dia} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${d.dia}: ${fN(parseFloat(d.km) || 0)} km · ${d.rend} km/L`}>
                      <span className="font-space text-[6px] opacity-0 group-hover:opacity-100" style={{ color: c }}>{d.rend}</span>
                      <div className="w-full rounded-t transition-all" style={{ height: Math.max(3, h), background: c, opacity: 0.85 }} />
                      <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{d.dia.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: "1px solid #0d2035" }}>
                <div className="text-center">
                  <div className="font-space text-[14px] font-bold" style={{ color: "#00d4ff" }}>{fN(parseFloat(f.km) || 0)}</div>
                  <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>KM mes</div>
                </div>
                <div className="text-center">
                  <div className="font-space text-[14px] font-bold" style={{ color: RC(parseFloat(f.rend) || 0) }}>{f.rend || "—"}</div>
                  <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>KM/L</div>
                </div>
                <div className="text-center">
                  <div className="font-space text-[14px] font-bold" style={{ color: "#a855f7" }}>{f.viajes || 0}</div>
                  <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>VIAJES</div>
                </div>
                <div className="text-center">
                  <div className="font-space text-[14px] font-bold" style={{ color: "#ffcc00" }}>{mes?.dia_actual || "—"}/{mes?.dias_mes || "—"}</div>
                  <div className="font-exo text-[7px] tracking-wider uppercase" style={{ color: "#3a6080" }}>DÍA</div>
                </div>
              </div>
            </>
          ) : <div className="font-exo text-[9px] text-center py-8" style={{ color: "#3a6080" }}>Sin datos de tendencia</div>}
        </div>
      </div>

      {/* ACCIONES RÁPIDAS */}
      <div className="p-4" style={sectionStyle}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-exo text-[8px] tracking-[0.2em] uppercase font-bold" style={{ color: "#a855f7" }}>
            <Zap size={10} className="inline mr-1.5" />ACCIONES RÁPIDAS
          </div>
          {feedback && (
            <span className="font-exo text-[9px] px-2 py-1 rounded" style={{ background: feedback.ok ? "#00ff8815" : "#ff224415", color: feedback.ok ? "#00ff88" : "#ff2244" }}>
              {feedback.ok ? "✓" : "✕"} {feedback.msg}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button disabled={!!accionEnCurso} onClick={() => ejecutar("reproc", async () => {
            const hasta = new Date().toISOString().slice(0, 10);
            const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
            const r = await fetch("/api/cencosud/t1-reconstruir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desde, hasta }) }).then(r => r.json());
            const tot = (r.resultados || []).reduce((s: number, x: any) => s + (x.viajes_creados || 0), 0);
            return { mensaje: `${tot} viajes en ${(r.resultados || []).length} días` };
          })} className="px-3 py-2 rounded font-space text-[9px] font-bold tracking-wider cursor-pointer hover:brightness-125 transition disabled:opacity-50"
            style={{ background: "#a855f720", border: "1px solid #a855f7", color: "#a855f7" }}>
            {accionEnCurso === "reproc" ? <Loader2 size={11} className="inline animate-spin mr-1" /> : <RefreshCw size={11} className="inline mr-1" />}
            REPROCESAR 30D
          </button>
          <button disabled={!!accionEnCurso} onClick={() => ejecutar("pl", async () => {
            await fetch("/api/cencosud/pl/calcular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
            return { mensaje: "P&L recalculado" };
          })} className="px-3 py-2 rounded font-space text-[9px] font-bold tracking-wider cursor-pointer hover:brightness-125 transition disabled:opacity-50"
            style={{ background: "#00ff8820", border: "1px solid #00ff88", color: "#00ff88" }}>
            {accionEnCurso === "pl" ? <Loader2 size={11} className="inline animate-spin mr-1" /> : <DollarSign size={11} className="inline mr-1" />}
            RECALCULAR P&L
          </button>
          <button disabled={!!accionEnCurso} onClick={() => ejecutar("autocierre", async () => {
            const r = await fetch("/api/cencosud/auto-cierre/ejecutar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json());
            return { mensaje: r.mensaje || `Procesado` };
          })} className="px-3 py-2 rounded font-space text-[9px] font-bold tracking-wider cursor-pointer hover:brightness-125 transition disabled:opacity-50"
            style={{ background: "#ffcc0020", border: "1px solid #ffcc00", color: "#ffcc00" }}>
            {accionEnCurso === "autocierre" ? <Loader2 size={11} className="inline animate-spin mr-1" /> : <Brain size={11} className="inline mr-1" />}
            AUTO-CIERRE BRECHA
          </button>
          <button onClick={() => goTab("CRUCE")} className="px-3 py-2 rounded font-space text-[9px] font-bold tracking-wider cursor-pointer hover:brightness-125 transition"
            style={{ background: "#ff880020", border: "1px solid #ff8800", color: "#ff8800" }}>
            <Activity size={11} className="inline mr-1" />CRUZAR SIGETRA
          </button>
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
            { t: "BRECHA" as Tab, icon: <DollarSign size={11} />, label: "BRECHA", color: "#ff2244" },
            { t: "ANTIFRAUDE" as Tab, icon: <Activity size={11} />, label: "ANTIFRAUDE", color: "#ff0066" },
            { t: "TARJETAS" as Tab, icon: <DollarSign size={11} />, label: "SIGETRA × SHELL", color: "#ffaa00" },
            { t: "CRUCE" as Tab, icon: <Activity size={11} />, label: "CRUCE", color: "#ff8800" },
            { t: "PROPUESTAS" as Tab, icon: <Target size={11} />, label: "PROPUESTAS", color: "#a855f7" },
            { t: "AUTO" as Tab, icon: <Brain size={11} />, label: "AUTOMATIZACIÓN", color: "#00ffcc" },
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

        {/* ═══ BRECHA DE FACTURACIÓN ═══ */}
        {tab === "BRECHA" && <BrechaTab />}

        {tab === "ANTIFRAUDE" && <AntifraudeTab />}

        {tab === "TARJETAS" && <CruceTarjetasTab />}

        {/* ═══ CRUCE SIGETRA × WISETRACK ═══ */}
        {tab === "CRUCE" && <CruceSigetraTab />}

        {/* ═══ VIAJES PROPUESTOS (sin viaje detectado) ═══ */}
        {tab === "PROPUESTAS" && <PropuestasTab />}

        {/* ═══ AUTOMATIZACIÓN: cierre de brecha + IA ═══ */}
        {tab === "AUTO" && <AutomatizacionTab />}

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

        {/* ═══ RESUMEN EJECUTIVO ═══ */}
        {tab === "RESUMEN" && <ResumenEjecutivoTab goTab={setTab} />}

        {/* ═══ RESUMEN LEGACY (oculto) ═══ */}
        {false && (
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
