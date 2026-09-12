/**
 * VIR — Vibely Intelligence Ranking (cliente)
 *
 * Aqui só existe registro de sinais e leitura do feed já ordenado.
 * Toda a pontuação, anti-fraude, distribuição e configuração ficam no
 * backend (funções `vir_*` no banco), nunca no navegador.
 */
import { useEffect, useRef, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VirEvent =
  | "impression"
  | "video_start"
  | "watch_25"
  | "watch_50"
  | "watch_75"
  | "video_complete"
  | "replay"
  | "like"
  | "unlike"
  | "comment"
  | "share"
  | "save"
  | "unsave"
  | "follow"
  | "unfollow"
  | "profile_visit"
  | "search"
  | "skip"
  | "not_interested"
  | "report"
  | "hide";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Envia um sinal para o VIR sem bloquear a interface. */
export function logVir(
  postId: string | null,
  event: VirEvent,
  value = 0,
  source = "reels",
) {
  void rpc("vir_log_event", {
    _post_id: postId,
    _event: event,
    _value: Math.round(value),
    _source: source,
  }).then(() => {}, () => {});
}

/** "Não tenho interesse": esconde o post e ensina o algoritmo. */
export async function virNotInterested(postId: string) {
  await rpc("vir_not_interested", { _post_id: postId });
}

export type VirFeedRow = {
  post_id: string;
  author_id: string;
  score: number;
  reason: string;
  source: string;
};

/** Lista ordenada de recomendações vinda do backend. */
export async function fetchVirFeed(limit = 12, offset = 0, kind = "reel") {
  const { data, error } = await rpc("vir_feed", {
    _limit: limit,
    _offset: offset,
    _kind: kind,
  });
  if (error) return [] as VirFeedRow[];
  return (data ?? []) as VirFeedRow[];
}

/**
 * Acompanha a reprodução de um vídeo e envia os sinais de retenção.
 * Não altera nada do player — só escuta.
 */
export function useVirWatch(
  ref: RefObject<HTMLVideoElement | null>,
  active: boolean,
  postId: string,
) {
  const state = useRef({
    impression: false,
    started: false,
    m25: false,
    m50: false,
    m75: false,
    completed: false,
    maxRatio: 0,
    watchedMs: 0,
    lastTime: 0,
  });

  useEffect(() => {
    if (!active) return;
    const s = state.current;
    if (!s.impression) {
      s.impression = true;
      logVir(postId, "impression");
    }
    const v = ref.current;
    if (!v) return;

    const onPlay = () => {
      if (!s.started) {
        s.started = true;
        logVir(postId, "video_start");
      }
    };

    const onTime = () => {
      const d = v.duration;
      if (!d || !isFinite(d)) return;
      const t = v.currentTime;
      if (t > s.lastTime) s.watchedMs += (t - s.lastTime) * 1000;
      // reinício do loop depois de assistir quase tudo = replay
      if (t < s.lastTime - 0.5 && s.maxRatio >= 0.9) {
        logVir(postId, "replay", s.watchedMs);
        s.m25 = s.m50 = s.m75 = s.completed = false;
      }
      s.lastTime = t;
      const ratio = t / d;
      if (ratio > s.maxRatio) s.maxRatio = ratio;
      if (!s.m25 && ratio >= 0.25) { s.m25 = true; logVir(postId, "watch_25", s.watchedMs); }
      if (!s.m50 && ratio >= 0.5) { s.m50 = true; logVir(postId, "watch_50", s.watchedMs); }
      if (!s.m75 && ratio >= 0.75) { s.m75 = true; logVir(postId, "watch_75", s.watchedMs); }
      if (!s.completed && ratio >= 0.95) {
        s.completed = true;
        logVir(postId, "video_complete", s.watchedMs);
      }
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTime);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTime);
      // saiu cedo demais: sinal negativo suave
      if (s.started && s.maxRatio < 0.25) logVir(postId, "skip", s.watchedMs);
      s.lastTime = 0;
    };
  }, [active, postId, ref]);
}
