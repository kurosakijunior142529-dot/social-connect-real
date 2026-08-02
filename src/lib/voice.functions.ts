import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Issues a LiveKit token for a Discord-style voice channel.
 * Audio pipeline is identical to the (already working) 1:1 call path.
 */
export const getVoiceChannelAccess = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        displayName: z.string().max(60).optional(),
        avatarUrl: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context!;
    const { data: channel, error } = await ctx.supabase
      .from("voice_channels")
      .select("id, name, is_public, created_by")
      .eq("id", data.channelId)
      .maybeSingle();

    if (error || !channel) throw new Error("Canal de voz não encontrado");
    if (!channel.is_public && channel.created_by !== ctx.userId) {
      throw new Error("Você não tem acesso a este canal");
    }

    const { issueToken, livekitUrl } = await import("@/lib/livekit.server");
    const room = `voice_${channel.id.replaceAll("-", "")}`;
    const token = await issueToken({
      identity: ctx.userId,
      name: data.displayName ?? ctx.userId,
      room,
      canPublish: true,
      canPublishData: true,
      metadata: JSON.stringify({
        kind: "voice",
        channelId: channel.id,
        avatarUrl: data.avatarUrl ?? null,
      }),
    });

    return { token, wsUrl: livekitUrl(), room, channelName: channel.name };
  });
