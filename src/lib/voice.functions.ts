import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Issues a LiveKit token for a Discord-style voice channel.
 * Audio pipeline is identical to the (already working) 1:1 call path.
 */
export const getVoiceChannelAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        displayName: z.string().max(60).optional(),
        avatarUrl: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: any; userId: string };
    // Sala de voz de grupo: o id é o do próprio grupo e só membros entram.
    const { data: member } = await ctx.supabase
      .from("chat_members")
      .select("chat_id")
      .eq("chat_id", data.channelId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    let channel: { id: string; name: string } | null = null;
    if (member) {
      const { data: g } = await ctx.supabase
        .from("chats")
        .select("id, title, type")
        .eq("id", data.channelId)
        .maybeSingle();
      if (g && g.type === "group") channel = { id: g.id, name: g.title ?? "Grupo" };
    }
    if (!channel) {
      const { data: vc, error } = await ctx.supabase
        .from("voice_channels")
        .select("id, name, is_public, created_by")
        .eq("id", data.channelId)
        .maybeSingle();
      if (error || !vc) throw new Error("Sala de voz não encontrada");
      if (!vc.is_public && vc.created_by !== ctx.userId) {
        throw new Error("Você não tem acesso a esta sala");
      }
      channel = vc as { id: string; name: string };
    }

    if (!channel) throw new Error("Sala de voz não encontrada");
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
