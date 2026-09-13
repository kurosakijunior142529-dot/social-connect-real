import { createFileRoute, useNavigate, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Play,
  Repeat2,
  Camera,
  Loader2,
  
  Pencil,
  Trophy,
  Crown,
} from "lucide-react";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";


import { VerifiedBadge } from "@/components/verified-badge";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";
import { uploadMedia } from "@/lib/media";

import { VibeCollections } from "@/components/profile/vibe-collections";
import { ProfileRealities } from "@/components/profile/profile-realities";
import { AchievementsCard } from "@/components/profile/achievements-card";


export const Route = createFileRoute("/_authenticated/u/$username")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Perfil | Vibely" },
      { name: "description", content: "Perfil, publicações e Vibes na rede social Vibely." },
      { property: "og:title", content: "Perfil | Vibely" },
      { property: "og:description", content: "Perfil, publicações e Vibes na rede social Vibely." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

function ProfilePage() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;
  return <ProfileContent />;
}

function ProfileContent() {
  const { username } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  

  const profileQuery = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        // Somente colunas públicas: `*` falha por permissão desde o
        // endurecimento de segurança (colunas sensíveis não são legíveis).
        .select(
          "id, username, display_name, bio, avatar_url, cover_url, website, location, pronouns, show_online, read_receipts, is_verified, is_creator, badge_variant, created_at, updated_at, interests, featured_username",
        )
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
  const { openCheckout, checkoutElement } = useStripeCheckout();

  const supportQuery = useQuery({
    queryKey: ["supporting", profile?.id, user.id],
    enabled: !!profile?.id && !isMe,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("channel_subscriptions")
        .select("id")
        .eq("creator_id", profile.id)
        .eq("subscriber_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return !!data;
    },
  });
  const supporting = supportQuery.data === true;

  // Selo público de apoiador: visível para todos quando o dono do perfil
  // apoia pelo menos um criador com assinatura ativa.
  const supporterBadge = useQuery({
    queryKey: ["supporter-badge", profile?.id],
    enabled: !!profile?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("is_supporter", { _user: profile.id });
      return data === true;
    },
  });
  const isSupporter = supporterBadge.data === true;

  // Atualiza o selo assim que uma assinatura do dono do perfil muda.
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    const ch = supabase
      .channel(`supporter-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_subscriptions", filter: `subscriber_id=eq.${profileId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["supporter-badge", profileId] });
          queryClient.invalidateQueries({ queryKey: ["supporting", profileId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [profileId, queryClient]);



  const vibes = useQuery({
    queryKey: ["profile-vibes", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("id, user_id, media_url, media_type, caption, created_at, expires_at")
        .eq("user_id", profile.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useQuery({
    queryKey: ["profile-stats", profile?.id, user.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [posts, followers, following, mine] = await Promise.all([
        supabase
          .from("posts")
          .select("id, media_url, media_type, view_count, post_kind")
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

      // Republicações do perfil
      let repostedPosts: any[] = [];
      const { data: repostRows } = await supabase
        .from("reposts")
        .select("post_id")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(120);
      const rids = (repostRows ?? []).map((r: any) => r.post_id);
      if (rids.length) {
        const { data } = await supabase.from("posts").select("id, media_url, media_type").in("id", rids);
        repostedPosts = data ?? [];
      }

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
        repostedPosts,
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

  if (profileQuery.isLoading) return <ProfileSkeleton />;
  if (!profile) return <div className="text-center py-12">Usuário não encontrado.</div>;

  const allPosts = (stats.data?.posts ?? []) as any[];
  // publicações do feed vs. vídeos curtos (reels) são separados por post_kind
  const posts = allPosts.filter((p) => p.post_kind !== "reel");
  const videoPosts = allPosts.filter((p) => p.post_kind === "reel" || p.media_type === "video");

  const activeVibes = vibes.data ?? [];

  return (
    <div className="profile-enter -mt-4 overflow-hidden pb-2 md:-mt-6">
      {/* Capa imersiva e identidade */}
      <section className="relative -mx-4 min-h-[390px] overflow-hidden border-b border-border/70 sm:min-h-[410px] md:mx-0 md:min-h-[360px] md:rounded-2xl md:border">
        {coverUrl ? (
          <img src={coverUrl} alt={`Capa do perfil de ${profile.display_name}`} className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 via-45% to-background/5" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background to-transparent" />
        {isMe ? <CoverUploader userId={user.id} onDone={() => profileQuery.refetch()} /> : null}

        <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-5 md:px-7 md:pb-6">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3 md:gap-5">
            <div className="relative shrink-0">
              <div className="rounded-full bg-background p-1 ring-2 ring-primary shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_32%,transparent)]">
                <UserAvatar avatarPath={profile.avatar_url} displayName={profile.display_name} className="h-[88px] w-[88px] sm:h-24 sm:w-24 md:h-28 md:w-28" />
              </div>
              <span className="absolute bottom-1.5 right-1 h-5 w-5 rounded-full border-4 border-background bg-primary" aria-label="Perfil ativo" />
            </div>

            <div className="min-w-0 pb-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <h1 className="min-w-0 truncate text-2xl font-display font-bold sm:text-3xl md:text-4xl">{profile.display_name}</h1>
                {profile.is_verified || profile.badge_variant ? <span className="shrink-0"><VerifiedBadge size={22} variant={profile.badge_variant ?? "verified"} /></span> : null}
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="max-w-full truncate font-semibold text-primary">@{profile.username}</span>
                {profile.pronouns ? <span className="text-muted-foreground">· {profile.pronouns}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {isSupporter ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary"><Heart className="h-3 w-3 fill-primary" /> Apoiador</span> : null}
                {profile.is_creator ? <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Criador</span> : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-border/70 rounded-xl border border-border/70 bg-background/70 py-2.5 backdrop-blur-xl">
              <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "followers" }} className="group px-2 text-center">
                <StatInline label="Seguidores" value={stats.data?.followers ?? 0} />
              </Link>
              <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "following" }} className="group px-2 text-center">
                <StatInline label="Seguindo" value={stats.data?.following ?? 0} />
              </Link>
              <span className="px-2 text-center"><StatInline label="Vibes" value={activeVibes.length} /></span>
          </div>

          <div className="mt-3 flex w-full min-w-0 gap-2 overflow-x-auto no-scrollbar">
            {isMe ? (
              <Link to="/settings" className="min-w-0 flex-1">
                <Button className="h-11 w-full gap-2"><Pencil className="h-4 w-4" /> Editar perfil</Button>
              </Link>
            ) : (
              <>
                <Button onClick={() => toggleFollow.mutate()} disabled={toggleFollow.isPending} className="h-11 min-w-[96px] flex-1" variant={stats.data?.isFollowing ? "outline" : "default"}>
                  {stats.data?.isFollowing ? "Seguindo" : "Seguir"}
                </Button>
                <Button onClick={openChat} variant="outline" className="h-11 shrink-0 gap-2"><MessageCircle className="h-4 w-4" /> <span className="hidden min-[360px]:inline">Mensagem</span></Button>
                {profile.is_creator ? (
                  <Button
                    onClick={() =>
                      openCheckout({ priceId: "channel_sub_monthly", creatorId: profile.id })
                    }
                    variant={supporting ? "secondary" : "outline"}
                    className="h-11 shrink-0 gap-2"
                  >
                    <Crown className="h-4 w-4" /> {supporting ? "Apoiador" : "Apoiar"}
                  </Button>
                ) : null}
                <UserActionsMenu targetUserId={profile.id} targetUsername={profile.username} />
              </>
            )}
            <Button onClick={share} variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Compartilhar perfil"><Share2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>

      <div className="space-y-7 px-4 py-6 md:px-6 md:py-7">
        <section className="border-b border-border/60 pb-6">
          {profile.bio ? <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 md:text-base md:leading-7">{profile.bio}</p> : <p className="text-sm text-muted-foreground">Este perfil ainda não adicionou uma bio.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {profile.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {profile.location}</span> : null}
            {profile.website ? <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-primary hover:underline"><LinkIcon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{profile.website.replace(/^https?:\/\//, "")}</span></a> : null}
            {profile.featured_username ? <Link to="/u/$username" params={{ username: profile.featured_username }} className="font-medium text-primary hover:underline">com @{profile.featured_username}</Link> : null}
          </div>
          {(profile.interests?.length ?? 0) > 0 ? <div className="mt-4 flex flex-wrap gap-2">{profile.interests.map((tag: string) => <span key={tag} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold capitalize text-primary">#{tag}</span>)}</div> : null}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <ProfileMetric label="Curtidas" value={stats.data?.likesReceived ?? 0} icon={<Heart className="h-4 w-4" />} />
            <ProfileMetric label="Visualizações" value={stats.data?.viewsTotal ?? 0} icon={<Play className="h-4 w-4" />} />
            <Link
              to="/achievements/$username"
              params={{ username: profile.username }}
              className="group flex min-w-0 flex-col items-center justify-center rounded-xl border border-primary/20 bg-primary/5 px-2 py-3 text-center text-primary transition hover:bg-primary/10"
            >
              <Trophy className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
              <span className="mt-1 truncate text-[11px] font-semibold">Conquistas</span>
            </Link>
          </div>
        </section>

        <Link to="/achievements/$username" params={{ username: profile.username }} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <AchievementsCard userId={profile.id} isMe={isMe} />
        </Link>

        <VibeCollections profileId={profile.id} isMe={isMe} activeVibes={activeVibes} />

        <ProfileRealities profileId={profile.id} isMe={isMe} />



      {/* 9. ABAS + GRADE */}
      {isBlockedPair ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>{iBlocked ? "Você bloqueou este usuário." : "Este perfil não está disponível."}</span>
        </div>
      ) : (
          <Tabs defaultValue="posts" className="profile-tabs">
          <TabsList className={`sticky top-0 z-20 grid h-12 w-full ${isMe ? "grid-cols-5" : "grid-cols-3"} rounded-xl border border-border bg-background/90 p-1 backdrop-blur-xl`}>
            <TabsTrigger value="posts" className="h-10 gap-1.5 rounded-lg transition-all duration-200 data-[state=active]:bg-primary/10 data-[state=active]:text-primary" aria-label="Posts">
              <Grid3x3 className="h-4 w-4" />
              <span className="hidden sm:inline">Posts</span>
            </TabsTrigger>
            <TabsTrigger value="videos" className="h-10 gap-1.5 rounded-lg transition-all duration-200 data-[state=active]:bg-primary/10 data-[state=active]:text-primary" aria-label="Vídeos">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Vídeos</span>
            </TabsTrigger>
            <TabsTrigger value="reposts" className="h-10 gap-1.5 rounded-lg transition-all duration-200 data-[state=active]:bg-primary/10 data-[state=active]:text-primary" aria-label="Republicado">
              <Repeat2 className="h-4 w-4" />
              <span className="hidden sm:inline">Republicado</span>
            </TabsTrigger>
            {isMe ? (
              <>
                <TabsTrigger value="likes" className="h-10 gap-1.5 rounded-lg transition-all duration-200 data-[state=active]:bg-primary/10 data-[state=active]:text-primary" aria-label="Curtidos">
                  <Heart className="h-4 w-4" />
                  <span className="hidden sm:inline">Curtidos</span>
                </TabsTrigger>
                <TabsTrigger value="saved" className="h-10 gap-1.5 rounded-lg transition-all duration-200 data-[state=active]:bg-primary/10 data-[state=active]:text-primary" aria-label="Salvos">
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
          <TabsContent value="reposts" className="mt-4">
            <PostGrid posts={stats.data?.repostedPosts ?? []} empty="Nenhuma republicação ainda." />
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
      {checkoutElement}
    </div>
  );
}

function StatInline({ label, value }: { label: string; value: number }) {
  return <span className="block"><strong className="block text-base font-bold leading-tight tabular text-foreground">{formatCount(value)}</strong><span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{label}</span></span>;
}

function ProfileMetric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <span className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-border/70 bg-[color:var(--surface)] px-2 py-3 text-center"><span className="text-muted-foreground">{icon}</span><strong className="mt-1 text-base font-bold leading-none tabular">{formatCount(value)}</strong><span className="mt-1 max-w-full truncate text-[10px] text-muted-foreground">{label}</span></span>;
}

function PostGrid({ posts, empty }: { posts: any[]; empty: string }) {
  if (!posts.length) return <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-border/70 bg-[color:var(--surface)]/40 px-5 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="grid grid-cols-3 gap-1.5 md:gap-3">
      {posts.map((p) => (
        <Link
          key={p.id}
          to="/p/$id"
          params={{ id: p.id }}
          className="group aspect-square overflow-hidden rounded-md bg-[color:var(--surface-2)] ring-1 ring-border transition-transform duration-200 active:scale-[0.98] md:rounded-lg"
        >
          <SignedMediaThumb
            bucket="posts"
            path={p.media_url}
            mediaType={p.media_type}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return <div className="-mt-4 overflow-hidden pb-8 md:-mt-6"><Skeleton className="h-[390px] w-full rounded-none md:h-[360px] md:rounded-2xl" /><div className="space-y-7 px-4 py-6 md:px-6"><div className="space-y-3"><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-3/5" /><div className="grid grid-cols-3 gap-2 pt-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div></div><div className="flex gap-4 overflow-hidden"><Skeleton className="h-28 w-24 shrink-0 rounded-xl" /><Skeleton className="h-28 w-24 shrink-0 rounded-xl" /><Skeleton className="h-28 w-24 shrink-0 rounded-xl" /></div><Skeleton className="h-12 rounded-xl" /><div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 9 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-md" />)}</div></div></div>;
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
        className="glass absolute right-4 top-16 z-20 grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-surface-2 disabled:opacity-60"
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
