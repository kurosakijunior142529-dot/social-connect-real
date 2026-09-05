import { supabase } from "@/integrations/supabase/client";

export const WATCH_SESSION_EXPIRED = "WATCH_SESSION_EXPIRED";

/** Revalida a identidade antes de qualquer gravação protegida das salas. */
export async function requireFreshWatchUser() {
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) return data.user;

  await supabase.auth.signOut({ scope: "local" });
  throw new Error(WATCH_SESSION_EXPIRED);
}

export function isWatchSessionExpired(error: unknown) {
  return error instanceof Error && error.message === WATCH_SESSION_EXPIRED;
}