import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type StickerData =
  | { type: "poll"; question: string; options: string[] }
  | { type: "question"; prompt: string };

export function parseSticker(raw: unknown): StickerData | null {
  const s = raw as any;
  if (!s || typeof s !== "object") return null;
  if (s.type === "poll" && typeof s.question === "string" && Array.isArray(s.options) && s.options.length >= 2)
    return { type: "poll", question: s.question, options: s.options.slice(0, 4).map(String) };
  if (s.type === "question" && typeof s.prompt === "string") return { type: "question", prompt: s.prompt };
  return null;
}

export function StorySticker({ storyId, sticker, viewerId, isOwn }: { storyId: string; sticker: StickerData; viewerId: string; isOwn: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const mine = useQuery({
    queryKey: ["story-sticker-mine", storyId, viewerId],
    queryFn: async () => {
      const { data } = await supabase.from("story_sticker_responses").select("option_index, answer").eq("story_id", storyId).eq("user_id", viewerId).maybeSingle();
      return data;
    },
  });
  const counts = useQuery({
    queryKey: ["story-poll-counts", storyId],
    enabled: sticker.type === "poll" && (isOwn || !!mine.data),
    queryFn: async () => {
      const { data } = await supabase.rpc("story_poll_counts", { _story_id: storyId });
      return data ?? [];
    },
  });
  const answers = useQuery({
    queryKey: ["story-answers", storyId],
    enabled: isOwn && sticker.type === "question",
    queryFn: async () => {
      const { data } = await supabase.from("story_sticker_responses").select("id, answer, user_id").eq("story_id", storyId).not("answer", "is", null).order("created_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  const respond = async (payload: { option_index?: number; answer?: string }) => {
    setSending(true);
    const { error } = await supabase.from("story_sticker_responses").insert({ story_id: storyId, user_id: viewerId, ...payload });
    setSending(false);
    if (error) return toast.error("Não foi possível responder.");
    toast.success("Resposta enviada");
    void qc.invalidateQueries({ queryKey: ["story-sticker-mine", storyId, viewerId] });
    void qc.invalidateQueries({ queryKey: ["story-poll-counts", storyId] });
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (sticker.type === "poll") {
    const total = (counts.data ?? []).reduce((a, c) => a + Number(c.votes), 0);
    const showResults = isOwn || !!mine.data;
    return (
      <div onClick={stop} className="w-[82%] max-w-xs space-y-2 rounded-3xl bg-card/90 p-4 text-card-foreground shadow-xl backdrop-blur-md">
        <p className="text-center text-sm font-semibold">{sticker.question}</p>
        {sticker.options.map((o, i) => {
          const v = Number(counts.data?.find((c) => c.option_index === i)?.votes ?? 0);
          const pct = total ? Math.round((v / total) * 100) : 0;
          const chosen = mine.data?.option_index === i;
          return (
            <button key={i} disabled={showResults || sending} onClick={() => respond({ option_index: i })}
              className={cn("relative w-full overflow-hidden rounded-2xl bg-muted px-3 py-2.5 text-left text-sm font-medium", chosen && "ring-2 ring-primary")}>
              {showResults ? <span className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${pct}%` }} /> : null}
              <span className="relative flex justify-between gap-2"><span className="truncate">{o}</span>{showResults ? <span>{pct}%</span> : null}</span>
            </button>
          );
        })}
        {isOwn ? <p className="text-center text-xs text-muted-foreground">{total} voto(s)</p> : null}
      </div>
    );
  }

  return (
    <div onClick={stop} className="w-[82%] max-w-xs space-y-2 rounded-3xl bg-card/90 p-4 text-card-foreground shadow-xl backdrop-blur-md">
      <p className="text-center text-sm font-semibold">{sticker.prompt}</p>
      {isOwn ? (
        <div className="max-h-40 space-y-1.5 overflow-y-auto">
          {(answers.data ?? []).length === 0 ? <p className="text-center text-xs text-muted-foreground">Nenhuma resposta ainda.</p> :
            answers.data!.map((a) => <p key={a.id} className="rounded-xl bg-muted px-3 py-2 text-sm">{a.answer}</p>)}
        </div>
      ) : mine.data ? (
        <p className="text-center text-xs text-muted-foreground">Você respondeu: “{mine.data.answer}”</p>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) void respond({ answer: t.slice(0, 200) }); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Manda sua resposta…"
            className="min-w-0 flex-1 rounded-full bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
          <button disabled={sending || !text.trim()} className="rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Enviar</button>
        </form>
      )}
    </div>
  );
}
