// Loadout local do Ping Pong: 4 poderes equipados, favoritos e desbloqueios.
// Tudo é local (não afeta o multiplayer) — só a ATIVAÇÃO é sincronizada.

import { POWERS, POWER_MAP, type PowerId } from "./config";
import { RARITY_META, rarityOf, type Rarity } from "./fx";

export const LOADOUT_SIZE = 4;

const KEY_LOADOUT = "pong.loadout.v1";
const KEY_FAVS = "pong.favs.v1";

/** nível necessário para usar cada poder, derivado da raridade */
export const UNLOCK_BY_RARITY: Record<Rarity, number> = {
  comum: 1, incomum: 2, raro: 4, epico: 7, lendario: 10, ultimate: 14,
};

export function unlockLevel(id: PowerId) {
  return UNLOCK_BY_RARITY[rarityOf(id)];
}

export function isUnlocked(id: PowerId, level: number) {
  return level >= unlockLevel(id);
}

export const DEFAULT_LOADOUT: PowerId[] = ["teleport", "shield", "speed", "fury"];

function readList(key: string): PowerId[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is PowerId => typeof id === "string" && !!POWER_MAP[id as PowerId]);
  } catch {
    return [];
  }
}

function writeList(key: string, list: PowerId[]) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
}

export function loadLoadout(level = 99): PowerId[] {
  const saved = readList(KEY_LOADOUT).filter((id) => isUnlocked(id, level));
  const out = [...saved];
  for (const id of DEFAULT_LOADOUT) {
    if (out.length >= LOADOUT_SIZE) break;
    if (!out.includes(id) && isUnlocked(id, level)) out.push(id);
  }
  for (const p of POWERS) {
    if (out.length >= LOADOUT_SIZE) break;
    if (!out.includes(p.id) && isUnlocked(p.id, level)) out.push(p.id);
  }
  return out.slice(0, LOADOUT_SIZE);
}

export function saveLoadout(list: PowerId[]) {
  writeList(KEY_LOADOUT, list.slice(0, LOADOUT_SIZE));
}

export function loadFavorites(): PowerId[] {
  return readList(KEY_FAVS);
}

export function saveFavorites(list: PowerId[]) {
  writeList(KEY_FAVS, list);
}

export const RARITY_FILTERS: { id: "todos" | "favoritos" | Rarity; name: string; color?: string }[] = [
  { id: "todos", name: "Todos" },
  { id: "favoritos", name: "Favoritos", color: "#fbbf24" },
  ...(Object.keys(RARITY_META) as Rarity[]).map((r) => ({
    id: r, name: RARITY_META[r].name, color: RARITY_META[r].color,
  })),
];
