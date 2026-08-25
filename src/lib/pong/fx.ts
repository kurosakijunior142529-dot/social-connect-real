// Registro visual/sonoro dos poderes: elemento, raridade, counters e combos.
// O motor (pong-online) e o canvas leem daqui — para dar identidade a TODO poder
// sem precisar de código específico por poder.

import { POWERS, POWER_MAP, type PowerId } from "./config";
import type { SfxName } from "./audio";

export type Element =
  | "fogo" | "gelo" | "raio" | "energia" | "gravidade" | "vento"
  | "agua" | "tempo" | "fantasma" | "tecnologia" | "terra" | "luz" | "sombra";

export type ParticleShape = "circle" | "spark" | "shard" | "bolt" | "smoke" | "star" | "ring";

export type ElementStyle = {
  name: string;
  color: string;
  color2: string;
  shape: ParticleShape;
  /** gravidade aplicada às partículas (negativo sobe, ex.: fogo) */
  grav: number;
  speed: number;
  life: number;
  size: number;
  sfx: SfxName;
};

export const ELEMENTS: Record<Element, ElementStyle> = {
  fogo: { name: "Fogo", color: "#fb923c", color2: "#fde68a", shape: "spark", grav: -0.55, speed: 0.55, life: 0.6, size: 2.4, sfx: "fire" },
  gelo: { name: "Gelo", color: "#a5f3fc", color2: "#e0f2fe", shape: "shard", grav: 0.35, speed: 0.42, life: 0.75, size: 2.2, sfx: "ice" },
  raio: { name: "Raio", color: "#fde047", color2: "#ffffff", shape: "bolt", grav: 0, speed: 0.95, life: 0.32, size: 2.0, sfx: "thunder" },
  energia: { name: "Energia", color: "#a78bfa", color2: "#e9d5ff", shape: "circle", grav: 0, speed: 0.6, life: 0.5, size: 2.2, sfx: "power" },
  gravidade: { name: "Gravidade", color: "#818cf8", color2: "#c7d2fe", shape: "ring", grav: 0.9, speed: 0.35, life: 0.8, size: 2.6, sfx: "gravity" },
  vento: { name: "Vento", color: "#5eead4", color2: "#ccfbf1", shape: "smoke", grav: -0.1, speed: 0.8, life: 0.55, size: 3.0, sfx: "wind" },
  agua: { name: "Água", color: "#22d3ee", color2: "#a5f3fc", shape: "circle", grav: 0.6, speed: 0.45, life: 0.6, size: 2.2, sfx: "water" },
  tempo: { name: "Tempo", color: "#facc15", color2: "#fef08a", shape: "ring", grav: 0, speed: 0.3, life: 0.9, size: 2.4, sfx: "rewind" },
  fantasma: { name: "Fantasma", color: "#e5e7eb", color2: "#c7d2fe", shape: "smoke", grav: -0.25, speed: 0.35, life: 0.85, size: 3.2, sfx: "voidfx" },
  tecnologia: { name: "Tecnologia", color: "#38bdf8", color2: "#bae6fd", shape: "spark", grav: 0.1, speed: 0.7, life: 0.4, size: 1.8, sfx: "tech" },
  terra: { name: "Terra", color: "#d97706", color2: "#fcd34d", shape: "shard", grav: 1.4, speed: 0.5, life: 0.7, size: 2.8, sfx: "earth" },
  luz: { name: "Luz", color: "#fef9c3", color2: "#ffffff", shape: "star", grav: -0.1, speed: 0.7, life: 0.45, size: 2.2, sfx: "light" },
  sombra: { name: "Sombra", color: "#7c3aed", color2: "#4c1d95", shape: "smoke", grav: 0.15, speed: 0.4, life: 0.8, size: 3.0, sfx: "shadow" },
};

/** elemento de cada poder — define animação, partícula e som */
export const POWER_ELEMENT: Partial<Record<PowerId, Element>> = {
  // fogo
  fury: "fogo", hyper: "fogo", fuse: "fogo", resonance: "fogo", gambit: "fogo",
  // gelo
  freeze: "gelo", slowmo: "gelo", anchor: "gelo", damp: "gelo", feather: "gelo", bubble: "gelo",
  // raio
  speed: "raio", laser: "raio", counter: "raio", overdrive: "raio", parry: "raio", blind: "raio", jam: "raio",
  // energia
  teleport: "energia", reflex: "energia", magnet: "energia", dash: "energia", shift: "energia",
  secondwind: "energia", momentum: "energia", overload: "energia", serveback: "energia", tether: "energia",
  // gravidade
  gravity: "gravidade", blackhole: "gravidade", heavy: "gravidade", lead: "gravidade",
  root: "gravidade", narrow: "gravidade", netrise: "gravidade",
  // vento
  curve: "vento", vortex: "vento", saw: "vento", drift: "vento", fork: "vento",
  // água
  current: "agua", haven: "agua", wrap: "agua",
  // tempo
  rewind: "tempo", recall: "tempo", golden: "tempo",
  // fantasma
  ghost: "fantasma", stealth: "fantasma", fog: "fantasma", mirror: "fantasma", portal: "fantasma", swap: "fantasma",
  // tecnologia
  sentinel: "tecnologia", clone: "tecnologia", split: "tecnologia", invert: "tecnologia",
  leech: "tecnologia", bulwark: "tecnologia", wall: "tecnologia", ceiling: "tecnologia", vault: "tecnologia",
  // terra
  quake: "terra", spikes: "terra", giant: "terra", chaos: "terra", sticky: "terra", tiny: "terra",
  // luz
  shield: "luz", shrink: "luz", taunt: "luz",
  // sombra
  silence: "sombra", deadzone: "sombra", steal: "sombra", curtain: "sombra",
};

const CATEGORY_ELEMENT: Record<string, Element> = {
  ataque: "fogo", defesa: "luz", controle: "tecnologia", caos: "sombra",
};

export function elementOf(id: PowerId): Element {
  return POWER_ELEMENT[id] ?? CATEGORY_ELEMENT[POWER_MAP[id]?.category ?? "ataque"] ?? "energia";
}

export function styleOf(id: PowerId): ElementStyle {
  return ELEMENTS[elementOf(id)];
}

export function sfxOf(id: PowerId): SfxName {
  return styleOf(id).sfx;
}

/* ------------------------------------------------------------------ */
/* raridade                                                            */
/* ------------------------------------------------------------------ */

export type Rarity = "comum" | "incomum" | "raro" | "epico" | "lendario" | "ultimate";

export const RARITY_META: Record<Rarity, { name: string; color: string; rank: number }> = {
  comum: { name: "Comum", color: "#94a3b8", rank: 0 },
  incomum: { name: "Incomum", color: "#4ade80", rank: 1 },
  raro: { name: "Raro", color: "#38bdf8", rank: 2 },
  epico: { name: "Épico", color: "#c084fc", rank: 3 },
  lendario: { name: "Lendário", color: "#fbbf24", rank: 4 },
  ultimate: { name: "Ultimate", color: "#f43f5e", rank: 5 },
};

export function rarityOf(id: PowerId): Rarity {
  const p = POWER_MAP[id];
  if (!p) return "comum";
  if (p.tier === 3 && p.cooldown >= 26) return "ultimate";
  if (p.tier === 3) return p.cooldown >= 21 ? "lendario" : "epico";
  if (p.tier === 2) return p.cooldown >= 20 ? "epico" : "raro";
  return p.cooldown <= 10 ? "comum" : "incomum";
}

/* ------------------------------------------------------------------ */
/* counters                                                            */
/* ------------------------------------------------------------------ */

/** poderes que nenhum efeito consegue bloquear */
export const UNBLOCKABLE: PowerId[] = ["teleport", "dash", "shift", "rewind", "recall", "secondwind"];

/** efeitos que, ativos em quem sofre, devolvem o poder ao lançador */
export const REFLECTORS: PowerId[] = ["parry", "counter"];

/** efeitos que, ativos em quem sofre, absorvem o poder (consumidos no processo) */
export const BLOCKERS: PowerId[] = ["shield", "wall", "bulwark"];

/** elementos que se anulam: usar A limpa efeitos B ativos em você */
export const ELEMENT_CANCELS: Partial<Record<Element, Element[]>> = {
  fogo: ["gelo"],
  gelo: ["fogo"],
  raio: ["tecnologia"],
  agua: ["fogo"],
  luz: ["sombra"],
  sombra: ["luz"],
  vento: ["fantasma"],
  gravidade: ["vento"],
};

/** poderes de um elemento (cache) */
export const POWERS_BY_ELEMENT: Record<Element, PowerId[]> = (() => {
  const out = {} as Record<Element, PowerId[]>;
  for (const k of Object.keys(ELEMENTS) as Element[]) out[k] = [];
  for (const p of POWERS) out[elementOf(p.id)].push(p.id);
  return out;
})();

/* ------------------------------------------------------------------ */
/* combos                                                              */
/* ------------------------------------------------------------------ */

export type ComboDef = {
  name: string;
  color: string;
  /** aceleração aplicada à bola */
  ballBoost: number;
  /** carga extra de ultimate */
  charge: number;
  desc: string;
};

const key = (a: Element, b: Element) => [a, b].sort().join("+");

export const COMBOS: Record<string, ComboDef> = {
  [key("fogo", "raio")]: { name: "Tempestade de Brasas", color: "#fb923c", ballBoost: 1.35, charge: 22, desc: "Bola incandescente e elétrica" },
  [key("fogo", "energia")]: { name: "Bola de Fogo", color: "#f97316", ballBoost: 1.4, charge: 20, desc: "Fogo em velocidade máxima" },
  [key("gelo", "vento")]: { name: "Nevasca", color: "#a5f3fc", ballBoost: 1.1, charge: 20, desc: "Bola congelada em curva" },
  [key("raio", "energia")]: { name: "Sobrecarga Elétrica", color: "#fde047", ballBoost: 1.35, charge: 20, desc: "Bola elétrica" },
  [key("gravidade", "terra")]: { name: "Impacto Sísmico", color: "#818cf8", ballBoost: 1.2, charge: 24, desc: "Explosão com atração" },
  [key("gravidade", "fantasma")]: { name: "Singularidade", color: "#a855f7", ballBoost: 1.25, charge: 24, desc: "Trajetória imprevisível" },
  [key("tempo", "energia")]: { name: "Paradoxo", color: "#facc15", ballBoost: 1.15, charge: 26, desc: "Tempo distorcido" },
  [key("agua", "raio")]: { name: "Curto-Circuito", color: "#22d3ee", ballBoost: 1.3, charge: 22, desc: "Corrente eletrificada" },
  [key("luz", "energia")]: { name: "Prisma", color: "#fef9c3", ballBoost: 1.2, charge: 20, desc: "Feixe puro" },
  [key("sombra", "fantasma")]: { name: "Eclipse", color: "#7c3aed", ballBoost: 1.2, charge: 24, desc: "Bola quase invisível" },
  [key("tecnologia", "raio")]: { name: "Protocolo Turbo", color: "#38bdf8", ballBoost: 1.3, charge: 20, desc: "Sistemas no limite" },
  [key("fogo", "vento")]: { name: "Rajada Ígnea", color: "#fdba74", ballBoost: 1.28, charge: 20, desc: "Chamas em espiral" },
};

/** janela em segundos para encadear dois poderes */
export const COMBO_WINDOW = 5;

export function comboFor(a: PowerId, b: PowerId): ComboDef | null {
  const ea = elementOf(a), eb = elementOf(b);
  if (ea === eb) return null;
  return COMBOS[key(ea, eb)] ?? null;
}

/* ------------------------------------------------------------------ */
/* ultimate                                                            */
/* ------------------------------------------------------------------ */

export const ULT = {
  max: 100,
  onHit: 6,
  onScore: 18,
  onConcede: 10,
  onBlock: 14,
  onCombo: 18,
  /** duração da cinemática/efeito */
  duration: 2.6,
} as const;

/* ------------------------------------------------------------------ */
/* qualidade gráfica                                                   */
/* ------------------------------------------------------------------ */

export type Quality = "baixo" | "medio" | "alto";

export const QUALITY: Record<Quality, { name: string; particles: number; trail: number; glow: boolean; maxParts: number }> = {
  baixo: { name: "Baixo", particles: 0.35, trail: 12, glow: false, maxParts: 120 },
  medio: { name: "Médio", particles: 0.7, trail: 22, glow: true, maxParts: 260 },
  alto: { name: "Alto", particles: 1, trail: 32, glow: true, maxParts: 460 },
};

export function autoQuality(): Quality {
  if (typeof navigator === "undefined") return "medio";
  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 3 || cores <= 4) return "medio";
  if (mem >= 8 && cores >= 8) return "alto";
  return "medio";
}
