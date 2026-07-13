function envTurn(): RTCIceServer[] {
  const urls = (import.meta as any).env?.VITE_TURN_URLS as string | undefined;
  if (!urls) return [];
  const list = urls.split(",").map((u) => u.trim()).filter(Boolean);
  if (!list.length) return [];
  return [
    {
      urls: list,
      username: (import.meta as any).env?.VITE_TURN_USERNAME,
      credential: (import.meta as any).env?.VITE_TURN_CREDENTIAL,
    },
  ];
}

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  // Free public TURN (Open Relay Project by Metered) — best effort, may be rate-limited.
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  ...envTurn(),
];

export async function getLocalMedia(
  video: boolean,
  facingMode: "user" | "environment" = "user",
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Este navegador não permite chamadas neste ambiente.", "NotSupportedError");
  }
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (status.state === "denied") {
        throw new DOMException("Microfone bloqueado nas permissões do navegador.", "NotAllowedError");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") throw err;
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
    },
    video: video
      ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: facingMode },
        }
      : false,
  });
  if (!stream.getAudioTracks().length) {
    stopStream(stream);
    throw new DOMException("Microfone não encontrado.", "NotFoundError");
  }
  return stream;
}

export async function getCameraTrack(
  facingMode: "user" | "environment",
): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: { ideal: facingMode },
    },
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("Câmera não encontrada");
  return track;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
    // Force ICE trickling to use both host + relay candidates
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}
