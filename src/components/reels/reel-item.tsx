import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Share2, Bookmark, Play, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { FeedPost } from "@/components/post-card";

type Props = {
  post: FeedPost;
  currentUserId: string;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: (postId: string) => void;
  /** URL of the next reel to preload. */
  nextSrc?: string;
};

type Burst = { id: number; x: number; y: number };

export function ReelItem({ post, currentUserId, muted, onToggleMute, onOpenComments, nextSrc }: Props) {
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expandCaption, setExpandCaption] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [speeding, setSpeeding] = useState(false);
  const [scrubberActive, setScrubberActive] = useState(false);

  const { data: url } = useSignedUrl("posts", post.media_url);

  // Autoplay when visible
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.intersectionRatio >= 0.7);
      },
      { threshold: [0, 0.7, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (visible && !paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [visible, paused, muted, url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speeding ? 2 : 1;
  }, [speeding]);

  // saved state
  const savedQ = useQuery({
    queryKey: ["saved", currentUserId, post.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", currentUserId)
        .eq("post_id", post.id)
        .maybeSingle();
      return !!data;
    },
  });
  const saved = savedQ.data === true;

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (post.liked_by_me) {
        await supabase.from("likes").delete().match({ user_id: currentUserId, post_id: post.id });
      } else {
        await supabase.from("likes").insert({ user_id: currentUserId, post_id: post.id });
      }
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["reels"] });
      qc.setQueriesData<FeedPost[] | undefined>({ queryKey: ["reels"] }, (old) =>
        old?.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.likes_count + (p.liked_by_me ? -1 : 1) }
            : p,
        ),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["reels"] }),
  });

  const forceLike = useCallback(() => {
    if (!post.liked_by_me) toggleLike.mutate();
    try { navigator.vibrate?.(12); } catch { /* noop */ }
  }, [post.liked_by_me, toggleLike]);

  const toggleSave = useMutation({
    mutationFn: async () => {
      if (saved) {
        await (supabase as any).from("saved_posts").delete().match({ user_id: currentUserId, post_id: post.id });
      } else {
        await (supabase as any).from("saved_posts").insert({ user_id: currentUserId, post_id: post.id });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["saved", currentUserId, post.id] }),
  });

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/p/${post.id}`;
  }, [post.id]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${post.author?.username}`, text: post.caption ?? "", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copiado");
      }
    } catch {
      /* user cancelled */
    }
  };

  // Gesture handling: single-tap play/pause, double-tap like burst, long-press 2x
  const tapRef = useRef<{ last: number; timer: number | null; longTimer: number | null; startY: number; moved: boolean }>({
    last: 0, timer: null, longTimer: null, startY: 0, moved: false,
  });

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
    const rect = rootRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;

    if (now - tapRef.current.last < 280) {
      // Double tap → like burst
      if (tapRef.current.timer) { window.clearTimeout(tapRef.current.timer); tapRef.current.timer = null; }
      tapRef.current.last = 0;
      spawnBurst(x, y);
      forceLike();
      return;
    }
    tapRef.current.last = now;
    tapRef.current.timer = window.setTimeout(() => {
      setPaused((p) => !p);
      tapRef.current.timer = null;
    }, 260);
  };

  const onPointerCancel = () => {
    clearLong();
    if (speeding) setSpeeding(false);
  };

  return (
    <div
      ref={rootRef}
      className="snap-start relative h-full w-full bg-black overflow-hidden select-none touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {url ? (
        <video
          ref={videoRef}
          src={url}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          playsInline
          muted={muted}
          preload="auto"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) setProgress(v.currentTime / v.duration);
          }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}
      {nextSrc ? <link rel="preload" as="video" href={nextSrc} /> : null}

      {/* Top + bottom gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

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

      {/* Paused overlay icon (fades in) */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-200",
          paused && url ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="grid h-20 w-20 place-items-center rounded-full bg-black/35 backdrop-blur-md">
          <Play className="h-10 w-10 text-white/95" fill="currentColor" strokeWidth={0} />
        </span>
      </div>

      {/* 2x speed indicator */}
      <div
        className={cn(
          "pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-[11px] font-semibold text-white tracking-wider transition-all duration-150",
          speeding ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        )}
      >
        ▶ ▶  2× SPEED
      </div>

      {/* Mute toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        aria-label={muted ? "Ativar som" : "Silenciar"}
        className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-md text-white/90 z-20 active:scale-90 transition"
      >
        {muted ? <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.8} />}
      </button>

      {/* Actions column */}
      <div className="absolute right-2.5 bottom-24 flex flex-col items-center gap-4 text-white z-20">
        <ActionBtn
          onClick={() => { toggleLike.mutate(); try { navigator.vibrate?.(10); } catch { /* noop */ } }}
          count={post.likes_count}
          label={post.liked_by_me ? "Descurtir" : "Curtir"}
          icon={
            <Heart
              className={cn(
                "h-[26px] w-[26px] transition-transform duration-200",
                post.liked_by_me ? "fill-primary text-primary scale-110 drop-shadow-[0_0_10px_rgba(34,224,106,0.6)]" : "text-white",
              )}
              strokeWidth={1.6}
            />
          }
        />
        <ActionBtn
          onClick={() => onOpenComments(post.id)}
          count={post.comments_count}
          label="Comentar"
          icon={<MessageCircle className="h-[26px] w-[26px] text-white" strokeWidth={1.6} />}
        />
        <ActionBtn
          onClick={handleShare}
          label="Compartilhar"
          icon={<Share2 className="h-[26px] w-[26px] text-white" strokeWidth={1.6} />}
        />
        <ActionBtn
          onClick={() => toggleSave.mutate()}
          label={saved ? "Salvo" : "Salvar"}
          icon={
            <Bookmark
              className={cn("h-[26px] w-[26px]", saved ? "fill-primary text-primary" : "text-white")}
              strokeWidth={1.6}
            />
          }
        />
      </div>

      {/* Author + caption */}
      <div className="absolute left-4 right-16 bottom-8 text-white space-y-2 z-10">
        <div
          className="flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Link to="/u/$username" params={{ username: post.author?.username ?? "" }}>
            <UserAvatar
              avatarPath={post.author?.avatar_url}
              displayName={post.author?.display_name ?? "?"}
              className="h-9 w-9 ring-1 ring-white/60"
            />
          </Link>
          <Link
            to="/u/$username"
            params={{ username: post.author?.username ?? "" }}
            className="font-semibold text-[15px] drop-shadow"
          >
            @{post.author?.username}
          </Link>
        </div>
        {post.caption ? (
          <p
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => { e.stopPropagation(); setExpandCaption((v) => !v); }}
            className={cn(
              "text-[13.5px] leading-snug drop-shadow whitespace-pre-wrap cursor-pointer",
              !expandCaption && "line-clamp-2",
            )}
          >
            {post.caption}
          </p>
        ) : null}
      </div>

      {/* Ultra thin progress bar — expands on interaction */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-white/10 transition-all duration-200",
          scrubberActive ? "h-1" : "h-[2px]",
        )}
        onPointerEnter={() => setScrubberActive(true)}
        onPointerLeave={() => setScrubberActive(false)}
      >
        <div className="h-full bg-white/85" style={{ width: `${progress * 100}%` }} />
      </div>

      <style>{`
        @keyframes reel-heart {
          0%   { transform: translate(-50%,-50%) scale(0.6) rotate(-12deg); opacity: 0; }
          25%  { transform: translate(-50%,-50%) scale(1.25) rotate(-4deg); opacity: 1; }
          55%  { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-95%) scale(0.9); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ActionBtn({
  icon,
  count,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  count?: number;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      aria-label={label}
      className="flex flex-col items-center gap-1 active:scale-90 transition"
    >
      <span className="grid h-11 w-11 place-items-center">{icon}</span>
      {typeof count === "number" ? (
        <span className="text-[11px] font-semibold tabular drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{formatCount(count)}</span>
      ) : null}
    </button>
  );
}

function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
