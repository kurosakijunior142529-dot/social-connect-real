import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Headphones, Plus, Users, Radio } from "lucide-react";
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

function VoiceChannels() {
  const navigate = useNavigate();
  const { join, channel: active } = useVoice();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

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
      .insert({ name: trimmed, created_by: auth.user.id, emoji: "🔊" })
      .select("id, name, topic, emoji, max_members")
      .single();
    if (error || !data) return toast.error("Não foi possível criar o canal");
    setName("");
    setCreating(false);
    setChannels((prev) => [...(prev ?? []), data]);
    await join({ id: data.id, name: data.name, emoji: data.emoji });
    void navigate({ to: "/voice/$id", params: { id: data.id } });
  }

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <h1 className="flex-1 font-display text-lg font-semibold">Canais de voz</h1>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-4 pt-4">
        {creating ? (
          <div className="flex gap-2 rounded-2xl bg-[color:var(--surface)] p-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do canal" autoFocus />
            <Button onClick={createChannel}>Criar</Button>
          </div>
        ) : null}

        {channels === null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-[color:var(--surface)]" />
            ))
          : channels.map((c) => (
              <Link
                key={c.id}
                to="/voice/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 rounded-2xl bg-[color:var(--surface)] p-4 transition active:scale-[0.99] hover:bg-[color:var(--surface-2)]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-xl">
                  {c.emoji ?? "🔊"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.topic ?? "Canal de voz em tempo real"}
                  </span>
                </span>
                {active?.id === c.id ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] text-primary">
                    <Radio className="h-3 w-3" /> conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" /> {c.max_members}
                  </span>
                )}
              </Link>
            ))}

        <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm">
          <Headphones className="mb-1 h-5 w-5 text-primary" />
          Use fones de ouvido para evitar eco. No celular, o sistema permite apenas um app usando o microfone por vez —
          se o jogo tomar o microfone, ative o <strong>push-to-talk</strong> ou use um segundo dispositivo.
        </div>
      </div>
    </div>
  );
}
