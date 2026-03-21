import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Faena } from "@shared/schema";

interface FaenaModalProps {
  faena?: Faena | null;
  open: boolean;
  onClose: () => void;
}

export function FaenaModal({ faena, open, onClose }: FaenaModalProps) {
  const { toast } = useToast();
  const isEdit = !!faena;
  const [nombre, setNombre] = useState(faena?.nombre || "");
  const [color, setColor] = useState(faena?.color || "#1A8FFF");

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/faenas/${faena!.id}`, { nombre, color });
      } else {
        await apiRequest("POST", "/api/faenas", { nombre, color });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faenas"] });
      toast({ title: isEdit ? "Faena actualizada" : "Faena creada" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono font-bold tracking-[0.15em] uppercase">
            {isEdit ? "Editar Faena" : "Nueva Faena"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase">
              Nombre de la faena / cliente
            </Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Anglo American — Los Bronces" className="font-mono bg-background"
              data-testid="input-faena-nombre" />
          </div>

          <div>
            <Label className="text-[9px] font-mono text-muted-foreground tracking-[0.15em] uppercase mb-1.5 block">
              Color identificador
            </Label>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-11 h-9 border border-border bg-transparent cursor-pointer p-0.5"
                data-testid="input-faena-color" />
              <div className="flex-1 h-9 opacity-30" style={{ backgroundColor: color }} />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-faena">Cancelar</Button>
            <Button onClick={() => nombre.trim() && mutation.mutate()} disabled={!nombre.trim() || mutation.isPending}
              data-testid="button-save-faena">
              {mutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
