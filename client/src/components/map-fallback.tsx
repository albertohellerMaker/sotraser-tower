import { Component, type ReactNode } from "react";
import { MapPin, AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <MapFallback />;
    }
    return this.props.children;
  }
}

export function MapFallback({ lat, lng, label }: { lat?: number; lng?: number; label?: string }) {
  const hasCoords = lat !== undefined && lng !== undefined;
  const osmUrl = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}`
    : null;

  return (
    <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-3 rounded-lg"
      style={{ background: "#0a1a2a", border: "1px solid #1a3050" }}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" style={{ color: "#ffcc00" }} />
        <span className="font-exo text-[11px] tracking-wider" style={{ color: "#6a90b0" }}>
          Google Maps no disponible
        </span>
      </div>
      {hasCoords && (
        <div className="flex flex-col items-center gap-1.5">
          <span className="font-mono text-[10px]" style={{ color: "#4a7090" }}>
            {lat!.toFixed(5)}, {lng!.toFixed(5)}
          </span>
          {label && (
            <span className="font-exo text-[10px]" style={{ color: "#8ab0d0" }}>{label}</span>
          )}
          <a
            href={osmUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded mt-1 transition-colors hover:opacity-80"
            style={{ background: "#0d2540", border: "1px solid #1a3a5a", color: "#00d4ff", fontSize: 10 }}
          >
            <MapPin className="w-3 h-3" />
            Ver en OpenStreetMap
          </a>
        </div>
      )}
    </div>
  );
}
