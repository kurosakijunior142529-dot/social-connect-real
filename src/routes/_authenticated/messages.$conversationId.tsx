import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Ban, Phone, Video, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { useBlocks } from "@/hooks/use-blocks";
import { useCall } from "@/components/call-provider";
import { MessageActions, ReactionsBar, ReplyQuote } from "@/components/message-actions";
import { ScheduleButton } from "@/components/schedule-message";
import { SummarizeButton, SmartReplyBar, MuteToggle, useMessageReactions, toggleReaction } from "@/components/chat-extras";
import { useAiActions } from "@/hooks/use-ai-actions";
import { toast } from "sonner";

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
  const [replyTo, setReplyTo] = useState<{ id: string; content: string | null } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string | null } | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const blocks = useBlocks();
  const { startCall } = useCall();
  const ai = useAiActions();

  const conv = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*").eq("id", conversationId).single();
      if (error) throw error;
      const otherId = data.user_a === user.id ? data.user_b : data.user_a;
      const { data: prof } = await supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", otherId).maybeSingle();
      return { ...data, other: prof };
    },
  });

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("messages")
        .select("*").eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const messageIds = (messages.data ?? []).map((m) => m.id);
  const reactions = useMessageReactions("dm", messageIds, user.id);

  useEffect(() => {
    const channel = supabase.channel(`msg-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_message_reactions" },
        () => queryClient.invalidateQueries({ queryKey: ["reactions", "dm"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.data?.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    if (editing) {
      setSending(true);
      const prev = (messages.data ?? []).find((m) => m.id === editing.id)?.content ?? null;
      const { error } = await (supabase as any).from("messages")
        .update({ content: text, edited_at: new Date().toISOString() }).eq("id", editing.id);
      if (!error) {
        await (supabase as any).from("message_edits").insert({
          source: "dm", message_id: editing.id, previous_content: prev, editor_id: user.id,
        });
      }
      setSending(false);
      setEditing(null); setDraft("");
      if (error) toast.error(error.message);
      return;
    }

    // /ia command
    if (text.startsWith("/ia ")) {
      const q = text.slice(4).trim();
      setDraft("");
      const answer = await ai.ask(q);
      if (answer) {
        await (supabase as any).from("messages").insert({
          conversation_id: conversationId, sender_id: user.id,
          content: `🤖 ${q}\n\n${answer}`,
        });
      }
      return;
    }

    setSending(true); setDraft("");
    const payload: any = { conversation_id: conversationId, sender_id: user.id, content: text };
    if (replyTo) payload.reply_to = replyTo.id;
    const { error } = await (supabase as any).from("messages").insert(payload);
    setSending(false);
    setReplyTo(null);
    if (error) { setDraft(text); toast.error(error.message); }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Apagar para todos?")) return;
    const { error } = await (supabase as any).from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  const other = conv.data?.other ?? null;
  const otherId = other?.id ?? null;
  const isBlockedPair = otherId ? blocks.data?.hidden.has(otherId) ?? false : false;
  const iBlocked = otherId ? blocks.data?.blocked.has(otherId) ?? false : false;
  const visibleMessages = (messages.data ?? []).filter((m) => !blocks.data?.blockedBy.has(m.sender_id));
  const byId = new Map(visibleMessages.map((m) => [m.id, m]));

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] -mx-4 md:mx-0 md:rounded-3xl md:border md:bg-card md:overflow-hidden">
      <header className="flex items-center gap-2 p-3 border-b bg-card sticky top-0 z-10">
        <Link to="/messages" className="p-2 -ml-1 rounded-full hover:bg-muted md:hidden"><ArrowLeft className="h-5 w-5" /></Link>
        {other ? (
          <>
            <UserAvatar avatarPath={other.avatar_url} displayName={other.display_name} className="h-9 w-9" />
            <Link to="/u/$username" params={{ username: other.username }} className="flex-1 min-w-0">
              <div className="font-semibold truncate">{other.display_name}</div>
              <div className="text-xs text-muted-foreground truncate">@{other.username}</div>
            </Link>
            <SummarizeButton scope="dm" id={conversationId} />
            <MuteToggle table="muted_conversations" keyCol="conversation_id" keyVal={conversationId} userId={user.id} />
            <button onClick={() => startCall({ id: other.id, username: other.username, display_name: other.display_name, avatar_url: other.avatar_url }, "audio")}
              disabled={isBlockedPair} className="p-2 rounded-full hover:bg-muted disabled:opacity-40" aria-label="Voz"><Phone className="h-5 w-5" /></button>
            <button onClick={() => startCall({ id: other.id, username: other.username, display_name: other.display_name, avatar_url: other.avatar_url }, "video")}
              disabled={isBlockedPair} className="p-2 rounded-full hover:bg-muted disabled:opacity-40" aria-label="Vídeo"><Video className="h-5 w-5" /></button>
            <UserActionsMenu targetUserId={other.id} targetUsername={other.username} />
          </>
        ) : null}
      </header>

      {isBlockedPair ? (
        <div className="p-3 bg-destructive/10 border-b text-sm text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>{iBlocked ? "Você bloqueou este usuário." : "Não é possível enviar mensagens."}</span>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {visibleMessages.map((m) => {
          const mine = m.sender_id === user.id;
          const replied = m.reply_to ? byId.get(m.reply_to) : null;
          const rs = reactions.data?.[m.id] ?? [];
          const translated = translations[m.id];
          return (
            <div key={m.id} className={cn("flex group items-end gap-2", mine ? "justify-end" : "justify-start")}>
              {mine ? (
                <MessageActions message={m} ctx={{ scope: "dm", ownerId: user.id }} mine
                  onReply={setReplyTo} onEdit={(x) => { setEditing(x); setDraft(x.content ?? ""); }}
                  onDelete={deleteMessage} onTranslated={(id, t) => setTranslations((p) => ({ ...p, [id]: t }))} />
              ) : null}
              <div className="max-w-[75%]">
                <div className={cn("rounded-2xl px-4 py-2 text-sm break-words",
                  mine ? "bg-gradient-brand text-white rounded-br-md" : "bg-muted text-foreground rounded-bl-md")}>
                  {replied ? <ReplyQuote text={replied.content} /> : null}
                  {m.content}
                  {m.edited_at ? <span className="ml-2 text-[10px] opacity-70">editado</span> : null}
                  {translated ? <div className="mt-1 pt-1 border-t border-white/20 text-xs opacity-90">🌐 {translated}</div> : null}
                </div>
                <ReactionsBar reactions={rs} onToggle={(emoji, mineR) => toggleReaction("dm", m.id, user.id, emoji, mineR).then(() => queryClient.invalidateQueries({ queryKey: ["reactions", "dm"] }))} />
              </div>
              {!mine ? (
                <MessageActions message={m} ctx={{ scope: "dm", ownerId: user.id }} mine={false}
                  onReply={setReplyTo} onEdit={() => {}} onDelete={() => {}}
                  onTranslated={(id, t) => setTranslations((p) => ({ ...p, [id]: t }))} />
              ) : null}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!isBlockedPair ? <SmartReplyBar scope="dm" id={conversationId} onPick={(s) => setDraft(s)} /> : null}

      {replyTo || editing ? (
        <div className="px-3 py-2 border-t bg-white/5 flex items-center gap-2 text-xs">
          <span className="opacity-70">{editing ? "Editando:" : "Respondendo:"}</span>
          <span className="flex-1 truncate">{editing?.content ?? replyTo?.content}</span>
          <button onClick={() => { setReplyTo(null); setEditing(null); setDraft(""); }} className="p-1 rounded-full hover:bg-white/10"><X className="h-3 w-3" /></button>
        </div>
      ) : null}

      <form onSubmit={send} className="p-3 border-t bg-card flex items-center gap-2">
        <ScheduleButton userId={user.id} target={{ type: "dm", conversationId }} />
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={isBlockedPair ? "Mensagens desativadas" : editing ? "Editar mensagem…" : "Mensagem ou /ia pergunta…"}
          maxLength={2000} disabled={isBlockedPair}
          className="rounded-full bg-muted border-transparent h-11" />
        {draft.startsWith("/ia") ? <Sparkles className="h-5 w-5 text-primary animate-pulse" /> : null}
        <Button type="submit" disabled={!draft.trim() || sending || isBlockedPair} size="icon" className="rounded-full bg-gradient-brand h-11 w-11 shrink-0">
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
