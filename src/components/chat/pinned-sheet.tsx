import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pin, PinOff } from "lucide-react";
import { MessageBody } from "./message-body";

export function PinnedSheet({
  open,
  onOpenChange,
  scope,
  parentId,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: "dm" | "chat";
  parentId: string;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const table = scope === "dm" ? "messages" : "chat_messages";
  const col = scope === "dm" ? "conversation_id" : "chat_id";

  const q = useQuery({
    queryKey: ["pinned", scope, parentId],
    enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from(table)
        .select("*")
        .eq(col, parentId)
        .not("pinned_at", "is", null)
        .order("pinned_at", { ascending: false });
      return data ?? [];
    },
  });

  async function unpin(id: string) {
    await (supabase as any).from(table).update({ pinned_at: null, pinned_by: null }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["pinned", scope, parentId] });
    qc.invalidateQueries({ queryKey: [scope === "dm" ? "messages" : "chat-messages", parentId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-4 w-4" /> Mensagens fixadas
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {(q.data ?? []).length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nada fixado por aqui.
            </div>
          ) : (
            (q.data ?? []).map((m: any) => (
              <div
                key={m.id}
                className="p-3 rounded-xl bg-[color:var(--surface-2)] flex items-start gap-2"
              >
                <div className="flex-1 min-w-0 text-[13px] break-words">
                  <MessageBody msg={m} mine={m.sender_id === currentUserId} />
                </div>
                <button
                  onClick={() => unpin(m.id)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground"
                  aria-label="Desafixar"
                >
                  <PinOff className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
