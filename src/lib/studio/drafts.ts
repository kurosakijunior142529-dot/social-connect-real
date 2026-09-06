import type { StudioPreset, StudioProject } from "./types";
import { uid } from "./types";
import { deleteMedia } from "./media-store";

const KEY = "vibely:studio:projects";
const PRESET_KEY = "vibely:studio:presets";
const FAV_KEY = "vibely:studio:music-favorites";
const RECENT_KEY = "vibely:studio:music-recent";

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("[studio] não foi possível salvar", err);
  }
}

export function listProjects(): StudioProject[] {
  return read<StudioProject[]>(KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProject(project: StudioProject) {
  const all = read<StudioProject[]>(KEY, []);
  const next = { ...project, updatedAt: Date.now() };
  const i = all.findIndex((p) => p.id === project.id);
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  write(KEY, all.slice(0, 30));
  return next;
}

export function getProject(id: string): StudioProject | null {
  return read<StudioProject[]>(KEY, []).find((p) => p.id === id) ?? null;
}

export function duplicateProject(id: string): StudioProject | null {
  const p = getProject(id);
  if (!p) return null;
  const copy: StudioProject = {
    ...JSON.parse(JSON.stringify(p)),
    id: uid(),
    name: `${p.name} (cópia)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveProject(copy);
  return copy;
}

export async function deleteProject(id: string) {
  const all = read<StudioProject[]>(KEY, []);
  const target = all.find((p) => p.id === id);
  write(KEY, all.filter((p) => p.id !== id));
  if (target) {
    const stillUsed = new Set<string>();
    for (const p of all.filter((p) => p.id !== id)) {
      for (const c of p.clips) {
        const mid = (c as any).mediaId as string | undefined;
        if (mid) stillUsed.add(mid);
      }
    }
    const ids = target.clips
      .map((c) => (c as any).mediaId as string | undefined)
      .filter((m): m is string => !!m && !stillUsed.has(m));
    await deleteMedia(ids).catch(() => {});
  }
}

// ---------- presets ----------

export function listPresets(): StudioPreset[] {
  return read<StudioPreset[]>(PRESET_KEY, []);
}

export function savePreset(preset: StudioPreset) {
  const all = listPresets();
  const i = all.findIndex((p) => p.id === preset.id);
  if (i >= 0) all[i] = preset;
  else all.unshift(preset);
  write(PRESET_KEY, all.slice(0, 40));
}

export function deletePreset(id: string) {
  write(PRESET_KEY, listPresets().filter((p) => p.id !== id));
}

// ---------- música ----------

export function musicFavorites(): string[] {
  return read<string[]>(FAV_KEY, []);
}

export function toggleMusicFavorite(id: string) {
  const list = musicFavorites();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  write(FAV_KEY, next);
  return next;
}

export function musicRecent(): string[] {
  return read<string[]>(RECENT_KEY, []);
}

export function pushMusicRecent(id: string) {
  const next = [id, ...musicRecent().filter((x) => x !== id)].slice(0, 12);
  write(RECENT_KEY, next);
  return next;
}
