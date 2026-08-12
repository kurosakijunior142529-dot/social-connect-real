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

/** varredura de frequência com brilho — usada nos poderes */
function sweep(from: number, to: number, dur: number, gain = 0.1, type: OscillatorType = "sawtooth", delay = 0) {
  tone({ freq: from, to, dur, type, gain, delay });
  tone({ freq: from * 1.5, to: to * 1.5, dur: dur * 0.8, type: "sine", gain: gain * 0.5, delay: delay + 0.02 });
}

/** acorde arpejado curto — assinatura sonora dos poderes */
function chord(base: number, intervals: number[], dur: number, gain = 0.09, type: OscillatorType = "triangle", spread = 0.035) {
  intervals.forEach((iv, i) =>
    tone({ freq: base * Math.pow(2, iv / 12), dur, type, gain, delay: i * spread, detune: (i % 2 ? 8 : -8) }),
  );
}

function sub(freq: number, to: number, dur: number, gain = 0.22, delay = 0) {
  tone({ freq, to, dur, type: "sine", gain, delay });
}

export function sfx(name: SfxName, strength = 1) {
  switch (name) {
    case "hit":
      tone({ freq: 430 + strength * 200, to: 210, dur: 0.085, type: "triangle", gain: 0.15 });
      tone({ freq: 1250 + strength * 400, to: 700, dur: 0.05, type: "sine", gain: 0.07 });
      noise(0.045, 0.07, 3200, "highpass");
      break;
    case "hitHard":
      tone({ freq: 1050, to: 170, dur: 0.18, type: "sawtooth", gain: 0.17 });
      tone({ freq: 520, to: 120, dur: 0.24, type: "square", gain: 0.09, delay: 0.01 });
      sub(150, 52, 0.3, 0.26);
      noise(0.14, 0.13, 3600, "highpass", 380);
      break;
    case "wall":
      tone({ freq: 320, to: 190, dur: 0.055, type: "square", gain: 0.08 });
      noise(0.03, 0.04, 4200, "highpass");
      break;
    case "goal":
      chord(523.25, [0, 4, 7, 12], 0.5, 0.11, "triangle", 0.07);
      sweep(400, 1600, 0.3, 0.06, "sine");
      sub(110, 55, 0.5, 0.2);
      noise(0.5, 0.05, 2000, "bandpass", 8000);
      break;
    case "concede":
      chord(392, [0, -3, -8], 0.55, 0.1, "sawtooth", 0.09);
      sub(120, 42, 0.6, 0.16);
      noise(0.35, 0.07, 600, "lowpass");
      break;
    case "power":
      // carga → estouro → cauda cintilante
      sweep(180, 1400, 0.34, 0.1);
      chord(880, [0, 7, 12], 0.35, 0.07, "sine", 0.045);
      sub(90, 46, 0.4, 0.18, 0.2);
      noise(0.3, 0.08, 800, "bandpass", 7000);
      break;
    case "rewind":
      tone({ freq: 1600, to: 80, dur: 0.95, type: "sawtooth", gain: 0.12 });
      tone({ freq: 2400, to: 120, dur: 0.7, type: "square", gain: 0.05, delay: 0.08 });
      chord(220, [0, 5, 10], 0.8, 0.05, "sine", 0.12);
      noise(0.9, 0.08, 5000, "bandpass", 150);
      break;
    case "shield":
      sweep(160, 620, 0.35, 0.13, "sine");
      chord(659.25, [0, 5, 12], 0.55, 0.06, "triangle", 0.05);
      noise(0.3, 0.05, 1600, "bandpass", 4200);
      break;
    case "portal":
      sweep(280, 1800, 0.26, 0.09, "sine");
      sweep(1800, 280, 0.26, 0.07, "sine", 0.13);
      chord(440, [0, 6, 11], 0.4, 0.05, "sine", 0.05);
      noise(0.35, 0.05, 3000, "bandpass", 900);
      break;
    case "freeze":
      [0, 0.045, 0.09, 0.14, 0.2].forEach((d, i) =>
        tone({ freq: 2200 - i * 300, dur: 0.2, type: "sine", gain: 0.07, delay: d }),
      );
      chord(1046, [0, 7, 14], 0.5, 0.035, "triangle", 0.06);
      noise(0.45, 0.055, 6500, "highpass");
      break;
    case "laser":
      tone({ freq: 2400, to: 180, dur: 0.24, type: "square", gain: 0.12 });
      tone({ freq: 3600, to: 400, dur: 0.14, type: "sawtooth", gain: 0.06, delay: 0.02 });
      sub(140, 60, 0.28, 0.16, 0.04);
      noise(0.18, 0.09, 5200, "bandpass", 700);
      break;
    case "quake":
      sub(78, 34, 1.0, 0.3);
      tone({ freq: 46, to: 28, dur: 1.1, type: "square", gain: 0.12, delay: 0.05 });
      noise(0.85, 0.12, 260, "lowpass");
      noise(0.4, 0.05, 900, "bandpass", 120);
      break;
    case "sticky":
      tone({ freq: 240, to: 560, dur: 0.2, type: "triangle", gain: 0.11 });
      tone({ freq: 120, to: 300, dur: 0.24, type: "sine", gain: 0.08, delay: 0.03 });
      noise(0.12, 0.04, 1400, "lowpass");
      break;
    case "count":
      tone({ freq: 660, dur: 0.13, type: "square", gain: 0.1 });
      tone({ freq: 1320, dur: 0.07, type: "sine", gain: 0.05 });
      break;
    case "go":
      chord(659.25, [0, 5, 12, 19], 0.3, 0.1, "square", 0.055);
      sub(110, 60, 0.4, 0.2);
      break;
    case "win":
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone({ freq: f, dur: 0.5, type: "triangle", gain: 0.13, delay: i * 0.1 }),
      );
      chord(261.6, [0, 7, 12], 1.4, 0.05, "sawtooth", 0.2);
      break;
    case "lose":
      [523, 440, 349, 262].forEach((f, i) =>
        tone({ freq: f, dur: 0.55, type: "sine", gain: 0.12, delay: i * 0.13 }),
      );
      sub(90, 40, 1.0, 0.14, 0.3);
      break;
    case "select":
      tone({ freq: 880, to: 1480, dur: 0.07, type: "square", gain: 0.07 });
      tone({ freq: 1760, dur: 0.05, type: "sine", gain: 0.04, delay: 0.03 });
      break;
  }
}


/* ------------------------------------------------------------------ */
/* trilha procedural                                                   */
/* ------------------------------------------------------------------ */

type Track = {
  root: number;
  scale: number[];
  bpm: number;
  wave: OscillatorType;
  /** progressão harmônica em graus da escala, um por compasso */
  prog: number[];
};

const TRACKS: Record<string, Track> = {
  neon: { root: 55, scale: [0, 3, 5, 7, 10, 12, 15], bpm: 126, wave: "sawtooth", prog: [0, 5, 3, 4] },
  sunset: { root: 49, scale: [0, 2, 4, 7, 9, 12, 16], bpm: 110, wave: "triangle", prog: [0, 4, 5, 2] },
  deep: { root: 43.65, scale: [0, 2, 3, 7, 8, 12, 14], bpm: 118, wave: "square", prog: [0, 3, 5, 3] },
  void: { root: 41.2, scale: [0, 1, 5, 6, 8, 12, 13], bpm: 134, wave: "sawtooth", prog: [0, 1, 5, 4] },
};

let track: Track = TRACKS.neon;

export function setArenaTrack(id: string) {
  track = TRACKS[id] ?? TRACKS.neon;
}

export function setIntensity(v: number) {
  intensity = Math.max(0, Math.min(1, v));
}

function voice(
  freq: number, t: number, dur: number, gain: number, type: OscillatorType, dest: AudioNode,
  opts: { detune?: number; cutoff?: number; pan?: number; attack?: number } = {},
) {
  const c = ctx!;
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  const p = c.createStereoPanner();
  p.pan.value = opts.pan ?? 0;
  f.type = "lowpass";
  const cutoff = opts.cutoff ?? 700 + intensity * 3400;
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(220, cutoff * 0.45), t + dur);
  f.Q.value = 7;
  o.type = type;
  o2.type = type;
  o.frequency.value = freq;
  o2.frequency.value = freq;
  o2.detune.value = opts.detune ?? 11;
  const atk = opts.attack ?? 0.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); o2.connect(f);
  f.connect(g).connect(p).connect(dest);
  o.start(t); o2.start(t);
  o.stop(t + dur + 0.03); o2.stop(t + dur + 0.03);
}

function drum(t: number, kind: "kick" | "hat" | "openhat" | "snare" | "clap" | "ride", dest: AudioNode) {
  const c = ctx!;
  if (kind === "kick") {
    const o = c.createOscillator();
    const g = c.createGain();
    const click = c.createOscillator();
    const cg = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.13);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    click.type = "square";
    click.frequency.setValueAtTime(900, t);
    cg.gain.setValueAtTime(0.06, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    o.connect(g).connect(dest);
    click.connect(cg).connect(dest);
    o.start(t); o.stop(t + 0.26);
    click.start(t); click.stop(t + 0.04);
    return;
  }
  const len = kind === "hat" ? 0.045 : kind === "openhat" ? 0.22 : kind === "ride" ? 0.3 : 0.18;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === "clap" ? 1.6 : 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = kind === "snare" || kind === "clap" ? "bandpass" : "highpass";
  f.frequency.value = kind === "hat" ? 8200 : kind === "openhat" ? 7000 : kind === "ride" ? 9500 : kind === "clap" ? 1900 : 1500;
  f.Q.value = kind === "clap" ? 2.4 : 0.8;
  const g = c.createGain();
  const lvl = kind === "hat" ? 0.1 : kind === "openhat" ? 0.07 : kind === "ride" ? 0.05 : kind === "clap" ? 0.2 : 0.24;
  g.gain.setValueAtTime(lvl, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const p = c.createStereoPanner();
  p.pan.value = kind === "hat" ? 0.18 : kind === "ride" ? -0.24 : 0;
  src.connect(f).connect(g).connect(p).connect(dest);
  src.start(t); src.stop(t + len + 0.02);

  if (kind === "snare") {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    og.gain.setValueAtTime(0.12, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og).connect(dest);
    o.start(t); o.stop(t + 0.16);
  }
}

/** bus com sidechain (duck no kick) + delay estéreo — dá vida à trilha */
let musicBus: GainNode | null = null;
let duck: GainNode | null = null;

function ensureMusicBus() {
  const c = ctx!;
  if (musicBus || !musicGain) return;
  duck = c.createGain();
  duck.gain.value = 1;
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.28;
  const fb = c.createGain();
  fb.gain.value = 0.3;
  const dTone = c.createBiquadFilter();
  dTone.type = "highpass";
  dTone.frequency.value = 500;
  const dWet = c.createGain();
  dWet.gain.value = 0.22;
  duck.connect(musicGain);
  duck.connect(delay);
  delay.connect(dTone).connect(fb).connect(delay);
  dTone.connect(dWet).connect(musicGain);
  musicBus = duck;
}

function pump(t: number) {
  if (!duck || !ctx) return;
  duck.gain.cancelScheduledValues(t);
  duck.gain.setValueAtTime(0.45, t);
  duck.gain.linearRampToValueAtTime(1, t + 0.22);
}

function schedule() {
  const c = ctx;
  if (!c || !musicGain || !musicOn) return;
  ensureMusicBus();
  const bus = musicBus ?? musicGain;
  const spb = 60 / track.bpm / 2; // colcheias
  while (nextTime < c.currentTime + 0.25) {
    const t = Math.max(nextTime, c.currentTime + 0.02);
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const deg = track.prog[bar % track.prog.length]!;
    const rootHz = track.root * Math.pow(2, track.scale[deg]! / 12);
    const hot = intensity;

    // bateria
    if (s % 4 === 0 || (hot > 0.6 && s === 14)) { drum(t, "kick", musicGain); pump(t); }
    if (s % 8 === 4) { drum(t, "snare", musicGain); if (hot > 0.4) drum(t, "clap", musicGain); }
    if (hot > 0.2 && s % 2 === 1) drum(t, "hat", bus);
    if (hot > 0.55 && s % 8 === 6) drum(t, "openhat", bus);
    if (hot > 0.75 && s % 2 === 0) drum(t, "ride", bus);

    // baixo com groove
    if (s % 2 === 0) {
      const octDown = s % 8 === 0 ? 0 : -12;
      voice(rootHz * Math.pow(2, octDown / 12), t, spb * 1.5, 0.17, "square", bus, { cutoff: 420 + hot * 900 });
    }

    // arpejo
    if (hot > 0.08 && s % 2 === 0) {
      const idx = (s / 2 + bar) % track.scale.length;
      const oct = 3 + (s % 8 === 0 ? 1 : 0);
      voice(
        track.root * Math.pow(2, track.scale[idx]! / 12 + oct - 1), t, spb * 0.85,
        0.045 + hot * 0.055, track.wave, bus,
        { pan: ((s % 4) - 1.5) / 5 },
      );
    }

    // lead em staccato quando a partida esquenta
    if (hot > 0.45 && (s === 3 || s === 7 || s === 11)) {
      const idx = (s + bar * 2) % track.scale.length;
      voice(rootHz * Math.pow(2, track.scale[idx]! / 12 + 2), t, spb * 0.55, 0.05, "triangle", bus, { pan: -0.3, attack: 0.006 });
    }

    // pad harmônico sustentado
    if (s === 0) {
      [0, 3, 7].forEach((iv, i) =>
        voice(rootHz * Math.pow(2, (iv + 12) / 12), t, spb * 15, 0.022 + hot * 0.018, "sawtooth", bus,
          { cutoff: 900 + hot * 1600, pan: i === 0 ? -0.35 : i === 2 ? 0.35 : 0, attack: 0.4 }),
      );
    }

    // riser no fim do ciclo de 4 compassos
    if (hot > 0.5 && s === 12 && bar % 4 === 3) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(1800, t + spb * 4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + spb * 3.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 4.2);
      o.connect(g).connect(bus);
      o.start(t); o.stop(t + spb * 4.3);
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
