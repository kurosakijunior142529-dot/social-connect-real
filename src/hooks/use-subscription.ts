import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

export function useSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", userId],
    enabled: !!userId,
    queryFn: async () => {
      let env: "sandbox" | "live" = "sandbox";
      try {
        env = getStripeEnvironment();
      } catch {
        return null;
      }
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId!)
        .eq("environment", env)
        .in("price_id", ["vibely_pro_monthly", "vibely_pro_yearly"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
}

export function useCoinBalance(userId: string | undefined) {
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
