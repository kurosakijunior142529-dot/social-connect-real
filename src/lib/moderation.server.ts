import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

export type Verdict = {
  allow: boolean;
  /** "block" = never publishable, "review" = queued for human review, "ok" = fine */
  action: "ok" | "review" | "block";
  labels: string[];
  score: number;
  reason: string;
};

function gateway() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

const POLICY = `Você é um classificador de segurança de uma rede social brasileira.
Rotule o conteúdo com zero ou mais destas etiquetas:
- csam (qualquer conteúdo sexual, sugestivo ou de exploração envolvendo menores de 18 anos)
- sexual_explicit (pornografia ou nudez sexual explícita)
- nudity (nudez não sexual ou parcial)
- ncii (conteúdo íntimo aparentemente divulgado sem consentimento)
- violence (violência gráfica, violência sexual)
- harassment (assédio, bullying, ameaça, chantagem, extorsão, perseguição)
- hate (discurso de ódio)
- scam (golpe, fraude, phishing)
- spam (spam, divulgação automatizada em massa)
- illegal (drogas, armas, outros conteúdos ilegais)
- grooming (adulto tentando contato sexual/inadequado com menor)
Responda SOMENTE com JSON: {"labels":[...],"score":0..1,"reason":"curto"}
score = confiança de que o conteúdo viola as regras.`;

function parse(raw: string): { labels: string[]; score: number; reason: string } {
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const p = JSON.parse(json);
    return {
      labels: Array.isArray(p.labels) ? p.labels.map(String).slice(0, 12) : [],
      score: typeof p.score === "number" ? Math.max(0, Math.min(1, p.score)) : 0,
      reason: typeof p.reason === "string" ? p.reason.slice(0, 300) : "",
    };
  } catch {
    return { labels: [], score: 0, reason: "" };
  }
}

/** Zero tolerance labels — blocked everywhere, including private chat. */
const ALWAYS_BLOCK = ["csam", "grooming", "ncii"];
/** Blocked on public surfaces only (private adult chat is allowed). */
const PUBLIC_BLOCK = ["sexual_explicit", "violence", "illegal"];
const PUBLIC_REVIEW = ["nudity", "hate", "harassment", "scam"];

export function decide(
  labels: string[],
  score: number,
  reason: string,
  surface: "public" | "private",
  isMinor: boolean,
): Verdict {
  const has = (l: string[]) => l.some((x) => labels.includes(x));

  if (has(ALWAYS_BLOCK)) {
    return { allow: false, action: "block", labels, score: Math.max(score, 0.9), reason: reason || "Conteúdo proibido" };
  }
  if (surface === "private" && !isMinor) {
    // Adult consensual private content is allowed; abuse still blocked above.
    if (has(["harassment", "scam", "illegal"]) && score >= 0.8) {
      return { allow: true, action: "review", labels, score, reason };
    }
    return { allow: true, action: "ok", labels, score, reason };
  }
  if (isMinor && has(["sexual_explicit", "nudity", ...PUBLIC_BLOCK])) {
    return { allow: false, action: "block", labels, score, reason: "Proteção de menores" };
  }
  if (has(PUBLIC_BLOCK) && score >= 0.6) {
    return { allow: false, action: "block", labels, score, reason: reason || "Viola as regras da comunidade" };
  }
  if (has([...PUBLIC_BLOCK, ...PUBLIC_REVIEW]) && score >= 0.35) {
    return { allow: true, action: "review", labels, score, reason };
  }
  return { allow: true, action: "ok", labels, score, reason };
}

export async function classifyText(text: string) {
  const { text: out } = await generateText({
    model: gateway()(MODEL),
    prompt: `${POLICY}\n\nConteúdo:\n"""${text.slice(0, 4000)}"""`,
  });
  return parse(out);
}

export async function classifyImage(dataUrl: string) {
  const { text: out } = await generateText({
    model: gateway()(MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: POLICY },
          { type: "image", image: dataUrl },
        ],
      },
    ],
  });
  return parse(out);
}
