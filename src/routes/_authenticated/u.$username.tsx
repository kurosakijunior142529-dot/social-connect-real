import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage } from "@/components/signed-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MessageCircle, Settings, Ban } from "lucide-react";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";

export const Route = createFileRoute("/_authenticated/u/$username")({
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data;
  const isMe = profile?.id === user.id;
  const blocks = useBlocks();
  const iBlocked = profile ? blocks.data?.blocked.has(profile.id) ?? false : false;
  const blockedMe = profile ? blocks.data?.blockedBy.has(profile.id) ?? false : false;
  const isBlockedPair = iBlocked || blockedMe;


  const stats = useQuery({
    queryKey: ["profile-stats", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [posts, followers, following, mine] = await Promise.all([
        supabase.from("posts").select("id, media_url, media_type").eq("author_id", profile!.id).order("created_at", { ascending: false }),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile!.id),
        supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile!.id),
        supabase.from("follows").select("*").match({ follower_id: user.id, following_id: profile!.id }).maybeSingle(),
      ]);
      return {
        posts: posts.data ?? [],
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        isFollowing: !!mine.data,
      };
    },
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!profile || isMe) return;
      if (stats.data?.isFollowing) {
        await supabase.from("follows").delete().match({ follower_id: user.id, following_id: profile.id });
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile-stats", profile?.id] }),
  });

  async function openChat() {
    if (!profile) return;
    const { data, error } = await supabase.rpc("get_or_create_conversation", {
      _other_user: profile.id,
    });
    if (error) return toast.error(error.message);
    navigate({ to: "/messages/$conversationId", params: { conversationId: data as string } });
  }

  if (profileQuery.isLoading) {
    return <Skeleton className="h-64 rounded-3xl" />;
  }
  if (!profile) {
    return <div className="text-center py-12">Usuário não encontrado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <UserAvatar
          avatarPath={profile.avatar_url}
          displayName={profile.display_name}
          className="h-20 w-20"
          ring
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{profile.display_name}</h1>
          <div className="text-sm text-muted-foreground">@{profile.username}</div>
          {profile.bio ? <p className="text-sm mt-2 whitespace-pre-wrap">{profile.bio}</p> : null}
        </div>
        {!isMe ? (
          <UserActionsMenu targetUserId={profile.id} targetUsername={profile.username} />
        ) : null}
      </div>

      {isBlockedPair ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>
            {iBlocked
              ? "Você bloqueou este usuário."
              : "Este perfil não está disponível."}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 text-sm">
            <div><span className="font-bold">{stats.data?.posts.length ?? 0}</span> posts</div>
            <div><span className="font-bold">{stats.data?.followers ?? 0}</span> seguidores</div>
            <div><span className="font-bold">{stats.data?.following ?? 0}</span> seguindo</div>
          </div>

          {isMe ? (
            <Link to="/settings">
              <Button variant="outline" className="w-full rounded-full gap-2">
                <Settings className="h-4 w-4" /> Editar perfil
              </Button>
            </Link>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={() => toggleFollow.mutate()}
                className={
                  stats.data?.isFollowing
                    ? "flex-1 rounded-full"
                    : "flex-1 rounded-full bg-gradient-brand hover:opacity-90"
                }
                variant={stats.data?.isFollowing ? "outline" : "default"}
              >
                {stats.data?.isFollowing ? "Seguindo" : "Seguir"}
              </Button>
              <Button onClick={openChat} variant="outline" className="rounded-full gap-2">
                <MessageCircle className="h-4 w-4" /> Mensagem
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1">
            {stats.data?.posts.map((p) => (
              <Link
                key={p.id}
                to="/p/$id"
                params={{ id: p.id }}
                className="aspect-square overflow-hidden rounded-xl bg-muted"
              >
                <SignedImage bucket="posts" path={p.media_url} alt="" className="w-full h-full object-cover" />
              </Link>
            ))}
          </div>
          {stats.data && stats.data.posts.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">Nenhum post ainda.</div>
          ) : null}
        </>
      )}
    </div>
  );
}
