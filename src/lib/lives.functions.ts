import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AudienceEnum = z.enum(["public", "followers", "friends", "private", "subs_only"]);

const CreateLiveInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).max(10).default([]),
  thumbnail_url: z.string().url().optional().nullable(),
  language: z.string().max(20).default("pt-BR"),
  age_restricted: z.boolean().default(false),
  audience: AudienceEnum.default("public"),
  allow_guests: z.boolean().default(true),
  auto_record: z.boolean().default(true),
});

export const createLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateLiveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roomName = `live_${crypto.randomUUID().replace(/-/g, "")}`;
    const { data: row, error } = await supabase
      .from("lives" as any)
      .insert({
        host_id: userId,
        livekit_room: roomName,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        thumbnail_url: data.thumbnail_url,
        language: data.language,
        age_restricted: data.age_restricted,
        audience: data.audience,
        allow_guests: data.allow_guests,
        auto_record: data.auto_record,
        status: "preparing",
      })
      .select("id, livekit_room")
      .single();
    if (error) throw new Error(error.message);

    const { issueToken, livekitUrl, roomService } = await import("@/lib/livekit.server");
    // Best-effort: create the room ahead of time
    try {
      await roomService().createRoom({ name: roomName, emptyTimeout: 300, maxParticipants: 5000 });
    } catch {
      /* room can be lazy-created on first join */
    }
    const token = await issueToken({
      identity: userId,
      name: userId,
      room: roomName,
      canPublish: true,
      metadata: JSON.stringify({ role: "host" }),
    });
    return { liveId: (row as any).id as string, token, wsUrl: livekitUrl(), room: roomName };
  });

export const startLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { liveId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("lives" as any)
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("id", data.liveId)
      .eq("host_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const endLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { liveId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("lives" as any)
      .select("host_id, livekit_room")
      .eq("id", data.liveId)
      .maybeSingle();
    if (!row || (row as any).host_id !== userId) throw new Error("Não autorizado");
    await supabase
      .from("lives" as any)
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.liveId);
    try {
      const { roomService } = await import("@/lib/livekit.server");
      await roomService().deleteRoom((row as any).livekit_room);
    } catch {
      /* ignore */
    }
    return { ok: true };
  });

export const getViewerToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { liveId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("lives" as any)
      .select("id, host_id, livekit_room, status, audience")
      .eq("id", data.liveId)
      .maybeSingle();
    if (error || !row) throw new Error("Live não encontrada");
    const live = row as any;
    // banned check
    const { data: ban } = await supabase
      .from("live_bans" as any)
      .select("user_id, expires_at")
      .eq("live_id", data.liveId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ban && (!(ban as any).expires_at || new Date((ban as any).expires_at) > new Date())) {
      throw new Error("Você está banido desta live");
    }
    const isHost = live.host_id === userId;
    const { issueToken, livekitUrl } = await import("@/lib/livekit.server");
    const token = await issueToken({
      identity: userId,
      name: userId,
      room: live.livekit_room,
      canPublish: isHost,
      metadata: JSON.stringify({ role: isHost ? "host" : "viewer" }),
    });
    return { token, wsUrl: livekitUrl(), isHost, room: live.livekit_room, status: live.status };
  });
