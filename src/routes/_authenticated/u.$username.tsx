import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedMediaThumb } from "@/components/signed-image";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  MessageCircle,
  Share2,
  Ban,
  MapPin,
  LinkIcon,
  Grid3x3,
  Bookmark,
  Heart,
  Sparkles,
  Play,
  Camera,
  Loader2,
  Menu,
  Pencil,
} from "lucide-react";

import { VerifiedBadge } from "@/components/verified-badge";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";
import { uploadMedia } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/u/$username")({
  component: ProfilePage,
});

function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

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

  const profile: any = profileQuery.data;
  const isMe = profile?.id === user.id;
  const blocks = useBlocks();
  const iBlocked = profile ? blocks.data?.blocked.has(profile.id) ?? false : false;
  const blockedMe = profile ? blocks.data?.blockedBy.has(profile.id) ?? false : false;
  const isBlockedPair = iBlocked || blockedMe;

  const { data: coverUrl } = useSignedUrl("covers", profile?.cover_url ?? null);

  const stats = useQuery({
    queryKey: ["profile-stats", profile?.id, user.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [posts, followers, following, mine] = await Promise.all([
        supabase
          .from("posts")
          .select("id, media_url, media_type, view_count")
          .eq("author_id", profile!.id)
          .order("created_at", { ascending: false }),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile!.id),
        supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile!.id),
        supabase.from("follows").select("*").match({ follower_id: user.id, following_id: profile!.id }).maybeSingle(),
      ]);

      // curtidas recebidas: contamos likes onde post pertence a este autor
      const authorPostIds = (posts.data ?? []).map((p: any) => p.id);
      let likesReceived = 0;
      if (authorPostIds.length) {
        const { count } = await supabase
          .from("likes")
          .select("post_id", { count: "exact", head: true })
          .in("post_id", authorPostIds);
        likesReceived = count ?? 0;
      }
      const viewsTotal = (posts.data ?? []).reduce((acc: number, p: any) => acc + (p.view_count ?? 0), 0);

      // Curtidos e Salvos só para o dono
      let likedPosts: any[] = [];
      let savedPosts: any[] = [];
      if (profile!.id === user.id) {
        const [likedRes, savedRes] = await Promise.all([
          supabase.from("likes").select("post_id").eq("user_id", user.id).limit(120),
          supabase.from("saved_posts").select("post_id").eq("user_id", user.id).limit(120),
        ]);
        const lids = (likedRes.data ?? []).map((l: any) => l.post_id);
        const sids = (savedRes.data ?? []).map((s: any) => s.post_id);
        if (lids.length) {
          const { data } = await supabase.from("posts").select("id, media_url, media_type").in("id", lids);
          likedPosts = data ?? [];
        }
        if (sids.length) {
          const { data } = await supabase.from("posts").select("id, media_url, media_type").in("id", sids);
          savedPosts = data ?? [];
        }
      }

      return {
        posts: posts.data ?? [],
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        isFollowing: !!mine.data,
        likesReceived,
        viewsTotal,
        likedPosts,
        savedPosts,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile-stats", profile?.id, user.id] }),
  });

  async function openChat() {
    if (!profile) return;
    const { data, error } = await supabase.rpc("get_or_create_conversation", {
      _other_user: profile.id,
    });
    if (error) return toast.error(error.message);
    navigate({ to: "/messages/$conversationId", params: { conversationId: data as string } });
  }

  async function share() {
    if (!profile) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    try {
      if (navigator.share) await navigator.share({ title: profile.display_name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado");
      }
    } catch {
      // user cancelled share sheet
    }
  }

  if (profileQuery.isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!profile) return <div className="text-center py-12">Usuário não encontrado.</div>;

  const posts = (stats.data?.posts ?? []) as any[];
  const videoPosts = posts.filter((p) => p.media_type === "video");
  const mediaPosts = posts.filter((p) => !!p.media_url);

  return (
    <div className="-mt-4 md:-mt-10 space-y-5">
      {/* 1. CAPA */}
      <div className="relative -mx-4 h-44 md:h-56 md:rounded-3xl overflow-hidden">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/30 via-secondary to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        {isMe ? <CoverUploader userId={user.id} onDone={() => profileQuery.refetch()} /> : null}

        {/* Menu ⚙️ / ☰ no canto superior direito — só do dono */}
        {isMe ? (
          <Link
            to="/account"
            className="absolute top-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60 transition"
            aria-label="Abrir menu da conta"
          >
            <Menu className="h-5 w-5" />
          </Link>
        ) : null}
      </div>

      {/* 2. FOTO DE PERFIL */}
      <div className="relative -mt-16 px-1">
        <div className="inline-block rounded-full ring-4 ring-background bg-background">
          <UserAvatar
            avatarPath={profile.avatar_url}
            displayName={profile.display_name}
            className="h-24 w-24"
          />
        </div>
      </div>

      {/* 3-6. NOME, @, BIO, LINKS, LOCALIZAÇÃO, SELOS */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-display font-black tracking-tight">{profile.display_name}</h1>
          {profile.is_verified || profile.badge_variant ? (
            <VerifiedBadge size={20} variant={profile.badge_variant ?? "verified"} />
          ) : null}
          {profile.badge_variant === "founder" ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-bold text-black bg-[linear-gradient(135deg,#FFF3B0,#22E06A)] shadow-[0_0_12px_rgba(34,224,106,0.45)]">
              Pioneira #1
            </span>
          ) : null}
          {profile.is_creator ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full bg-primary/15 text-primary px-2 py-0.5 font-semibold">
              Criador
            </span>
          ) : null}
          {profile.pronouns ? (
            <span className="text-xs rounded-full bg-white/5 px-2 py-0.5 text-muted-foreground">{profile.pronouns}</span>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground">@{profile.username}</div>
        {profile.bio ? <p className="text-sm whitespace-pre-wrap">{profile.bio}</p> : null}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-1">
          {profile.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {profile.location}
            </span>
          ) : null}
          {profile.website ? (
            <a
              href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <LinkIcon className="h-3.5 w-3.5" /> {profile.website.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
        </div>
      </div>

      {/* 7. STATS: Seguidores · Seguindo · Curtidas · Views */}
      <div className="grid grid-cols-4 gap-2">
        <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "followers" }}>
          <StatCard label="Seguidores" value={stats.data?.followers ?? 0} />
        </Link>
        <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "following" }}>
          <StatCard label="Seguindo" value={stats.data?.following ?? 0} />
        </Link>
        <StatCard label="Curtidas" value={stats.data?.likesReceived ?? 0} />
        <StatCard label="Views" value={stats.data?.viewsTotal ?? 0} />
      </div>

      {/* 8. BOTÕES: Seguir · Mensagem · Compartilhar · Editar */}
      <div className="flex gap-2">
        {isMe ? (
          <>
            <Link to="/settings" className="flex-1">
              <Button variant="outline" className="w-full rounded-full gap-2">
                <Pencil className="h-4 w-4" /> Editar perfil
              </Button>
            </Link>
            <Button onClick={share} variant="outline" size="icon" className="rounded-full" aria-label="Compartilhar">
              <Share2 className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => toggleFollow.mutate()}
              disabled={toggleFollow.isPending}
              className={
                stats.data?.isFollowing
                  ? "flex-1 rounded-full"
                  : "flex-1 rounded-full bg-gradient-brand hover:opacity-90 shadow-elegant"
              }
              variant={stats.data?.isFollowing ? "outline" : "default"}
            >
              {stats.data?.isFollowing ? "Seguindo" : "Seguir"}
            </Button>
            <Button onClick={openChat} variant="outline" className="rounded-full gap-2" aria-label="Mensagem">
              <MessageCircle className="h-4 w-4" /> Mensagem
            </Button>
            <Button onClick={share} variant="outline" size="icon" className="rounded-full" aria-label="Compartilhar">
              <Share2 className="h-4 w-4" />
            </Button>
            <UserActionsMenu targetUserId={profile.id} targetUsername={profile.username} />
          </>
        )}
      </div>

      {/* 9. ABAS + GRADE */}
      {isBlockedPair ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>{iBlocked ? "Você bloqueou este usuário." : "Este perfil não está disponível."}</span>
        </div>
      ) : (
        <Tabs defaultValue="posts">
          <TabsList className={`w-full grid ${isMe ? "grid-cols-5" : "grid-cols-3"} rounded-full glass p-1`}>
            <TabsTrigger value="posts" className="rounded-full gap-1.5" aria-label="Posts">
              <Grid3x3 className="h-4 w-4" />
              <span className="hidden sm:inline">Posts</span>
            </TabsTrigger>
            <TabsTrigger value="videos" className="rounded-full gap-1.5" aria-label="Vídeos">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Vídeos</span>
            </TabsTrigger>
            <TabsTrigger value="media" className="rounded-full gap-1.5" aria-label="Mídia">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Mídia</span>
            </TabsTrigger>
            {isMe ? (
              <>
                <TabsTrigger value="likes" className="rounded-full gap-1.5" aria-label="Curtidos">
                  <Heart className="h-4 w-4" />
                  <span className="hidden sm:inline">Curtidos</span>
                </TabsTrigger>
                <TabsTrigger value="saved" className="rounded-full gap-1.5" aria-label="Salvos">
                  <Bookmark className="h-4 w-4" />
                  <span className="hidden sm:inline">Salvos</span>
                </TabsTrigger>
              </>
            ) : null}
          </TabsList>

          <TabsContent value="posts" className="mt-4">
            <PostGrid posts={posts} empty="Nenhum post ainda." />
          </TabsContent>
          <TabsContent value="videos" className="mt-4">
            <PostGrid posts={videoPosts} empty="Nenhum vídeo publicado." />
          </TabsContent>
          <TabsContent value="media" className="mt-4">
            <PostGrid posts={mediaPosts} empty="Sem mídia." />
          </TabsContent>
          {isMe ? (
            <>
              <TabsContent value="likes" className="mt-4">
                <PostGrid posts={stats.data?.likedPosts ?? []} empty="Você ainda não curtiu nada." />
              </TabsContent>
              <TabsContent value="saved" className="mt-4">
                <PostGrid posts={stats.data?.savedPosts ?? []} empty="Você não salvou publicações." />
              </TabsContent>
            </>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl px-2 py-3 text-center">
      <div className="text-lg font-display font-bold tabular">{formatCount(value)}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function PostGrid({ posts, empty }: { posts: any[]; empty: string }) {
  if (!posts.length) return <div className="text-center text-sm text-muted-foreground py-8">{empty}</div>;
  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map((p) => (
        <Link
          key={p.id}
          to="/p/$id"
          params={{ id: p.id }}
          className="aspect-square overflow-hidden rounded-xl bg-[color:var(--surface-2)]"
        >
          <SignedMediaThumb
            bucket="posts"
            path={p.media_url}
            mediaType={p.media_type}
            alt=""
            className="w-full h-full object-cover"
          />
        </Link>
      ))}
    </div>
  );
}

function CoverUploader({ userId, onDone }: { userId: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onPick(f: File) {
    if (!f.type.startsWith("image/")) return toast.error("Selecione uma imagem");
    if (f.size > 8 * 1024 * 1024) return toast.error("Imagem maior que 8MB");
    setBusy(true);
    try {
      const path = await uploadMedia("covers", userId, f);
      const { error } = await supabase.from("profiles").update({ cover_url: path }).eq("id", userId);
      if (error) throw error;
      toast.success("Capa atualizada");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60 transition disabled:opacity-60"
        aria-label="Trocar capa"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
