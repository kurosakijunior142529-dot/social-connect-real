import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCallAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ callId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: call, error } = await context.supabase
      .from("calls")
      .select("id, caller_id, callee_id, status")
      .eq("id", data.callId)
      .maybeSingle();

    if (error || !call) throw new Error("Chamada não encontrada");
    if (call.caller_id !== context.userId && call.callee_id !== context.userId) {
      throw new Error("Você não participa desta chamada");
    }
    if (call.status !== "accepted") throw new Error("A chamada ainda não foi atendida");

    const { issueToken, livekitUrl } = await import("@/lib/livekit.server");
    const room = `call_${call.id.replaceAll("-", "")}`;
    const token = await issueToken({
      identity: context.userId,
      name: context.userId,
      room,
      canPublish: true,
      canPublishData: true,
      metadata: JSON.stringify({ kind: "call", callId: call.id }),
    });

    return { token, wsUrl: livekitUrl(), room };
  });