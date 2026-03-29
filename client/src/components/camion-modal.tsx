import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Camion, Faena } from "@shared/schema";

interface CamionModalProps {
  faenas: Faena[];
  camion?: Camion | null;
  open: boolean;
  onClose: () => void;
}

export function CamionModal({ faenas, camion, open, onClose }: CamionModalProps) {
  const { toast } = useToast();
  const isEdit = !!camion;

  const [form, setForm] = useState({
    patente: camion?.patente || "",
    modelo: camion?.modelo || "",
    faenaId: camion?.faenaId?.toString() || (faenas[0]?.id?.toString() || ""),
    metaKmL: camion?.metaKmL?.toString() || "2.1",
    vin: camion?.vin || "",
    conductor: camion?.conductor || "",
  });

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const data = {
        patente: form.patente.toUpperCase().replace(/\s/g, ""),
        modelo: form.modelo,
        faenaId: parseInt(form.faenaId),
        metaKmL: parseFloat(form.metaKmL) || 2.1,
        vin: form.vin || null,
        conductor: form.conductor || null,
        syncOk: false,
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/camiones/${camion!.id}`, data);
      } else {
        await apiRequest("POST", "/api/camiones", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/camiones"] });
      toast({ title: isEdit ? "Camion actualizado" : "Camion creado" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const canSubmit = form.patente && form.modelo && form.faenaId;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono font-bold tracking-[0.15em] uppercase">
            {isEdit ? "Editar Camion" : "Nuevo Camion"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Patente</Label>
              <Input value={form.patente} onChange={e => set("patente", e.target.value.toUpperCase())}
                placeholder="DKPW78" className="font-mono bg-background" data-testid="input-patente" />
            </div>
            <div>
              <Label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Modelo</Label>
              <Input value={form.modelo} onChange={e => set("modelo", e.target.value)}
                placeholder="Volvo FH16 750" className="font-mono bg-background" data-testid="input-modelo" />
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Faena</Label>
            <Select value={form.faenaId} onValueChange={v => set("faenaId", v)}>
              <SelectTrigger className="font-mono bg-background" data-testid="select-faena">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {faenas.map(f => (
                  <SelectItem key={f.id} value={f.id.toString()}>{f.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Meta rendimiento (km/L)</Label>
            <Input type="number" value={form.metaKmL} onChange={e => set("metaKmL", e.target.value)}
              placeholder="2.1" className="font-mono bg-background" data-testid="input-meta" />
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Se usa para detectar bajo rendimiento automaticamente
            </p>
          </div>

          <div className="flex items-center gap-3 py-1">
            <Separator className="flex-1" />
            <span className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Datos Volvo Connect</span>
            <Separator className="flex-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">VIN (del camion)</Label>
              <Input value={form.vin} onChange={e => set("vin", e.target.value)}
                placeholder="YV2RT40A5KB123403" className="font-mono bg-background" data-testid="input-vin" />
            </div>
            <div>
              <Label className="text-[11px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Conductor habitual</Label>
              <Input value={form.conductor} onChange={e => set("conductor", e.target.value)}
                placeholder="P. Contreras" className="font-mono bg-background" data-testid="input-conductor" />
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 p-3 text-[11px] text-muted-foreground font-mono">
            El odometro, horas motor, ralenti y velocidad se sincronizan automaticamente
            desde Volvo Connect usando el VIN. El VIN es el ID unico del camion en Volvo.
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-camion">Cancelar</Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
              data-testid="button-save-camion">
              {mutation.isPending ? "Guardando..." : "Guardar camion"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
