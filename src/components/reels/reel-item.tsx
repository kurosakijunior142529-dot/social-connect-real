import { useEffect, useMemo, useRef, useState } from "react";
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
};

export function ReelItem({ post, currentUserId, muted, onToggleMute, onOpenComments }: Props) {
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expandCaption, setExpandCaption] = useState(false);

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

  const handleTogglePlay = () => setPaused((p) => !p);

  return (
    <div ref={rootRef} className="snap-start relative h-full w-full bg-black overflow-hidden">
      {url ? (
        <video
          ref={videoRef}
          src={url}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          playsInline
          muted={muted}
          preload="metadata"
          onClick={handleTogglePlay}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) setProgress(v.currentTime / v.duration);
          }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">Carregando…</div>
      )}

      {/* dark gradient bottom for readability */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Paused overlay icon */}
      {paused && url ? (
        <button
          onClick={handleTogglePlay}
          className="absolute inset-0 grid place-items-center"
          aria-label="Reproduzir"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/40 backdrop-blur">
            <Play className="h-8 w-8 text-white" fill="white" />
          </span>
        </button>
      ) : null}

      {/* Mute toggle */}
      <button
        onClick={onToggleMute}
        aria-label={muted ? "Ativar som" : "Silenciar"}
        className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/40 backdrop-blur text-white"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {/* Actions column */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 text-white">
        <ActionBtn
          onClick={() => toggleLike.mutate()}
          count={post.likes_count}
          label={post.liked_by_me ? "Descurtir" : "Curtir"}
          icon={
            <Heart
              className={cn("h-7 w-7 transition-transform", post.liked_by_me && "fill-primary text-primary scale-110")}
              strokeWidth={1.8}
            />
          }
        />
        <ActionBtn
          onClick={() => onOpenComments(post.id)}
          count={post.comments_count}
          label="Comentar"
          icon={<MessageCircle className="h-7 w-7" strokeWidth={1.8} />}
        />
        <ActionBtn
          onClick={handleShare}
          label="Compartilhar"
          icon={<Share2 className="h-7 w-7" strokeWidth={1.8} />}
        />
        <ActionBtn
          onClick={() => toggleSave.mutate()}
          label={saved ? "Salvo" : "Salvar"}
          icon={
            <Bookmark
              className={cn("h-7 w-7", saved && "fill-primary text-primary")}
              strokeWidth={1.8}
            />
          }
        />
      </div>

      {/* Author + caption */}
      <div className="absolute left-4 right-20 bottom-6 text-white space-y-2">
        <div className="flex items-center gap-2">
          <Link to="/u/$username" params={{ username: post.author?.username ?? "" }}>
            <UserAvatar
              avatarPath={post.author?.avatar_url}
              displayName={post.author?.display_name ?? "?"}
              className="h-9 w-9 ring-1 ring-white/50"
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
            onClick={() => setExpandCaption((v) => !v)}
            className={cn(
              "text-[13.5px] leading-snug drop-shadow whitespace-pre-wrap cursor-pointer",
              !expandCaption && "line-clamp-2",
            )}
          >
            {post.caption}
          </p>
        ) : null}
      </div>

      {/* progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
        <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
      </div>
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
    <button onClick={onClick} aria-label={label} className="flex flex-col items-center gap-1 active:scale-95 transition">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-black/30 backdrop-blur">{icon}</span>
      {typeof count === "number" ? (
        <span className="text-[11px] font-semibold tabular drop-shadow">{formatCount(count)}</span>
      ) : null}
    </button>
  );
}

function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
