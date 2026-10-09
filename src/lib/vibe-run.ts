import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RunGoal = { type: "free" } | { type: "distance"; km: number } | { type: "time"; min: number };
export type RunStats = { meters: number; ms: number; kcal: number; pace: number | null; speed: number; maxSpeed?: number; path: [number, number][] };
export type RunState = {
  runId: string;
  conversationId: string;
  goal: RunGoal;
  me: RunStats;
  other: RunStats | null;
  status: "countdown" | "running" | "finished";
  startedAt: number;
  minimized: boolean;
  gpsError: string | null;
  gpsAccuracy: number | null;
  overtakeAt: number;
};

const empty = (): RunStats => ({ meters: 0, ms: 0, kcal: 0, pace: null, speed: 0, maxSpeed: 0, path: [] });
const WEIGHT_KG = 70;

let state: RunState | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (patch: Partial<RunState>) => { if (state) { state = { ...state, ...patch }; emit(); } };

let watchId: number | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let last: { lat: number; lng: number; t: number } | null = null;
let onFinish: ((s: RunState) => void) | null = null;
let globalFinish: ((s: RunState) => void) | null = null;
export function setRunFinishHandler(f: (s: RunState) => void) { globalFinish = f; }

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function goalLabel(g: RunGoal) {
  return g.type === "distance" ? `Meta: ${g.km} km` : g.type === "time" ? `Meta: ${g.min} min` : "Corrida livre";
}
export function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function fmtPace(p: number | null) {
  if (!p || !isFinite(p) || p > 3600) return "--'--\"";
  return `${Math.floor(p / 60)}'${String(Math.round(p % 60)).padStart(2, "0")}"`;
}

function broadcast() {
  if (!state || !channel) return;
  const { me } = state;
  channel.send({ type: "broadcast", event: "stats", payload: { ...me, path: me.path.slice(-200), status: state.status } });
}

function checkGoal() {
  if (!state || state.status !== "running") return;
  const g = state.goal;
  const lead = Math.max(state.me.meters, state.other?.meters ?? 0);
  if ((g.type === "distance" && lead >= g.km * 1000) || (g.type === "time" && state.me.ms >= g.min * 60000)) finishRun();
}

export function startRun(opts: { runId: string; conversationId: string; goal: RunGoal; onFinish?: (s: RunState) => void }) {
  if (state && state.runId === opts.runId) { set({ minimized: false }); return; }
  stopInternal();
  onFinish = opts.onFinish ?? null;
  state = { ...opts, me: empty(), other: null, status: "countdown", startedAt: Date.now() + 4000, minimized: false, gpsError: null, gpsAccuracy: null, overtakeAt: 0 };
  countdownBeeps();
  emit();

  channel = supabase.channel(`vibe-run:${opts.runId}`, { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "stats" }, ({ payload }) => {
    if (!state) return;
    const prevLead = state.me.meters >= (state.other?.meters ?? 0);
    const other = payload as RunStats;
    set({ other });
    leadCheck(prevLead);
    checkGoal();
  }).subscribe();

  setTimeout(() => {
    if (!state || state.runId !== opts.runId) return;
    set({ status: "running", startedAt: Date.now() });
    if (!("geolocation" in navigator)) { set({ gpsError: "GPS não disponível neste aparelho" }); }
    else {
      const err = (e: GeolocationPositionError) => set({ gpsError: e.code === 1 ? "Sem acesso ao GPS" : null });
      navigator.geolocation.getCurrentPosition(onPos, err, { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 });
      watchId = navigator.geolocation.watchPosition(onPos, err, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    }
    tick = setInterval(() => {
      if (!state || state.status !== "running") return;
      const ms = Date.now() - state.startedAt;
      set({ me: { ...state.me, ms, pace: state.me.meters > 20 ? ms / 1000 / (state.me.meters / 1000) : null } });
      broadcast();
      checkGoal();
    }, 1000);
  }, 4000);
}

function onPos(pos: GeolocationPosition) {
  if (!state || state.status !== "running") return;
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  set({ gpsAccuracy: accuracy });
  // primeiro ponto aceita sinal moderado para o mapa aparecer logo
  if (!last) {
    if (accuracy > 150) return;
    last = { lat, lng, t: pos.timestamp };
    set({ me: { ...state.me, path: [...state.me.path, [lat, lng]] } });
    return;
  }
  if (accuracy > 50) return; // filtra ruído
  const now = pos.timestamp;
  const me = { ...state.me };
  const prevLead = state.other ? me.meters >= state.other.meters : true;
  if (last) {
    const d = haversine([last.lat, last.lng], [lat, lng]);
    const dt = (now - last.t) / 1000;
    const v = dt > 0 ? d / dt : 0;
    if (d < 3 || v > 12) return; // parado ou salto irreal
    me.meters += d;
    me.speed = v;
    me.maxSpeed = Math.max(me.maxSpeed ?? 0, v);
    me.kcal = Math.round((me.meters / 1000) * WEIGHT_KG * (v > 2.2 ? 1.0 : 0.75));
  }
  last = { lat, lng, t: now };
  me.path = [...me.path, [lat, lng]];
  set({ me });
  leadCheck(prevLead);
}

function stopInternal() {
  if (watchId != null) navigator.geolocation?.clearWatch(watchId);
  if (tick) clearInterval(tick);
  if (channel) supabase.removeChannel(channel);
  watchId = null; tick = null; channel = null; last = null;
}

export function finishRun() {
  if (!state || state.status === "finished") return;
  set({ status: "finished", minimized: false });
  tone(660, 0.15); setTimeout(() => tone(880, 0.15), 160); setTimeout(() => tone(1320, 0.35), 320);
  broadcast();
  const s = state;
  stopInternal();
  (onFinish ?? globalFinish)?.(s);
}
export function closeRun() { stopInternal(); state = null; emit(); }
export function setMinimized(m: boolean) { set({ minimized: m }); }

export function useRun() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => null);
}

// ---- Sons e vibração ----
let ctx: AudioContext | null = null;
function tone(freq: number, dur: number) {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
  } catch { /* sem áudio */ }
}
function countdownBeeps() {
  [0, 1000, 2000].forEach((t) => setTimeout(() => tone(440, 0.12), t));
  setTimeout(() => tone(880, 0.4), 3000);
}
function leadCheck(prevLead: boolean) {
  if (!state?.other || state.status !== "running") return;
  const nowLead = state.me.meters >= state.other.meters;
  if (nowLead !== prevLead && Math.abs(state.me.meters - state.other.meters) > 2) {
    set({ overtakeAt: Date.now() });
    if (nowLead) { tone(784, 0.12); setTimeout(() => tone(1046, 0.2), 130); }
    try { navigator.vibrate?.(nowLead ? [60, 40, 60] : 120); } catch { /* */ }
  }
}
