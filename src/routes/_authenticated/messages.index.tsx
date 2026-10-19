import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VerifiedName } from "@/components/verified-badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage } from "@/components/signed-image";
import { formatDistanceToNowStrict } from "@/lib/safe-date";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, Megaphone, Plus, Tv, Flame, Search, X, Mic, Camera, Video, Sparkles, Lock, Unlock, Pin, BellOff, CheckCheck } from "lucide-react";
import { OnlineBubbles } from "@/components/presence/online-bubbles";
import { useBlocks } from "@/hooks/use-blocks";
import { useState } from "react";
import { ChannelDiscover, useChannelCounts, formatMembers } from "@/components/chat/channel-discover";
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
  head: () => ({ meta: [
    { title: "Conversas | Vibely" },
    { name: "description", content: "Suas conversas privadas, grupos e canais no Vibely." },
    { property: "og:title", content: "Conversas | Vibely" },
    { property: "og:description", content: "Suas conversas privadas, grupos e canais no Vibely." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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

      {(
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
          {tab === "direct" && <button
            onClick={() => (vaultOpen ? setVaultOpen(false) : setPinOpen(true))}
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[12px] transition active:scale-95",
              vaultOpen ? "bg-[color:var(--surface-2)] font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {vaultOpen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} Cofre
          </button>}
        </div>
      )}
      <div className="pt-1">

        {tab === "direct" && <DirectList userId={user.id} q={q} filter={filter} vault={vaultOpen} />}
        {tab === "group" && <ChatList userId={user.id} type="group" q={q} filter={filter} />}
        {tab === "channel" && (
          <>
            {!q && filter === "all" && <ChannelDiscover />}
            <h2 className="px-4 pt-1 pb-1 font-display text-[17px] font-semibold tracking-tight">Seus canais</h2>
            <ChatList userId={user.id} type="channel" q={q} filter={filter} />
          </>
        )}
      </div>
      <VaultPinSheet open={pinOpen} onOpenChange={setPinOpen} userId={user.id} onUnlocked={() => setVaultOpen(true)} />
    </div>
  );
}

function DirectList({ userId, q, filter, vault }: { userId: string; q: string; filter: Filter; vault: boolean }) {
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
              .select("conversation_id, content, created_at, sender_id, media_type, read_at, kind")
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
      const unreadByConv = new Map<string, number>();
      for (const m of lastMessagesRes.data ?? []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
        if (m.sender_id !== userId && !m.read_at) unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
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
        return { ...c, other: profiles.get(otherId), last: lastByConv.get(c.id), streak: streakByConv.get(c.id) ?? 0, unreadCount: unreadByConv.get(c.id) ?? 0 };
      });
    },
  });

  const qc = useQueryClient();
  const prefsQ = useQuery({
    queryKey: ["conv-prefs", userId],
    queryFn: async () => {
      const [p, m] = await Promise.all([
        supabase.from("conversation_prefs").select("*").eq("user_id", userId),
        supabase.from("muted_conversations").select("conversation_id, until").eq("user_id", userId),
      ]);
      const prefs = new Map<string, ConvPrefs>();
      for (const r of p.data ?? []) prefs.set(r.conversation_id, r as ConvPrefs);
      const now = Date.now();
      const muted = new Set((m.data ?? []).filter((r) => !r.until || new Date(r.until).getTime() > now).map((r) => r.conversation_id));
      return { prefs, muted };
    },
  });
  const [sheetFor, setSheetFor] = useState<string | null>(null);

  const prefsOf = (id: string) => prefsQ.data?.prefs.get(id) ?? EMPTY_PREFS;
  const isMuted = (id: string) => !!prefsQ.data?.muted.has(id);
  const isUnread = (c: any) => prefsOf(c.id).marked_unread || (!!c.last && c.last.sender_id !== userId && !c.last.read_at);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["conv-prefs", userId] });
    qc.invalidateQueries({ queryKey: ["conversations", userId] });
  };

  async function run(id: string, a: Parameters<React.ComponentProps<typeof ConversationActionsSheet>["onAction"]>[0]) {
    const p = prefsOf(id);
    try {
      switch (a) {
        case "pin":
          await savePrefs(userId, id, { pinned_at: p.pinned_at ? null : new Date().toISOString() });
          toast.success(p.pinned_at ? "Desafixada" : "Fixada no topo");
          break;
        case "unread":
          await savePrefs(userId, id, { marked_unread: true });
          break;
        case "read":
          await savePrefs(userId, id, { marked_unread: false });
          await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("conversation_id", id).neq("sender_id", userId).is("read_at", null);
          await qc.invalidateQueries({ queryKey: ["dm-unread", userId] });
          break;
        case "mute8h":
          await setMute(userId, id, new Date(Date.now() + 8 * 3600e3).toISOString()); toast.success("Silenciada por 8 horas"); break;
        case "mute1w":
          await setMute(userId, id, new Date(Date.now() + 7 * 86400e3).toISOString()); toast.success("Silenciada por 1 semana"); break;
        case "muteAlways":
          await setMute(userId, id, null); toast.success("Silenciada"); break;
        case "unmute":
          await setMute(userId, id, false); toast.success("Notificações reativadas"); break;
        case "archive":
          await savePrefs(userId, id, { archived: !p.archived });
          toast.success(p.archived ? "Voltou para a lista" : "Arquivada");
          break;
        case "hide":
          await savePrefs(userId, id, { hidden: !p.hidden });
          toast.success(p.hidden ? "Saiu do Cofre" : "Guardada no Cofre");
          break;
        case "delete":
          await savePrefs(userId, id, { cleared_at: new Date().toISOString(), pinned_at: null, archived: false, marked_unread: false });
          toast.success("Conversa apagada");
          break;
      }
    } catch {
      toast.error("Não deu certo. Tente de novo.");
    }
    refresh();
  }

  const term = q.trim().toLowerCase();
  const rows = (query.data ?? [])
    .filter((c) => {
      const p = prefsOf(c.id);
      if (p.cleared_at && (!c.last || new Date(c.last.created_at) <= new Date(p.cleared_at))) return false;
      if (vault) return p.hidden;
      if (p.hidden) return false;
      if (filter === "archived") return p.archived;
      if (p.archived) return false;
      if (filter === "pinned") return !!p.pinned_at;
      if (filter === "unread") return isUnread(c);
      return true;
    })
    .filter((c) => !term || `${c.other?.display_name ?? ""} ${c.other?.username ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => {
      const pa = prefsOf(a.id).pinned_at, pb = prefsOf(b.id).pinned_at;
      if (pa && !pb) return -1;
      if (pb && !pa) return 1;
      if (pa && pb) return pb.localeCompare(pa);
      return 0;
    });
  const sheetConv = (query.data ?? []).find((c) => c.id === sheetFor);

  if (query.isLoading) return <ListSkeleton />;
  if (term && !rows.length) return <EmptyState icon={<Search className="h-6 w-6" strokeWidth={1.6} />} title="Nada encontrado" hint="Tente outro nome." />;
  if (!rows.length) {
    const empty = vault
      ? { t: "Cofre vazio", h: "Segure uma conversa e escolha Guardar no Cofre." }
      : filter === "archived" ? { t: "Nada arquivado", h: "Deslize uma conversa para a esquerda para arquivar." }
      : filter === "pinned" ? { t: "Nenhuma fixada", h: "Deslize uma conversa para a direita para fixar." }
      : filter === "unread" ? { t: "Tudo em dia", h: "Você não tem mensagens novas." }
      : { t: "Nenhuma conversa direta", h: "Encontre pessoas no Explorar e converse pelo perfil." };
    return <EmptyState icon={vault ? <Lock className="h-6 w-6" strokeWidth={1.6} /> : <MessageCircle className="h-6 w-6" strokeWidth={1.6} />} title={empty.t} hint={empty.h} />;
  }
  return (
    <>
    <ul className="space-y-1 px-2 pb-4 pt-1">
      {rows.map((c) => {
        const p = prefsOf(c.id);
        const unread = isUnread(c);
        const muted = isMuted(c.id);
        return (
          <li key={c.id}>
           <SwipeRow
             pinned={!!p.pinned_at}
             archived={p.archived}
             onLongPress={() => setSheetFor(c.id)}
             onSwipeRight={() => void run(c.id, "pin")}
             onSwipeLeft={() => void run(c.id, "archive")}
           >
            <Link
              to="/messages/$conversationId"
              params={{ conversationId: c.id }}
              onClick={() => { if (p.marked_unread) void savePrefs(userId, c.id, { marked_unread: false }).then(refresh); }}
              className={cn("chat-row flex select-none items-center gap-3 rounded-[22px] px-3 py-3 transition-all active:scale-[0.985]", unread && !muted && "chat-row-hot")}
            >
              <div className={cn("shrink-0 rounded-full p-[2px]", unread && !muted ? "unread-ring" : "")}>
                <UserAvatar avatarPath={c.other?.avatar_url} displayName={c.other?.display_name ?? "?"} verified={!!(c.other as any)?.is_verified} badgeVariant={((c.other as any)?.badge_variant) ?? null} className="h-[52px] w-[52px] rounded-full border-2 border-background" />
              </div>
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
                  <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    {muted && <BellOff className="h-3 w-3" aria-label="Silenciada" />}
                    {p.pinned_at && <Pin className="h-3 w-3 text-primary" aria-label="Fixada" />}
                    {c.last ? <TimeLabel at={c.last.created_at} hot={unread && !muted} /> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("flex-1 truncate text-[13px] leading-snug", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {c.last ? <Preview m={c.last} mine={c.last.sender_id === userId} read={!!c.last.read_at} /> : "Diga oi 👋"}
                  </div>
                  {unread && <UnreadPill count={c.unreadCount} muted={muted} />}
                </div>
              </div>
            </Link>
           </SwipeRow>
          </li>
        );
      })}
    </ul>
    {sheetConv && (
      <ConversationActionsSheet
        open={!!sheetFor}
        onOpenChange={(o) => !o && setSheetFor(null)}
        name={sheetConv.other?.display_name ?? "Conversa"}
        prefs={prefsOf(sheetConv.id)}
        muted={isMuted(sheetConv.id)}
        unread={isUnread(sheetConv)}
        onAction={(a) => void run(sheetConv.id, a)}
      />
    )}
    </>
  );
}

function ChatList({ userId, type, q, filter }: { userId: string; type: "group" | "channel"; q: string; filter: Filter }) {
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
            .select("chat_id, content, created_at, sender_id, media_type, kind")
            .in("chat_id", list.map((c) => c.id))
            .order("created_at", { ascending: false })
        : { data: [] as any[] };
      const lastByChat = new Map<string, any>();
      const seen = readSeen(userId);
      const unreadByChat = new Map<string, number>();
      for (const m of (lastMessages ?? []) as any[]) {
        if (!lastByChat.has(m.chat_id)) lastByChat.set(m.chat_id, m);
        const s = seen[m.chat_id];
        if (s && m.sender_id !== userId && m.created_at > s) unreadByChat.set(m.chat_id, (unreadByChat.get(m.chat_id) ?? 0) + 1);
      }
      // Primeira vez: marca como visto agora para não mostrar números gigantes antigos
      let changed = false;
      for (const c of list) if (!seen[c.id]) { seen[c.id] = new Date().toISOString(); changed = true; }
      if (changed) writeSeen(userId, seen);
      return list.map((c) => ({ ...c, last: lastByChat.get(c.id), unreadCount: unreadByChat.get(c.id) ?? 0 }));
    },
  });

  const qc = useQueryClient();
  const storeKey = `vibely:chat-prefs:${userId}`;
  const [local, setLocal] = useState<Record<string, ConvPrefs>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch { return {}; }
  });
  const [sheetFor, setSheetFor] = useState<any | null>(null);
  const mutes = useQuery({
    queryKey: ["chat-mutes", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("muted_chats").select("chat_id, until").eq("user_id", userId);
      const now = Date.now();
      return new Set(((data ?? []) as any[]).filter((m) => !m.until || new Date(m.until).getTime() > now).map((m) => m.chat_id as string));
    },
  });
  const prefOf = (id: string): ConvPrefs => ({ ...EMPTY_PREFS, ...(local[id] ?? {}) });
  const patch = (id: string, p: Partial<ConvPrefs>) => {
    setLocal((prev) => {
      const next = { ...prev, [id]: { ...EMPTY_PREFS, ...(prev[id] ?? {}), ...p } };
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  };
  const mute = async (id: string, until: string | null | false) => {
    await (supabase as any).from("muted_chats").delete().eq("user_id", userId).eq("chat_id", id);
    if (until !== false) await (supabase as any).from("muted_chats").insert({ user_id: userId, chat_id: id, until });
    qc.invalidateQueries({ queryKey: ["chat-mutes", userId] });
  };
  const run = async (c: any, a: string) => {
    const p = prefOf(c.id);
    try {
      if (a === "pin") { patch(c.id, { pinned_at: p.pinned_at ? null : new Date().toISOString() }); toast(p.pinned_at ? "Desafixado" : "Fixado no topo"); }
      else if (a === "archive") { patch(c.id, { archived: !p.archived }); toast(p.archived ? "Desarquivado" : "Arquivado"); }
      else if (a === "unread") patch(c.id, { marked_unread: true });
      else if (a === "read") patch(c.id, { marked_unread: false });
      else if (a === "mute8h") { await mute(c.id, new Date(Date.now() + 8 * 3600e3).toISOString()); toast("Silenciado por 8 horas"); }
      else if (a === "mute1w") { await mute(c.id, new Date(Date.now() + 7 * 86400e3).toISOString()); toast("Silenciado por 1 semana"); }
      else if (a === "muteAlways") { await mute(c.id, null); toast("Silenciado"); }
      else if (a === "unmute") { await mute(c.id, false); toast("Notificações reativadas"); }
      else if (a === "hide") toast("O Cofre é só para conversas diretas");
      else if (a === "delete") {
        const { error } = await (supabase as any).from("chat_members").delete().eq("user_id", userId).eq("chat_id", c.id);
        if (error) throw error;
        toast(type === "group" ? "Você saiu do grupo" : "Você saiu do canal");
        qc.invalidateQueries({ queryKey: ["chats", type, userId] });
      }
    } catch { toast.error("Não deu certo. Tente de novo."); }
  };

  const counts = useChannelCounts(type === "channel" ? ((query.data ?? []) as any[]).map((c) => c.id) : []);
  const term = q.trim().toLowerCase();
  const rows = ((query.data ?? []) as any[])
    .filter((c) => !term || String(c.title ?? "").toLowerCase().includes(term))
    .filter((c) => {
      const p = prefOf(c.id);
      if (filter === "archived") return p.archived;
      if (p.archived) return false;
      if (filter === "pinned") return !!p.pinned_at;
      if (filter === "unread") return p.marked_unread;
      return true;
    })
    .sort((a, b) => (prefOf(b.id).pinned_at ?? "").localeCompare(prefOf(a.id).pinned_at ?? ""));
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
  if (!rows.length) {
    return <EmptyState icon={<Pin className="h-6 w-6" strokeWidth={1.6} />} title={filter === "archived" ? "Nada arquivado" : filter === "pinned" ? "Nenhum fixado" : "Tudo em dia"} hint="Segure ou deslize para ver as opções." />;
  }
  return (
    <>
    <ul className="space-y-1 px-2 pb-4 pt-1">
      {rows.map((c: any) => {
        const p = prefOf(c.id);
        const isMuted = mutes.data?.has(c.id) ?? false;
        const unreadN = c.unreadCount ?? 0;
        const hasUnread = unreadN > 0 || p.marked_unread;
        return (
          <li key={c.id}>
            <SwipeRow
              pinned={!!p.pinned_at}
              archived={p.archived}
              onLongPress={() => setSheetFor(c)}
              onSwipeRight={() => run(c, "pin")}
              onSwipeLeft={() => run(c, "archive")}
            >
            <Link
              to="/chats/$id"
              onClick={() => { markSeen(userId, c.id); if (p.marked_unread) patch(c.id, { marked_unread: false }); }}
              params={{ id: c.id }}
              className={cn("chat-row flex items-center gap-3 rounded-[22px] px-3 py-3 transition-all active:scale-[0.985]", hasUnread && !isMuted && "chat-row-hot")}
            >
              <div className={cn("shrink-0 rounded-full p-[2px] transition", hasUnread && !isMuted && type === "channel" ? "unread-ring" : "")}>
              {c.avatar_url ? (
                <div className="h-[52px] w-[52px] rounded-full overflow-hidden bg-[color:var(--surface-2)] border-2 border-background">
                  <SignedImage bucket="chats" path={c.avatar_url} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-gradient-to-br from-primary/25 to-[color:var(--surface-2)] border-2 border-background text-foreground">
                  {type === "group" ? <Users className="h-5 w-5" strokeWidth={1.6} /> : <Megaphone className="h-5 w-5" strokeWidth={1.6} />}
                </div>
              )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className={cn("flex min-w-0 items-center gap-1.5 truncate text-[15px]", p.marked_unread ? "font-bold" : "font-semibold")}>
                    {p.pinned_at && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                    <span className="truncate">{c.title}</span>
                    {isMuted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.last ? <TimeLabel at={c.last.created_at} hot={hasUnread && !isMuted} /> : null}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className={cn("min-w-0 flex-1 text-[13px] leading-snug", hasUnread ? "text-foreground" : "text-muted-foreground")}>
                    <div className={cn(type === "channel" ? "line-clamp-2" : "truncate")}>
                      {c.last ? <Preview m={c.last} mine={c.last.sender_id === userId} /> : c.description ?? (type === "group" ? "Grupo criado" : "Canal criado")}
                    </div>
                    {type === "channel" && counts.data?.has(c.id) ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground/80">{formatMembers(counts.data.get(c.id) ?? 0)}</div>
                    ) : null}
                  </div>
                  {hasUnread && <UnreadPill count={unreadN} muted={isMuted} />}
                </div>
              </div>
            </Link>
            </SwipeRow>
          </li>
        );
      })}
    </ul>
    {sheetFor && (
      <ConversationActionsSheet
        open={!!sheetFor}
        onOpenChange={(o) => !o && setSheetFor(null)}
        name={sheetFor.title ?? ""}
        prefs={prefOf(sheetFor.id)}
        muted={mutes.data?.has(sheetFor.id) ?? false}
        unread={prefOf(sheetFor.id).marked_unread}
        onAction={(a) => run(sheetFor, a)}
      />
    )}
    </>
  );
}

const seenKey = (u: string) => `vibely:chat-seen:${u}`;
function readSeen(u: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(seenKey(u)) || "{}"); } catch { return {}; }
}
function writeSeen(u: string, v: Record<string, string>) {
  try { localStorage.setItem(seenKey(u), JSON.stringify(v)); } catch { /* */ }
}
function markSeen(u: string, id: string) {
  const s = readSeen(u); s[id] = new Date().toISOString(); writeSeen(u, s);
}

function TimeLabel({ at, hot }: { at: string; hot: boolean }) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now.getTime() - 86400e3).toDateString() === d.toDateString();
  const label = sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : yest ? "Ontem"
    : now.getTime() - d.getTime() < 6 * 86400e3 ? d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return <span className={cn("text-[11px] tabular", hot ? "font-semibold text-primary" : "text-muted-foreground")}>{label}</span>;
}

function UnreadPill({ count, muted }: { count: number; muted: boolean }) {
  const text = count > 999 ? "999+" : count > 0 ? String(count) : "";
  return (
    <span
      aria-label={count ? `${count} não lidas` : "Não lida"}
      className={cn(
        "unread-pill grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular leading-none",
        muted ? "bg-muted-foreground/40 text-foreground" : "bg-primary text-primary-foreground",
        !text && "h-2.5 min-w-2.5 px-0",
      )}
    >
      {text}
    </span>
  );
}

function Preview({ m, mine, read }: { m: any; mine: boolean; read?: boolean }) {
  const t = String(m.media_type ?? "");
  const k = String(m.kind ?? "");
  const isSticker = k === "sticker" || t.includes("sticker");
  const isGif = k === "gif" || t.includes("gif");
  const cls = "h-3.5 w-3.5";
  const icon = isSticker ? <Sparkles className={cls} /> : t.startsWith("audio") ? <Mic className={cls} /> : t.startsWith("image") ? <Camera className={cls} /> : t.startsWith("video") ? <Video className={cls} /> : null;
  const label = isSticker ? "Figurinha" : isGif ? "GIF" : t.startsWith("audio") ? "Mensagem de voz" : t.startsWith("image") ? "Foto" : t.startsWith("video") ? "Vídeo" : null;
  const text = m.content || label || "Mensagem";
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate">
      {mine && (read
        ? <CheckCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Lida" />
        : <CheckCheck className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-label="Entregue" />)}
      {icon && <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[color:var(--surface-2)]", t.startsWith("audio") && "text-primary")}>{icon}</span>}
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
