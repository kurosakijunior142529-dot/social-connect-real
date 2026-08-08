import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { toast } from "sonner";
import { Send } from "lucide-react";

type MsgSnapshot = {
  content?: string | null;
  kind?: string | null;
  media_url?: string | null;
  media_bucket?: string | null;
  media_type?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_duration_ms?: number | null;
  meta?: any;
};

export function ForwardDialog({
  open,
  onOpenChange,
  userId,
  message,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  message: MsgSnapshot | null;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const convs = useQuery({
    queryKey: ["forward-targets", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("conversations")
        .select("id, user_a, user_b, last_message_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("last_message_at", { ascending: false })
        .limit(30);
      const others = (data ?? []).map((c: any) => (c.user_a === userId ? c.user_b : c.user_a));
      if (!others.length) return [] as any[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", others);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((c: any) => ({
        id: c.id,
        other: byId.get(c.user_a === userId ? c.user_b : c.user_a),
      }));
    },
  });

  const filtered = (convs.data ?? []).filter((c: any) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.other?.username?.toLowerCase().includes(q) ||
      c.other?.display_name?.toLowerCase().includes(q)
    );
  });

  async function forward(convId: string) {
    if (!message) return;
    setBusy(convId);
    const payload: any = {
      conversation_id: convId,
      sender_id: userId,
      content: message.content ?? null,
      kind: message.kind ?? "text",
      media_url: message.media_url ?? null,
      media_bucket: message.media_bucket ?? null,
      media_type: message.media_type ?? null,
      media_name: message.media_name ?? null,
      media_size: message.media_size ?? null,
      media_duration_ms: message.media_duration_ms ?? null,
      meta: message.meta ?? {},
    };
    const { error } = await (supabase as any).from("messages").insert(payload);
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Encaminhada");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle>Encaminhar</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Buscar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-full"
        />
        <div className="max-h-80 overflow-y-auto space-y-1 mt-2">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">Nenhuma conversa</div>
          ) : (
            filtered.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5"
              >
                <UserAvatar
                  avatarPath={c.other?.avatar_url}
                  displayName={c.other?.display_name}
                  className="h-10 w-10"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.other?.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    @{c.other?.username}
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={busy === c.id}
                  onClick={() => forward(c.id)}
                  className="rounded-full"
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
