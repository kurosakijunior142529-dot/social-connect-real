/**
 * Geração da imagem do Vibely Reality.
 * Usa o mesmo gateway de IA já utilizado no Vibely Studio — nenhuma chave sai
 * do servidor. A camada é modular: trocar o provedor não afeta a interface.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IMAGE_MODEL = "google/gemini-3.1-flash-image";

const BASE =
  "Keep the original room geometry, camera angle and perspective recognizable. Photorealistic, cinematic lighting, high detail, no text, no watermark, no people added.";

export const realityGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        image: z.string().min(64).max(12_000_000),
        prompt: z.string().min(3).max(400),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA do Vibely não está configurada neste ambiente.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${data.prompt.trim()} ${BASE}` },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (res.status === 429)
      throw new Error("Muitas criações seguidas. Espere alguns segundos e tente de novo.");
    if (res.status === 402)
      throw new Error("Os créditos de IA acabaram. Recarregue para continuar criando realidades.");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Não conseguimos criar sua realidade agora (${res.status}). ${body.slice(0, 140)}`);
    }

    const json = (await res.json()) as {
      data?: { b64_json?: string }[];
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const b64 = json?.data?.[0]?.b64_json;
    const inline = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const image = b64 ? `data:image/png;base64,${b64}` : inline;
    if (!image) throw new Error("A IA não devolveu uma imagem. Tente novamente.");
    return { image };
  });
