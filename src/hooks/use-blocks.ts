import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export type BlockSets = {
  blocked: Set<string>; // users I blocked
  blockedBy: Set<string>; // users who blocked me
  hidden: Set<string>; // union — filter out from feed/search/messages
};

export function useBlocks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<BlockSets>({
    queryKey: ["blocks", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [mineRes, byRes] = await Promise.all([
        supabase.from("blocks").select("blocked_id").eq("blocker_id", userId!),
        supabase.from("blocks").select("blocker_id").eq("blocked_id", userId!),
      ]);
      const blocked = new Set((mineRes.data ?? []).map((b) => b.blocked_id));
      const blockedBy = new Set((byRes.data ?? []).map((b) => b.blocker_id));
      const hidden = new Set<string>([...blocked, ...blockedBy]);
      return { blocked, blockedBy, hidden };
    },
  });
}

export function useBlockUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId, block }: { targetId: string; block: boolean }) => {
      if (!user) throw new Error("Not signed in");
      if (block) {
        // remove any follow relationship in either direction
        await Promise.all([
          supabase.from("follows").delete().match({ follower_id: user.id, following_id: targetId }),
          supabase.from("follows").delete().match({ follower_id: targetId, following_id: user.id }),
          supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: targetId }),
        ]);
      } else {
        await supabase.from("blocks").delete().match({ blocker_id: user.id, blocked_id: targetId });
      }
    },
    onSuccess: (_, vars) => {
      toast.success(vars.block ? "Usuário bloqueado" : "Bloqueio removido");
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["explore"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["profile-stats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar bloqueio"),
  });
}
