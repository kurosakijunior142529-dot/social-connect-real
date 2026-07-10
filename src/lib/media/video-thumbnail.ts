/**
 * Capture a frame from a video File at the given time to use as a poster.
 * Runs in the browser only.
 */
export async function captureVideoPoster(
  file: File,
  atSeconds = 0.5,
  maxW = 640,
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };
    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.addEventListener("loadedmetadata", () => {
      const t = Math.min(atSeconds, Math.max(0.1, (video.duration || 1) * 0.1));
      try {
        video.currentTime = t;
      } catch {
        fail();
      }
    });
    video.addEventListener("seeked", () => {
      try {
        const w = Math.min(maxW, video.videoWidth || maxW);
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || Math.round(w * 0.5625);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob);
          },
          "image/jpeg",
          0.8,
        );
      } catch {
        fail();
      }
    });
    video.addEventListener("error", fail);
  });
}
