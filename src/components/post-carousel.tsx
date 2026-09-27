import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { fetchPostMedia } from "@/lib/reels/carousel";
import { SignedImage, SignedVideo } from "@/components/signed-image";
import { cn } from "@/lib/utils";

/** Carrossel do feed: mídia principal + mídias extras (até 10 no total). */
export function PostCarousel({ postId, children }: { postId: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const { data: extras = [] } = useQuery({
    queryKey: ["post-media", postId],
    queryFn: async () => (await fetchPostMedia([postId])).get(postId) ?? [],
    staleTime: 5 * 60_000,
  });

  if (extras.length === 0) return <>{children}</>;
  const total = extras.length + 1;

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-full shrink-0 snap-center">{children}</div>
        {extras.map((m) => (
          <div key={m.id} className="w-full shrink-0 snap-center">
            <div className="mx-3 overflow-hidden rounded-[22px] bg-black ring-1 ring-white/[0.06]">
              {m.media_type === "video" ? (
                <SignedVideo bucket="posts" path={m.media_url} className="w-full max-h-[80vh] aspect-[4/5] mx-auto" fit="contain" />
              ) : (
                <SignedImage bucket="posts" path={m.media_url} alt="" className="mx-auto w-full h-auto max-h-[80vh] object-contain" />
              )}
            </div>
          </div>
        ))}
      </div>
      <span className="absolute right-6 top-3 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
        {index + 1}/{total}
      </span>
      <div className="mt-2 flex justify-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40")}
          />
        ))}
      </div>
    </div>
  );
}
