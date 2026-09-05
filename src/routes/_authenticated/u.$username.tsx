import { createFileRoute, useNavigate, Link, Outlet, useChildMatches } from "@tanstack/react-router";
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
  Play,
  Repeat2,
  Camera,
  Loader2,
  Menu,
  Pencil,
  Plus,
  Trophy,
  ChevronRight,
} from "lucide-react";


import { VerifiedBadge } from "@/components/verified-badge";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";
import { uploadMedia } from "@/lib/media";
import { StoryViewer } from "@/components/story-viewer";
import { VibeCollections } from "@/components/profile/vibe-collections";


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
  const [vibeViewerOpen, setVibeViewerOpen] = useState(false);

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

  if (profileQuery.isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!profile) return <div className="text-center py-12">Usuário não encontrado.</div>;

  const allPosts = (stats.data?.posts ?? []) as any[];
  // publicações do feed vs. vídeos curtos (reels) são separados por post_kind
  const posts = allPosts.filter((p) => p.post_kind !== "reel");
  const videoPosts = allPosts.filter((p) => p.post_kind === "reel" || p.media_type === "video");

  const activeVibes = vibes.data ?? [];
  const vibeGroups = activeVibes.length
    ? [{ userId: profile.id, profile: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url }, stories: activeVibes }]
    : [];

  return (
    <div className="-mt-4 overflow-hidden md:-mt-6">
      {/* Capa imersiva e identidade */}
      <section className="relative -mx-4 min-h-[430px] overflow-hidden md:mx-0 md:min-h-[390px] md:rounded-2xl">
        {coverUrl ? (
          <img src={coverUrl} alt={`Capa do perfil de ${profile.display_name}`} className="absolute inset-0 h-full w-full object-cover opacity-70" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        {isMe ? <CoverUploader userId={user.id} onDone={() => profileQuery.refetch()} /> : null}

        {isMe ? (
          <Link
            to="/account"
            className="glass absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-surface-2"
            aria-label="Abrir menu da conta"
          >
            <Menu className="h-5 w-5" />
          </Link>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-4 px-5 pb-6 md:flex-row md:items-end md:px-8 md:pb-8">
          <div className="relative shrink-0 self-start">
            <div className="rounded-full bg-background p-1 ring-2 ring-primary shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_32%,transparent)]">
              <UserAvatar avatarPath={profile.avatar_url} displayName={profile.display_name} className="h-24 w-24 md:h-32 md:w-32" />
            </div>
            <span className="absolute bottom-2 right-1 h-5 w-5 rounded-full border-4 border-background bg-primary" aria-label="Perfil ativo" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-3xl font-display font-bold md:text-5xl">{profile.display_name}</h1>
              {profile.is_verified || profile.badge_variant ? <VerifiedBadge size={24} variant={profile.badge_variant ?? "verified"} /> : null}
              {profile.is_creator ? <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold uppercase text-primary">Criador</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-primary">@{profile.username}</span>
              {profile.pronouns ? <span className="text-muted-foreground">· {profile.pronouns}</span> : null}
            </div>
            <div className="mt-4 flex gap-6">
              <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "followers" }} className="group">
                <StatInline label="Seguidores" value={stats.data?.followers ?? 0} />
              </Link>
              <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "following" }} className="group">
                <StatInline label="Seguindo" value={stats.data?.following ?? 0} />
              </Link>
              <StatInline label="Vibes" value={activeVibes.length} />
            </div>
          </div>

          <div className="flex w-full gap-2 md:w-auto">
            {isMe ? (
              <Link to="/settings" className="flex-1 md:flex-none">
                <Button className="w-full gap-2 md:px-7"><Pencil className="h-4 w-4" /> Editar perfil</Button>
              </Link>
            ) : (
              <>
                <Button onClick={() => toggleFollow.mutate()} disabled={toggleFollow.isPending} className="flex-1 md:px-7" variant={stats.data?.isFollowing ? "outline" : "default"}>
                  {stats.data?.isFollowing ? "Seguindo" : "Seguir"}
                </Button>
                <Button onClick={openChat} variant="outline" className="gap-2"><MessageCircle className="h-4 w-4" /> Mensagem</Button>
                <UserActionsMenu targetUserId={profile.id} targetUsername={profile.username} />
              </>
            )}
            <Button onClick={share} variant="outline" size="icon" aria-label="Compartilhar perfil"><Share2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>

      <div className="space-y-8 px-4 py-7 md:px-8">
        <section className="social-card rounded-2xl p-5 md:p-6">
          {profile.bio ? <p className="max-w-3xl whitespace-pre-wrap text-base leading-relaxed md:text-lg">{profile.bio}</p> : <p className="text-muted-foreground">Este perfil ainda não adicionou uma bio.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {profile.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {profile.location}</span> : null}
            {profile.website ? <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><LinkIcon className="h-4 w-4" /> {profile.website.replace(/^https?:\/\//, "")}</a> : null}
            {profile.featured_username ? <Link to="/u/$username" params={{ username: profile.featured_username }} className="font-medium text-primary hover:underline">com @{profile.featured_username}</Link> : null}
          </div>
          {(profile.interests?.length ?? 0) > 0 ? <div className="mt-5 flex flex-wrap gap-2">{profile.interests.map((tag: string) => <span key={tag} className="rounded-full border border-primary/20 bg-background/60 px-3 py-1 text-xs font-medium capitalize text-primary">#{tag}</span>)}</div> : null}
        </section>

        <VibeCollections profileId={profile.id} isMe={isMe} activeVibes={activeVibes} />



        <section>
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-xs font-bold uppercase text-primary">Momentos</p><h2 className="text-xl font-bold">Vibes recentes</h2></div>
            {isMe ? <Link to="/stories/new"><Button variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova Vibe</Button></Link> : null}
          </div>
          <div className="no-scrollbar flex min-h-24 gap-4 overflow-x-auto pb-2">
            {activeVibes.length ? activeVibes.map((vibe: any, index: number) => (
              <button key={vibe.id} type="button" onClick={() => { if (index >= 0) setVibeViewerOpen(true); }} className="group w-20 shrink-0 text-center" aria-label={`Abrir Vibe ${index + 1}`}>
                <span className="block rounded-full bg-primary p-0.5 transition-transform group-hover:scale-105"><SignedMediaThumb bucket="stories" path={vibe.media_url} mediaType={vibe.media_type} alt="" className="h-[74px] w-[74px] rounded-full border-2 border-background object-cover" /></span>
                <span className="mt-2 block truncate text-xs text-muted-foreground">Vibe {index + 1}</span>
              </button>
            )) : <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-border py-6 text-sm text-muted-foreground">Nenhuma Vibe ativa agora.</div>}
          </div>
        </section>

        <div className="social-card grid grid-cols-4 rounded-xl px-2 py-2">
          <StatCard label="Curtidas" value={stats.data?.likesReceived ?? 0} />
          <StatCard label="Views" value={stats.data?.viewsTotal ?? 0} />
          <StatCard label="Posts" value={allPosts.length} />
          <StatCard label="Reposts" value={stats.data?.repostedPosts?.length ?? 0} />
        </div>

        <Link
          to="/achievements/$username"
          params={{ username: profile.username }}
          className="social-card flex items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-surface-2"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Trophy className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Conquistas</span>
            <span className="block truncate text-xs text-muted-foreground">Insígnias e pontos deste perfil</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>


      {/* 9. ABAS + GRADE */}
      {isBlockedPair ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>{iBlocked ? "Você bloqueou este usuário." : "Este perfil não está disponível."}</span>
        </div>
      ) : (
        <Tabs defaultValue="posts">
          <TabsList className={`sticky top-0 z-20 grid w-full ${isMe ? "grid-cols-5" : "grid-cols-3"} rounded-none border-y border-border bg-background/90 p-1 backdrop-blur-xl`}>
            <TabsTrigger value="posts" className="gap-1.5 rounded-lg" aria-label="Posts">
              <Grid3x3 className="h-4 w-4" />
              <span className="hidden sm:inline">Posts</span>
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-1.5 rounded-lg" aria-label="Vídeos">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Vídeos</span>
            </TabsTrigger>
            <TabsTrigger value="reposts" className="gap-1.5 rounded-lg" aria-label="Republicado">
              <Repeat2 className="h-4 w-4" />
              <span className="hidden sm:inline">Republicado</span>
            </TabsTrigger>
            {isMe ? (
              <>
                <TabsTrigger value="likes" className="gap-1.5 rounded-lg" aria-label="Curtidos">
                  <Heart className="h-4 w-4" />
                  <span className="hidden sm:inline">Curtidos</span>
                </TabsTrigger>
                <TabsTrigger value="saved" className="gap-1.5 rounded-lg" aria-label="Salvos">
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
      {vibeViewerOpen && vibeGroups.length ? <StoryViewer groups={vibeGroups} startIndex={0} viewerId={user.id} onClose={() => setVibeViewerOpen(false)} /> : null}
    </div>
  );
}

function StatInline({ label, value }: { label: string; value: number }) {
  return <span className="block"><strong className="block text-lg font-bold tabular text-foreground">{formatCount(value)}</strong><span className="text-xs text-muted-foreground">{label}</span></span>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1 py-1 text-center">
      <div className="text-sm font-semibold tabular leading-tight">{formatCount(value)}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function PostGrid({ posts, empty }: { posts: any[]; empty: string }) {
  if (!posts.length) return <div className="text-center text-sm text-muted-foreground py-8">{empty}</div>;
  return (
    <div className="grid grid-cols-3 gap-1.5 md:gap-3">
      {posts.map((p) => (
        <Link
          key={p.id}
          to="/p/$id"
          params={{ id: p.id }}
          className="group aspect-square overflow-hidden rounded-lg bg-[color:var(--surface-2)] ring-1 ring-border"
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
