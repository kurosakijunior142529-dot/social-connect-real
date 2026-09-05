const TAG = /#vibely\b/i;

/** Detecta "#vibely" em qualquer parte da mensagem e devolve a pergunta sem a tag. */
export function parseVibelyMention(text: string): string | null {
  if (!TAG.test(text)) return null;
  const question = text.replace(/#vibely/gi, " ").replace(/\s+/g, " ").trim();
  return question.length ? question : null;
}
