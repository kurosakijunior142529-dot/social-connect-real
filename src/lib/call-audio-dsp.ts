// "Voz Estúdio": tratamento automático da voz recebida na chamada.
// De-rumble (passa-alta), anti-abafamento, presença, brilho suave e compressor.
type Chain = { ctx: AudioContext; out: MediaStream; src: MediaStreamAudioSourceNode; primer: HTMLAudioElement; key: string };

let chain: Chain | null = null;

function keyOf(s: MediaStream) {
  return s.getAudioTracks().map((t) => t.id).join(",");
}

export function studioVoice(stream: MediaStream): MediaStream {
  try {
    const key = keyOf(stream);
    if (!key) return stream;
    if (chain && chain.key === key) {
      void chain.ctx.resume().catch(() => undefined);
      return chain.out;
    }
    releaseStudioVoice();
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return stream;
    const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
    // Chrome só entrega áudio WebRTC ao Web Audio se o stream estiver num elemento (mudo).
    const primer = new Audio();
    primer.muted = true;
    primer.srcObject = stream;
    void primer.play().catch(() => undefined);

    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 85; hp.Q.value = 0.7;
    const mud = ctx.createBiquadFilter(); mud.type = "peaking"; mud.frequency.value = 300; mud.Q.value = 1; mud.gain.value = -2.5;
    const pres = ctx.createBiquadFilter(); pres.type = "peaking"; pres.frequency.value = 3500; pres.Q.value = 0.9; pres.gain.value = 3.5;
    const air = ctx.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = 9000; air.gain.value = 1.5;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 15000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const gain = ctx.createGain(); gain.gain.value = 1.35;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.05;
    const dest = ctx.createMediaStreamDestination();
    src.connect(hp).connect(mud).connect(pres).connect(air).connect(lp).connect(comp).connect(gain).connect(limiter).connect(dest);
    void ctx.resume().catch(() => undefined);
    chain = { ctx, out: dest.stream, src, primer, key };
    return dest.stream;
  } catch {
    return stream;
  }
}

export function resumeStudioVoice() {
  void chain?.ctx.resume().catch(() => undefined);
}

export function releaseStudioVoice() {
  if (!chain) return;
  try { chain.src.disconnect(); } catch { /* noop */ }
  chain.primer.srcObject = null;
  void chain.ctx.close().catch(() => undefined);
  chain = null;
}
