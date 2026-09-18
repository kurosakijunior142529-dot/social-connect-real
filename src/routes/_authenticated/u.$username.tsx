import { createFileRoute, useNavigate, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  Crown,
  ArrowLeft,
  Music2,
  Radio,
  ImageIcon,
  Activity,
  Volume2,
} from "lucide-react";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";


import { VerifiedBadge } from "@/components/verified-badge";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";
import { uploadMedia } from "@/lib/media";

import { VibeCollections } from "@/components/profile/vibe-collections";
import { ProfileRealities } from "@/components/profile/profile-realities";


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
      const [posts, followers, following, mine, lives] = await Promise.all([
        supabase
          .from("posts")
          .select("id, media_url, media_type, view_count, post_kind, created_at, music_track_id, music_tracks(title, artist, cover_url)")
          .eq("author_id", profile!.id)
          .order("created_at", { ascending: false }),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile!.id),
        supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile!.id),
        supabase.from("follows").select("*").match({ follower_id: user.id, following_id: profile!.id }).maybeSingle(),
        supabase
          .from("lives")
          .select("id, title, thumbnail_url, status, viewer_count, created_at")
          .eq("host_id", profile!.id)
          .order("created_at", { ascending: false })
          .limit(24),
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
        lives: lives.data ?? [],
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
  const photoPosts = allPosts.filter((p) => p.media_type === "image");

  const activeVibes = vibes.data ?? [];
  const liveItems = (stats.data?.lives ?? []) as any[];
  const activeLive = liveItems.find((item) => item.status === "live");
  const musicalPost = allPosts.find((item) => item.music_tracks);
  const music = Array.isArray(musicalPost?.music_tracks) ? musicalPost.music_tracks[0] : musicalPost?.music_tracks;
  const profileInterests = (profile.interests ?? []) as string[];

  return (
    <div className="profile-enter -mt-4 min-w-0 overflow-hidden pb-6 md:-mt-6">
      <section className="relative h-[310px] overflow-hidden border-b border-border/60 sm:h-[340px] md:h-[390px] md:rounded-2xl md:border">
        {coverUrl ? (
          <img src={coverUrl} alt={`Capa do perfil de ${profile.display_name}`} className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" />
        ) : (
          <div className="profile-cover-fallback absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-transparent to-background" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/65 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 pt-3 sm:px-5 sm:pt-5">
          <Button type="button" variant="secondary" size="icon" className="glass h-9 w-9 shrink-0 rounded-full" onClick={() => window.history.back()} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span />
          <div className="flex shrink-0 items-center gap-2">
            {isMe ? <CoverUploader userId={user.id} onDone={() => profileQuery.refetch()} /> : null}
            <Button type="button" variant="secondary" size="icon" className="glass h-9 w-9 rounded-full" onClick={share} aria-label="Compartilhar perfil">
              <Share2 className="h-4 w-4" />
            </Button>
            {!isMe ? <UserActionsMenu targetUserId={profile.id} targetUsername={profile.username} className="glass grid h-9 w-9 place-items-center rounded-full p-0 text-foreground" /> : null}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 sm:px-6 md:px-8 md:pb-7">
          <div className="relative w-fit">
            <div className="rounded-full bg-background/95 p-1 ring-1 ring-primary/35 shadow-elegant">
              <UserAvatar avatarPath={profile.avatar_url} displayName={profile.display_name} className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32" />
            </div>
            <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full border-[3px] border-background bg-primary" aria-label="Perfil ativo" />
          </div>
        </div>
      </section>

      <div className="space-y-8 px-4 py-5 sm:px-6 md:px-8 md:py-7">
        <section className="space-y-5 border-b border-border/50 pb-8">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-3xl font-bold sm:text-4xl">{profile.display_name}</h1>
              {profile.is_verified || profile.badge_variant ? <span className="shrink-0"><VerifiedBadge size={17} variant={profile.badge_variant ?? "verified"} animated={false} /></span> : null}
            </div>
            <p className="mt-1 truncate text-sm font-medium text-muted-foreground">@{profile.username}{profile.pronouns ? ` · ${profile.pronouns}` : ""}</p>
            {profile.bio ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-[15px] leading-6 text-foreground/90 md:text-base md:leading-7">{profile.bio}</p> : <p className="mt-3 text-sm text-muted-foreground">Este perfil ainda não adicionou uma bio.</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {isSupporter ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold text-primary"><Heart className="h-3 w-3 fill-primary" /> Apoiador</span> : null}
              {profile.is_creator ? <span className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold text-primary">Criador</span> : null}
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
            {isMe ? (
              <Link to="/settings" className="min-w-0 sm:w-52">
                <Button className="h-11 w-full gap-2 rounded-xl"><Pencil className="h-4 w-4" /> Editar perfil</Button>
              </Link>
            ) : (
              <>
                <Button onClick={() => toggleFollow.mutate()} disabled={toggleFollow.isPending} className="h-11 min-w-0 rounded-xl sm:w-44" variant={stats.data?.isFollowing ? "outline" : "default"}>
                  {stats.data?.isFollowing ? "Seguindo" : "Seguir"}
                </Button>
                <Button onClick={openChat} variant="outline" className="h-11 shrink-0 gap-2 rounded-xl"><MessageCircle className="h-4 w-4" /> <span className="hidden min-[370px]:inline">Mensagem</span></Button>
              </>
            )}
            <Button onClick={share} variant="outline" className="h-11 shrink-0 gap-2 rounded-xl px-4" aria-label="Compartilhar perfil"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Compartilhar</span></Button>
            {!isMe && profile.is_creator ? <Button onClick={() => openCheckout({ priceId: "channel_sub_monthly", creatorId: profile.id })} variant={supporting ? "secondary" : "outline"} className="col-span-2 h-11 shrink-0 gap-2 rounded-xl sm:col-span-1"><Crown className="h-4 w-4" /> {supporting ? "Apoiador" : "Apoiar"}</Button> : null}
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/60 py-4 text-center">
            <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "followers" }} className="min-w-0 px-2"><strong className="block truncate text-lg font-bold tabular">{formatCount(stats.data?.followers ?? 0)}</strong><span className="text-[11px] text-muted-foreground">Seguidores</span></Link>
            <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "following" }} className="min-w-0 px-2"><strong className="block truncate text-lg font-bold tabular">{formatCount(stats.data?.following ?? 0)}</strong><span className="text-[11px] text-muted-foreground">Seguindo</span></Link>
            <span className="min-w-0 px-2"><strong className="block truncate text-lg font-bold tabular">{formatCount(stats.data?.likesReceived ?? 0)}</strong><span className="text-[11px] text-muted-foreground">Curtidas</span></span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {profile.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {profile.location}</span> : null}
            {profile.website ? <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-primary hover:underline"><LinkIcon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{profile.website.replace(/^https?:\/\//, "")}</span></a> : null}
            {profile.featured_username ? <Link to="/u/$username" params={{ username: profile.featured_username }} className="font-medium text-muted-foreground transition-colors hover:text-primary">Conexão vibrante com @{profile.featured_username}</Link> : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{formatCount(stats.data?.viewsTotal ?? 0)} visualizações</span><span aria-hidden>·</span><span>{formatCount(activeVibes.length)} Vibes ativas</span></div>
        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div><p className="text-xs font-semibold text-primary">Momento</p><h2 className="mt-1 text-xl font-bold">Vibe atual</h2></div>{activeLive ? <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />Ao vivo</span> : null}</div>
          <div className="profile-current-vibe grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border border-border/60 p-3 sm:p-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-primary">
              {music?.cover_url ? <img src={music.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : activeLive ? <Radio className="h-6 w-6" /> : <Music2 className="h-6 w-6" />}
            </div>
            <div className="min-w-0"><p className="text-[11px] font-semibold text-primary">{activeLive ? "Transmitindo agora" : music ? "Trilha da criação mais recente" : "Agora estou"}</p><p className="mt-1 truncate text-sm font-bold">{activeLive?.title ?? music?.title ?? "Nenhuma atividade compartilhada"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{music?.artist ?? (activeLive ? `${formatCount(activeLive.viewer_count ?? 0)} assistindo` : "Compartilhe uma Vibe para mostrar seu momento")}</p></div>
            <div className="flex h-8 shrink-0 items-end gap-0.5" aria-label={activeLive || music ? "Áudio ativo" : "Sem áudio ativo"}>{[10,18,13,24].map((height, index) => <span key={height} className={`vibe-eq w-1 rounded-full ${activeLive || music ? "bg-primary" : "bg-muted-foreground/30"}`} style={{ height, animationDelay: `${index * 120}ms` }} />)}</div>
          </div>
        </section>

        <section className="space-y-4">
          <div><p className="text-xs font-semibold text-primary">Interesses</p><h2 className="mt-1 text-xl font-bold">Minha Vibe</h2></div>
          {profileInterests.length ? <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{profileInterests.map((tag) => <span key={tag} className="shrink-0 rounded-full border border-border/70 bg-surface px-3 py-2 text-xs font-medium capitalize text-foreground transition hover:border-primary/30 hover:text-primary">#{tag.replace(/^#/, "")}</span>)}</div> : <p className="text-sm text-muted-foreground">Nenhum interesse compartilhado ainda.</p>}
        </section>

        <VibeCollections profileId={profile.id} isMe={isMe} activeVibes={activeVibes} />

        <ProfileRealities profileId={profile.id} isMe={isMe} />

      {isBlockedPair ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>{iBlocked ? "Você bloqueou este usuário." : "Este perfil não está disponível."}</span>
        </div>
      ) : (
          <Tabs defaultValue="all" className="profile-tabs border-t border-border/50 pt-6">
          <div className="mb-4"><p className="text-xs font-semibold text-primary">Criações</p><h2 className="mt-1 text-xl font-bold">Conteúdo</h2></div>
          <TabsList className="no-scrollbar sticky top-0 z-20 flex h-11 w-full justify-start gap-1 overflow-x-auto rounded-none border-0 border-b border-border/60 bg-background/90 p-0 backdrop-blur-xl">
            <TabsTrigger value="all" className="h-11 shrink-0 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary">Tudo</TabsTrigger>
            <TabsTrigger value="videos" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><Play className="h-3.5 w-3.5" />Vídeos</TabsTrigger>
            <TabsTrigger value="photos" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><ImageIcon className="h-3.5 w-3.5" />Fotos</TabsTrigger>
            <TabsTrigger value="vibes" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><Activity className="h-3.5 w-3.5" />Vibes</TabsTrigger>
            <TabsTrigger value="lives" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><Radio className="h-3.5 w-3.5" />Lives</TabsTrigger>
            <TabsTrigger value="reposts" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><Repeat2 className="h-3.5 w-3.5" />Republicados</TabsTrigger>
            {isMe ? <TabsTrigger value="likes" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><Heart className="h-3.5 w-3.5" />Curtidos</TabsTrigger> : null}
            {isMe ? <TabsTrigger value="saved" className="h-11 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"><Bookmark className="h-3.5 w-3.5" />Salvos</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <PostGrid posts={posts} empty="Nenhum post ainda." />
          </TabsContent>
          <TabsContent value="videos" className="mt-4">
            <PostGrid posts={videoPosts} empty="Nenhum vídeo publicado." />
          </TabsContent>
          <TabsContent value="photos" className="mt-4"><PostGrid posts={photoPosts} empty="Nenhuma foto publicada." /></TabsContent>
          <TabsContent value="vibes" className="mt-4"><VibeGrid vibes={activeVibes} /></TabsContent>
          <TabsContent value="lives" className="mt-4"><LiveGrid lives={liveItems} /></TabsContent>
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

function PostGrid({ posts, empty }: { posts: any[]; empty: string }) {
  if (!posts.length) return <div className="grid min-h-32 place-items-center px-5 text-center text-sm text-muted-foreground"><span className="grid gap-2 place-items-center"><Grid3x3 className="h-6 w-6 text-muted-foreground/50" />{empty}</span></div>;
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3">
      {posts.map((p) => (
        <Link
          key={p.id}
          to="/p/$id"
          params={{ id: p.id }}
          className="group relative aspect-square overflow-hidden rounded-md bg-[color:var(--surface-2)] ring-1 ring-border/60 transition duration-200 hover:ring-primary/20 active:scale-[0.98] md:rounded-lg"
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
  return <div className="-mt-4 min-w-0 overflow-hidden pb-8 md:-mt-6"><Skeleton className="h-[330px] w-full rounded-none md:h-[340px] md:rounded-2xl" /><div className="space-y-6 px-4 py-5 sm:px-6 md:px-8"><div className="space-y-3"><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-3/5" /><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-4 w-2/3" /></div><div className="flex gap-4 overflow-hidden"><Skeleton className="h-28 w-24 shrink-0 rounded-xl" /><Skeleton className="h-28 w-24 shrink-0 rounded-xl" /><Skeleton className="h-28 w-24 shrink-0 rounded-xl" /></div><Skeleton className="h-12 rounded-none" /><div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 9 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-md" />)}</div></div></div>;
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
        className="glass absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full text-foreground shadow-sm hover:bg-surface-2 disabled:opacity-60 sm:right-4 sm:top-4"
        aria-label="Trocar capa"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
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
