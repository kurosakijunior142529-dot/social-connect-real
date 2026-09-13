import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FriendLike = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Amigos (pessoas que você segue) que curtiram este Reel.
 * Consulta leve, só enquanto o Reel está visível.
 */
export function useReelFriends(postId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["reel-friends", postId, userId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FriendLike[]> => {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId)
        .limit(500);
      const ids = (follows ?? []).map((f: any) => f.following_id);
      if (ids.length === 0) return [];

      const { data: likes } = await supabase
        .from("likes")
        .select("user_id")
        .eq("post_id", postId)
        .in("user_id", ids)
        .limit(12);
      const likers = Array.from(new Set((likes ?? []).map((l: any) => l.user_id)));
      if (likers.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", likers);
      return (profiles ?? []) as FriendLike[];
    },
  });
}
