import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type PublicPostPreview = {
  id: string;
  caption: string | null;
  media_type: string | null;
  post_kind: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  likes: number;
  comments: number;
};

export const getPublicPostPreview = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || !/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("invalid id");
    return { id: data.id };
  })
  .handler(async ({ data }): Promise<PublicPostPreview | null> => {
    const supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabase.rpc("public_post_preview", { _id: data.id });
    if (error) return null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row as PublicPostPreview) ?? null;
  });
