import { useQuery } from "@tanstack/react-query";
import { createSignedUrl } from "@/lib/media";

export function useSignedUrl(bucket: "avatars" | "posts", path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-url", bucket, path ?? ""],
    queryFn: () => createSignedUrl(bucket, path!),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
}
