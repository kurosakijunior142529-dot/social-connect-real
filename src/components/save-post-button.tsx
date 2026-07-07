import { Bookmark } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function SavePostButton({ postId, userId }: { postId: string; userId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["saved", userId, postId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", userId)
        .eq("post_id", postId)
        .maybeSingle();
      return !!data;
    },
  });
  const saved = q.data === true;
  const m = useMutation({
    mutationFn: async () => {
      if (saved) {
        await (supabase as any).from("saved_posts").delete().match({ user_id: userId, post_id: postId });
      } else {
        await (supabase as any).from("saved_posts").insert({ user_id: userId, post_id: postId });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved", userId, postId] });
      qc.invalidateQueries({ queryKey: ["saved", userId] });
    },
  });
  return (
    <button
      onClick={() => m.mutate()}
      className="ml-auto text-foreground/80 hover:text-primary transition"
      aria-label={saved ? "Remover dos salvos" : "Salvar"}
    >
      <Bookmark className={cn("h-6 w-6", saved && "fill-primary text-primary")} />
    </button>
  );
}
