/**
 * AI speech-to-text fallback for live call translation.
 *
 * Browsers without the Web Speech API (Android WebView, Firefox) can still get
 * captions: we tap the *existing* local MediaStream (never re-request the mic,
 * never modify the tracks), encode short complete WAV clips and send them to the
 * server for transcription.
 */

const TARGET_RATE = 16000;
const MAX_WINDOW_MS = 4500;
const MIN_WINDOW_MS = 900;
/** A window is only sent when this much actual voice was detected. */
const MIN_VOICED_MS = 550;
const SILENCE_MS = 650;
const SILENCE_RMS = 0.006;
/** Keep a short tail of the previous window so words cut at the boundary survive. */
const OVERLAP_MS = 300;
/** While the other person is speaking, require a clearly louder local voice. */
const DUCK_FACTOR = 3;

export type SttCaptureState = "starting" | "listening" | "transcribing" | "error";
export type SttFallbackHandle = {
  ready: Promise<boolean>;
  stop: () => void;
};


function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j] ?? 0;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + total * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, total * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const s = Math.max(-1, Math.min(1, chunk[i] ?? 0));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Starts windowed transcription over an existing stream.
 * `onClip` receives a base64 WAV; it should resolve with the transcript (or null).
 * When `remoteStream` is provided, audio captured while the other participant is
 * speaking must be clearly louder to count as local voice — this keeps the other
 * person's voice (leaking through the speaker) out of my own captions.
 */
export function startSttFallback(
  stream: MediaStream,
  handlers: {
    onClip: (base64Wav: string) => Promise<void>;
    onError?: (error: unknown) => void;
    onStateChange?: (state: SttCaptureState) => void;
    remoteStream?: MediaStream | null;
  },
): SttFallbackHandle | null {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return null;

  const AudioCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;

  let ctx: AudioContext;
  let source: MediaStreamAudioSourceNode;
  let processor: ScriptProcessorNode;
  let sink: GainNode;
  let remoteSource: MediaStreamAudioSourceNode | null = null;
  let remoteAnalyser: AnalyserNode | null = null;
  let remoteData: Uint8Array | null = null;
  try {
    ctx = new AudioCtor();
    source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    processor = ctx.createScriptProcessor(4096, 1, 1);
    // Muted sink keeps the processor pumping without echoing into the speakers.
    sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(processor);
    processor.connect(sink);
    sink.connect(ctx.destination);

    const remoteTracks = handlers.remoteStream?.getAudioTracks() ?? [];
    if (remoteTracks.length > 0) {
      remoteSource = ctx.createMediaStreamSource(new MediaStream(remoteTracks));
      remoteAnalyser = ctx.createAnalyser();
      remoteAnalyser.fftSize = 512;
      remoteAnalyser.smoothingTimeConstant = 0.7;
      remoteSource.connect(remoteAnalyser);
      remoteData = new Uint8Array(remoteAnalyser.frequencyBinCount);
    }
  } catch (error) {
    handlers.onError?.(error);
    return null;
  }

  let stopped = false;
  let pcm: Float32Array[] = [];
  let samples = 0;
  let voicedSamples = 0;
  let silentSamples = 0;
  let sending = false;
  let noiseFloor = SILENCE_RMS;
  let tail: Float32Array[] = [];
  handlers.onStateChange?.("starting");

  const overlapSamples = Math.round((TARGET_RATE * OVERLAP_MS) / 1000);

  const keepTail = (chunks: Float32Array[]) => {
    const next: Float32Array[] = [];
    let kept = 0;
    for (let i = chunks.length - 1; i >= 0 && kept < overlapSamples; i -= 1) {
      const chunk = chunks[i];
      if (!chunk) continue;
      next.unshift(chunk);
      kept += chunk.length;
    }
    tail = next;
  };

  const reset = () => {
    pcm = tail.length > 0 ? [...tail] : [];
    samples = pcm.reduce((n, c) => n + c.length, 0);
    voicedSamples = 0;
    silentSamples = 0;
  };

  const remoteActive = () => {
    if (!remoteAnalyser || !remoteData) return false;
    remoteAnalyser.getByteFrequencyData(remoteData as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < remoteData.length; i += 1) sum += remoteData[i]! * remoteData[i]!;
    return Math.sqrt(sum / remoteData.length) / 255 > 0.045;
  };

  const flush = async () => {
    if (sending || pcm.length === 0) return;
    const chunks = pcm;
    const voiced = voicedSamples;
    keepTail(chunks);
    reset();
    if (voiced < (TARGET_RATE * MIN_VOICED_MS) / 1000) return; // noise or a stray click, not speech
    sending = true;
    handlers.onStateChange?.("transcribing");
    try {
      const base64 = await blobToBase64(encodeWav(chunks, TARGET_RATE));
      await handlers.onClip(base64);
    } catch (error) {
      handlers.onStateChange?.("error");
      handlers.onError?.(error);
    } finally {
      sending = false;
      if (!stopped) handlers.onStateChange?.("listening");
    }
  };

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    // Never queue audio behind a slow network request. Keeping only one clip in
    // flight prevents unbounded buffers and delayed captions on mobile.
    if (sending) return;
    const input = event.inputBuffer.getChannelData(0);
    const chunk = downsample(new Float32Array(input), ctx.sampleRate, TARGET_RATE);

    let sum = 0;
    for (let i = 0; i < chunk.length; i += 1) sum += (chunk[i] ?? 0) ** 2;
    const rms = Math.sqrt(sum / Math.max(1, chunk.length));

    // Adaptive noise floor: slowly track the quietest recent level.
    noiseFloor = rms < noiseFloor ? noiseFloor * 0.9 + rms * 0.1 : noiseFloor * 0.995 + rms * 0.005;
    const base = Math.max(SILENCE_RMS, noiseFloor * 1.8);
    const threshold = remoteActive() ? base * DUCK_FACTOR : base;

    pcm.push(chunk);
    samples += chunk.length;
    if (rms > threshold) {
      voicedSamples += chunk.length;
      silentSamples = 0;
    } else {
      silentSamples += chunk.length;
    }

    const ms = (samples / TARGET_RATE) * 1000;
    const silenceMs = (silentSamples / TARGET_RATE) * 1000;
    const voicedMs = (voicedSamples / TARGET_RATE) * 1000;

    if (ms >= MAX_WINDOW_MS || (voicedMs >= MIN_WINDOW_MS / 2 && silenceMs >= SILENCE_MS)) {
      void flush();
    }
  };


  const ready = ctx
    .resume()
    .then(() => {
      const running = ctx.state === "running";
      handlers.onStateChange?.(running ? "listening" : "error");
      return running;
    })
    .catch((error) => {
      handlers.onStateChange?.("error");
      handlers.onError?.(error);
      return false;
    });

  return {
    ready,
    stop() {
      stopped = true;
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
        source.disconnect();
        sink.disconnect();
        remoteSource?.disconnect();
        remoteAnalyser?.disconnect();
      } catch {

        /* already torn down */
      }
      void ctx.close().catch(() => {});
    },
  };
}
