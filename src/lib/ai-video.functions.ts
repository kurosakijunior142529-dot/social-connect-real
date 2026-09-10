import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  VIDEO_MODELS,
  VIDEO_STYLES,
  VIDEO_COST_CREDITS,
  allowedDurations,
  type VideoModelId,
} from "@/lib/ai-video-models";

/**
 * Geração de vídeo por IA — SEMPRE pelas APIs oficiais dos modelos.
 * - Veo 3.1: Google Generative Language API (GOOGLE_AI_API_KEY).
 * - Seedance 2.5: BytePlus ModelArk (BYTEPLUS_ARK_API_KEY).
 * O custo para o usuário é sempre em créditos internos do Vibely (`user_coins`).
 * Nenhuma chave é exposta ao navegador e o saldo de IA da Lovable não é usado.
 */

/** Limites simples de custo (por usuário / por dia). */
const DAILY_VIDEO_LIMIT = 5;

const StartSchema = z.object({
  threadId: z.string().uuid(),
  prompt: z.string().trim().min(5).max(1000),
  model: z.enum(["veo-3.1", "seedance-2.5"]).default("veo-3.1"),
  seconds: z.number().int().min(3).max(10).optional(),
  resolution: z.string().max(10).optional(),
  aspectRatio: z.string().max(8).optional(),
  audio: z.boolean().optional(),
  negativePrompt: z.string().trim().max(300).optional(),
  style: z.string().max(24).optional(),
  /** Imagem de referência (data URL) — primeiro quadro. */
  imageDataUrl: z.string().max(8_000_000).optional(),
});

function splitDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("A imagem de referência não é válida.");
  return { mimeType: m[1]!, base64: m[2]! };
}

export const startVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => StartSchema.parse(i))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const caps = VIDEO_MODELS[data.model as VideoModelId];

    // Configurações precisam existir de verdade no modelo escolhido.
    const resolution = caps.resolutions.includes(data.resolution ?? "") ? data.resolution! : caps.resolutions[0]!;
    const aspectRatio = caps.aspectRatios.includes(data.aspectRatio ?? "") ? data.aspectRatio! : caps.aspectRatios[0]!;
    const allowed = allowedDurations(caps, resolution);
    const seconds = allowed.includes(data.seconds ?? 0) ? data.seconds! : allowed[allowed.length - 1]!;
    const withAudio = caps.audio ? data.audio !== false : false;
    const style = VIDEO_STYLES.find((s) => s.id === data.style);
    const prompt = style ? `${data.prompt}. ${style.hint}` : data.prompt;

    // Um vídeo por vez, por usuário.
    const { data: running } = await db
      .from("ai_generations")
      .select("id")
      .eq("user_id", context.userId)
      .eq("kind", "video")
      .in("status", ["pending", "processing"])
      .limit(1);
    if (running?.length) throw new Error("Você já tem um vídeo sendo gerado. Aguarde ele terminar.");

    // Limite diário.
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

    // Chave do provedor antes de cobrar qualquer crédito.
    const providerKey = caps.id === "seedance-2.5" ? arkKey() : gatewayKey();

    // Cobrança de créditos (atômica). Falha aqui = nada é gerado.
    const { error: spendErr } = await db.rpc("spend_ai_credits", { _amount: VIDEO_COST_CREDITS });
    if (spendErr) {
      if (String(spendErr.message).includes("insufficient_credits")) {
        throw new Error(`Você não possui créditos suficientes para esta geração (${VIDEO_COST_CREDITS} créditos).`);
      }
      throw new Error(spendErr.message);
    }

    const { data: gen, error: genErr } = await db
      .from("ai_generations")
      .insert({
        user_id: context.userId,
        thread_id: data.threadId,
        kind: "video",
        status: "pending",
        prompt: data.prompt,
        provider: caps.id === "seedance-2.5" ? "byteplus-modelark" : "lovable-ai-gateway",
        model: caps.backendModel,
        duration_seconds: seconds,
        resolution,
        aspect_ratio: aspectRatio,
        with_audio: withAudio,
        style: data.style ?? null,
        cost_credits: VIDEO_COST_CREDITS,
      })
      .select("id")
      .single();
    if (genErr) {
      await db.rpc("spend_ai_credits", { _amount: 0 });
      throw new Error(genErr.message);
    }

    const failGeneration = async (detail: string, message: string) => {
      await db
        .from("ai_generations")
        .update({ status: "failed", error: detail.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", gen.id);
      await db.rpc("refund_ai_credits", { _generation: gen.id });
      return new Error(message);
    };

    let jobId: string;

    if (caps.id === "seedance-2.5") {
      // BytePlus ModelArk — tarefa assíncrona de geração de vídeo.
      const content: any[] = [
        {
          type: "text",
          text: `${prompt} --ratio ${aspectRatio} --dur ${seconds} --rs ${resolution}`,
        },
      ];
      if (data.imageDataUrl) {
        content.push({ type: "image_url", image_url: { url: data.imageDataUrl }, role: "first_frame" });
      }
      const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env["BYTEPLUS_SEEDANCE_MODEL"] || caps.backendModel, content }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw await failGeneration(`HTTP ${res.status} ${body}`, friendlyError(res.status, body));
      }
      const job = (await res.json()) as { id?: string; task_id?: string };
      jobId = (job.id ?? job.task_id) as string;
      if (!jobId) throw await failGeneration("sem id de tarefa", "Não foi possível gerar o vídeo agora.");
    } else {
      const instance: any = { prompt };
      if (data.negativePrompt) instance.negativePrompt = data.negativePrompt;
      if (data.imageDataUrl) {
        const { mimeType, base64 } = splitDataUrl(data.imageDataUrl);
        instance.image = { bytesBase64Encoded: base64, mimeType };
      }
      const parameters: any = {
        durationSeconds: seconds,
        resolution,
        sampleCount: 1,
        generateAudio: withAudio,
      };
      // O Veo deduz a orientação da imagem — enviar aspectRatio junto é rejeitado.
      if (!data.imageDataUrl) parameters.aspectRatio = aspectRatio;

      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: caps.backendModel, instances: [instance], parameters }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw await failGeneration(`HTTP ${res.status} ${body}`, friendlyError(res.status, body));
      }
      const job = (await res.json()) as { id: string };
      jobId = job.id;
    }

    await db
      .from("ai_generations")
      .update({ job_id: jobId, status: "processing", updated_at: new Date().toISOString() })
      .eq("id", gen.id);

    // Registra o pedido na conversa.
    await db.from("ai_messages").insert({
      thread_id: data.threadId,
      user_id: context.userId,
      role: "user",
      content: `/video ${data.prompt}`,
    });

    return { generationId: gen.id as string, status: "processing" as const, cost: VIDEO_COST_CREDITS };
  });

export const checkVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: gen, error } = await db
      .from("ai_generations")
      .select("id, status, job_id, prompt, thread_id, result_path, error, provider")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .single();
    if (error || !gen) throw new Error("Geração não encontrada.");
    if (gen.status === "completed" || gen.status === "failed") {
      return { status: gen.status as string, path: gen.result_path as string | null, error: gen.error as string | null };
    }
    if (!gen.job_id) return { status: "processing", path: null, error: null };

    const isArk = gen.provider === "byteplus-modelark";

    const markFailed = async (detail: string) => {
      await db
        .from("ai_generations")
        .update({ status: "failed", error: detail.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", gen.id);
      await db.rpc("refund_ai_credits", { _generation: gen.id });
      return { status: "failed" as const, path: null, error: detail.slice(0, 200) };
    };

    /** Bytes do MP4 quando pronto, ou null enquanto processa. */
    let bytes: Uint8Array | null = null;

    if (isArk) {
      const res = await fetch(`${ARK_BASE}/contents/generations/tasks/${gen.job_id}`, {
        headers: { Authorization: `Bearer ${arkKey()}` },
      });
      if (!res.ok) {
        console.error("[ai-video] ark poll failed", res.status);
        return { status: "processing", path: null, error: null };
      }
      const job = (await res.json()) as any;
      const st = String(job?.status ?? "");
      if (st === "failed" || st === "cancelled") {
        return await markFailed(job?.error?.message ?? "falha na geração");
      }
      if (st !== "succeeded") return { status: "processing", path: null, error: null };
      const url = job?.content?.video_url;
      if (!url) return await markFailed("a API não devolveu o vídeo");
      const dl = await fetch(url);
      if (!dl.ok) return { status: "processing", path: null, error: null };
      bytes = new Uint8Array(await dl.arrayBuffer());
    } else {
      const res = await fetch(`${GATEWAY}/${gen.job_id}`, {
        headers: { Authorization: `Bearer ${gatewayKey()}` },
      });
      if (!res.ok) {
        console.error("[ai-video] poll failed", res.status);
        return { status: "processing", path: null, error: null };
      }
      const job = (await res.json()) as { status: string; error?: { message?: string } };
      if (job.status === "failed") return await markFailed(job.error?.message ?? "falha na geração");
      if (job.status !== "completed") return { status: "processing", path: null, error: null };

      const content = await fetch(`${GATEWAY}/${gen.job_id}/content`, {
        headers: { Authorization: `Bearer ${gatewayKey()}` },
      });
      if (!content.ok) {
        console.error("[ai-video] download failed", content.status);
        return { status: "processing", path: null, error: null };
      }
      bytes = new Uint8Array(await content.arrayBuffer());
    }

    const path = `${context.userId}/ai/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await db.storage.from("posts").upload(path, bytes, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (upErr) return await markFailed(upErr.message);

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

    return { status: "completed", path, error: null };
  });

/** Melhora a descrição do usuário para virar um prompt de vídeo melhor. */
export const enhanceVideoPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ prompt: z.string().trim().min(2).max(500) }).parse(i))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA não está configurada no servidor.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "Você melhora descrições para geração de vídeo por IA. Responda SOMENTE com o prompt final, em português, numa única frase rica (máx. 400 caracteres), descrevendo cena, sujeito, movimento de câmera, iluminação e atmosfera. Uma cena só. Sem aspas, sem explicações.",
          },
          { role: "user", content: data.prompt },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Muitos pedidos agora. Tente de novo em instantes.");
    if (!res.ok) throw new Error("Não consegui melhorar o prompt agora.");
    const json = (await res.json()) as any;
    const text: string = json?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("Não consegui melhorar o prompt agora.");
    return { prompt: text.slice(0, 500) };
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
