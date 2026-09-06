import { createFileRoute, Link } from "@tanstack/react-router";
import { VerifiedName } from "@/components/verified-badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage, SignedVideo } from "@/components/signed-image";
import { PostComments } from "@/components/comments/post-comments";
import { Heart, ArrowLeft } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/p/$id")({
  component: PostDetailPage,
});

function PostDetailPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  

  const post = useQuery({
    queryKey: ["post", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: author } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .eq("id", data.author_id)
        .maybeSingle();
      const [likes, myLike] = await Promise.all([
        supabase.from("likes").select("user_id", { count: "exact", head: true }).eq("post_id", id),
        supabase.from("likes").select("*").match({ post_id: id, user_id: user.id }).maybeSingle(),
      ]);
      return {
        ...data,
        author,
        likes_count: likes.count ?? 0,
        liked_by_me: !!myLike.data,
      };
    },
  });

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (post.data?.liked_by_me) {
        await supabase.from("likes").delete().match({ user_id: user.id, post_id: id });
      } else {
        await supabase.from("likes").insert({ user_id: user.id, post_id: id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["post", id] }),
  });

  if (post.isLoading) return <Skeleton className="h-96 rounded-3xl" />;
  if (!post.data) return <div className="text-center py-12">Post não encontrado.</div>;

  const p = post.data;
  return (
    <div className="space-y-4">
      <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <article className="rounded-3xl bg-card border overflow-hidden">
        <header className="flex items-center gap-3 p-4">
          <Link to="/u/$username" params={{ username: p.author?.username ?? "" }}>
            <UserAvatar avatarPath={p.author?.avatar_url} displayName={p.author?.display_name ?? "?"} verified={!!(p.author as any)?.is_verified} badgeVariant={((p.author as any)?.badge_variant) ?? null} ring />
          </Link>
          <div>
            <Link to="/u/$username" params={{ username: p.author?.username ?? "" }} className="font-semibold text-sm hover:underline">
              <VerifiedName name={p.author?.display_name} verified={(p.author as any)?.is_verified} badgeVariant={(p.author as any)?.badge_variant} />
            </Link>
            <div className="text-xs text-muted-foreground">@{p.author?.username}</div>
          </div>
        </header>
        <div className="bg-black">
          {p.media_type === "video" ? (
            <SignedVideo bucket="posts" path={p.media_url} className="w-full max-h-[80vh] aspect-[4/5]" fit="contain" />
          ) : (
            <SignedImage bucket="posts" path={p.media_url} alt={p.caption ?? ""} className="w-full h-auto max-h-[80vh] object-contain" />
          )}
        </div>
        <div className="p-4 space-y-3">
          <button onClick={() => toggleLike.mutate()} className="flex items-center gap-1.5">
            <Heart className={cn("h-6 w-6", p.liked_by_me && "fill-primary text-primary")} />
            <span className="font-medium">{p.likes_count}</span>
          </button>
          {p.caption ? <p className="text-sm">{p.caption}</p> : null}
          <div className="text-xs text-muted-foreground">
            {formatDistanceToNowStrict(new Date(p.created_at), { locale: ptBR, addSuffix: true })}
          </div>
        </div>
      </article>

      <section className="space-y-3">
        <h2 className="font-semibold text-sm px-1">Comentários</h2>
        <PostComments postId={id} currentUserId={user.id} postAuthorId={p.author_id} />
      </section>
    </div>
  );
}
