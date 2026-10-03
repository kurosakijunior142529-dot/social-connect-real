import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VerifiedName } from "@/components/verified-badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage } from "@/components/signed-image";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, Megaphone, Plus, Tv, Flame, Search, X, Mic, Camera, Video, Sparkles, Lock, Unlock, Pin, BellOff } from "lucide-react";
import { OnlineBubbles } from "@/components/presence/online-bubbles";
import { useBlocks } from "@/hooks/use-blocks";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ConversationActionsSheet,
  SwipeRow,
  VaultPinSheet,
  EMPTY_PREFS,
  savePrefs,
  setMute,
  type ConvPrefs,
} from "@/components/chat/conversation-actions";

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "pinned", label: "Fixadas" },
  { id: "archived", label: "Arquivadas" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/messages/")({
  component: MessagesPage,
});

const TABS = [
  { id: "direct", label: "Diretas" },
  { id: "group", label: "Grupos" },
  { id: "channel", label: "Canais" },
] as const;

function MessagesPage() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("direct");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [vaultOpen, setVaultOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div>
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-[26px] font-display font-bold tracking-tight">Conversas</h1>
          <div className="flex items-center gap-2">
          <Link
            to="/ai"
            aria-label="Vibely AI"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[color:var(--surface-2)] text-foreground transition active:scale-95"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Novo"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[color:var(--surface-2)] text-primary transition hover:bg-surface active:scale-95"
              >
                <Plus className="h-5 w-5" strokeWidth={2.4} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate({ to: "/chats/new", search: { type: "group" } })}>
                <Users className="h-4 w-4 mr-2" /> Novo grupo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/chats/new", search: { type: "channel" } })}>
                <Megaphone className="h-4 w-4 mr-2" /> Novo canal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/watch" })}>
                <Tv className="h-4 w-4 mr-2" /> Sala de assistir (YouTube)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        <div className="px-4 pb-2">
          <label className="flex h-10 items-center gap-2 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface)]/70 px-3.5 backdrop-blur">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conversas"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Limpar busca" className="text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-[13px] transition-all active:scale-95",
                  active
                    ? "border-transparent bg-foreground font-semibold text-background"
                    : "border-[color:var(--hairline)] font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <OnlineBubbles currentUserId={user.id} />

      {tab === "direct" && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-2 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[12px] transition active:scale-95",
                filter === f.id ? "bg-[color:var(--surface-2)] font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => (vaultOpen ? setVaultOpen(false) : setPinOpen(true))}
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[12px] transition active:scale-95",
              vaultOpen ? "bg-[color:var(--surface-2)] font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {vaultOpen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} Cofre
          </button>
        </div>
      )}

      <div className="pt-1">
        {tab === "direct" && <DirectList userId={user.id} q={q} filter={filter} vault={vaultOpen} />}
        {tab === "group" && <ChatList userId={user.id} type="group" q={q} />}
        {tab === "channel" && <ChatList userId={user.id} type="channel" q={q} />}
      </div>
      <VaultPinSheet open={pinOpen} onOpenChange={setPinOpen} userId={user.id} onUnlocked={() => setVaultOpen(true)} />
    </div>
  );
}

function DirectList({ userId, q }: { userId: string; q: string }) {
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;

  const query = useQuery({
    queryKey: ["conversations", userId, hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    queryFn: async () => {
      const { data: convs, error } = await supabase
        .from("conversations")
        .select("*")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const list = (convs ?? []).filter((c) => {
        const other = c.user_a === userId ? c.user_b : c.user_a;
        return !hidden?.has(other);
      });
      const otherIds = list.map((c) => (c.user_a === userId ? c.user_b : c.user_a));
      const [profilesRes, lastMessagesRes, streaksRes] = await Promise.all([
        otherIds.length
          ? supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", otherIds)
          : Promise.resolve({ data: [] as any[] }),
        list.length
          ? supabase
              .from("messages")
              .select("conversation_id, content, created_at, sender_id, media_type, read_at")
              .in("conversation_id", list.map((c) => c.id))
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        list.length
          ? (supabase as any)
              .from("chat_streaks")
              .select("conversation_id, streak, last_both_day")
              .in("conversation_id", list.map((c) => c.id))
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const lastByConv = new Map<string, any>();
      for (const m of lastMessagesRes.data ?? []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      }
      // Streak vale se o último dia em que ambos falaram foi hoje ou ontem (horário de SP)
      const spToday = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const spYesterday = new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const streakByConv = new Map<string, number>();
      for (const s of (streaksRes.data ?? []) as any[]) {
        if (s.last_both_day === spToday || s.last_both_day === spYesterday) {
          streakByConv.set(s.conversation_id, s.streak ?? 0);
        }
      }
      return list.map((c) => {
        const otherId = c.user_a === userId ? c.user_b : c.user_a;
        return { ...c, other: profiles.get(otherId), last: lastByConv.get(c.id), streak: streakByConv.get(c.id) ?? 0 };
      });
    },
  });

  const term = q.trim().toLowerCase();
  const rows = (query.data ?? []).filter(
    (c) => !term || `${c.other?.display_name ?? ""} ${c.other?.username ?? ""}`.toLowerCase().includes(term),
  );
  if (query.isLoading) return <ListSkeleton />;
  if (term && !rows.length) return <EmptyState icon={<Search className="h-6 w-6" strokeWidth={1.6} />} title="Nada encontrado" hint="Tente outro nome." />;
  if (!query.data?.length) {
    return (
      <EmptyState
        icon={<MessageCircle className="h-6 w-6" strokeWidth={1.6} />}
        title="Nenhuma conversa direta"
        hint="Encontre pessoas no Explorar e converse pelo perfil."
      />
    );
  }
  return (
    <ul className="space-y-1 px-2 pb-4 pt-1">
      {rows.map((c) => {
        const unread = !!c.last && c.last.sender_id !== userId && !c.last.read_at;
        return (
          <li key={c.id}>
            <Link
              to="/messages/$conversationId"
              params={{ conversationId: c.id }}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all hover:bg-[color:var(--surface)]/60 active:scale-[0.99] active:bg-[color:var(--surface)]"
            >
              <UserAvatar avatarPath={c.other?.avatar_url} displayName={c.other?.display_name ?? "?"} verified={!!(c.other as any)?.is_verified} badgeVariant={((c.other as any)?.badge_variant) ?? null} className="h-12 w-12 rounded-full border border-white/10" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="truncate text-[15px] font-semibold flex items-center gap-1.5">
                    <VerifiedName name={c.other?.display_name} verified={(c.other as any)?.is_verified} badgeVariant={(c.other as any)?.badge_variant} />
                    {c.streak > 0 && (
                      <span
                        title={`Sequência de ${c.streak} ${c.streak === 1 ? "dia" : "dias"} conversando`}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[color:var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        <Flame className="h-3 w-3 text-orange-400" fill="currentColor" />
                        {c.streak}
                      </span>
                    )}
                  </div>
                  {c.last ? (
                    <div className="text-[10px] shrink-0 tabular uppercase tracking-widest text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(c.last.created_at), { locale: ptBR })}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("flex-1 truncate text-[13px] leading-snug", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {c.last ? <Preview m={c.last} mine={c.last.sender_id === userId} /> : "Diga oi 👋"}
                  </div>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>

  );
}

function ChatList({ userId, type, q }: { userId: string; type: "group" | "channel"; q: string }) {
  const query = useQuery({
    queryKey: ["chats", type, userId],
    queryFn: async () => {
      const { data: members } = await (supabase as any)
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);
      const ids = ((members ?? []) as any[]).map((m) => m.chat_id);
      if (!ids.length) return [];
      const { data: chats } = await (supabase as any)
        .from("chats")
        .select("*")
        .in("id", ids)
        .eq("type", type)
        .order("last_message_at", { ascending: false });
      const list = (chats ?? []) as any[];
      const { data: lastMessages } = list.length
        ? await (supabase as any)
            .from("chat_messages")
            .select("chat_id, content, created_at, sender_id, media_type")
            .in("chat_id", list.map((c) => c.id))
            .order("created_at", { ascending: false })
        : { data: [] as any[] };
      const lastByChat = new Map<string, any>();
      for (const m of (lastMessages ?? []) as any[]) {
        if (!lastByChat.has(m.chat_id)) lastByChat.set(m.chat_id, m);
      }
      return list.map((c) => ({ ...c, last: lastByChat.get(c.id) }));
    },
  });

  const term = q.trim().toLowerCase();
  const rows = ((query.data ?? []) as any[]).filter((c) => !term || String(c.title ?? "").toLowerCase().includes(term));
  if (query.isLoading) return <ListSkeleton />;
  if (term && !rows.length) return <EmptyState icon={<Search className="h-6 w-6" strokeWidth={1.6} />} title="Nada encontrado" hint="Tente outro nome." />;
  if (!query.data?.length) {
    return (
      <EmptyState
        icon={type === "group" ? <Users className="h-6 w-6" strokeWidth={1.6} /> : <Megaphone className="h-6 w-6" strokeWidth={1.6} />}
        title={type === "group" ? "Você não está em nenhum grupo" : "Nenhum canal ainda"}
        hint={type === "group" ? "Crie um grupo com seus amigos ou espere ser convidado." : "Crie um canal para transmitir suas ideias."}
      />
    );
  }
  return (
    <ul className="space-y-1 px-2 pb-4 pt-1">
      {rows.map((c: any) => {
        return (
          <li key={c.id}>
            <Link
              to="/chats/$id"
              params={{ id: c.id }}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all hover:bg-[color:var(--surface)]/60 active:scale-[0.99] active:bg-[color:var(--surface)]"
            >
              {c.avatar_url ? (
                <div className="h-12 w-12 rounded-full overflow-hidden bg-[color:var(--surface-2)] border border-white/10">
                  <SignedImage bucket="chats" path={c.avatar_url} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--surface-2)] border border-white/10 text-foreground">
                  {type === "group" ? <Users className="h-5 w-5" strokeWidth={1.6} /> : <Megaphone className="h-5 w-5" strokeWidth={1.6} />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="truncate text-[15px] font-semibold">{c.title}</div>
                  {c.last ? (
                    <div className="text-[10px] shrink-0 tabular uppercase tracking-widest text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(c.last.created_at), { locale: ptBR })}
                    </div>
                  ) : null}
                </div>
                <div className="text-[13px] truncate leading-snug text-muted-foreground">
                  {c.last ? <Preview m={c.last} mine={c.last.sender_id === userId} /> : c.description ?? (type === "group" ? "Grupo criado" : "Canal criado")}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Preview({ m, mine }: { m: any; mine: boolean }) {
  const t = String(m.media_type ?? "");
  const icon = t.startsWith("audio") ? <Mic className="h-3.5 w-3.5" /> : t.startsWith("image") ? <Camera className="h-3.5 w-3.5" /> : t.startsWith("video") ? <Video className="h-3.5 w-3.5" /> : null;
  const label = t.startsWith("audio") ? "Áudio" : t.startsWith("image") ? "Foto" : t.startsWith("video") ? "Vídeo" : null;
  const text = m.content || label || "Mensagem";
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate">
      {mine && <span className="shrink-0 text-muted-foreground">Você:</span>}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{text}</span>
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 px-3 pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3.5 rounded-[24px] p-3.5">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32 rounded" />
            <Skeleton className="h-3 w-48 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="mx-4 mt-6 rounded-2xl bg-[color:var(--surface)] p-8 text-center space-y-3">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground">{icon}</div>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}
