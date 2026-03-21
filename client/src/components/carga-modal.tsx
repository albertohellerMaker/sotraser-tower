import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CargaModalProps {
  camionId: number;
  open: boolean;
  onClose: () => void;
}

export function CargaModal({ camionId, open, onClose }: CargaModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    litrosSurtidor: "",
    litrosEcu: "",
    kmAnterior: "",
    kmActual: "",
    proveedor: "COPEC",
  });

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/cargas", {
        camionId,
        fecha: form.fecha,
        litrosSurtidor: parseFloat(form.litrosSurtidor),
        litrosEcu: parseFloat(form.litrosEcu),
        kmAnterior: parseInt(form.kmAnterior),
        kmActual: parseInt(form.kmActual),
        proveedor: form.proveedor,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cargas"] });
      toast({ title: "Carga registrada correctamente" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const canSubmit = form.litrosSurtidor && form.litrosEcu && form.kmAnterior && form.kmActual;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono font-bold tracking-[0.15em] uppercase">
            Registrar Carga
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Fecha</Label>
            <Input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)}
              className="font-mono bg-background" data-testid="input-fecha" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Litros surtidor (tarjeta)</Label>
              <Input type="number" value={form.litrosSurtidor} onChange={e => set("litrosSurtidor", e.target.value)}
                placeholder="410" className="font-mono bg-background" data-testid="input-litros-surtidor" />
            </div>
            <div>
              <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Litros ECU Volvo</Label>
              <Input type="number" value={form.litrosEcu} onChange={e => set("litrosEcu", e.target.value)}
                placeholder="280" className="font-mono bg-background" data-testid="input-litros-ecu" />
            </div>
            <div>
              <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Km anterior</Label>
              <Input type="number" value={form.kmAnterior} onChange={e => set("kmAnterior", e.target.value)}
                placeholder="301760" className="font-mono bg-background" data-testid="input-km-anterior" />
            </div>
            <div>
              <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Km actual (odometro)</Label>
              <Input type="number" value={form.kmActual} onChange={e => set("kmActual", e.target.value)}
                placeholder="302100" className="font-mono bg-background" data-testid="input-km-actual" />
            </div>
          </div>

          <div>
            <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Proveedor</Label>
            <Select value={form.proveedor} onValueChange={v => set("proveedor", v)}>
              <SelectTrigger className="font-mono bg-background" data-testid="select-proveedor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COPEC">COPEC</SelectItem>
                <SelectItem value="SHELL">SHELL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-carga">Cancelar</Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
              data-testid="button-save-carga">
              {mutation.isPending ? "Guardando..." : "Guardar carga"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
