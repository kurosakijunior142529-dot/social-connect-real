import { supabase } from "@/integrations/supabase/client";
import { canBurnWatermark, exportVideo } from "@/lib/video-export";

/** @username real do usuário autenticado (sem texto fixo inventado). */
export async function currentUsername(): Promise<string | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return null;
    const { data } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
    return data?.username ?? null;
  } catch {
    return null;
  }
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

/**
 * Baixa um vídeo com marca d'água, end screen com @ e som do Vibely.
 * O arquivo é baixado inteiro para a memória ANTES de processar (sem
 * engasgos de rede). Se o aparelho não suportar, entrega o original.
 */
export async function downloadBrandedVideo(
  source: Blob | string,
  filename: string,
  opts: { username?: string | null; onProgress?: (p: number) => void; original?: boolean } = {},
): Promise<{ branded: boolean }> {
  let blob: Blob;
  if (typeof source === "string") {
    const res = await fetch(source);
    blob = await res.blob();
  } else {
    blob = source;
  }
  const base = filename.replace(/\.[^.]+$/, "");
  if (opts.original) {
    saveBlob(blob, filename);
    return { branded: false };
  }
  const localUrl = URL.createObjectURL(blob);
  try {
    if (!(await canBurnWatermark(localUrl))) throw new Error("unsupported");
    const username = opts.username !== undefined ? opts.username : await currentUsername();
    const out = await exportVideo(localUrl, {
      watermark: { username },
      endScreen: { username },
      onProgress: opts.onProgress,
    });
    saveBlob(out.blob, `${base}.${out.ext}`);
    return { branded: true };
  } catch (err) {
    console.warn("[branded-download] fallback original", err);
    saveBlob(blob, filename);
    return { branded: false };
  } finally {
    setTimeout(() => URL.revokeObjectURL(localUrl), 4000);
  }
}
