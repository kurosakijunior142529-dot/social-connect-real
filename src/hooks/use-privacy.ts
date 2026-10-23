import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePrivacy(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-privacy", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("user_privacy").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}