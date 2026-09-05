import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Envia notificações fora do app (celular + navegador) via Firebase Cloud Messaging.
 * Chamado apenas pelos triggers do banco (pg_net) com o segredo interno.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

const BodySchema = z.object({
  kind: z.enum(["notification", "message", "chat_message", "call"]),
  id: z.string().uuid(),
});

type Target = {
  userId: string;
  title: string;
  body: string;
  path: string;
  tag?: string;
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function preview(kind: string, content: string | null) {
  if (kind === "image") return "📷 Foto";
  if (kind === "video") return "🎬 Vídeo";
  if (kind === "audio" || kind === "voice") return "🎤 Áudio";
  if (kind === "sticker") return "🩷 Figurinha";
  if (kind === "gif") return "GIF";
  if (kind === "file") return "📎 Arquivo";
  const text = (content ?? "").trim();
  if (!text) return "Nova mensagem";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

const NOTIFICATION_COPY: Record<string, (actor: string) => { title: string; body: string }> = {
  like: (a) => ({ title: "Nova curtida", body: `${a} curtiu sua publicação` }),
  comment: (a) => ({ title: "Novo comentário", body: `${a} comentou na sua publicação` }),
  follow: (a) => ({ title: "Novo seguidor", body: `${a} começou a te seguir` }),
  mention: (a) => ({ title: "Você foi mencionado", body: `${a} mencionou você` }),
  story_reaction: (a) => ({ title: "Reação na sua Vibe", body: `${a} reagiu à sua Vibe` }),
  story_view: (a) => ({ title: "Vibe vista", body: `${a} viu sua Vibe` }),
  gift: (a) => ({ title: "Você recebeu um presente 🎁", body: `${a} te enviou um presente` }),
  live: (a) => ({ title: "Live começando", body: `${a} está ao vivo agora` }),
  live_start: (a) => ({ title: "Live começando", body: `${a} está ao vivo agora` }),
  chat_invite: (a) => ({ title: "Convite de grupo", body: `${a} te convidou para um grupo` }),
};

export const Route = createFileRoute("/api/public/push/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: cfg } = await supabaseAdmin
          .from("app_private_config")
          .select("key, value")
          .in("key", ["push_dispatch_secret"]);
        const secret = cfg?.find((c) => c.key === "push_dispatch_secret")?.value ?? "";
        const provided = request.headers.get("x-vibely-push-secret") ?? "";
        if (!secret || !timingSafeEqual(secret, provided)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { kind, id } = parsed.data;

        const displayName = async (userId: string | null | undefined) => {
          if (!userId) return "Alguém";
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("display_name, username")
            .eq("id", userId)
            .maybeSingle();
          return data?.display_name || data?.username || "Alguém";
        };

        let target: Target | null = null;

        if (kind === "notification") {
          const { data: row } = await supabaseAdmin
            .from("notifications")
            .select("user_id, actor_id, type, entity_id")
            .eq("id", id)
            .maybeSingle();
          if (row) {
            const actor = await displayName(row.actor_id);
            const copy = NOTIFICATION_COPY[row.type]?.(actor) ?? {
              title: "Vibely",
              body: `${actor} interagiu com você`,
            };
            target = { userId: row.user_id, ...copy, path: "/notifications", tag: `notif-${row.type}` };
          }
        } else if (kind === "message") {
          const { data: msg } = await supabaseAdmin
            .from("messages")
            .select("conversation_id, sender_id, content, kind")
            .eq("id", id)
            .maybeSingle();
          if (msg) {
            const { data: convo } = await supabaseAdmin
              .from("conversations")
              .select("user_a, user_b")
              .eq("id", msg.conversation_id)
              .maybeSingle();
            const recipient =
              convo && (convo.user_a === msg.sender_id ? convo.user_b : convo.user_a);
            if (recipient) {
              const { data: muted } = await supabaseAdmin
                .from("muted_conversations")
                .select("user_id")
                .eq("user_id", recipient)
                .eq("conversation_id", msg.conversation_id)
                .maybeSingle();
              if (!muted) {
                target = {
                  userId: recipient,
                  title: await displayName(msg.sender_id),
                  body: preview(msg.kind, msg.content),
                  path: `/messages/${msg.conversation_id}`,
                  tag: `dm-${msg.conversation_id}`,
                };
              }
            }
          }
        } else if (kind === "chat_message") {
          const { data: msg } = await supabaseAdmin
            .from("chat_messages")
            .select("chat_id, sender_id, content, kind")
            .eq("id", id)
            .maybeSingle();
          if (msg) {
            const { data: chat } = await supabaseAdmin
              .from("chats")
              .select("title")
              .eq("id", msg.chat_id)
              .maybeSingle();
            const { data: members } = await supabaseAdmin
              .from("chat_members")
              .select("user_id")
              .eq("chat_id", msg.chat_id);
            const sender = await displayName(msg.sender_id);
            const recipients = (members ?? [])
              .map((m) => m.user_id)
              .filter((u) => u !== msg.sender_id);
            const results = await Promise.allSettled(
              recipients.map((userId) =>
                sendToUser(supabaseAdmin, {
                  userId,
                  title: chat?.title || "Grupo",
                  body: `${sender}: ${preview(msg.kind, msg.content)}`,
                  path: `/chats/${msg.chat_id}`,
                  tag: `chat-${msg.chat_id}`,
                }),
              ),
            );
            return Response.json({ ok: true, sent: results.length });
          }
        } else if (kind === "call") {
          const { data: call } = await supabaseAdmin
            .from("calls")
            .select("caller_id, callee_id, call_type")
            .eq("id", id)
            .maybeSingle();
          if (call) {
            const caller = await displayName(call.caller_id);
            target = {
              userId: call.callee_id,
              title: call.call_type === "video" ? "Chamada de vídeo" : "Chamada de voz",
              body: `${caller} está te ligando`,
              path: `/calls/${id}`,
              tag: `call-${id}`,
            };
          }
        }

        if (!target) return Response.json({ ok: true, sent: 0 });
        const sent = await sendToUser(supabaseAdmin, target);
        return Response.json({ ok: true, sent });
      },
    },
  },
});

async function sendToUser(supabaseAdmin: any, target: Target): Promise<number> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lovableKey || !connectionKey) return 0;

  const { data: tokens } = await supabaseAdmin
    .from("push_tokens")
    .select("token")
    .eq("user_id", target.userId);
  const list: string[] = (tokens ?? []).map((t: { token: string }) => t.token);
  if (!list.length) return 0;

  let sent = 0;
  await Promise.allSettled(
    list.map(async (token) => {
      const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connectionKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: target.title, body: target.body },
            data: { path: target.path, tag: target.tag ?? "vibely" },
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "vibely",
                icon: "ic_stat_icon",
                color: "#22E06A",
                tag: target.tag ?? "vibely",
              },
            },
            webpush: {
              headers: { Urgency: "high" },
              notification: {
                title: target.title,
                body: target.body,
                icon: "/icon-192.png",
                badge: "/favicon-32.png",
                tag: target.tag ?? "vibely",
              },
              fcm_options: { link: `https://vibelyconect.lovable.app${target.path}` },
            },
          },
        }),
      });
      if (res.ok) {
        sent += 1;
        return;
      }
      const errorBody = await res.text();
      console.error(`FCM send failed [${res.status}]: ${errorBody}`);
      if (res.status === 404 || res.status === 400) {
        await supabaseAdmin.from("push_tokens").delete().eq("token", token);
      }
    }),
  );
  return sent;
}
