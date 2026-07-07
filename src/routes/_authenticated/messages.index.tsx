import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage } from "@/components/signed-image";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, Megaphone, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBlocks } from "@/hooks/use-blocks";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/messages/")({
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState("direct");
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Comunidade</div>
          <h1 className="text-3xl font-display font-black">Conversas</h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" className="rounded-full bg-gradient-brand h-11 w-11 shadow-elegant">
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => navigate({ to: "/chats/new", search: { type: "group" } })}>
              <Users className="h-4 w-4 mr-2" /> Novo grupo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/chats/new", search: { type: "channel" } })}>
              <Megaphone className="h-4 w-4 mr-2" /> Novo canal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 rounded-full glass p-1">
          <TabsTrigger value="direct" className="rounded-full">Diretas</TabsTrigger>
          <TabsTrigger value="group" className="rounded-full">Grupos</TabsTrigger>
          <TabsTrigger value="channel" className="rounded-full">Canais</TabsTrigger>
        </TabsList>

        <TabsContent value="direct" className="mt-4">
          <DirectList userId={user.id} />
        </TabsContent>
        <TabsContent value="group" className="mt-4">
          <ChatList userId={user.id} type="group" />
        </TabsContent>
        <TabsContent value="channel" className="mt-4">
          <ChatList userId={user.id} type="channel" />
        </TabsContent>
      </Tabs>
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
          ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", otherIds)
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
        icon={<MessageCircle className="h-10 w-10 text-primary" />}
        title="Nenhuma conversa direta"
        hint="Encontre pessoas no Explorar e converse pelo perfil."
      />
    );
  }
  return (
    <div className="space-y-1">
      {query.data.map((c) => (
        <Link
          key={c.id}
          to="/messages/$conversationId"
          params={{ conversationId: c.id }}
          className="flex items-center gap-3 rounded-2xl p-3 hover:bg-white/5 transition"
        >
          <UserAvatar avatarPath={c.other?.avatar_url} displayName={c.other?.display_name ?? "?"} className="h-11 w-11" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold truncate">{c.other?.display_name}</div>
              {c.last ? (
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNowStrict(new Date(c.last.created_at), { locale: ptBR })}
                </div>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground truncate">{c.last?.content ?? "Diga oi 👋"}</div>
          </div>
        </Link>
      ))}
    </div>
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
        icon={type === "group" ? <Users className="h-10 w-10 text-primary" /> : <Megaphone className="h-10 w-10 text-primary" />}
        title={type === "group" ? "Você não está em nenhum grupo" : "Nenhum canal ainda"}
        hint={type === "group" ? "Crie um grupo com seus amigos ou espere ser convidado." : "Crie um canal para transmitir suas ideias."}
      />
    );
  }
  return (
    <div className="space-y-1">
      {query.data.map((c: any) => (
        <Link
          key={c.id}
          to="/chats/$id"
          params={{ id: c.id }}
          className="flex items-center gap-3 rounded-2xl p-3 hover:bg-white/5 transition"
        >
          {c.avatar_url ? (
            <div className="h-11 w-11 rounded-full overflow-hidden bg-muted">
              <SignedImage bucket="chats" path={c.avatar_url} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-brand text-white">
              {type === "group" ? <Users className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold truncate">{c.title}</div>
              {c.last ? (
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNowStrict(new Date(c.last.created_at), { locale: ptBR })}
                </div>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground truncate">{c.last?.content ?? c.description ?? (type === "group" ? "Grupo criado" : "Canal criado")}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
    </div>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="glass rounded-3xl p-10 text-center space-y-3">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/5">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
