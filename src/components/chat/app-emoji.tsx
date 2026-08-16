import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APP_EMOJIS, tokenizeAppEmojis } from "@/lib/app-emojis";
import { cn } from "@/lib/utils";

/** Renders text with the app's own inline emojis (":fogo:" etc.). */
export function EmojiText({ text, className }: { text: string; className?: string }) {
  const tokens = tokenizeAppEmojis(text ?? "");
  const onlyEmojis = tokens.every((t) => t.type === "emoji" || (t.type === "text" && !t.value.trim()));
  const size = onlyEmojis ? "h-8 w-8" : "h-[1.25em] w-[1.25em]";
  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.type === "text" ? (
          <span key={i}>{t.value}</span>
        ) : (
          <img
            key={i}
            src={t.emoji.src}
            alt={t.emoji.label}
            loading="lazy"
            decoding="async"
            style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
            className={cn(
              "inline-block align-[-0.25em] object-contain",
              size,
              onlyEmojis ? "emoji-anim emoji-anim-lg" : "emoji-anim",
            )}
          />
        ),
      )}
    </span>
  );

}

/** Compact picker that inserts an app emoji shortcode into the composer. */
export function AppEmojiPicker({
  onPick,
  children,
}: {
  onPick: (shortcode: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-6 gap-1">
          {APP_EMOJIS.map((e) => (
            <button
              key={e.code}
              type="button"
              aria-label={e.label}
              onClick={() => {
                onPick(`:${e.code}:`);
                setOpen(false);
              }}
              className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-muted active:scale-95"
            >
              <img src={e.src} alt={e.label} loading="lazy" className="h-7 w-7 object-contain" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
