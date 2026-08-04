/**
 * Gerenciador de estado do app (web equivalente ao AppState do React Native).
 *
 * Estados: "active" | "inactive" | "background"
 *  - active     -> aba visível e com foco
 *  - inactive   -> aba visível, sem foco (outra janela por cima)
 *  - background -> aba oculta / app minimizado / tela bloqueada
 *
 * Também expõe o estado de rede (online/offline) e um helper de retry
 * com backoff exponencial usado pelas camadas de dados.
 */

export type AppLifecycleState = "active" | "inactive" | "background";

type Listener = (state: AppLifecycleState, previous: AppLifecycleState) => void;
type OnlineListener = (online: boolean) => void;

let current: AppLifecycleState = "active";
const listeners = new Set<Listener>();
const onlineListeners = new Set<OnlineListener>();
let started = false;

function compute(): AppLifecycleState {
  if (typeof document === "undefined") return "active";
  if (document.visibilityState === "hidden") return "background";
  return document.hasFocus() ? "active" : "inactive";
}

function emit() {
  const next = compute();
  if (next === current) return;
  const prev = current;
  current = next;
  listeners.forEach((l) => {
    try {
      l(next, prev);
    } catch {
      /* um listener quebrado não pode derrubar os demais */
    }
  });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  current = compute();
  document.addEventListener("visibilitychange", emit);
  window.addEventListener("focus", emit);
  window.addEventListener("blur", emit);
  window.addEventListener("pageshow", emit);
  window.addEventListener("online", () => onlineListeners.forEach((l) => l(true)));
  window.addEventListener("offline", () => onlineListeners.forEach((l) => l(false)));
}

export function getAppState(): AppLifecycleState {
  return current;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Assina mudanças de estado do app. Retorna a função de cancelamento. */
export function onAppStateChange(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Chamado sempre que o app volta de background/inactive para active. */
export function onForeground(cb: () => void): () => void {
  return onAppStateChange((state, prev) => {
    if (state === "active" && prev !== "active") cb();
  });
}

export function onOnlineChange(listener: OnlineListener): () => void {
  start();
  onlineListeners.add(listener);
  return () => onlineListeners.delete(listener);
}

/** Backoff exponencial com jitter: 400ms, 800ms, 1.6s… teto de 15s. */
export function backoffDelay(attempt: number, base = 400, max = 15_000) {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp * (0.7 + Math.random() * 0.6));
}

/** Executa `fn` com retry e backoff exponencial. Aborta cedo se estiver offline. */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return opts.timeoutMs ? await withTimeout(fn(attempt), opts.timeoutMs) : await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
    }
  }
  throw lastErr;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Tempo esgotado após ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
