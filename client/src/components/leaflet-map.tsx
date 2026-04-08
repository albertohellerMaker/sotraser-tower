import { useEffect, useRef, type ReactNode } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Circle, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DARK_TILE = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

export function LeafletMap({
  center,
  zoom,
  style,
  children,
  className,
}: {
  center?: [number, number];
  zoom?: number;
  style?: React.CSSProperties;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <MapContainer
      center={center || [-33.45, -70.65]}
      zoom={zoom || 6}
      style={{ width: "100%", height: "100%", background: "#0a1520", ...style }}
      className={className}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url={DARK_TILE} attribution={DARK_ATTRIBUTION} />
      {children}
    </MapContainer>
  );
}

export function MapPanner({ lat, lng, zoom }: { lat: number | null; lng: number | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null) {
      map.setView([lat, lng], zoom || map.getZoom(), { animate: true });
    }
  }, [lat, lng, zoom]);
  return null;
}

export function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points.length]);
  return null;
}

export function DivMarker({
  position,
  html,
  size,
  onClick,
  zIndexOffset,
}: {
  position: [number, number];
  html: string;
  size?: [number, number];
  onClick?: () => void;
  zIndexOffset?: number;
}) {
  const w = size?.[0] || 28;
  const h = size?.[1] || 28;
  const icon = L.divIcon({
    html,
    className: "leaflet-div-marker",
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });

  return (
    <Marker
      position={position}
      icon={icon}
      zIndexOffset={zIndexOffset}
      eventHandlers={onClick ? { click: onClick } : undefined}
    />
  );
}

export function CircleMarker({
  center,
  radius,
  color,
  fillColor,
  fillOpacity,
  weight,
  opacity,
}: {
  center: [number, number];
  radius: number;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  opacity?: number;
}) {
  return (
    <Circle
      center={center}
      radius={radius}
      pathOptions={{
        color: color || "#00d4ff",
        fillColor: fillColor || color || "#00d4ff",
        fillOpacity: fillOpacity ?? 0.15,
        weight: weight ?? 1,
        opacity: opacity ?? 0.6,
      }}
    />
  );
}

export { Marker, Polyline, Circle, Popup, useMap };
