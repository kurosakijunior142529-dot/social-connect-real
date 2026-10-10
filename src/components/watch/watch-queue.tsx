import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractYouTubeId } from "@/lib/watch/provider";
import { Check, ListVideo, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type QueueItem = { id: string; video_id: string; title: string | null; added_by: string; status: string; created_at: string };

/** Fila colaborativa: todos sugerem vídeos do YouTube, o anfitrião aprova e toca. */
export function WatchQueue({
  roomId,
  userId,
  isHost,
  names,
  onPlay,
}: {
  roomId: string;
  userId: string;
  isHost: boolean;
  names: Record<string, string>;
  onPlay: (videoId: string) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["watch-queue", roomId];

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("watch_room_queue")
        .select("*")
        .eq("room_id", roomId)
        .neq("status", "played")
        .order("created_at", { ascending: true });
      return (data ?? []) as QueueItem[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`watch-queue-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "watch_room_queue", filter: `room_id=eq.${roomId}` }, () =>
        qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const id = extractYouTubeId(link.trim());
    if (!id) return toast.error("Cole um link válido do YouTube.");
    setBusy(true);
    let title: string | null = null;
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://youtu.be/${id}`)}`);
      if (r.ok) title = String((await r.json()).title ?? "").slice(0, 120) || null;
    } catch {}
    const { error } = await (supabase as any)
      .from("watch_room_queue")
      .insert({ room_id: roomId, video_id: id, title, status: "pending" });
    setBusy(false);
    if (error) return toast.error("Não foi possível adicionar.");
    setLink("");
    qc.invalidateQueries({ queryKey: key });
    toast.success(isHost ? "Adicionado à fila" : "Sugestão enviada ao anfitrião");
  }

  async function approve(item: QueueItem) {
    await (supabase as any).from("watch_room_queue").update({ status: "approved" }).eq("id", item.id);
    qc.invalidateQueries({ queryKey: key });
  }
  async function play(item: QueueItem) {
    await (supabase as any).from("watch_room_queue").update({ status: "played" }).eq("id", item.id);
    await onPlay(item.video_id);
    qc.invalidateQueries({ queryKey: key });
  }
  async function remove(item: QueueItem) {
    await (supabase as any).from("watch_room_queue").delete().eq("id", item.id);
    qc.invalidateQueries({ queryKey: key });
  }

  const items = q.data ?? [];
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Cole um link do YouTube"
          className="h-10 min-w-0 flex-1 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-2)] px-4 text-sm outline-none focus:border-primary/50"
        />
        <button disabled={busy || !link.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Adicionar">
          <Plus className="h-4 w-4" />
        </button>
      </form>
      {!items.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <ListVideo className="mx-auto mb-2 h-7 w-7 opacity-60" />
          Fila vazia. Sugira o próximo vídeo!
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-2xl bg-[color:var(--surface-2)] p-2">
            <img src={`https://i.ytimg.com/vi/${it.video_id}/mqdefault.jpg`} alt="" className="h-12 w-20 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{it.title ?? "Vídeo do YouTube"}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("rounded-full px-1.5 py-0.5 font-semibold", it.status === "approved" ? "bg-primary/15 text-primary" : "bg-[color:var(--surface)]")}>
                  {it.status === "approved" ? "Aprovado" : "Sugestão"}
                </span>
                <span className="truncate">por {it.added_by === userId ? "você" : names[it.added_by] ?? "alguém"}</span>
              </div>
            </div>
            {isHost ? (
              <>
                {it.status === "pending" ? (
                  <button onClick={() => void approve(it)} className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--surface)]" aria-label="Aprovar">
                    <Check className="h-4 w-4" />
                  </button>
                ) : null}
                <button onClick={() => void play(it)} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Tocar agora">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              </>
            ) : null}
            {isHost || it.added_by === userId ? (
              <button onClick={() => void remove(it)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground" aria-label="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
