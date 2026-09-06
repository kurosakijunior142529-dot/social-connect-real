import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Radio, Volume2, Keyboard, Waves } from "lucide-react";
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
  const speakingCount = voice.members.filter((m) => m.speaking).length;

  return (
    <div className="relative min-h-[100dvh] pb-36">
      {/* fundo palco */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_70%)]" />
        {connectedHere && speakingCount > 0 ? (
          <div className="absolute inset-x-0 top-0 h-56 animate-pulse bg-[radial-gradient(70%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_25%,transparent),transparent_70%)]" />
        ) : null}
      </div>

      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/voice" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] transition active:scale-90" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
            {row ? `${row.emoji ?? "🔊"} ${row.name}` : "Canal de voz"}
          </h1>
          {connectedHere ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                <span className="h-2 w-2 rounded-full bg-primary" />
              </span>
              {voice.status === "connected" ? "ao vivo" : "conectando…"}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-5 px-4 pt-5">
        {!connectedHere ? (
          <div className="relative overflow-hidden rounded-[28px] bg-[color:var(--surface)] p-7 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%)]" />
            <span className="relative mx-auto mb-4 grid h-20 w-20 place-items-center rounded-[24px] bg-primary/15 text-4xl shadow-[0_0_50px_-10px_color-mix(in_oklab,var(--primary)_50%,transparent)]">
              {row?.emoji ?? "🔊"}
            </span>
            <p className="relative mb-1 font-display text-xl font-semibold">{row?.name ?? "Canal"}</p>
            <p className="relative mb-6 text-sm text-muted-foreground">{row?.topic ?? "Voz em tempo real, baixa latência."}</p>
            <Button
              className="relative w-full gap-2 rounded-2xl py-6 text-base shadow-elegant"
              onClick={() => row && voice.join({ id: row.id, name: row.name, emoji: row.emoji })}
              disabled={!row}
            >
              <Headphones className="h-5 w-5" /> Entrar no canal
            </Button>
            <p className="relative mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Waves className="h-3.5 w-3.5" /> Áudio 48 kHz com supressão de ruído
            </p>
          </div>
        ) : (
          <>
            {/* grid de participantes */}
            <div className="grid grid-cols-2 gap-3">
              {voice.members.map((m) => (
                <div
                  key={m.identity}
                  className={`relative overflow-hidden rounded-[26px] border p-4 text-center transition-all duration-300 ${
                    m.speaking
                      ? "border-primary/70 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_65%)] shadow-[0_0_35px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
                      : "border-transparent bg-[color:var(--surface)]"
                  }`}
                >
                  <span className="relative mx-auto mb-2 block h-20 w-20">
                    {m.speaking ? (
                      <>
                        <span className="absolute -inset-1 animate-ping rounded-full bg-primary/20" />
                        <span className="absolute -inset-1 rounded-full border-2 border-primary/60" />
                      </>
                    ) : null}
                    <UserAvatar
                      avatarPath={m.avatarUrl}
                      displayName={m.name}
                      className={`h-20 w-20 transition ${m.speaking ? "ring-2 ring-primary" : ""}`}
                    />
                    <span
                      className={`absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full ring-2 ring-background ${
                        m.muted ? "bg-red-600 text-white" : "bg-[color:var(--surface-2)]"
                      }`}
                    >
                      {m.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 text-primary" />}
                    </span>
                  </span>
                  <div className="truncate text-sm font-semibold">
                    {m.name} {m.isLocal ? <span className="text-muted-foreground">· você</span> : null}
                  </div>
                  <div
                    className={`mt-0.5 text-[11px] font-medium ${
                      m.muted ? "text-red-400" : m.speaking ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {m.muted ? "no mudo" : m.speaking ? "falando agora" : "ouvindo"}
                  </div>
                  {!m.isLocal ? (
                    <label className="mt-2 flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

            {/* modo de transmissão */}
            <div className="rounded-[26px] bg-[color:var(--surface)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Keyboard className="h-4 w-4 text-primary" /> Modo de transmissão
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => voice.setMode("open")}
                  className={`rounded-2xl px-3 py-3 text-sm font-medium transition active:scale-[0.98] ${
                    voice.mode === "open"
                      ? "bg-primary text-primary-foreground shadow-elegant"
                      : "bg-[color:var(--surface-2)]"
                  }`}
                >
                  Ativação por voz
                </button>
                <button
                  type="button"
                  onClick={() => voice.setMode("ptt")}
                  className={`rounded-2xl px-3 py-3 text-sm font-medium transition active:scale-[0.98] ${
                    voice.mode === "ptt"
                      ? "bg-primary text-primary-foreground shadow-elegant"
                      : "bg-[color:var(--surface-2)]"
                  }`}
                >
                  Push-to-talk
                </button>
              </div>
              {voice.mode === "ptt" ? (
                <button
                  type="button"
                  onPointerDown={() => voice.setPttHeld(true)}
                  onPointerUp={() => voice.setPttHeld(false)}
                  onPointerLeave={() => voice.setPttHeld(false)}
                  className={`mt-3 w-full rounded-2xl py-5 text-sm font-semibold transition active:scale-[0.98] ${
                    voice.pttHeld
                      ? "bg-primary text-primary-foreground shadow-[0_0_30px_-5px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                      : "bg-[color:var(--surface-2)]"
                  }`}
                >
                  {voice.pttHeld ? "🎙️ Falando… solte para parar" : "Segure para falar (ou barra de espaço)"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* dock de controles */}
      {connectedHere ? (
        <div className="fixed inset-x-0 bottom-[68px] z-[80] px-4 md:bottom-6">
          <div className="glass-heavy mx-auto flex max-w-md items-center justify-center gap-4 rounded-[28px] border border-primary/20 px-5 py-3.5 shadow-elegant">
            <button
              type="button"
              onClick={voice.toggleMic}
              aria-label={talking ? "Silenciar" : "Ativar microfone"}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-90 ${
                talking
                  ? "bg-[color:var(--surface-2)] hover:bg-[color:var(--surface)]"
                  : "bg-red-600 text-white shadow-lg shadow-red-900/40"
              }`}
            >
              {talking ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={voice.toggleDeafen}
              aria-label={voice.deafened ? "Ativar áudio" : "Silenciar tudo"}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-90 ${
                voice.deafened ? "bg-red-600 text-white shadow-lg shadow-red-900/40" : "bg-[color:var(--surface-2)]"
              }`}
            >
              {voice.deafened ? <HeadphoneOff className="h-6 w-6" /> : <Headphones className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={voice.leave}
              aria-label="Sair do canal"
              className="grid h-14 w-14 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/50 transition active:scale-90"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
