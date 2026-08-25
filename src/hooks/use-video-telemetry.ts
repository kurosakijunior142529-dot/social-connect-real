import { useEffect, type RefObject } from "react";
import {
  bufferAheadOf,
  ensureLongTaskObserver,
  pushVideoEvent,
} from "@/lib/media/video-telemetry";

/**
 * Instrumenta um <video> com telemetria de reprodução.
 * Não renderiza nada e não altera o comportamento do player.
 */
export function useVideoTelemetry(
  ref: RefObject<HTMLVideoElement | null>,
  surface: string,
  id: string,
) {
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    ensureLongTaskObserver();

    let stallStart = 0;
    let stallMs = 0;
    let sampler: ReturnType<typeof setInterval> | null = null;

    const quality = () => {
      const q = (v as HTMLVideoElement & {
        getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
      }).getVideoPlaybackQuality?.();
      return {
        droppedVideoFrames: q?.droppedVideoFrames,
        totalVideoFrames: q?.totalVideoFrames,
      };
    };

    const base = () => ({
      surface,
      id,
      stallMs: Math.round(stallMs),
      bufferAhead: Number(bufferAheadOf(v).toFixed(2)),
      currentTime: Number(v.currentTime.toFixed(2)),
      readyState: v.readyState,
      ...quality(),
    });

    const startSampler = () => {
      if (sampler) return;
      sampler = setInterval(() => {
        if (v.paused) return;
        pushVideoEvent({ ...base(), type: "sample" });
      }, 5000);
    };
    const stopSampler = () => {
      if (sampler) clearInterval(sampler);
      sampler = null;
    };

    const onWaiting = () => {
      stallStart = performance.now();
      pushVideoEvent({ ...base(), type: "waiting" });
    };
    const onStalled = () => {
      if (!stallStart) stallStart = performance.now();
      pushVideoEvent({ ...base(), type: "stalled" });
    };
    const endStall = () => {
      if (stallStart) {
        stallMs += performance.now() - stallStart;
        stallStart = 0;
      }
    };
    const onPlaying = () => {
      endStall();
      startSampler();
      pushVideoEvent({ ...base(), type: "playing" });
    };
    const onPlay = () => pushVideoEvent({ ...base(), type: "play" });
    const onPause = () => {
      endStall();
      stopSampler();
      pushVideoEvent({ ...base(), type: "pause" });
    };
    const onEnded = () => pushVideoEvent({ ...base(), type: "ended" });
    const onError = () =>
      pushVideoEvent({ ...base(), type: "error", detail: String(v.error?.code ?? "unknown") });

    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    return () => {
      stopSampler();
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [ref, surface, id]);
}
