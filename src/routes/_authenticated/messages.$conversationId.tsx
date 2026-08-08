import { createFileRoute, Link } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Ban, Phone, Video, X, Sparkles, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBlocks } from "@/hooks/use-blocks";
import { useCall } from "@/components/call-provider";
import { MessageActions, ReactionsBar, ReplyQuote } from "@/components/message-actions";
import { ScheduleButton } from "@/components/schedule-message";
import {
  SummarizeButton,
  SmartReplyBar,
  useMessageReactions,
  toggleReaction,
} from "@/components/chat-extras";
import { useAiActions } from "@/hooks/use-ai-actions";
import { toast } from "sonner";
import { AttachMenu } from "@/components/chat/attach-menu";
import { AudioRecorder } from "@/components/chat/audio-recorder";
import { MessageBody } from "@/components/chat/message-body";
import { ConversationMenu } from "@/components/chat/conversation-menu";
import { ForwardDialog } from "@/components/chat/forward-dialog";
import { PinnedSheet } from "@/components/chat/pinned-sheet";
import { ChatSearchBar } from "@/components/chat/search-bar";
import { TypingIndicator, useConversationPresence } from "@/components/chat/typing-indicator";
import { uploadChatFile, kindForFile, bucketForFile } from "@/lib/chat-media";
import { GifPicker } from "@/components/chat/gif-picker";
import { StickerPicker } from "@/components/chat/sticker-picker";
import { captureVideoPoster } from "@/lib/media/video-thumbnail";
import { Sticker, Smile, SmilePlus } from "lucide-react";
import { AppEmojiPicker } from "@/components/chat/app-emoji";
import { WallpaperPicker, wallpaperClass, useCustomWallpaperUrl } from "@/components/chat/wallpaper-picker";
import { useChatPrefs } from "@/lib/bubble-themes";
import { ChatCustomizeSheet } from "@/components/chat/chat-customize-sheet";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string | null } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string | null } | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [forwardMsg, setForwardMsg] = useState<any>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { prefs, theme: bubbleTheme, font: chatFont } = useChatPrefs(`dm-${conversationId}`);
  const blocks = useBlocks();
  const { startCall } = useCall();
  const ai = useAiActions();
  const presence = useConversationPresence(`dm-${conversationId}`, user.id);

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

  const customWallpaperUrl = useCustomWallpaperUrl(
    (conv.data as any)?.wallpaper_type,
    (conv.data as any)?.wallpaper_value,
  );

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return ((data ?? []) as any[]).slice().reverse();
    },
  });

  const messageIds = useMemo(
    () => (messages.data ?? []).map((m) => m.id),
    [messages.data],
  );
  const reactions = useMessageReactions("dm", messageIds, user.id);

  const pinnedList = useMemo(
    () => (messages.data ?? []).filter((m) => m.pinned_at),
    [messages.data],
  );
  const latestPinned = pinnedList[pinnedList.length - 1];

  // realtime — patch the cache in place instead of refetching everything
  useEffect(() => {
    const key = ["messages", conversationId];
    const channel = supabase
      .channel(`msg-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload: any) => {
          queryClient.setQueryData<any[]>(key, (prev) => {
            const list = prev ?? [];
            if (payload.eventType === "INSERT") {
              if (list.some((m) => m.id === payload.new.id)) return list;
              return [...list, payload.new];
            }
            if (payload.eventType === "UPDATE") {
              return list.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m));
            }
            if (payload.eventType === "DELETE") {
              return list.filter((m) => m.id !== payload.old.id);
            }
            return list;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_message_reactions" },
        () => queryClient.invalidateQueries({ queryKey: ["reactions", "dm"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // mark incoming as read (only ids we haven't marked yet)
  const readMarked = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unread = (messages.data ?? []).filter(
      (m) => m.sender_id !== user.id && !m.read_at && !readMarked.current.has(m.id),
    );
    if (!unread.length) return;
    const ids = unread.map((m) => m.id);
    ids.forEach((id) => readMarked.current.add(id));
    const t = window.setTimeout(() => {
      (supabase as any)
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .then(() => {}, () => ids.forEach((id) => readMarked.current.delete(id)));
    }, 300);
    return () => window.clearTimeout(t);
  }, [messages.data, user.id]);

  const firstScroll = useRef(true);
  useEffect(() => {
    if (!messages.data?.length) return;
    const behavior = firstScroll.current ? "auto" : "smooth";
    firstScroll.current = false;
    bottomRef.current?.scrollIntoView({ behavior: behavior as ScrollBehavior, block: "end" });
  }, [messages.data?.length]);


  function noteTyping() {
    presence.setMe("typing");
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => presence.setMe("idle"), 2500);
  }

  async function sendPayload(payload: any) {
    const { error } = await (supabase as any).from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      ...payload,
    });
    if (error) toast.error(error.message);
  }

  async function handleFile(file: File) {
    if (isBlockedPair) return;
    const toastId = toast.loading("Enviando…");
    try {
      const bucket = bucketForFile(file);
      const kind = kindForFile(file);
      const { path } = await uploadChatFile(user.id, file, bucket);
      let poster_url: string | null = null;
      if (kind === "video") {
        try {
          const posterBlob = await captureVideoPoster(file);
          if (posterBlob) {
            const posterUpload = await uploadChatFile(
              user.id,
              posterBlob,
              bucket,
              `${crypto.randomUUID()}.jpg`,
            );
            poster_url = posterUpload.path;
          }
        } catch { /* ignore poster failure */ }
      }
      await sendPayload({
        kind,
        media_url: path,
        media_bucket: bucket,
        media_type: file.type || null,
        media_name: file.name,
        media_size: file.size,
        poster_url,
      });
      toast.success("Enviado", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao enviar", { id: toastId });
    }
  }

  async function handleGif(g: { url: string; w: number; h: number; alt: string }) {
    if (isBlockedPair) return;
    await sendPayload({
      kind: "gif",
      media_url: g.url,
      media_type: "image/gif",
      content: g.alt,
      meta: { w: g.w, h: g.h },
    });
  }

  async function handleSticker(s: { url: string; name: string; path?: string; own?: boolean }) {
    if (isBlockedPair) return;
    await sendPayload({
      kind: "sticker",
      media_url: s.own && s.path ? s.path : s.url,
      ...(s.own && s.path ? { media_bucket: "stickers" } : {}),
      media_type: "image/png",
      content: s.name,
    });
  }

  async function handleAudio(file: File, durationMs: number) {
    if (isBlockedPair) return;
    try {
      presence.setMe("recording");
      const { path, bucket } = await uploadChatFile(user.id, file, "chat-audio");
      await sendPayload({
        kind: "audio",
        media_url: path,
        media_bucket: bucket,
        media_type: file.type,
        media_size: file.size,
        media_duration_ms: durationMs,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao enviar áudio");
    } finally {
      presence.setMe("idle");
    }
  }

  async function handleLocation(coords: { lat: number; lng: number }) {
    if (isBlockedPair) return;
    await sendPayload({ kind: "location", meta: coords });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    if (editing) {
      setSending(true);
      const prev = (messages.data ?? []).find((m) => m.id === editing.id)?.content ?? null;
      const { error } = await (supabase as any)
        .from("messages")
        .update({ content: text, edited_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (!error) {
        await (supabase as any).from("message_edits").insert({
          source: "dm",
          message_id: editing.id,
          previous_content: prev,
          editor_id: user.id,
        });
      }
      setSending(false);
      setEditing(null);
      setDraft("");
      if (error) toast.error(error.message);
      return;
    }

    if (text.startsWith("/ia ")) {
      const q = text.slice(4).trim();
      setDraft("");
      const answer = await ai.ask(q);
      if (answer) {
        await sendPayload({ kind: "text", content: `🤖 ${q}\n\n${answer}` });
      }
      return;
    }

    setSending(true);
    setDraft("");
    presence.setMe("idle");
    const payload: any = { kind: "text", content: text };
    if (replyTo) payload.reply_to = replyTo.id;
    await sendPayload(payload);
    setSending(false);
    setReplyTo(null);
  }

  async function deleteMessage(id: string) {
    if (!confirm("Apagar para todos?")) return;
    const { error } = await (supabase as any).from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  async function togglePin(id: string, pin: boolean) {
    const { error } = await (supabase as any)
      .from("messages")
      .update(
        pin
          ? { pinned_at: new Date().toISOString(), pinned_by: user.id }
          : { pinned_at: null, pinned_by: null },
      )
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(pin ? "Fixada" : "Desafixada");
  }

  const other = conv.data?.other ?? null;
  const otherId = other?.id ?? null;
  const isBlockedPair = otherId ? blocks.data?.hidden.has(otherId) ?? false : false;
  const iBlocked = otherId ? blocks.data?.blocked.has(otherId) ?? false : false;

  const visibleMessages = useMemo(() => {
    let list = (messages.data ?? []).filter((m) => !blocks.data?.blockedBy.has(m.sender_id));
    if (searchOpen && searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((m) => (m.content ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [messages.data, blocks.data, searchOpen, searchQ]);

  const byId = useMemo(
    () => new Map(visibleMessages.map((m) => [m.id, m])),
    [visibleMessages],
  );

  // grouping metadata: date separators + consecutive bubbles from same sender
  const rows = useMemo(() => {
    const GROUP_MS = 5 * 60_000;
    return visibleMessages.map((m, i) => {
      const prev = visibleMessages[i - 1];
      const next = visibleMessages[i + 1];
      const ts = new Date(m.created_at).getTime();
      const sameSenderPrev =
        !!prev && prev.sender_id === m.sender_id && ts - new Date(prev.created_at).getTime() < GROUP_MS;
      const sameSenderNext =
        !!next && next.sender_id === m.sender_id && new Date(next.created_at).getTime() - ts < GROUP_MS;
      const daySep =
        !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
      return { m, first: !sameSenderPrev, last: !sameSenderNext, daySep };
    });
  }, [visibleMessages]);

  const onTranslated = useCallback(
    (id: string, t: string) => setTranslations((p) => ({ ...p, [id]: t })),
    [],
  );
  const onForward = useCallback((msg: any) => setForwardMsg(msg), []);
  const onEditMsg = useCallback((x: { id: string; content: string | null }) => {
    setEditing(x);
    setDraft(x.content ?? "");
  }, []);
  const onToggleReaction = useCallback(
    (id: string, emoji: string, mineR: boolean) =>
      toggleReaction("dm", id, user.id, emoji, mineR).then(() =>
        queryClient.invalidateQueries({ queryKey: ["reactions", "dm"] }),
      ),
    [user.id, queryClient],
  );


  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-4rem)] md:rounded-2xl md:overflow-hidden md:bg-[color:var(--surface)]">
      <header className="flex items-center gap-2 px-3 h-14 glass-heavy hairline-b sticky top-0 z-10">
        <Link
          to="/messages"
          className="p-2 -ml-1 rounded-full active:bg-[color:var(--surface-2)] md:hidden"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        {other ? (
          <>
            <Link to="/u/$username" params={{ username: other.username }} className="flex items-center gap-2 min-w-0 flex-1">
              <UserAvatar
                avatarPath={other.avatar_url}
                displayName={other.display_name}
                className="h-9 w-9"
              />
              <div className="min-w-0 leading-tight">
                <div className="font-semibold text-[15px] truncate">{other.display_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  @{other.username}
                </div>
              </div>
            </Link>
            <SummarizeButton scope="dm" id={conversationId} />
            <button
              onClick={() =>
                startCall(
                  {
                    id: other.id,
                    username: other.username,
                    display_name: other.display_name,
                    avatar_url: other.avatar_url,
                  },
                  "audio",
                )
              }
              disabled={isBlockedPair}
              className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
              aria-label="Voz"
            >
              <Phone className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
            <button
              onClick={() =>
                startCall(
                  {
                    id: other.id,
                    username: other.username,
                    display_name: other.display_name,
                    avatar_url: other.avatar_url,
                  },
                  "video",
                )
              }
              disabled={isBlockedPair}
              className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
              aria-label="Vídeo"
            >
              <Video className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
            <ConversationMenu
              scope="dm"
              parentId={conversationId}
              currentUserId={user.id}
              otherUserId={otherId}
              onOpenSearch={() => setSearchOpen(true)}
              onOpenPinned={() => setPinnedOpen(true)}
              onOpenWallpaper={() => setWallpaperOpen(true)}
              onOpenCustomize={() => setCustomizeOpen(true)}
            />

          </>
        ) : null}
      </header>

      {searchOpen ? (
        <ChatSearchBar
          value={searchQ}
          onChange={setSearchQ}
          count={visibleMessages.length}
          onClose={() => {
            setSearchOpen(false);
            setSearchQ("");
          }}
        />
      ) : null}

      {latestPinned ? (
        <button
          onClick={() => setPinnedOpen(true)}
          className="flex items-center gap-2 px-4 py-2 hairline-b bg-[color:var(--surface)] text-left w-full"
        >
          <span className="text-primary text-xs">📌</span>
          <span className="text-[12px] text-muted-foreground truncate flex-1">
            {latestPinned.content ?? "Mensagem fixada"}
          </span>
          <span className="text-[10px] text-muted-foreground">{pinnedList.length}</span>
        </button>
      ) : null}

      {isBlockedPair ? (
        <div className="px-4 py-2 bg-destructive/10 hairline-b text-[13px] text-destructive flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          <span>
            {iBlocked ? "Você bloqueou este usuário." : "Não é possível enviar mensagens."}
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "relative flex-1 overflow-y-auto px-4 py-4 space-y-1.5",
          chatFont.className,
          (conv.data as any)?.wallpaper_type === "custom"
            ? "bg-background"
            : wallpaperClass((conv.data as any)?.wallpaper_type),
        )}
        style={
          (conv.data as any)?.wallpaper_type === "custom" && customWallpaperUrl
            ? {
                backgroundImage: `url(${customWallpaperUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="pointer-events-none absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
        {rows.map(({ m, first, last, daySep }) => (
          <MessageRow
            key={m.id}
            m={m}
            mine={m.sender_id === user.id}
            first={first}
            last={last}
            daySep={daySep}
            userId={user.id}
            radius={prefs.radius}
            bubbleMine={bubbleTheme.mine}
            bubbleTheirs={bubbleTheme.theirs}
            replied={m.reply_to ? byId.get(m.reply_to) ?? null : null}
            reactions={reactions.data?.[m.id] ?? EMPTY_REACTIONS}
            translated={translations[m.id]}
            onReply={setReplyTo}
            onEdit={onEditMsg}
            onDelete={deleteMessage}
            onTranslated={onTranslated}
            onForward={onForward}
            onPinToggle={togglePin}
            onToggleReaction={onToggleReaction}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      <TypingIndicator state={presence.others} name={other?.display_name} />

      {!isBlockedPair ? (
        <SmartReplyBar scope="dm" id={conversationId} onPick={(s) => setDraft(s)} />
      ) : null}

      {replyTo || editing ? (
        <div className="px-4 py-2 hairline-t bg-[color:var(--surface)] flex items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">{editing ? "Editando:" : "Respondendo:"}</span>
          <span className="flex-1 truncate">{editing?.content ?? replyTo?.content}</span>
          <button
            onClick={() => {
              setReplyTo(null);
              setEditing(null);
              setDraft("");
            }}
            className="p-1 rounded-full active:bg-[color:var(--surface-2)]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      <form
        onSubmit={send}
        className="p-3 hairline-t bg-background flex items-end gap-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <AttachMenu onFile={handleFile} onLocation={handleLocation} disabled={isBlockedPair} />
        <GifPicker
          onPick={handleGif}
          trigger={
            <button
              type="button"
              disabled={isBlockedPair}
              aria-label="GIF"
              className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
            >
              <Sticker className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
          }
        />
        <StickerPicker
          userId={user.id}
          onPick={handleSticker}
          trigger={
            <button
              type="button"
              disabled={isBlockedPair}
              aria-label="Figurinhas"
              className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
            >
              <Smile className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
          }
        />
        <AppEmojiPicker onPick={(code) => setDraft((d) => (d ? `${d} ${code}` : code))}>
          <button
            type="button"
            disabled={isBlockedPair}
            aria-label="Emojis do app"
            className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
          >
            <SmilePlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        </AppEmojiPicker>
        <ScheduleButton userId={user.id} target={{ type: "dm", conversationId }} />
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-full bg-[color:var(--surface-2)] px-4 py-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!editing) noteTyping();
            }}
            placeholder={
              isBlockedPair
                ? "Mensagens desativadas"
                : editing
                ? "Editar mensagem…"
                : "Mensagem ou /ia pergunta…"
            }
            maxLength={2000}
            disabled={isBlockedPair}
            className="border-0 bg-transparent h-8 p-0 text-[14px] focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
          />
          {draft.startsWith("/ia") ? (
            <Sparkles className="h-4 w-4 text-primary animate-pulse shrink-0" />
          ) : null}
        </div>
        {draft.trim() && !isBlockedPair ? (
          <Button
            type="submit"
            disabled={sending}
            size="icon"
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 shrink-0"
          >
            <Send className="h-4 w-4" strokeWidth={2.2} />
          </Button>
        ) : (
          <AudioRecorder onSend={handleAudio} disabled={isBlockedPair} />
        )}
      </form>

      <ForwardDialog
        open={!!forwardMsg}
        onOpenChange={(o) => !o && setForwardMsg(null)}
        userId={user.id}
        message={forwardMsg}
      />
      <PinnedSheet
        open={pinnedOpen}
        onOpenChange={setPinnedOpen}
        scope="dm"
        parentId={conversationId}
        currentUserId={user.id}
      />
      <WallpaperPicker
        conversationId={conversationId}
        current={(conv.data as any)?.wallpaper_type}
        currentValue={(conv.data as any)?.wallpaper_value}
        open={wallpaperOpen}
        onOpenChange={setWallpaperOpen}
      />
      <ChatCustomizeSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        chatId={`dm-${conversationId}`}
        dmConversationId={conversationId}
        currentWallpaper={(conv.data as any)?.wallpaper_type}
        currentWallpaperValue={(conv.data as any)?.wallpaper_value}
      />
    </div>
  );
}
