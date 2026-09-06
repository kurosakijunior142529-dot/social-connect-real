import { useNavigate } from "@tanstack/react-router";
import { Fragment, type MouseEvent } from "react";
import { tagSlug } from "@/lib/search";

const HASHTAG_RE = /(#[\p{L}\p{N}_]{1,60})/gu;
const IS_TAG = /^#[\p{L}\p{N}_]{1,60}$/u;

/**
 * Renderiza um texto normal, mas transforma #hashtags em elementos clicáveis.
 * Usa span + navigate (em vez de Link) porque legendas podem estar dentro de links.
 */
export function RichCaption({ text, className }: { text: string; className?: string }) {
  const navigate = useNavigate();

  const open = (event: MouseEvent, raw: string) => {
    event.preventDefault();
    event.stopPropagation();
    const slug = tagSlug(raw);
    if (slug) navigate({ to: "/t/$tag", params: { tag: slug } });
  };

  const parts = text.split(new RegExp(HASHTAG_RE.source, "u"));

  return (
    <span className={className}>
      {parts.map((part, i) =>
        IS_TAG.test(part) ? (
          <span
            key={i}
            role="link"
            tabIndex={0}
            onClick={(e) => open(e, part)}
            onKeyDown={(e) => {
              if (e.key === "Enter") open(e as unknown as MouseEvent, part);
            }}
            className="cursor-pointer font-semibold text-primary hover:underline"
          >
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
