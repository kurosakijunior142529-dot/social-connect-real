import { useNavigate } from "@tanstack/react-router";
import { Play, Popcorn } from "lucide-react";
import { useFriendReel } from "@/lib/reels-presence";
import { useFriendWatching } from "@/lib/watch/presence";

/**
 * Aparece só quando a outra pessoa está nos Reels ou numa sala do Streaming Amigo agora.
 * Tocar leva direto ao mesmo conteúdo.
 */
export function TogetherChip({
  currentUserId,
  otherUserId,
  otherName,
}: {
  currentUserId: string;
  otherUserId: string;
  otherName: string;
  conversationId?: string;
}) {
  const navigate = useNavigate();
  const postId = useFriendReel(currentUserId, otherUserId);
  const watching = useFriendWatching(currentUserId, otherUserId);
  if (!postId && !watching) return null;

  const isRoom = !!watching;
  return (
    <div className="px-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
      <button
        type="button"
        onClick={() =>
          isRoom
            ? void navigate({ to: "/watch/$roomId", params: { roomId: watching!.roomId } })
            : void navigate({ to: "/reels", search: { post: postId } as any })
        }
        className="flex w-full items-center gap-3 rounded-2xl bg-[color:var(--surface)] px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99]"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {isRoom ? `${otherName} está numa sala de assistir` : `${otherName} está vendo Reels`}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {isRoom ? watching!.title ?? "Toque para entrar junto" : "Toque para abrir o mesmo vídeo"}
          </span>
        </span>
        <span className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground">
          {isRoom ? <Popcorn className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {isRoom ? "Entrar" : "Ver junto"}
        </span>
      </button>
    </div>
  );
}
