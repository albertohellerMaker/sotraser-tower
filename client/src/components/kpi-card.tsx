import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({ label, value, unit, sub, color, icon, className }: KpiCardProps) {
  return (
    <div
      data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}
      className={cn(
        "relative bg-card border border-border p-4 overflow-hidden",
        className
      )}
      style={{ borderTopWidth: 2, borderTopColor: color }}
    >
      {icon && (
        <div className="absolute right-3 top-2.5 text-xl opacity-10">
          {icon}
        </div>
      )}
      <div className="text-[11px] font-mono text-muted-foreground tracking-[0.2em] uppercase mb-1.5">
        {label}
      </div>
      <div className="font-mono font-bold text-2xl leading-none" style={{ color }}>
        {value}
        {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      </div>
      {sub && (
        <div className="text-xs text-muted-foreground font-mono mt-1.5">{sub}</div>
      )}
    </div>
  );
}
