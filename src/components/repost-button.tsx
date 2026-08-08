import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  postId: string;
  userId: string | null;
  className?: string;
  variant?: "feed" | "reel";
  showCount?: boolean;
};

export function RepostButton({ postId, userId, className, variant = "feed", showCount = true }: Props) {
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: ["reposts", postId, userId],
    queryFn: async () => {
      const [countRes, mineRes] = await Promise.all([
        supabase.from("reposts").select("post_id", { count: "exact", head: true }).eq("post_id", postId),
        userId
          ? supabase.from("reposts").select("id").match({ post_id: postId, user_id: userId }).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      return { count: countRes.count ?? 0, mine: !!mineRes.data };
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Entre para republicar");
      if (state.data?.mine) {
        const { error } = await supabase.from("reposts").delete().match({ post_id: postId, user_id: userId });
        if (error) throw error;
        return false;
      }
      const { error } = await supabase.from("reposts").insert({ post_id: postId, user_id: userId });
      if (error) throw error;
      return true;
    },
    onSuccess: (added) => {
      toast.success(added ? "Republicado no seu perfil" : "Republicação removida");
      qc.invalidateQueries({ queryKey: ["reposts", postId, userId] });
      qc.invalidateQueries({ queryKey: ["profile-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao republicar"),
  });

  const active = !!state.data?.mine;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      disabled={toggle.isPending}
      aria-label={active ? "Remover republicação" : "Republicar"}
      className={cn(
        "flex items-center gap-1.5 transition",
        variant === "reel" ? "flex-col gap-0.5" : "",
        className,
      )}
    >
      <Repeat2
        className={cn(
          variant === "reel" ? "h-7 w-7 drop-shadow" : "h-[22px] w-[22px]",
          active ? "text-emerald-400" : "",
          toggle.isPending && "opacity-60",
        )}
        strokeWidth={active ? 2.4 : 1.8}
      />
      {showCount ? (
        <span className={cn("text-[13px] font-medium tabular", active && "text-emerald-400")}>
          {state.data?.count ?? 0}
        </span>
      ) : null}
    </button>
  );
}
