import { useEffect, useRef, useState } from "react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import type { ReelMedia } from "@/lib/reels/carousel";

type Props = {
  media: ReelMedia;
  /** Slide visível no momento (só ele reproduz). */
  active: boolean;
  /** Slide próximo — pré-carrega sem tocar. */
  near: boolean;
  muted: boolean;
  paused: boolean;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
};

/**
 * Um item do carrossel do Reel: foto (proporção original) ou vídeo.
 * Só o slide ativo reproduz — nunca há dois vídeos tocando ao mesmo tempo.
 */
export function ReelSlide({ media, active, near, muted, paused, onVideoRef }: Props) {
  const { data: url } = useSignedUrl("posts", near || active ? media.media_url : null);
  const { data: poster } = useSignedUrl("posts", media.thumbnail_url ?? null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const isVideo = media.media_type === "video";

  useEffect(() => {
    if (!isVideo) return;
    onVideoRef?.(active ? videoRef.current : null);
  }, [active, isVideo, onVideoRef, url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    if (v.getAttribute("src") !== url) {
      v.setAttribute("src", url);
      v.preload = active ? "auto" : "metadata";
      v.load();
    }
  }, [url, active]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    if (active && !paused) v.play().catch(() => {});
    else v.pause();
  }, [active, paused, url]);

  // Libera memória do decoder quando o slide sai da vizinhança.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!near && !active && v.getAttribute("src")) {
      v.pause();
      v.removeAttribute("src");
      v.preload = "none";
      v.load();
      setReady(false);
    }
  }, [near, active]);

  return (
    <div className="relative h-full w-full shrink-0 grow-0 basis-full overflow-hidden">
      {poster ? (
        <img
          src={poster}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl saturate-150"
        />
      ) : null}

      {isVideo ? (
        <video
          ref={videoRef}
          poster={poster ?? undefined}
          className="absolute inset-0 h-full w-full object-contain [transform:translateZ(0)]"
          loop
          playsInline
          muted={muted}
          preload="none"
          onCanPlay={() => setReady(true)}
          onPlaying={() => setReady(true)}
          onWaiting={() => setReady(false)}
        />
      ) : url ? (
        <img
          src={url}
          alt=""
          loading={active ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setReady(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {!ready ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-10 w-10 rounded-full border-2 border-white/15 border-t-primary animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
