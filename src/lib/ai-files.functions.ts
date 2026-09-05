import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AiFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  storage_path: string | null;
  created_at: string;
};

const MAX_TEXT = 120_000;

/**
 * Guarda um arquivo enviado para a IA.
 * - Documentos (pdf/docx/txt): o texto já vem extraído no navegador.
 * - Imagens: sobem para o storage privado do usuário (<uid>/ai/...).
 */
export const saveAiFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        name: z.string().min(1).max(200),
        mime: z.string().min(1).max(120),
        size: z.number().int().min(0).max(25 * 1024 * 1024),
        text: z.string().max(MAX_TEXT).optional(),
        imageBase64: z.string().max(14_000_000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let storagePath: string | null = null;

    if (data.imageBase64) {
      const clean = data.imageBase64.replace(/^data:[^;]+;base64,/, "");
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
      } catch {
        throw new Error("Imagem inválida");
      }
      const ext = data.mime.includes("png") ? "png" : data.mime.includes("webp") ? "webp" : "jpg";
      const path = `${context.userId}/ai/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await (context.supabase as any).storage
        .from("posts")
        .upload(path, bytes, { contentType: data.mime, upsert: false });
      if (upErr) throw new Error(upErr.message);
      storagePath = path;
    }

    const { data: row, error } = await (context.supabase as any)
      .from("ai_files")
      .insert({
        user_id: context.userId,
        thread_id: data.threadId,
        name: data.name,
        mime: data.mime,
        size: data.size,
        storage_path: storagePath,
        extracted_text: data.text ? data.text.slice(0, MAX_TEXT) : null,
      })
      .select("id, name, mime, size, storage_path, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as AiFile;
  });

export const listAiFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ threadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("ai_files")
      .select("id, name, mime, size, storage_path, created_at")
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as AiFile[];
  });

export const deleteAiFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("ai_files")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
