import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";
import type { MediaBucket } from "@/lib/media";

type Props = {
  bucket: MediaBucket;
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function SignedImage({ bucket, path, alt, className, fallback }: Props) {
  const { data: url, isLoading } = useSignedUrl(bucket, path);
  if (!path) return <>{fallback ?? null}</>;
  if (isLoading || !url) {
    return <div className={cn("bg-muted animate-pulse", className)} />;
  }
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

export function SignedVideo({ bucket, path, className }: Omit<Props, "alt" | "fallback">) {
  const { data: url, isLoading } = useSignedUrl(bucket, path);
  if (!path) return null;
  if (isLoading || !url) return <div className={cn("bg-muted animate-pulse", className)} />;
  return <video src={url} className={className} controls playsInline />;
}
