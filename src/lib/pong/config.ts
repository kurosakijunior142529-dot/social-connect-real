// Catálogo extensível do Ping Pong: poderes, arenas e cosméticos.
// Para adicionar conteúdo novo basta acrescentar entradas aqui —
// o motor do jogo lê tudo deste registro.

export const FIELD = {
  /** largura em unidades de campo */
  w: 1,
  /** altura em unidades de campo (portrait) */
  h: 1.5,
  ballR: 0.026,
  paddleHalf: 0.115,
  paddleH: 0.026,
  paddleInset: 0.09,
  baseSpeed: 0.95,
  maxSpeed: 2.1,
  paddleSpeed: 2.6,
  winScore: 7,
} as const;

export type PowerId =
  | "teleport"
  | "gravity"
  | "time"
  | "portal"
  | "shield"
  | "clone"
  | "magnet"
  | "speed"
  | "reflex";

export type PowerDef = {
  id: PowerId;
  name: string;
  emoji: string;
  desc: string;
  /** segundos de recarga */
  cooldown: number;
  /** segundos de duração do efeito (0 = instantâneo) */
  duration: number;
  color: string;
};

export const POWERS: PowerDef[] = [
  {
    id: "teleport",
    name: "Teleporte",
    emoji: "✨",
    desc: "Sua raquete salta instantaneamente até 25% do campo na direção da bola.",
    cooldown: 9,
    duration: 0,
    color: "#8b5cf6",
  },
  {
    id: "gravity",
    name: "Gravidade",
    emoji: "🌀",
    desc: "Curva a trajetória da bola em direção ao lado do adversário por 4s.",
    cooldown: 16,
    duration: 4,
    color: "#38bdf8",
  },
  {
    id: "time",
    name: "Tempo",
    emoji: "⏳",
    desc: "Desacelera a bola em 40% durante 3s para você se posicionar.",
    cooldown: 15,
    duration: 3,
    color: "#facc15",
  },
  {
    id: "portal",
    name: "Portal",
    emoji: "🌌",
    desc: "Por 5s, ao cruzar o meio a bola é espelhada para o outro lado do campo.",
    cooldown: 18,
    duration: 5,
    color: "#a855f7",
  },
  {
    id: "shield",
    name: "Escudo",
    emoji: "🛡️",
    desc: "Bloqueia o próximo ponto contra você (uma vez, dentro de 12s).",
    cooldown: 22,
    duration: 12,
    color: "#22d3ee",
  },
  {
    id: "clone",
    name: "Clone",
    emoji: "👥",
    desc: "Cria uma segunda raquete de apoio à sua frente por 6s.",
    cooldown: 20,
    duration: 6,
    color: "#f472b6",
  },
  {
    id: "magnet",
    name: "Magnetismo",
    emoji: "🧲",
    desc: "Aumenta a área de contato da raquete em 55% por 6s.",
    cooldown: 16,
    duration: 6,
    color: "#fb7185",
  },
  {
    id: "speed",
    name: "Velocidade",
    emoji: "⚡",
    desc: "Sua raquete fica 70% mais rápida por 6s.",
    cooldown: 14,
    duration: 6,
    color: "#34d399",
  },
  {
    id: "reflex",
    name: "Reflexo",
    emoji: "🎯",
    desc: "Por 6s, cada defesa devolve a bola 35% mais forte e com ângulo perfeito.",
    cooldown: 17,
    duration: 6,
    color: "#f97316",
  },
];

export const POWER_MAP: Record<PowerId, PowerDef> = Object.fromEntries(
  POWERS.map((p) => [p.id, p]),
) as Record<PowerId, PowerDef>;

export type ArenaDef = {
  id: string;
  name: string;
  bg: [string, string];
  line: string;
  glow: string;
  unlockLevel: number;
};

export const ARENAS: ArenaDef[] = [
  { id: "neon", name: "Neon", bg: ["#0b1020", "#131a34"], line: "rgba(255,255,255,0.14)", glow: "#7c5cff", unlockLevel: 1 },
  { id: "sunset", name: "Pôr do sol", bg: ["#2a1030", "#4a1a2c"], line: "rgba(255,255,255,0.12)", glow: "#ff7a59", unlockLevel: 3 },
  { id: "deep", name: "Abissal", bg: ["#04161c", "#062a33"], line: "rgba(255,255,255,0.1)", glow: "#22d3ee", unlockLevel: 5 },
  { id: "void", name: "Vazio", bg: ["#0a0a0c", "#1a1520"], line: "rgba(255,255,255,0.08)", glow: "#f472b6", unlockLevel: 8 },
];

export type SkinDef = { id: string; name: string; color: string; trail: string; unlockLevel: number };

export const PADDLE_SKINS: SkinDef[] = [
  { id: "aurora", name: "Aurora", color: "#7c5cff", trail: "#a78bfa", unlockLevel: 1 },
  { id: "lime", name: "Lima", color: "#34d399", trail: "#86efac", unlockLevel: 2 },
  { id: "solar", name: "Solar", color: "#fb923c", trail: "#fdba74", unlockLevel: 4 },
  { id: "ice", name: "Gelo", color: "#38bdf8", trail: "#bae6fd", unlockLevel: 6 },
];

export const BALL_SKINS: SkinDef[] = [
  { id: "classic", name: "Clássica", color: "#ffffff", trail: "rgba(255,255,255,0.5)", unlockLevel: 1 },
  { id: "ember", name: "Brasa", color: "#fca5a5", trail: "rgba(248,113,113,0.55)", unlockLevel: 3 },
  { id: "plasma", name: "Plasma", color: "#c4b5fd", trail: "rgba(167,139,250,0.55)", unlockLevel: 5 },
];

export function levelFromXp(xp: number) {
  return 1 + Math.floor(xp / 500);
}
export function xpProgress(xp: number) {
  const into = xp % 500;
  return { into, need: 500, pct: Math.round((into / 500) * 100) };
}
