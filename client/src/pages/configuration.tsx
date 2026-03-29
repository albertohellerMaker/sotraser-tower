import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusTag, getStatusVariant } from "@/components/status-tag";
import { FaenaModal } from "@/components/faena-modal";
import { CamionModal } from "@/components/camion-modal";
import { statsCamion, type CamionStats } from "@/lib/fuel-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, X, Check, Upload, RefreshCw, Wifi, WifiOff, AlertTriangle, Eye, CheckCircle, Loader2, Truck, ChevronDown, ChevronRight } from "lucide-react";
import type { Faena, Camion, Carga } from "@shared/schema";
import ExcesosVelocidad from "@/pages/excesos-velocidad";
import PesoTara from "@/pages/peso-tara";
import Errores from "@/pages/errores";

interface AsignacionPreview {
  total: number;
  porAsignar: number;
  yaAsignados: number;
  sinDatos: number;
  detalle: {
    camionId: number;
    patente: string;
    clienteSigetra: string | null;
    litrosSigetra: number;
    faenaActualId: number;
    faenaActualNombre: string;
    faenaPropuesta: string | null;
    confianza: "alta" | "media" | "sin_datos";
    accion: "ASIGNAR" | "YA_ASIGNADO" | "SIN_DATOS";
  }[];
}

interface AsignacionResult {
  procesados: number;
  asignados: number;
  sin_datos_sigetra: number;
  faenas_creadas: number;
  detalle: { patente: string; cliente_detectado: string | null; faena_asignada: string | null; accion: string }[];
}

export default function Configuration() {
  const { toast } = useToast();
  const [faenaModal, setFaenaModal] = useState(false);
  const [editFaena, setEditFaena] = useState<Faena | null>(null);
  const [camionModal, setCamionModal] = useState(false);
  const [editCamion, setEditCamion] = useState<Camion | null>(null);
  const [asignacionPreview, setAsignacionPreview] = useState<AsignacionPreview | null>(null);
  const [asignacionResult, setAsignacionResult] = useState<AsignacionResult | null>(null);

  const { data: faenas = [], isLoading: loadingF } = useQuery<Faena[]>({ queryKey: ["/api/faenas"] });
  const { data: camiones = [], isLoading: loadingC } = useQuery<Camion[]>({ queryKey: ["/api/camiones"] });
  const { data: cargas = [], isLoading: loadingCg } = useQuery<Carga[]>({ queryKey: ["/api/cargas"] });
  const { data: volvoStatus } = useQuery<{ user: string; configured: boolean; status: string; message: string }>({ queryKey: ["/api/volvo/status"] });

  const isLoading = loadingF || loadingC || loadingCg;

  const deleteFaena = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/faenas/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faenas"] });
      toast({ title: "Faena eliminada" });
    },
  });

  const deleteCamion = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/camiones/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/camiones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cargas"] });
      toast({ title: "Camion eliminado" });
    },
  });

  const syncVolvo = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/volvo/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/camiones"] });
      toast({ title: `Sincronizacion completa: ${data.synced} camiones` });
    },
    onError: (error: any) => {
      toast({ title: "Error de sincronizacion", description: error.message, variant: "destructive" });
    },
  });

  const previewAsignacion = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/camiones/preview-asignacion");
      if (!res.ok) throw new Error("Error al obtener preview");
      return res.json() as Promise<AsignacionPreview>;
    },
    onSuccess: (data) => {
      setAsignacionPreview(data);
      setAsignacionResult(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const confirmarAsignacion = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/camiones/asignar-faenas-sigetra");
      return res.json() as Promise<AsignacionResult>;
    },
    onSuccess: (data) => {
      setAsignacionResult(data);
      setAsignacionPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/camiones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/faenas"] });
      toast({ title: `Asignacion completada: ${data.asignados} camiones asignados, ${data.faenas_creadas} faenas creadas` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-5">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="config-view">
      <div className="grid grid-cols-2 gap-5">
        <div>
          <div className="flex justify-between items-center mb-3.5 pb-2.5 border-b border-border">
            <div className="text-[13px] font-mono font-bold text-foreground tracking-[0.15em] uppercase">
              Faenas / Clientes
            </div>
            <Button size="sm" onClick={() => { setEditFaena(null); setFaenaModal(true); }}
              data-testid="button-new-faena">
              <Plus className="w-3 h-3 mr-1" /> Nueva
            </Button>
          </div>
          <div className="bg-card border border-border">
            {faenas.length === 0 && (
              <div className="py-8 text-center text-muted-foreground font-mono text-xs" data-testid="text-no-faenas">
                Sin faenas. Agrega la primera.
              </div>
            )}
            {faenas.map((f, i) => (
              <div key={f.id}
                className={`flex justify-between items-center px-4 py-3 ${i < faenas.length - 1 ? "border-b border-border/20" : ""}`}
                data-testid={`faena-row-${f.id}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                  <div>
                    <div className="text-[13px] text-foreground font-semibold">{f.nombre}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      {camiones.filter(c => c.faenaId === f.id).length} camiones
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7"
                    onClick={() => { setEditFaena(f); setFaenaModal(true); }}
                    data-testid={`button-edit-faena-${f.id}`}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-red-400 border-red-400/30"
                    onClick={() => { if (confirm("Eliminar faena?")) deleteFaena.mutate(f.id); }}
                    data-testid={`button-delete-faena-${f.id}`}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3.5 pb-2.5 border-b border-border">
            <div className="text-[13px] font-mono font-bold text-foreground tracking-[0.15em] uppercase">
              Camiones
            </div>
            <Button size="sm" onClick={() => { setEditCamion(null); setCamionModal(true); }}
              data-testid="button-new-camion">
              <Plus className="w-3 h-3 mr-1" /> Nuevo
            </Button>
          </div>
          <div className="bg-card border border-border">
            {camiones.length === 0 && (
              <div className="py-8 text-center text-muted-foreground font-mono text-xs" data-testid="text-no-camiones">
                Sin camiones.
              </div>
            )}
            {camiones.map((cam, i) => {
              const faena = faenas.find(f => f.id === cam.faenaId);
              const cams = cargas.filter(c => c.camionId === cam.id);
              const s = statsCamion(cam, cams);
              return (
                <div key={cam.id}
                  className={`flex justify-between items-center px-4 py-3 ${
                    i < camiones.length - 1 ? "border-b border-border/20" : ""
                  } ${s.estado === "CRITICO" ? "bg-red-500/[0.03]" : ""}`}
                  data-testid={`camion-row-${cam.id}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: faena?.color || "#5A7A9A" }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-primary">{cam.patente}</span>
                        <StatusTag label={s.estado} variant={getStatusVariant(s.estado)} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {cam.modelo} · {faena?.nombre || "Sin faena"} · meta {cam.metaKmL} km/L
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-xs font-mono mr-2 ${cam.syncOk ? "text-emerald-400" : "text-red-400"}`}>
                      {cam.syncOk ? "Sync OK" : "Sin sync"}
                    </div>
                    <Button variant="outline" size="sm" className="h-7"
                      onClick={() => { setEditCamion(cam); setCamionModal(true); }}
                      data-testid={`button-edit-camion-${cam.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-red-400 border-red-400/30"
                      onClick={() => { if (confirm("Eliminar camion?")) deleteCamion.mutate(cam.id); }}
                      data-testid={`button-delete-camion-${cam.id}`}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-5" data-testid="section-asignacion-faenas">
        <div className="flex justify-between items-center mb-4">
          <div className="text-[13px] font-mono font-bold text-foreground tracking-[0.15em] uppercase">
            Asignacion de Faenas por Sigetra
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"
              disabled={previewAsignacion.isPending}
              onClick={() => previewAsignacion.mutate()}
              data-testid="button-preview-asignacion">
              {previewAsignacion.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
              Previsualizar
            </Button>
            <Button size="sm"
              className="bg-emerald-500 text-black font-mono disabled:opacity-50"
              disabled={confirmarAsignacion.isPending || (!asignacionPreview || asignacionPreview.porAsignar === 0)}
              onClick={() => { if (confirm("Confirmar asignacion de faenas basada en historial Sigetra?")) confirmarAsignacion.mutate(); }}
              data-testid="button-confirmar-asignacion">
              {confirmarAsignacion.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
              Confirmar y Asignar
            </Button>
          </div>
        </div>

        <div className="text-[11px] font-mono text-muted-foreground mb-3">
          Detecta el cliente principal de cada camion usando el historial de cargas en Sigetra y asigna automaticamente la faena correspondiente.
        </div>

        {asignacionResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 mb-4" data-testid="asignacion-result">
            <div className="text-[12px] font-mono font-bold text-emerald-400 mb-2">Asignacion completada</div>
            <div className="grid grid-cols-4 gap-3 text-[11px] font-mono">
              <div><span className="text-muted-foreground">Procesados:</span> <span className="text-foreground font-bold">{asignacionResult.procesados}</span></div>
              <div><span className="text-muted-foreground">Asignados:</span> <span className="text-emerald-400 font-bold">{asignacionResult.asignados}</span></div>
              <div><span className="text-muted-foreground">Faenas creadas:</span> <span className="text-primary font-bold">{asignacionResult.faenas_creadas}</span></div>
              <div><span className="text-muted-foreground">Sin datos:</span> <span className="text-muted-foreground font-bold">{asignacionResult.sin_datos_sigetra}</span></div>
            </div>
          </div>
        )}

        {asignacionPreview && (
          <div data-testid="asignacion-preview">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="bg-background border border-border p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-primary">{asignacionPreview.total}</div>
                <div className="text-[11px] font-mono text-muted-foreground tracking-wider">TOTAL</div>
              </div>
              <div className="bg-background border border-border p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-emerald-400">{asignacionPreview.porAsignar}</div>
                <div className="text-[11px] font-mono text-muted-foreground tracking-wider">POR ASIGNAR</div>
              </div>
              <div className="bg-background border border-border p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-primary">{asignacionPreview.yaAsignados}</div>
                <div className="text-[11px] font-mono text-muted-foreground tracking-wider">YA ASIGNADOS</div>
              </div>
              <div className="bg-background border border-border p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-muted-foreground">{asignacionPreview.sinDatos}</div>
                <div className="text-[11px] font-mono text-muted-foreground tracking-wider">SIN DATOS</div>
              </div>
            </div>

            <div className="border border-border max-h-[400px] overflow-y-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="bg-background sticky top-0">
                  <tr className="text-[11px] text-muted-foreground tracking-wider">
                    <th className="text-left px-3 py-2">PATENTE</th>
                    <th className="text-left px-3 py-2">CLIENTE SIGETRA</th>
                    <th className="text-right px-3 py-2">LITROS</th>
                    <th className="text-left px-3 py-2">FAENA ACTUAL</th>
                    <th className="text-left px-3 py-2">FAENA PROPUESTA</th>
                    <th className="text-center px-3 py-2">ACCION</th>
                  </tr>
                </thead>
                <tbody>
                  {asignacionPreview.detalle.map((row, i) => (
                    <tr key={row.camionId}
                      className={`border-t border-border/30 ${row.accion === "ASIGNAR" ? "bg-emerald-500/[0.03]" : ""}`}
                      data-testid={`asignacion-row-${row.patente}`}>
                      <td className="px-3 py-1.5 font-bold text-primary">{row.patente}</td>
                      <td className="px-3 py-1.5" style={{ color: row.clienteSigetra ? '#c8e8ff' : '#3a6080' }}>
                        {row.clienteSigetra || "\u2014"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {row.litrosSigetra > 0 ? row.litrosSigetra.toLocaleString() + " L" : "\u2014"}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.faenaActualNombre}</td>
                      <td className="px-3 py-1.5" style={{
                        color: row.confianza === "alta" ? "#00ff88" : row.confianza === "media" ? "#ffcc00" : "#3a6080"
                      }}>
                        {row.faenaPropuesta || "\u2014"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-bold tracking-wider ${
                          row.accion === "ASIGNAR" ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" :
                          row.accion === "YA_ASIGNADO" ? "text-primary bg-primary/10 border border-primary/30" :
                          "text-muted-foreground bg-muted/10 border border-border"
                        }`}>
                          {row.accion === "ASIGNAR" ? "ASIGNAR" : row.accion === "YA_ASIGNADO" ? "OK" : "SIN DATOS"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!asignacionPreview && !asignacionResult && (
          <div className="bg-background border border-border py-6 text-center">
            <Truck className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
            <div className="text-[11px] font-mono text-muted-foreground">
              Presiona Previsualizar para ver la asignacion propuesta antes de confirmar
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border p-5">
        <div className="flex justify-between items-center mb-4">
          <div className="text-[13px] font-mono font-bold text-foreground tracking-[0.15em] uppercase">
            Volvo rFMS API
          </div>
          {volvoStatus && (
            <div className={`flex items-center gap-2 text-[11px] font-mono ${
              volvoStatus.status === "connected" ? "text-emerald-400" :
              volvoStatus.status === "forbidden" ? "text-amber-400" :
              "text-red-400"
            }`} data-testid="text-volvo-api-status">
              {volvoStatus.status === "connected" ? <Wifi className="w-3.5 h-3.5" /> :
               volvoStatus.status === "forbidden" ? <AlertTriangle className="w-3.5 h-3.5" /> :
               <WifiOff className="w-3.5 h-3.5" />}
              {volvoStatus.status === "connected" ? "Conectado" :
               volvoStatus.status === "forbidden" ? "Pendiente activacion" :
               volvoStatus.status === "unauthorized" ? "No autorizado" :
               volvoStatus.status === "not_configured" ? "No configurado" : "Error"}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase block mb-1.5">
                Usuario API
              </label>
              <Input value={volvoStatus?.user || ""} readOnly className="font-mono bg-background" data-testid="input-volvo-user" />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase block mb-1.5">
                Contrasena
              </label>
              <Input type="password" value="********" readOnly className="font-mono bg-background" data-testid="input-volvo-password" />
            </div>

            {volvoStatus?.status === "forbidden" && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] font-mono text-amber-300 leading-relaxed" data-testid="text-volvo-forbidden-warning">
                <AlertTriangle className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Credenciales validas pero acceso API no activado. Contactar a Volvo para activar acceso rFMS en la cuenta.
              </div>
            )}
            {volvoStatus?.status === "connected" && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                API rFMS activa - api.volvotrucks.com
              </div>
            )}

            <Button
              className="w-full bg-emerald-500 text-black font-mono disabled:opacity-50"
              disabled={volvoStatus?.status !== "connected" || syncVolvo.isPending}
              onClick={() => syncVolvo.mutate()}
              data-testid="button-sync-volvo">
              {syncVolvo.isPending ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sincronizando...</>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sincronizar flota</>
              )}
            </Button>
            {volvoStatus?.status !== "connected" && (
              <p className="text-xs text-muted-foreground/60 font-mono">
                La sincronizacion se habilitara cuando Volvo active el acceso API.
              </p>
            )}
          </div>
          <div className="bg-background border border-border p-4">
            <div className="text-[11px] font-mono text-primary tracking-[0.15em] mb-3">
              DATOS QUE SE SINCRONIZAN POR CAMION (rFMS v2.1)
            </div>
            {[
              "VIN e identificacion del vehiculo",
              "Odometro (km totales ECU)",
              "Consumo acumulado (litros ECU)",
              "Horas motor encendido",
              "Nivel de combustible",
              "Posicion GPS (latitud/longitud)",
              "Velocidad (tacografo y rueda)",
              "Tipo de emision y ejes",
            ].map((d, i) => (
              <div key={i} className={`text-[11px] font-mono text-muted-foreground py-1.5 ${
                i < 7 ? "border-b border-border/20" : ""
              }`}>
                <span className="text-emerald-400 mr-1.5">
                  <Check className="w-3 h-3 inline" />
                </span>
                {d}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-5">
        <div className="text-[13px] font-mono font-bold text-foreground tracking-[0.15em] uppercase mb-3.5">
          Importar Tarjetas Shell / Copec (Excel Sigetra)
        </div>
        <div className="bg-background border-2 border-dashed border-border py-8 text-center cursor-pointer transition-colors hover:border-muted-foreground/30"
          data-testid="upload-zone">
          <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
          <div className="text-[13px] font-mono text-muted-foreground">
            Arrastra el Excel aqui o haz clic para subir
          </div>
          <div className="text-xs font-mono text-muted-foreground/60 mt-1.5">
            Columnas: Patente · Fecha · Litros · Km · Proveedor
          </div>
        </div>
      </div>

      <ConfigAccordion title="EXCESOS DE VELOCIDAD">
        <ExcesosVelocidad />
      </ConfigAccordion>

      <ConfigAccordion title="PESO Y TARA">
        <PesoTara />
      </ConfigAccordion>

      <ConfigAccordion title="CALIDAD DE DATOS SIGETRA">
        <Errores />
      </ConfigAccordion>

      {faenaModal && (
        <FaenaModal faena={editFaena} open={faenaModal}
          onClose={() => { setFaenaModal(false); setEditFaena(null); }} />
      )}
      {camionModal && (
        <CamionModal faenas={faenas} camion={editCamion} open={camionModal}
          onClose={() => { setCamionModal(false); setEditCamion(null); }} />
      )}
    </div>
  );
}

function ConfigAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #0d2035" }} className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.03)]"
        style={{ background: "#091018" }}
        data-testid={`config-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <span className="font-space text-[11px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>{title}</span>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: "#3a6080" }} /> : <ChevronRight className="w-4 h-4" style={{ color: "#3a6080" }} />}
      </button>
      {open && <div className="p-4" style={{ borderTop: "1px solid #0d2035" }}>{children}</div>}
    </div>
  );
}
