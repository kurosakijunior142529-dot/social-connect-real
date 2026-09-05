import { useEffect, useMemo, useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type StoryRow = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
};

type Grouped = {
  userId: string;
  profile: { id: string; username: string; display_name: string; avatar_url: string | null } | undefined;
  stories: StoryRow[];
};

/** Duração mínima de cada story: 1min20. */
const IMAGE_DURATION = 5000;

export function StoryViewer({
  groups,
  startIndex,
  viewerId,
  onClose,
}: {
  groups: Grouped[];
  startIndex: number;
  viewerId: string;
  onClose: () => void;
}) {
  const [gIdx, setGIdx] = useState(startIndex);
  const [sIdx, setSIdx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [mediaMs, setMediaMs] = useState(IMAGE_DURATION);
  const queryClient = useQueryClient();

  const group = groups[gIdx];
  const story = group?.stories[sIdx];
  const isOwn = story?.user_id === viewerId;

  const { data: url } = useSignedUrl("stories", story?.media_url);

  const next = useMemo(
    () => () => {
      if (!group) return;
      if (sIdx + 1 < group.stories.length) setSIdx(sIdx + 1);
      else if (gIdx + 1 < groups.length) {
        setGIdx(gIdx + 1);
        setSIdx(0);
      } else onClose();
    },
    [group, sIdx, gIdx, groups.length, onClose],
  );

  const prev = () => {
    if (sIdx > 0) setSIdx(sIdx - 1);
    else if (gIdx > 0) {
      setGIdx(gIdx - 1);
      setSIdx(groups[gIdx - 1].stories.length - 1);
    }
  };

  useEffect(() => {
    if (!story) return;
    // record view
    (supabase as any).from("story_views").insert({ story_id: story.id, viewer_id: viewerId }).then(() => {});
    setMediaMs(IMAGE_DURATION);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    // fotos avançam em 5s; vídeos avançam pelo tempo real (onLoadedMetadata/onEnded)
    if (story.media_type !== "video") {
      timerRef.current = window.setTimeout(next, IMAGE_DURATION);
    }
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [story, viewerId, next]);

  async function deleteStory() {
    if (!story) return;
    const { error } = await (supabase as any).from("stories").delete().eq("id", story.id);
    if (error) return toast.error(error.message);
     toast.success("Vibe apagada");
    queryClient.invalidateQueries({ queryKey: ["stories-rail"] });
    onClose();
  }

  if (!story || !group) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--surface-0,#050A07)]/95 backdrop-blur-xl">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]" />

      <div className="relative h-full w-full max-w-md overflow-hidden bg-black md:h-[92vh] md:rounded-[28px] md:ring-1 md:ring-[color:color-mix(in_oklab,var(--primary)_25%,transparent)] md:shadow-[0_30px_90px_-30px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
        {/* Progress bars */}
        <div className="absolute top-3 inset-x-3 z-20 flex gap-1.5">
          {group.stories.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full origin-left rounded-full bg-gradient-brand shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
                style={{
                  transform: i < sIdx ? "scaleX(1)" : i > sIdx ? "scaleX(0)" : undefined,
                  animation: i === sIdx ? `story-progress ${mediaMs}ms linear forwards` : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Top gradient scrim */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-black/75 to-transparent" />

        {/* Header */}
        <div className="absolute top-6 inset-x-3 z-20 flex items-center gap-3 pt-3">
          <span className="rounded-full bg-gradient-brand p-[2px] shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_55%,transparent)]">
            <UserAvatar
              avatarPath={group.profile?.avatar_url}
              displayName={group.profile?.display_name ?? "?"}
              className="h-9 w-9 ring-2 ring-black"
            />
          </span>
          <div className="min-w-0 flex-1 text-white">
            <div className="truncate text-sm font-semibold tracking-tight">{group.profile?.display_name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
              {formatDistanceToNowStrict(new Date(story.created_at), { locale: ptBR, addSuffix: true })}
            </div>
          </div>
          {isOwn ? (
            <button
              onClick={deleteStory}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
              aria-label="Apagar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Media */}
        <div className="absolute inset-0 grid place-items-center">
          {url ? (
            story.media_type === "video" ? (
              <video
                key={story.id}
                src={url}
                className="max-h-full max-w-full animate-in fade-in duration-300"
                autoPlay
                muted
                playsInline
                onEnded={next}
                onLoadedMetadata={(e) => {
                  const ms = Math.round(e.currentTarget.duration * 1000);
                  if (ms > 0 && Number.isFinite(ms)) {
                    setMediaMs(ms);
                    if (timerRef.current) window.clearTimeout(timerRef.current);
                    timerRef.current = window.setTimeout(next, ms + 300);
                  }
                }}
              />
            ) : (
              <img key={story.id} src={url} alt="" className="max-h-full max-w-full object-contain animate-in fade-in duration-300" />
            )
          ) : (
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
              <span className="text-sm text-white/60">Carregando…</span>
            </div>
          )}
        </div>

        {/* Bottom gradient scrim */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-48 bg-gradient-to-t from-black/85 to-transparent" />

        {/* Caption */}
        {story.caption ? (
          <div className="absolute bottom-24 inset-x-4 z-20 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm leading-relaxed text-white backdrop-blur-md">
            {story.caption}
          </div>
        ) : null}


        {/* Reactions bar (only for others' stories) */}
        {!isOwn ? (
          <div className="absolute bottom-6 inset-x-4 z-20 flex justify-center">
            <div className="flex items-center gap-1 rounded-full border border-white/12 bg-black/45 px-2 py-1.5 backdrop-blur-xl shadow-[0_10px_40px_-12px_color-mix(in_oklab,var(--primary)_50%,transparent)]">
              {["❤️", "🔥", "😂", "😮", "😢", "👏"].map((e) => (
                <button
                  key={e}
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    const { error } = await (supabase as any).from("story_reactions").insert({
                      story_id: story.id, user_id: viewerId, emoji: e,
                    });
                    if (error && !String(error.message).includes("duplicate")) toast.error(error.message);
                    else toast.success(`Reagiu com ${e}`);
                  }}
                  className="grid h-10 w-10 place-items-center rounded-full text-xl transition hover:-translate-y-1 hover:bg-white/12 active:scale-90"
                  aria-label={`Reagir ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : null}


        {/* Touch zones */}
        <button aria-label="Anterior" onClick={prev} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Próximo" onClick={next} className="absolute inset-y-0 right-0 w-1/3" />
      </div>
    </div>
  );
}
