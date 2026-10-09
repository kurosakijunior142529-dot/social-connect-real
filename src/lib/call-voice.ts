// Voice preference for spoken call translations (device-local).
const KEY = "vibely-call-voice";

export const AI_VOICES = [
  { id: "onyx", label: "Onyx", desc: "Masculina, grave", g: "m" },
  { id: "cedar", label: "Cedar", desc: "Masculina, madura e calorosa", g: "m" },
  { id: "marin", label: "Marin", desc: "Masculina, confiante", g: "m" },
  { id: "ash", label: "Ash", desc: "Masculina, firme", g: "m" },
  { id: "echo", label: "Echo", desc: "Masculina, jovem", g: "m" },
  { id: "fable", label: "Fable", desc: "Masculina, narrador", g: "m" },
  { id: "ballad", label: "Ballad", desc: "Masculina, macia", g: "m" },
  { id: "nova", label: "Nova", desc: "Feminina, suave", g: "f" },
  { id: "shimmer", label: "Shimmer", desc: "Feminina, clara", g: "f" },
  { id: "coral", label: "Coral", desc: "Feminina, calorosa", g: "f" },
  { id: "sage", label: "Sage", desc: "Feminina, calma", g: "f" },
  { id: "alloy", label: "Alloy", desc: "Neutra, equilibrada", g: "n" },
  { id: "verse", label: "Verse", desc: "Neutra, expressiva", g: "n" },
] as const;

/** "auto" | "device:<voiceURI>" | "ai:<id>" */
export function getCallVoice(): string {
  try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; }
}
export function setCallVoice(v: string) {
  try { localStorage.setItem(KEY, v); } catch { /* noop */ }
}

const QUALITY = /(natural|neural|enhanced|premium|siri|google|online)/i;

export function deviceVoicesFor(lang: string): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const base = lang.split("-")[0]!.toLowerCase();
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(base))
    .sort((a, b) => Number(QUALITY.test(b.name)) - Number(QUALITY.test(a.name)));
}
