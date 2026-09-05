import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("ai_threads")
      .select("id, title, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; title: string; updated_at: string }[];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ title: z.string().max(120).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("ai_threads")
      .insert({ user_id: context.userId, title: data.title ?? "Nova conversa" })
      .select("id, title, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; title: string; updated_at: string };
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("ai_threads")
      .update({ title: data.title })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("ai_threads")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ threadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("ai_messages")
      .select("id, role, content, image_url, created_at")
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; role: string; content: string; image_url: string | null; created_at: string }[];
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      threadId: z.string().uuid(),
      content: z.string().min(1).max(8000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Save the user message
    const { data: userMsg, error } = await (context.supabase as any)
      .from("ai_messages")
      .insert({
        thread_id: data.threadId,
        user_id: context.userId,
        role: "user",
        content: data.content,
      })
      .select("id, role, content, image_url, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Call Gemini
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: history } = await (context.supabase as any)
      .from("ai_messages")
      .select("role, content")
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(40);

    const messages = [
      { role: "system", content: "Você é o Vibely AI, um assistente amigável em português brasileiro. Responda de forma clara, com markdown quando útil. Se o usuário pedir uma imagem, diga que ele pode usar o comando /imagem <descrição>." },
      ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`IA falhou (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = await res.json() as any;
    const text = json?.choices?.[0]?.message?.content ?? "";

    // Auto-title if this is the first exchange
    if ((history ?? []).length <= 1) {
      const title = data.content.slice(0, 60).replace(/\n/g, " ").trim();
      await (context.supabase as any)
        .from("ai_threads")
        .update({ title: title || "Nova conversa" })
        .eq("id", data.threadId)
        .eq("user_id", context.userId);
    }

    const { data: aiMsg } = await (context.supabase as any)
      .from("ai_messages")
      .insert({
        thread_id: data.threadId,
        user_id: context.userId,
        role: "assistant",
        content: text,
      })
      .select("id, role, content, image_url, created_at")
      .single();

    return { user: userMsg, assistant: aiMsg };
  });

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      threadId: z.string().uuid(),
      prompt: z.string().min(3).max(2000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Save user prompt message first
    await (context.supabase as any).from("ai_messages").insert({
      thread_id: data.threadId,
      user_id: context.userId,
      role: "user",
      content: `/imagem ${data.prompt}`,
    });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{ role: "user", content: data.prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Imagem falhou (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = await res.json() as any;
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("A IA não retornou imagem");

    // Upload to posts bucket under <uid>/ai/ (storage RLS requires the first folder to be the user id)
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${context.userId}/ai/${crypto.randomUUID()}.png`;
    const { error: upErr } = await (context.supabase as any).storage
      .from("posts")
      .upload(path, buf, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: aiMsg, error } = await (context.supabase as any)
      .from("ai_messages")
      .insert({
        thread_id: data.threadId,
        user_id: context.userId,
        role: "assistant",
        content: `Aqui está sua imagem: **${data.prompt}**`,
        image_url: path,
      })
      .select("id, role, content, image_url, created_at")
      .single();
    if (error) throw new Error(error.message);

    return { assistant: aiMsg };
  });
