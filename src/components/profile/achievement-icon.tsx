import { Award } from "lucide-react";
import { cn } from "@/lib/utils";

/** Insígnias próprias desenhadas em SVG (traço uniforme, 24x24, currentColor). */
function Emblem({ d, className }: { d: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

const EMBLEM: Record<string, React.ReactNode> = {
  // câmera com obturador em estrela
  posts: (
    <>
      <path d="M3.5 8.5h3l1.4-2.2h8.2L17.5 8.5h3v10h-17z" />
      <path d="M12 10.2 13.4 13h2.9l-2.3 1.8.9 2.9L12 15.9 9.1 17.7l.9-2.9L7.7 13h2.9z" />
    </>
  ),
  // balão de fala com faísca
  comments: (
    <>
      <path d="M4 6.2h16v9.6h-8.7L7 19.4v-3.6H4z" />
      <path d="M12 8.6l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" />
    </>
  ),
  // trio de silhuetas
  followers: (
    <>
      <circle cx="12" cy="8.4" r="2.9" />
      <path d="M6.6 19c.7-3 2.8-4.6 5.4-4.6S16.7 16 17.4 19" />
      <path d="M4.2 12.6a2.2 2.2 0 1 1 1.9-3.3M19.8 12.6a2.2 2.2 0 1 0-1.9-3.3" />
    </>
  ),
  // coração com pulso
  likes_received: (
    <>
      <path d="M12 19.4S4.6 15 4.6 10.1A3.7 3.7 0 0 1 12 8.2a3.7 3.7 0 0 1 7.4 1.9c0 4.9-7.4 9.3-7.4 9.3z" />
      <path d="M7.6 11.4h2.1l1.1-2 1.6 3.6 1.1-1.6h2.9" />
    </>
  ),
  // claquete / play
  videos: (
    <>
      <rect x="3.4" y="6" width="17.2" height="12.6" rx="2.2" />
      <path d="M3.4 9.6h17.2M8.4 6l-1.6 3.6M13.4 6l-1.6 3.6M18.4 6l-1.6 3.6" />
      <path d="M10.6 12.4v4l3.6-2z" />
    </>
  ),
  // antena de transmissão
  lives: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </>
  ),
  // microfone de estúdio
  rooms: (
    <>
      <rect x="9.4" y="3.6" width="5.2" height="9.4" rx="2.6" />
      <path d="M6.6 11.6a5.4 5.4 0 0 0 10.8 0M12 17v3.2M9.2 20.4h5.6" />
    </>
  ),
  // presente com laço
  gifts_sent: (
    <>
      <rect x="3.8" y="9.6" width="16.4" height="9.8" rx="1.8" />
      <path d="M3 6.6h18v3H3zM12 6.6v12.8" />
      <path d="M12 6.6C10.4 6.6 8.6 6 8.6 4.7S10.6 3.4 12 6.6zM12 6.6c1.6 0 3.4-.6 3.4-1.9s-2-1.3-3.4 1.9z" />
    </>
  ),
  // diamante radiante
  gifts_received: (
    <>
      <path d="M6.4 5.6h11.2l3 4.2L12 19.6 3.4 9.8z" />
      <path d="M3.4 9.8h17.2M9.4 5.6 8 9.8l4 9.8M14.6 5.6 16 9.8l-4 9.8" />
    </>
  ),
  // troféu com estrela
  default: (
    <>
      <path d="M7.4 4.4h9.2v4.2a4.6 4.6 0 0 1-9.2 0z" />
      <path d="M7.4 5.8H4.8v1.4a3.2 3.2 0 0 0 3 3.2M16.6 5.8h2.6v1.4a3.2 3.2 0 0 1-3 3.2" />
      <path d="M12 13.2v3.4M8.8 19.6h6.4l-.8-3H9.6z" />
    </>
  ),
};

const EMBLEM_ALIAS: Record<string, string> = {
  first_post: "posts",
  first_video: "videos",
  reel: "videos",
  video: "videos",
  first_live: "lives",
  first_room: "rooms",
  gift_sender: "gifts_sent",
  gift_star: "gifts_received",
};

const LOCK_EMBLEM = (
  <>
    <rect x="5" y="10.4" width="14" height="9" rx="2.2" />
    <path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4M12 13.8v2.4" />
  </>
);

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
    <span
      className={cn("achv-medal", unlocked ? "achv-medal-on" : "achv-medal-off")}
      style={{ ["--achv-aura" as string]: metal.via }}
      aria-hidden
    >
      {unlocked ? <span className="achv-aura" /> : null}
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
      {unlocked ? (
        <span className="achv-orbit">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {unlocked && (tier === "diamante" || tier === "lendario") ? (
        <span className="achv-medal-star">
          <Award className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}
