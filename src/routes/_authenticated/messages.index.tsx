import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle } from "lucide-react";
import { useBlocks } from "@/hooks/use-blocks";

export const Route = createFileRoute("/_authenticated/messages/")({
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = Route.useRouteContext();
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;

  const query = useQuery({
    queryKey: ["conversations", user.id, hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    queryFn: async () => {
      const { data: convs, error } = await supabase
        .from("conversations")
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const list = (convs ?? []).filter((c) => {
        const other = c.user_a === user.id ? c.user_b : c.user_a;
        return !hidden?.has(other);
      });
      const otherIds = list.map((c) => (c.user_a === user.id ? c.user_b : c.user_a));
      const [profilesRes, lastMessagesRes] = await Promise.all([
        otherIds.length
          ? supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .in("id", otherIds)
          : Promise.resolve({ data: [] as any[] }),
        list.length
          ? supabase
              .from("messages")
              .select("conversation_id, content, created_at, sender_id")
              .in(
                "conversation_id",
                list.map((c) => c.id),
              )
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const lastByConv = new Map<string, any>();
      for (const m of lastMessagesRes.data ?? []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      }
      return list.map((c) => {
        const otherId = c.user_a === user.id ? c.user_b : c.user_a;
        return {
          ...c,
          other: profiles.get(otherId),
          last: lastByConv.get(c.id),
        };
      });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mensagens</h1>

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-1">
          {query.data.map((c) => (
            <Link
              key={c.id}
              to="/messages/$conversationId"
              params={{ conversationId: c.id }}
              className="flex items-center gap-3 rounded-2xl p-3 hover:bg-muted"
            >
              <UserAvatar avatarPath={c.other?.avatar_url} displayName={c.other?.display_name ?? "?"} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold truncate">{c.other?.display_name}</div>
                  {c.last ? (
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNowStrict(new Date(c.last.created_at), { locale: ptBR })}
                    </div>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {c.last?.content ?? "Diga oi 👋"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed p-10 text-center space-y-3">
          <MessageCircle className="h-10 w-10 mx-auto text-primary" />
          <h2 className="text-xl font-semibold">Nenhuma conversa ainda</h2>
          <p className="text-sm text-muted-foreground">
            Encontre pessoas em <Link to="/explore" className="text-primary underline">Explorar</Link> e comece uma conversa pelo perfil.
          </p>
        </div>
      )}
    </div>
  );
}
