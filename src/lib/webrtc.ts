export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export async function getLocalMedia(video: boolean): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: video
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
      : false,
  });
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}
