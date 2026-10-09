import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RunGoal = { type: "free" } | { type: "distance"; km: number } | { type: "time"; min: number };
export type RunStats = { meters: number; ms: number; kcal: number; pace: number | null; speed: number; path: [number, number][] };
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
};

const empty = (): RunStats => ({ meters: 0, ms: 0, kcal: 0, pace: null, speed: 0, path: [] });
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
  state = { ...opts, me: empty(), other: null, status: "countdown", startedAt: Date.now() + 3000, minimized: false, gpsError: null };
  emit();

  channel = supabase.channel(`vibe-run:${opts.runId}`, { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "stats" }, ({ payload }) => {
    if (!state) return;
    set({ other: payload as RunStats });
    checkGoal();
  }).subscribe();

  setTimeout(() => {
    if (!state || state.runId !== opts.runId) return;
    set({ status: "running", startedAt: Date.now() });
    if (!("geolocation" in navigator)) { set({ gpsError: "GPS não disponível neste aparelho" }); }
    else watchId = navigator.geolocation.watchPosition(onPos, (e) => set({ gpsError: e.message || "Sem acesso ao GPS" }), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    tick = setInterval(() => {
      if (!state || state.status !== "running") return;
      const ms = Date.now() - state.startedAt;
      set({ me: { ...state.me, ms, pace: state.me.meters > 20 ? ms / 1000 / (state.me.meters / 1000) : null } });
      broadcast();
      checkGoal();
    }, 1000);
  }, 3000);
}

function onPos(pos: GeolocationPosition) {
  if (!state || state.status !== "running") return;
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  if (accuracy > 35) return; // filtra ruído
  const now = pos.timestamp;
  const me = { ...state.me };
  if (last) {
    const d = haversine([last.lat, last.lng], [lat, lng]);
    const dt = (now - last.t) / 1000;
    const v = dt > 0 ? d / dt : 0;
    if (d < 3 || v > 12) return; // parado ou salto irreal
    me.meters += d;
    me.speed = v;
    me.kcal = Math.round((me.meters / 1000) * WEIGHT_KG * (v > 2.2 ? 1.0 : 0.75));
  }
  last = { lat, lng, t: now };
  me.path = [...me.path, [lat, lng]];
  set({ me });
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
  broadcast();
  const s = state;
  stopInternal();
  onFinish?.(s);
}
export function closeRun() { stopInternal(); state = null; emit(); }
export function setMinimized(m: boolean) { set({ minimized: m }); }

export function useRun() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => null);
}
