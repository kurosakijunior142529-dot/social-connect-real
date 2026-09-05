import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VerifiedName } from "@/components/verified-badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage } from "@/components/signed-image";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, Megaphone, Plus, Tv } from "lucide-react";
import { useBlocks } from "@/hooks/use-blocks";
import { useState } from "react";
import { cn } from "@/lib/utils";
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

  return (
    <div>
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-[26px] font-display font-bold tracking-tight">Conversas</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Novo"
                className="grid h-10 w-10 place-items-center rounded-full border border-primary/25 bg-[color:var(--surface-2)] text-primary transition hover:bg-primary/10 active:scale-95"
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
        <div className="px-4 pb-3">
          <div className="flex gap-1 rounded-2xl bg-[color:var(--surface)] p-1">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-[13px] transition-all",
                    active
                      ? "bg-chat-mine font-bold text-chat-mine-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="pt-1">
        {tab === "direct" && <DirectList userId={user.id} />}
        {tab === "group" && <ChatList userId={user.id} type="group" />}
        {tab === "channel" && <ChatList userId={user.id} type="channel" />}
      </div>
    </div>
  );
}

function DirectList({ userId }: { userId: string }) {
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
      const [profilesRes, lastMessagesRes] = await Promise.all([
        otherIds.length
          ? supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", otherIds)
          : Promise.resolve({ data: [] as any[] }),
        list.length
          ? supabase
              .from("messages")
              .select("conversation_id, content, created_at, sender_id")
              .in("conversation_id", list.map((c) => c.id))
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const lastByConv = new Map<string, any>();
      for (const m of lastMessagesRes.data ?? []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      }
      return list.map((c) => {
        const otherId = c.user_a === userId ? c.user_b : c.user_a;
        return { ...c, other: profiles.get(otherId), last: lastByConv.get(c.id) };
      });
    },
  });

  if (query.isLoading) return <ListSkeleton />;
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
    <ul className="pb-4 pt-1 divide-y divide-border/30">
      {query.data.map((c) => {
        return (
          <li key={c.id}>
            <Link
              to="/messages/$conversationId"
              params={{ conversationId: c.id }}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--surface)]/60 active:bg-[color:var(--surface)]"
            >
              <UserAvatar avatarPath={c.other?.avatar_url} displayName={c.other?.display_name ?? "?"} verified={!!(c.other as any)?.is_verified} badgeVariant={((c.other as any)?.badge_variant) ?? null} className="h-12 w-12 rounded-full border border-white/10" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="truncate text-[15px] font-semibold"><VerifiedName name={c.other?.display_name} verified={(c.other as any)?.is_verified} badgeVariant={(c.other as any)?.badge_variant} /></div>
                  {c.last ? (
                    <div className="text-[10px] shrink-0 tabular uppercase tracking-widest text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(c.last.created_at), { locale: ptBR })}
                    </div>
                  ) : null}
                </div>
                <div className="text-[13px] truncate leading-snug text-muted-foreground">{c.last?.content ?? "Diga oi 👋"}</div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>

  );
}

function ChatList({ userId, type }: { userId: string; type: "group" | "channel" }) {
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
            .select("chat_id, content, created_at, sender_id")
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

  if (query.isLoading) return <ListSkeleton />;
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
    <ul className="pb-4 pt-1 divide-y divide-border/30">
      {query.data.map((c: any) => {
        return (
          <li key={c.id}>
            <Link
              to="/chats/$id"
              params={{ id: c.id }}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--surface)]/60 active:bg-[color:var(--surface)]"
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
                  {c.last?.content ?? c.description ?? (type === "group" ? "Grupo criado" : "Canal criado")}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
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
