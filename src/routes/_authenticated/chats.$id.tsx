import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { SignedImage } from "@/components/signed-image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, Users, Megaphone, LogOut, UserPlus, Trash2, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageActions, ReactionsBar, ReplyQuote } from "@/components/message-actions";
import { ScheduleButton } from "@/components/schedule-message";
import { SummarizeButton, SmartReplyBar, MuteToggle, useMessageReactions, toggleReaction } from "@/components/chat-extras";
import { useAiActions } from "@/hooks/use-ai-actions";
import { useBubbleTheme } from "@/lib/bubble-themes";
import { BubbleThemePicker } from "@/components/chat/bubble-theme-picker";

export const Route = createFileRoute("/_authenticated/chats/$id")({
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string | null } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string | null } | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const ai = useAiActions();
  const { themeId, theme: bubbleTheme, setTheme: setBubbleTheme } = useBubbleTheme(id);

  const chat = useQuery({
    queryKey: ["chat", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("chats").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const membership = useQuery({
    queryKey: ["chat-me", id, user.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("chat_members")
        .select("role")
        .eq("chat_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  const messages = useQuery({
    queryKey: ["chat-messages", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chat_messages")
        .select("*")
        .eq("chat_id", id)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      const list = (data ?? []) as any[];
      const senderIds = Array.from(new Set(list.map((m) => m.sender_id)));
      const { data: profs } = senderIds.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds)
        : { data: [] as any[] };
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      return list.map((m) => ({ ...m, sender: pmap.get(m.sender_id) }));
    },
  });

  const messageIds = (messages.data ?? []).map((m: any) => m.id);
  const reactions = useMessageReactions("chat", messageIds, user.id);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["chat-messages", id] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => queryClient.invalidateQueries({ queryKey: ["reactions", "chat"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  const chatData = chat.data;
  const role = membership.data?.role;
  const isMember = !!role;
  const isAdmin = role === "owner" || role === "admin";
  const isChannel = chatData?.type === "channel";
  const canPost = isMember && (!isChannel || isAdmin);
  const byId = new Map((messages.data ?? []).map((m: any) => [m.id, m]));

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || !canPost) return;

    if (editing) {
      setSending(true);
      const prev = (messages.data ?? []).find((m: any) => m.id === editing.id)?.content ?? null;
      const { error } = await (supabase as any).from("chat_messages")
        .update({ content: text, edited_at: new Date().toISOString() }).eq("id", editing.id);
      if (!error) {
        await (supabase as any).from("message_edits").insert({
          source: "chat", message_id: editing.id, previous_content: prev, editor_id: user.id,
        });
      }
      setSending(false);
      setEditing(null); setDraft("");
      if (error) toast.error(error.message);
      return;
    }

    if (text.startsWith("/ia ")) {
      const q = text.slice(4).trim();
      setDraft("");
      const answer = await ai.ask(q);
      if (answer) {
        await (supabase as any).from("chat_messages").insert({
          chat_id: id, sender_id: user.id,
          content: `🤖 ${q}\n\n${answer}`,
        });
      }
      return;
    }

    setSending(true); setDraft("");
    const payload: any = { chat_id: id, sender_id: user.id, content: text };
    if (replyTo) payload.reply_to = replyTo.id;
    const { error } = await (supabase as any).from("chat_messages").insert(payload);
    setSending(false);
    setReplyTo(null);
    if (error) { setDraft(text); toast.error(error.message); }
  }

  async function leave() {
    if (!confirm("Sair deste chat?")) return;
    const { error } = await (supabase as any).from("chat_members").delete().eq("chat_id", id).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Você saiu");
    navigate({ to: "/messages" });
  }

  async function deleteMessage(mid: string) {
    if (!confirm("Apagar para todos?")) return;
    const { error } = await (supabase as any).from("chat_messages").delete().eq("id", mid);
    if (error) return toast.error(error.message);
  }

  if (chat.isLoading) return <Skeleton className="h-96 rounded-3xl" />;
  if (!chatData) return <div className="text-center py-12">Chat não encontrado.</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-4rem)] md:rounded-2xl md:overflow-hidden md:bg-[color:var(--surface)]">
      <header className="flex items-center gap-3 px-3 h-14 glass-heavy hairline-b sticky top-0 z-10">
        <Link to="/messages" className="p-2 -ml-1 rounded-full active:bg-[color:var(--surface-2)] md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        {chatData.avatar_url ? (
          <div className="h-9 w-9 rounded-full overflow-hidden bg-[color:var(--surface-2)]">
            <SignedImage bucket="chats" path={chatData.avatar_url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] text-foreground">
            {isChannel ? <Megaphone className="h-4 w-4" strokeWidth={1.8} /> : <Users className="h-4 w-4" strokeWidth={1.8} />}
          </div>
        )}
        <button onClick={() => setMembersOpen(true)} className="flex-1 min-w-0 text-left leading-tight">
          <div className="font-semibold text-[15px] truncate">{chatData.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {isChannel ? "Canal" : "Grupo"}{chatData.description ? ` · ${chatData.description}` : ""}
          </div>
        </button>
        <SummarizeButton scope="chat" id={id} />
        <BubbleThemePicker currentId={themeId} onSelect={setBubbleTheme} />
        <MuteToggle table="muted_chats" keyCol="chat_id" keyVal={id} userId={user.id} />
        {isMember ? (
          <button onClick={leave} className="p-2 rounded-full active:bg-[color:var(--surface-2)]" aria-label="Sair">
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.data?.map((m: any) => {
          const mine = m.sender_id === user.id;
          const replied = m.reply_to ? (byId.get(m.reply_to) as any) : null;
          const rs = reactions.data?.[m.id] ?? [];
          const translated = translations[m.id];
          return (
            <div key={m.id} className={cn("flex items-end gap-2 group", mine ? "justify-end" : "justify-start")}>
              {!mine ? (
                <UserAvatar avatarPath={m.sender?.avatar_url} displayName={m.sender?.display_name ?? "?"} className="h-7 w-7" />
              ) : null}
              {mine || isAdmin ? (
                <MessageActions message={m} ctx={{ scope: "chat", ownerId: user.id }} mine={mine}
                  onReply={setReplyTo} onEdit={(x) => { setEditing(x); setDraft(x.content ?? ""); }}
                  onDelete={deleteMessage} onTranslated={(mid, t) => setTranslations((p) => ({ ...p, [mid]: t }))} />
              ) : null}
              <div className={cn("max-w-[78%] space-y-0.5", mine ? "items-end" : "items-start")}>
                {!mine && !isChannel ? (
                  <div className="text-[11px] text-muted-foreground px-3">{m.sender?.display_name}</div>
                ) : null}
                <div className={cn("rounded-[20px] px-3.5 py-2 text-[14px] leading-snug break-words",
                  mine ? bubbleTheme.mine : bubbleTheme.theirs)}>
                  {replied ? <ReplyQuote text={replied.content} /> : null}
                  {m.content}
                  {m.edited_at ? <span className={cn("ml-2 text-[10px]", mine ? "opacity-70" : "text-muted-foreground")}>editado</span> : null}
                  {translated ? <div className={cn("mt-1 pt-1 border-t text-[12px]", mine ? "border-black/20 opacity-90" : "border-white/10 text-muted-foreground")}>🌐 {translated}</div> : null}
                </div>
                <ReactionsBar reactions={rs}
                  onToggle={(emoji, mineR) => toggleReaction("chat", m.id, user.id, emoji, mineR)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["reactions", "chat"] }))} />
              </div>
              {!mine && !isAdmin ? (
                <MessageActions message={m} ctx={{ scope: "chat", ownerId: user.id }} mine={false}
                  onReply={setReplyTo} onEdit={() => {}} onDelete={() => {}}
                  onTranslated={(mid, t) => setTranslations((p) => ({ ...p, [mid]: t }))} />
              ) : null}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {canPost ? <SmartReplyBar scope="chat" id={id} onPick={(s) => setDraft(s)} /> : null}

      {replyTo || editing ? (
        <div className="px-4 py-2 hairline-t bg-[color:var(--surface)] flex items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">{editing ? "Editando:" : "Respondendo:"}</span>
          <span className="flex-1 truncate">{editing?.content ?? replyTo?.content}</span>
          <button onClick={() => { setReplyTo(null); setEditing(null); setDraft(""); }} className="p-1 rounded-full active:bg-[color:var(--surface-2)]"><X className="h-3 w-3" /></button>
        </div>
      ) : null}

      <form onSubmit={send} className="p-3 hairline-t bg-background flex items-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ScheduleButton userId={user.id} target={{ type: "chat", chatId: id }} />
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-full bg-[color:var(--surface-2)] px-4 py-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={!isMember ? "Entre no chat para conversar" : canPost ? "Mensagem ou /ia pergunta…" : "Somente admins publicam neste canal"}
            maxLength={2000}
            disabled={!canPost}
            className="border-0 bg-transparent h-8 p-0 text-[14px] focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
          />
          {draft.startsWith("/ia") ? <Sparkles className="h-4 w-4 text-primary animate-pulse shrink-0" /> : null}
        </div>
        {canPost && draft.trim() ? (
          <Button type="submit" disabled={sending} size="icon" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 shrink-0">
            <Send className="h-4 w-4" strokeWidth={2.2} />
          </Button>
        ) : null}
      </form>

      <MembersDialog
        chatId={id}
        open={membersOpen}
        onOpenChange={setMembersOpen}
        isAdmin={isAdmin}
        currentUserId={user.id}
      />
    </div>
  );
}

function MembersDialog({
  chatId,
  open,
  onOpenChange,
  isAdmin,
  currentUserId,
}: {
  chatId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const [addQuery, setAddQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const members = useQuery({
    queryKey: ["chat-members", chatId],
    enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("chat_members")
        .select("*")
        .eq("chat_id", chatId);
      const list = (data ?? []) as any[];
      const ids = list.map((m) => m.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as any[] };
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      return list.map((m) => ({ ...m, profile: pmap.get(m.user_id) }));
    },
  });

  async function addByUsername() {
    const uname = addQuery.trim().replace(/^@/, "");
    if (!uname) return;
    setAdding(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("id").eq("username", uname).maybeSingle();
      if (!prof) throw new Error("Usuário não encontrado");
      const { error } = await (supabase as any).from("chat_invites").insert({
        chat_id: chatId,
        inviter_id: currentUserId,
        invitee_id: prof.id,
      });
      if (error) throw error;
      setAddQuery("");
      toast.success("Convite enviado");
    } catch (err: any) {
      toast.error(err.message ?? "Falha");
    } finally {
      setAdding(false);
    }
  }

  async function remove(uid: string) {
    if (uid === currentUserId) return;
    if (!confirm("Remover membro?")) return;
    const { error } = await (supabase as any).from("chat_members").delete().eq("chat_id", chatId).eq("user_id", uid);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["chat-members", chatId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle>Membros</DialogTitle>
        </DialogHeader>

        {isAdmin ? (
          <div className="flex gap-2">
            <Input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              placeholder="@usuario"
              className="rounded-full"
            />
            <Button onClick={addByUsername} disabled={adding} size="icon" className="rounded-full bg-gradient-brand">
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="max-h-80 overflow-y-auto space-y-1">
          {members.data?.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
              <UserAvatar avatarPath={m.profile?.avatar_url} displayName={m.profile?.display_name ?? "?"} className="h-9 w-9" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{m.profile?.display_name}</div>
                <div className="text-xs text-muted-foreground truncate">@{m.profile?.username} · {m.role}</div>
              </div>
              {isAdmin && m.user_id !== currentUserId && m.role !== "owner" ? (
                <button onClick={() => remove(m.user_id)} className="text-xs text-destructive px-2 py-1 rounded-full hover:bg-destructive/10">
                  Remover
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// keep unused Dialog trigger import happy
void DialogTrigger;
