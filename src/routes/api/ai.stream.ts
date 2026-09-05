import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { SYSTEM_PROMPT } from "@/lib/ai-chat.functions";
import { AI_TOOLS, runAiTool } from "@/lib/ai-tools";

/**
 * Resposta da Vibely AI em streaming (SSE) com Gemini.
 * Contexto = instrução do Vibely + memórias + resumo do histórico + mensagens recentes + anexos.
 */

const MODEL = "google/gemini-3.7-flash";
const SUMMARY_MODEL = "google/gemini-3.6-flash";
const RECENT_MESSAGES = 16;
const SUMMARIZE_AFTER = 30;
const MAX_TOKENS = 2048;

function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function gateway(key: string, body: unknown) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Resume mensagens antigas quando a conversa cresce, para não mandar tudo ao modelo. */
async function maybeSummarize(supabase: any, key: string, threadId: string, userId: string) {
  const { count } = await supabase
    .from("ai_messages")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("user_id", userId);
  if (!count || count < SUMMARIZE_AFTER) return;

  const { data: existing } = await supabase
    .from("ai_summaries")
    .select("id, message_count, summary")
    .eq("thread_id", threadId)
    .maybeSingle();
  if (existing && count - existing.message_count < 20) return;

  const keep = RECENT_MESSAGES;
  const { data: old } = await supabase
    .from("ai_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(Math.max(count - keep, 0));
  if (!old?.length) return;

  const transcript = old
    .map((m: any) => `${m.role === "user" ? "Usuário" : "IA"}: ${String(m.content).slice(0, 800)}`)
    .join("\n")
    .slice(0, 24_000);

  try {
    const res = await gateway(key, {
      model: SUMMARY_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Resuma a conversa abaixo em até 12 tópicos curtos, guardando decisões, preferências, fatos e pendências. Sem introdução.",
        },
        { role: "user", content: transcript },
      ],
    });
    if (!res.ok) return;
    const json: any = await res.json();
    const summary = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!summary) return;
    const covered = old[old.length - 1]?.created_at ?? new Date().toISOString();
    if (existing) {
      await supabase
        .from("ai_summaries")
        .update({ summary, message_count: count, covered_until: covered })
        .eq("id", existing.id);
    } else {
      await supabase.from("ai_summaries").insert({
        user_id: userId,
        thread_id: threadId,
        summary,
        message_count: count,
        covered_until: covered,
      });
    }
  } catch {
    /* resumo é opcional */
  }
}

export const Route = createFileRoute("/api/ai/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const key = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !key) {
          return new Response("Servidor sem configuração de IA", { status: 500 });
        }

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase: any = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub as string | undefined;
        if (claimsError || !userId) return new Response("Unauthorized", { status: 401 });

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Corpo inválido", { status: 400 });
        }
        const threadId = String(body?.threadId ?? "");
        const content = String(body?.content ?? "").slice(0, 8000).trim();
        if (!/^[0-9a-f-]{36}$/i.test(threadId) || !content) {
          return new Response("Dados inválidos", { status: 400 });
        }

        // Limite de requisições (30 mensagens a cada 10 minutos por usuário)
        const { data: allowed } = await supabase.rpc("check_rate_limit", {
          _scope: "ai_chat",
          _limit: 30,
          _window_seconds: 600,
        });
        if (allowed === false) {
          return new Response("Você enviou muitas mensagens. Aguarde alguns minutos.", { status: 429 });
        }

        // A conversa pertence ao usuário?
        const { data: thread } = await supabase
          .from("ai_threads")
          .select("id")
          .eq("id", threadId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!thread) return new Response("Conversa não encontrada", { status: 404 });

        // Anexos desta mensagem: imagens (data URL) e documentos já extraídos
        const attachments: { name: string; mime: string; kind: string; dataUrl?: string; text?: string }[] =
          Array.isArray(body?.attachments) ? body.attachments.slice(0, 4) : [];
        const images = attachments.filter((a) => a.kind === "image" && typeof a.dataUrl === "string");
        const docs = attachments.filter((a) => a.kind === "document" && typeof a.text === "string");

        const { data: userMsg, error: insertError } = await supabase
          .from("ai_messages")
          .insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            content,
            attachments: attachments.map((a) => ({ name: a.name, mime: a.mime, kind: a.kind })),
          })
          .select("id, role, content, image_url, attachments, created_at")
          .single();
        if (insertError) return new Response(insertError.message, { status: 400 });

        await maybeSummarize(supabase, key, threadId, userId);

        const [{ data: history }, { data: memories }, { data: summaryRow }] = await Promise.all([
          supabase
            .from("ai_messages")
            .select("role, content, created_at")
            .eq("thread_id", threadId)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(RECENT_MESSAGES),
          supabase
            .from("ai_memories")
            .select("id, memory")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(30),
          supabase.from("ai_summaries").select("summary").eq("thread_id", threadId).maybeSingle(),
        ]);

        const ordered = [...(history ?? [])].reverse();

        const contextBlocks: string[] = [];
        if (memories?.length) {
          contextBlocks.push(
            `MEMÓRIAS DO USUÁRIO (use quando fizer sentido, não cite os ids sem necessidade):\n` +
              memories.map((m: any) => `- [${m.id}] ${m.memory}`).join("\n"),
          );
        }
        if (summaryRow?.summary) {
          contextBlocks.push(`RESUMO DO QUE JÁ FOI CONVERSADO NESTA CONVERSA:\n${summaryRow.summary}`);
        }
        if (docs.length) {
          contextBlocks.push(
            docs
              .map(
                (d) =>
                  `ARQUIVO ANEXADO "${d.name}" (${d.mime}):\n${String(d.text).slice(0, 30_000)}`,
              )
              .join("\n\n"),
          );
        }

        const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
        if (contextBlocks.length) messages.push({ role: "system", content: contextBlocks.join("\n\n") });
        for (const m of ordered) messages.push({ role: m.role, content: m.content });

        if (images.length) {
          messages[messages.length - 1] = {
            role: "user",
            content: [
              { type: "text", text: content },
              ...images.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
            ],
          };
        }

        // Título automático na primeira troca
        if (ordered.length <= 1) {
          const title = content.slice(0, 60).replace(/\n/g, " ").trim() || "Nova conversa";
          void supabase.from("ai_threads").update({ title }).eq("id", threadId).eq("user_id", userId);
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            let closed = false;
            const push = (obj: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(sse(obj)));
              } catch {
                closed = true;
              }
            };
            let full = "";
            try {
              push({ type: "user", message: userMsg });

              for (let step = 0; step < 4; step++) {
                const res = await gateway(key, {
                  model: MODEL,
                  service_tier: "priority",
                  stream: true,
                  max_tokens: MAX_TOKENS,
                  messages,
                  tools: AI_TOOLS,
                });

                if (!res.ok || !res.body) {
                  const raw = await res.text().catch(() => "");
                  const msg =
                    res.status === 429
                      ? "Muitas mensagens agora. Tente de novo em alguns segundos."
                      : res.status === 402
                        ? "Os créditos de IA acabaram. Recarregue para continuar."
                        : `IA falhou (${res.status}): ${raw.slice(0, 160)}`;
                  push({ type: "error", message: msg });
                  return;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                const toolCalls: any[] = [];
                let sawTool = false;

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() ?? "";
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const payload = trimmed.slice(5).trim();
                    if (!payload || payload === "[DONE]") continue;
                    let json: any;
                    try {
                      json = JSON.parse(payload);
                    } catch {
                      continue;
                    }
                    const delta = json?.choices?.[0]?.delta;
                    if (!delta) continue;
                    if (delta.content) {
                      full += delta.content;
                      push({ type: "delta", text: delta.content });
                    }
                    for (const tc of delta.tool_calls ?? []) {
                      sawTool = true;
                      const idx = tc.index ?? 0;
                      toolCalls[idx] ??= { id: tc.id, type: "function", function: { name: "", arguments: "" } };
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }
                }

                if (!sawTool) break;

                messages.push({ role: "assistant", content: full || null, tool_calls: toolCalls });
                for (const call of toolCalls) {
                  const toolName = call.function.name;
                  push({
                    type: "status",
                    message:
                      toolName === "search_web"
                        ? "Pesquisando na internet…"
                        : toolName === "get_file"
                          ? "Lendo o arquivo…"
                          : toolName === "save_memory"
                            ? "Guardando na memória…"
                            : "Trabalhando nisso…",
                  });
                  let args: any = {};
                  try {
                    args = JSON.parse(call.function.arguments || "{}");
                  } catch {
                    /* ignore */
                  }
                  let result: unknown;
                  try {
                    result = await runAiTool(toolName, args, { supabase, userId, threadId });
                  } catch (err: any) {
                    result = { erro: String(err?.message ?? err).slice(0, 200) };
                  }
                  messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
                }
              }

              const text = full.trim() || "Não consegui responder agora. Tente de novo.";
              const { data: aiMsg } = await supabase
                .from("ai_messages")
                .insert({ thread_id: threadId, user_id: userId, role: "assistant", content: text })
                .select("id, role, content, image_url, attachments, created_at")
                .single();
              push({ type: "done", message: aiMsg });
            } catch (e: any) {
              push({ type: "error", message: String(e?.message ?? "Falha inesperada").slice(0, 200) });
            } finally {
              closed = true;
              try {
                controller.close();
              } catch {
                /* já fechado */
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
