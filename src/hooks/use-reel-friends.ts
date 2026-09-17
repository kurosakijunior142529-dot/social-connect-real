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
 * A lista de quem você segue é buscada uma única vez e reaproveitada por
 * todos os Reels; só a checagem de curtidas é feita por vídeo visível.
 */
export function useReelFriends(postId: string, userId: string, enabled: boolean) {
  const following = useQuery({
    queryKey: ["following-ids", userId],
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId)
        .limit(500);
      return (data ?? []).map((f: any) => f.following_id);
    },
  });

  const ids = following.data ?? [];

  return useQuery({
    queryKey: ["reel-friends", postId, userId, ids.length],
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async (): Promise<FriendLike[]> => {
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
