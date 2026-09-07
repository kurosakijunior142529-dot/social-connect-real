import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TTS_MODEL = "openai/gpt-4o-mini-tts";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/audio/speech";

/**
 * Speaks a translated caption during a call.
 * Returns a complete MP3 as base64 so the client can play it through the call
 * speaker without holding a stream open.
 */
export const speakCallTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(600),
        voice: z.string().min(2).max(24).default("alloy"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Leitura em voz alta indisponível no momento.");

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
        stream_format: "audio",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[call-tts] failed", response.status, detail);
      throw new Error(
        response.status === 429
          ? "Muitas leituras seguidas. Tente novamente em instantes."
          : "Não foi possível falar a tradução.",
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return { audio: btoa(binary), mime: "audio/mpeg" };
  });
