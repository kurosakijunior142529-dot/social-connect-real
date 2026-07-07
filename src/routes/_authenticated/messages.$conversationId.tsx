import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const blocks = useBlocks();

  const conv = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      const otherId = data.user_a === user.id ? data.user_b : data.user_a;
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      return { ...data, other: prof };
    },
  });

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`msg-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          queryClient.setQueryData<any[]>(["messages", conversationId], (old) => [
            ...(old ?? []),
            payload.new,
          ]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: text,
    });
    setSending(false);
    if (error) {
      setDraft(text);
      console.error(error);
    }
  }

  const other = conv.data?.other ?? null;
  const otherId = other?.id ?? null;
  const isBlockedPair = otherId ? blocks.data?.hidden.has(otherId) ?? false : false;
  const iBlocked = otherId ? blocks.data?.blocked.has(otherId) ?? false : false;
  const visibleMessages = (messages.data ?? []).filter((m) => {
    // hide messages from a user who blocked me (I'm still in their conversation)
    if (blocks.data?.blockedBy.has(m.sender_id)) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] -mx-4 md:mx-0 md:rounded-3xl md:border md:bg-card md:overflow-hidden">
      <header className="flex items-center gap-3 p-3 border-b bg-card sticky top-0 z-10">
        <Link to="/messages" className="p-2 -ml-1 rounded-full hover:bg-muted md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {other ? (
          <>
            <UserAvatar
              avatarPath={other.avatar_url}
              displayName={other.display_name}
              className="h-9 w-9"
            />
            <Link to="/u/$username" params={{ username: other.username }} className="flex-1 min-w-0">
              <div className="font-semibold truncate">{other.display_name}</div>
              <div className="text-xs text-muted-foreground truncate">@{other.username}</div>
            </Link>
            <UserActionsMenu targetUserId={other.id} targetUsername={other.username} />
          </>
        ) : null}
      </header>

      {isBlockedPair ? (
        <div className="p-3 bg-destructive/10 border-b text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>
            {iBlocked
              ? "Você bloqueou este usuário. Desbloqueie para trocar mensagens."
              : "Não é possível enviar mensagens nesta conversa."}
          </span>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {visibleMessages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={cn("flex group", mine ? "justify-end" : "justify-start")}>
              {!mine && otherId ? (
                <div className="opacity-0 group-hover:opacity-100 transition mr-1 self-center">
                  <UserActionsMenu
                    targetUserId={otherId}
                    targetUsername={other?.username}
                    messageId={m.id}
                    className="p-1"
                  />
                </div>
              ) : null}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2 text-sm break-words",
                  mine
                    ? "bg-gradient-brand text-white rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md",
                )}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="p-3 border-t bg-card flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isBlockedPair ? "Mensagens desativadas" : "Mensagem…"}
          maxLength={2000}
          disabled={isBlockedPair}
          className="rounded-full bg-muted border-transparent h-11"
        />
        <Button
          type="submit"
          disabled={!draft.trim() || sending || isBlockedPair}
          size="icon"
          className="rounded-full bg-gradient-brand h-11 w-11 shrink-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
