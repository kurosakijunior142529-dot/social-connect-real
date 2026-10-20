import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type Note = { user_id: string; content: string; profile?: { username: string; display_name: string | null; avatar_url: string | null } };

/** Notas de 24h no topo das conversas: você e quem você segue. */
export function NotesRail({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const notes = useQuery({
    queryKey: ["user-notes", currentUserId],
    staleTime: 30_000,
    queryFn: async (): Promise<{ mine: Note | null; others: Note[]; me: Note["profile"] }> => {
      const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", currentUserId);
      const ids = [currentUserId, ...(follows ?? []).map((f) => f.following_id)];
      const [{ data: rows }, { data: profs }] = await Promise.all([
        supabase.from("user_notes").select("user_id, content").in("user_id", ids).gt("expires_at", new Date().toISOString()),
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids.slice(0, 300)),
      ]);
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      const all = (rows ?? []).map((r) => ({ ...r, profile: pmap.get(r.user_id) }));
      return {
        mine: all.find((n) => n.user_id === currentUserId) ?? null,
        others: all.filter((n) => n.user_id !== currentUserId),
        me: pmap.get(currentUserId),
      };
    },
  });

  const save = async () => {
    const content = text.trim();
    setSaving(true);
    const { error } = content
      ? await supabase.from("user_notes").upsert({
          user_id: currentUserId,
          content,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
      : await supabase.from("user_notes").delete().eq("user_id", currentUserId);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a nota");
    navigator.vibrate?.(10);
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["user-notes", currentUserId] });
  };

  const mine = notes.data?.mine;
  const me = notes.data?.me;

  return (
    <>
      <section className="px-3 pb-2" data-swipe-lock>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pt-7">
          <button
            type="button"
            onClick={() => { setText(mine?.content ?? ""); setOpen(true); }}
            className="relative flex w-[64px] shrink-0 flex-col items-center gap-1 transition active:scale-95"
          >
            <NoteBubble text={mine?.content ?? "Deixe uma nota"} muted={!mine} />
            <span className="relative">
              <UserAvatar avatarPath={me?.avatar_url ?? null} displayName={me?.display_name ?? me?.username ?? "Você"} className="h-14 w-14" />
              {!mine && (
                <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                  <Plus className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">Sua nota</span>
          </button>
          {notes.data?.others.map((n) => (
            <div key={n.user_id} className="relative flex w-[64px] shrink-0 flex-col items-center gap-1">
              <NoteBubble text={n.content} />
              <UserAvatar avatarPath={n.profile?.avatar_url ?? null} displayName={n.profile?.display_name ?? n.profile?.username ?? ""} className="h-14 w-14" />
              <span className="w-full truncate text-center text-[10px] text-foreground/80">
                {n.profile?.display_name ?? n.profile?.username}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-center text-base">Sua nota</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-center text-xs text-muted-foreground">Quem te segue vê por 24 horas.</p>
          <input
            autoFocus
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            placeholder="No que você está pensando?"
            className="h-11 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-2)] px-4 text-sm outline-none"
          />
          <div className="text-right text-[10px] text-muted-foreground tabular">{text.length}/60</div>
          <div className="grid gap-2">
            <button
              disabled={saving}
              onClick={save}
              className="rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {text.trim() ? "Compartilhar" : mine ? "Apagar nota" : "Fechar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NoteBubble({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      className={`absolute -top-6 left-1/2 z-10 max-w-[84px] -translate-x-1/2 truncate rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 py-1 text-[10px] shadow-sm ${muted ? "text-muted-foreground" : "font-medium text-foreground"}`}
    >
      {text}
    </span>
  );
}
