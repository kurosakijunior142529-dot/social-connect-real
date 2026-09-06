/**
 * IA do Vibely Studio.
 * Tudo passa pelo gateway de IA já configurado no app — nenhuma chave sai do
 * servidor. Quando a chave não está configurada, as ferramentas informam isso
 * em vez de fingir que funcionaram.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IMAGE_MODEL = "google/gemini-3.1-flash-image";
const TEXT_MODEL = "google/gemini-3.6-flash";

export type AiToolId =
  | "remove-bg"
  | "replace-bg"
  | "remove-object"
  | "enhance"
  | "blur-bg"
  | "cinematic"
  | "anime"
  | "artistic"
  | "colorize"
  | "retouch"
  | "relight";

const PROMPTS: Record<AiToolId, string> = {
  "remove-bg": "Remove the background completely, keep only the main subject, put it on a solid white background. Keep the subject pixel-accurate.",
  "replace-bg": "Replace the background behind the main subject with: {extra}. Keep the subject unchanged, match lighting and perspective.",
  "remove-object": "Remove this from the photo: {extra}. Reconstruct the area behind it realistically. Do not change anything else.",
  enhance: "Enhance this photo: increase sharpness and real detail, fix exposure and white balance, reduce noise. Keep it photorealistic, do not restyle.",
  "blur-bg": "Keep the main subject perfectly sharp and apply a realistic shallow depth-of-field blur (portrait bokeh) to the background only.",
  cinematic: "Regrade this image with a cinematic film look: teal and orange grading, soft contrast rolloff, subtle grain. Keep the composition identical.",
  anime: "Redraw this image in a high quality modern anime style, keeping the same composition, pose and colors.",
  artistic: "Repaint this image as an expressive digital painting with visible brush strokes, keeping the same composition.",
  colorize: "Colorize this image with realistic, natural colors. Keep all details intact.",
  retouch: "Retouch this portrait: clean up skin blemishes naturally, even out skin tone, keep pores and texture. No plastic look, no face reshaping.",
  relight: "Improve the lighting: lift the shadows, balance the highlights, add a natural key light on the subject. Keep it photorealistic.",
};

export const studioAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ available: !!process.env.LOVABLE_API_KEY }));

/** Processa uma imagem (data URL) com uma das ferramentas de IA. */
export const studioAiImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tool: z.enum([
          "remove-bg",
          "replace-bg",
          "remove-object",
          "enhance",
          "blur-bg",
          "cinematic",
          "anime",
          "artistic",
          "colorize",
          "retouch",
          "relight",
        ]),
        image: z.string().min(64).max(12_000_000),
        extra: z.string().max(300).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("A IA do Vibely não está configurada neste ambiente.");

    const prompt = PROMPTS[data.tool as AiToolId].replace("{extra}", data.extra?.trim() || "a clean neutral scene");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (res.status === 429) throw new Error("Muitas edições seguidas. Espere alguns segundos e tente de novo.");
    if (res.status === 402) throw new Error("Os créditos de IA acabaram. Recarregue para continuar usando as ferramentas de IA.");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`A IA não conseguiu processar (${res.status}). ${body.slice(0, 160)}`);
    }
    const json = (await res.json()) as any;
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("A IA não devolveu uma imagem.");
    return { image: `data:image/png;base64,${b64}` };
  });

export type AiEditPlanStep = {
  clip: number;
  speed?: number;
  filterId?: string;
  effects?: { effectId: string; intensity: number }[];
  transitionId?: string;
  zoomOnBeats?: boolean;
};

export type AiEditPlan = {
  style: string;
  cutOnBeats: boolean;
  beatEffect: string | null;
  steps: AiEditPlanStep[];
  filterId: string;
  notes: string;
};

/** Gera uma estrutura de edição a partir de um pedido em texto. */
export const studioAiEditPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(500),
        clipCount: z.number().int().min(1).max(40),
        duration: z.number().min(0.5).max(600),
        bpm: z.number().nullable().optional(),
        hasMusic: z.boolean(),
        filters: z.array(z.string()).max(80),
        effects: z.array(z.string()).max(80),
        transitions: z.array(z.string()).max(40),
        beatEffects: z.array(z.string()).max(20),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("A IA do Vibely não está configurada neste ambiente.");

    const system = `Você é o diretor de edição do Vibely Studio. Responda SOMENTE com JSON válido no formato:
{"style":string,"cutOnBeats":boolean,"beatEffect":string|null,"filterId":string,"notes":string,
 "steps":[{"clip":number,"speed":number,"filterId":string,"transitionId":string,"zoomOnBeats":boolean,
 "effects":[{"effectId":string,"intensity":number}]}]}
Use apenas ids das listas fornecidas. speed entre 0.25 e 4. intensity entre 10 e 100.
Um step por clipe (clip = índice começando em 0). notes tem no máximo 140 caracteres, em português.`;

    const user = `Pedido: ${data.prompt}
Clipes: ${data.clipCount}. Duração: ${data.duration.toFixed(1)}s. Música: ${data.hasMusic ? `sim${data.bpm ? `, ${data.bpm} BPM` : ""}` : "não"}.
filtros: ${data.filters.join(", ")}
efeitos: ${data.effects.join(", ")}
transições: ${data.transitions.join(", ")}
efeitos de batida: ${data.beatEffects.join(", ")}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
      }),
    });
    if (res.status === 429) throw new Error("Muitos pedidos seguidos. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Os créditos de IA acabaram. Recarregue para continuar.");
    if (!res.ok) throw new Error(`A IA não respondeu (${res.status}).`);
    const json = (await res.json()) as any;
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("A IA não devolveu um plano de edição válido.");
    try {
      return JSON.parse(match[0]) as AiEditPlan;
    } catch {
      throw new Error("A IA devolveu um plano inválido. Tente reescrever o pedido.");
    }
  });
