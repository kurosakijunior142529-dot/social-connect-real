import { useQuery } from "@tanstack/react-query";
import { createSignedUrl, type MediaBucket } from "@/lib/media";

export function useSignedUrl(bucket: MediaBucket, path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-url", bucket, path ?? ""],
    queryFn: () => createSignedUrl(bucket, path!),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
}
