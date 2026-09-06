import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

/**
 * Aba "Perguntar": a IA responde SOMENTE com base no que existe no app.
 * O contexto vem de `search_ask_context`, que respeita bloqueios e privacidade.
 */
export const searchAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().min(2).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ctx, error } = await (context.supabase as any).rpc("search_ask_context", {
      _q: data.q,
    });
    if (error) throw new Error(error.message);

    const posts = (ctx?.posts ?? []) as unknown[];
    const users = (ctx?.users ?? []) as unknown[];
    const tags = (ctx?.hashtags ?? []) as unknown[];

    if (posts.length === 0 && users.length === 0 && tags.length === 0) {
      return {
        answer:
          "Ainda não encontrei nada no app sobre isso. Tente outro termo ou veja o que está em alta.",
        grounded: false,
      };
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { text } = await generateText({
      model: createLovableAiGatewayProvider(key)(MODEL),
      prompt: [
        "Você é o assistente de busca do app Vibely. Responda em português do Brasil,",
        "em no máximo 4 frases curtas, com tom simples e direto.",
        "Use EXCLUSIVAMENTE os dados abaixo — eles vêm do próprio app.",
        "É proibido inventar publicações, pessoas, números ou fatos que não estejam nos dados.",
        "Se os dados não responderem à pergunta, diga isso com franqueza.",
        "Nunca cite IDs. Cite pessoas por @usuario e hashtags por #tag.",
        "",
        `Pergunta: ${data.q}`,
        "",
        `Dados do app: ${JSON.stringify({ posts, users, hashtags: tags })}`,
      ].join("\n"),
    });

    return { answer: text.trim(), grounded: true };
  });
