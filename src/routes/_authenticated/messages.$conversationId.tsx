import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo, type FormEvent } from "react";
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
  const otherId = useMemo<string | null>(() => null, []); // placeholder — computed below via conv

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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] -mx-4 md:mx-0 md:rounded-3xl md:border md:bg-card md:overflow-hidden">
      <header className="flex items-center gap-3 p-3 border-b bg-card sticky top-0 z-10">
        <Link to="/messages" className="p-2 -ml-1 rounded-full hover:bg-muted md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {conv.data?.other ? (
          <>
            <UserAvatar
              avatarPath={conv.data.other.avatar_url}
              displayName={conv.data.other.display_name}
              className="h-9 w-9"
            />
            <Link to="/u/$username" params={{ username: conv.data.other.username }}>
              <div className="font-semibold">{conv.data.other.display_name}</div>
              <div className="text-xs text-muted-foreground">@{conv.data.other.username}</div>
            </Link>
          </>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.data?.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
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
          placeholder="Mensagem…"
          maxLength={2000}
          className="rounded-full bg-muted border-transparent h-11"
        />
        <Button
          type="submit"
          disabled={!draft.trim() || sending}
          size="icon"
          className="rounded-full bg-gradient-brand h-11 w-11 shrink-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
