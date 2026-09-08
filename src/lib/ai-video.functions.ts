import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Geração de vídeo por IA (Veo 3.1) através do AI Gateway da Lovable.
 * A chave fica SOMENTE no servidor (LOVABLE_API_KEY) — nada disso vai para o navegador.
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/videos";
export const VIDEO_MODEL = "google/veo-3.1-fast";

/** Limites simples de custo (por usuário / por dia). */
const DAILY_VIDEO_LIMIT = 5;

function gatewayKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("A geração de vídeo não está configurada no servidor.");
  return key;
}

/** Mensagem amigável a partir do status HTTP do gateway. */
function friendlyError(status: number, body: string) {
  console.error("[ai-video] gateway error", status, body.slice(0, 500));
  if (status === 402) return "Os créditos de IA acabaram. Adicione créditos para gerar vídeos.";
  if (status === 403) return "A geração de vídeo está bloqueada nas configurações da conta.";
  if (status === 429) return "Muitos vídeos sendo gerados agora. Tente de novo em instantes.";
  if (status === 400) return "Não consegui gerar com essa descrição. Tente descrever de outro jeito.";
  return "Não foi possível gerar o vídeo agora.";
}

export const startVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        prompt: z.string().trim().min(5).max(1000),
        seconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const seconds = data.seconds ?? 8;

    // Proteção contra chamadas duplicadas: um vídeo por vez, por usuário.
    const { data: running } = await db
      .from("ai_generations")
      .select("id")
      .eq("user_id", context.userId)
      .eq("kind", "video")
      .in("status", ["pending", "processing"])
      .limit(1);
    if (running?.length) throw new Error("Você já tem um vídeo sendo gerado. Aguarde ele terminar.");

    // Limite diário (controle de custo).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("kind", "video")
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_VIDEO_LIMIT) {
      throw new Error(`Limite de ${DAILY_VIDEO_LIMIT} vídeos por dia atingido. Tente novamente amanhã.`);
    }

    const { data: gen, error: genErr } = await db
      .from("ai_generations")
      .insert({
        user_id: context.userId,
        thread_id: data.threadId,
        kind: "video",
        status: "pending",
        prompt: data.prompt,
        model: VIDEO_MODEL,
        duration_seconds: seconds,
      })
      .select("id")
      .single();
    if (genErr) throw new Error(genErr.message);

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${gatewayKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        instances: [{ prompt: data.prompt }],
        parameters: {
          durationSeconds: seconds,
          resolution: "720p",
          aspectRatio: "9:16",
          sampleCount: 1,
          generateAudio: true,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const message = friendlyError(res.status, body);
      await db.from("ai_generations").update({ status: "failed", error: body.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", gen.id);
      throw new Error(message);
    }

    const job = (await res.json()) as { id: string; status?: string };
    await db
      .from("ai_generations")
      .update({ job_id: job.id, status: "processing", updated_at: new Date().toISOString() })
      .eq("id", gen.id);

    // Registra o pedido na conversa.
    await db.from("ai_messages").insert({
      thread_id: data.threadId,
      user_id: context.userId,
      role: "user",
      content: `/video ${data.prompt}`,
    });

    return { generationId: gen.id as string, status: "processing" as const };
  });

export const checkVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: gen, error } = await db
      .from("ai_generations")
      .select("id, status, job_id, prompt, thread_id, result_path, error")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .single();
    if (error || !gen) throw new Error("Geração não encontrada.");
    if (gen.status === "completed" || gen.status === "failed") {
      return { status: gen.status as string, path: gen.result_path as string | null };
    }
    if (!gen.job_id) return { status: "processing", path: null };

    const res = await fetch(`${GATEWAY}/${gen.job_id}`, {
      headers: { Authorization: `Bearer ${gatewayKey()}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai-video] poll failed", res.status, body.slice(0, 300));
      return { status: "processing", path: null };
    }
    const job = (await res.json()) as { status: string; error?: { message?: string } };

    if (job.status === "failed") {
      await db
        .from("ai_generations")
        .update({ status: "failed", error: (job.error?.message ?? "falha na geração").slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", gen.id);
      return { status: "failed", path: null };
    }
    if (job.status !== "completed") return { status: "processing", path: null };

    // Concluído: baixa o MP4 e guarda no storage do próprio app (o link do gateway expira).
    const content = await fetch(`${GATEWAY}/${gen.job_id}/content`, {
      headers: { Authorization: `Bearer ${gatewayKey()}` },
    });
    if (!content.ok) {
      console.error("[ai-video] download failed", content.status);
      return { status: "processing", path: null };
    }
    const bytes = new Uint8Array(await content.arrayBuffer());
    const path = `${context.userId}/ai/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await db.storage.from("posts").upload(path, bytes, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (upErr) {
      await db
        .from("ai_generations")
        .update({ status: "failed", error: upErr.message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", gen.id);
      return { status: "failed", path: null };
    }

    const { data: msg } = await db
      .from("ai_messages")
      .insert({
        thread_id: gen.thread_id,
        user_id: context.userId,
        role: "assistant",
        content: `Seu vídeo está pronto: **${gen.prompt}**`,
        video_url: path,
      })
      .select("id")
      .single();

    await db
      .from("ai_generations")
      .update({ status: "completed", result_path: path, message_id: msg?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", gen.id);

    return { status: "completed", path };
  });

/** Publica no feed do Vibely uma imagem ou vídeo já gerado e guardado no storage. */
export const publishGenerated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        path: z.string().min(3).max(400),
        kind: z.enum(["image", "video"]),
        caption: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Conteúdo inválido.");
    const db = context.supabase as any;
    const { data: post, error } = await db
      .from("posts")
      .insert({
        author_id: context.userId,
        media_url: data.path,
        media_type: data.kind,
        post_kind: "post",
        caption: (data.caption ?? "").slice(0, 500),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await db
      .from("ai_generations")
      .update({ post_id: post.id, updated_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("result_path", data.path);

    return { postId: post.id as string };
  });
