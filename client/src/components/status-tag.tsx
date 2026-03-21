import { cn } from "@/lib/utils";

interface StatusTagProps {
  label: string;
  variant?: "critico" | "alerta" | "ok" | "info" | "custom";
  color?: string;
  dot?: boolean;
  className?: string;
}

const variantStyles = {
  critico: "bg-red-500/10 border-red-500/25 text-red-400",
  alerta: "bg-amber-400/10 border-amber-400/25 text-amber-400",
  ok: "bg-emerald-400/10 border-emerald-400/25 text-emerald-400",
  info: "bg-blue-500/10 border-blue-500/25 text-blue-400",
  custom: "",
};

export function StatusTag({ label, variant = "info", color, dot, className }: StatusTagProps) {
  const isCustom = variant === "custom" && color;

  return (
    <span
      data-testid={`tag-${label.toLowerCase().replace(/\s/g, "-")}`}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono font-bold tracking-[0.15em] uppercase border whitespace-nowrap",
        !isCustom && variantStyles[variant],
        className
      )}
      style={isCustom ? {
        backgroundColor: `${color}1A`,
        borderColor: `${color}40`,
        color: color,
      } : undefined}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            !isCustom && variant === "critico" && "bg-red-500",
            !isCustom && variant === "alerta" && "bg-amber-400",
            !isCustom && variant === "ok" && "bg-emerald-400",
            !isCustom && variant === "info" && "bg-blue-500",
          )}
          style={isCustom ? { backgroundColor: color } : undefined}
        />
      )}
      {label}
    </span>
  );
}

export function getStatusVariant(estado: string): StatusTagProps["variant"] {
  if (estado === "CRITICO") return "critico";
  if (estado === "ALERTA") return "alerta";
  if (estado === "OK") return "ok";
  return "info";
}
