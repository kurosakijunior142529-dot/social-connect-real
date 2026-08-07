import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { transcribeCallAudio } from "@/lib/call-transcribe.server";

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
    const text = await transcribeCallAudio(data.audio, data.language);
    return { text };
  });
