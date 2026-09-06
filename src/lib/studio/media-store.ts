/**
 * Guarda os arquivos usados nos projetos do estúdio no IndexedDB, para que um
 * rascunho possa ser reaberto depois (fotos, vídeos, músicas e narrações).
 */

const DB = "vibely-studio";
const STORE = "media";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function putMedia(id: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMedia(id: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMedia(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    for (const id of ids) tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** cache de object URLs por id de mídia */
const urls = new Map<string, string>();

export async function mediaUrl(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return cached;
  try {
    const blob = await getMedia(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

export function cacheUrl(id: string, url: string) {
  urls.set(id, url);
}

export function releaseUrls() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}
