/**
 * Valores REAIS do projeto (nada inventado aqui).
 *
 * - Saldo: tabela `user_coins` (as "moedas" do Vibely são os créditos do app).
 * - Pacotes: os mesmos preços já usados na tela Vibely Pro / Stripe
 *   (`coins_100`, `coins_500`, `coins_2000` — mapeados no webhook de pagamento).
 * - Limites: os limites diários definidos no servidor
 *   (`generateImage` = 40/dia, `startVideo` = 5/dia + 1 por vez).
 * - Custo por geração: o projeto AINDA NÃO cobra créditos por geração de IA.
 *   Por isso `AI_COST_PER_ACTION` é nulo — não invente números aqui.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CoinPack = {
  priceId: string;
  coins: number;
  price: string;
  desc: string;
  highlight?: boolean;
};

/** Pacotes de recarga (Stripe) — iguais aos da tela Vibely Pro. */
export const COIN_PACKS: CoinPack[] = [
  { priceId: "coins_100", coins: 100, price: "R$ 9,90", desc: "Ideal para começar" },
  { priceId: "coins_500", coins: 500, price: "R$ 39,90", desc: "Mais popular", highlight: true },
  { priceId: "coins_2000", coins: 2000, price: "R$ 129,90", desc: "Melhor valor" },
];

/** Limites diários aplicados no servidor. */
export const AI_DAILY_LIMITS = { image: 40, video: 5 } as const;

/**
 * Custo em créditos por ação. `null` = ainda não definido no projeto.
 * Quando os custos forem definidos no backend, basta preencher aqui.
 */
export const AI_COST_PER_ACTION: { text: number | null; image: number | null; video: number | null } = {
  text: null,
  image: IMAGE_COST_CREDITS,
  video: VIDEO_COST_CREDITS,
};

export type AiGeneration = {
  id: string;
  kind: "image" | "video";
  status: string;
  prompt: string;
  result_path: string | null;
  error: string | null;
  created_at: string;
};

/** Saldo de créditos do usuário (tabela real `user_coins`). */
export function useAiCredits(userId: string | undefined) {
  return useQuery({
    queryKey: ["coin-balance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_coins")
        .select("balance")
        .eq("user_id", userId!)
        .maybeSingle();
      return data?.balance ?? 0;
    },
  });
}

/** Histórico real de gerações + uso das últimas 24h. */
export function useAiUsage(userId: string | undefined) {
  return useQuery({
    queryKey: ["ai-usage", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_generations")
        .select("id, kind, status, prompt, result_path, error, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      const rows = (data ?? []) as AiGeneration[];
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const last24 = rows.filter((r) => new Date(r.created_at).getTime() >= since);
      return {
        history: rows,
        usedToday: {
          image: last24.filter((r) => r.kind === "image").length,
          video: last24.filter((r) => r.kind === "video").length,
        },
      };
    },
  });
}
