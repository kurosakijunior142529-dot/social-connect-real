import { Bookmark } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Uma única consulta por usuário com todos os posts salvos (em vez de uma
 * consulta por post no feed) — evita dezenas de requisições por rolagem.
 */
function useSavedIds(userId: string) {
  return useQuery({
    queryKey: ["saved-ids", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", userId);
      return new Set<string>(((data ?? []) as { post_id: string }[]).map((r) => r.post_id));
    },
  });
}

export function SavePostButton({ postId, userId }: { postId: string; userId: string }) {
  const qc = useQueryClient();
  const q = useSavedIds(userId);
  const saved = q.data?.has(postId) === true;

  const m = useMutation({
    mutationFn: async () => {
      if (saved) {
        await (supabase as any).from("saved_posts").delete().match({ user_id: userId, post_id: postId });
      } else {
        await (supabase as any).from("saved_posts").insert({ user_id: userId, post_id: postId });
      }
    },
    // Atualização otimista: o ícone responde na hora.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["saved-ids", userId] });
      const prev = qc.getQueryData<Set<string>>(["saved-ids", userId]);
      const next = new Set(prev ?? []);
      if (saved) next.delete(postId);
      else next.add(postId);
      qc.setQueryData(["saved-ids", userId], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["saved-ids", userId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved-ids", userId] });
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
