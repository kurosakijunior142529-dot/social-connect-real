import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { signChatUrl, humanFileSize, formatDuration, type ChatBucket } from "@/lib/chat-media";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, MapPin, Download, Pause, Play, Mic2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmojiText } from "@/components/chat/app-emoji";

type Msg = {
  id: string;
  kind?: string | null;
  content?: string | null;
  media_url?: string | null;
  media_bucket?: string | null;
  media_type?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_duration_ms?: number | null;
  poster_url?: string | null;
  meta?: any;
};

function useChatSigned(bucket: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["chat-signed", bucket ?? "", path ?? ""],
    queryFn: () => signChatUrl(bucket as ChatBucket, path!),
    enabled: !!bucket && !!path,
    staleTime: 30 * 60 * 1000,
  });
}

export function MessageBody({ msg, mine }: { msg: Msg; mine: boolean }) {
  const kind = msg.kind ?? "text";

  if (kind === "post") return <PostShareBody msg={msg} />;
  if (kind === "gif") return <GifBody msg={msg} />;
  if (kind === "sticker") return <StickerBody msg={msg} />;
  if (kind === "image") return <ImageBody msg={msg} />;
  if (kind === "video") return <VideoBody msg={msg} />;
  if (kind === "audio") return <AudioBody msg={msg} mine={mine} />;
  if (kind === "document") return <DocBody msg={msg} mine={mine} />;
  if (kind === "location") return <LocationBody msg={msg} />;
  return <EmojiText text={msg.content ?? ""} />;
}

/** Publicação compartilhada — card com capa, autor e legenda (abre o post completo). */
function PostShareBody({ msg }: { msg: Msg }) {
  const p = msg.meta?.post ?? {};
  const bucket = (msg.media_bucket as any) ?? "posts";
  const cover = useSignedUrl(bucket, msg.poster_url ?? msg.media_url ?? null);
  const isVideo = (p.media_type ?? "video") === "video";
  const usesVideoFrame = isVideo && !msg.poster_url;

  return (
    <Link
      to="/p/$id"
      params={{ id: String(p.id ?? "") }}
      className="block w-60 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25"
    >
      <div className="relative aspect-[4/5] w-full bg-black/40">
        {cover.data ? (
          usesVideoFrame ? (
            <video
              src={`${cover.data}#t=0.1`}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={cover.data} alt="" className="h-full w-full object-cover" loading="lazy" />
          )
        ) : (
          <div className="h-full w-full animate-pulse bg-white/5" />
        )}
        {isVideo ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 backdrop-blur-md">
              <Play className="h-5 w-5 text-white" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-2.5">
        <div className="text-[12px] font-semibold">
          @{p.author_username ?? "publicação"}
        </div>
        {p.caption ? (
          <div className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
            {p.caption}
          </div>
        ) : null}
        <div className="pt-0.5 text-[11px] font-medium text-primary">Ver publicação</div>
      </div>
    </Link>
  );
}

function GifBody({ msg }: { msg: Msg }) {
  const src = msg.media_url ?? "";
  const w = msg.meta?.w as number | undefined;
  const h = msg.meta?.h as number | undefined;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={msg.content ?? "gif"}
      loading="lazy"
      className="rounded-xl max-h-72 max-w-full"
      style={{ aspectRatio: w && h ? `${w}/${h}` : undefined }}
    />
  );
}

function StickerBody({ msg }: { msg: Msg }) {
  const isAbsolute = !!msg.media_url && !msg.media_bucket;
  const signed = useChatSigned(msg.media_bucket, isAbsolute ? null : msg.media_url);
  const src = isAbsolute ? msg.media_url : signed.data;
  if (!src) return <div className="h-32 w-32 animate-pulse rounded-xl bg-black/10" />;
  return (
    <img
      src={src}
      alt={msg.content ?? "figurinha"}
      loading="lazy"
      className="h-32 w-32 object-contain"
    />
  );
}

function ImageBody({ msg }: { msg: Msg }) {
  const bucket = msg.media_bucket || (msg.media_url?.startsWith("http") ? null : "chats");
  const signed = useSignedUrl(bucket as any, msg.media_url ?? null);
  const src = msg.media_url?.startsWith("http") ? msg.media_url : signed.data ?? null;
  if (!src) return <div className="w-56 h-40 rounded-xl bg-black/20 animate-pulse" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt={msg.content ?? "imagem"} className="rounded-xl max-h-80 object-cover" />
      {msg.content ? <div className="mt-1 text-[13px]">{msg.content}</div> : null}
    </a>
  );
}

function VideoBody({ msg }: { msg: Msg }) {
  const signed = useChatSigned(msg.media_bucket, msg.media_url);
  const poster = useChatSigned(msg.media_bucket, msg.poster_url);
  const src = signed.data;
  if (!src) return <div className="w-56 h-40 rounded-xl bg-black/20 animate-pulse" />;
  return (
    <div>
      <VideoPlayer
        src={src}
        poster={poster.data ?? undefined}
        autoPlayInView={false}
        downloadName={msg.media_name ?? undefined}
        className="max-h-80 w-full"
      />
      {msg.content ? <div className="mt-1 text-[13px]">{msg.content}</div> : null}
    </div>
  );
}

function AudioBody({ msg, mine }: { msg: Msg; mine: boolean }) {
  const signed = useChatSigned(msg.media_bucket, msg.media_url);
  const src = signed.data;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [fallback, setFallback] = useState(false);
  const totalMs = msg.media_duration_ms ?? 0;
  const bars = useMemo(
    () => Array.from({ length: 28 }, (_, i) => 28 + ((msg.id.charCodeAt(i % msg.id.length) + i * 17) % 46)),
    [msg.id],
  );

  // WebAudio fallback for browsers that can't play the container natively (Safari + webm/opus)
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      try { nodeRef.current?.stop(); } catch { /* noop */ }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void ctxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => {
      const duration = audio.duration || totalMs / 1000 || 0;
      const current = audio.currentTime || 0;
      setCurrentMs(current * 1000);
      setProgress(duration ? Math.min(1, current / duration) : 0);
    };
    const ended = () => { setPlaying(false); setProgress(0); setCurrentMs(0); };
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("ended", ended);
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("play", () => setPlaying(true));
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", update);
      audio.removeEventListener("ended", ended);
    };
  }, [totalMs]);

  async function loadBuffer(): Promise<AudioBuffer | null> {
    if (bufRef.current || !src) return bufRef.current;
    try {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current ??= new AC();
      const res = await fetch(src);
      const ab = await res.arrayBuffer();
      const buf = await ctxRef.current.decodeAudioData(ab.slice(0));
      bufRef.current = buf;
      return buf;
    } catch (e) {
      console.warn("audio decode failed", e);
      return null;
    }
  }

  function tick() {
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (!ctx || !buf) return;
    const elapsed = ctx.currentTime - startedAtRef.current + offsetRef.current;
    const p = Math.min(1, elapsed / buf.duration);
    setProgress(p);
    setCurrentMs(elapsed * 1000);
    if (p < 1) rafRef.current = requestAnimationFrame(tick);
  }

  async function playFallback(fromRatio = 0) {
    const buf = await loadBuffer();
    const ctx = ctxRef.current;
    if (!buf || !ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    try { nodeRef.current?.stop(); } catch { /* noop */ }
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    const offset = buf.duration * fromRatio;
    offsetRef.current = offset;
    startedAtRef.current = ctx.currentTime;
    node.onended = () => {
      const finished = (ctx.currentTime - startedAtRef.current + offset) >= buf.duration - 0.05;
      if (finished) { setPlaying(false); setProgress(0); setCurrentMs(0); offsetRef.current = 0; }
    };
    node.start(0, offset);
    nodeRef.current = node;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopFallback() {
    try { nodeRef.current?.stop(); } catch { /* noop */ }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }

  async function toggle() {
    if (!src) return;
    if (fallback) {
      if (playing) stopFallback();
      else await playFallback(progress >= 0.99 ? 0 : progress);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setFallback(true);
        await playFallback(0);
      }
    } else {
      audio.pause();
    }
  }

  function seek(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (fallback) {
      const wasPlaying = playing;
      stopFallback();
      setProgress(pct);
      if (wasPlaying) void playFallback(pct);
      else offsetRef.current = (bufRef.current?.duration ?? 0) * pct;
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    const duration = audio.duration || totalMs / 1000 || 0;
    if (duration) audio.currentTime = duration * pct;
  }

  return (
    <div className="min-w-[240px] max-w-[290px] py-1">
      {src && !fallback ? (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onError={() => setFallback(true)}
        />
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!src}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40",
            mine ? "bg-background/20" : "bg-primary text-primary-foreground",
          )}
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={seek}
            disabled={!src}
            className="flex h-10 w-full items-center gap-[3px] rounded-full px-1 disabled:opacity-50"
            aria-label="Buscar no áudio"
          >
            {bars.map((height, index) => {
              const active = index / bars.length <= progress;
              return (
                <span
                  key={index}
                  className={cn(
                    "w-1 flex-1 rounded-full transition-colors",
                    active ? "bg-current" : mine ? "bg-background/25" : "bg-muted-foreground/30",
                  )}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </button>
          <div className="mt-0.5 flex items-center justify-between text-[11px] opacity-70 tabular-nums">
            <span>{formatDuration(currentMs || totalMs)}</span>
            <span className="inline-flex items-center gap-1">
              <Mic2 className="h-3 w-3" /> voz
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocBody({ msg, mine }: { msg: Msg; mine: boolean }) {
  const signed = useChatSigned(msg.media_bucket, msg.media_url);
  const src = signed.data;
  return (
    <a
      href={src ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-3 min-w-[220px] max-w-[280px] rounded-xl px-3 py-2",
        mine ? "bg-black/15" : "bg-black/20",
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-primary/20 grid place-items-center shrink-0">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{msg.media_name ?? "documento"}</div>
        <div className="text-[11px] opacity-70">{humanFileSize(msg.media_size)}</div>
      </div>
      <Download className="h-4 w-4 opacity-70 shrink-0" />
    </a>
  );
}

function LocationBody({ msg }: { msg: Msg }) {
  const lat = msg.meta?.lat as number | undefined;
  const lng = msg.meta?.lng as number | undefined;
  if (lat == null || lng == null) return <span>📍 localização</span>;
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const img = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=280x160&markers=${lat},${lng},red-pushpin`;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={img}
        alt="localização"
        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        className="rounded-xl w-[280px] max-w-full"
      />
      <div className="mt-1 flex items-center gap-1 text-[12px] opacity-80">
        <MapPin className="h-3 w-3" /> {lat.toFixed(4)}, {lng.toFixed(4)}
      </div>
    </a>
  );
}
