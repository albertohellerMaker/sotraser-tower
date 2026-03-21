import { estadoColors, estadoLabels } from "./types";

export function EstadoBadge({ estado }: { estado: string }) {
  const color = estadoColors[estado] || "#3a6080";
  return (
    <span className="font-exo text-[10px] font-bold px-2 py-0.5 rounded" style={{
      background: color + "20",
      border: `1px solid ${color}`,
      color,
    }} data-testid={`badge-estado-${estado}`}>
      {estadoLabels[estado] || estado}
    </span>
  );
}

export function CamionStatusDot({ estado }: { estado: string }) {
  const colors: Record<string, string> = {
    EN_MOVIMIENTO: "#00c97a",
    DETENIDO_RECIENTE: "#ffcc00",
    DETENIDO: "#ff2244",
    "SIN_SEÑAL": "#3a6080",
  };
  return <div className="w-2 h-2 rounded-full" style={{ background: colors[estado] || "#3a6080" }} />;
}
