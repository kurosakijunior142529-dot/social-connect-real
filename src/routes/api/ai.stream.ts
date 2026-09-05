import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { SYSTEM_PROMPT, TOOLS, runTool } from "@/lib/ai-chat.functions";

/**
 * Resposta da Vibely AI em streaming (SSE).
 * O texto chega palavra por palavra; a mensagem final é gravada no banco.
 */

const MODEL = "google/gemini-3.7-flash";

function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
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
        if (!threadId || !content) return new Response("Dados inválidos", { status: 400 });

        const { data: userMsg, error: insertError } = await supabase
          .from("ai_messages")
          .insert({ thread_id: threadId, user_id: userId, role: "user", content })
          .select("id, role, content, image_url, created_at")
          .single();
        if (insertError) return new Response(insertError.message, { status: 400 });

        const { data: history } = await supabase
          .from("ai_messages")
          .select("role, content")
          .eq("thread_id", threadId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(17);

        const ordered = [...(history ?? [])].reverse();
        const messages: any[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...ordered.map((m: any) => ({ role: m.role, content: m.content })),
        ];

        // Título automático na primeira troca
        if (ordered.length <= 1) {
          const title = content.slice(0, 60).replace(/\n/g, " ").trim() || "Nova conversa";
          void supabase.from("ai_threads").update({ title }).eq("id", threadId).eq("user_id", userId);
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const push = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
            let full = "";
            try {
              controller.enqueue(encoder.encode(sse({ type: "user", message: userMsg })));

              for (let step = 0; step < 4; step++) {
                const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: MODEL,
                    service_tier: "priority",
                    stream: true,
                    messages,
                    tools: TOOLS,
                  }),
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
                  controller.close();
                  return;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                const toolCalls: any[] = [];
                let sawTool = false;

                // eslint-disable-next-line no-constant-condition
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

                push({ type: "status", message: "Trabalhando nisso…" });
                messages.push({ role: "assistant", content: full || null, tool_calls: toolCalls });
                for (const call of toolCalls) {
                  let args: any = {};
                  try {
                    args = JSON.parse(call.function.arguments || "{}");
                  } catch {
                    /* ignore */
                  }
                  const result = await runTool(call.function.name, args, { supabase, userId });
                  messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
                }
              }

              const text = full.trim() || "Não consegui responder agora. Tente de novo.";
              const { data: aiMsg } = await supabase
                .from("ai_messages")
                .insert({ thread_id: threadId, user_id: userId, role: "assistant", content: text })
                .select("id, role, content, image_url, created_at")
                .single();
              push({ type: "done", message: aiMsg });
            } catch (e: any) {
              push({ type: "error", message: e?.message ?? "Falha inesperada" });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
