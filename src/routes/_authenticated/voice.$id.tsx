import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Radio, Volume2, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useVoice } from "@/components/voice/voice-provider";

export const Route = createFileRoute("/_authenticated/voice/$id")({
  ssr: false,
  component: VoiceRoom,
  head: () => ({
    meta: [
      { title: "Sala de voz · vibely" },
      { name: "description", content: "Sala de voz em tempo real com push-to-talk, indicador de quem está falando e volume individual." },
      { property: "og:title", content: "Sala de voz · vibely" },
      { property: "og:description", content: "Converse por voz com baixa latência enquanto joga." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ChannelRow = { id: string; name: string; topic: string | null; emoji: string | null };

function VoiceRoom() {
  const { id } = Route.useParams();
  const voice = useVoice();
  const [row, setRow] = useState<ChannelRow | null>(null);

  useEffect(() => {
    supabase
      .from("voice_channels")
      .select("id, name, topic, emoji")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setRow(data ?? null));
  }, [id]);

  const connectedHere = voice.channel?.id === id && voice.status !== "idle";
  const talking = voice.mode === "ptt" ? voice.pttHeld : voice.micEnabled;

  return (
    <div className="relative min-h-[100dvh] pb-28">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_70%)]" />

      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/voice" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
            {row ? `${row.emoji ?? "🔊"} ${row.name}` : "Canal de voz"}
          </h1>
          {connectedHere ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-400">
              <Radio className="h-3 w-3" /> {voice.status === "connected" ? "ao vivo" : "conectando"}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-5 px-4 pt-5">
        {!connectedHere ? (
          <div className="rounded-3xl bg-[color:var(--surface)] p-6 text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-3xl">
              {row?.emoji ?? "🔊"}
            </span>
            <p className="mb-1 text-lg font-semibold">{row?.name ?? "Canal"}</p>
            <p className="mb-5 text-sm text-muted-foreground">{row?.topic ?? "Voz em tempo real, baixa latência."}</p>
            <Button
              className="w-full gap-2"
              onClick={() => row && voice.join({ id: row.id, name: row.name, emoji: row.emoji })}
              disabled={!row}
            >
              <Headphones className="h-4 w-4" /> Entrar no canal
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {voice.members.map((m) => (
                <div
                  key={m.identity}
                  className={`rounded-3xl border p-4 text-center transition-all duration-200 ${
                    m.speaking
                      ? "border-primary bg-primary/10 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                      : "border-transparent bg-[color:var(--surface)]"
                  }`}
                >
                  <span className="relative mx-auto mb-2 block h-16 w-16">
                    {m.speaking ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" /> : null}
                    <UserAvatar
                      avatarPath={m.avatarUrl}
                      displayName={m.name}
                      className={`h-16 w-16 ${m.speaking ? "ring-2 ring-primary" : ""}`}
                    />
                  </span>
                  <div className="truncate text-sm font-medium">
                    {m.name} {m.isLocal ? <span className="text-muted-foreground">· você</span> : null}
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                    {m.muted ? <MicOff className="h-3 w-3 text-red-400" /> : <Mic className="h-3 w-3 text-primary" />}
                    {m.muted ? "mudo" : m.speaking ? "falando" : "ouvindo"}
                  </div>
                  {!m.isLocal ? (
                    <label className="mt-2 flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={m.volume}
                        onChange={(e) => voice.setMemberVolume(m.identity, Number(e.target.value))}
                        className="h-1 w-full accent-[color:var(--primary)]"
                        aria-label={`Volume de ${m.name}`}
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-[color:var(--surface)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Keyboard className="h-4 w-4 text-primary" /> Modo de transmissão
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={voice.mode === "open" ? "default" : "secondary"} onClick={() => voice.setMode("open")}>
                  Ativação por voz
                </Button>
                <Button variant={voice.mode === "ptt" ? "default" : "secondary"} onClick={() => voice.setMode("ptt")}>
                  Push-to-talk
                </Button>
              </div>
              {voice.mode === "ptt" ? (
                <button
                  type="button"
                  onPointerDown={() => voice.setPttHeld(true)}
                  onPointerUp={() => voice.setPttHeld(false)}
                  onPointerLeave={() => voice.setPttHeld(false)}
                  className={`mt-3 w-full rounded-2xl py-4 text-sm font-semibold transition active:scale-[0.98] ${
                    voice.pttHeld ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)]"
                  }`}
                >
                  {voice.pttHeld ? "Falando…" : "Segure para falar (ou barra de espaço)"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {connectedHere ? (
        <div className="fixed inset-x-0 bottom-[68px] z-[80] px-4 md:bottom-6">
          <div className="glass-heavy mx-auto flex max-w-md items-center justify-center gap-4 rounded-3xl border border-white/10 px-5 py-3 shadow-elegant">
            <button
              type="button"
              onClick={voice.toggleMic}
              aria-label={talking ? "Silenciar" : "Ativar microfone"}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-90 ${
                talking ? "bg-[color:var(--surface-2)]" : "bg-red-600 text-white"
              }`}
            >
              {talking ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={voice.toggleDeafen}
              aria-label={voice.deafened ? "Ativar áudio" : "Silenciar tudo"}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-90 ${
                voice.deafened ? "bg-red-600 text-white" : "bg-[color:var(--surface-2)]"
              }`}
            >
              {voice.deafened ? <HeadphoneOff className="h-6 w-6" /> : <Headphones className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={voice.leave}
              aria-label="Sair do canal"
              className="grid h-14 w-14 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition active:scale-90"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
