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
  | "rewind"
  | "gravity"
  | "portal"
  | "shield"
  | "clone"
  | "magnet"
  | "speed"
  | "reflex"
  | "freeze"
  | "shrink"
  | "wall"
  | "fury"
  | "ghost";

export type PowerDef = {
  id: PowerId;
  name: string;
  emoji: string;
  /** frase curta: o que acontece na prática */
  desc: string;
  /** em quem o efeito recai */
  target: "self" | "enemy" | "ball";
  /** segundos de recarga */
  cooldown: number;
  /** segundos de duração do efeito (0 = instantâneo) */
  duration: number;
  color: string;
};

export const POWERS: PowerDef[] = [
  {
    id: "rewind",
    name: "Tempo",
    emoji: "⏳",
    desc: "Volta a partida 10 segundos: bola, raquetes e placar retornam ao que eram.",
    target: "ball",
    cooldown: 26,
    duration: 0,
    color: "#facc15",
  },
  {
    id: "teleport",
    name: "Teleporte",
    emoji: "✨",
    desc: "Sua raquete pisca instantaneamente para debaixo da bola.",
    target: "self",
    cooldown: 8,
    duration: 0,
    color: "#8b5cf6",
  },
  {
    id: "freeze",
    name: "Congelar",
    emoji: "❄️",
    desc: "A raquete do adversário fica travada por 2s.",
    target: "enemy",
    cooldown: 18,
    duration: 2,
    color: "#67e8f9",
  },
  {
    id: "shrink",
    name: "Encolher",
    emoji: "🔻",
    desc: "A raquete do adversário fica 45% menor por 6s.",
    target: "enemy",
    cooldown: 18,
    duration: 6,
    color: "#fb7185",
  },
  {
    id: "wall",
    name: "Muralha",
    emoji: "🧱",
    desc: "Ergue uma barreira que rebate a bola na frente da sua raquete por 5s.",
    target: "self",
    cooldown: 20,
    duration: 5,
    color: "#a3a3a3",
  },
  {
    id: "fury",
    name: "Fúria",
    emoji: "🔥",
    desc: "Sua próxima defesa vira um smash: a bola sai 80% mais rápida.",
    target: "self",
    cooldown: 15,
    duration: 8,
    color: "#f97316",
  },
  {
    id: "ghost",
    name: "Fantasma",
    emoji: "👻",
    desc: "Por 4s a bola quase some quando entra no campo do adversário.",
    target: "enemy",
    cooldown: 19,
    duration: 4,
    color: "#e5e7eb",
  },
  {
    id: "gravity",
    name: "Gravidade",
    emoji: "🌀",
    desc: "Puxa a bola para longe da sua raquete e para os cantos do rival por 4s.",
    target: "ball",
    cooldown: 16,
    duration: 4,
    color: "#38bdf8",
  },
  {
    id: "portal",
    name: "Portal",
    emoji: "🌌",
    desc: "Por 5s a bola atravessa o meio e reaparece espelhada do outro lado.",
    target: "ball",
    cooldown: 18,
    duration: 5,
    color: "#a855f7",
  },
  {
    id: "shield",
    name: "Escudo",
    emoji: "🛡️",
    desc: "Segura um ponto contra você: a bola volta ao jogo uma vez em 12s.",
    target: "self",
    cooldown: 22,
    duration: 12,
    color: "#22d3ee",
  },
  {
    id: "clone",
    name: "Clone",
    emoji: "👥",
    desc: "Uma segunda raquete espelha a sua e defende à frente por 6s.",
    target: "self",
    cooldown: 20,
    duration: 6,
    color: "#f472b6",
  },
  {
    id: "magnet",
    name: "Magnetismo",
    emoji: "🧲",
    desc: "Sua raquete fica 55% maior por 6s.",
    target: "self",
    cooldown: 16,
    duration: 6,
    color: "#c084fc",
  },
  {
    id: "speed",
    name: "Velocidade",
    emoji: "⚡",
    desc: "Sua raquete se move 70% mais rápido por 6s.",
    target: "self",
    cooldown: 14,
    duration: 6,
    color: "#34d399",
  },
  {
    id: "reflex",
    name: "Reflexo",
    emoji: "🎯",
    desc: "Por 6s toda defesa sai com ângulo perfeito e 35% mais força.",
    target: "self",
    cooldown: 17,
    duration: 6,
    color: "#fbbf24",
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
