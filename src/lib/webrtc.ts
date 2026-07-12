export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  // Recommendation: Add TURN servers here for reliable connection across symmetric NATs
  // {
  //   urls: "turn:your-turn-server.com:3478",
  //   username: "user",
  //   credential: "password"
  // }
];

export async function getLocalMedia(
  video: boolean,
  facingMode: "user" | "environment" = "user",
): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: video
      ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: facingMode },
        }
      : false,
  });
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
  });
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}
