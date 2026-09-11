import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logPostView } from "@/lib/search";
import { logVir, useVirWatch } from "@/lib/vir";
import { VerifiedName } from "@/components/verified-badge";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Share2, Bookmark, Play, Volume2, VolumeX, MoreHorizontal, EyeOff, Flag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { FeedPost } from "@/components/post-card";
import { ShareSheet } from "@/components/share/share-sheet";
import { RepostButton } from "@/components/repost-button";
import { VideoWatermark } from "@/components/media/watermark";


type Props = {
  post: FeedPost;
  currentUserId: string;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: (postId: string) => void;
  /** URL of the next reel to preload. */
  nextSrc?: string;
  /** Explicação curta do VIR (ex.: "Porque você segue este criador"). */
  reason?: string | null;
  /** Chamado quando a pessoa marca "Não tenho interesse". */
  onNotInterested?: (postId: string) => void;
};

type Burst = { id: number; x: number; y: number };

export function ReelItem({ post, currentUserId, muted, onToggleMute, onOpenComments, nextSrc, reason, onNotInterested }: Props) {
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);

  const [progress, setProgress] = useState(0);
  const [expandCaption, setExpandCaption] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [speeding, setSpeeding] = useState(false);
  const [scrubberActive, setScrubberActive] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);


  const { data: url } = useSignedUrl("posts", post.media_url);
  const { data: posterUrl } = useSignedUrl("posts", (post as any).thumbnail_url ?? null);

  // Dois níveis, como TikTok: "perto" prepara metadados, "ativo" baixa e toca.
  // O elemento <video> nunca é desmontado — só o `src` entra/sai — para que o
  // decoder e o buffer não sejam destruídos a cada rolagem.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const nearIO = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: "800px 0px", threshold: 0 },
    );
    const activeIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Histerese: entra com 65%, só sai abaixo de 40% (evita oscilação).
          setVisible((prev) =>
            e.intersectionRatio >= 0.65 ? true : e.intersectionRatio < 0.4 ? false : prev,
          );
        }
      },
      { threshold: [0, 0.4, 0.65, 1] },
    );
    nearIO.observe(el);
    activeIO.observe(el);
    return () => {
      nearIO.disconnect();
      activeIO.disconnect();
    };
  }, []);

  // Anexa / desanexa a fonte conforme a proximidade.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    if (near) {
      if (v.getAttribute("src") !== url) {
        v.setAttribute("src", url);
        v.preload = visible ? "auto" : "metadata";
        v.load();
      } else if (visible && v.preload !== "auto") {
        v.preload = "auto";
      }
    } else if (v.getAttribute("src")) {
      v.pause();
      v.removeAttribute("src");
      v.preload = "none";
      v.load(); // libera decoder + memória
      setReady(false);
    }
  }, [near, visible, url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    if (visible && near && !paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [visible, near, paused, url]);

  // Estado de buffer sem re-render por frame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => setReady(true);
    const off = () => setReady(false);
    v.addEventListener("canplay", on);
    v.addEventListener("playing", on);
    v.addEventListener("waiting", off);
    return () => {
      v.removeEventListener("canplay", on);
      v.removeEventListener("playing", on);
      v.removeEventListener("waiting", off);
    };
  }, [url]);


  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speeding ? 2 : 1;
  }, [speeding]);

  // Registra a visualização só quando o vídeo fica realmente em foco por 2s.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => void logPostView(post.id), 2000);
    return () => clearTimeout(t);
  }, [visible, post.id]);

  // Sinais de retenção para o VIR (início, 25/50/75%, conclusão, replay, skip).
  useVirWatch(videoRef, visible, post.id);

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
        logVir(post.id, "unlike");
      } else {
        await supabase.from("likes").insert({ user_id: currentUserId, post_id: post.id });
        logVir(post.id, "like");
      }
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["reels"] });
      const patch = (p: FeedPost) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.likes_count + (p.liked_by_me ? -1 : 1) }
          : p;
      qc.setQueriesData<any>({ queryKey: ["reels"] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.map(patch);
        if (Array.isArray(old.pages)) {
          return { ...old, pages: old.pages.map((page: FeedPost[]) => page.map(patch)) };
        }
        return old;
      });
    },
    // Sem invalidar o feed: o VIR já entregou a ordem e recarregar embaralharia
    // os vídeos no meio da rolagem. A atualização otimista basta.
  });

  const forceLike = useCallback(() => {
    if (!post.liked_by_me) toggleLike.mutate();
    try { navigator.vibrate?.(12); } catch { /* noop */ }
  }, [post.liked_by_me, toggleLike]);

  const toggleSave = useMutation({
    mutationFn: async () => {
      if (saved) {
        await (supabase as any).from("saved_posts").delete().match({ user_id: currentUserId, post_id: post.id });
        logVir(post.id, "unsave");
      } else {
        await (supabase as any).from("saved_posts").insert({ user_id: currentUserId, post_id: post.id });
        logVir(post.id, "save");
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["saved", currentUserId, post.id] }),
  });

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/s/${post.id}`;
  }, [post.id]);


  const handleShare = () => {
    logVir(post.id, "share");
    setShareOpen(true);
  };

  const handleNotInterested = () => {
    toast.success("Ok, vamos mostrar menos conteúdos assim.");
    onNotInterested?.(post.id);
  };

  const handleReport = () => {
    logVir(post.id, "report");
    toast.success("Denúncia registrada. Nossa equipe vai revisar.");
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
      className="snap-start relative h-full w-full bg-black overflow-hidden select-none touch-pan-y [contain:layout_paint] [content-visibility:auto]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Fundo ambiente desfocado (barras laterais deixam de ser preto puro) */}
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-2xl saturate-150"
        />
      ) : null}

      {url ? (
        <video
          ref={videoRef}
          poster={posterUrl ?? undefined}
          // `src` é anexado/desanexado pelo efeito — o elemento nunca desmonta,
          // então o decoder e o buffer sobrevivem à rolagem.
          // object-contain: o vídeo inteiro aparece (estilo Instagram Reels) —
          // nada é cortado; as sobras ficam pretas sobre o fundo.
          className="absolute inset-0 h-full w-full object-contain [transform:translateZ(0)]"
          loop
          playsInline
          muted={muted}
          preload="none"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) {
              const next = v.currentTime / v.duration;
              if (progressRef.current) progressRef.current.style.transform = `scaleX(${next})`;
            }
          }}
        />
      ) : null}
      {!url || !ready ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-11 w-11 rounded-full border-2 border-white/15 border-t-primary animate-spin shadow-[0_0_24px_-4px_rgba(34,224,106,0.6)]" />
        </div>
      ) : null}


      {/* Top + bottom gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      {/* Marca d'água do app */}
      <VideoWatermark username={post.author?.username} className="bottom-24 right-3" />

      {/* Double-tap heart bursts */}
      {bursts.map((b) => (
        <span
          key={b.id}
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 will-change-transform"
          style={{ left: b.x, top: b.y, animation: "reel-heart 900ms cubic-bezier(.2,.9,.3,1) forwards" }}
        >
          <Heart className="h-24 w-24 fill-primary text-primary drop-shadow-[0_6px_24px_rgba(34,224,106,0.4)]" strokeWidth={0} />
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
      <div className="absolute right-2.5 bottom-28 flex flex-col items-center gap-3.5 text-white z-20">
        <ActionBtn
          onClick={() => { toggleLike.mutate(); try { navigator.vibrate?.(10); } catch { /* noop */ } }}
          count={post.likes_count}
          label={post.liked_by_me ? "Descurtir" : "Curtir"}
          icon={
            <Heart
              className={cn(
                "h-[26px] w-[26px] transition-transform duration-200",
                post.liked_by_me ? "fill-primary text-primary scale-110 drop-shadow-[0_0_8px_rgba(34,224,106,0.35)]" : "text-white",
              )}
              strokeWidth={1.6}
            />
          }
        />
        <ActionBtn
          onClick={() => { logVir(post.id, "comment_open"); onOpenComments(post.id); }}
          count={post.comments_count}
          label="Comentar"
          icon={<MessageCircle className="h-[26px] w-[26px] text-white" strokeWidth={1.6} />}
        />
        <div className="flex flex-col items-center text-white">
          <RepostButton postId={post.id} userId={currentUserId} variant="reel" />
        </div>
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
      <div className="absolute left-4 right-16 bottom-9 text-white space-y-2.5 z-10">
        <div
          className="flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Link to="/u/$username" params={{ username: post.author?.username ?? "" }}>
            <UserAvatar
              avatarPath={post.author?.avatar_url}
              displayName={post.author?.display_name ?? "?"}
              verified={!!(post.author as any)?.is_verified}
              badgeVariant={((post.author as any)?.badge_variant) ?? null}
              className="h-10 w-10 ring-2 ring-primary/60 shadow-[0_0_14px_-6px_rgba(34,224,106,0.45)]"
            />
          </Link>
          <Link
            to="/u/$username"
            params={{ username: post.author?.username ?? "" }}
            className="font-semibold text-[15px] drop-shadow"
          >
            <VerifiedName name={`@${post.author?.username ?? ""}`} verified={(post.author as any)?.is_verified} badgeVariant={(post.author as any)?.badge_variant} />
          </Link>
        </div>
        {post.caption ? (
          <p
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => { e.stopPropagation(); setExpandCaption((v) => !v); }}
            className={cn(
              "w-fit max-w-full rounded-2xl bg-black/25 px-3 py-1.5 text-[13.5px] leading-snug backdrop-blur-md whitespace-pre-wrap cursor-pointer",
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
          scrubberActive ? "h-1.5" : "h-[3px]",
        )}
        onPointerEnter={() => setScrubberActive(true)}
        onPointerLeave={() => setScrubberActive(false)}
      >
        <div
          ref={progressRef}
          className="h-full origin-left scale-x-0 rounded-r-full bg-gradient-to-r from-primary/70 via-primary to-white shadow-[0_0_10px_rgba(34,224,106,0.35)]"
        />
      </div>

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        userId={currentUserId}
        target={{
          url: shareUrl,
          title: `@${post.author?.username ?? ""}`,
          text: post.caption ?? "",
          post: {
            id: post.id,
            kind: "reel",
            caption: post.caption ?? null,
            mediaBucket: "posts",
            mediaPath: post.media_url ?? "",
            posterPath: (post as any).thumbnail_url ?? null,
            mediaType: "video",
            authorUsername: post.author?.username ?? null,
            authorDisplayName: post.author?.display_name ?? null,
            authorAvatar: post.author?.avatar_url ?? null,
          },
          media: {
            bucket: "posts",
            path: post.media_url ?? "",
            filename: `vibely-${post.id}.mp4`,
            posterPath: (post as any).thumbnail_url ?? null,
            mimeType: "video/mp4",
          },
        }}
      />
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
      className="flex flex-col items-center gap-1 transition-transform duration-150 active:scale-[0.86]"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 backdrop-blur-xl ring-1 ring-white/15 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.95)]">
        {icon}
      </span>
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
