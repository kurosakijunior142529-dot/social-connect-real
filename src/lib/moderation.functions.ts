import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Server-side moderation. The client NEVER decides whether content is
 * publishable — it only asks, and the enforcement also exists in the database
 * (RLS + punishment state) so bypassing this call gains nothing.
 */

const surfaceSchema = z.enum(["public", "private"]);

const textInput = z.object({
  text: z.string().min(1).max(4000),
  surface: surfaceSchema.default("public"),
  contentType: z.string().max(40).default("text"),
  contentId: z.string().uuid().optional(),
});

const mediaInput = z.object({
  /** data: URL of a downscaled frame/thumbnail — never the full original file */
  dataUrl: z.string().min(32).max(3_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string().max(100),
  size: z.number().int().positive().max(200 * 1024 * 1024),
  surface: surfaceSchema.default("public"),
  contentType: z.string().max(40).default("media"),
});

const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
  "video/mp4", "video/webm", "video/quicktime",
];

export const moderateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => textInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      _scope: "moderate_text", _limit: 120, _window_seconds: 300,
    });
    if (allowed === false) return { allow: false, action: "block" as const, labels: ["rate_limit"], score: 1, reason: "Muitas ações em pouco tempo" };

    const { data: profile } = await supabase.from("profiles").select("is_minor").eq("id", userId).maybeSingle();
    const { classifyText, decide } = await import("@/lib/moderation.server");
    let verdict;
    try {
      const c = await classifyText(data.text);
      verdict = decide(c.labels, c.score, c.reason, data.surface, !!profile?.is_minor);
    } catch {
      // Fail open for text on private surfaces, fail safe (review) in public.
      verdict = { allow: true, action: data.surface === "public" ? ("review" as const) : ("ok" as const), labels: [], score: 0, reason: "" };
    }
    if (verdict.action !== "ok") {
      await supabase.rpc("log_security_event", {
        _event: "moderation_text", _severity: verdict.action === "block" ? "critical" : "warning",
        _metadata: { labels: verdict.labels, score: verdict.score, surface: data.surface },
      });
    }
    return verdict;
  });

export const moderateMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => mediaInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (!ALLOWED_MIME.includes(data.mime)) {
      return { allow: false, action: "block" as const, labels: ["bad_mime"], score: 1, reason: "Tipo de arquivo não permitido" };
    }
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      _scope: "moderate_media", _limit: 40, _window_seconds: 600,
    });
    if (allowed === false) {
      return { allow: false, action: "block" as const, labels: ["rate_limit"], score: 1, reason: "Muitos envios em pouco tempo" };
    }

    // Known-illegal hash matching (admin-managed list, read with elevated rights).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: match } = await supabaseAdmin
      .from("blocked_hashes").select("id, kind").eq("hash", data.sha256).maybeSingle();
    if (match) {
      await supabase.rpc("log_security_event", {
        _event: "blocked_hash_upload", _severity: "critical",
        _metadata: { hash: data.sha256, kind: match.kind },
      });
      await supabaseAdmin.from("content_moderation").insert({
        content_type: data.contentType, owner_id: userId, status: "blocked",
        labels: { hash_match: match.kind }, score: 1, reason: "Hash de conteúdo ilegal", hash: data.sha256,
      });
      return { allow: false, action: "block" as const, labels: ["illegal_hash"], score: 1, reason: "Conteúdo proibido" };
    }

    const { data: profile } = await supabase.from("profiles").select("is_minor").eq("id", userId).maybeSingle();
    const { classifyImage, decide } = await import("@/lib/moderation.server");
    let verdict;
    try {
      const c = await classifyImage(data.dataUrl);
      verdict = decide(c.labels, c.score, c.reason, data.surface, !!profile?.is_minor);
    } catch {
      verdict = { allow: true, action: data.surface === "public" ? ("review" as const) : ("ok" as const), labels: [], score: 0, reason: "" };
    }

    if (verdict.action !== "ok") {
      await supabaseAdmin.from("content_moderation").insert({
        content_type: data.contentType, owner_id: userId,
        status: verdict.action === "block" ? "blocked" : "pending",
        labels: { labels: verdict.labels }, score: verdict.score,
        reason: verdict.reason, hash: data.sha256,
      });
      await supabase.rpc("log_security_event", {
        _event: "moderation_media", _severity: verdict.action === "block" ? "critical" : "warning",
        _metadata: { labels: verdict.labels, score: verdict.score, surface: data.surface },
      });
    }
    return verdict;
  });
