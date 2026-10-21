export const SINTONIA_DURATION_MS = 86_400_000;
export const SINTONIA_AUDIO_MAX_MS = 10_000;
export const SINTONIA_TEXT_MAX = 60;

export const SINTONIA_MOODS = [
  { id: "livre", label: "Livre", emoji: "✨" },
  { id: "feliz", label: "Feliz", emoji: "😄" },
  { id: "tranquilo", label: "De boa", emoji: "🌊" },
  { id: "focado", label: "No foco", emoji: "🎯" },
  { id: "saudade", label: "Saudade", emoji: "💭" },
  { id: "energia", label: "Energia", emoji: "⚡" },
] as const;

export function sintoniaMood(id: string) {
  return SINTONIA_MOODS.find((m) => m.id === id) ?? SINTONIA_MOODS[0];
}

export function validSintoniaAudio(durationMs: number) {
  return Number.isFinite(durationMs) && durationMs > 0 && durationMs <= SINTONIA_AUDIO_MAX_MS;
}

export function isSintoniaActive(expiresAt: string, now = Date.now()) {
  return Date.parse(expiresAt) > now;
}