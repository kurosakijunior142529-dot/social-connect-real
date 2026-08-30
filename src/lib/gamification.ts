import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Achievement = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  metric: string;
  threshold: number;
  points: number;
  tier: string;
  position: number;
};

export const INTEREST_OPTIONS = [
  "música",
  "games",
  "arte",
  "fotografia",
  "humor",
  "esportes",
  "tecnologia",
  "moda",
  "beleza",
  "culinária",
  "viagem",
  "fitness",
  "cinema",
  "anime",
  "livros",
  "dança",
  "pets",
  "carros",
  "negócios",
  "estudos",
];

/** Catalog + unlocked + live progress for one profile. */
export function useAchievements(userId: string | undefined) {
  return useQuery({
    queryKey: ["achievements", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [catalogRes, unlockedRes, progressRes] = await Promise.all([
        supabase.from("achievements").select("*").order("position"),
        supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", userId!),
        supabase.rpc("achievement_progress", { _user: userId! }),
      ]);

      const catalog = (catalogRes.data ?? []) as Achievement[];
      const unlocked = new Map(
        (unlockedRes.data ?? []).map((r: any) => [r.achievement_id as string, r.unlocked_at as string]),
      );
      const progress = new Map(
        ((progressRes.data ?? []) as any[]).map((r) => [r.metric as string, Number(r.value ?? 0)]),
      );

      const points = catalog.reduce((acc, a) => (unlocked.has(a.id) ? acc + a.points : acc), 0);
      const items = catalog.map((a) => ({
        ...a,
        unlockedAt: unlocked.get(a.id) ?? null,
        current: progress.get(a.metric) ?? 0,
      }));

      return {
        items,
        unlockedCount: unlocked.size,
        total: catalog.length,
        points,
        level: 1 + Math.floor(points / 100),
        nextLevelAt: (1 + Math.floor(points / 100)) * 100,
      };
    },
  });
}

/** Unlocks everything the signed-in user already earned. Safe to call often. */
export function useSyncAchievements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sync_achievements", { _user: undefined as any });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { unlocked: number; points: number; level: number } | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["achievements"] }),
  });
}
