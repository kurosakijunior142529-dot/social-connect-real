/** Rascunho do criador de posts: dados no localStorage, arquivos no IndexedDB. */
import { deleteMedia, getMedia, putMedia } from "./studio/media-store";

export type PostDraftMeta = {
  caption: string;
  music: unknown;
  mode: string;
  poll: unknown;
  step: "compose" | "details";
  hasMain: boolean;
  extras: number;
  savedAt: number;
};

const key = (uid: string) => `vibely:post-draft:${uid}`;
const mainId = (uid: string) => `post-draft:${uid}:main`;
const extraId = (uid: string, i: number) => `post-draft:${uid}:extra:${i}`;

export function readDraftMeta(uid: string): PostDraftMeta | null {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as PostDraftMeta) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(
  uid: string,
  meta: Omit<PostDraftMeta, "savedAt" | "hasMain" | "extras">,
  main: File | null,
  extras: File[],
  filesChanged: boolean,
) {
  const prev = readDraftMeta(uid);
  if (filesChanged) {
    if (main) await putMedia(mainId(uid), main).catch(() => {});
    for (let i = 0; i < extras.length; i++) await putMedia(extraId(uid, i), extras[i]).catch(() => {});
    const stale: string[] = [];
    if (!main) stale.push(mainId(uid));
    for (let i = extras.length; i < (prev?.extras ?? 0); i++) stale.push(extraId(uid, i));
    await deleteMedia(stale).catch(() => {});
  }
  const next: PostDraftMeta = { ...meta, hasMain: !!main, extras: extras.length, savedAt: Date.now() };
  try {
    localStorage.setItem(key(uid), JSON.stringify(next));
  } catch {}
}

export async function loadDraftFiles(uid: string, meta: PostDraftMeta) {
  const toFile = (b: Blob | null, i: number) =>
    !b ? null : b instanceof File ? b : new File([b], `midia-${i}`, { type: b.type });
  const main = meta.hasMain ? toFile(await getMedia(mainId(uid)).catch(() => null), 0) : null;
  const extras: File[] = [];
  for (let i = 0; i < meta.extras; i++) {
    const f = toFile(await getMedia(extraId(uid, i)).catch(() => null), i + 1);
    if (f) extras.push(f);
  }
  return { main, extras };
}

export async function clearDraft(uid: string) {
  const prev = readDraftMeta(uid);
  try {
    localStorage.removeItem(key(uid));
  } catch {}
  const ids = [mainId(uid)];
  for (let i = 0; i < Math.max(prev?.extras ?? 0, 10); i++) ids.push(extraId(uid, i));
  await deleteMedia(ids).catch(() => {});
}
