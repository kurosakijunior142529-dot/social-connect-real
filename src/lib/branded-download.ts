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
 * Baixa um vídeo com a marca d'água e a end screen oficial gravadas no arquivo.
 * Se o dispositivo não conseguir reprocessar, entrega o arquivo original em vez
 * de falhar o download.
 */
export async function downloadBrandedVideo(
  source: Blob | string,
  filename: string,
  opts: { username?: string | null; onProgress?: (p: number) => void } = {},
): Promise<{ branded: boolean }> {
  let blob: Blob;
  if (typeof source === "string") {
    const res = await fetch(source);
    blob = await res.blob();
  } else {
    blob = source;
  }
  const handle = opts.username ?? (await currentUsername()) ?? "vibely";
  const base = filename.replace(/\.[^.]+$/, "");
  const srcUrl = URL.createObjectURL(blob);
  try {
    if (await canBurnWatermark(srcUrl)) {
      const out = await exportVideo(srcUrl, {
        watermark: { username: handle },
        endScreen: { username: handle },
        onProgress: opts.onProgress,
      });
      saveBlob(out.blob, `${base}.${out.ext}`);
      return { branded: true };
    }
  } catch (err) {
    console.warn("[branded-download] falhou, baixando original", err);
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
  saveBlob(blob, filename);
  return { branded: false };
}
