import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChatPrefs } from "@/lib/bubble-themes";

const chatPrefsSchema = z.object({
  themeId: z.enum([
    "classic", "modern", "neon", "glass", "gradient", "minimal", "gamer", "cyberpunk", "premium", "custom",
  ]),
  font: z.enum(["system", "serif", "mono", "rounded"]),
  radius: z.number().int().min(8).max(28),
  animations: z.boolean(),
});

export const getConversationMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("conversations")
      .select("meta")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    return (row?.meta ?? {}) as Partial<ChatPrefs>;
  });

export const setConversationMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      conversationId: z.string().uuid(),
      patch: chatPrefsSchema.partial(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_conversation_meta", {
      _conversation: data.conversationId,
      _meta: data.patch,
    });
    if (error) throw error;
    return { ok: true };
  });
