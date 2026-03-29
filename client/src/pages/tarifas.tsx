import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/kpi-card";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Route, Plus, Pencil, Trash2, Check, X, Filter, DollarSign, TrendingUp, Fuel } from "lucide-react";
import type { PuntoRuta, TarifaRuta } from "@shared/schema";

type SubTab = "puntos" | "tarifas";

function PuntosConfirmados() {
  const { data: puntos = [], isLoading } = useQuery<PuntoRuta[]>({ queryKey: ["/api/tarifas/puntos-confirmados"] });
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async ({ id, nombreInferido }: { id: number; nombreInferido: string }) => {
      await apiRequest("PUT", `/api/puntos-ruta/${id}`, { nombreInferido });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tarifas/puntos-confirmados"] });
      setEditId(null);
      toast({ title: "Punto actualizado" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const tipos = useMemo(() => {
    const set = new Set(puntos.map(p => p.tipo || "SIN TIPO"));
    return ["todos", ...Array.from(set)];
  }, [puntos]);

  const filtered = useMemo(() => {
    if (tipoFilter === "todos") return puntos;
    return puntos.filter(p => (p.tipo || "SIN TIPO") === tipoFilter);
  }, [puntos, tipoFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PuntoRuta[]>();
    for (const p of filtered) {
      const key = p.tipo || "SIN TIPO";
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  const tipoColor: Record<string, string> = {
    CARGA: "#FFB020",
    ENTREGA: "#00C87A",
    COMBUSTIBLE: "#1A8FFF",
    DESCANSO: "#A855F7",
    "SIN TIPO": "#5A7A9A",
  };

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="puntos-loading">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="puntos-view">
      <div className="flex items-center gap-2 flex-wrap" data-testid="puntos-tipo-filters">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {tipos.map(t => (
          <button
            key={t}
            onClick={() => setTipoFilter(t)}
            data-testid={`filter-tipo-${t.toLowerCase().replace(/\s/g, "-")}`}
            className={`px-3 py-1.5 text-xs font-mono tracking-[0.1em] cursor-pointer border uppercase transition-all ${
              tipoFilter === t
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border text-muted-foreground"
            }`}
          >
            {t === "todos" ? "Todos" : t}
            {t !== "todos" && (
              <span className="ml-1 opacity-60">
                ({puntos.filter(p => (p.tipo || "SIN TIPO") === t).length})
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto text-[11px] font-mono text-muted-foreground">
          {filtered.length} puntos confirmados
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground font-mono text-xs" data-testid="text-no-puntos">
          No hay puntos confirmados. Detecta y confirma puntos desde la ficha de cada camion.
        </div>
      )}

      {Array.from(grouped.entries()).map(([tipo, pts]) => (
        <div key={tipo} data-testid={`grupo-tipo-${tipo.toLowerCase().replace(/\s/g, "-")}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tipoColor[tipo] || "#5A7A9A" }} />
            <span className="text-xs font-mono font-bold tracking-[0.15em]" style={{ color: tipoColor[tipo] || "#5A7A9A" }}>
              {tipo}
            </span>
            <span className="text-xs font-mono text-muted-foreground">({pts.length})</span>
          </div>
          <div className="bg-card border border-border">
            <div className="grid grid-cols-[1fr_200px_120px_100px_80px] px-4 py-2 border-b border-border bg-muted/30 text-xs font-mono text-muted-foreground tracking-[0.2em]">
              <div>NOMBRE</div><div>COORDENADAS</div><div>DURACION</div><div>FECHA</div><div>ACCIONES</div>
            </div>
            {pts.map((p, i) => (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_200px_120px_100px_80px] px-4 py-3 items-center ${
                  i < pts.length - 1 ? "border-b border-border/20" : ""
                }`}
                data-testid={`punto-row-${p.id}`}
              >
                <div>
                  {editId === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-7 text-xs font-mono w-48"
                        data-testid={`input-edit-punto-${p.id}`}
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => updateMutation.mutate({ id: p.id, nombreInferido: editName })}
                        disabled={updateMutation.isPending}
                        data-testid={`btn-save-punto-${p.id}`}
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditId(null)} data-testid={`btn-cancel-edit-${p.id}`}>
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs font-mono text-foreground">{p.nombreInferido || "Sin nombre"}</span>
                  )}
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {p.lat}, {p.lng}
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {p.duracionMin != null ? `${p.duracionMin} min` : "--"}
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {p.fecha ? new Date(p.fecha).toLocaleDateString("es-CL") : "--"}
                </div>
                <div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setEditId(p.id); setEditName(p.nombreInferido || ""); }}
                    data-testid={`btn-edit-punto-${p.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TarifasPorRuta() {
  const { data: tarifas = [], isLoading } = useQuery<TarifaRuta[]>({ queryKey: ["/api/tarifas"] });
  const { data: puntosConfirmados = [] } = useQuery<PuntoRuta[]>({ queryKey: ["/api/tarifas/puntos-confirmados"] });
  const [showForm, setShowForm] = useState(false);
  const [editingTarifa, setEditingTarifa] = useState<TarifaRuta | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    nombreRuta: "",
    origenNombre: "",
    destinoNombre: "",
    distanciaKm: "",
    litrosPromedio: "",
    tiempoHoras: "",
    tarifaClp: "",
    tarifaUsd: "",
    notas: "",
    puntoOrigenId: "",
    puntoDestinoId: "",
  });

  const activeTarifas = useMemo(() => tarifas.filter(t => t.activa !== false), [tarifas]);

  const kpis = useMemo(() => {
    const total = activeTarifas.length;
    const mostExpensive = activeTarifas.reduce((max, t) => {
      const val = t.tarifaClp ? parseFloat(String(t.tarifaClp)) : 0;
      return val > max.val ? { val, nombre: t.nombreRuta } : max;
    }, { val: 0, nombre: "--" });
    const litrosValues = activeTarifas.map(t => t.litrosPromedio ? parseFloat(String(t.litrosPromedio)) : 0).filter(v => v > 0);
    const avgLitros = litrosValues.length > 0 ? (litrosValues.reduce((a, b) => a + b, 0) / litrosValues.length).toFixed(1) : "--";
    const distValues = activeTarifas.map(t => t.distanciaKm ? parseFloat(String(t.distanciaKm)) : 0).filter(v => v > 0);
    const mostFrequent = activeTarifas.length > 0 ? activeTarifas[0].nombreRuta : "--";
    return { total, mostExpensive: mostExpensive.nombre, avgLitros, mostFrequent };
  }, [activeTarifas]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const body = {
        nombreRuta: data.nombreRuta,
        origenNombre: data.origenNombre || null,
        destinoNombre: data.destinoNombre || null,
        distanciaKm: data.distanciaKm || null,
        litrosPromedio: data.litrosPromedio || null,
        tiempoHoras: data.tiempoHoras || null,
        tarifaClp: data.tarifaClp || null,
        tarifaUsd: data.tarifaUsd || null,
        notas: data.notas || null,
        puntoOrigenId: data.puntoOrigenId ? parseInt(data.puntoOrigenId) : null,
        puntoDestinoId: data.puntoDestinoId ? parseInt(data.puntoDestinoId) : null,
        activa: true,
      };
      await apiRequest("POST", "/api/tarifas", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tarifas"] });
      resetForm();
      toast({ title: "Tarifa creada" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const body = {
        nombreRuta: data.nombreRuta,
        origenNombre: data.origenNombre || null,
        destinoNombre: data.destinoNombre || null,
        distanciaKm: data.distanciaKm || null,
        litrosPromedio: data.litrosPromedio || null,
        tiempoHoras: data.tiempoHoras || null,
        tarifaClp: data.tarifaClp || null,
        tarifaUsd: data.tarifaUsd || null,
        notas: data.notas || null,
        puntoOrigenId: data.puntoOrigenId ? parseInt(data.puntoOrigenId) : null,
        puntoDestinoId: data.puntoDestinoId ? parseInt(data.puntoDestinoId) : null,
      };
      await apiRequest("PUT", `/api/tarifas/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tarifas"] });
      resetForm();
      toast({ title: "Tarifa actualizada" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tarifas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tarifas"] });
      toast({ title: "Tarifa eliminada" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({
      nombreRuta: "", origenNombre: "", destinoNombre: "",
      distanciaKm: "", litrosPromedio: "", tiempoHoras: "",
      tarifaClp: "", tarifaUsd: "", notas: "",
      puntoOrigenId: "", puntoDestinoId: "",
    });
    setShowForm(false);
    setEditingTarifa(null);
  }

  function startEdit(t: TarifaRuta) {
    setEditingTarifa(t);
    setFormData({
      nombreRuta: t.nombreRuta,
      origenNombre: t.origenNombre || "",
      destinoNombre: t.destinoNombre || "",
      distanciaKm: t.distanciaKm ? String(t.distanciaKm) : "",
      litrosPromedio: t.litrosPromedio ? String(t.litrosPromedio) : "",
      tiempoHoras: t.tiempoHoras ? String(t.tiempoHoras) : "",
      tarifaClp: t.tarifaClp ? String(t.tarifaClp) : "",
      tarifaUsd: t.tarifaUsd ? String(t.tarifaUsd) : "",
      notas: t.notas || "",
      puntoOrigenId: t.puntoOrigenId ? String(t.puntoOrigenId) : "",
      puntoDestinoId: t.puntoDestinoId ? String(t.puntoDestinoId) : "",
    });
    setShowForm(true);
  }

  function handleSubmit() {
    if (!formData.nombreRuta.trim()) {
      toast({ title: "Error", description: "Nombre de ruta requerido", variant: "destructive" });
      return;
    }
    if (editingTarifa) {
      updateMutation.mutate({ id: editingTarifa.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="tarifas-loading">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="tarifas-ruta-view">
      <div className="grid grid-cols-4 gap-3" data-testid="tarifas-kpis">
        <KpiCard label="Total Rutas" value={kpis.total} color="#1A8FFF"
          icon={<Route className="w-5 h-5" />} />
        <KpiCard label="Mas Costosa" value={kpis.mostExpensive} color="#FF2D4A"
          icon={<DollarSign className="w-5 h-5" />} />
        <KpiCard label="Mas Frecuente" value={kpis.mostFrequent} color="#FFB020"
          icon={<TrendingUp className="w-5 h-5" />} />
        <KpiCard label="Litros Promedio" value={kpis.avgLitros} unit="L" color="#00C87A"
          icon={<Fuel className="w-5 h-5" />} />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px] font-mono text-muted-foreground">
          {activeTarifas.length} tarifas activas
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { resetForm(); setShowForm(true); }}
          data-testid="btn-nueva-tarifa"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nueva Tarifa
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border p-4 space-y-3" data-testid="tarifa-form">
          <div className="text-[11px] font-mono text-muted-foreground tracking-[0.2em] uppercase mb-2">
            {editingTarifa ? "EDITAR TARIFA" : "NUEVA TARIFA"}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">NOMBRE RUTA *</label>
              <Input
                value={formData.nombreRuta}
                onChange={e => setFormData({ ...formData, nombreRuta: e.target.value })}
                placeholder="Ej: Faena Norte - Puerto"
                className="text-xs font-mono"
                data-testid="input-nombre-ruta"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">ORIGEN</label>
              <Input
                value={formData.origenNombre}
                onChange={e => setFormData({ ...formData, origenNombre: e.target.value })}
                placeholder="Nombre origen"
                className="text-xs font-mono"
                data-testid="input-origen"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">DESTINO</label>
              <Input
                value={formData.destinoNombre}
                onChange={e => setFormData({ ...formData, destinoNombre: e.target.value })}
                placeholder="Nombre destino"
                className="text-xs font-mono"
                data-testid="input-destino"
              />
            </div>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">DISTANCIA KM</label>
              <Input
                value={formData.distanciaKm}
                onChange={e => setFormData({ ...formData, distanciaKm: e.target.value })}
                placeholder="0"
                type="number"
                className="text-xs font-mono"
                data-testid="input-distancia"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">LITROS PROM.</label>
              <Input
                value={formData.litrosPromedio}
                onChange={e => setFormData({ ...formData, litrosPromedio: e.target.value })}
                placeholder="0"
                type="number"
                className="text-xs font-mono"
                data-testid="input-litros-prom"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">TIEMPO HRS</label>
              <Input
                value={formData.tiempoHoras}
                onChange={e => setFormData({ ...formData, tiempoHoras: e.target.value })}
                placeholder="0"
                type="number"
                className="text-xs font-mono"
                data-testid="input-tiempo"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">TARIFA CLP</label>
              <Input
                value={formData.tarifaClp}
                onChange={e => setFormData({ ...formData, tarifaClp: e.target.value })}
                placeholder="0"
                type="number"
                className="text-xs font-mono"
                data-testid="input-tarifa-clp"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">TARIFA USD</label>
              <Input
                value={formData.tarifaUsd}
                onChange={e => setFormData({ ...formData, tarifaUsd: e.target.value })}
                placeholder="0"
                type="number"
                className="text-xs font-mono"
                data-testid="input-tarifa-usd"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">NOTAS</label>
            <Input
              value={formData.notas}
              onChange={e => setFormData({ ...formData, notas: e.target.value })}
              placeholder="Notas adicionales..."
              className="text-xs font-mono"
              data-testid="input-notas"
            />
          </div>
          {puntosConfirmados.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">PUNTO ORIGEN (OPCIONAL)</label>
                <select
                  value={formData.puntoOrigenId}
                  onChange={e => setFormData({ ...formData, puntoOrigenId: e.target.value })}
                  className="w-full h-9 px-3 text-xs font-mono bg-background border border-border text-foreground"
                  data-testid="select-punto-origen"
                >
                  <option value="">Sin punto asociado</option>
                  {puntosConfirmados.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.nombreInferido || `Punto #${p.id}`} ({p.tipo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] block mb-1">PUNTO DESTINO (OPCIONAL)</label>
                <select
                  value={formData.puntoDestinoId}
                  onChange={e => setFormData({ ...formData, puntoDestinoId: e.target.value })}
                  className="w-full h-9 px-3 text-xs font-mono bg-background border border-border text-foreground"
                  data-testid="select-punto-destino"
                >
                  <option value="">Sin punto asociado</option>
                  {puntosConfirmados.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.nombreInferido || `Punto #${p.id}`} ({p.tipo})</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetForm} data-testid="btn-cancelar-tarifa">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="btn-guardar-tarifa"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Guardando..." : editingTarifa ? "Actualizar" : "Crear Tarifa"}
            </Button>
          </div>
        </div>
      )}

      {activeTarifas.length === 0 && !showForm && (
        <div className="py-12 text-center text-muted-foreground font-mono text-xs" data-testid="text-no-tarifas">
          No hay tarifas registradas. Crea la primera tarifa para comenzar.
        </div>
      )}

      {activeTarifas.length > 0 && (
        <div className="bg-card border border-border" data-testid="tarifas-table">
          <div className="grid grid-cols-[1fr_120px_120px_100px_100px_100px_80px] px-4 py-2 border-b border-border bg-muted/30 text-xs font-mono text-muted-foreground tracking-[0.2em]">
            <div>RUTA</div><div>ORIGEN</div><div>DESTINO</div><div>DISTANCIA</div><div>LITROS</div><div>TARIFA CLP</div><div>ACCIONES</div>
          </div>
          {activeTarifas.map((t, i) => (
            <div
              key={t.id}
              className={`grid grid-cols-[1fr_120px_120px_100px_100px_100px_80px] px-4 py-3 items-center ${
                i < activeTarifas.length - 1 ? "border-b border-border/20" : ""
              }`}
              data-testid={`tarifa-row-${t.id}`}
            >
              <div>
                <div className="text-xs font-mono font-bold text-foreground">{t.nombreRuta}</div>
                {t.notas && <div className="text-[11px] text-muted-foreground mt-0.5">{t.notas}</div>}
              </div>
              <div className="text-xs font-mono text-muted-foreground">{t.origenNombre || "--"}</div>
              <div className="text-xs font-mono text-muted-foreground">{t.destinoNombre || "--"}</div>
              <div className="text-xs font-mono text-foreground">{t.distanciaKm ? `${t.distanciaKm} km` : "--"}</div>
              <div className="text-xs font-mono text-foreground">{t.litrosPromedio ? `${t.litrosPromedio} L` : "--"}</div>
              <div className="text-xs font-mono text-foreground">{t.tarifaClp ? `$${parseInt(String(t.tarifaClp)).toLocaleString("es-CL")}` : "--"}</div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <Button size="icon" variant="ghost" onClick={() => startEdit(t)} data-testid={`btn-edit-tarifa-${t.id}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(t.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`btn-delete-tarifa-${t.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Tarifas() {
  const [subTab, setSubTab] = useState<SubTab>("puntos");

  return (
    <div className="space-y-5" data-testid="tarifas-page">
      <div className="flex gap-1" data-testid="tarifas-subtabs">
        {([
          { id: "puntos" as SubTab, label: "Puntos Confirmados", icon: MapPin },
          { id: "tarifas" as SubTab, label: "Tarifas por Ruta", icon: Route },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            data-testid={`subtab-${t.id}`}
            className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono font-bold tracking-[0.1em] uppercase cursor-pointer border-b-2 transition-all ${
              subTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "puntos" ? <PuntosConfirmados /> : <TarifasPorRuta />}
    </div>
  );
}
