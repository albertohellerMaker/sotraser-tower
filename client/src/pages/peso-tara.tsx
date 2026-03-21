import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, AlertTriangle, Weight, Plus, X, Truck, CheckCircle } from "lucide-react";

interface PesoTaraRecord {
  id: number;
  patente: string;
  modelo: string;
  faena: string | null;
  tipoVehiculo: string | null;
  taraKg: number;
  pesoMaximoKg: number | null;
  capacidadCargaKg: number | null;
  cargaEstimada: number | null;
  pesoTotal: number | null;
  pesoVolvoKg: number | null;
  cumple: "CUMPLE" | "AL_LIMITE" | "EXCEDE" | "SIN_DATOS";
  ultimaCarga: { fecha: string; litros: number; lugar: string } | null;
  anioFabricacion: number | null;
  configuracionEjes: string | null;
}

interface PesoTaraData {
  registros: PesoTaraRecord[];
  totals: {
    conTara: number;
    cumplen: number;
    exceden: number;
    alLimite: number;
    sinDatos: number;
    totalCamiones: number;
  };
}

function CumpleBadge({ cumple }: { cumple: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    CUMPLE: { color: "#00ff88", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.3)", label: "CUMPLE" },
    AL_LIMITE: { color: "#ffcc00", bg: "rgba(255,204,0,0.08)", border: "rgba(255,204,0,0.3)", label: "AL LIMITE" },
    EXCEDE: { color: "#ff2244", bg: "rgba(255,34,68,0.1)", border: "rgba(255,34,68,0.3)", label: "EXCEDE" },
    SIN_DATOS: { color: "#3a6080", bg: "rgba(58,96,128,0.08)", border: "rgba(58,96,128,0.3)", label: "SIN DATOS" },
  };
  const c = cfg[cumple] || cfg.SIN_DATOS;
  return (
    <span className="font-space text-[8px] font-bold px-2 py-0.5 uppercase tracking-[0.1em]"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

function TaraModal({ onClose, camiones }: { onClose: () => void; camiones: { id: number; patente: string }[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [taraKg, setTaraKg] = useState("");
  const [pesoMaximoKg, setPesoMaximoKg] = useState("");
  const [tipoVehiculo, setTipoVehiculo] = useState("");
  const [anioFabricacion, setAnioFabricacion] = useState("");
  const [configuracionEjes, setConfiguracionEjes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !taraKg) throw new Error("Seleccione camion y ingrese tara");
      return apiRequest("PATCH", `/api/camiones/${selectedId}/tara`, {
        taraKg: parseFloat(taraKg),
        pesoMaximoKg: pesoMaximoKg ? parseFloat(pesoMaximoKg) : null,
        tipoVehiculo: tipoVehiculo || null,
        anioFabricacion: anioFabricacion ? parseInt(anioFabricacion) : null,
        configuracionEjes: configuracionEjes || null,
        capacidadCargaKg: pesoMaximoKg && taraKg ? parseFloat(pesoMaximoKg) - parseFloat(taraKg) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datos/peso-tara"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(2,5,8,0.85)" }}
      onClick={onClose}>
      <div className="dash-card w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
          <h3 className="font-space text-[14px] font-bold tracking-[0.1em]" style={{ color: "#c8e8ff" }}>
            Registrar Tara de Camion
          </h3>
          <button onClick={onClose} className="p-1 hover:opacity-70" data-testid="btn-close-tara-modal">
            <X className="w-4 h-4" style={{ color: "#3a6080" }} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="font-exo text-[9px] tracking-[0.15em] uppercase block mb-1" style={{ color: "#3a6080" }}>CAMION</label>
            <select
              className="w-full px-3 py-2 font-space text-[12px]"
              style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff" }}
              value={selectedId || ""}
              onChange={e => setSelectedId(parseInt(e.target.value))}
              data-testid="select-camion-tara"
            >
              <option value="">Seleccionar patente...</option>
              {camiones.map(c => (
                <option key={c.id} value={c.id}>{c.patente}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-exo text-[9px] tracking-[0.15em] uppercase block mb-1" style={{ color: "#3a6080" }}>TARA (kg)</label>
              <input type="number" placeholder="Ej: 8500"
                className="w-full px-3 py-2 font-space text-[12px]"
                style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff" }}
                value={taraKg} onChange={e => setTaraKg(e.target.value)}
                data-testid="input-tara-kg" />
            </div>
            <div>
              <label className="font-exo text-[9px] tracking-[0.15em] uppercase block mb-1" style={{ color: "#3a6080" }}>PESO MAXIMO (kg)</label>
              <input type="number" placeholder="Ej: 45000"
                className="w-full px-3 py-2 font-space text-[12px]"
                style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff" }}
                value={pesoMaximoKg} onChange={e => setPesoMaximoKg(e.target.value)}
                data-testid="input-peso-max" />
            </div>
          </div>
          <div>
            <label className="font-exo text-[9px] tracking-[0.15em] uppercase block mb-1" style={{ color: "#3a6080" }}>TIPO VEHICULO</label>
            <select
              className="w-full px-3 py-2 font-space text-[12px]"
              style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff" }}
              value={tipoVehiculo} onChange={e => setTipoVehiculo(e.target.value)}
              data-testid="select-tipo-vehiculo"
            >
              <option value="">Seleccionar...</option>
              <option value="CAMION RIGIDO">CAMION RIGIDO</option>
              <option value="ARTICULADO">ARTICULADO</option>
              <option value="TRACTO-CAMION">TRACTO-CAMION</option>
              <option value="OTRO">OTRO</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-exo text-[9px] tracking-[0.15em] uppercase block mb-1" style={{ color: "#3a6080" }}>ANO FABRICACION</label>
              <input type="number" placeholder="Ej: 2022"
                className="w-full px-3 py-2 font-space text-[12px]"
                style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff" }}
                value={anioFabricacion} onChange={e => setAnioFabricacion(e.target.value)}
                data-testid="input-anio" />
            </div>
            <div>
              <label className="font-exo text-[9px] tracking-[0.15em] uppercase block mb-1" style={{ color: "#3a6080" }}>CONFIG. EJES</label>
              <input type="text" placeholder="Ej: 6x4"
                className="w-full px-3 py-2 font-space text-[12px]"
                style={{ background: "#020508", border: "1px solid #0d2035", color: "#c8e8ff" }}
                value={configuracionEjes} onChange={e => setConfiguracionEjes(e.target.value)}
                data-testid="input-ejes" />
            </div>
          </div>
          {mutation.isError && (
            <div className="font-exo text-[10px]" style={{ color: "#ff2244" }}>
              {(mutation.error as Error).message}
            </div>
          )}
          <button
            className="w-full py-2.5 font-space text-[11px] font-bold tracking-[0.1em] uppercase transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "#00d4ff", color: "#020508" }}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selectedId || !taraKg}
            data-testid="btn-guardar-tara"
          >
            {mutation.isPending ? "GUARDANDO..." : "GUARDAR"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PesoTara() {
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, error } = useQuery<PesoTaraData>({
    queryKey: ["/api/datos/peso-tara"],
  });

  const { data: allCamiones } = useQuery<any[]>({
    queryKey: ["/api/camiones"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="peso-tara-loading">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00d4ff" }} />
        <span className="ml-3 font-exo text-[12px]" style={{ color: "#3a6080" }}>Cargando datos de peso y tara...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-card px-8 py-12 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#ff2244" }} />
        <div className="font-space text-[14px] font-bold" style={{ color: "#ff2244" }}>Error al cargar datos</div>
      </div>
    );
  }

  if (!data) return null;
  const { registros, totals } = data;

  return (
    <div className="space-y-5" data-testid="peso-tara-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-space text-[18px] font-bold tracking-[0.12em] uppercase" style={{ color: "#c8e8ff" }}>
            Peso y Tara
          </h2>
          <p className="font-exo text-[11px] mt-1" style={{ color: "#3a6080" }}>
            Solo mostrando {totals.conTara} camiones con datos de tara registrados de {totals.totalCamiones} CENCOSUD
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-exo text-[9px] px-2 py-1" style={{ color: "#3a6080", border: "1px solid #0d2035" }}>
            Para agregar camiones ir a Configuracion o usar boton +
          </span>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 font-space text-[10px] font-bold tracking-[0.1em] uppercase transition-all hover:opacity-90"
            style={{ background: "#00d4ff", color: "#020508" }}
            onClick={() => setShowModal(true)}
            data-testid="btn-registrar-tara"
          >
            <Plus className="w-3.5 h-3.5" />
            REGISTRAR TARA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="dash-card px-4 py-3" data-testid="kpi-con-tara">
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CAMIONES CON TARA</div>
          <div className="font-space text-2xl font-bold" style={{ color: "#00d4ff" }}>{totals.conTara}</div>
          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>de {totals.totalCamiones} CENCOSUD</div>
        </div>
        <div className="dash-card px-4 py-3" data-testid="kpi-cumplen">
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>CUMPLEN LIMITE</div>
          <div className="font-space text-2xl font-bold" style={{ color: "#00ff88" }}>{totals.cumplen}</div>
          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>dentro de norma</div>
        </div>
        <div className="dash-card px-4 py-3" data-testid="kpi-exceden">
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>EXCEDEN LIMITE</div>
          <div className="font-space text-2xl font-bold" style={{ color: "#ff2244" }}>{totals.exceden}</div>
          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>sobre peso maximo</div>
        </div>
        <div className="dash-card px-4 py-3" data-testid="kpi-pendientes">
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080" }}>PENDIENTE VERIFICAR</div>
          <div className="font-space text-2xl font-bold" style={{ color: "#3a6080" }}>{totals.sinDatos}</div>
          <div className="font-exo text-[8px]" style={{ color: "#3a6080" }}>sin datos Volvo</div>
        </div>
      </div>

      {registros.length === 0 ? (
        <div className="dash-card px-8 py-12 text-center">
          <Weight className="w-10 h-10 mx-auto mb-3" style={{ color: "#3a6080" }} />
          <div className="font-space text-[14px] font-bold" style={{ color: "#3a6080" }}>Sin camiones con tara registrada</div>
          <div className="font-exo text-[11px] mt-2" style={{ color: "#3a6080" }}>
            Registre datos de tara para comenzar a monitorear el peso de la flota.
          </div>
          <button
            className="mt-4 px-4 py-2 font-space text-[10px] font-bold tracking-[0.1em] uppercase transition-all hover:opacity-90"
            style={{ background: "#00d4ff", color: "#020508" }}
            onClick={() => setShowModal(true)}
            data-testid="btn-registrar-tara-empty"
          >
            + REGISTRAR TARA
          </button>
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: "1px solid #0d2035", background: "#020508" }}>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "70px" }}>PATENTE</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase" style={{ color: "#3a6080", width: "80px" }}>TIPO</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "75px" }}>TARA (kg)</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "80px" }}>PESO MAX (kg)</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "85px" }}>CARGA EST.</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "85px" }}>PESO TOTAL</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase text-right" style={{ color: "#3a6080", width: "80px" }}>VOLVO (kg)</span>
            <span className="font-exo text-[8px] tracking-[0.15em] uppercase flex-1 text-right" style={{ color: "#3a6080" }}>CUMPLE</span>
          </div>
          {registros.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 transition-all hover:bg-[rgba(0,212,255,0.03)]"
              style={{ borderBottom: "1px solid #0d2035" }}
              data-testid={`peso-row-${r.patente}`}>
              <div className="flex items-center gap-1.5" style={{ width: "70px" }}>
                <Truck className="w-3 h-3 flex-shrink-0" style={{ color: "#3a6080" }} />
                <span className="font-space text-[11px] font-bold" style={{ color: "#c8e8ff" }}>{r.patente}</span>
              </div>
              <span className="font-exo text-[9px] truncate" style={{ color: "#3a6080", width: "80px" }}>{r.tipoVehiculo || "---"}</span>
              <span className="font-space text-[11px] text-right" style={{ color: "#c8e8ff", width: "75px" }}>
                {r.taraKg.toLocaleString()}
              </span>
              <span className="font-space text-[11px] text-right" style={{ color: "#c8e8ff", width: "80px" }}>
                {r.pesoMaximoKg ? r.pesoMaximoKg.toLocaleString() : "---"}
              </span>
              <span className="font-space text-[11px] text-right" style={{
                color: r.cargaEstimada != null ? "#c8e8ff" : "#3a6080", width: "85px"
              }}>
                {r.cargaEstimada != null ? `${r.cargaEstimada.toLocaleString()} kg` : "---"}
              </span>
              <span className="font-space text-[11px] font-bold text-right" style={{
                color: r.cumple === "EXCEDE" ? "#ff2244" : r.cumple === "AL_LIMITE" ? "#ffcc00" : r.cumple === "CUMPLE" ? "#00ff88" : "#3a6080",
                width: "85px"
              }}>
                {r.pesoTotal != null ? `${r.pesoTotal.toLocaleString()} kg` : "---"}
              </span>
              <span className="font-space text-[10px] text-right" style={{ color: "#3a6080", width: "80px" }}>
                {r.pesoVolvoKg != null ? `${r.pesoVolvoKg.toLocaleString()}` : "---"}
              </span>
              <div className="flex-1 text-right">
                <CumpleBadge cumple={r.cumple} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dash-card px-5 py-4">
        <h3 className="font-space text-[12px] font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#c8e8ff" }}>
          Registrar tara de camion
        </h3>
        <p className="font-exo text-[10px] mb-3" style={{ color: "#3a6080" }}>
          Agregue datos de tara a mas camiones para monitorear el cumplimiento de peso.
          La carga estimada se calcula automaticamente con datos de peso bruto de Volvo rFMS (GrossCombinationVehicleWeight).
        </p>
        <button
          className="flex items-center gap-1.5 px-4 py-2 font-space text-[10px] font-bold tracking-[0.1em] uppercase transition-all hover:opacity-90"
          style={{ background: "#00d4ff", color: "#020508" }}
          onClick={() => setShowModal(true)}
          data-testid="btn-registrar-tara-bottom"
        >
          <Plus className="w-3.5 h-3.5" />
          REGISTRAR TARA DE CAMION
        </button>
      </div>

      <div className="text-[9px] font-space tracking-[0.15em]" style={{ color: "#3a6080" }}>
        Peso bruto via Volvo rFMS GrossCombinationVehicleWeight &middot; CUMPLE: &lt;95% del maximo &middot; AL LIMITE: 95-100% &middot; EXCEDE: &gt;100%
      </div>

      {showModal && allCamiones && (
        <TaraModal
          onClose={() => setShowModal(false)}
          camiones={allCamiones.map((c: any) => ({ id: c.id, patente: c.patente }))}
        />
      )}
    </div>
  );
}
