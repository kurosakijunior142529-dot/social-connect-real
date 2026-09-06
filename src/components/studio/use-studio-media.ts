import { useCallback, useEffect, useRef, useState } from "react";
import { cacheUrl, getMedia, mediaUrl, putMedia } from "@/lib/studio/media-store";
import type { SourceEl } from "@/lib/studio/render";
import type { StudioProject } from "@/lib/studio/types";
import { uid } from "@/lib/studio/types";

export type MediaMeta = { id: string; kind: "video" | "image" | "audio"; duration: number; name: string };

async function probeDuration(url: string, kind: "video" | "audio"): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => resolve(0);
    setTimeout(() => resolve(Number.isFinite(el.duration) ? el.duration : 0), 6000);
  });
}

/** Carrega os arquivos do projeto e mantém elementos <video>/<img> prontos para render. */
export function useStudioMedia(project: StudioProject) {
  const sources = useRef<Map<string, SourceEl>>(new Map());
  const audioBlobs = useRef<Map<string, Blob>>(new Map());
  const [ready, setReady] = useState(0);

  const ensureSource = useCallback(async (id: string, kind: "video" | "image") => {
    if (sources.current.has(id)) return;
    const url = await mediaUrl(id);
    if (!url) return;
    if (kind === "video") {
      const el = document.createElement("video");
      el.src = url;
      el.crossOrigin = "anonymous";
      el.playsInline = true;
      el.muted = false;
      el.preload = "auto";
      await new Promise<void>((res) => {
        el.onloadeddata = () => res();
        el.onerror = () => res();
        setTimeout(res, 8000);
      });
      sources.current.set(id, el);
    } else {
      const el = new Image();
      el.src = url;
      await new Promise<void>((res) => {
        el.onload = () => res();
        el.onerror = () => res();
      });
      sources.current.set(id, el);
    }
    setReady((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const clip of project.clips) {
        if (cancelled) return;
        if (clip.kind === "media") {
          await ensureSource(clip.mediaId, clip.mediaKind);
          if (clip.aiMediaId) await ensureSource(clip.aiMediaId, clip.mediaKind);
        } else if (clip.kind === "audio" && !audioBlobs.current.has(clip.mediaId)) {
          const blob = await getMedia(clip.mediaId);
          if (blob) audioBlobs.current.set(clip.mediaId, blob);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.clips, ensureSource]);

  /** salva um arquivo novo e devolve os metadados */
  const importFile = useCallback(async (file: Blob, kind: "video" | "image" | "audio", name: string): Promise<MediaMeta> => {
    const id = uid();
    await putMedia(id, file);
    const url = URL.createObjectURL(file);
    cacheUrl(id, url);
    let duration = 0;
    if (kind !== "image") duration = await probeDuration(url, kind === "video" ? "video" : "audio");
    if (kind === "audio") audioBlobs.current.set(id, file);
    else await ensureSource(id, kind);
    return { id, kind, duration, name };
  }, [ensureSource]);

  return { sources: sources.current, audioBlobs: audioBlobs.current, importFile, ready, ensureSource };
}
