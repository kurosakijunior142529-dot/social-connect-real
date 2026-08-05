import { Check, Crown, Code2, Handshake, Star, Sparkles, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "verified"
  | "premium"
  | "developer"
  | "partner"
  | "creator"
  | "star"
  | "founder";

type Props = {
  className?: string;
  size?: number;
  variant?: BadgeVariant;
  animated?: boolean;
  title?: string;
};

const CONFIG: Record<BadgeVariant, {
  label: string;
  gradient: string;
  ring: string;
  glow: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
}> = {
  verified: {
    label: "Conta verificada",
    gradient: "linear-gradient(135deg,#22E06A 0%,#0BA85B 55%,#0A7A45 100%)",
    ring: "rgba(34,224,106,0.55)",
    glow: "0 0 12px rgba(34,224,106,0.55)",
    Icon: Check,
  },
  premium: {
    label: "Vibely Premium",
    gradient: "linear-gradient(135deg,#FFE27A 0%,#F7B733 45%,#B8791A 100%)",
    ring: "rgba(247,183,51,0.6)",
    glow: "0 0 14px rgba(247,183,51,0.6)",
    Icon: Crown,
  },
  developer: {
    label: "Desenvolvedor Vibely",
    gradient: "linear-gradient(135deg,#8AA9FF 0%,#4C6EF5 55%,#2E3EA8 100%)",
    ring: "rgba(76,110,245,0.6)",
    glow: "0 0 14px rgba(76,110,245,0.55)",
    Icon: Code2,
  },
  partner: {
    label: "Parceiro oficial",
    gradient: "linear-gradient(135deg,#B592FF 0%,#7C3AED 55%,#4C1D95 100%)",
    ring: "rgba(124,58,237,0.6)",
    glow: "0 0 14px rgba(124,58,237,0.55)",
    Icon: Handshake,
  },
  creator: {
    label: "Criador em destaque",
    gradient: "linear-gradient(135deg,#FF9EC7 0%,#FF3D8A 55%,#B01758 100%)",
    ring: "rgba(255,61,138,0.6)",
    glow: "0 0 14px rgba(255,61,138,0.55)",
    Icon: Sparkles,
  },
  star: {
    label: "Estrela Vibely",
    gradient: "linear-gradient(135deg,#8BE9FF 0%,#22B8F2 55%,#0B6E9E 100%)",
    ring: "rgba(34,184,242,0.6)",
    glow: "0 0 14px rgba(34,184,242,0.55)",
    Icon: Star,
  },
};

export function VerifiedBadge({
  className,
  size = 16,
  variant = "verified",
  animated = true,
  title,
}: Props) {
  const cfg = CONFIG[variant];
  const Icon = cfg.Icon;
  const iconSize = Math.round(size * 0.6);

  return (
    <span
      title={title ?? cfg.label}
      aria-label={title ?? cfg.label}
      className={cn(
        "relative inline-grid place-items-center rounded-full shrink-0 overflow-hidden",
        animated && "badge-sheen",
        className,
      )}
      style={{
        height: size,
        width: size,
        background: cfg.gradient,
        boxShadow: `${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.25), 0 0 0 1px ${cfg.ring}`,
      }}
    >
      {/* Gloss highlight */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%)",
        }}
      />
      <Icon
        strokeWidth={3.5}
        className="relative text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
        style={{ height: iconSize, width: iconSize }}
      />
    </span>
  );
}
