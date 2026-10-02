import { Check, Crown, Code2, Handshake, Star, Sparkles, Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  interactive?: boolean;
};

export const BADGE_CONFIG: Record<BadgeVariant, {
  label: string;
  shortLabel: string;
  description: string;
  criterion: string;
  gradient: string;
  ring: string;
  glow: string;
  toneClass: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
}> = {
  verified: {
    label: "Conta verificada",
    shortLabel: "Verificado social",
    description: "Identidade autêntica e presença reconhecida na comunidade Vibely.",
    criterion: "Identidade confirmada, atividade autêntica e histórico seguro.",
    gradient: "linear-gradient(135deg,#22E06A 0%,#0BA85B 55%,#0A7A45 100%)",
    ring: "rgba(34,224,106,0.55)",
    glow: "0 0 12px rgba(34,224,106,0.55)",
    toneClass: "badge-tone-verified",
    Icon: Check,
  },
  premium: {
    label: "Vibely Premium",
    shortLabel: "Premium",
    description: "Conta com acesso premium e identidade confirmada no Vibely.",
    criterion: "Assinatura ativa e conta em conformidade com as diretrizes.",
    gradient: "linear-gradient(135deg,#FFE27A 0%,#F7B733 45%,#B8791A 100%)",
    ring: "rgba(247,183,51,0.6)",
    glow: "0 0 14px rgba(247,183,51,0.6)",
    toneClass: "badge-tone-premium",
    Icon: Crown,
  },
  developer: {
    label: "Desenvolvedor Vibely",
    shortLabel: "Desenvolvedor",
    description: "Pessoa reconhecida por construir e fortalecer o ecossistema Vibely.",
    criterion: "Contribuição técnica relevante e identidade confirmada.",
    gradient: "linear-gradient(135deg,#8AA9FF 0%,#4C6EF5 55%,#2E3EA8 100%)",
    ring: "rgba(76,110,245,0.6)",
    glow: "0 0 14px rgba(76,110,245,0.55)",
    toneClass: "badge-tone-developer",
    Icon: Code2,
  },
  partner: {
    label: "Parceiro oficial",
    shortLabel: "Parceiro",
    description: "Organização ou profissional com parceria oficial reconhecida.",
    criterion: "Parceria vigente, identidade validada e atuação transparente.",
    gradient: "linear-gradient(135deg,#B592FF 0%,#7C3AED 55%,#4C1D95 100%)",
    ring: "rgba(124,58,237,0.6)",
    glow: "0 0 14px rgba(124,58,237,0.55)",
    toneClass: "badge-tone-partner",
    Icon: Handshake,
  },
  creator: {
    label: "Criador em destaque",
    shortLabel: "Criador",
    description: "Criador reconhecido pela originalidade e conexão com a comunidade.",
    criterion: "Produção original, consistência e engajamento autêntico.",
    gradient: "linear-gradient(135deg,#FF9EC7 0%,#FF3D8A 55%,#B01758 100%)",
    ring: "rgba(255,61,138,0.6)",
    glow: "0 0 14px rgba(255,61,138,0.55)",
    toneClass: "badge-tone-creator",
    Icon: Sparkles,
  },
  star: {
    label: "Estrela Vibely",
    shortLabel: "Estrela",
    description: "Reconhecimento especial por impacto positivo dentro da comunidade.",
    criterion: "Impacto relevante, participação contínua e boa reputação.",
    gradient: "linear-gradient(135deg,#8BE9FF 0%,#22B8F2 55%,#0B6E9E 100%)",
    ring: "rgba(34,184,242,0.6)",
    glow: "0 0 14px rgba(34,184,242,0.55)",
    toneClass: "badge-tone-star",
    Icon: Star,
  },
  founder: {
    label: "Pioneira • Primeira usuária da Vibely",
    shortLabel: "Pioneiro",
    description: "Insígnia histórica reservada a quem ajudou a iniciar a comunidade.",
    criterion: "Participação elegível nas primeiras fases do Vibely.",
    gradient: "linear-gradient(135deg,#FFF3B0 0%,#22E06A 45%,#0B7A45 100%)",
    ring: "rgba(255,220,120,0.75)",
    glow: "0 0 18px rgba(34,224,106,0.7)",
    toneClass: "badge-tone-founder",
    Icon: Rocket,
  },
};

export function getBadgeVariant(value?: BadgeVariant | string | null): BadgeVariant {
  return value && value in BADGE_CONFIG ? (value as BadgeVariant) : "verified";
}

export function VerifiedBadge({
  className,
  size = 16,
  variant = "verified",
  animated = true,
  title,
  interactive = true,
}: Props) {
  const cfg = BADGE_CONFIG[variant] ?? BADGE_CONFIG.verified;
  const Icon = cfg.Icon;
  const iconSize = Math.round(size * 0.6);
  const halo = Math.round(size * 1.75);

  const badge = (
    <span
      className={cn("relative inline-grid place-items-center shrink-0 align-middle", className)}
      style={{ height: size, width: size }}
      title={title ?? cfg.label}
      aria-label={title ?? cfg.label}
    >
      {/* Aro luminoso girando */}
      {animated ? (
        <span
          aria-hidden
          className="absolute rounded-full badge-spin pointer-events-none"
          style={{
            height: halo,
            width: halo,
            background: `conic-gradient(from 0deg, transparent 0deg, ${cfg.ring} 70deg, transparent 150deg, transparent 220deg, ${cfg.ring} 290deg, transparent 360deg)`,
            filter: "blur(2px)",
            opacity: 0.65,
            maskImage: "radial-gradient(circle, transparent 52%, #000 58%, #000 76%, transparent 82%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 52%, #000 58%, #000 76%, transparent 82%)",
          }}
        />
      ) : null}

      {/* Pulso */}
      {animated ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full badge-pulse pointer-events-none"
          style={{ color: cfg.ring }}
        />
      ) : null}

      {/* Corpo do selo */}
      <span
        className={cn(
          "relative inline-grid place-items-center rounded-full overflow-hidden h-full w-full",
          animated && "badge-sheen badge-breathe",
        )}
        style={{
          background: cfg.gradient,
          boxShadow: `${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.28), 0 0 0 1px ${cfg.ring}`,
        }}
      >
        {/* Gloss highlight */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 55%)",
          }}
        />
        <Icon
          strokeWidth={3.5}
          className="relative text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
          style={{ height: iconSize, width: iconSize }}
        />
      </span>

      {/* Estrelinhas */}
      {animated ? (
        <>
          <span
            aria-hidden
            className="absolute rounded-full badge-twinkle pointer-events-none"
            style={{
              height: Math.max(2, size * 0.16),
              width: Math.max(2, size * 0.16),
              top: -size * 0.12,
              right: -size * 0.06,
              background: "#fff",
              boxShadow: `0 0 6px ${cfg.ring}`,
            }}
          />
          <span
            aria-hidden
            className="absolute rounded-full badge-twinkle pointer-events-none"
            style={{
              height: Math.max(2, size * 0.13),
              width: Math.max(2, size * 0.13),
              bottom: -size * 0.1,
              left: -size * 0.08,
              background: "#fff",
              boxShadow: `0 0 6px ${cfg.ring}`,
              animationDelay: "1.1s",
            }}
          />
        </>
      ) : null}
    </span>
  );

  if (!interactive) return badge;

  return (
    <Dialog>
      <span
        role="button"
        tabIndex={0}
        className="inline-grid cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Conhecer o selo ${cfg.shortLabel}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const trigger = event.currentTarget.querySelector<HTMLElement>("[data-badge-trigger]");
          trigger?.click();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.querySelector<HTMLElement>("[data-badge-trigger]")?.click();
        }}
      >
        {badge}
        <span data-badge-trigger className="hidden" />
      </span>
      <DialogContent className={cn("w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-[28px] border p-0", cfg.toneClass)}>
        <div className="badge-auth-card relative px-6 pb-6 pt-8 text-center">
          <div className="badge-auth-orbit mx-auto grid h-24 w-24 place-items-center rounded-full">
            <VerifiedBadge size={48} variant={variant} animated interactive={false} />
          </div>
          <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Autenticidade Vibely</div>
          <DialogTitle className="mt-1 text-2xl font-display font-bold">{cfg.shortLabel}</DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-xs text-sm leading-6">{cfg.description}</DialogDescription>
          <div className="mt-5 rounded-2xl border border-[color:var(--badge-tone-border)] bg-[color:var(--badge-tone-soft)] p-4 text-left">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldMark /> Reconhecimento autêntico
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{cfg.criterion}</p>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Concedido pelo Vibely. Este selo não pode ser alterado pelo perfil.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShieldMark() {
  return <Check className="h-4 w-4 rounded-full bg-[color:var(--badge-tone)] p-0.5 text-background" strokeWidth={3} />;
}

/** Nome + selo, para usar em feeds, chats, comentários, etc. */
export function VerifiedName({
  name,
  verified,
  badgeVariant,
  size = 14,
  className,
}: {
  name: string | null | undefined;
  verified?: boolean | null;
  badgeVariant?: BadgeVariant | string | null;
  size?: number;
  className?: string;
}) {
  const safeVariant: BadgeVariant =
    getBadgeVariant(badgeVariant);
  const show = !!verified || !!badgeVariant;
  return (
    <span className={cn("inline-flex items-center gap-1 min-w-0", className)}>
      <span className="truncate">{name}</span>
      {show ? (
        <VerifiedBadge size={size} variant={safeVariant} />
      ) : null}
    </span>
  );
}
