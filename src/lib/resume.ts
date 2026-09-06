// "Continuar de onde parou": guarda a última tela relevante em que a pessoa esteve.
const KEY = "vibely:resume";
const MAX_AGE = 24 * 60 * 60 * 1000;

export type ResumePoint = { path: string; label: string; at: number };

function labelFor(pathname: string): string | null {
  if (pathname.startsWith("/reels")) return "Voltar para os Reels";
  if (/^\/messages\/[^/]+$/.test(pathname)) return "Voltar para a conversa";
  if (/^\/chats\/[^/]+$/.test(pathname)) return "Voltar para o grupo";
  if (/^\/watch\/[^/]+$/.test(pathname)) return "Voltar para a sala";
  if (/^\/live\/[^/]+$/.test(pathname)) return "Voltar para a live";
  if (pathname.startsWith("/ai")) return "Voltar para a Vibely AI";
  if (pathname.startsWith("/create/studio")) return "Voltar para o Studio";
  return null;
}

export function trackResume(pathname: string) {
  if (typeof window === "undefined") return;
  const label = labelFor(pathname);
  if (!label) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path: pathname, label, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function readResume(): ResumePoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const point = JSON.parse(raw) as ResumePoint;
    if (!point?.path || Date.now() - point.at > MAX_AGE) return null;
    return point;
  } catch {
    return null;
  }
}

export function clearResume() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
