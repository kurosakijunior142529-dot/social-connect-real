import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

/** Bare ISO-639-1 codes accepted by the transcription models. */
function normalizeLang(input?: string | null): string | undefined {
  if (!input) return undefined;
  const base = input.split("-")[0]?.toLowerCase();
  return base && /^[a-z]{2}$/.test(base) ? base : undefined;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Transcribe a short WAV clip captured during a call.
 * Used as a fallback where the browser has no Web Speech API (Android WebView, Firefox).
 */
export const transcribeCallClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        // base64 of a complete 16kHz mono WAV file, kept small on the client (~4s)
        audio: z.string().min(64).max(4_000_000),
        language: z.string().min(2).max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Transcrição indisponível no momento.");

    const bytes = base64ToBytes(data.audio);
    const form = new FormData();
    form.append("model", STT_MODEL);
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "clip.wav");
    const lang = normalizeLang(data.language);
    if (lang) form.append("language", lang);

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
    } catch (error) {
      console.error("[call-stt] network failure", error);
      throw new Error("Sem conexão com o serviço de transcrição.");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[call-stt] gateway error", response.status, detail.slice(0, 400));
      if (response.status === 402) throw new Error("Créditos de IA esgotados.");
      if (response.status === 429) throw new Error("Muitas transcrições seguidas. Aguarde um instante.");
      if (response.status === 403 || response.status === 404) {
        throw new Error("Transcrição por IA não está habilitada nesta conta.");
      }
      throw new Error("Não foi possível transcrever o áudio.");
    }

    const json = (await response.json().catch(() => null)) as { text?: string } | null;
    return { text: (json?.text ?? "").trim() };
  });
