// Camera helpers: abre o sensor com o campo de visão mais amplo possível
// (sem forçar recorte retrato que gerava "zoom") e zera o zoom do aparelho.

export function wideVideoConstraints(facing: "user" | "environment"): MediaTrackConstraints[] {
  return [
    { facingMode: { exact: facing }, width: { ideal: 1920 }, height: { ideal: 1440 }, frameRate: { ideal: 30 }, resizeMode: "none" } as any,
    { facingMode: { exact: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { exact: facing } },
    { facingMode: facing },
  ];
}

/** Aplica o menor zoom suportado (lente mais aberta, ex.: 0.5x quando existir). */
export async function widenCamera(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities) return;
  try {
    const caps = track.getCapabilities() as any;
    if (caps?.zoom && typeof caps.zoom.min === "number") {
      await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as any] });
    }
  } catch {
    /* aparelho não suporta zoom */
  }
}
