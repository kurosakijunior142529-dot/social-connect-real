import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Plus, Send, Trash2, Image as ImageIcon, Loader2, MessageSquare, X, Copy, RefreshCcw, Check, Paperclip, Brain, Square, Pencil, FileText, Gem, Video, Upload } from "lucide-react";
import {
  listThreads, listMessages, generateImage,
  createThread, deleteThread, renameThread, truncateFrom,
} from "@/lib/ai-chat.functions";
import { startVideo, checkVideo, publishGenerated } from "@/lib/ai-video.functions";
import { saveAiFile } from "@/lib/ai-files.functions";
import { AI_FILE_ACCEPT, extractFile, type ExtractedFile } from "@/lib/ai-extract";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { useAuth } from "@/hooks/use-auth";
import { useAiCredits } from "@/lib/ai-credits";
import { AiCreditsSheet } from "@/components/ai/ai-credits-sheet";
import { cn } from "@/lib/utils";
import vibelyMascot from "@/assets/vibely-mascot.png";

export const Route = createFileRoute("/_authenticated/ai/$threadId")({
  ssr: false,
  component: AIThread,
  head: () => ({
    meta: [
      { title: "Vibely AI · assistente do Vibely" },
      { name: "description", content: "Converse com o Vibely AI: ideias, textos, enquetes, imagens e publicações direto no Vibely." },
      { property: "og:title", content: "Vibely AI · assistente do Vibely" },
      { property: "og:description", content: "Ideias, textos, enquetes e imagens com o assistente do Vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Attachment = { name: string; mime: string; kind: string };
type Msg = {
  id: string;
  role: string;
  content: string;
  image_url: string | null;
  video_url?: string | null;
  attachments?: Attachment[] | null;
};

function Mascot({ className, thinking }: { className?: string; thinking?: boolean }) {
  return (
    <img
      src={vibelyMascot}
      alt="Vibely AI"
      loading="lazy"
      width={816}
      height={816}
      className={cn(
        "object-contain drop-shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
        thinking && "animate-pulse",
        className,
      )}
    />
  );
}

function AIThread() {
  const { threadId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listThreads);
  const listMsgs = useServerFn(listMessages);
  const genImg = useServerFn(generateImage);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const rename = useServerFn(renameThread);
  const truncate = useServerFn(truncateFrom);
  const saveFile = useServerFn(saveAiFile);
  const startVid = useServerFn(startVideo);
  const checkVid = useServerFn(checkVideo);

  const { user } = useAuth();
  const credits = useAiCredits(user?.id);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "image" | "video">("chat");
  const [videoProgress, setVideoProgress] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ExtractedFile[]>([]);
  const [attaching, setAttaching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
  }, [messages.data, streamText, sending]);

  useEffect(() => { inputRef.current?.focus(); }, [threadId]);

  // Realtime apenas para reconciliação (outros dispositivos)
  useEffect(() => {
    const ch = supabase
      .channel(`ai_msgs_${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_messages", filter: `thread_id=eq.${threadId}` },
        () => { if (!sendingRef.current) qc.invalidateQueries({ queryKey: ["ai-messages", threadId] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [threadId, qc]);

  const sendingRef = useRef(false);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

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

  const submit = useCallback(async (override?: string) => {
    let text = (override ?? input).trim();
    const files = attachments;
    if ((!text && !files.length) || sendingRef.current) return;
    // O modo escolhido nos chips vira o comando correspondente.
    if (!text.startsWith("/")) {
      if (mode === "image") text = `/imagem ${text}`;
      else if (mode === "video") text = `/video ${text}`;
    }
    setInput("");
    setAttachments([]);
    setPending(text);
    setLastPrompt(text);
    setStreamText("");
    setStatus(null);
    setSending(true);
    sendingRef.current = true;
    try {
      if (text.startsWith("/imagem ") || text.startsWith("/img ")) {
        const prompt = text.replace(/^\/(imagem|img)\s+/, "");
        setStatus("Criando sua imagem…");
        await genImg({ data: { threadId, prompt } });
        await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      } else if (text.startsWith("/video ") || text.startsWith("/vídeo ")) {
        const prompt = text.replace(/^\/v[ií]deo\s+/, "");
        setStatus("Enviando seu vídeo para a IA…");
        const job = await startVid({ data: { threadId, prompt } });
        await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
        // Acompanha o vídeo até ficar pronto (pode levar alguns minutos).
        const started = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (Date.now() - started > 10 * 60 * 1000) {
            setVideoProgress(null);
            throw new Error("O vídeo está demorando mais que o normal. Ele aparece aqui assim que ficar pronto.");
          }
          const secs = Math.round((Date.now() - started) / 1000);
          setVideoProgress(`Gerando vídeo… ${secs}s`);
          setStatus(`Gerando vídeo… ${secs}s`);
          await new Promise((r) => setTimeout(r, 6000));
          const r = await checkVid({ data: { generationId: job.generationId } });
          if (r.status === "completed") break;
          if (r.status === "failed") throw new Error("A IA não conseguiu gerar esse vídeo. Tente outra descrição.");
        }
        setVideoProgress(null);
        await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
        await qc.invalidateQueries({ queryKey: ["ai-usage", user?.id] });
      } else {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Sessão expirada. Entre novamente.");
        // Guarda os anexos (documentos viram texto, imagens vão para o storage privado)
        for (const f of files) {
          try {
            await saveFile({
              data: {
                threadId,
                name: f.name,
                mime: f.mime,
                size: f.size,
                text: f.text,
                imageBase64: f.dataUrl,
              },
            });
          } catch {
            /* o anexo ainda vai no contexto desta mensagem */
          }
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch("/api/ai/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          signal: controller.signal,
          body: JSON.stringify({
            threadId,
            content: text || "Analise o anexo.",
            attachments: files.map((f) => ({
              name: f.name,
              mime: f.mime,
              kind: f.kind,
              dataUrl: f.dataUrl,
              text: f.text,
            })),
          }),
        });
        if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Falha ao enviar"));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        let failed: string | null = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            let ev: any;
            try { ev = JSON.parse(t.slice(5).trim()); } catch { continue; }
            if (ev.type === "delta") { acc += ev.text; setStreamText(acc); setStatus(null); }
            else if (ev.type === "status") setStatus(ev.message);
            else if (ev.type === "error") failed = ev.message;
          }
        }
        if (failed) throw new Error(failed);
        await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      }
      qc.invalidateQueries({ queryKey: ["ai-threads"] });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      } else {
        toast.error(typeof e?.message === "string" ? e.message.slice(0, 160) : "Falha ao enviar");
        setInput(text);
        setAttachments(files);
      }
    } finally {
      abortRef.current = null;
      setPending(null);
      setStreamText("");
      setStatus(null);
      setSending(false);
      sendingRef.current = false;
      inputRef.current?.focus();
    }
  }, [attachments, genImg, input, mode, qc, saveFile, startVid, checkVid, threadId, user?.id]);

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function pickFiles(list: FileList | null) {
    if (!list?.length) return;
    setAttaching(true);
    try {
      const out: ExtractedFile[] = [];
      for (const file of Array.from(list).slice(0, 3)) {
        try {
          out.push(await extractFile(file));
        } catch (e: any) {
          toast.error(String(e?.message ?? "Arquivo não suportado").slice(0, 140));
        }
      }
      if (out.length) setAttachments((prev) => [...prev, ...out].slice(0, 4));
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Regenerar: apaga a resposta e reenvia o último pedido
  async function regenerate(assistantId: string) {
    if (!lastPrompt || sendingRef.current) return;
    try {
      await truncate({ data: { threadId, messageId: assistantId } });
      await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      await submit(lastPrompt);
    } catch (e: any) {
      toast.error(String(e?.message ?? "Não consegui regenerar").slice(0, 140));
    }
  }

  // Editar e reenviar: apaga a mensagem (e o que veio depois) e manda de novo
  async function editAndResend(messageId: string, text: string) {
    if (sendingRef.current) return;
    try {
      await truncate({ data: { threadId, messageId } });
      await qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      await submit(text);
    } catch (e: any) {
      toast.error(String(e?.message ?? "Não consegui reenviar").slice(0, 140));
    }
  }

  function askImage() {
    const t = input.trim();
    if (!t) return toast.info("Descreva a imagem primeiro");
    submit(`/imagem ${t}`);
  }

  const msgs = (messages.data ?? []) as Msg[];

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
          <Link
            to="/ai/memory"
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs text-muted-foreground hover:bg-[color:var(--surface)] hover:text-foreground"
          >
            <Brain className="h-4 w-4" /> Memória da IA
          </Link>
        </div>
        <div className="px-2 pb-4 overflow-y-auto h-[calc(100%-6rem)]">
          {(threads.data ?? []).map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-2 py-2 mb-0.5 text-sm cursor-pointer transition-colors",
                t.id === threadId
                  ? "bg-[color:var(--surface-2)] ring-1 ring-primary/30"
                  : "hover:bg-[color:var(--surface)]",
              )}
              onClick={() => { nav({ to: "/ai/$threadId", params: { threadId: t.id } }); setSidebarOpen(false); }}
            >
              <MessageSquare className={cn("h-4 w-4 shrink-0", t.id === threadId ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1 truncate">{t.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const title = prompt("Novo nome da conversa", t.title)?.trim();
                  if (title) {
                    rename({ data: { id: t.id, title: title.slice(0, 120) } })
                      .then(() => qc.invalidateQueries({ queryKey: ["ai-threads"] }))
                      .catch(() => toast.error("Não consegui renomear"));
                  }
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                aria-label="Renomear"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
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

      {sidebarOpen ? (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hairline-b flex items-center gap-3 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]">
            <MessageSquare className="h-4 w-4" />
          </button>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--surface-2)] ring-1 ring-primary/30">
            <Mascot className="h-8 w-8" thinking={sending} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Vibely AI</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {videoProgress ?? (sending ? "digitando…" : "textos, imagens, vídeos e publicações")}
            </div>
          </div>
          <button
            onClick={() => setCreditsOpen(true)}
            title="Créditos, limites e histórico"
            className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] ring-1 ring-primary/25 px-3 h-9 text-xs font-semibold hover:bg-[color:var(--surface)]"
          >
            <Gem className="h-3.5 w-3.5 text-primary" />
            <span className="tabular">{(credits.data ?? 0).toLocaleString("pt-BR")}</span>
            <Plus className="h-3 w-3 text-muted-foreground" />
          </button>
          <Link
            to="/"
            aria-label="Sair do chat"
            title="Voltar ao Vibely"
            className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] hover:bg-[color:var(--surface)] text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Link>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
          {msgs.length === 0 && !sending ? (
            <EmptyState onPick={(prompt) => submit(prompt)} />
          ) : null}
          {msgs.map((m, i) => (
            <MsgBubble
              key={m.id}
              m={m}
              onRetry={
                m.role === "assistant" && i === msgs.length - 1 && lastPrompt && !sending
                  ? () => regenerate(m.id)
                  : undefined
              }
              onEdit={
                m.role === "user" && !sending
                  ? (text) => editAndResend(m.id, text)
                  : undefined
              }
            />
          ))}
          {pending ? <MsgBubble m={{ id: "pending", role: "user", content: pending, image_url: null }} /> : null}
          {streamText ? <MsgBubble m={{ id: "stream", role: "assistant", content: streamText, image_url: null }} /> : null}
          {sending && !streamText ? (
            <div className="flex items-center gap-3">
              <Mascot className="h-8 w-8" thinking />
              <span className="text-sm text-muted-foreground animate-pulse">{status ?? "Pensando…"}</span>
            </div>
          ) : null}
        </div>

        <div className="p-3 hairline-t bg-background">
          <div className="mb-2 inline-flex w-full rounded-full bg-[color:var(--surface-2)] p-1">
            {MODES.map((mo) => (
              <button
                key={mo.id}
                onClick={() => setMode(mo.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition",
                  mode === mo.id
                    ? "bg-background text-foreground shadow-sm ring-1 ring-primary/25"
                    : "text-muted-foreground",
                )}
              >
                <mo.icon className={cn("h-3.5 w-3.5", mode === mo.id && "text-primary")} />
                {mo.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => submit(q.prompt)}
                disabled={sending}
                className="shrink-0 rounded-full bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-xs"
                >
                  {f.kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remover anexo"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={AI_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => pickFiles(e.target.files)}
          />

          <div className="rounded-3xl bg-[color:var(--surface)] ring-1 ring-[color:var(--hairline)] focus-within:ring-primary/40 p-2 pl-4 flex items-end gap-2 transition-shadow">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder={
                mode === "image"
                  ? "Descreva a imagem que você quer criar…"
                  : mode === "video"
                    ? "Descreva o vídeo que você quer criar…"
                    : "Pergunte, peça uma enquete, um post ou /imagem <descrição>"
              }
              rows={2}
              className="min-h-[60px] max-h-44 resize-none border-0 bg-transparent px-0 py-3 text-base focus-visible:ring-0 focus-visible:outline-none"
            />
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={sending || attaching}
              title="Anexar arquivo ou imagem"
            >
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="rounded-full shrink-0" onClick={askImage} disabled={sending} title="Gerar imagem">
              <ImageIcon className="h-4 w-4" />
            </Button>
            {sending ? (
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full shrink-0 text-red-400"
                onClick={stopGeneration}
                title="Parar geração"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="rounded-full shrink-0"
                onClick={() => submit()}
                disabled={!input.trim() && !attachments.length}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Vibely AI pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </div>
    </div>
  );
}

function MsgBubble({ m, onRetry, onEdit }: { m: Msg; onRetry?: () => void; onEdit?: (text: string) => void }) {
  const isUser = m.role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);

  function copy() {
    navigator.clipboard?.writeText(m.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "")}>
      {!isUser ? <Mascot className="h-8 w-8 shrink-0 mt-1" /> : null}
      <div className={cn("max-w-[85%] min-w-0", isUser ? "text-right" : "")}>
        <div className={cn(
          "rounded-3xl px-4 py-2.5 text-left",
          isUser ? "bg-primary text-primary-foreground rounded-br-lg inline-block" : "bg-transparent px-0",
        )}>
          {m.image_url ? <AiImage path={m.image_url} /> : null}
          {m.attachments?.length ? (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {m.attachments.map((a, i) => (
                <span
                  key={`${a.name}-${i}`}
                  className="flex items-center gap-1 rounded-full bg-black/20 px-2 py-1 text-[11px]"
                >
                  {a.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  <span className="max-w-[120px] truncate">{a.name}</span>
                </span>
              ))}
            </div>
          ) : null}
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="bg-background/20 text-foreground"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(m.content); }}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => { setEditing(false); onEdit?.(draft.trim()); }}
                  disabled={!draft.trim() || draft.trim() === m.content}
                >
                  Reenviar
                </Button>
              </div>
            </div>
          ) : m.content ? (
            <div className={cn("prose prose-sm dark:prose-invert max-w-none leading-relaxed", isUser ? "prose-invert" : "")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{m.content}</ReactMarkdown>
            </div>
          ) : null}
        </div>
        {isUser && onEdit && !editing && m.id !== "pending" ? (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => { setDraft(m.content); setEditing(true); }}
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]"
              aria-label="Editar mensagem"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {!isUser && m.id !== "stream" ? (
          <div className="flex items-center gap-1 pt-1">
            <button onClick={copy} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]" aria-label="Copiar">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {onRetry ? (
              <button onClick={onRetry} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]" aria-label="Refazer">
                <RefreshCcw className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const MD = {
  a: ({ href, children }: any) => {
    const internal = typeof href === "string" && href.startsWith("/");
    if (internal) {
      return (
        <Link to={href} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-primary no-underline font-medium">
          {children}
        </Link>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
};

function AiImage({ path }: { path: string }) {
  const url = useSignedUrl("posts", path);
  if (!url.data) return <div className="h-56 w-full rounded-xl bg-white/5 animate-pulse mb-2" />;
  return <img src={url.data} alt="Imagem gerada" className="rounded-xl mb-2 max-h-80 w-auto" />;
}

const QUICK = [
  { label: "🔥 Bombando agora", prompt: "Quais são as publicações do momento no Vibely?" },
  { label: "📊 Criar enquete", prompt: "Crie uma enquete divertida para o meu perfil" },
  { label: "📝 Publicar texto", prompt: "Escreva e publique um post curto e criativo para mim" },
  { label: "🎬 Postar vídeo", prompt: "Quero postar um vídeo, me ajude passo a passo" },
  { label: "🎨 Gerar imagem", prompt: "/imagem paisagem neon futurista, ultra detalhada" },
];

const EXAMPLES = [
  { icon: "💡", label: "Explique um conceito", prompt: "Me explique como funciona o WebRTC de forma simples" },
  { icon: "✍️", label: "Escreva um texto", prompt: "Escreva uma legenda criativa para uma foto de pôr do sol" },
  { icon: "🎨", label: "Gere uma imagem", prompt: "/imagem gato astronauta no espaço, arte digital vibrante" },
  { icon: "🔥", label: "Ver o que bomba", prompt: "Quais são as publicações do momento no Vibely?" },
];

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-6">
      <div className="relative grid h-28 w-28 place-items-center">
        <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl" />
        <Mascot className="relative h-28 w-28" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-display font-semibold">Oi! Eu sou o Vibely AI</h2>
        <p className="text-sm text-muted-foreground mt-1">Peça ideias, textos, enquetes, imagens ou publique direto por aqui.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            onClick={() => onPick(e.prompt)}
            className="text-left rounded-2xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] ring-1 ring-transparent hover:ring-primary/25 p-3 transition-all"
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
