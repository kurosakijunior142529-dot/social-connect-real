import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Headphones, Plus, Radio, Sparkles, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVoice } from "@/components/voice/voice-provider";

export const Route = createFileRoute("/_authenticated/voice/")({
  ssr: false,
  component: VoiceChannels,
  head: () => ({
    meta: [
      { title: "Canais de voz · vibely" },
      { name: "description", content: "Entre em canais de voz em tempo real, converse enquanto joga e controle microfone, push-to-talk e volume de cada pessoa." },
      { property: "og:title", content: "Canais de voz · vibely" },
      { property: "og:description", content: "Voz em tempo real estilo Discord dentro do vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Channel = { id: string; name: string; topic: string | null; emoji: string | null; max_members: number };

const EMOJIS = ["🔊", "🎮", "🎧", "🔥", "⚡", "🌙", "🏆", "💜", "🎵", "🚀"];

function EqualizerBars({ active = true, className = "" }: { active?: boolean; className?: string }) {
  return (
    <span className={`flex h-4 items-end gap-[3px] ${className}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-primary ${active ? "animate-pulse" : ""}`}
          style={{
            height: `${[40, 90, 60, 100][i]}%`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: `${0.9 + i * 0.12}s`,
            opacity: active ? 1 : 0.35,
          }}
        />
      ))}
    </span>
  );
}

function VoiceChannels() {
  const navigate = useNavigate();
  const { join, channel: active } = useVoice();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔊");

  async function load() {
    const { data, error } = await supabase
      .from("voice_channels")
      .select("id, name, topic, emoji, max_members")
      .order("created_at", { ascending: true });
    if (error) toast.error("Não foi possível carregar os canais");
    setChannels(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createChannel() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("voice_channels")
      .insert({ name: trimmed, created_by: auth.user.id, emoji })
      .select("id, name, topic, emoji, max_members")
      .single();
    if (error || !data) return toast.error("Não foi possível criar o canal");
    setName("");
    setEmoji("🔊");
    setCreating(false);
    setChannels((prev) => [...(prev ?? []), data]);
    await join({ id: data.id, name: data.name, emoji: data.emoji });
    void navigate({ to: "/voice/$id", params: { id: data.id } });
  }

  return (
    <div className="relative pb-28">
      {/* fundo com brilho radial */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(90%_70%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]" />

      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <span className="relative grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Headphones className="h-4.5 w-4.5" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_80%,transparent)]" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-semibold leading-tight">Canais de voz</h1>
            <p className="text-[11px] text-muted-foreground">Converse ao vivo enquanto joga</p>
          </div>
          <Button size="sm" className="gap-1.5 rounded-full shadow-elegant" onClick={() => setCreating((v) => !v)}>
            {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {creating ? "Fechar" : "Novo canal"}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-5">
        {/* Canal ativo */}
        {active ? (
          <Link
            to="/voice/$id"
            params={{ id: active.id }}
            className="relative flex items-center gap-3 overflow-hidden rounded-3xl border border-primary/40 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_55%)] p-4 shadow-[0_0_40px_-10px_color-mix(in_oklab,var(--primary)_45%,transparent)] transition active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/20 text-2xl">
              {active.emoji ?? "🔊"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{active.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Radio className="h-3 w-3" /> Você está conectado agora
              </span>
            </span>
            <EqualizerBars />
          </Link>
        ) : null}

        {/* Criar canal */}
        {creating ? (
          <div className="space-y-3 rounded-3xl border border-primary/25 bg-[color:var(--surface)] p-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-sm font-semibold">Criar canal de voz</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do canal" autoFocus className="rounded-2xl" />
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`grid h-10 w-10 place-items-center rounded-2xl text-lg transition active:scale-90 ${
                    emoji === e
                      ? "bg-primary/20 ring-2 ring-primary"
                      : "bg-[color:var(--surface-2)] hover:bg-[color:var(--surface)]"
                  }`}
                  aria-label={`Emoji ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <Button onClick={createChannel} className="w-full rounded-2xl">
              Criar e entrar
            </Button>
          </div>
        ) : null}

        {/* Lista de canais */}
        {channels === null ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-3xl bg-[color:var(--surface)]" />
          ))
        ) : channels.length === 0 ? (
          <div className="rounded-3xl bg-[color:var(--surface)] p-8 text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-3xl">🎙️</span>
            <p className="font-semibold">Nenhum canal ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro e chame a galera.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((c) => {
              const isActive = active?.id === c.id;
              return (
                <Link
                  key={c.id}
                  to="/voice/$id"
                  params={{ id: c.id }}
                  className={`group relative flex items-center gap-3 overflow-hidden rounded-3xl p-4 transition active:scale-[0.99] ${
                    isActive
                      ? "border border-primary/50 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)]"
                      : "bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-3xl text-2xl transition ${
                      isActive ? "bg-primary/25" : "bg-primary/10 group-hover:bg-primary/15"
                    }`}
                  >
                    {c.emoji ?? "🔊"}
                    {isActive ? (
                      <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-primary ring-2 ring-background" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.topic ?? "Canal de voz em tempo real"}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Shield className="h-3 w-3" /> até {c.max_members} pessoas
                    </span>
                  </span>
                  {isActive ? (
                    <EqualizerBars />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary transition group-hover:scale-110 group-hover:bg-primary/20">
                      <Headphones className="h-4 w-4" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Dica */}
        <div className="rounded-3xl border border-primary/25 bg-primary/10 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> Dica de áudio
          </div>
          Use fones de ouvido para evitar eco. No celular, o sistema permite apenas um app usando o microfone por vez —
          se o jogo tomar o microfone, ative o <strong>push-to-talk</strong> ou use um segundo dispositivo.
        </div>
      </div>
    </div>
  );
}
