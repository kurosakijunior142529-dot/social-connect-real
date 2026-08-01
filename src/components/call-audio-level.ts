import { useEffect, useRef, useState } from "react";

/**
 * Read-only voice level meter. It only *observes* an existing MediaStream
 * (never modifies, routes or mutes it) so the working audio pipeline stays intact.
 */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }
    const AudioCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    let ctx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    try {
      ctx = new AudioCtor();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      source.connect(analyser);
    } catch {
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length) / 255;
      setLevel((prev) => prev * 0.6 + Math.min(1, rms * 2.6) * 0.4);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      try {
        source.disconnect();
        analyser.disconnect();
        void ctx.close();
      } catch {
        /* ignore */
      }
    };
  }, [stream]);

  return level;
}

export const CALL_LANGUAGES: { value: string; label: string; flag: string }[] = [
  { value: "pt-BR", label: "Português", flag: "🇧🇷" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
  { value: "ko", label: "한국어", flag: "🇰🇷" },
  { value: "zh", label: "中文", flag: "🇨🇳" },
  { value: "ar", label: "العربية", flag: "🇸🇦" },
];
