// Camada de sincronização independente do serviço de streaming.
// HOST -> WatchPartySync -> participantes.

export type SyncEvent =
  | { type: "PLAY"; roomId: string; timestamp: number; currentTime: number }
  | { type: "PAUSE"; roomId: string; timestamp: number; currentTime: number }
  | { type: "SEEK"; roomId: string; timestamp: number; currentTime: number }
  | { type: "RATE"; roomId: string; timestamp: number; currentTime: number; playbackRate: number };

export type SyncStatus = "connected" | "syncing" | "synced" | "disconnected";

/** Diferença tolerada entre host e participante, em segundos. */
export const SYNC_TOLERANCE = 0.75;

/** Posição esperada agora, considerando o tempo desde a última atualização. */
export function expectedPosition(opts: {
  positionSec: number;
  playing: boolean;
  updatedAt: string | number | Date;
  playbackRate?: number;
}) {
  const since = (Date.now() - new Date(opts.updatedAt).getTime()) / 1000;
  if (!opts.playing) return opts.positionSec;
  return opts.positionSec + since * (opts.playbackRate ?? 1);
}

/** Decide se o participante precisa de correção de posição. */
export function needsCorrection(current: number, expected: number) {
  return Math.abs(current - expected) > SYNC_TOLERANCE;
}
