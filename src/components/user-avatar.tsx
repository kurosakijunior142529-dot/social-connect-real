import { useSignedUrl } from "@/hooks/use-signed-url";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  avatarPath: string | null | undefined;
  displayName: string;
  className?: string;
  ring?: boolean;
};

export function UserAvatar({ avatarPath, displayName, className, ring }: Props) {
  const { data: url } = useSignedUrl("avatars", avatarPath);
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn(ring && "ring-story rounded-full p-[2px]")}>
      <Avatar className={cn("h-10 w-10", className, ring && "ring-2 ring-background")}>
        {url ? <AvatarImage src={url} alt={displayName} /> : null}
        <AvatarFallback className="bg-gradient-brand text-white font-semibold">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
