import vibe from "@/assets/emoji/vibe.png";
import fogo from "@/assets/emoji/fogo.png";
import coracao from "@/assets/emoji/coracao.png";
import foguete from "@/assets/emoji/foguete.png";
import palmas from "@/assets/emoji/palmas.png";
import estrela from "@/assets/emoji/estrela.png";

export type AppEmoji = {
  /** shortcode without colons */
  code: string;
  label: string;
  src: string;
};

export const APP_EMOJIS: AppEmoji[] = [
  { code: "vibe", label: "Vibe", src: vibe },
  { code: "fogo", label: "Fogo", src: fogo },
  { code: "coracao", label: "Coração", src: coracao },
  { code: "foguete", label: "Foguete", src: foguete },
  { code: "palmas", label: "Palmas", src: palmas },
  { code: "estrela", label: "Estrela", src: estrela },
];

const BY_CODE = new Map(APP_EMOJIS.map((e) => [e.code, e]));

export function getAppEmoji(code: string): AppEmoji | undefined {
  return BY_CODE.get(code);
}

export const APP_EMOJI_RE = /:([a-z0-9_]{2,20}):/gi;

export function hasAppEmoji(text: string): boolean {
  APP_EMOJI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = APP_EMOJI_RE.exec(text))) {
    if (BY_CODE.has(m[1].toLowerCase())) return true;
  }
  return false;
}

export type EmojiToken = { type: "text"; value: string } | { type: "emoji"; emoji: AppEmoji };

/** Splits a string into plain text and app-emoji tokens. */
export function tokenizeAppEmojis(text: string): EmojiToken[] {
  const out: EmojiToken[] = [];
  let last = 0;
  APP_EMOJI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = APP_EMOJI_RE.exec(text))) {
    const emoji = BY_CODE.get(m[1].toLowerCase());
    if (!emoji) continue;
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "emoji", emoji });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out.length ? out : [{ type: "text", value: text }];
}
