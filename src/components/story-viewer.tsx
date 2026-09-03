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
const DURATION = 80000;

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
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(next, DURATION);
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
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
      <div className="relative w-full max-w-md h-full md:h-[90vh] md:rounded-3xl overflow-hidden bg-black">
        {/* Progress bars */}
        <div className="absolute top-3 inset-x-3 z-10 flex gap-1">
          {group.stories.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full bg-white origin-left"
                style={{
                  transform: i < sIdx ? "scaleX(1)" : i > sIdx ? "scaleX(0)" : undefined,
                  animation: i === sIdx ? `story-progress ${DURATION}ms linear forwards` : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 inset-x-3 z-10 pt-3 flex items-center gap-3">
          <UserAvatar avatarPath={group.profile?.avatar_url} displayName={group.profile?.display_name ?? "?"} className="h-9 w-9" />
          <div className="flex-1 min-w-0 text-white">
            <div className="text-sm font-semibold truncate">{group.profile?.display_name}</div>
            <div className="text-xs opacity-80">
              {formatDistanceToNowStrict(new Date(story.created_at), { locale: ptBR, addSuffix: true })}
            </div>
          </div>
          {isOwn ? (
            <button onClick={deleteStory} className="grid place-items-center h-9 w-9 rounded-full bg-white/10 text-white" aria-label="Apagar">
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
          <button onClick={onClose} className="grid place-items-center h-9 w-9 rounded-full bg-white/10 text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Media */}
        <div className="absolute inset-0 grid place-items-center">
          {url ? (
            story.media_type === "video" ? (
              <video src={url} className="max-h-full max-w-full" autoPlay muted playsInline />
            ) : (
              <img src={url} alt="" className="max-h-full max-w-full object-contain" />
            )
          ) : (
            <div className="text-white/60 text-sm">Carregando…</div>
          )}
        </div>

        {/* Caption */}
        {story.caption ? (
          <div className="absolute bottom-24 inset-x-4 z-10 rounded-2xl bg-black/40 backdrop-blur px-4 py-3 text-white text-sm">
            {story.caption}
          </div>
        ) : null}

        {/* Reactions bar (only for others' stories) */}
        {!isOwn ? (
          <div className="absolute bottom-6 inset-x-4 z-20 flex justify-center gap-2">
            {["❤️","🔥","😂","😮","😢","👏"].map((e) => (
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
                className="h-11 w-11 rounded-full bg-white/15 backdrop-blur text-xl grid place-items-center hover:scale-110 active:scale-95 transition"
                aria-label={`Reagir ${e}`}
              >{e}</button>
            ))}
          </div>
        ) : null}

        {/* Touch zones */}
        <button aria-label="Anterior" onClick={prev} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Próximo" onClick={next} className="absolute inset-y-0 right-0 w-1/3" />
      </div>
    </div>
  );
}
