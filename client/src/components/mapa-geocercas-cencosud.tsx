/**
 * MAPA DE GEOCERCAS CENCOSUD (KML Oficial)
 * Renderiza los polígonos exactos importados desde el KML.
 * Regla absoluta: estos son los únicos puntos de origen/destino válidos.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Layers, RefreshCw } from "lucide-react";

// ── Colores por tipo ──────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { color: string; label: string; emoji: string }> = {
  CD:           { color: "#ff4444", label: "Centro de Distribución", emoji: "🏭" },
  JUMBO:        { color: "#00d4ff", label: "Jumbo",                  emoji: "🛒" },
  SANTA_ISABEL: { color: "#cc44ff", label: "Santa Isabel / SISA",    emoji: "🏪" },
  LIDER:        { color: "#00ff88", label: "Líder Express",           emoji: "🛒" },
  COPEC:        { color: "#ffaa00", label: "Estación Combustible",    emoji: "⛽" },
  BASE:         { color: "#00ffcc", label: "Base Sotraser",           emoji: "🚛" },
  DESCANSO:     { color: "#888888", label: "Zona de Descanso",        emoji: "🏨" },
  PEAJE:        { color: "#ffff44", label: "Peaje / Pesaje",          emoji: "🚧" },
  ZONA:         { color: "#ff8844", label: "Zona Operacional",        emoji: "📍" },
  CLIENTE:      { color: "#44aaff", label: "Cliente / Proveedor",     emoji: "🏢" },
  OTRO:         { color: "#556677", label: "Otro",                    emoji: "📌" },
};

const TODOS_LOS_TIPOS = Object.keys(TIPO_CONFIG);

interface GeoKml {
  id: number;
  kml_id: number | null;
  nombre: string;
  tipo: string;
  lat: number;
  lng: number;
  radio_m: number;
  poligono: [number, number][];
  nombre_contrato: string | null;
}

export default function MapaGeocercasCencosud() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Record<string, L.LayerGroup>>({});
  const [tiposActivos, setTiposActivos] = useState<Set<string>>(new Set(TODOS_LOS_TIPOS));
  const [seleccionada, setSeleccionada] = useState<GeoKml | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const { data, isLoading, refetch } = useQuery<{ geocercas: GeoKml[]; total: number; por_tipo: Record<string, number>; mensaje?: string }>({
    queryKey: ["/api/cencosud/geocercas-mapa"],
    queryFn: () => fetch("/api/cencosud/geocercas-mapa").then(r => r.json()),
    staleTime: 300000,
  });

  // ── Inicializar mapa ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      center: [-35.5, -71.0],
      zoom: 6,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18,
    }).addTo(mapRef.current);

    // Crear layer group por tipo
    for (const tipo of TODOS_LOS_TIPOS) {
      layersRef.current[tipo] = L.layerGroup().addTo(mapRef.current);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Renderizar polígonos cuando llegan datos ─────────────────
  useEffect(() => {
    if (!mapRef.current || !data?.geocercas) return;

    // Limpiar layers
    for (const lg of Object.values(layersRef.current)) lg.clearLayers();

    const bounds: L.LatLngTuple[] = [];

    for (const geo of data.geocercas) {
      const cfg = TIPO_CONFIG[geo.tipo] || TIPO_CONFIG.OTRO;
      const coords: L.LatLngTuple[] = geo.poligono.map(([lat, lng]) => [lat, lng]);
      if (coords.length < 3) continue;

      // Polígono
      const poly = L.polygon(coords, {
        color: cfg.color,
        fillColor: cfg.color,
        fillOpacity: 0.15,
        weight: 2,
        opacity: 0.8,
      });

      // Popup
      poly.bindPopup(`
        <div style="font-family:monospace;min-width:200px">
          <div style="font-weight:bold;font-size:13px;margin-bottom:4px">${cfg.emoji} ${geo.nombre}</div>
          <div style="color:#888;font-size:11px;margin-bottom:6px">${cfg.label}</div>
          ${geo.kml_id ? `<div style="font-size:10px;color:#aaa">ID KML: ${geo.kml_id}</div>` : ""}
          <div style="font-size:10px;color:#aaa">Radio: ${geo.radio_m}m · ${coords.length} vértices</div>
          ${geo.nombre_contrato ? `<div style="font-size:10px;color:#aaa">Contrato: ${geo.nombre_contrato}</div>` : ""}
          <div style="font-size:10px;color:#aaa">Centroide: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}</div>
        </div>
      `, { maxWidth: 280 });

      poly.on("click", () => setSeleccionada(geo));

      // Etiqueta centroide
      const label = L.divIcon({
        className: "",
        html: `<div style="
          font-size:9px;font-family:monospace;font-weight:bold;
          color:${cfg.color};text-shadow:0 0 3px #000;
          white-space:nowrap;pointer-events:none;
          text-align:center;line-height:1.2;
        ">${cfg.emoji}</div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([geo.lat, geo.lng], { icon: label });

      const lg = layersRef.current[geo.tipo] || layersRef.current.OTRO;
      poly.addTo(lg);
      marker.addTo(lg);

      for (const c of coords) bounds.push(c);
    }

    // Ajustar vista
    if (bounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 9 });
    }
  }, [data]);

  // ── Filtrar por tipo (toggle layer) ─────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    for (const tipo of TODOS_LOS_TIPOS) {
      const lg = layersRef.current[tipo];
      if (!lg) continue;
      if (tiposActivos.has(tipo)) {
        if (!mapRef.current.hasLayer(lg)) mapRef.current.addLayer(lg);
      } else {
        if (mapRef.current.hasLayer(lg)) mapRef.current.removeLayer(lg);
      }
    }
  }, [tiposActivos]);

  // ── Zoom a geocerca desde lista ──────────────────────────────
  function zoomA(geo: GeoKml) {
    if (!mapRef.current) return;
    const coords: L.LatLngTuple[] = geo.poligono.map(([lat, lng]) => [lat, lng]);
    mapRef.current.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 16 });
    setSeleccionada(geo);
  }

  const geocercasFiltradas = (data?.geocercas || []).filter(g =>
    !busqueda || g.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 160px)", gap: 0 }}>

      {/* ── PANEL LATERAL ── */}
      <div style={{ width: 280, background: "#060d14", borderRight: "1px solid #0d2035", display: "flex", flexDirection: "column", flexShrink: 0 }}>

        {/* Header panel */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #0d2035" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={14} color="#00d4ff" />
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#00d4ff", fontWeight: "bold", letterSpacing: "0.1em" }}>
                GEOCERCAS KML
              </span>
            </div>
            <button onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: "#3a6080", padding: 2 }}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#3a6080", marginBottom: 8 }}>
            {data?.total ?? "—"} geocercas · Regla absoluta Cencosud
          </div>
          <input
            placeholder="Buscar geocerca..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: "100%", background: "#0a1520", border: "1px solid #0d2035",
              color: "#c8e8ff", fontFamily: "monospace", fontSize: 10,
              padding: "5px 8px", borderRadius: 4, outline: "none", boxSizing: "border-box"
            }}
          />
        </div>

        {/* Filtros por tipo */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #0d2035" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
            <Layers size={10} color="#3a6080" />
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#3a6080", letterSpacing: "0.1em" }}>FILTRAR POR TIPO</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {TODOS_LOS_TIPOS.filter(t => (data?.por_tipo?.[t] || 0) > 0).map(tipo => {
              const cfg = TIPO_CONFIG[tipo];
              const activo = tiposActivos.has(tipo);
              const n = data?.por_tipo?.[tipo] || 0;
              return (
                <button
                  key={tipo}
                  onClick={() => setTiposActivos(prev => {
                    const next = new Set(prev);
                    if (next.has(tipo)) next.delete(tipo);
                    else next.add(tipo);
                    return next;
                  })}
                  style={{
                    background: activo ? `${cfg.color}20` : "transparent",
                    border: `1px solid ${activo ? cfg.color : "#1a3050"}`,
                    color: activo ? cfg.color : "#3a6080",
                    fontFamily: "monospace", fontSize: 8,
                    padding: "2px 5px", borderRadius: 3, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 2,
                  }}
                >
                  {cfg.emoji} {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista geocercas */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading && (
            <div style={{ padding: 20, textAlign: "center", fontFamily: "monospace", fontSize: 10, color: "#3a6080" }}>
              Cargando geocercas...
            </div>
          )}
          {data?.mensaje && (
            <div style={{ padding: 12, fontFamily: "monospace", fontSize: 10, color: "#ff6b35", lineHeight: 1.5 }}>
              {data.mensaje}
            </div>
          )}
          {geocercasFiltradas.map(geo => {
            const cfg = TIPO_CONFIG[geo.tipo] || TIPO_CONFIG.OTRO;
            const esSeleccionada = seleccionada?.id === geo.id;
            return (
              <div
                key={geo.id}
                onClick={() => zoomA(geo)}
                style={{
                  padding: "7px 12px",
                  borderBottom: "1px solid #060d14",
                  cursor: "pointer",
                  background: esSeleccionada ? `${cfg.color}10` : "transparent",
                  borderLeft: `2px solid ${esSeleccionada ? cfg.color : "transparent"}`,
                  transition: "all 0.1s",
                }}
              >
                <div style={{ fontFamily: "monospace", fontSize: 10, color: esSeleccionada ? cfg.color : "#c8e8ff", fontWeight: esSeleccionada ? "bold" : "normal" }}>
                  {cfg.emoji} {geo.nombre}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 8, color: "#3a6080", marginTop: 1 }}>
                  {cfg.label} · r={geo.radio_m}m
                </div>
              </div>
            );
          })}
        </div>

        {/* Leyenda de colores */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid #0d2035" }}>
          <div style={{ fontFamily: "monospace", fontSize: 8, color: "#1a3050", letterSpacing: "0.1em", marginBottom: 4 }}>LEYENDA</div>
          {TODOS_LOS_TIPOS.filter(t => (data?.por_tipo?.[t] || 0) > 0).map(tipo => {
            const cfg = TIPO_CONFIG[tipo];
            return (
              <div key={tipo} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "monospace", fontSize: 8, color: "#3a6080" }}>{cfg.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAPA ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Badge info selección */}
        {seleccionada && (
          <div style={{
            position: "absolute", bottom: 12, left: 12, zIndex: 1000,
            background: "#060d14ee", border: `1px solid ${TIPO_CONFIG[seleccionada.tipo]?.color || "#3a6080"}`,
            padding: "8px 12px", borderRadius: 6, maxWidth: 320,
          }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "bold", color: TIPO_CONFIG[seleccionada.tipo]?.color || "#c8e8ff", marginBottom: 2 }}>
              {TIPO_CONFIG[seleccionada.tipo]?.emoji} {seleccionada.nombre}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#3a6080" }}>
              Radio: {seleccionada.radio_m}m · {seleccionada.poligono.length} vértices
              {seleccionada.kml_id ? ` · KML ID: ${seleccionada.kml_id}` : ""}
            </div>
            <button
              onClick={() => setSeleccionada(null)}
              style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "#3a6080", cursor: "pointer", fontSize: 12 }}
            >✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
