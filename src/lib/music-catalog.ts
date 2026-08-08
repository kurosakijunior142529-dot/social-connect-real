/**
 * Built-in royalty-free music: each track is synthesized on the device with
 * the Web Audio API (OfflineAudioContext) and encoded to WAV, so there are no
 * external requests, no licensing issues and no CORS problems in the WebView.
 */

export type MusicVibe = {
  id: string;
  name: string;
  emoji: string;
  bpm: number;
  /** scale degrees (semitones from root) used by the melody */
  scale: number[];
  root: number; // midi note
  swing: number;
  bass: boolean;
};

export const MUSIC_VIBES: MusicVibe[] = [
  { id: "lofi", name: "Lo-fi Chill", emoji: "🎧", bpm: 78, root: 45, scale: [0, 3, 5, 7, 10], swing: 0.18, bass: true },
  { id: "trap", name: "Trap Night", emoji: "🔥", bpm: 140, root: 40, scale: [0, 2, 3, 7, 8], swing: 0, bass: true },
  { id: "pop", name: "Pop Bright", emoji: "✨", bpm: 112, root: 48, scale: [0, 2, 4, 7, 9], swing: 0.05, bass: true },
  { id: "cine", name: "Cinematic", emoji: "🎬", bpm: 70, root: 43, scale: [0, 2, 3, 7, 10], swing: 0, bass: false },
  { id: "dance", name: "Dance Club", emoji: "💃", bpm: 126, root: 46, scale: [0, 3, 5, 7, 10], swing: 0, bass: true },
  { id: "acoustic", name: "Acústico", emoji: "🌿", bpm: 92, root: 50, scale: [0, 2, 4, 5, 7, 9], swing: 0.1, bass: false },
];

const midiToHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, len - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, len - 44, true);

  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i]!));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

const cache = new Map<string, string>();

/** Renders a seamless ~16s loop for the vibe and returns an object URL. */
export async function renderVibe(vibe: MusicVibe, seconds = 16): Promise<string> {
  const key = `${vibe.id}:${seconds}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rate = 44100;
  const Offline: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const ctx = new Offline(2, Math.ceil(rate * seconds), rate);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  const beat = 60 / vibe.bpm;
  const steps = Math.floor(seconds / (beat / 2));

  const tone = (at: number, freq: number, dur: number, gain: number, type: OscillatorType, pan = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    osc.connect(g).connect(p).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  };

  const noiseHit = (at: number, dur: number, gain: number, hp: number) => {
    const buf = ctx.createBuffer(1, Math.ceil(rate * dur), rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(f).connect(g).connect(master);
    s.start(at);
  };

  const kick = (at: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.16);
    g.gain.setValueAtTime(0.9, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    osc.connect(g).connect(master);
    osc.start(at);
    osc.stop(at + 0.35);
  };

  const chordSteps = [0, 5, 3, 7];
  for (let s = 0; s < steps; s++) {
    const swing = s % 2 === 1 ? vibe.swing * (beat / 2) : 0;
    const t = s * (beat / 2) + swing;
    const bar = Math.floor(s / 8) % chordSteps.length;
    const rootNote = vibe.root + chordSteps[bar]!;

    if (vibe.bass && s % 4 === 0) kick(t);
    if (s % 8 === 4) noiseHit(t, 0.18, 0.28, 1200);
    if (vibe.id === "trap" ? s % 1 === 0 : s % 2 === 0) noiseHit(t, 0.045, 0.09, 6500);

    if (vibe.bass && s % 2 === 0) tone(t, midiToHz(rootNote - 12), beat * 0.5, 0.32, "triangle");

    if (s % 4 === 0) {
      // pad chord
      [0, 3, 7].forEach((iv, i) =>
        tone(t, midiToHz(rootNote + 12 + iv), beat * 1.9, 0.075, "sawtooth", i === 0 ? -0.3 : i === 2 ? 0.3 : 0),
      );
    }

    if (s % 2 === (vibe.id === "cine" ? 0 : 1)) {
      const deg = vibe.scale[(s * 3 + bar) % vibe.scale.length]!;
      tone(t, midiToHz(rootNote + 24 + deg), beat * 0.45, 0.12, vibe.id === "acoustic" ? "triangle" : "square", ((s % 4) - 1.5) / 6);
    }
  }

  const rendered = await ctx.startRendering();
  const url = URL.createObjectURL(encodeWav(rendered));
  cache.set(key, url);
  return url;
}
