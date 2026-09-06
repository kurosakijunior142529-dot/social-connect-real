import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

const MODEL = "google/gemini-3-flash-preview";

// Translate a snippet of text. `context` (previous caption/line) improves
// accuracy for short, broken sentences captured live during a call.
export const translateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        target: z.string().min(2).max(10),
        context: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // Shared cache: the same sentence translated to the same language is only
    // billed once. Best-effort — a cache failure never blocks the translation.
    let hash: string | null = null;
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.text));
      hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data: cached } = await (context.supabase as any)
        .from("translation_cache")
        .select("translated_text")
        .eq("source_hash", hash)
        .eq("target_lang", data.target)
        .maybeSingle();
      if (cached?.translated_text) return { text: cached.translated_text as string };
    } catch {
      /* cache read is optional */
    }

    const contextBlock = data.context
      ? `Previous line (context only, DO NOT translate it):\n${data.context}\n\n`
      : "";
    const { text: out } = await generateText({
      model: gateway()(MODEL),
      prompt: `${contextBlock}Translate the following text to language code "${data.target}". It may be a partial sentence from a live conversation; translate it naturally anyway. Return ONLY the translation, no quotes, no notes.\n\n${data.text}`,
    });
    const translated = out.trim();

    if (hash && translated) {
      try {
        await (context.supabase as any)
          .from("translation_cache")
          .upsert(
            { source_hash: hash, target_lang: data.target, source_text: data.text, translated_text: translated },
            { onConflict: "source_hash,target_lang" },
          );
      } catch {
        /* cache write is optional */
      }
    }
    return { text: translated };
  });

// Suggest 3 short captions for a post, in pt-BR by default.
export const suggestCaptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ hint: z.string().max(300).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const { text } = await generateText({
      model: gateway()(MODEL),
      prompt: `Sugira exatamente 3 legendas curtas e autênticas (máx. 12 palavras cada) para um post em uma rede social jovem brasileira. Uma linha por legenda, sem numeração, sem aspas, sem explicações. Tema: ${data.hint?.trim() || "momento do dia a dia, vibe positiva"}.`,
    });
    const captions = text
      .split("\n")
      .map((s) => s.replace(/^[\d.\-*\s]+/, "").replace(/^"|"$/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return { captions };
  });

// Translate several snippets at once (used when the live-caption language changes).
// Never rejects on model failure: returns `ok: false` so the UI can offer a retry.
export const translateBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1).max(1000) })).min(1).max(20),
        target: z.string().min(2).max(10),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const numbered = data.items.map((item, index) => `${index + 1}. ${item.text.replace(/\n/g, " ")}`).join("\n");
    try {
      const { text } = await generateText({
        model: gateway()(MODEL),
        prompt: `Translate each numbered line to language code "${data.target}". Return exactly ${data.items.length} lines, same numbering, translation only, no notes.\n\n${numbered}`,
      });
      const lines = text
        .split("\n")
        .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      return {
        ok: true as const,
        error: null as string | null,
        results: data.items.map((item, index) => ({
          id: item.id,
          text: lines[index] ?? item.text,
          ok: Boolean(lines[index]),
        })),
      };
    } catch (error) {
      console.error("[translateBatch] failed", error);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha na tradução",
        results: data.items.map((item) => ({ id: item.id, text: item.text, ok: false })),
      };
    }
  });


// Summarize the last N messages of a chat or DM
export const summarizeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    scope: z.enum(["chat", "dm"]),
    id: z.string().uuid(),
    limit: z.number().int().min(5).max(200).default(60),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const table = data.scope === "chat" ? "chat_messages" : "messages";
    const filterCol = data.scope === "chat" ? "chat_id" : "conversation_id";
    const { data: rows, error } = await (context.supabase as any)
      .from(table)
      .select("sender_id, content, created_at")
      .eq(filterCol, data.id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const items = (rows ?? []).reverse();
    if (items.length === 0) return { summary: "Sem mensagens recentes." };
    const ids = Array.from(new Set(items.map((r: any) => r.sender_id)));
    const { data: profs } = await (context.supabase as any).from("profiles").select("id, display_name").in("id", ids);
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    const transcript = items.map((r: any) => `${pmap.get(r.sender_id) ?? "?"}: ${r.content ?? ""}`).join("\n");
    const { text } = await generateText({
      model: gateway()(MODEL),
      prompt: `Resuma a conversa a seguir em 3-6 bullets curtos em português brasileiro, destacando decisões, pendências e tópicos principais.\n\n---\n${transcript}\n---`,
    });
    return { summary: text.trim() };
  });

// Answer an arbitrary question ("/ia ...")
export const aiAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ prompt: z.string().min(1).max(2000) }).parse(i))
  .handler(async ({ data }) => {
    const { text } = await generateText({
      model: gateway()(MODEL),
      prompt: `Você é o assistente Vibely dentro de um chat. Responda em português brasileiro, direto e útil, no máximo 6 linhas.\n\nPergunta: ${data.prompt}`,
    });
    return { text: text.trim() };
  });

// Smart-reply suggestions given last messages
export const smartReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    scope: z.enum(["chat", "dm"]),
    id: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const table = data.scope === "chat" ? "chat_messages" : "messages";
    const filterCol = data.scope === "chat" ? "chat_id" : "conversation_id";
    const { data: rows } = await (context.supabase as any)
      .from(table).select("sender_id, content, created_at")
      .eq(filterCol, data.id)
      .order("created_at", { ascending: false }).limit(8);
    const last = (rows ?? []).reverse();
    if (last.length === 0) return { suggestions: [] as string[] };
    const transcript = last.map((r: any) => `${r.sender_id === context.userId ? "eu" : "outro"}: ${r.content ?? ""}`).join("\n");
    const { text } = await generateText({
      model: gateway()(MODEL),
      prompt: `Dadas as últimas mensagens abaixo, sugira 3 respostas curtas (máx 8 palavras cada) que "eu" poderia enviar. Retorne apenas as 3 linhas, sem numeração nem aspas.\n\n${transcript}`,
    });
    const suggestions = text.split("\n").map((s) => s.replace(/^[-*\d.\s"'`]+|["'`]+$/g, "").trim()).filter(Boolean).slice(0, 3);
    return { suggestions };
  });
