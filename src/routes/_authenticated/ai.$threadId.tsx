import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Plus, Send, Sparkles, Trash2, Image as ImageIcon, Loader2, MessageSquare } from "lucide-react";
import {
  listThreads, listMessages, sendMessage, generateImage,
  createThread, deleteThread,
} from "@/lib/ai-chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai/$threadId")({
  ssr: false,
  component: AIThread,
  head: () => ({ meta: [{ title: "Vibely AI · Gemini" }] }),
});

function AIThread() {
  const { threadId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listThreads);
  const listMsgs = useServerFn(listMessages);
  const send = useServerFn(sendMessage);
  const genImg = useServerFn(generateImage);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const threads = useQuery({ queryKey: ["ai-threads"], queryFn: () => list() });
  const messages = useQuery({
    queryKey: ["ai-messages", threadId],
    queryFn: () => listMsgs({ data: { threadId } }),
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data, sending]);

  useEffect(() => { inputRef.current?.focus(); }, [threadId]);

  // Realtime: refetch on message insert
  useEffect(() => {
    const ch = supabase
      .channel(`ai_msgs_${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_messages", filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["ai-messages", threadId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [threadId, qc]);

  const newThread = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["ai-threads"] });
      nav({ to: "/ai/$threadId", params: { threadId: t.id } });
    },
  });

  const removeThread = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["ai-threads"] });
      if (id === threadId) {
        const remaining = (threads.data ?? []).filter((t) => t.id !== id);
        if (remaining[0]) nav({ to: "/ai/$threadId", params: { threadId: remaining[0].id } });
        else nav({ to: "/ai" });
      }
    },
  });

  async function submit(override?: string) {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setPending(text);
    setSending(true);
    try {
      if (text.startsWith("/imagem ") || text.startsWith("/img ")) {
        const prompt = text.replace(/^\/(imagem|img)\s+/, "");
        await genImg({ data: { threadId, prompt } });
      } else {
        await send({ data: { threadId, content: text } });
      }
      await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["ai-threads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
      setInput(text);
    } finally {
      setPending(null);
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function askImage() {
    const t = input.trim();
    if (!t) return toast.info("Descreva a imagem primeiro");
    submit(`/imagem ${t}`);
  }

  const msgs = messages.data ?? [];


  return (
    <div className="fixed inset-0 z-40 flex bg-background text-foreground md:pl-60">
      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-72 border-r border-[color:var(--hairline)] bg-[color:var(--sidebar)] transition-transform md:translate-x-0 md:pl-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )} style={{ paddingLeft: "0" }}>
        <div className="p-3 space-y-2">
          <Link to="/" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Voltar ao Vibely
          </Link>
          <Button className="w-full" onClick={() => newThread.mutate()} disabled={newThread.isPending}>
            <Plus className="h-4 w-4 mr-2" /> Nova conversa
          </Button>
        </div>
        <div className="px-2 pb-4 overflow-y-auto h-[calc(100%-6rem)]">
          {(threads.data ?? []).map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-2 py-2 mb-0.5 text-sm cursor-pointer",
                t.id === threadId ? "bg-[color:var(--surface-2)]" : "hover:bg-[color:var(--surface)]",
              )}
              onClick={() => { nav({ to: "/ai/$threadId", params: { threadId: t.id } }); setSidebarOpen(false); }}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{t.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm("Excluir conversa?")) removeThread.mutate(t.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Overlay on mobile when sidebar open */}
      {sidebarOpen ? (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hairline-b flex items-center gap-3 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]">
            <MessageSquare className="h-4 w-4" />
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Vibely AI</div>
            <div className="text-[11px] text-muted-foreground">Gemini · gere textos e imagens</div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {msgs.length === 0 && !sending ? (
            <EmptyState onPick={(prompt) => setInput(prompt)} />
          ) : null}
          {msgs.map((m) => <MsgBubble key={m.id} m={m} />)}
          {sending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Vibely AI pensando…
            </div>
          ) : null}
        </div>

        <div className="p-3 hairline-t bg-background">
          <div className="rounded-2xl bg-[color:var(--surface)] p-2 flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Pergunte qualquer coisa… (/imagem <descrição> para gerar imagens)"
              rows={1}
              className="min-h-[42px] max-h-40 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:outline-none"
            />
            <Button size="icon" variant="ghost" onClick={askImage} disabled={sending} title="Gerar imagem">
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={submit} disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Vibely AI pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </div>
    </div>
  );
}

function MsgBubble({ m }: { m: { id: string; role: string; content: string; image_url: string | null } }) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "")}>
      {!isUser ? (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
      ) : null}
      <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", isUser ? "bg-primary text-primary-foreground" : "bg-transparent")}>
        {m.image_url ? <AiImage path={m.image_url} /> : null}
        {m.content ? (
          <div className={cn("prose prose-sm dark:prose-invert max-w-none", isUser ? "prose-invert" : "")}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AiImage({ path }: { path: string }) {
  const url = useSignedUrl("posts", path);
  if (!url.data) return <div className="h-56 w-full rounded-xl bg-white/5 animate-pulse mb-2" />;
  return <img src={url.data} alt="Imagem gerada" className="rounded-xl mb-2 max-h-80 w-auto" />;
}

const EXAMPLES = [
  { icon: "💡", label: "Explique um conceito", prompt: "Me explique como funciona o WebRTC de forma simples" },
  { icon: "✍️", label: "Escreva um texto", prompt: "Escreva uma legenda criativa para uma foto de pôr do sol" },
  { icon: "🎨", label: "Gere uma imagem", prompt: "/imagem gato astronauta no espaço, arte digital vibrante" },
  { icon: "💻", label: "Ajude com código", prompt: "Como faço um debounce em React?" },
];

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-elegant">
        <Sparkles className="h-8 w-8" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-display font-semibold">Vibely AI</h2>
        <p className="text-sm text-muted-foreground mt-1">Powered by Gemini · texto + imagens</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            onClick={() => onPick(e.prompt)}
            className="text-left rounded-2xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] p-3 transition-colors"
          >
            <div className="text-lg">{e.icon}</div>
            <div className="text-sm font-medium mt-1">{e.label}</div>
            <div className="text-[11px] text-muted-foreground truncate">{e.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
