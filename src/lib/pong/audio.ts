// Motor de áudio do Ping Pong: efeitos sonoros sintetizados e
// trilha sonora procedural (sem assets, tudo via WebAudio).

type Ctx = AudioContext & { __pongReverb?: ConvolverNode };

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let musicTimer: number | null = null;
let step = 0;
let nextTime = 0;
let musicOn = false;
let intensity = 0; // 0..1 — sobe conforme a partida esquenta

function makeImpulse(c: AudioContext, seconds = 1.8, decay = 2.6) {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function ensureAudio(): Ctx | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)() as Ctx;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(ctx);
      const revGain = ctx.createGain();
      revGain.gain.value = 0.28;
      reverb.connect(revGain).connect(master);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.85;
      sfxGain.connect(master);
      sfxGain.connect(reverb);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master);
      musicGain.connect(reverb);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* efeitos                                                             */
/* ------------------------------------------------------------------ */

function tone(opts: {
  freq: number; to?: number; dur: number; type?: OscillatorType;
  gain?: number; delay?: number; detune?: number;
}) {
  const c = ensureAudio();
  if (!c || !sfxGain) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(30, opts.to), t0 + opts.dur);
  if (opts.detune) o.detune.value = opts.detune;
  const gv = opts.gain ?? 0.12;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gv, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  o.connect(g).connect(sfxGain);
  o.start(t0);
  o.stop(t0 + opts.dur + 0.02);
}

function noise(dur: number, gain = 0.12, filter = 1800, type: BiquadFilterType = "bandpass", sweepTo?: number) {
  const c = ensureAudio();
  if (!c || !sfxGain) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, Math.max(1, len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = type;
  bp.frequency.setValueAtTime(filter, c.currentTime);
  if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), c.currentTime + dur);
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(bp).connect(g).connect(sfxGain);
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

export type SfxName =
  | "hit" | "hitHard" | "wall" | "goal" | "concede" | "power" | "rewind"
  | "shield" | "count" | "go" | "win" | "lose" | "select" | "portal"
  | "freeze" | "laser" | "quake" | "sticky";

export function sfx(name: SfxName, strength = 1) {
  switch (name) {
    case "hit":
      tone({ freq: 420 + strength * 160, to: 220, dur: 0.09, type: "triangle", gain: 0.14 });
      noise(0.05, 0.06, 2600, "highpass");
      break;
    case "hitHard":
      tone({ freq: 900, to: 180, dur: 0.16, type: "sawtooth", gain: 0.16 });
      tone({ freq: 140, to: 60, dur: 0.22, type: "sine", gain: 0.2 });
      noise(0.12, 0.12, 3200, "highpass", 400);
      break;
    case "wall":
      tone({ freq: 300, to: 200, dur: 0.05, type: "square", gain: 0.07 });
      break;
    case "goal":
      [0, 0.09, 0.18].forEach((d, i) => tone({ freq: 520 + i * 190, dur: 0.22, type: "triangle", gain: 0.13, delay: d }));
      tone({ freq: 90, to: 50, dur: 0.4, type: "sine", gain: 0.18 });
      break;
    case "concede":
      tone({ freq: 320, to: 90, dur: 0.5, type: "sawtooth", gain: 0.12 });
      noise(0.3, 0.08, 700, "lowpass");
      break;
    case "power":
      tone({ freq: 220, to: 1100, dur: 0.3, type: "sawtooth", gain: 0.1 });
      tone({ freq: 660, to: 1320, dur: 0.22, type: "sine", gain: 0.08, delay: 0.04 });
      noise(0.25, 0.07, 900, "bandpass", 5000);
      break;
    case "rewind":
      tone({ freq: 1400, to: 90, dur: 0.85, type: "sawtooth", gain: 0.11 });
      noise(0.8, 0.07, 4000, "bandpass", 200);
      break;
    case "shield":
      tone({ freq: 180, to: 520, dur: 0.3, type: "sine", gain: 0.15 });
      tone({ freq: 720, dur: 0.4, type: "triangle", gain: 0.06, delay: 0.05 });
      break;
    case "portal":
      tone({ freq: 300, to: 1500, dur: 0.25, type: "sine", gain: 0.09 });
      tone({ freq: 1500, to: 300, dur: 0.25, type: "sine", gain: 0.07, delay: 0.12 });
      break;
    case "freeze":
      [0, 0.05, 0.1, 0.16].forEach((d, i) => tone({ freq: 1800 - i * 260, dur: 0.18, type: "sine", gain: 0.07, delay: d }));
      noise(0.3, 0.05, 6000, "highpass");
      break;
    case "laser":
      tone({ freq: 1800, to: 200, dur: 0.22, type: "square", gain: 0.11 });
      noise(0.15, 0.08, 5000, "bandpass", 800);
      break;
    case "quake":
      tone({ freq: 70, to: 38, dur: 0.9, type: "sine", gain: 0.24 });
      noise(0.7, 0.1, 300, "lowpass");
      break;
    case "sticky":
      tone({ freq: 260, to: 520, dur: 0.18, type: "triangle", gain: 0.1 });
      break;
    case "count":
      tone({ freq: 620, dur: 0.12, type: "square", gain: 0.09 });
      break;
    case "go":
      [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.22, type: "square", gain: 0.1, delay: i * 0.06 }));
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.45, type: "triangle", gain: 0.13, delay: i * 0.11 }));
      break;
    case "lose":
      [523, 440, 349, 262].forEach((f, i) => tone({ freq: f, dur: 0.5, type: "sine", gain: 0.12, delay: i * 0.13 }));
      break;
    case "select":
      tone({ freq: 880, to: 1320, dur: 0.07, type: "square", gain: 0.06 });
      break;
  }
}

/* ------------------------------------------------------------------ */
/* trilha procedural                                                   */
/* ------------------------------------------------------------------ */

type Track = { root: number; scale: number[]; bpm: number; wave: OscillatorType };

const TRACKS: Record<string, Track> = {
  neon: { root: 55, scale: [0, 3, 5, 7, 10, 12, 15], bpm: 124, wave: "sawtooth" },
  sunset: { root: 49, scale: [0, 2, 4, 7, 9, 12, 16], bpm: 108, wave: "triangle" },
  deep: { root: 43.65, scale: [0, 2, 3, 7, 8, 12, 14], bpm: 116, wave: "square" },
  void: { root: 41.2, scale: [0, 1, 5, 6, 8, 12, 13], bpm: 132, wave: "sawtooth" },
};

let track: Track = TRACKS.neon;

export function setArenaTrack(id: string) {
  track = TRACKS[id] ?? TRACKS.neon;
}

export function setIntensity(v: number) {
  intensity = Math.max(0, Math.min(1, v));
}

function voice(freq: number, t: number, dur: number, gain: number, type: OscillatorType, dest: GainNode) {
  const c = ctx!;
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(700 + intensity * 3200, t);
  f.Q.value = 6;
  o.type = type;
  o2.type = type;
  o.frequency.value = freq;
  o2.frequency.value = freq;
  o2.detune.value = 9;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); o2.connect(f);
  f.connect(g).connect(dest);
  o.start(t); o2.start(t);
  o.stop(t + dur + 0.03); o2.stop(t + dur + 0.03);
}

function drum(t: number, kind: "kick" | "hat" | "snare", dest: GainNode) {
  const c = ctx!;
  if (kind === "kick") {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.22);
    return;
  }
  const len = kind === "hat" ? 0.05 : 0.16;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = kind === "hat" ? "highpass" : "bandpass";
  f.frequency.value = kind === "hat" ? 7000 : 1500;
  const g = c.createGain();
  g.gain.setValueAtTime(kind === "hat" ? 0.12 : 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + len + 0.02);
}

function schedule() {
  const c = ctx;
  if (!c || !musicGain || !musicOn) return;
  const spb = 60 / track.bpm / 2; // colcheias
  while (nextTime < c.currentTime + 0.25) {
    const t = Math.max(nextTime, c.currentTime + 0.02);
    const bar = Math.floor(step / 16);
    const s = step % 16;

    // bateria
    if (s % 4 === 0) drum(t, "kick", musicGain);
    if (s % 8 === 4) drum(t, "snare", musicGain);
    if (intensity > 0.25 && s % 2 === 1) drum(t, "hat", musicGain);

    // baixo
    if (s % 4 === 0) {
      const deg = [0, 0, 5, 3][bar % 4];
      voice(track.root * Math.pow(2, track.scale[deg] / 12), t, spb * 1.7, 0.16, "square", musicGain);
    }
    // arpejo
    if (intensity > 0.1 && s % 2 === 0) {
      const idx = (s / 2 + bar) % track.scale.length;
      const oct = 3 + (s % 8 === 0 ? 1 : 0);
      voice(track.root * Math.pow(2, track.scale[idx] / 12 + oct - 1), t, spb * 0.9, 0.05 + intensity * 0.05, track.wave, musicGain);
    }
    // pad em barras alternadas
    if (s === 0 && intensity > 0.5) {
      voice(track.root * Math.pow(2, track.scale[2] / 12 + 1), t, spb * 14, 0.035, "triangle", musicGain);
    }

    step++;
    nextTime += spb;
  }
}

export function startMusic() {
  const c = ensureAudio();
  if (!c || !musicGain || musicOn) return;
  musicOn = true;
  step = 0;
  nextTime = c.currentTime + 0.1;
  musicGain.gain.cancelScheduledValues(c.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.32, c.currentTime + 1.4);
  musicTimer = window.setInterval(schedule, 60);
}

export function stopMusic() {
  const c = ctx;
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (c && musicGain) {
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
  }
}

export function setMuted(muted: boolean) {
  const c = ensureAudio();
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.linearRampToValueAtTime(muted ? 0 : 0.9, c.currentTime + 0.2);
}

export function isMusicPlaying() {
  return musicOn;
}
