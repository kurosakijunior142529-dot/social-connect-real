import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Music2, Search, Play, Pause, X, Loader2, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { searchSpotifyTracks } from "@/lib/music/spotify.functions";
import {
  MAX_CLIP_MS,
  ensureProviderTrack,
  fmtMs,
  playableDurationMs,
  searchLocalTracks,
  trackAudioUrl,
  type MusicSelection,
  type MusicTrack,
} from "@/lib/music/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Pequena representação visual da faixa (barras determinísticas por faixa). */
function Waveform({ seed, className }: { seed: string; className?: string }) {
  const bars = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 56 }, (_, i) => {
      h = (h * 1103515245 + 12345 + i) >>> 0;
      return 0.25 + ((h >>> 8) % 100) / 133;
    });
  }, [seed]);
  return (
    <div className={cn("flex h-10 items-center gap-[2px]", className)}>
      {bars.map((b, i) => (
        <span key={i} className="flex-1 rounded-full bg-current" style={{ height: `${Math.min(1, b) * 100}%` }} />
      ))}
    </div>
  );
}

function TrackRow({ track, onPick }: { track: MusicTrack; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition active:scale-[0.99] hover:bg-white/5"
    >
      {track.cover_url ? (
        <img src={track.cover_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
      ) : (
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
          <Music2 className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{track.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </div>
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{fmtMs(track.duration_ms)}</span>
    </button>
  );
}

export function MusicPicker({
  value,
  onChange,
  videoMode,
  className,
}: {
  value: MusicSelection | null;
  onChange: (next: MusicSelection | null) => void;
  videoMode?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[color:var(--surface-2)] p-3">
          {value.track.cover_url ? (
            <img src={value.track.cover_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <Music2 className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{value.track.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {value.track.artist} · {fmtMs(value.startMs)}–{fmtMs(value.endMs)}
            </div>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-primary">
            Editar
          </button>
          <button type="button" onClick={() => onChange(null)} aria-label="Remover música" className="p-1">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[color:var(--surface-2)] p-3 text-left transition active:scale-[0.99]"
        >
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <Music2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">🎵 Adicionar música</div>
            <div className="text-xs text-muted-foreground">Escolha a faixa e o trecho de até 30s</div>
          </div>
        </button>
      )}

      <MusicSheet
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={onChange}
        videoMode={!!videoMode}
      />
    </div>
  );
}

function MusicSheet({
  open,
  onOpenChange,
  value,
  onChange,
  videoMode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: MusicSelection | null;
  onChange: (next: MusicSelection | null) => void;
  videoMode: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<MusicSelection | null>(value);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runSpotify = useServerFn(searchSpotifyTracks);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Busca com debounce: catálogo do Vibely + metadados do provedor.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const local = await searchLocalTracks(q);
          if (cancelled) return;
          setResults(local);
          if (q.trim().length >= 2) {
            const remote = await runSpotify({ data: { q } }).catch(() => null);
            if (cancelled || !remote?.tracks?.length) return;
            const known = new Set(local.map((t) => `${t.provider}:${t.external_id}`));
            const extra = remote.tracks
              .filter((t) => !known.has(`spotify:${t.externalId}`))
              .map<MusicTrack>((t) => ({
                id: `remote:${t.externalId}`,
                provider: "spotify",
                external_id: t.externalId,
                title: t.title,
                artist: t.artist,
                album: t.album,
                cover_url: t.coverUrl,
                duration_ms: t.durationMs,
                audio_source: t.previewUrl ? "preview" : "metadata",
                audio_url: t.previewUrl,
                is_available: true,
              }));
            setResults([...local, ...extra]);
          }
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, runSpotify]);

  // Prepara o áudio tocável do trecho.
  useEffect(() => {
    let cancelled = false;
    setAudioUrl(null);
    setPlaying(false);
    audioRef.current?.pause();
    if (!draft) return;
    setLoadingAudio(true);
    void trackAudioUrl(draft.track)
      .then((url) => {
        if (!cancelled) setAudioUrl(url);
      })
      .finally(() => {
        if (!cancelled) setLoadingAudio(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft?.track.id]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  async function choose(track: MusicTrack) {
    let real = track;
    if (track.id.startsWith("remote:")) {
      const saved = await ensureProviderTrack({
        provider: track.provider,
        externalId: track.external_id!,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverUrl: track.cover_url,
        durationMs: track.duration_ms,
        previewUrl: track.audio_url,
      });
      if (!saved) return toast.error("Não consegui salvar essa música agora");
      real = saved;
    }
    const total = playableDurationMs(real);
    const len = Math.min(MAX_CLIP_MS, total);
    setDraft({
      track: real,
      startMs: 0,
      endMs: len,
      volume: value?.volume ?? 0.8,
      originalVolume: value?.originalVolume ?? 0.5,
    });
  }

  function togglePlay() {
    if (!draft || !audioUrl) return;
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    el.currentTime = draft.startMs / 1000;
    el.volume = draft.volume;
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  const total = draft ? playableDurationMs(draft.track) : 0;
  const clipLen = draft ? draft.endMs - draft.startMs : 0;
  const maxStart = Math.max(0, total - clipLen);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl p-0">
        <SheetHeader className="px-4 pt-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Music2 className="h-4 w-4 text-primary" /> Música
          </SheetTitle>
        </SheetHeader>

        <div className="flex h-[calc(88vh-56px)] flex-col">
          {draft ? (
            <div className="space-y-4 border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                {draft.track.cover_url ? (
                  <img src={draft.track.cover_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary/15 text-primary">
                    <Music2 className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{draft.track.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{draft.track.artist}</div>
                </div>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!audioUrl || loadingAudio}
                  aria-label="Ouvir trecho"
                  className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                >
                  {loadingAudio ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>

              {!audioUrl && !loadingAudio ? (
                <p className="text-xs text-muted-foreground">
                  Esta música entra como informação da publicação: o provedor não libera prévia de áudio para reprodução.
                </p>
              ) : null}

              <div className="relative overflow-hidden rounded-xl bg-[color:var(--surface-2)] p-2 text-muted-foreground/40">
                <Waveform seed={draft.track.id} />
                <div
                  className="pointer-events-none absolute inset-y-1 rounded-lg border-2 border-primary bg-primary/15"
                  style={{
                    left: `${(draft.startMs / Math.max(1, total)) * 100}%`,
                    width: `${(clipLen / Math.max(1, total)) * 100}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                <span>{fmtMs(draft.startMs)}</span>
                <span className="text-primary">{Math.round(clipLen / 1000)}s</span>
                <span>{fmtMs(draft.endMs)}</span>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Início do trecho</span>
                <Slider
                  min={0}
                  max={maxStart}
                  step={500}
                  value={[Math.min(draft.startMs, maxStart)]}
                  onValueChange={([v]) =>
                    setDraft({ ...draft, startMs: v ?? 0, endMs: (v ?? 0) + clipLen })
                  }
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Duração do trecho (até 30s)</span>
                <Slider
                  min={3000}
                  max={Math.min(MAX_CLIP_MS, total)}
                  step={1000}
                  value={[clipLen]}
                  onValueChange={([v]) => {
                    const len = v ?? clipLen;
                    const start = Math.min(draft.startMs, Math.max(0, total - len));
                    setDraft({ ...draft, startMs: start, endMs: start + len });
                  }}
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Volume da música {Math.round(draft.volume * 100)}%</span>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[draft.volume]}
                  onValueChange={([v]) => setDraft({ ...draft, volume: v ?? draft.volume })}
                />
              </div>

              {videoMode ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Áudio original do vídeo {Math.round(draft.originalVolume * 100)}%
                  </span>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[draft.originalVolume]}
                    onValueChange={([v]) => setDraft({ ...draft, originalVolume: v ?? draft.originalVolume })}
                  />
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 rounded-full"
                  onClick={() => setDraft(null)}
                >
                  Trocar música
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-full bg-gradient-brand"
                  onClick={() => {
                    audioRef.current?.pause();
                    onChange(draft);
                    onOpenChange(false);
                  }}
                >
                  <Check className="mr-1 h-4 w-4" /> Usar trecho
                </Button>
              </div>
              {audioUrl ? (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    if (el.currentTime * 1000 >= draft.endMs) el.currentTime = draft.startMs / 1000;
                  }}
                  className="hidden"
                />
              ) : null}
            </div>
          ) : null}

          {!draft ? (
            <>
              <div className="relative px-4 pt-3">
                <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Música, artista ou álbum"
                  className="h-11 rounded-full pl-10"
                />
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-3">
                {searching && results.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : null}
                {results.map((t) => (
                  <TrackRow key={`${t.provider}:${t.id}`} track={t} onPick={() => void choose(t)} />
                ))}
                {!searching && results.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma música encontrada.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
