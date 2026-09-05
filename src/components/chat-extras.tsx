import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { useAiActions } from "@/hooks/use-ai-actions";
import { useSmartRepliesEnabled } from "@/lib/chat-settings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Scope = "chat" | "dm";

export function useMessageReactions(scope: Scope, messageIds: string[], userId: string) {
  const table = scope === "chat" ? "message_reactions" : "dm_message_reactions";
  return useQuery({
    queryKey: ["reactions", scope, messageIds.join(",")],
    enabled: messageIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any).from(table).select("*").in("message_id", messageIds);
      const map = new Map<string, Map<string, { count: number; mine: boolean }>>();
      for (const r of data ?? []) {
        if (!map.has(r.message_id)) map.set(r.message_id, new Map());
        const inner = map.get(r.message_id)!;
        const prev = inner.get(r.emoji) ?? { count: 0, mine: false };
        inner.set(r.emoji, { count: prev.count + 1, mine: prev.mine || r.user_id === userId });
      }
      const out: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
      for (const [mid, inner] of map) {
        out[mid] = Array.from(inner.entries()).map(([emoji, v]) => ({ emoji, ...v }));
      }
      return out;
    },
  });
}

export async function toggleReaction(scope: Scope, messageId: string, userId: string, emoji: string, mine: boolean) {
  const table = scope === "chat" ? "message_reactions" : "dm_message_reactions";
  if (mine) {
    await (supabase as any).from(table).delete().match({ message_id: messageId, user_id: userId, emoji });
  } else {
    await (supabase as any).from(table).insert({ message_id: messageId, user_id: userId, emoji });
  }
}

export function SummarizeButton({ scope, id }: { scope: Scope; id: string }) {
  const ai = useAiActions();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  async function run() {
    setOpen(true);
    setText(null);
    const s = await ai.summarize(scope, id);
    setText(s);
  }
  return (
    <>
      <button onClick={run} className="p-2 rounded-full hover:bg-white/5" aria-label="Resumir">
        <Sparkles className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Resumo da conversa</DialogTitle></DialogHeader>
          {text === null ? (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Analisando…</div>
          ) : (
            <div className="whitespace-pre-wrap text-sm">{text}</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SmartReplyBar({ scope, id, onPick }: { scope: Scope; id: string; onPick: (s: string) => void }) {
  const ai = useAiActions();
  const [enabled] = useSmartRepliesEnabled();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) { setSuggestions([]); return; }
    let cancel = false;
    ai.suggest(scope, id).then((s) => { if (!cancel) setSuggestions(s); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, id, enabled]);
  if (!enabled || !suggestions.length) return null;
  return (
    <div className="mx-3 mb-2 rounded-r-2xl border-l-2 border-primary bg-gradient-to-r from-primary/10 to-transparent p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Respostas da IA
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => onPick(s)} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--hairline)] hover:border-primary/40 whitespace-nowrap">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MuteToggle({ table, keyCol, keyVal, userId }: { table: "muted_conversations" | "muted_chats"; keyCol: "conversation_id" | "chat_id"; keyVal: string; userId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["mute", table, keyVal],
    queryFn: async () => {
      const { data } = await (supabase as any).from(table).select(keyCol).eq("user_id", userId).eq(keyCol, keyVal).maybeSingle();
      return !!data;
    },
  });
  const muted = q.data === true;
  async function toggle() {
    if (muted) {
      await (supabase as any).from(table).delete().match({ user_id: userId, [keyCol]: keyVal });
    } else {
      await (supabase as any).from(table).insert({ user_id: userId, [keyCol]: keyVal });
    }
    qc.invalidateQueries({ queryKey: ["mute", table, keyVal] });
  }
  return (
    <Button size="sm" variant="ghost" onClick={toggle} className="text-xs">
      {muted ? "🔕 Silenciado" : "🔔 Silenciar"}
    </Button>
  );
}
