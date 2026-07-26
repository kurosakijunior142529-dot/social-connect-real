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
import { MessageCircle, Settings, Ban, MapPin, LinkIcon, Grid3x3, Bookmark, Heart, Sparkles, Camera, Loader2, Wallet as WalletIcon, ChevronRight, Crown, CreditCard, Landmark, ArrowDownToLine, ReceiptText, Bell, ShieldCheck, Lock, HelpCircle, LogOut } from "lucide-react";
import { useNavigate as useNav2 } from "@tanstack/react-router";
import { useQueryClient as useQC2 } from "@tanstack/react-query";
import { signOutAndClearSession } from "@/lib/auth-session";

import { VerifiedBadge } from "@/components/verified-badge";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";
import { uploadMedia } from "@/lib/media";

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

  const profile: any = profileQuery.data;
  const isMe = profile?.id === user.id;
  const blocks = useBlocks();
  const iBlocked = profile ? blocks.data?.blocked.has(profile.id) ?? false : false;
  const blockedMe = profile ? blocks.data?.blockedBy.has(profile.id) ?? false : false;
  const isBlockedPair = iBlocked || blockedMe;

  const { data: coverUrl } = useSignedUrl("covers", profile?.cover_url ?? null);

  const stats = useQuery({
    queryKey: ["profile-stats", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [posts, followers, following, mine, liked] = await Promise.all([
        supabase.from("posts").select("id, media_url, media_type").eq("author_id", profile!.id).order("created_at", { ascending: false }),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile!.id),
        supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile!.id),
        supabase.from("follows").select("*").match({ follower_id: user.id, following_id: profile!.id }).maybeSingle(),
        profile!.id === user.id
          ? supabase.from("likes").select("post_id").eq("user_id", user.id).limit(60)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      let likedPosts: any[] = [];
      if (profile!.id === user.id && liked.data && liked.data.length) {
        const ids = liked.data.map((l: any) => l.post_id);
        const { data } = await supabase.from("posts").select("id, media_url, media_type").in("id", ids);
        likedPosts = data ?? [];
      }
      return {
        posts: posts.data ?? [],
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        isFollowing: !!mine.data,
        likedPosts,
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

  if (profileQuery.isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!profile) return <div className="text-center py-12">Usuário não encontrado.</div>;

  return (
    <div className="-mt-4 md:-mt-10 space-y-6">
      {/* Cover */}
      <div className="relative -mx-4 h-44 md:h-56 md:rounded-3xl overflow-hidden">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/30 via-secondary to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        {isMe ? <CoverUploader userId={user.id} onDone={() => profileQuery.refetch()} /> : null}
      </div>

      {/* Header */}
      <div className="relative -mt-16 px-1 flex items-end justify-between gap-3">
        <div className="rounded-full ring-4 ring-background bg-background">
          <UserAvatar
            avatarPath={profile.avatar_url}
            displayName={profile.display_name}
            className="h-24 w-24"
          />
        </div>
        <div className="flex gap-2 pb-1">
          {isMe ? (
            <Link to="/settings">
              <Button variant="outline" className="rounded-full gap-2">
                <Settings className="h-4 w-4" /> Editar
              </Button>
            </Link>
          ) : (
            <>
              <Button
                onClick={() => toggleFollow.mutate()}
                className={
                  stats.data?.isFollowing
                    ? "rounded-full"
                    : "rounded-full bg-gradient-brand hover:opacity-90 shadow-elegant"
                }
                variant={stats.data?.isFollowing ? "outline" : "default"}
              >
                {stats.data?.isFollowing ? "Seguindo" : "Seguir"}
              </Button>
              <Button onClick={openChat} variant="outline" size="icon" className="rounded-full">
                <MessageCircle className="h-4 w-4" />
              </Button>
              <UserActionsMenu targetUserId={profile.id} targetUsername={profile.username} />
            </>
          )}
        </div>
      </div>

      {/* Identity */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-display font-black tracking-tight">{profile.display_name}</h1>
          {profile.is_verified ? <VerifiedBadge size={20} /> : null}
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
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.location}</span>
          ) : null}
          {profile.website ? (
            <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <LinkIcon className="h-3.5 w-3.5" /> {profile.website.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Posts" value={stats.data?.posts.length ?? 0} />
        <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "followers" }}>
          <StatCard label="Seguidores" value={stats.data?.followers ?? 0} />
        </Link>
        <Link to="/u/$username/follows" params={{ username: profile.username }} search={{ tab: "following" }}>
          <StatCard label="Seguindo" value={stats.data?.following ?? 0} />
        </Link>
      </div>

      {isMe ? <WalletCard /> : null}




      {isBlockedPair ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>
            {iBlocked ? "Você bloqueou este usuário." : "Este perfil não está disponível."}
          </span>
        </div>
      ) : (
        <Tabs defaultValue="posts">
          <TabsList className="w-full grid grid-cols-3 rounded-full glass p-1">
            <TabsTrigger value="posts" className="rounded-full gap-1.5">
              <Grid3x3 className="h-4 w-4" /> Posts
            </TabsTrigger>
            <TabsTrigger value="media" className="rounded-full gap-1.5">
              <Sparkles className="h-4 w-4" /> Mídia
            </TabsTrigger>
            <TabsTrigger value="likes" disabled={!isMe} className="rounded-full gap-1.5">
              {isMe ? <Heart className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              {isMe ? "Curtidos" : "Priv."}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4">
            <PostGrid posts={stats.data?.posts ?? []} empty="Nenhum post ainda." />
          </TabsContent>
          <TabsContent value="media" className="mt-4">
            <PostGrid posts={(stats.data?.posts ?? []).filter((p: any) => p.media_url)} empty="Sem mídia." />
          </TabsContent>
          <TabsContent value="likes" className="mt-4">
            {isMe ? <PostGrid posts={stats.data?.likedPosts ?? []} empty="Você ainda não curtiu nada." /> : null}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function WalletCard() {
  const wallet = useQuery({
    queryKey: ["profile-wallet-card"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { coins: 0, rate: 0.0645, pending: 0 };
      const [coinsRes, settingsRes, wdRes] = await Promise.all([
        supabase.from("user_coins").select("balance").eq("user_id", uid).maybeSingle(),
        supabase.from("app_settings").select("coin_to_brl_rate").maybeSingle(),
        supabase.from("withdrawals").select("id").eq("user_id", uid).eq("status", "pending"),
      ]);
      return {
        coins: coinsRes.data?.balance ?? 0,
        rate: Number(settingsRes.data?.coin_to_brl_rate ?? 0.0645),
        pending: wdRes.data?.length ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const coins = wallet.data?.coins ?? 0;
  const brl = coins * (wallet.data?.rate ?? 0.0645);

  return (
    <Link
      to="/wallet"
      className="block rounded-3xl border border-[color:var(--hairline)] bg-gradient-to-br from-primary/15 via-[color:var(--surface)] to-[color:var(--surface)] p-4"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <WalletIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Carteira</div>
          <div className="text-[11px] text-muted-foreground">Saldo, ganhos, saques, Pix e conta bancária</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold tabular">{coins.toLocaleString("pt-BR")}</div>
          <div className="text-[11px] text-primary tabular">
            {brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      {wallet.data?.pending ? (
        <div className="mt-3 rounded-xl bg-[color:var(--surface-2)] px-3 py-2 text-[11px] text-muted-foreground">
          {wallet.data.pending} saque(s) em análise
        </div>
      ) : null}
    </Link>
  );
}


function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl px-3 py-3 text-center">
      <div className="text-xl font-display font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
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
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur px-3 py-1.5 text-xs text-white hover:bg-black/70 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        Alterar capa
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
    </>
  );
}
