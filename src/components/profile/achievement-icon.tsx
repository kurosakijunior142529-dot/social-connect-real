import {
  Award,
  Camera,
  Crown,
  Flame,
  Gem,
  Gift,
  Heart,
  Lock,
  MessageCircle,
  Mic,
  Radio,
  Sparkles,
  Star,
  Trophy,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const METRIC_ICON: Record<string, LucideIcon> = {
  posts: Camera,
  first_post: Camera,
  comments: MessageCircle,
  followers: Users,
  likes_received: Heart,
  videos: Video,
  first_video: Video,
  reel: Video,
  video: Video,
  lives: Radio,
  first_live: Radio,
  rooms: Mic,
  first_room: Mic,
  gifts_sent: Gift,
  gift_sender: Gift,
  gifts_received: Sparkles,
  gift_star: Star,
};

const TIER_METAL: Record<string, { from: string; via: string; to: string; rim: string }> = {
  bronze: { from: "#F0C08A", via: "#C87F35", to: "#7A4715", rim: "#FFE0B8" },
  prata: { from: "#F4F7FA", via: "#B9C3CE", to: "#6E7A88", rim: "#FFFFFF" },
  ouro: { from: "#FFF0B0", via: "#E8B824", to: "#8A5F09", rim: "#FFF7D6" },
  diamante: { from: "#E8FEFF", via: "#7FE6F5", to: "#1E7F98", rim: "#FFFFFF" },
  lendario: { from: "#FFE3FB", via: "#D46BF0", to: "#6D1E86", rim: "#FFEAFF" },
};

export function AchievementIcon({
  metric,
  tier,
  unlocked,
}: {
  metric: string;
  tier: string;
  unlocked: boolean;
}) {
  const Icon = METRIC_ICON[metric] ?? (tier === "lendario" ? Crown : tier === "diamante" ? Gem : Trophy);
  const metal = TIER_METAL[tier] ?? TIER_METAL.ouro!;
  const id = `medal-${tier}`;

  return (
    <span className={cn("achv-medal", unlocked ? "achv-medal-on" : "achv-medal-off")} aria-hidden>
      <svg viewBox="0 0 48 48" className="h-[46px] w-[46px]">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor={metal.from} />
            <stop offset="48%" stopColor={metal.via} />
            <stop offset="100%" stopColor={metal.to} />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={metal.rim} stopOpacity="0.95" />
            <stop offset="100%" stopColor={metal.to} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {/* medalha hexagonal facetada */}
        <path
          d="M24 2.8 42 12.6v22.8L24 45.2 6 35.4V12.6z"
          fill={`url(#${id})`}
          stroke={`url(#${id}-rim)`}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* faceta superior (relevo) */}
        <path d="M24 2.8 42 12.6 24 22.4 6 12.6z" fill="#FFFFFF" opacity="0.18" />
        {/* faceta inferior (sombra) */}
        <path d="M24 22.4 42 12.6v22.8L24 45.2z" fill="#000000" opacity="0.16" />
        <circle cx="24" cy="24" r="12.4" fill="#000000" opacity="0.16" />
        <circle cx="24" cy="24" r="12.4" fill="none" stroke={metal.rim} strokeOpacity="0.5" strokeWidth="0.9" />
      </svg>
      <span className="achv-medal-glyph">
        {unlocked ? <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} /> : <Lock className="h-4 w-4" strokeWidth={2.2} />}
      </span>
      {unlocked ? <span className="achv-medal-sheen" /> : null}
      {unlocked && (tier === "diamante" || tier === "lendario") ? (
        <span className="achv-medal-star">
          <Award className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}
