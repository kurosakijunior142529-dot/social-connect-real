import { useEffect, useRef, useState } from "react";
import { END_SCREEN_SECONDS, drawEndScreenFrame, loadEndScreenArt } from "@/lib/video-endscreen";

/**
 * Prévia da end screen no app (canvas/JS), usando exatamente o mesmo
 * desenho da renderização final — o que o usuário vê aqui é o que será
 * gravado no MP4.
 */
export function EndScreenPreview({
  username,
  className,
}: {
  username: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let start = performance.now();

    void (async () => {
      const art = await loadEndScreenArt();
      if (cancelled) return;
      if (!art) return setReady(false);
      setReady(true);
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const loop = () => {
        const t = (performance.now() - start) / 1000;
        if (t > END_SCREEN_SECONDS + 0.6) start = performance.now();
        drawEndScreenFrame(ctx, art, canvas.width, canvas.height, username, Math.min(t, END_SCREEN_SECONDS));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [username]);

  if (ready === false) return null;

  return (
    <div className={className}>
      <canvas
        ref={ref}
        width={360}
        height={640}
        className="mx-auto w-full max-w-[180px] rounded-2xl border border-white/10 bg-black"
      />
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Prévia do encerramento que entra no vídeo baixado
      </p>
    </div>
  );
}
