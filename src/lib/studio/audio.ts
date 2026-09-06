/** Análise de áudio do estúdio: forma de onda e detecção de batidas. */

let sharedCtx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

export async function decodeAudio(blobOrUrl: Blob | string): Promise<AudioBuffer> {
  const buf =
    typeof blobOrUrl === "string"
      ? await (await fetch(blobOrUrl)).arrayBuffer()
      : await blobOrUrl.arrayBuffer();
  const ctx = audioContext();
  return await ctx.decodeAudioData(buf.slice(0));
}

/** amostra a envoltória de energia para desenhar a waveform */
export function waveform(buffer: AudioBuffer, buckets = 220): number[] {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / buckets));
  const out: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    const start = i * size;
    for (let j = 0; j < size; j += 8) {
      const v = Math.abs(data[start + j] ?? 0);
      if (v > peak) peak = v;
    }
    max = Math.max(max, peak);
    out.push(peak);
  }
  return out.map((v) => v / max);
}

export type BeatAnalysis = { beats: number[]; bpm: number | null };

/**
 * Detecção de batidas por fluxo de energia: divide o áudio em janelas curtas,
 * mede o aumento de energia em relação à média local e marca os picos.
 */
export function detectBeats(buffer: AudioBuffer, from = 0, to?: number): BeatAnalysis {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const start = Math.max(0, Math.floor(from * sr));
  const end = Math.min(data.length, Math.floor((to ?? buffer.duration) * sr));
  const win = Math.floor(sr * 0.02); // 20ms
  const energies: number[] = [];
  for (let i = start; i + win < end; i += win) {
    let e = 0;
    for (let j = 0; j < win; j += 4) {
      const v = data[i + j] ?? 0;
      e += v * v;
    }
    energies.push(e);
  }
  if (energies.length < 8) return { beats: [], bpm: null };

  const historyLen = 22;
  const beats: number[] = [];
  let last = -1;
  for (let i = historyLen; i < energies.length; i++) {
    let avg = 0;
    for (let k = i - historyLen; k < i; k++) avg += energies[k]!;
    avg /= historyLen;
    let variance = 0;
    for (let k = i - historyLen; k < i; k++) variance += (energies[k]! - avg) ** 2;
    variance /= historyLen;
    const threshold = avg * (1.35 + Math.min(0.5, variance / (avg * avg + 1e-9)) * 0.4);
    const t = from + (i * win) / sr;
    if (energies[i]! > threshold && energies[i]! > 1e-6 && (last < 0 || t - last > 0.16)) {
      beats.push(Number(t.toFixed(3)));
      last = t;
    }
  }

  let bpm: number | null = null;
  if (beats.length > 4) {
    const gaps = beats.slice(1).map((b, i) => b - beats[i]!);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)]!;
    if (median > 0.15) {
      let v = 60 / median;
      while (v < 70) v *= 2;
      while (v > 180) v /= 2;
      bpm = Math.round(v);
    }
  }
  return { beats, bpm };
}
