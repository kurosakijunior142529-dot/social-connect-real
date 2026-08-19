import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type FlagKey =
  | "uploads_enabled"
  | "messaging_enabled"
  | "lives_enabled"
  | "signups_enabled"
  | "maintenance_mode";

/** Emergency kill switches. Advisory in the UI — enforced by RLS in the backend. */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("feature_flags").select("key, enabled");
      const map: Record<string, boolean> = {};
      for (const f of data ?? []) map[f.key] = f.enabled;
      return map;
    },
  });
}

export function useFlag(key: FlagKey) {
  const flags = useFeatureFlags();
  return flags.data ? flags.data[key] !== false : true;
}

/** Punishment state of the signed-in account. */
export function useAccountStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["account-status", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("strikes, suspended_until, banned_at, is_minor")
        .eq("id", user!.id)
        .maybeSingle();
      const banned = !!data?.banned_at;
      const suspended = !!data?.suspended_until && new Date(data.suspended_until) > new Date();
      return {
        strikes: data?.strikes ?? 0,
        isMinor: !!data?.is_minor,
        suspendedUntil: data?.suspended_until ?? null,
        banned,
        suspended,
        restricted: banned || suspended,
      };
    },
  });
}

export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
}
