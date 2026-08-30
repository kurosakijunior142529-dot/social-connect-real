import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MUSIC_VIBES, renderVibe, type MusicVibe } from "@/lib/music-catalog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Music2, Play, Pause, Star, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/music")({
  head: () => ({
    meta: [
      { title: "Música · Vibely" },
      {
        name: "description",
        content:
          "Descubra as vibes musicais do Vibely, use nas suas publicações e escolha a música do seu perfil.",
      },
      { property: "og:title", content: "Música · Vibely" },
      { property: "og:description", content: "Trilhas livres de direitos para as suas vibes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MusicPage,
});

function MusicPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const me = useQuery({
    queryKey: ["me-favorite-track", user.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_profile");
      const row = (Array.isArray(data) ? data[0] : data) as any;
      return (row?.favorite_track ?? null) as string | null;
    },
  });

  /** Quantos perfis escolheram cada trilha — o "em alta" do Vibely. */
  const popularity = useQuery({
    queryKey: ["music-popularity"],
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("favorite_track").not("favorite_track", "is", null);
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.favorite_track) map[r.favorite_track] = (map[r.favorite_track] ?? 0) + 1;
      }
      return map;
    },
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term ? MUSIC_VIBES.filter((v) => v.name.toLowerCase().includes(term)) : MUSIC_VIBES;
    const pop = popularity.data ?? {};
    return [...filtered].sort((a, b) => (pop[b.id] ?? 0) - (pop[a.id] ?? 0));
  }, [q, popularity.data]);

  async function toggle(vibe: MusicVibe) {
    if (playing === vibe.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    setLoadingId(vibe.id);
    try {
      const url = await renderVibe(vibe);
      audioRef.current?.pause();
      const el = new Audio(url);
      el.loop = true;
      el.volume = 0.9;
      audioRef.current = el;
      await el.play();
      setPlaying(vibe.id);
    } catch {
      toast.error("Não foi possível tocar a trilha");
    } finally {
      setLoadingId(null);
    }
  }

  async function setFavorite(id: string) {
    const next = me.data === id ? null : id;
    const { error } = await supabase.from("profiles").update({ favorite_track: next } as any).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Música do perfil atualizada" : "Música removida do perfil");
    qc.invalidateQueries({ queryKey: ["me-favorite-track", user.id] });
    qc.invalidateQueries({ queryKey: ["music-popularity"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <div className="space-y-5 pb-24">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-brand text-white">
          <Music2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight">Música</h1>
          <p className="text-sm text-muted-foreground">Trilhas próprias do Vibely, livres de direitos</p>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar vibes musicais"
          className="pl-9 rounded-full"
        />
      </div>

      <div className="space-y-2">
        {list.map((v) => {
          const isFav = me.data === v.id;
          const count = popularity.data?.[v.id] ?? 0;
          return (
            <div key={v.id} className="glass rounded-2xl p-3 flex items-center gap-3">
              <button
                onClick={() => toggle(v)}
                aria-label={playing === v.id ? `Pausar ${v.name}` : `Tocar ${v.name}`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[color:var(--surface-2)] text-xl"
              >
                {loadingId === v.id ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : playing === v.id ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <span>{v.emoji}</span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{v.name}</div>
                <div className="text-xs text-muted-foreground tabular">
                  {v.bpm} BPM · {count} {count === 1 ? "perfil" : "perfis"}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={isFav ? "Remover do perfil" : "Definir como música do perfil"}
                onClick={() => setFavorite(v.id)}
                className="rounded-full shrink-0"
              >
                <Star className={cn("h-5 w-5", isFav && "fill-primary text-primary")} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full shrink-0 gap-1.5 hidden sm:inline-flex"
                onClick={() => toggle(v)}
              >
                <Play className="h-3.5 w-3.5" /> Ouvir
              </Button>
            </div>
          );
        })}
        {list.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma vibe encontrada.</p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Todas as trilhas são geradas pelo próprio Vibely e podem ser usadas nas suas publicações. A
        arquitetura já está pronta para receber um catálogo licenciado no futuro.
      </p>
    </div>
  );
}
