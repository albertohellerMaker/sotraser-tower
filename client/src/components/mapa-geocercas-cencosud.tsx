import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Layers, RefreshCw } from "lucide-react";
import { createDarkMap, fitBoundsToPoints, addInfoWindow, isGoogleMapsReady } from "@/lib/google-maps-utils";

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
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Record<string, (google.maps.Polygon | google.maps.marker.AdvancedMarkerElement | google.maps.Marker)[]>>({});
  const [tiposActivos, setTiposActivos] = useState<Set<string>>(new Set(TODOS_LOS_TIPOS));
  const [seleccionada, setSeleccionada] = useState<GeoKml | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const { data, isLoading, refetch } = useQuery<{ geocercas: GeoKml[]; total: number; por_tipo: Record<string, number>; mensaje?: string }>({
    queryKey: ["/api/cencosud/geocercas-mapa"],
    queryFn: () => fetch("/api/cencosud/geocercas-mapa").then(r => r.json()),
    staleTime: 300000,
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !isGoogleMapsReady()) return;
    mapRef.current = createDarkMap(containerRef.current, {
      center: { lat: -35.5, lng: -71.0 },
      zoom: 6,
    });
    for (const tipo of TODOS_LOS_TIPOS) {
      overlaysRef.current[tipo] = [];
    }
    return () => { mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !data?.geocercas || !isGoogleMapsReady()) return;
    const map = mapRef.current;

    for (const arr of Object.values(overlaysRef.current)) {
      arr.forEach((o: any) => { if (o.setMap) o.setMap(null); else if (o.map !== undefined) o.map = null; });
      arr.length = 0;
    }

    const allPoints: { lat: number; lng: number }[] = [];

    for (const geo of data.geocercas) {
      const cfg = TIPO_CONFIG[geo.tipo] || TIPO_CONFIG.OTRO;
      const coords = geo.poligono.map(([lat, lng]) => ({ lat, lng }));
      if (coords.length < 3) continue;

      const polygon = new google.maps.Polygon({
        paths: coords,
        strokeColor: cfg.color,
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: cfg.color,
        fillOpacity: 0.15,
        map: tiposActivos.has(geo.tipo) ? map : null,
      });

      const popupContent = `
        <div style="font-family:monospace;min-width:200px">
          <div style="font-weight:bold;font-size:13px;margin-bottom:4px">${cfg.emoji} ${geo.nombre}</div>
          <div style="color:#888;font-size:11px;margin-bottom:6px">${cfg.label}</div>
          ${geo.kml_id ? `<div style="font-size:10px;color:#aaa">ID KML: ${geo.kml_id}</div>` : ""}
          <div style="font-size:10px;color:#aaa">Radio: ${geo.radio_m}m · ${coords.length} vértices</div>
          ${geo.nombre_contrato ? `<div style="font-size:10px;color:#aaa">Contrato: ${geo.nombre_contrato}</div>` : ""}
          <div style="font-size:10px;color:#aaa">Centroide: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}</div>
        </div>
      `;

      const infoWindow = new google.maps.InfoWindow({ content: popupContent, maxWidth: 280 });
      polygon.addListener("click", (e: any) => {
        infoWindow.setPosition(e.latLng);
        infoWindow.open(map);
        setSeleccionada(geo);
      });

      const el = document.createElement("div");
      el.innerHTML = `<div style="font-size:9px;font-family:monospace;font-weight:bold;color:${cfg.color};text-shadow:0 0 3px #000;white-space:nowrap;pointer-events:none;text-align:center;line-height:1.2;">${cfg.emoji}</div>`;
      el.style.width = "16px";
      el.style.height = "16px";

      const tipoArr = overlaysRef.current[geo.tipo] || overlaysRef.current.OTRO;
      tipoArr.push(polygon);

      if (google.maps.marker?.AdvancedMarkerElement) {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: tiposActivos.has(geo.tipo) ? map : null,
          position: { lat: geo.lat, lng: geo.lng },
          content: el,
        });
        tipoArr.push(marker);
      } else {
        const marker = new google.maps.Marker({
          map: tiposActivos.has(geo.tipo) ? map : null,
          position: { lat: geo.lat, lng: geo.lng },
        });
        tipoArr.push(marker);
      }

      for (const c of coords) allPoints.push(c);
    }

    if (allPoints.length > 0) {
      fitBoundsToPoints(map, allPoints, 30, 9);
    }
  }, [data]);

  useEffect(() => {
    if (!mapRef.current || !isGoogleMapsReady()) return;
    const map = mapRef.current;
    for (const tipo of TODOS_LOS_TIPOS) {
      const arr = overlaysRef.current[tipo] || [];
      const visible = tiposActivos.has(tipo);
      arr.forEach((o: any) => {
        if (o.setMap) o.setMap(visible ? map : null);
        else if (o.map !== undefined) o.map = visible ? map : null;
      });
    }
  }, [tiposActivos]);

  function zoomA(geo: GeoKml) {
    if (!mapRef.current) return;
    const coords = geo.poligono.map(([lat, lng]) => ({ lat, lng }));
    fitBoundsToPoints(mapRef.current, coords, 40, 16);
    setSeleccionada(geo);
  }

  const geocercasFiltradas = (data?.geocercas || []).filter(g =>
    !busqueda || g.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 160px)", gap: 0 }}>

      <div style={{ width: 280, background: "#060d14", borderRight: "1px solid #0d2035", display: "flex", flexDirection: "column", flexShrink: 0 }}>

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

      <div style={{ flex: 1, position: "relative" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

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
