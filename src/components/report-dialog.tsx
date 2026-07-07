import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export type ReportTargetType = "user" | "post" | "message";

const REASONS = [
  "Spam",
  "Assédio ou bullying",
  "Discurso de ódio",
  "Nudez ou conteúdo sexual",
  "Violência",
  "Informação falsa",
  "Golpe ou fraude",
  "Outro",
];

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!user) return toast.error("Faça login");
    if (!reason) return toast.error("Selecione um motivo");
    setSubmitting(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() ? details.trim().slice(0, 1000) : null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Denúncia enviada. Obrigado!");
    setReason("");
    setDetails("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Denunciar {targetLabel ?? "conteúdo"}</DialogTitle>
          <DialogDescription>
            Sua denúncia é anônima. Nossa equipe irá revisar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Conte mais sobre o problema…"
              maxLength={1000}
              rows={4}
              className="rounded-2xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !reason}
            className="rounded-full bg-gradient-brand hover:opacity-90"
          >
            {submitting ? "Enviando…" : "Enviar denúncia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
