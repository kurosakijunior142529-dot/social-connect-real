import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ARENAS,
  BALL_SKINS,
  FIELD,
  PADDLE_SKINS,
  POWER_MAP,
  POWERS,
  type PowerId,
} from "@/lib/pong/config";

/* ------------------------------------------------------------------ */
/* tipos                                                               */
/* ------------------------------------------------------------------ */

export type Phase = "lobby" | "countdown" | "playing" | "point" | "over";

export type Fx = {
  gravity: number;
  portal: number;
  clone: number;
  magnet: number;
  speed: number;
  reflex: number;
  shield: number;
  shieldUsed: boolean;
  /** aplicados no adversário */
  freeze: number;
  shrink: number;
  ghost: number;
  /** próprios */
  wall: number;
  fury: number;
};

const emptyFx = (): Fx => ({
  gravity: 0, portal: 0, clone: 0, magnet: 0, speed: 0, reflex: 0,
  shield: 0, shieldUsed: false, freeze: 0, shrink: 0, ghost: 0, wall: 0, fury: 0,
});

const mergeFx = (f: Partial<Fx> | undefined): Fx => ({ ...emptyFx(), ...(f ?? {}) });

type Snap = { t: number; bx: number; by: number; vx: number; vy: number; p0: number; p1: number; s0: number; s1: number };

type Sim = {
  bx: number; by: number; vx: number; vy: number;
  p0: number; p1: number;
  s0: number; s1: number;
  phase: Phase;
  timer: number;
  serveTo: 0 | 1;
  fx: [Fx, Fx];
  /** histórico só do host, para o poder do Tempo */
  hist: Snap[];
  clock: number;
  rewindAt: number;
};

export type Peer = { id: string; name: string; avatar: string | null; joinedAt: number; power: PowerId | null; ready: boolean };

export type Impact = { x: number; y: number; t: number; color: string; big?: boolean; kind?: "hit" | "goal" | "power" | "rewind" };

/* ------------------------------------------------------------------ */
/* áudio simples (WebAudio, sem assets)                                */
/* ------------------------------------------------------------------ */

let actx: AudioContext | null = null;
function beep(freq: number, dur = 0.07, type: OscillatorType = "sine", gain = 0.05) {
  try {
    if (typeof window === "undefined") return;
    actx = actx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (actx.state === "suspended") void actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(actx.destination);
    const now = actx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now);
    o.stop(now + dur);
  } catch {
    /* silencioso */
  }
}
function sweep(from: number, to: number, dur = 0.5, gain = 0.05) {
  try {
    if (typeof window === "undefined") return;
    actx = actx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (actx.state === "suspended") void actx.resume();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = "sawtooth";
    const now = actx.currentTime;
    o.frequency.setValueAtTime(from, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + dur);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(actx.destination);
    o.start(now);
    o.stop(now + dur);
  } catch {
    /* silencioso */
  }
}

/* ------------------------------------------------------------------ */
/* motor                                                               */
/* ------------------------------------------------------------------ */

function serve(sim: Sim, to: 0 | 1) {
  sim.bx = FIELD.w / 2;
  sim.by = FIELD.h / 2;
  const angle = (Math.random() * 0.7 - 0.35) + (to === 0 ? Math.PI / 2 : -Math.PI / 2);
  sim.vx = Math.cos(angle) * FIELD.baseSpeed;
  sim.vy = Math.sin(angle) * FIELD.baseSpeed;
  sim.serveTo = to;
}

export function newSim(): Sim {
  const sim: Sim = {
    bx: FIELD.w / 2, by: FIELD.h / 2, vx: 0, vy: 0,
    p0: FIELD.w / 2, p1: FIELD.w / 2,
    s0: 0, s1: 0,
    phase: "lobby", timer: 0, serveTo: 0,
    fx: [emptyFx(), emptyFx()],
    hist: [], clock: 0, rewindAt: 0,
  };
  serve(sim, 0);
  return sim;
}

function decay(fx: Fx, dt: number) {
  fx.gravity = Math.max(0, fx.gravity - dt);
  fx.portal = Math.max(0, fx.portal - dt);
  fx.clone = Math.max(0, fx.clone - dt);
  fx.magnet = Math.max(0, fx.magnet - dt);
  fx.speed = Math.max(0, fx.speed - dt);
  fx.reflex = Math.max(0, fx.reflex - dt);
  fx.freeze = Math.max(0, fx.freeze - dt);
  fx.shrink = Math.max(0, fx.shrink - dt);
  fx.ghost = Math.max(0, fx.ghost - dt);
  fx.wall = Math.max(0, fx.wall - dt);
  fx.fury = Math.max(0, fx.fury - dt);
  const before = fx.shield;
  fx.shield = Math.max(0, fx.shield - dt);
  if (before > 0 && fx.shield === 0) fx.shieldUsed = false;
}

export function paddleHalf(fx: Fx) {
  let h = FIELD.paddleHalf;
  if (fx.magnet > 0) h *= 1.55;
  if (fx.shrink > 0) h *= 0.55;
  return h;
}

/** posição Y da muralha de cada lado */
export function wallY(side: 0 | 1) {
  return side === 0 ? FIELD.h - FIELD.paddleInset - 0.17 : FIELD.paddleInset + 0.17;
}
export function cloneY(side: 0 | 1) {
  return side === 0 ? FIELD.h - FIELD.paddleInset - 0.24 : FIELD.paddleInset + 0.24;
}

/** avança a simulação (só o host executa) */
function step(sim: Sim, dt: number, onImpact: (i: Impact) => void) {
  decay(sim.fx[0], dt);
  decay(sim.fx[1], dt);

  if (sim.phase === "countdown" || sim.phase === "point" || sim.phase === "over") {
    sim.timer -= dt;
    if (sim.timer <= 0) {
      if (sim.phase === "countdown") {
        sim.phase = "playing";
      } else if (sim.phase === "point") {
        sim.phase = "playing";
        serve(sim, sim.serveTo);
      }
    }
    if (sim.phase !== "playing") return;
  }
  if (sim.phase !== "playing") return;

  sim.clock += dt;
  const lastSnap = sim.hist[sim.hist.length - 1];
  if (!lastSnap || sim.clock - lastSnap.t > 0.1) {
    sim.hist.push({ t: sim.clock, bx: sim.bx, by: sim.by, vx: sim.vx, vy: sim.vy, p0: sim.p0, p1: sim.p1, s0: sim.s0, s1: sim.s1 });
    while (sim.hist.length && sim.clock - sim.hist[0].t > 14) sim.hist.shift();
  }

  const sub = 3;
  const h = dt / sub;

  for (let i = 0; i < sub; i++) {
    // gravidade: puxa a bola para os cantos do lado adversário
    for (const side of [0, 1] as const) {
      if (sim.fx[side].gravity > 0) {
        const pull = side === 0 ? -1 : 1; // empurra para o campo do rival
        sim.vy += pull * 0.5 * h;
        sim.vx += (sim.bx < FIELD.w / 2 ? -0.45 : 0.45) * h;
      }
    }

    const prevY = sim.by;
    sim.bx += sim.vx * h;
    sim.by += sim.vy * h;

    // paredes laterais
    if (sim.bx < FIELD.ballR) { sim.bx = FIELD.ballR; sim.vx = Math.abs(sim.vx); beep(320, 0.04, "triangle", 0.03); onImpact({ x: sim.bx, y: sim.by, t: performance.now(), color: "#ffffff", kind: "hit" }); }
    if (sim.bx > FIELD.w - FIELD.ballR) { sim.bx = FIELD.w - FIELD.ballR; sim.vx = -Math.abs(sim.vx); beep(320, 0.04, "triangle", 0.03); onImpact({ x: sim.bx, y: sim.by, t: performance.now(), color: "#ffffff", kind: "hit" }); }

    // portal: espelha ao cruzar o meio
    const portalOn = sim.fx[0].portal > 0 || sim.fx[1].portal > 0;
    if (portalOn && ((prevY < FIELD.h / 2 && sim.by >= FIELD.h / 2) || (prevY > FIELD.h / 2 && sim.by <= FIELD.h / 2))) {
      sim.bx = FIELD.w - sim.bx;
      sim.vx = -sim.vx;
      onImpact({ x: sim.bx, y: FIELD.h / 2, t: performance.now(), color: "#a855f7", kind: "power" });
      beep(660, 0.09, "sawtooth", 0.04);
    }

    const y0 = FIELD.h - FIELD.paddleInset;
    const y1 = FIELD.paddleInset;

    const hit = (px: number, fx: Fx, dir: 1 | -1, py: number, wide = false) => {
      const half = wide ? FIELD.w : paddleHalf(fx);
      if (Math.abs(sim.bx - px) > half + FIELD.ballR) return false;
      let boost = fx.reflex > 0 ? 1.35 : 1.04;
      let fury = false;
      if (fx.fury > 0 && !wide) { boost *= 1.8; fx.fury = 0; fury = true; }
      const off = wide ? (sim.bx - FIELD.w / 2) / (FIELD.w / 2) : (sim.bx - px) / half;
      const speed = Math.min(FIELD.maxSpeed * (fury ? 1.5 : 1), Math.hypot(sim.vx, sim.vy) * boost);
      const angle = fx.reflex > 0 ? off * 0.5 : off * 0.9;
      sim.vx = Math.sin(angle) * speed;
      sim.vy = dir * Math.abs(Math.cos(angle) * speed);
      sim.by = py + dir * (FIELD.ballR + FIELD.paddleH * 0.6);
      onImpact({
        x: sim.bx, y: py, t: performance.now(),
        color: fury ? "#f97316" : fx.reflex > 0 ? "#fbbf24" : wide ? "#a3a3a3" : "#ffffff",
        big: fury, kind: "hit",
      });
      beep(fury ? 900 : fx.reflex > 0 ? 720 : 480, fury ? 0.12 : 0.06, "square", 0.05);
      return true;
    };

    // raquete de baixo (jogador 0)
    if (sim.vy > 0 && sim.by + FIELD.ballR >= y0 && prevY + FIELD.ballR <= y0 + 0.06) hit(sim.p0, sim.fx[0], -1, y0);
    if (sim.fx[0].clone > 0 && sim.vy > 0) {
      const cy = cloneY(0);
      if (sim.by + FIELD.ballR >= cy && prevY + FIELD.ballR <= cy + 0.05) hit(sim.p0, sim.fx[0], -1, cy);
    }
    if (sim.fx[0].wall > 0 && sim.vy > 0) {
      const wy = wallY(0);
      if (sim.by + FIELD.ballR >= wy && prevY + FIELD.ballR <= wy + 0.05) hit(FIELD.w / 2, sim.fx[0], -1, wy, true);
    }
    // raquete de cima (jogador 1)
    if (sim.vy < 0 && sim.by - FIELD.ballR <= y1 && prevY - FIELD.ballR >= y1 - 0.06) hit(sim.p1, sim.fx[1], 1, y1);
    if (sim.fx[1].clone > 0 && sim.vy < 0) {
      const cy = cloneY(1);
      if (sim.by - FIELD.ballR <= cy && prevY - FIELD.ballR >= cy - 0.05) hit(sim.p1, sim.fx[1], 1, cy);
    }
    if (sim.fx[1].wall > 0 && sim.vy < 0) {
      const wy = wallY(1);
      if (sim.by - FIELD.ballR <= wy && prevY - FIELD.ballR >= wy - 0.05) hit(FIELD.w / 2, sim.fx[1], 1, wy, true);
    }

    // pontos / escudo
    if (sim.by > FIELD.h + 0.05) {
      if (sim.fx[0].shield > 0 && !sim.fx[0].shieldUsed) {
        sim.fx[0].shieldUsed = true;
        sim.by = FIELD.h - 0.06;
        sim.vy = -Math.abs(sim.vy);
        onImpact({ x: sim.bx, y: FIELD.h - 0.04, t: performance.now(), color: "#22d3ee", big: true, kind: "power" });
        beep(220, 0.18, "sine", 0.06);
      } else {
        sim.s1 += 1;
        onImpact({ x: sim.bx, y: FIELD.h, t: performance.now(), color: "#f87171", big: true, kind: "goal" });
        beep(180, 0.2, "sawtooth", 0.05);
        sim.phase = sim.s1 >= FIELD.winScore ? "over" : "point";
        sim.timer = 1.3;
        sim.serveTo = 0;
      }
    } else if (sim.by < -0.05) {
      if (sim.fx[1].shield > 0 && !sim.fx[1].shieldUsed) {
        sim.fx[1].shieldUsed = true;
        sim.by = 0.06;
        sim.vy = Math.abs(sim.vy);
        onImpact({ x: sim.bx, y: 0.04, t: performance.now(), color: "#22d3ee", big: true, kind: "power" });
        beep(220, 0.18, "sine", 0.06);
      } else {
        sim.s0 += 1;
        onImpact({ x: sim.bx, y: 0, t: performance.now(), color: "#4ade80", big: true, kind: "goal" });
        beep(880, 0.16, "triangle", 0.05);
        sim.phase = sim.s0 >= FIELD.winScore ? "over" : "point";
        sim.timer = 1.3;
        sim.serveTo = 1;
      }
    }
  }
}

function applyPower(sim: Sim, side: 0 | 1, id: PowerId, onImpact?: (i: Impact) => void) {
  const fx = sim.fx[side];
  const foe = sim.fx[side === 0 ? 1 : 0];
  const def = POWER_MAP[id];
  if (!def) return;
  switch (id) {
    case "teleport": {
      const cur = side === 0 ? sim.p0 : sim.p1;
      const target = Math.max(0.05, Math.min(FIELD.w - 0.05, sim.bx));
      const dx = Math.max(-0.35, Math.min(0.35, target - cur));
      if (side === 0) sim.p0 = cur + dx; else sim.p1 = cur + dx;
      break;
    }
    case "rewind": {
      const target = sim.clock - 10;
      let snap: Snap | null = null;
      for (const s of sim.hist) { if (s.t <= target) snap = s; }
      snap = snap ?? sim.hist[0] ?? null;
      if (snap) {
        sim.bx = snap.bx; sim.by = snap.by; sim.vx = snap.vx; sim.vy = snap.vy;
        sim.p0 = snap.p0; sim.p1 = snap.p1;
        sim.s0 = snap.s0; sim.s1 = snap.s1;
        sim.hist = sim.hist.filter((s) => s.t <= snap!.t);
        sim.clock = snap.t;
      }
      sim.rewindAt = performance.now();
      onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: "#facc15", big: true, kind: "rewind" });
      sweep(1200, 120, 0.7, 0.05);
      return;
    }
    case "gravity": fx.gravity = def.duration; break;
    case "portal": fx.portal = def.duration; break;
    case "clone": fx.clone = def.duration; break;
    case "magnet": fx.magnet = def.duration; break;
    case "speed": fx.speed = def.duration; break;
    case "reflex": fx.reflex = def.duration; break;
    case "wall": fx.wall = def.duration; break;
    case "fury": fx.fury = def.duration; break;
    case "shield": fx.shield = def.duration; fx.shieldUsed = false; break;
    case "freeze": foe.freeze = def.duration; break;
    case "shrink": foe.shrink = def.duration; break;
    case "ghost": fx.ghost = def.duration; break;
  }
  beep(540, 0.12, "sawtooth", 0.05);
}

/* ------------------------------------------------------------------ */
/* hook de rede + jogo                                                 */
/* ------------------------------------------------------------------ */

export function usePongMatch(room: string, me: { id: string; name: string; avatar: string | null }) {
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [countdown, setCountdown] = useState(0);
  const [fxView, setFxView] = useState<[Fx, Fx]>([emptyFx(), emptyFx()]);
  const [myPower, setMyPower] = useState<PowerId | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [opponentGone, setOpponentGone] = useState(false);
  const [lag, setLag] = useState(0);

  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const simRef = useRef<Sim>(newSim());
  const targetRef = useRef<number>(FIELD.w / 2);
  const impactsRef = useRef<Impact[]>([]);
  const lastRemoteRef = useRef<number>(0);
  const cooldownUntilRef = useRef<number>(0);
  const myPowerRef = useRef<PowerId | null>(null);
  const meRef = useRef(me);
  meRef.current = me;

  const sorted = useMemo(
    () => Object.values(peers).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).slice(0, 2),
    [peers],
  );
  const mySide: 0 | 1 = sorted[0]?.id === me.id ? 0 : 1;
  const isHost = mySide === 0;
  const opponent = sorted.find((p) => p.id !== me.id) ?? null;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const mySideRef = useRef(mySide);
  mySideRef.current = mySide;

  const pushImpact = useCallback((i: Impact) => {
    impactsRef.current.push(i);
    if (impactsRef.current.length > 40) impactsRef.current.shift();
  }, []);

  /* ---------------- canal realtime ---------------- */
  useEffect(() => {
    const ch = supabase.channel(`pong:${room}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    chRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const raw = ch.presenceState() as Record<string, any[]>;
      const next: Record<string, Peer> = {};
      for (const [id, arr] of Object.entries(raw)) {
        const m = arr[0] ?? {};
        next[id] = {
          id,
          name: m.name ?? "Jogador",
          avatar: m.avatar ?? null,
          joinedAt: m.joinedAt ?? 0,
          power: m.power ?? null,
          ready: !!m.ready,
        };
      }
      setPeers(next);
      setOpponentGone(false);
    });

    ch.on("broadcast", { event: "s" }, ({ payload }) => {
      lastRemoteRef.current = performance.now();
      if (isHostRef.current) return;
      const s = simRef.current;
      const p = payload as any;
      s.bx = p.bx; s.by = p.by; s.vx = p.vx; s.vy = p.vy;
      s.p0 = p.p0;
      if (mySideRef.current !== 1) s.p1 = p.p1;
      s.s0 = p.s0; s.s1 = p.s1;
      s.phase = p.ph;
      s.timer = p.tm;
      s.fx = [mergeFx(p.fx?.[0]), mergeFx(p.fx?.[1])];
      if (p.rw && p.rw !== s.rewindAt) { s.rewindAt = performance.now(); }
      setPhase(p.ph);
      setScore([p.s0, p.s1]);
      setCountdown(p.ph === "countdown" ? Math.max(0, Math.ceil(p.tm)) : 0);
      setFxView(s.fx);
      if (typeof p.t === "number") setLag(Math.max(0, Math.round(Date.now() - p.t)));
    });

    ch.on("broadcast", { event: "p" }, ({ payload }) => {
      // posição da raquete do convidado (só o host consome)
      if (!isHostRef.current) return;
      simRef.current.p1 = payload.x;
    });

    ch.on("broadcast", { event: "pw" }, ({ payload }) => {
      if (!isHostRef.current) return;
      applyPower(simRef.current, 1, payload.id as PowerId, pushImpact);
      pushImpact({ x: simRef.current.p1, y: FIELD.paddleInset, t: performance.now(), color: POWER_MAP[payload.id as PowerId]?.color ?? "#fff", big: true, kind: "power" });
    });

    ch.on("broadcast", { event: "start" }, () => {
      const s = simRef.current;
      s.s0 = 0; s.s1 = 0; s.fx = [emptyFx(), emptyFx()];
      s.phase = "countdown"; s.timer = 3;
      s.hist = []; s.clock = 0;
      serve(s, 0);
      setPhase("countdown");
      setScore([0, 0]);
    });

    ch.on("broadcast", { event: "bye" }, () => setOpponentGone(true));

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await ch.track({
          name: meRef.current.name,
          avatar: meRef.current.avatar,
          joinedAt: Date.now(),
          power: myPowerRef.current,
          ready: false,
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnected(false);
      }
    });

    return () => {
      try { ch.send({ type: "broadcast", event: "bye", payload: {} }); } catch { /* ignore */ }
      supabase.removeChannel(ch);
      chRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, me.id]);

  /* ---------------- loop principal ---------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sendAcc = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      const side = mySideRef.current;

      // movimento da própria raquete (previsão local para ambos)
      const fxMe = sim.fx[side] ?? emptyFx();
      if (fxMe.freeze <= 0) {
        const spd = FIELD.paddleSpeed * (fxMe.speed > 0 ? 1.7 : 1);
        const cur = side === 0 ? sim.p0 : sim.p1;
        const half = paddleHalf(fxMe);
        const tgt = Math.max(half, Math.min(FIELD.w - half, targetRef.current));
        const d = tgt - cur;
        const move = Math.sign(d) * Math.min(Math.abs(d), spd * dt);
        const nx = cur + move;
        if (side === 0) sim.p0 = nx; else sim.p1 = nx;
      }

      if (isHostRef.current) {
        acc += dt;
        let guard = 0;
        while (acc > 1 / 120 && guard++ < 12) {
          step(sim, 1 / 120, pushImpact);
          acc -= 1 / 120;
        }
        setPhase(sim.phase);
        setScore([sim.s0, sim.s1]);
        setCountdown(sim.phase === "countdown" ? Math.max(0, Math.ceil(sim.timer)) : 0);
        setFxView([{ ...sim.fx[0] }, { ...sim.fx[1] }]);

        sendAcc += dt;
        if (sendAcc >= 0.04) {
          sendAcc = 0;
          chRef.current?.send({
            type: "broadcast",
            event: "s",
            payload: {
              bx: sim.bx, by: sim.by, vx: sim.vx, vy: sim.vy,
              p0: sim.p0, p1: sim.p1, s0: sim.s0, s1: sim.s1,
              ph: sim.phase, tm: sim.timer, fx: sim.fx, rw: sim.rewindAt, t: Date.now(),
            },
          });
        }
      } else {
        // extrapolação suave da bola entre snapshots
        if (sim.phase === "playing") {
          sim.bx += sim.vx * dt;
          sim.by += sim.vy * dt;
        }
        sendAcc += dt;
        if (sendAcc >= 0.04) {
          sendAcc = 0;
          chRef.current?.send({ type: "broadcast", event: "p", payload: { x: sim.p1 } });
        }
      }

      const cd = Math.max(0, (cooldownUntilRef.current - Date.now()) / 1000);
      setCooldown(cd);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pushImpact]);

  /* ---------------- detecção de queda ---------------- */
  useEffect(() => {
    const t = setInterval(() => {
      if (!isHostRef.current && lastRemoteRef.current && performance.now() - lastRemoteRef.current > 4000) {
        setConnected(false);
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------------- ações ---------------- */
  const setTarget = useCallback((x: number) => { targetRef.current = x; }, []);

  const choosePower = useCallback((id: PowerId | null) => {
    setMyPower(id);
    myPowerRef.current = id;
    void chRef.current?.track({
      name: meRef.current.name, avatar: meRef.current.avatar,
      joinedAt: peers[me.id]?.joinedAt ?? Date.now(), power: id, ready: !!id,
    });
  }, [peers, me.id]);

  const usePower = useCallback(() => {
    const id = myPowerRef.current;
    if (!id) return;
    if (Date.now() < cooldownUntilRef.current) return;
    if (simRef.current.phase !== "playing") return;
    cooldownUntilRef.current = Date.now() + POWER_MAP[id].cooldown * 1000;
    if (isHostRef.current) {
      applyPower(simRef.current, 0, id, pushImpact);
      pushImpact({ x: simRef.current.p0, y: FIELD.h - FIELD.paddleInset, t: performance.now(), color: POWER_MAP[id].color, big: true, kind: "power" });
    } else {
      chRef.current?.send({ type: "broadcast", event: "pw", payload: { id } });
      pushImpact({ x: simRef.current.p1, y: FIELD.paddleInset, t: performance.now(), color: POWER_MAP[id].color, big: true, kind: "power" });
      if (id === "teleport") {
        const cur = simRef.current.p1;
        const dx = Math.max(-0.35, Math.min(0.35, simRef.current.bx - cur));
        simRef.current.p1 = cur + dx;
        targetRef.current = cur + dx;
      }
      if (id === "rewind") { simRef.current.rewindAt = performance.now(); sweep(1200, 120, 0.7, 0.05); }
    }
  }, [pushImpact]);

  const startMatch = useCallback(() => {
    const s = simRef.current;
    s.s0 = 0; s.s1 = 0; s.fx = [emptyFx(), emptyFx()];
    s.phase = "countdown"; s.timer = 3;
    s.hist = []; s.clock = 0;
    serve(s, 0);
    setPhase("countdown");
    setScore([0, 0]);
    cooldownUntilRef.current = 0;
    chRef.current?.send({ type: "broadcast", event: "start", payload: {} });
  }, []);

  return {
    sim: simRef, impacts: impactsRef,
    peers: sorted, opponent, connected, lag, opponentGone,
    phase, score, countdown, fxView, mySide, isHost,
    myPower, cooldown, setTarget, choosePower, usePower, startMatch,
  };
}

/* ------------------------------------------------------------------ */
/* canvas — camada gráfica                                             */
/* ------------------------------------------------------------------ */

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function PongCanvas({
  simRef,
  impactsRef,
  mySide,
  arena,
  paddleSkin,
  ballSkin,
  onTarget,
}: {
  simRef: React.MutableRefObject<Sim>;
  impactsRef: React.MutableRefObject<Impact[]>;
  mySide: 0 | 1;
  arena: string;
  paddleSkin: string;
  ballSkin: string;
  onTarget: (x: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const trail = useRef<{ x: number; y: number; t: number }[]>([]);
  const parts = useRef<Particle[]>([]);
  const stars = useRef<{ x: number; y: number; z: number; s: number }[]>([]);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const arenaDef = ARENAS.find((a) => a.id === arena) ?? ARENAS[0];
    const pSkin = PADDLE_SKINS.find((s) => s.id === paddleSkin) ?? PADDLE_SKINS[0];
    const bSkin = BALL_SKINS.find((s) => s.id === ballSkin) ?? BALL_SKINS[0];

    if (!stars.current.length) {
      stars.current = Array.from({ length: 70 }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: 0.25 + Math.random() * 0.75,
        s: 0.5 + Math.random() * 1.6,
      }));
    }

    let raf = 0;
    let shake = 0;
    let lastT = performance.now();
    const start = performance.now();

    const burst = (x: number, y: number, color: string, count: number, power = 1) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.15 + Math.random() * 0.55) * power;
        parts.current.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0, max: 0.35 + Math.random() * 0.5,
          color, size: (1 + Math.random() * 2.4) * power,
        });
      }
      if (parts.current.length > 420) parts.current.splice(0, parts.current.length - 420);
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const el = (now - start) / 1000;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = cv.getBoundingClientRect();
      if (cv.width !== Math.floor(rect.width * dpr) || cv.height !== Math.floor(rect.height * dpr)) {
        cv.width = Math.floor(rect.width * dpr);
        cv.height = Math.floor(rect.height * dpr);
      }
      const W = cv.width, H = cv.height;
      const sx = W / FIELD.w, sy = H / FIELD.h;
      const sim = simRef.current;
      const flip = mySide === 1;
      const fy = (y: number) => (flip ? FIELD.h - y : y) * sy;
      const fxp = (x: number) => (flip ? FIELD.w - x : x) * sx;

      const f0 = mergeFx(sim.fx?.[0]);
      const f1 = mergeFx(sim.fx?.[1]);
      const fxBySide = [f0, f1] as const;
      const meFx = fxBySide[mySide];
      const foeFx = fxBySide[mySide === 0 ? 1 : 0];

      // ---- novos impactos viram partículas
      for (const i of impactsRef.current) {
        const key = i.t;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        if (i.kind === "goal") { burst(fxp(i.x), fy(i.y), i.color, 44, 1.6); shake = Math.max(shake, 14); }
        else if (i.kind === "power") { burst(fxp(i.x), fy(i.y), i.color, 30, 1.2); shake = Math.max(shake, 7); }
        else if (i.kind === "rewind") { burst(W / 2, H / 2, "#facc15", 60, 1.8); shake = Math.max(shake, 10); }
        else { burst(fxp(i.x), fy(i.y), i.color, i.big ? 26 : 12, i.big ? 1.4 : 0.8); shake = Math.max(shake, i.big ? 9 : 3.5); }
      }
      if (seen.current.size > 200) seen.current = new Set();

      const rewinding = sim.rewindAt && now - sim.rewindAt < 900 ? 1 - (now - sim.rewindAt) / 900 : 0;

      ctx.save();
      shake = Math.max(0, shake - dt * 34);
      if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake * dpr, (Math.random() - 0.5) * shake * dpr);

      /* fundo -------------------------------------------------- */
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, arenaDef.bg[0]);
      g.addColorStop(1, arenaDef.bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(-W, -H, W * 3, H * 3);

      // nebulosas suaves
      ctx.globalCompositeOperation = "lighter";
      for (let n = 0; n < 3; n++) {
        const cx = W * (0.25 + 0.25 * n) + Math.sin(el * 0.25 + n) * W * 0.1;
        const cy = H * (0.2 + 0.3 * n) + Math.cos(el * 0.2 + n) * H * 0.07;
        const rad = Math.min(W, H) * (0.35 + n * 0.1);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        rg.addColorStop(0, hexA(arenaDef.glow, 0.13));
        rg.addColorStop(1, hexA(arenaDef.glow, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // estrelas com parallax leve seguindo a bola
      for (const st of stars.current) {
        const px = (st.x * W + Math.sin(el * 0.1 * st.z) * 8 * dpr + (sim.bx - 0.5) * 22 * dpr * st.z + W) % W;
        const py = (st.y * H + el * 6 * st.z * dpr) % H;
        ctx.globalAlpha = 0.25 + st.z * 0.5 * (0.6 + 0.4 * Math.sin(el * 2 + st.x * 10));
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(px, py, st.s * st.z * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      /* grade de campo ------------------------------------------ */
      ctx.strokeStyle = hexA(arenaDef.glow, 0.1);
      ctx.lineWidth = Math.max(1, dpr * 0.8);
      for (let i = 1; i < 6; i++) {
        const y = (H / 6) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let i = 1; i < 4; i++) {
        const x = (W / 4) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      // linha central pulsante
      const pulse = 0.55 + 0.45 * Math.sin(el * 2.2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hexA(arenaDef.glow, 0.28 * pulse + 0.14);
      ctx.shadowColor = arenaDef.glow;
      ctx.shadowBlur = 16 * dpr;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([12 * dpr, 14 * dpr]);
      ctx.lineDashOffset = -el * 26 * dpr;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.setLineDash([]);
      // círculo central
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.12 * (1 + 0.03 * Math.sin(el * 3)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // moldura neon
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hexA(arenaDef.glow, 0.35);
      ctx.shadowColor = arenaDef.glow;
      ctx.shadowBlur = 22 * dpr;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(dpr, dpr, W - dpr * 2, H - dpr * 2);
      ctx.restore();

      /* muralhas / clones -------------------------------------- */
      const drawWall = (side: 0 | 1) => {
        const f = fxBySide[side];
        if (f.wall <= 0) return;
        const y = fy(wallY(side));
        const a = Math.min(1, f.wall) * 0.75;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const wg = ctx.createLinearGradient(0, y - 8 * dpr, 0, y + 8 * dpr);
        wg.addColorStop(0, hexA("#a3a3a3", 0));
        wg.addColorStop(0.5, hexA("#e5e7eb", a));
        wg.addColorStop(1, hexA("#a3a3a3", 0));
        ctx.fillStyle = wg;
        ctx.fillRect(0, y - 8 * dpr, W, 16 * dpr);
        ctx.globalAlpha = a * 0.6;
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1 * dpr;
        for (let x = 0; x < W; x += 18 * dpr) {
          ctx.beginPath(); ctx.moveTo(x + (el * 20 * dpr) % (18 * dpr), y - 7 * dpr); ctx.lineTo(x, y + 7 * dpr); ctx.stroke();
        }
        ctx.restore();
      };
      drawWall(0); drawWall(1);

      /* rastro da bola ------------------------------------------ */
      trail.current.push({ x: sim.bx, y: sim.by, t: now });
      if (trail.current.length > 26) trail.current.shift();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const furyBall = f0.fury > 0 || f1.fury > 0;
      trail.current.forEach((p, i) => {
        const k = i / trail.current.length;
        ctx.globalAlpha = k * k * 0.5;
        ctx.fillStyle = furyBall ? "rgba(249,115,22,0.6)" : bSkin.trail;
        ctx.beginPath();
        ctx.arc(fxp(p.x), fy(p.y), FIELD.ballR * sx * (0.25 + k * 0.95), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      /* raquetes ------------------------------------------------- */
      const drawPaddle = (x: number, y: number, side: 0 | 1, ghostAlpha = 1) => {
        const f = fxBySide[side];
        const half = paddleHalf(f) * sx;
        const hh = FIELD.paddleH * sy * 1.15;
        const mine = side === mySide;
        const color = mine ? pSkin.color : "#94a3b8";
        const trailC = mine ? pSkin.trail : "#cbd5e1";
        const px = fxp(x) - half, py = fy(y) - hh / 2;
        const r = hh / 2;

        ctx.save();
        ctx.globalAlpha = ghostAlpha;
        // brilho sob a raquete
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(fxp(x), fy(y), 0, fxp(x), fy(y), half * 1.9);
        glow.addColorStop(0, hexA(color, 0.5 * (f.speed > 0 || f.magnet > 0 ? 1.3 : 1)));
        glow.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(px - half, py - hh * 3, half * 4, hh * 7);
        ctx.globalCompositeOperation = "source-over";

        const pg = ctx.createLinearGradient(0, py, 0, py + hh);
        pg.addColorStop(0, trailC);
        pg.addColorStop(1, color);
        ctx.fillStyle = pg;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * dpr;
        ctx.beginPath();
        ctx.roundRect(px, py, half * 2, hh, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        // reflexo interno
        ctx.globalAlpha = ghostAlpha * 0.5;
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.roundRect(px + r * 0.5, py + hh * 0.18, half * 2 - r, hh * 0.26, hh * 0.13);
        ctx.fill();
        ctx.globalAlpha = ghostAlpha;

        // congelado
        if (f.freeze > 0) {
          ctx.strokeStyle = hexA("#67e8f9", 0.9);
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.roundRect(px - 3 * dpr, py - 3 * dpr, half * 2 + 6 * dpr, hh + 6 * dpr, r + 3 * dpr);
          ctx.stroke();
          for (let i = 0; i < 5; i++) {
            const fxx = px + (half * 2 * (i + 0.5)) / 5;
            ctx.globalAlpha = ghostAlpha * 0.6;
            ctx.fillStyle = "#e0f2fe";
            ctx.beginPath();
            ctx.arc(fxx, py + hh / 2 + Math.sin(el * 4 + i) * 2 * dpr, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = ghostAlpha;
          }
        }
        // escudo
        if (f.shield > 0 && !f.shieldUsed) {
          ctx.globalCompositeOperation = "lighter";
          const sa = 0.25 + 0.2 * Math.sin(el * 5);
          ctx.strokeStyle = hexA("#22d3ee", sa + 0.35);
          ctx.lineWidth = 3 * dpr;
          ctx.beginPath();
          const arcY = fy(y) + (side === mySide ? -hh : hh);
          ctx.ellipse(fxp(x), arcY, half * 1.6, hh * 2.6, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
        // fúria
        if (f.fury > 0) {
          ctx.globalCompositeOperation = "lighter";
          for (let i = 0; i < 6; i++) {
            const fxx = px + (half * 2 * (i + 0.5)) / 6;
            const hgt = (6 + Math.abs(Math.sin(el * 9 + i)) * 12) * dpr;
            ctx.fillStyle = hexA("#f97316", 0.5);
            ctx.beginPath();
            ctx.ellipse(fxx, py + (side === mySide ? -hgt / 2 : hh + hgt / 2), 3.5 * dpr, hgt / 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.restore();
      };

      drawPaddle(sim.p0, FIELD.h - FIELD.paddleInset, 0);
      drawPaddle(sim.p1, FIELD.paddleInset, 1);
      if (f0.clone > 0) drawPaddle(sim.p0, cloneY(0), 0, 0.45);
      if (f1.clone > 0) drawPaddle(sim.p1, cloneY(1), 1, 0.45);

      /* bola ------------------------------------------------------ */
      // fantasma: some no campo de quem sofre o efeito
      const ballInMyHalf = mySide === 0 ? sim.by > FIELD.h / 2 : sim.by < FIELD.h / 2;
      const ballAlpha = foeFx.ghost > 0 && ballInMyHalf ? 0.14 : 1;
      const bx = fxp(sim.bx), by = fy(sim.by);
      const br = FIELD.ballR * sx;
      ctx.save();
      ctx.globalAlpha = ballAlpha;
      ctx.globalCompositeOperation = "lighter";
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br * 3.2);
      bg.addColorStop(0, hexA(furyBall ? "#fb923c" : bSkin.color, 0.85));
      bg.addColorStop(1, hexA(furyBall ? "#f97316" : bSkin.color, 0));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, br * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const core = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(1, furyBall ? "#fb923c" : bSkin.color);
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      if (furyBall) {
        ctx.strokeStyle = hexA("#fdba74", 0.8);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(bx, by, br * (1.5 + 0.15 * Math.sin(el * 12)), el * 4, el * 4 + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.restore();

      /* partículas ------------------------------------------------ */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      parts.current = parts.current.filter((p) => {
        p.life += dt;
        if (p.life >= p.max) return false;
        p.x += p.vx * sx * dt;
        p.y += p.vy * sy * dt;
        p.vx *= 0.97; p.vy *= 0.97;
        const k = 1 - p.life / p.max;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * dpr * k, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      ctx.restore();

      /* ondas de impacto ------------------------------------------ */
      impactsRef.current = impactsRef.current.filter((i) => now - i.t < 620);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const i of impactsRef.current) {
        const t = (now - i.t) / 620;
        const rad = (i.kind === "goal" ? 140 : i.big ? 100 : 46) * dpr * (1 - Math.pow(1 - t, 2));
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.strokeStyle = i.color;
        ctx.lineWidth = (i.big ? 4 : 2.5) * dpr * (1 - t);
        ctx.beginPath();
        ctx.arc(fxp(i.x), fy(i.y), rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      /* efeito de retorno no tempo -------------------------------- */
      if (rewinding > 0) {
        ctx.save();
        ctx.globalAlpha = rewinding * 0.45;
        ctx.fillStyle = "#facc15";
        ctx.globalCompositeOperation = "overlay";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = rewinding * 0.35;
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1 * dpr;
        for (let y = 0; y < H; y += 5 * dpr) {
          ctx.beginPath(); ctx.moveTo(0, y + ((el * 200) % (5 * dpr))); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.globalAlpha = rewinding;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = hexA("#facc15", 0.5);
          ctx.lineWidth = 3 * dpr;
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, Math.min(W, H) * (0.15 + i * 0.16) * (1.4 - rewinding), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* aura de status do jogador --------------------------------- */
      if (meFx.freeze > 0 || meFx.shrink > 0 || foeFx.ghost > 0) {
        ctx.save();
        const c = meFx.freeze > 0 ? "#67e8f9" : meFx.shrink > 0 ? "#fb7185" : "#e5e7eb";
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, hexA(c, 0));
        vg.addColorStop(1, hexA(c, 0.28));
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // vinheta
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.78);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [simRef, impactsRef, mySide, arena, paddleSkin, ballSkin]);

  const handle = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    onTarget((mySide === 1 ? 1 - rel : rel) * FIELD.w);
  };

  return (
    <canvas
      ref={ref}
      className="h-full w-full touch-none rounded-3xl"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") handle(e); }}
    />
  );
}

export { POWERS };
