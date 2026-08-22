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
import { ShieldAlert } from "lucide-react";

export type ReportTargetType =
  | "user"
  | "post"
  | "message"
  | "comment"
  | "story"
  | "live"
  | "chat"
  | "listing";

const CATEGORIES: Array<{ value: string; label: string; critical?: boolean }> = [
  { value: "child_exploitation", label: "Exploração ou abuso infantil", critical: true },
  { value: "ncii", label: "Conteúdo íntimo sem consentimento", critical: true },
  { value: "threat", label: "Ameaça", critical: true },
  { value: "illegal", label: "Conteúdo ilegal", critical: true },
  { value: "sexual_public", label: "Pornografia / conteúdo sexual público" },
  { value: "harassment", label: "Assédio ou bullying" },
  { value: "violence", label: "Violência" },
  { value: "hate", label: "Discurso de ódio" },
  { value: "scam", label: "Golpe ou fraude" },
  { value: "spam", label: "Spam" },
  { value: "fake_account", label: "Conta falsa" },
  { value: "other", label: "Outro" },
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
  const [category, setCategory] = useState<string>("");
  const [details, setDetails] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const critical = CATEGORIES.find((c) => c.value === category)?.critical;

  async function submit() {
    if (!user) return toast.error("Faça login");
    if (!category) return toast.error("Selecione um motivo");
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_report", {
      _target_type: targetType,
      _target_id: targetId,
      _category: category,
      _details: details.trim() ? details.trim().slice(0, 1000) : undefined,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(
      critical
        ? "Denúncia enviada com prioridade máxima. Nossa equipe será notificada imediatamente."
        : "Denúncia enviada. Obrigado!",
    );
    setCategory("");
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
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent className="z-[120]">
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {critical ? (
            <div className="flex gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                Denúncias desta categoria têm prioridade máxima e são registradas para
                análise imediata. Em caso de risco imediato a uma criança ou adolescente,
                acione também as autoridades (Disque 100).
              </span>
            </div>
          ) : null}

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
            disabled={submitting || !category}
            className="rounded-full bg-gradient-brand hover:opacity-90"
          >
            {submitting ? "Enviando…" : "Enviar denúncia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
