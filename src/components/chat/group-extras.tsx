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
function VoiceBars({ active }: { active: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full bg-primary", active ? "voice-bar" : "h-1 opacity-40")}
          style={active ? { height: "100%", animationDelay: `${i * 0.15}s` } : undefined}
        />
      ))}
    </span>
  );
}

export function GroupVoiceBar({ groupId, title }: { groupId: string; title: string }) {
  const voice = useVoice();
  const here = voice.channel?.id === groupId && voice.status !== "idle";
  if (!here) {
    return (
      <div className="px-4 pb-2 pt-1">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[color:var(--surface)] px-5 py-7 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/12 text-primary">
            <Headphones className="h-7 w-7" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-[15px] font-semibold">Ninguém falando ainda</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Entre e chame a turma de {title} para conversar ao vivo</p>
          </div>
          <button
            onClick={() => voice.join({ id: groupId, name: title, emoji: "🎧" }).catch(() => toast.error("Não foi possível entrar na sala"))}
            className="mt-1 h-11 w-full rounded-full bg-primary text-[14px] font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            Entrar na sala
          </button>
        </div>
      </div>
    );
  }
  const connecting = voice.status === "connecting";
  return (
    <div className="px-4 pb-2 pt-1">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Radio className={cn("h-3.5 w-3.5", connecting ? "animate-pulse" : "text-primary")} />
        {connecting ? "Conectando…" : `Ao vivo · ${voice.members.length} ${voice.members.length === 1 ? "pessoa" : "pessoas"}`}
      </div>
      <div className="grid max-h-[46vh] grid-cols-3 gap-4 overflow-y-auto py-2">
        {voice.members.map((m) => {
          const muted = m.isLocal && !voice.micEnabled;
          return (
            <div key={m.identity} className="flex flex-col items-center gap-1.5">
              <div className={cn("relative rounded-full p-1 transition", m.speaking ? "voice-speaking ring-2 ring-primary" : "ring-1 ring-[color:var(--hairline)]")}>
                <UserAvatar avatarPath={m.avatarUrl} displayName={m.name} className="h-16 w-16" />
                {muted ? (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-background shadow">
                    <MicOff className="h-3 w-3 text-destructive" />
                  </span>
                ) : null}
              </div>
              <span className="w-full truncate text-center text-[12px] font-medium">{m.isLocal ? "Você" : m.name}</span>
              <span className="flex h-3 items-center text-[10px] text-muted-foreground">
                {m.speaking ? <VoiceBars active /> : muted ? "Mudo" : "Ouvindo"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          onClick={voice.toggleMic}
          aria-label={voice.micEnabled ? "Desligar microfone" : "Ligar microfone"}
          className={cn(
            "grid h-14 w-14 place-items-center rounded-full transition active:scale-90",
            voice.micEnabled ? "bg-[color:var(--surface-2)]" : "bg-foreground text-background",
          )}
        >
          {voice.micEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </button>
        <button
          onClick={voice.leave}
          aria-label="Sair da sala"
          className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground transition active:scale-90"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
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

/* Botão discreto no cabeçalho do grupo que abre a sala de voz */
export function GroupVoiceButton({ groupId, title }: { groupId: string; title: string }) {
  const voice = useVoice();
  const [open, setOpen] = useState(false);
  const here = voice.channel?.id === groupId && voice.status !== "idle";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Sala de voz"
        className={cn("relative p-2 rounded-full active:bg-[color:var(--surface-2)]", here && "text-primary")}
      >
        <Headphones className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {here ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" /> : null}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader><SheetTitle>Sala de voz</SheetTitle></SheetHeader>
          <div className="-mx-3 pb-2"><GroupVoiceBar groupId={groupId} title={title} /></div>
        </SheetContent>
      </Sheet>
    </>
  );
}
