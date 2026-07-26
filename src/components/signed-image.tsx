import { useEffect, useState } from "react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";
import type { MediaBucket } from "@/lib/media";
import { Play, ImageOff } from "lucide-react";

type Props = {
  bucket: MediaBucket;
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("bg-[color:var(--surface-2)] animate-pulse", className)} />;
}

function BrokenMedia({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center bg-[color:var(--surface-2)] text-muted-foreground", className)}>
      <ImageOff className="h-5 w-5 opacity-60" />
    </div>
  );
}

export function SignedImage({ bucket, path, alt, className, fallback }: Props) {
  const { data: url, isLoading, refetch } = useSignedUrl(bucket, path);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset error state whenever the source changes.
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [bucket, path]);

  if (!path) return <>{fallback ?? null}</>;
  if (failed) return <BrokenMedia className={className} />;
  if (isLoading || !url) return <Placeholder className={className} />;

  return (
    <img
      key={attempt}
      src={attempt === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}r=${attempt}`}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        console.error(`[media] failed to load image ${bucket}/${path} (attempt ${attempt + 1})`);
        if (attempt < 2) {
          // Signed URL may have expired or been cached mid-flight — mint a fresh one and retry.
          refetch();
          setAttempt((a) => a + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

export function SignedVideo({ bucket, path, className }: Omit<Props, "alt" | "fallback">) {
  const { data: url, isLoading } = useSignedUrl(bucket, path);
  if (!path) return null;
  if (isLoading || !url) return <Placeholder className={className} />;
  return (
    <video
      src={url}
      className={cn("bg-black", className)}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload noremoteplayback"
      onError={() => console.error(`[media] failed to load video ${bucket}/${path}`)}
    />
  );
}

/**
 * Thumbnail for grids: renders a real image for images and an auto-generated
 * first-frame preview for videos (a video element with `preload="metadata"`,
 * which paints the poster frame without downloading the whole file).
 */
export function SignedMediaThumb({
  bucket,
  path,
  mediaType,
  alt,
  className,
}: Omit<Props, "fallback"> & { mediaType?: string | null }) {
  const isVideo = mediaType === "video" || /\.(mp4|webm|mov|m4v)$/i.test(path ?? "");
  const { data: url, isLoading } = useSignedUrl(bucket, isVideo ? path : null);
  const [failed, setFailed] = useState(false);

  if (!isVideo) return <SignedImage bucket={bucket} path={path} alt={alt} className={className} />;
  if (!path) return null;
  if (failed) return <BrokenMedia className={className} />;
  if (isLoading || !url) return <Placeholder className={className} />;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <video
        src={`${url}#t=0.1`}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        onError={() => {
          console.error(`[media] failed to load video thumb ${bucket}/${path}`);
          setFailed(true);
        }}
      />
      <span className="pointer-events-none absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/60">
        <Play className="h-3 w-3 fill-white text-white" />
      </span>
    </div>
  );
}
