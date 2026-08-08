import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Props = {
  postId: string;
  userId: string | null;
  className?: string;
  variant?: "feed" | "reel";
  showCount?: boolean;
};

export function RepostButton({ postId, userId, className, variant = "feed", showCount = true }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");

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
    mutationFn: async (text?: string) => {
      if (!userId) throw new Error("Entre para republicar");
      if (state.data?.mine) {
        const { error } = await supabase.from("reposts").delete().match({ post_id: postId, user_id: userId });
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from("reposts")
        .insert({ post_id: postId, user_id: userId, comment: text?.trim() || null });
      if (error) throw error;
      return true;
    },
    onSuccess: (added) => {
      toast.success(added ? "Republicado no seu perfil" : "Republicação removida");
      setOpen(false);
      setComment("");
      qc.invalidateQueries({ queryKey: ["reposts", postId, userId] });
      qc.invalidateQueries({ queryKey: ["profile-stats"] });
      qc.invalidateQueries({ queryKey: ["profile-reposts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao republicar"),
  });

  const active = !!state.data?.mine;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!userId) return toast.error("Entre para republicar");
          if (active) toggle.mutate(undefined);
          else setOpen(true);
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Republicar</DialogTitle>
          </DialogHeader>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Escreva sua legenda (opcional)…"
            maxLength={280}
            rows={4}
            className="rounded-2xl resize-none"
          />
          <div className="text-right text-xs text-muted-foreground">{comment.length}/280</div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-full">
              Cancelar
            </Button>
            <Button
              onClick={() => toggle.mutate(comment)}
              disabled={toggle.isPending}
              className="rounded-full bg-gradient-brand"
            >
              {toggle.isPending ? "Republicando…" : "Republicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
