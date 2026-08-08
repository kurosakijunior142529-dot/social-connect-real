import { useSignedUrl } from "@/hooks/use-signed-url";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type BadgeVariant } from "@/components/verified-badge";
import { cn } from "@/lib/utils";

type Props = {
  avatarPath: string | null | undefined;
  displayName: string;
  className?: string;
  ring?: boolean | "story" | "viewed";
  /** mantido por compatibilidade — o selo é exibido apenas no nome */
  verified?: boolean;
  badgeVariant?: BadgeVariant | null;
};

export function UserAvatar({ avatarPath, displayName, className, ring }: Props) {
  const { data: url } = useSignedUrl("avatars", avatarPath);
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const ringClass =
    ring === "story"
      ? "ring-story"
      : ring === "viewed"
        ? "bg-muted-foreground/40"
        : ring
          ? "ring-story"
          : "";

  const inner = (
    <Avatar className={cn("h-10 w-10", className)}>
      {url ? <AvatarImage src={url} alt={displayName} /> : null}
      <AvatarFallback className="bg-gradient-brand text-white font-semibold">
        {initials || "?"}
      </AvatarFallback>
    </Avatar>
  );

  // O selo verificado aparece somente ao lado do nome (VerifiedName), nunca na foto.
  const withBadge = (child: React.ReactNode) => child;

  if (!ring) return withBadge(inner);

  return withBadge(
    <div className={cn("rounded-full p-[2px]", ringClass)}>
      <div className="rounded-full bg-background p-[2px]">{inner}</div>
    </div>,
  );
}
