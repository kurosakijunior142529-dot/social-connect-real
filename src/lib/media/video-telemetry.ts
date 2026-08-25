/**
 * Telemetria leve do player de vídeo.
 *
 * Registra eventos de travamento (`waiting`, `stalled`), quadros descartados,
 * tempo em buffer e long tasks da thread principal — tudo apenas em memória,
 * sem nenhuma UI e sem alterar o design do app.
 *
 * Inspeção rápida no console:
 *   __vibelyVideoTelemetry.dump()      // tabela dos eventos
 *   __vibelyVideoTelemetry.summary()   // resumo por vídeo
 *   __vibelyVideoTelemetry.clear()
 */

export type VideoTelemetryEvent = {
  /** ms desde o início da página */
  t: number;
  /** origem: "feed" | "reel" | outro */
  surface: string;
  /** identificador curto do vídeo */
  id: string;
  type:
    | "attach"
    | "detach"
    | "play"
    | "playing"
    | "pause"
    | "waiting"
    | "stalled"
    | "error"
    | "ended"
    | "sample"
    | "longtask";
  /** tempo acumulado em buffering (ms) */
  stallMs?: number;
  /** duração do long task (ms) */
  durationMs?: number;
  droppedVideoFrames?: number;
  totalVideoFrames?: number;
  /** segundos de buffer à frente do currentTime */
  bufferAhead?: number;
  currentTime?: number;
  readyState?: number;
  detail?: string;
};

const MAX_EVENTS = 600;
const events: VideoTelemetryEvent[] = [];
let longTaskObserver: PerformanceObserver | null = null;

export function pushVideoEvent(e: Omit<VideoTelemetryEvent, "t">) {
  const evt: VideoTelemetryEvent = { t: Math.round(performance.now()), ...e };
  events.push(evt);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  if (import.meta.env.DEV && (e.type === "waiting" || e.type === "stalled" || e.type === "longtask")) {
    console.info(`[video-telemetry] ${e.surface}/${e.id} ${e.type}`, evt);
  }
}

export function bufferAheadOf(v: HTMLVideoElement): number {
  try {
    const b = v.buffered;
    for (let i = 0; i < b.length; i++) {
      if (v.currentTime >= b.start(i) && v.currentTime <= b.end(i)) {
        return Math.max(0, b.end(i) - v.currentTime);
      }
    }
  } catch {
    /* noop */
  }
  return 0;
}

function summary() {
  const byId = new Map<
    string,
    { surface: string; waiting: number; stalled: number; stallMs: number; dropped: number; total: number; longTasks: number }
  >();
  for (const e of events) {
    const key = `${e.surface}/${e.id}`;
    const row =
      byId.get(key) ??
      { surface: e.surface, waiting: 0, stalled: 0, stallMs: 0, dropped: 0, total: 0, longTasks: 0 };
    if (e.type === "waiting") row.waiting += 1;
    if (e.type === "stalled") row.stalled += 1;
    if (e.type === "longtask") row.longTasks += 1;
    if (typeof e.stallMs === "number") row.stallMs = Math.max(row.stallMs, e.stallMs);
    if (typeof e.droppedVideoFrames === "number") row.dropped = Math.max(row.dropped, e.droppedVideoFrames);
    if (typeof e.totalVideoFrames === "number") row.total = Math.max(row.total, e.totalVideoFrames);
    byId.set(key, row);
  }
  return Object.fromEntries(byId);
}

/** Observa long tasks da thread principal (>50ms) uma única vez. */
export function ensureLongTaskObserver() {
  if (typeof window === "undefined" || longTaskObserver) return;
  if (typeof PerformanceObserver === "undefined") return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pushVideoEvent({
          surface: "main-thread",
          id: "longtask",
          type: "longtask",
          durationMs: Math.round(entry.duration),
          detail: (entry as PerformanceEntry & { name?: string }).name,
        });
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {
    longTaskObserver = null;
  }
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__vibelyVideoTelemetry"] = {
    events,
    summary,
    dump: () => {
      // eslint-disable-next-line no-console
      console.table(events);
      return events.length;
    },
    clear: () => {
      events.length = 0;
    },
  };
}
