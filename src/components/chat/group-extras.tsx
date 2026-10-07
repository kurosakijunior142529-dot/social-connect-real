import { useState } from "react";
import { Headphones, Images, Mic, MicOff, PhoneOff, Radio } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVoice } from "@/components/voice/voice-provider";
import { UserAvatar } from "@/components/user-avatar";
import { MessageBody } from "@/components/chat/message-body";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/* ---------------- Vibe do dia ---------------- */
export const GROUP_VIBES = [
  { key: "foco", emoji: "🎯", label: "Foco" },
  { key: "resenha", emoji: "😂", label: "Resenha" },
  { key: "sextou", emoji: "🥳", label: "Sextou" },
  { key: "musica", emoji: "🎧", label: "Música" },
  { key: "calma", emoji: "🌙", label: "Calma" },
  { key: "hype", emoji: "🔥", label: "Hype" },
] as const;

export function currentVibe(messages: any[]) {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "vibe" && new Date(m.created_at).getTime() > dayAgo) {
      return { vibe: GROUP_VIBES.find((v) => v.key === m.content) ?? null, by: m.sender };
    }
  }
  return null;
}

export function VibeStrip({
  messages,
  onPick,
  disabled,
}: {
  messages: any[];
  onPick: (key: string) => void;
  disabled?: boolean;
}) {
  const now = currentVibe(messages);
  const [open, setOpen] = useState(false);
  return (
    <div className="px-3 pt-2">
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-left transition active:scale-[0.99]"
      >
        <span className="text-lg leading-none">{now?.vibe?.emoji ?? "✨"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Vibe do dia</span>
          <span className="block truncate text-[13px] font-medium">
            {now?.vibe ? `${now.vibe.label} · por ${now.by?.display_name ?? "alguém"}` : "Defina o clima do grupo hoje"}
          </span>
        </span>
        <span className="text-[11px] text-muted-foreground">{open ? "Fechar" : "Mudar"}</span>
      </button>
      {open ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GROUP_VIBES.map((v) => (
            <button
              key={v.key}
              onClick={() => { onPick(v.key); setOpen(false); }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition active:scale-95",
                now?.vibe?.key === v.key ? "border-primary/50 bg-primary/10" : "border-[color:var(--hairline)] bg-[color:var(--surface-2)]",
              )}
            >
              <span>{v.emoji}</span>{v.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Sala de voz do grupo ---------------- */
export function GroupVoiceBar({ groupId, title }: { groupId: string; title: string }) {
  const voice = useVoice();
  const here = voice.channel?.id === groupId && voice.status !== "idle";
  if (!here) {
    return (
      <div className="px-3 pt-2">
        <button
          onClick={() => voice.join({ id: groupId, name: title, emoji: "🎧" }).catch(() => toast.error("Não foi possível entrar na sala"))}
          className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2.5 text-left transition active:scale-[0.99]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]">
            <Headphones className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">Sala de voz do grupo</span>
            <span className="block text-[11px] text-muted-foreground">Toque para entrar e conversar ao vivo</span>
          </span>
          <span className="rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground">Entrar</span>
        </button>
      </div>
    );
  }
  return (
    <div className="px-3 pt-2">
      <div className="rounded-2xl border border-primary/30 bg-[color:var(--surface)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" strokeWidth={1.8} />
          <span className="flex-1 text-[13px] font-semibold">
            {voice.status === "connecting" ? "Conectando…" : `Na sala · ${voice.members.length}`}
          </span>
          <button onClick={voice.toggleMic} aria-label="Microfone" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] active:scale-90">
            {voice.micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button onClick={voice.leave} aria-label="Sair da sala" className="grid h-9 w-9 place-items-center rounded-full bg-destructive text-destructive-foreground active:scale-90">
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
        {voice.members.length ? (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {voice.members.map((m) => (
              <div key={m.identity} className="flex w-12 shrink-0 flex-col items-center gap-1">
                <div className={cn("rounded-full p-0.5 transition", m.speaking ? "ring-2 ring-primary" : "ring-1 ring-[color:var(--hairline)]")}>
                  <UserAvatar avatarPath={m.avatarUrl} displayName={m.name} className="h-9 w-9" />
                </div>
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">{m.isLocal ? "Você" : m.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Galeria coletiva ---------------- */
export function GalleryButton({ messages }: { messages: any[] }) {
  const [open, setOpen] = useState(false);
  const media = messages.filter((m) => ["image", "video", "post", "gif"].includes(m.kind)).reverse();
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Galeria do grupo" className="p-2 rounded-full active:bg-[color:var(--surface-2)]">
        <Images className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader><SheetTitle>Momentos da turma · {media.length}</SheetTitle></SheetHeader>
          {media.length ? (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {media.map((m) => (
                <div key={m.id} className="aspect-square overflow-hidden rounded-xl bg-[color:var(--surface-2)] [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
                  <MessageBody msg={{ ...m, content: null }} mine={false} />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Ainda não mandaram fotos ou vídeos aqui.</p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ---------------- Filtros do canal ---------------- */
export type ChannelFilter = "all" | "audio" | "media" | "poll";
export const CHANNEL_FILTERS: { key: ChannelFilter; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "audio", label: "Áudios" },
  { key: "media", label: "Fotos e vídeos" },
  { key: "poll", label: "Enquetes" },
];
export function matchesFilter(m: any, f: ChannelFilter) {
  if (f === "all") return true;
  if (f === "audio") return m.kind === "audio";
  if (f === "media") return ["image", "video", "post", "gif"].includes(m.kind);
  return m.kind === "poll";
}
export function ChannelFilterBar({ value, onChange }: { value: ChannelFilter; onChange: (f: ChannelFilter) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 hairline-b">
      {CHANNEL_FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            "h-8 shrink-0 rounded-full px-3.5 text-[12px] font-medium transition active:scale-95",
            value === f.key ? "bg-foreground text-background" : "bg-[color:var(--surface-2)] text-muted-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
