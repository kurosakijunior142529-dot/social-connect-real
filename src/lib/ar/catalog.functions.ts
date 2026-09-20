import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AR_CATEGORIES, NORMAL_EFFECT, type ArCategory, type ArEffect } from "./types";

/**
 * Entrega a configuração do SDK de AR sem expor segredos no bundle:
 * o token fica apenas no servidor e é lido a cada abertura da câmera.
 */
export const getArSetup = createServerFn({ method: "GET" }).handler(async () => {
  const apiToken = process.env["CAMERA_KIT_API_TOKEN"] ?? "";
  const lensGroups = (process.env["CAMERA_KIT_LENS_GROUPS"] ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  return { apiToken, lensGroups, configured: Boolean(apiToken && lensGroups.length) };
});

function toCategory(value: string): ArCategory {
  return (AR_CATEGORIES as readonly string[]).includes(value) ? (value as ArCategory) : "populares";
}

/** Lê o catálogo de efeitos ativos (leitura pública via RLS). */
export async function fetchArEffects(): Promise<ArEffect[]> {
  const { data, error } = await supabase
    .from("ar_effects")
    .select("id,name,thumbnail_url,category,lens_id,lens_group_id,version,sort_order,usage_count")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(300);
  if (error) return [NORMAL_EFFECT];
  const effects: ArEffect[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    thumbnailUrl: row.thumbnail_url,
    category: toCategory(row.category),
    lensId: row.lens_id,
    lensGroupId: row.lens_group_id,
    version: row.version,
    sortOrder: row.sort_order,
    usageCount: row.usage_count,
  }));
  return [NORMAL_EFFECT, ...effects];
}

export async function bumpArEffectUsage(effectId: string) {
  if (!effectId || effectId === NORMAL_EFFECT.id) return;
  await supabase.rpc("bump_ar_effect_usage", { _effect_id: effectId }).then(
    () => undefined,
    () => undefined,
  );
}
