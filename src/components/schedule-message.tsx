import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ScheduleButton({
  userId, target,
}: {
  userId: string;
  target: { type: "chat"; chatId: string } | { type: "dm"; conversationId: string };
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60_000);
    return d.toISOString().slice(0, 16);
  });
  const [ephemeral, setEphemeral] = useState<number | "">("");

  async function submit() {
    if (!text.trim()) return;
    const payload: any = {
      user_id: userId,
      target_type: target.type,
      content: text.trim(),
      send_at: new Date(when).toISOString(),
      ephemeral_seconds: ephemeral === "" ? null : Number(ephemeral),
    };
    if (target.type === "chat") payload.chat_id = target.chatId;
    else payload.conversation_id = target.conversationId;
    const { error } = await (supabase as any).from("scheduled_messages").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Mensagem agendada");
    setText(""); setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="p-2 rounded-full hover:bg-white/5" aria-label="Agendar">
          <Clock className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="glass border-white/10 max-w-md">
        <DialogHeader><DialogTitle>Agendar mensagem</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Mensagem</Label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="O que enviar" />
          </div>
          <div>
            <Label>Enviar em</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <Label>Auto-apagar depois de (segundos, opcional)</Label>
            <Input type="number" min={10} value={ephemeral} onChange={(e) => setEphemeral(e.target.value === "" ? "" : Number(e.target.value))} placeholder="ex: 3600 = 1h" />
          </div>
          <Button className="w-full bg-gradient-brand" onClick={submit}>Agendar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
