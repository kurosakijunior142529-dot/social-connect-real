import type { Database } from "@/integrations/supabase/types";

export type Privacy = Database["public"]["Tables"]["user_privacy"]["Row"];
export type PostVisibility = "public" | "friends" | "me";
export function postAudienceAllows(visibility: PostVisibility, own: boolean, followsOwner: boolean, ownerFollows: boolean) {
  if (own) return true;
  if (visibility === "me") return false;
  return visibility === "public" || (followsOwner && ownerFollows);
}
export function defaultPostVisibility(value?: string | null): PostVisibility {
  return value === "friends" || value === "me" ? value : "public";
}