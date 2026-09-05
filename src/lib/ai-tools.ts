import { TOOLS as APP_TOOLS, runTool as runAppTool } from "@/lib/ai-chat.functions";

/**
 * Arquitetura de ferramentas da Vibely AI.
 * Para adicionar uma ferramenta nova: descreva em EXTRA_TOOLS e trate em runAiTool.
 */

export type ToolCtx = { supabase: any; userId: string; threadId: string };

export const EXTRA_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Pesquisa na internet. Use SOMENTE quando a resposta depender de informação atual, recente ou que você não tem certeza (notícias, preços, resultados, lançamentos, datas). Não use para conhecimento geral.",
      parameters: {
        type: "object",
        properties: { consulta: { type: "string", description: "Termos de busca" } },
        required: ["consulta"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Guarda uma informação duradoura e útil sobre o usuário (preferências, nome, objetivos, contexto pessoal). Nunca guarde dados sensíveis, senhas ou coisas passageiras.",
      parameters: {
        type: "object",
        properties: { memoria: { type: "string", description: "Frase curta em 1ª pessoa sobre o usuário" } },
        required: ["memoria"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_memory",
      description: "Apaga uma memória do usuário pelo id (peça confirmação antes).",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description: "Dados públicos do perfil do próprio usuário no Vibely (@, nome, bio, seguidores, posts).",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_conversation",
      description: "Procura trechos nas conversas anteriores do usuário com a IA.",
      parameters: {
        type: "object",
        properties: { termo: { type: "string" } },
        required: ["termo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file",
      description:
        "Lê o conteúdo de um arquivo enviado nesta conversa. Use quando o usuário perguntar sobre um PDF, DOCX ou TXT anexado.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do arquivo (opcional; sem ele usa o mais recente)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_action",
      description:
        "Prepara uma ação do app para o usuário confirmar (ex.: publicar algo, criar enquete). Retorna o resumo da ação; só execute a ação de verdade depois do usuário confirmar.",
      parameters: {
        type: "object",
        properties: {
          acao: { type: "string", description: "publicar_texto | criar_enquete" },
          resumo: { type: "string" },
        },
        required: ["acao", "resumo"],
        additionalProperties: false,
      },
    },
  },
];

export const AI_TOOLS = [...APP_TOOLS, ...EXTRA_TOOLS];

async function searchWeb(query: string) {
  const q = query.trim().slice(0, 200);
  if (!q) return { erro: "Consulta vazia" };
  try {
    const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return { erro: `Busca indisponível (${res.status})` };
    const html = await res.text();
    const results: { titulo: string; link: string; resumo: string }[] = [];
    const blockRe =
      /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) && results.length < 5) {
      const strip = (s: string) =>
        s
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim();
      let link = m[1] ?? "";
      const uddg = /uddg=([^&]+)/.exec(link);
      if (uddg?.[1]) link = decodeURIComponent(uddg[1]);
      results.push({ titulo: strip(m[2] ?? ""), link, resumo: strip(m[3] ?? "").slice(0, 320) });
    }
    if (!results.length) return { erro: "Nenhum resultado encontrado", consulta: q };
    return { consulta: q, resultados: results };
  } catch (e: any) {
    return { erro: `Falha na busca: ${String(e?.message ?? e).slice(0, 120)}` };
  }
}

export async function runAiTool(name: string, args: any, ctx: ToolCtx) {
  if (name === "search_web") return await searchWeb(String(args?.consulta ?? ""));

  if (name === "save_memory") {
    const memory = String(args?.memoria ?? "").trim().slice(0, 500);
    if (memory.length < 3) return { erro: "Memória vazia" };
    const { data: existing } = await ctx.supabase
      .from("ai_memories")
      .select("id, memory")
      .eq("user_id", ctx.userId)
      .limit(200);
    const dup = (existing ?? []).find(
      (r: any) => String(r.memory).toLowerCase().trim() === memory.toLowerCase(),
    );
    if (dup) return { ok: true, id: dup.id, ja_existia: true };
    const { data, error } = await ctx.supabase
      .from("ai_memories")
      .insert({ user_id: ctx.userId, memory, source: "chat" })
      .select("id")
      .single();
    if (error) return { erro: error.message };
    return { ok: true, id: data.id };
  }

  if (name === "delete_memory") {
    const id = String(args?.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "id inválido" };
    const { error } = await ctx.supabase
      .from("ai_memories")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId);
    if (error) return { erro: error.message };
    return { ok: true };
  }

  if (name === "get_user_profile") {
    const { data } = await ctx.supabase
      .from("profiles")
      .select("username, display_name, bio, created_at")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (!data) return { erro: "Perfil não encontrado" };
    const [{ count: followers }, { count: posts }] = await Promise.all([
      ctx.supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", ctx.userId),
      ctx.supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", ctx.userId),
    ]);
    return {
      usuario: data.username,
      nome: data.display_name,
      bio: data.bio,
      desde: data.created_at,
      seguidores: followers ?? 0,
      publicacoes: posts ?? 0,
    };
  }

  if (name === "search_conversation") {
    const term = String(args?.termo ?? "").trim().slice(0, 80);
    if (term.length < 2) return { erro: "Termo curto demais" };
    const { data } = await ctx.supabase
      .from("ai_messages")
      .select("content, role, created_at, thread_id")
      .eq("user_id", ctx.userId)
      .ilike("content", `%${term}%`)
      .order("created_at", { ascending: false })
      .limit(8);
    return {
      encontrados: (data ?? []).map((m: any) => ({
        quem: m.role === "user" ? "usuário" : "IA",
        quando: m.created_at,
        trecho: String(m.content).slice(0, 400),
      })),
    };
  }

  if (name === "get_file") {
    const wanted = String(args?.nome ?? "").trim().toLowerCase();
    let query = ctx.supabase
      .from("ai_files")
      .select("name, mime, extracted_text, created_at")
      .eq("user_id", ctx.userId)
      .eq("thread_id", ctx.threadId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (wanted) query = query.ilike("name", `%${wanted}%`);
    const { data } = await query;
    const file = (data ?? []).find((f: any) => f.extracted_text);
    if (!file) return { erro: "Nenhum arquivo com texto nesta conversa" };
    return {
      arquivo: file.name,
      tipo: file.mime,
      conteudo: String(file.extracted_text).slice(0, 40_000),
    };
  }

  if (name === "create_action") {
    return {
      ok: true,
      pendente_de_confirmacao: true,
      acao: String(args?.acao ?? ""),
      resumo: String(args?.resumo ?? "").slice(0, 400),
      instrucao: "Mostre o resumo ao usuário e pergunte se pode executar.",
    };
  }

  return await runAppTool(name, args, { supabase: ctx.supabase, userId: ctx.userId });
}
