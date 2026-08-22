import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Heart, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { VideoWatermark } from "@/components/media/watermark";

/** Garante que só um vídeo toque por vez (evita travamento do feed). */
let activeVideo: HTMLVideoElement | null = null;
function claimActiveVideo(el: HTMLVideoElement) {
  if (activeVideo && activeVideo !== el) {
    try { activeVideo.pause(); } catch { /* noop */ }
  }
  activeVideo = el;
}
function releaseActiveVideo(el: HTMLVideoElement) {
  if (activeVideo === el) activeVideo = null;
}

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}


type Props = {
  src: string;
  className?: string;
  poster?: string;
  /** Optional next video URL to preload. */
  nextSrc?: string;
  /** Called on double tap. Return false to skip the heart animation. */
  onDoubleTapLike?: () => void;
  /** Autor exibido na marca d'água do app. */
  watermarkUsername?: string | null;
  /** Toca sozinho (sem som) quando entra na tela. Desligue em superfícies leves como o chat. */
  autoPlayInView?: boolean;
  /** Nome sugerido do arquivo ao baixar. */
  downloadName?: string;
};

type Burst = { id: number; x: number; y: number };

/**
 * Premium, immersive video player (TikTok / Reels style).
 * Everything is contained inside the video container — no external layout impact.
 */
export function VideoPlayer({
  src,
  className,
  poster,
  nextSrc,
  onDoubleTapLike,
  watermarkUsername,
  autoPlayInView = true,
  downloadName,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const thinBarRef = useRef<HTMLDivElement>(null);
  const lastTime = useRef(0);
  const [downloading, setDownloading] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapRef = useRef<{ last: number; timer: number | null; longTimer: number | null; startY: number; moved: boolean }>({
    last: 0, timer: null, longTimer: null, startY: 0, moved: false,
  });

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [speeding, setSpeeding] = useState(false);
  const [scrubberActive, setScrubberActive] = useState(false);

  const metrics = useRef({ requestedAt: 0, stalls: 0, reported: false });

  const playVideo = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    claimActiveVideo(el);
    metrics.current.requestedAt = performance.now();
    metrics.current.reported = false;
    // Promove para download completo. `load()` só é chamado quando o elemento
    // ainda não tem nada em buffer — chamá-lo com dados já baixados descartava
    // o buffer e reiniciava o download (causa direta do "trava ao dar play").
    if (el.preload !== "auto") {
      el.preload = "auto";
      if (el.readyState === 0 && !el.currentSrc) el.load();
    }
    setLoading(el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
    try {
      await el.play();
    } catch {
      setLoading(false);
    }
  }, []);

  const armAutoHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 2600);
  }, []);

  const reveal = useCallback(() => {
    const el = videoRef.current;
    if (el) setCurrent(el.currentTime);
    setShowControls(true);
    armAutoHide();
  }, [armAutoHide]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tapRef.current.timer) window.clearTimeout(tapRef.current.timer);
    if (tapRef.current.longTimer) window.clearTimeout(tapRef.current.longTimer);
  }, []);

  // Escada de carregamento em 3 níveis, como TikTok/Reels:
  //   longe   -> nada em memória (src desanexado, decoder liberado)
  //   perto   -> só metadados / início do buffer (prepara o próximo vídeo)
  //   visível -> download completo + play
  // Antes existia um único observer que promovia tudo que chegava perto para
  // `preload="auto"` e chamava `load()` a cada mudança: vários downloads
  // concorrentes disputavam a mesma banda e o vídeo em tela ficava em buffering.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const detach = () => {
      if (!el.getAttribute("src")) return;
      el.pause();
      el.removeAttribute("src");
      el.load(); // libera o decoder e a memória do buffer
      el.preload = "none";
    };

    const attach = (level: "metadata" | "auto") => {
      if (el.getAttribute("src") !== src) {
        el.setAttribute("src", src);
        el.preload = level;
        el.load();
        return;
      }
      if (level === "auto" && el.preload !== "auto") el.preload = "auto";
    };

    // Nível "perto": prepara o próximo vídeo com antecedência (700px).
    const nearIO = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) attach("metadata");
        else detach();
      },
      { rootMargin: "700px 0px", threshold: 0 },
    );

    // Nível "ativo": só o vídeo realmente visível baixa e reproduz.
    const activeIO = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        if (active) {
          attach("auto");
          if (autoPlayInView && !document.hidden) void playVideo();
        } else {
          el.pause();
          releaseActiveVideo(el);
        }
      },
      { threshold: [0, 0.6, 1] },
    );

    nearIO.observe(el);
    activeIO.observe(el);

    const onVisibility = () => {
      if (document.hidden) el.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      nearIO.disconnect();
      activeIO.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      releaseActiveVideo(el);
      el.pause();
    };
  }, [src, autoPlayInView, playVideo]);

  const download = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName ?? `vibely-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      window.open(src, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  }, [src, downloadName, downloading]);


  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPulse((p) => p + 1);
    if (el.paused) void playVideo();
    else el.pause();
    reveal();
  }, [playVideo, reveal]);

  const spawnBurst = (x: number, y: number) => {
    const id = Date.now() + Math.random();
    setBursts((prev) => [...prev, { id, x, y }]);
    window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 900);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    tapRef.current.startY = e.clientY;
    tapRef.current.moved = false;
    tapRef.current.longTimer = window.setTimeout(() => {
      setSpeeding(true);
      try { navigator.vibrate?.(20); } catch { /* noop */ }
    }, 380);
  };

  const clearLong = () => {
    if (tapRef.current.longTimer) {
      window.clearTimeout(tapRef.current.longTimer);
      tapRef.current.longTimer = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (Math.abs(e.clientY - tapRef.current.startY) > 8) {
      tapRef.current.moved = true;
      clearLong();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasSpeeding = speeding;
    clearLong();
    if (wasSpeeding) { setSpeeding(false); return; }
    if (tapRef.current.moved) return;

    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (now - tapRef.current.last < 280) {
      // Double tap → like burst
      if (tapRef.current.timer) { window.clearTimeout(tapRef.current.timer); tapRef.current.timer = null; }
      tapRef.current.last = 0;
      spawnBurst(x, y);
      if (onDoubleTapLike) onDoubleTapLike();
      try { navigator.vibrate?.(12); } catch { /* noop */ }
      return;
    }
    tapRef.current.last = now;
    tapRef.current.timer = window.setTimeout(() => {
      // Single tap: if controls are visible, toggle play; otherwise reveal controls.
      if (showControls || !autoPlayInView) togglePlay();
      else reveal();
      tapRef.current.timer = null;
    }, 280);
  };

  const onPointerCancel = () => {
    clearLong();
    if (speeding) setSpeeding(false);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-black select-none",
        "ring-1 ring-white/10 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.8),inset_0_0_60px_rgba(0,0,0,0.55)]",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <video
        ref={videoRef}
        // `src` é gerenciado pelo observer (anexa perto da tela, desanexa longe).
        poster={poster}
        playsInline
        loop={autoPlayInView}
        muted={muted}
        preload="none"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate noremoteplayback"
        x-webkit-airplay="deny"
        className="h-full w-full object-cover"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setLoading(false);
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          const d = e.currentTarget.duration || 0;
          // barra fina: atualizada direto no DOM (sem re-render do feed)
          if (thinBarRef.current && d > 0) {
            thinBarRef.current.style.width = `${(t / d) * 100}%`;
          }
          // estado só é atualizado quando os controles estão visíveis
          if (!showControls) return;
          if (Math.abs(t - lastTime.current) < 0.25) return;
          lastTime.current = t;
          setCurrent(t);
        }}

        onWaiting={() => {
          metrics.current.stalls += 1;
          setLoading(true);
        }}
        onStalled={() => setLoading(true)}
        onPlaying={() => {
          setLoading(false);
          const m = metrics.current;
          if (!m.reported && m.requestedAt) {
            m.reported = true;
            if (import.meta.env.DEV) {
              console.info(
                `[video] início em ${Math.round(performance.now() - m.requestedAt)}ms · rebuffers: ${m.stalls}`,
              );
            }
          }
        }}
        onCanPlay={() => setLoading(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setLoading(false);
          console.error("[video] falha ao carregar", src.slice(0, 80));
        }}
      />


      {/* nextSrc é usado apenas como dica; sem preload de vídeo para não saturar a rede */}


      {/* Depth gradient at the edges */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),transparent_22%,transparent_70%,rgba(0,0,0,0.55))]" />

      {/* Marca d'água do app */}
      <VideoWatermark username={watermarkUsername} className="bottom-6" />

      {/* Elegant loader */}
      {loading ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="h-9 w-9 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
        </div>
      ) : null}

      {/* Center play/pause pulse */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-300 ease-out",
          showControls || !playing ? "opacity-100" : "opacity-0",
        )}
      >
        <span
          key={pulse}
          className="grid h-16 w-16 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md ring-1 ring-white/15 animate-scale-in"
        >
          {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 translate-x-[2px]" />}
        </span>
      </div>

      {/* Double-tap heart bursts */}
      {bursts.map((b) => (
        <span
          key={b.id}
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 will-change-transform"
          style={{ left: b.x, top: b.y, animation: "reel-heart 900ms cubic-bezier(.2,.9,.3,1) forwards" }}
        >
          <Heart className="h-24 w-24 fill-primary text-primary drop-shadow-[0_6px_30px_rgba(34,224,106,0.7)]" strokeWidth={0} />
        </span>
      ))}

      {/* 2x speed indicator */}
      <div
        className={cn(
          "pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-[11px] font-semibold text-white tracking-wider transition-all duration-150",
          speeding ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        )}
      >
        ▶ ▶  2× SPEED
      </div>

      {/* Bottom overlay controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 p-2.5 transition-all duration-300 ease-out",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        )}
      >
        <div className="flex items-center gap-2.5 rounded-full bg-black/35 px-3 py-2 backdrop-blur-xl ring-1 ring-white/10">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePlay();
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-white/90 transition hover:scale-110 active:scale-95"
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <div
            className="relative h-1 flex-1 cursor-pointer rounded-full bg-white/20"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              if (videoRef.current && duration) videoRef.current.currentTime = ratio * duration;
              reveal();
            }}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%` }}
            />
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_10px_rgba(34,224,106,0.7)] transition-[left] duration-150 ease-linear"
              style={{ left: `${progress}%` }}
            />
          </div>

          <span className="text-[10px] font-medium tabular-nums text-white/70">
            {fmt(current)} / {fmt(duration)}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMuted((m) => !m);
              reveal();
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-white/90 transition hover:scale-110 active:scale-95"
            aria-label={muted ? "Ativar som" : "Silenciar"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void download();
              reveal();
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-white/90 transition hover:scale-110 active:scale-95 disabled:opacity-50"
            disabled={downloading}
            aria-label="Baixar vídeo"
          >
            <Download className={cn("h-4 w-4", downloading && "animate-pulse")} />
          </button>
        </div>
      </div>

      {/* Ultra thin progress bar — always visible but expands on interaction */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-white/10 transition-all duration-200",
          scrubberActive ? "h-1" : "h-[2px]",
        )}
        onPointerEnter={() => setScrubberActive(true)}
        onPointerLeave={() => setScrubberActive(false)}
      >
        <div ref={thinBarRef} className="h-full bg-primary/80" style={{ width: `${progress}%` }} />
      </div>

    </div>
  );
}
