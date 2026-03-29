import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Route, Truck, TrendingUp, MapPin, ChevronDown, ChevronUp, ArrowRight, Calendar, Fuel } from "lucide-react";

function rendColor(r: number): string {
  if (r >= 2.85) return "#00ff88";
  if (r >= 2.3) return "#ffcc00";
  return "#ff2244";
}

function getContColor(c: string): string {
  if (c?.includes("ANGLO-COCU")) return "#00ff88";
  if (c?.includes("ANGLO-CAL")) return "#ff6b35";
  if (c?.includes("ANGLO")) return "#00d4ff";
  if (c?.includes("CENCOSUD") || c?.includes("WALMART")) return "#00bfff";
  const hash = c?.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) || 0;
  return ["#a855f7", "#06b6d4", "#f97316", "#84cc16", "#ec4899"][hash % 5];
}

export default function AcumulacionTab() {
  const [contrato, setContrato] = useState("TODOS");
  const [dias, setDias] = useState(30);
  const [rutaExpandida, setRutaExpandida] = useState<string | null>(null);
  const [orden, setOrden] = useState<"viajes" | "rend" | "km" | "camiones">("viajes");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/rutas/acumulacion", contrato, dias],
    queryFn: () => fetch(`/api/rutas/acumulacion?contrato=${contrato}&dias=${dias}`).then(r => r.json()),
  });

  const { data: contratosData } = useQuery<any>({
    queryKey: ["/api/rutas/contratos-disponibles"],
    queryFn: () => fetch("/api/rutas/contratos-disponibles").then(r => r.json()),
    staleTime: 600000,
  });

  const contratos = contratosData?.contratos || [{ id: "TODOS", label: "TODOS" }];

  const rutasOrdenadas = useMemo(() => {
    if (!data?.rutas) return [];
    const r = [...data.rutas];
    if (orden === "viajes") r.sort((a: any, b: any) => b.viajes - a.viajes);
    else if (orden === "rend") r.sort((a: any, b: any) => b.rend_promedio - a.rend_promedio);
    else if (orden === "km") r.sort((a: any, b: any) => b.km_promedio - a.km_promedio);
    else if (orden === "camiones") r.sort((a: any, b: any) => b.camiones - a.camiones);
    return r;
  }, [data, orden]);

  // Detalle expandido
  const rutaKey = (r: any) => `${r.origen}|${r.destino}|${r.contrato}`;

  const { data: detalle } = useQuery<any>({
    queryKey: ["/api/rutas/acumulacion/detalle", rutaExpandida],
    queryFn: () => {
      if (!rutaExpandida) return null;
      const [o, d, c] = rutaExpandida.split("|");
      return fetch(`/api/rutas/acumulacion/detalle?origen=${encodeURIComponent(o)}&destino=${encodeURIComponent(d)}&contrato=${encodeURIComponent(c)}`).then(r => r.json());
    },
    enabled: !!rutaExpandida,
  });

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00d4ff" }} /></div>;

  const res = data?.resumen || {};

  return (
    <div data-testid="acumulacion-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-rajdhani text-sm font-bold" style={{ color: "#c8e8ff" }}>Acumulacion de Viajes</div>
          <div className="font-exo text-xs" style={{ color: "#3a6080" }}>
            {res.total_viajes || 0} viajes en {res.rutas_unicas || 0} rutas · {res.pct_nombre || 0}% con nombre
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Periodo */}
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDias(d)}
                className="font-space text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                style={{ background: dias === d ? "#00d4ff15" : "transparent", border: `1px solid ${dias === d ? "#00d4ff40" : "#0d2035"}`, color: dias === d ? "#00d4ff" : "#3a6080" }}>
                {d}D
              </button>
            ))}
          </div>
          {/* Contratos */}
          <div className="flex gap-1">
            {contratos.slice(0, 6).map((c: any) => (
              <button key={c.id} onClick={() => setContrato(c.id)}
                className="font-exo text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                style={{ background: contrato === c.id ? getContColor(c.id) + "15" : "transparent", border: `1px solid ${contrato === c.id ? getContColor(c.id) + "40" : "#0d2035"}`, color: contrato === c.id ? getContColor(c.id) : "#3a6080" }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { label: "VIAJES", value: res.total_viajes || 0, color: "#00d4ff" },
          { label: "RUTAS UNICAS", value: res.rutas_unicas || 0, color: "#a855f7" },
          { label: "CON NOMBRE", value: `${res.pct_nombre || 0}%`, color: res.pct_nombre >= 50 ? "#00ff88" : "#ffcc00" },
          { label: "CAMIONES", value: data?.camiones?.length || 0, color: "#c8e8ff" },
          { label: "DIAS", value: data?.por_dia?.length || 0, color: "#c8e8ff" },
        ].map(k => (
          <div key={k.label} className="text-center py-2 rounded" style={{ background: "#060d14", border: "1px solid #0d2035", borderTop: `2px solid ${k.color}` }}>
            <div className="font-space text-[16px] font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="font-exo text-[7px] tracking-[0.1em] uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Orden */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-exo text-[8px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Ordenar:</span>
        {([["viajes", "Viajes"], ["rend", "Rendimiento"], ["km", "KM"], ["camiones", "Camiones"]] as const).map(([o, l]) => (
          <button key={o} onClick={() => setOrden(o)}
            className="font-exo text-[8px] font-bold px-2 py-1 rounded cursor-pointer"
            style={{ background: orden === o ? "#0a1520" : "transparent", border: `1px solid ${orden === o ? "#00d4ff30" : "transparent"}`, color: orden === o ? "#00d4ff" : "#3a6080" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Tabla de rutas */}
      <div className="space-y-1">
        {rutasOrdenadas.map((r: any) => {
          const key = rutaKey(r);
          const isOpen = rutaExpandida === key;
          const cc = getContColor(r.contrato);

          return (
            <div key={key}>
              {/* Row */}
              <button onClick={() => setRutaExpandida(isOpen ? null : key)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer transition-all hover:opacity-90"
                style={{ background: isOpen ? "#0a1a28" : "#060d14", border: `1px solid ${isOpen ? cc + "30" : "#0d2035"}`, borderLeft: `3px solid ${cc}` }}>

                {/* Ruta */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-exo text-[10px] font-bold truncate" style={{ color: "#c8e8ff" }}>
                      {r.origen}
                    </span>
                    <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} />
                    <span className="font-exo text-[10px] font-bold truncate" style={{ color: "#c8e8ff" }}>
                      {r.es_circular ? "(circular)" : r.destino}
                    </span>
                  </div>
                  <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>
                    {r.contrato} · {r.dias_activos} dias activos · {r.duracion_prom_min > 0 ? `~${Math.round(r.duracion_prom_min / 60)}h ${r.duracion_prom_min % 60}m` : ""}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-center">
                    <div className="font-space text-[13px] font-bold" style={{ color: "#00d4ff" }}>{r.viajes}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>viajes</div>
                  </div>
                  <div className="text-center">
                    <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{r.camiones}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>camiones</div>
                  </div>
                  <div className="text-center">
                    <div className="font-space text-[13px] font-bold" style={{ color: "#c8e8ff" }}>{r.km_promedio}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>km prom</div>
                  </div>
                  <div className="text-center">
                    <div className="font-space text-[13px] font-bold" style={{ color: rendColor(r.rend_promedio) }}>{r.rend_promedio > 0 ? r.rend_promedio.toFixed(2) : "--"}</div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>km/L</div>
                  </div>
                  <div className="text-center w-10">
                    <div className="font-space text-[11px] font-bold" style={{ color: r.consistencia_pct >= 80 ? "#00ff88" : r.consistencia_pct >= 50 ? "#ffcc00" : "#ff2244" }}>
                      {r.consistencia_pct}%
                    </div>
                    <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>consist.</div>
                  </div>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="mx-3 px-4 py-3 rounded-b" style={{ background: "#0a1520", borderLeft: `3px solid ${cc}`, borderBottom: `1px solid ${cc}20` }}>
                  {/* Rango rendimiento */}
                  <div className="flex items-center gap-4 mb-3 pb-3" style={{ borderBottom: "1px solid #0d2035" }}>
                    <div>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Rango km/L</div>
                      <div className="flex items-center gap-1">
                        <span className="font-space text-[11px]" style={{ color: rendColor(r.rend_min) }}>{r.rend_min > 0 ? r.rend_min.toFixed(2) : "--"}</span>
                        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>→</span>
                        <span className="font-space text-[11px]" style={{ color: rendColor(r.rend_max) }}>{r.rend_max > 0 ? r.rend_max.toFixed(2) : "--"}</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Variacion KM</div>
                      <div className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{r.km_promedio} ± {r.km_desviacion}</div>
                    </div>
                    <div>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Primer viaje</div>
                      <div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{r.primer_viaje?.slice(0, 10)}</div>
                    </div>
                    <div>
                      <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>Ultimo viaje</div>
                      <div className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{r.ultimo_viaje?.slice(0, 10)}</div>
                    </div>
                  </div>

                  {/* Lista de viajes individuales */}
                  {detalle?.viajes ? (
                    <div>
                      <div className="font-exo text-[8px] uppercase tracking-wider mb-2" style={{ color: "#3a6080" }}>
                        {detalle.total} VIAJES EN ESTA RUTA
                      </div>
                      <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                        {detalle.viajes.map((v: any, i: number) => (
                          <div key={v.id || i} className="flex items-center justify-between px-2 py-1.5 rounded"
                            style={{ background: i % 2 === 0 ? "#060d14" : "transparent" }}>
                            <div className="flex items-center gap-3">
                              <span className="font-space text-[9px] w-4 text-right" style={{ color: "#3a6080" }}>{i + 1}</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{v.patente}</span>
                              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                                {v.fecha?.slice(0, 10)} {v.fecha?.slice(11, 16)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-space text-[10px]" style={{ color: "#c8e8ff" }}>{Math.round(v.km || 0)} km</span>
                              <span className="font-space text-[10px] font-bold" style={{ color: rendColor(v.rendimiento || 0) }}>
                                {v.rendimiento > 0 ? v.rendimiento.toFixed(2) : "--"} km/L
                              </span>
                              <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>
                                {v.duracion > 0 ? `${Math.floor(v.duracion / 60)}h${v.duracion % 60}m` : ""}
                              </span>
                              <span className="font-exo text-[7px]" style={{ color: v.snaps >= 15 ? "#00ff88" : "#ffcc00" }}>
                                {v.snaps || 0} snaps
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#3a6080" }} />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {rutasOrdenadas.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <Route className="w-6 h-6 mx-auto mb-2" style={{ color: "#3a6080" }} />
            <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin rutas acumuladas para este filtro</div>
          </div>
        )}
      </div>

      {/* Top camiones section */}
      {data?.camiones?.length > 0 && (
        <div className="mt-4 rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>TOP CAMIONES POR VIAJES</div>
          <div className="grid grid-cols-4 gap-2">
            {data.camiones.slice(0, 12).map((c: any) => (
              <div key={c.patente} className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "#0a1520" }}>
                <div>
                  <div className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</div>
                  <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{c.rutas_distintas} rutas</div>
                </div>
                <div className="text-right">
                  <div className="font-space text-[11px] font-bold" style={{ color: "#00d4ff" }}>{c.viajes}v</div>
                  <div className="font-space text-[9px]" style={{ color: rendColor(c.rend) }}>{c.rend > 0 ? c.rend.toFixed(2) : "--"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
