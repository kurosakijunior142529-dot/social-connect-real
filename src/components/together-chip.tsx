import { useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useFriendReel } from "@/lib/reels-presence";

/**
 * Aparece só quando a outra pessoa está na tela de Reels agora.
 * Tocar leva direto ao Reel que ela está vendo.
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
  if (!postId) return null;

  return (
    <div className="px-4 pt-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/reels", search: { post: postId } as any })}
        className="flex w-full items-center gap-2 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-2 text-left transition active:scale-[0.99]"
      >
        <span className="relative grid h-5 w-5 place-items-center rounded-full bg-primary/15">
          <Play className="h-3 w-3 fill-primary text-primary" />
        </span>
        <span className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{otherName}</span> está assistindo Reels agora · ver junto
        </span>
      </button>
    </div>
  );
}
