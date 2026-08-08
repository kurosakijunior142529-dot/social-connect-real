import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createSignedUrl, type MediaBucket } from "@/lib/media";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { toast } from "sonner";
import { Check, Copy, Download, Loader2, Send, Share2 } from "lucide-react";

export type ShareTarget = {
  /** Public link to the content (post / reel / profile). */
  url: string;
  title?: string;
  text?: string;
  /** Optional media so the sheet can offer a real download. */
  media?: {
    bucket: MediaBucket;
    path: string;
    filename?: string;
    posterPath?: string | null;
    mimeType?: string | null;
  } | null;
};

type Tab = "send" | "social" | "download";

const TABS: { id: Tab; label: string }[] = [
  { id: "send", label: "Enviar" },
  { id: "social", label: "Compartilhar" },
  { id: "download", label: "Baixar" },
];

export function ShareSheet({
  open,
  onOpenChange,
  userId,
  target,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: string;
  target: ShareTarget;
}) {
  const [tab, setTab] = useState<Tab>("send");
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const convs = useQuery({
    queryKey: ["share-targets", userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("conversations")
        .select("id, user_a, user_b, last_message_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("last_message_at", { ascending: false })
        .limit(30);
      const others = (data ?? []).map((c: any) => (c.user_a === userId ? c.user_b : c.user_a));
      if (!others.length) return [] as any[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", others);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((c: any) => ({
        id: c.id,
        other: byId.get(c.user_a === userId ? c.user_b : c.user_a),
      }));
    },
  });

  const filtered = useMemo(() => {
    const list = convs.data ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(
      (c: any) =>
        c.other?.username?.toLowerCase().includes(q) ||
        c.other?.display_name?.toLowerCase().includes(q),
    );
  }, [convs.data, query]);

  const shareText = target.text?.trim() ? `${target.text}\n${target.url}` : target.url;

  const socials = useMemo(
    () => [
      {
        id: "whatsapp",
        label: "WhatsApp",
        href: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`,
      },
      {
        id: "telegram",
        label: "Telegram",
        href: `https://t.me/share/url?url=${encodeURIComponent(target.url)}&text=${encodeURIComponent(target.text ?? "")}`,
      },
      {
        id: "facebook",
        label: "Facebook",
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(target.url)}`,
      },
      {
        id: "x",
        label: "X",
        href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(target.url)}&text=${encodeURIComponent(target.text ?? "")}`,
      },
    ],
    [shareText, target.url, target.text],
  );

  async function sendTo(convId: string) {
    if (!userId) return;
    setBusy(convId);
    const media = target.media;
    const payload: any = media
      ? {
          conversation_id: convId,
          sender_id: userId,
          kind: "video",
          media_url: media.path,
          media_bucket: media.bucket,
          media_type: media.mimeType ?? "video/mp4",
          media_name: media.filename ?? media.path.split("/").pop() ?? "video.mp4",
          poster_url: media.posterPath ?? null,
          content: target.text?.trim() ? target.text.trim() : null,
        }
      : {
          conversation_id: convId,
          sender_id: userId,
          content: shareText,
          kind: "text",
        };
    const { error } = await (supabase as any).from("messages").insert(payload);
    setBusy(null);
    if (error) {
      console.error("[share-sheet] send failed", error);
      toast.error(error.message);
    } else setSent((prev) => ({ ...prev, [convId]: true }));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(target.url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: target.title, text: target.text, url: target.url });
      } else {
        await copyLink();
      }
    } catch {
      /* cancelado pelo usuário */
    }
  }

  async function download() {
    if (!target.media) return;
    setDownloading(true);
    try {
      const signed = await createSignedUrl(target.media.bucket, target.media.path);
      if (!signed) throw new Error("Não foi possível gerar o arquivo");
      const res = await fetch(signed);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = target.media.filename ?? target.media.path.split("/").pop() ?? "video.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      toast.success("Download iniciado");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao baixar");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1 rounded-full bg-white/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                tab === t.id ? "bg-white/15 font-medium" : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "send" ? (
          <div className="mt-2">
            {!userId ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Entre para enviar em conversas.
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-full"
                />
                <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {convs.isLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma conversa
                    </div>
                  ) : (
                    filtered.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
                        <UserAvatar
                          avatarPath={c.other?.avatar_url}
                          displayName={c.other?.display_name}
                          className="h-10 w-10"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.other?.display_name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            @{c.other?.username}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={sent[c.id] ? "secondary" : "default"}
                          disabled={busy === c.id || sent[c.id]}
                          onClick={() => sendTo(c.id)}
                          className="rounded-full"
                        >
                          {sent[c.id] ? (
                            <>
                              <Check className="mr-1 h-3.5 w-3.5" /> Enviado
                            </>
                          ) : busy === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Send className="mr-1 h-3.5 w-3.5" /> Enviar
                            </>
                          )}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === "social" ? (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {socials.map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center text-sm hover:bg-white/10"
                >
                  {s.label}
                </a>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 rounded-full" onClick={copyLink}>
                <Copy className="mr-1 h-4 w-4" /> Copiar link
              </Button>
              <Button className="flex-1 rounded-full" onClick={nativeShare}>
                <Share2 className="mr-1 h-4 w-4" /> Mais
              </Button>
            </div>
          </div>
        ) : null}

        {tab === "download" ? (
          <div className="mt-2 space-y-3">
            {target.media ? (
              <Button className="w-full rounded-full" disabled={downloading} onClick={download}>
                {downloading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1 h-4 w-4" />
                )}
                Baixar vídeo
              </Button>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Este conteúdo não tem arquivo para baixar.
              </div>
            )}
            <Button variant="secondary" className="w-full rounded-full" onClick={copyLink}>
              <Copy className="mr-1 h-4 w-4" /> Copiar link
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
