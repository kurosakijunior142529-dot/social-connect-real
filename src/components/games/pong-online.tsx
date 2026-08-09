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

type Fx = {
  gravity: number;
  time: number;
  portal: number;
  clone: number;
  magnet: number;
  speed: number;
  reflex: number;
  shield: number;
  shieldUsed: boolean;
};

const emptyFx = (): Fx => ({
  gravity: 0, time: 0, portal: 0, clone: 0, magnet: 0, speed: 0, reflex: 0, shield: 0, shieldUsed: false,
});

type Sim = {
  bx: number; by: number; vx: number; vy: number;
  p0: number; p1: number;
  s0: number; s1: number;
  phase: Phase;
  timer: number;
  serveTo: 0 | 1;
  fx: [Fx, Fx];
};

export type Peer = { id: string; name: string; avatar: string | null; joinedAt: number; power: PowerId | null; ready: boolean };

type Impact = { x: number; y: number; t: number; color: string; big?: boolean };

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
  };
  serve(sim, 0);
  return sim;
}

function decay(fx: Fx, dt: number) {
  fx.gravity = Math.max(0, fx.gravity - dt);
  fx.time = Math.max(0, fx.time - dt);
  fx.portal = Math.max(0, fx.portal - dt);
  fx.clone = Math.max(0, fx.clone - dt);
  fx.magnet = Math.max(0, fx.magnet - dt);
  fx.speed = Math.max(0, fx.speed - dt);
  fx.reflex = Math.max(0, fx.reflex - dt);
  const before = fx.shield;
  fx.shield = Math.max(0, fx.shield - dt);
  if (before > 0 && fx.shield === 0) fx.shieldUsed = false;
}

function paddleHalf(fx: Fx) {
  return FIELD.paddleHalf * (fx.magnet > 0 ? 1.55 : 1);
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

  const slow = sim.fx[0].time > 0 || sim.fx[1].time > 0 ? 0.6 : 1;
  const sub = 3;
  const h = (dt * slow) / sub;

  for (let i = 0; i < sub; i++) {
    // gravidade: curva lateral na direção do lado adversário do usuário do poder
    if (sim.fx[0].gravity > 0) sim.vx += (sim.bx < FIELD.w / 2 ? 0.55 : -0.55) * h;
    if (sim.fx[1].gravity > 0) sim.vx += (sim.bx < FIELD.w / 2 ? 0.55 : -0.55) * h;

    const prevY = sim.by;
    sim.bx += sim.vx * h;
    sim.by += sim.vy * h;

    // paredes laterais
    if (sim.bx < FIELD.ballR) { sim.bx = FIELD.ballR; sim.vx = Math.abs(sim.vx); beep(320, 0.04, "triangle", 0.03); }
    if (sim.bx > FIELD.w - FIELD.ballR) { sim.bx = FIELD.w - FIELD.ballR; sim.vx = -Math.abs(sim.vx); beep(320, 0.04, "triangle", 0.03); }

    // portal: espelha ao cruzar o meio
    const portalOn = sim.fx[0].portal > 0 || sim.fx[1].portal > 0;
    if (portalOn && ((prevY < FIELD.h / 2 && sim.by >= FIELD.h / 2) || (prevY > FIELD.h / 2 && sim.by <= FIELD.h / 2))) {
      sim.bx = FIELD.w - sim.bx;
      sim.vx = -sim.vx;
      onImpact({ x: sim.bx, y: FIELD.h / 2, t: performance.now(), color: "#a855f7" });
      beep(660, 0.09, "sawtooth", 0.04);
    }

    const y0 = FIELD.h - FIELD.paddleInset;
    const y1 = FIELD.paddleInset;

    const hit = (px: number, fx: Fx, dir: 1 | -1, py: number) => {
      const half = paddleHalf(fx);
      if (Math.abs(sim.bx - px) > half + FIELD.ballR) return false;
      const off = (sim.bx - px) / half;
      const speed = Math.min(FIELD.maxSpeed, Math.hypot(sim.vx, sim.vy) * (fx.reflex > 0 ? 1.35 : 1.04));
      const angle = off * 0.9;
      sim.vx = Math.sin(angle) * speed;
      sim.vy = dir * Math.abs(Math.cos(angle) * speed);
      sim.by = py + dir * (FIELD.ballR + FIELD.paddleH * 0.6);
      onImpact({ x: sim.bx, y: py, t: performance.now(), color: fx.reflex > 0 ? "#f97316" : "#ffffff" });
      beep(fx.reflex > 0 ? 720 : 480, 0.06, "square", 0.05);
      return true;
    };

    // raquete de baixo (jogador 0)
    if (sim.vy > 0 && sim.by + FIELD.ballR >= y0 && prevY + FIELD.ballR <= y0 + 0.06) {
      if (!hit(sim.p0, sim.fx[0], -1, y0)) {
        /* passou */
      }
    }
    // clone do jogador 0
    if (sim.fx[0].clone > 0 && sim.vy > 0) {
      const cy = y0 - 0.22;
      if (sim.by + FIELD.ballR >= cy && prevY + FIELD.ballR <= cy + 0.05) hit(sim.p0, sim.fx[0], -1, cy);
    }
    // raquete de cima (jogador 1)
    if (sim.vy < 0 && sim.by - FIELD.ballR <= y1 && prevY - FIELD.ballR >= y1 - 0.06) {
      hit(sim.p1, sim.fx[1], 1, y1);
    }
    if (sim.fx[1].clone > 0 && sim.vy < 0) {
      const cy = y1 + 0.22;
      if (sim.by - FIELD.ballR <= cy && prevY - FIELD.ballR >= cy - 0.05) hit(sim.p1, sim.fx[1], 1, cy);
    }

    // pontos / escudo
    if (sim.by > FIELD.h + 0.05) {
      if (sim.fx[0].shield > 0 && !sim.fx[0].shieldUsed) {
        sim.fx[0].shieldUsed = true;
        sim.by = FIELD.h - 0.06;
        sim.vy = -Math.abs(sim.vy);
        onImpact({ x: sim.bx, y: FIELD.h - 0.04, t: performance.now(), color: "#22d3ee", big: true });
        beep(220, 0.18, "sine", 0.06);
      } else {
        sim.s1 += 1;
        onImpact({ x: sim.bx, y: FIELD.h, t: performance.now(), color: "#f87171", big: true });
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
        onImpact({ x: sim.bx, y: 0.04, t: performance.now(), color: "#22d3ee", big: true });
        beep(220, 0.18, "sine", 0.06);
      } else {
        sim.s0 += 1;
        onImpact({ x: sim.bx, y: 0, t: performance.now(), color: "#4ade80", big: true });
        beep(880, 0.16, "triangle", 0.05);
        sim.phase = sim.s0 >= FIELD.winScore ? "over" : "point";
        sim.timer = 1.3;
        sim.serveTo = 1;
      }
    }
  }
}

function applyPower(sim: Sim, side: 0 | 1, id: PowerId) {
  const fx = sim.fx[side];
  const def = POWER_MAP[id];
  if (!def) return;
  switch (id) {
    case "teleport": {
      const cur = side === 0 ? sim.p0 : sim.p1;
      const target = Math.max(0.05, Math.min(FIELD.w - 0.05, sim.bx));
      const dx = Math.max(-0.25, Math.min(0.25, target - cur));
      if (side === 0) sim.p0 = cur + dx; else sim.p1 = cur + dx;
      break;
    }
    case "gravity": fx.gravity = def.duration; break;
    case "time": fx.time = def.duration; break;
    case "portal": fx.portal = def.duration; break;
    case "clone": fx.clone = def.duration; break;
    case "magnet": fx.magnet = def.duration; break;
    case "speed": fx.speed = def.duration; break;
    case "reflex": fx.reflex = def.duration; break;
    case "shield": fx.shield = def.duration; fx.shieldUsed = false; break;
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
    if (impactsRef.current.length > 24) impactsRef.current.shift();
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
      s.fx = p.fx;
      setPhase(p.ph);
      setScore([p.s0, p.s1]);
      setCountdown(p.ph === "countdown" ? Math.max(0, Math.ceil(p.tm)) : 0);
      setFxView(p.fx);
      if (typeof p.t === "number") setLag(Math.max(0, Math.round(Date.now() - p.t)));
    });

    ch.on("broadcast", { event: "p" }, ({ payload }) => {
      // posição da raquete do convidado (só o host consome)
      if (!isHostRef.current) return;
      simRef.current.p1 = payload.x;
    });

    ch.on("broadcast", { event: "pw" }, ({ payload }) => {
      if (!isHostRef.current) return;
      applyPower(simRef.current, 1, payload.id as PowerId);
      pushImpact({ x: simRef.current.p1, y: FIELD.paddleInset, t: performance.now(), color: POWER_MAP[payload.id as PowerId]?.color ?? "#fff", big: true });
    });

    ch.on("broadcast", { event: "start" }, () => {
      const s = simRef.current;
      s.s0 = 0; s.s1 = 0; s.fx = [emptyFx(), emptyFx()];
      s.phase = "countdown"; s.timer = 3;
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
      const spd = FIELD.paddleSpeed * (fxMe.speed > 0 ? 1.7 : 1);
      const cur = side === 0 ? sim.p0 : sim.p1;
      const half = paddleHalf(fxMe);
      const tgt = Math.max(half, Math.min(FIELD.w - half, targetRef.current));
      const d = tgt - cur;
      const move = Math.sign(d) * Math.min(Math.abs(d), spd * dt);
      const nx = cur + move;
      if (side === 0) sim.p0 = nx; else sim.p1 = nx;

      if (isHostRef.current) {
        acc += dt;
        while (acc > 1 / 120) {
          step(sim, 1 / 120, pushImpact);
          acc -= 1 / 120;
        }
        setPhase(sim.phase);
        setScore([sim.s0, sim.s1]);
        setCountdown(sim.phase === "countdown" ? Math.max(0, Math.ceil(sim.timer)) : 0);
        setFxView([{ ...sim.fx[0] }, { ...sim.fx[1] }]);

        sendAcc += dt;
        if (sendAcc >= 0.045) {
          sendAcc = 0;
          chRef.current?.send({
            type: "broadcast",
            event: "s",
            payload: {
              bx: sim.bx, by: sim.by, vx: sim.vx, vy: sim.vy,
              p0: sim.p0, p1: sim.p1, s0: sim.s0, s1: sim.s1,
              ph: sim.phase, tm: sim.timer, fx: sim.fx, t: Date.now(),
            },
          });
        }
      } else {
        // extrapolação suave da bola entre snapshots
        if (sim.phase === "playing") {
          const slow = sim.fx[0]?.time > 0 || sim.fx[1]?.time > 0 ? 0.6 : 1;
          sim.bx += sim.vx * dt * slow;
          sim.by += sim.vy * dt * slow;
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
    const side = mySideRef.current;
    if (isHostRef.current) {
      applyPower(simRef.current, 0, id);
      pushImpact({ x: simRef.current.p0, y: FIELD.h - FIELD.paddleInset, t: performance.now(), color: POWER_MAP[id].color, big: true });
    } else {
      chRef.current?.send({ type: "broadcast", event: "pw", payload: { id } });
      // feedback local imediato para efeitos visuais próprios
      pushImpact({ x: simRef.current.p1, y: FIELD.paddleInset, t: performance.now(), color: POWER_MAP[id].color, big: true });
      if (id === "teleport") {
        const cur = simRef.current.p1;
        const dx = Math.max(-0.25, Math.min(0.25, simRef.current.bx - cur));
        simRef.current.p1 = cur + dx;
        targetRef.current = cur + dx;
      }
    }
    void side;
  }, [pushImpact]);

  const startMatch = useCallback(() => {
    const s = simRef.current;
    s.s0 = 0; s.s1 = 0; s.fx = [emptyFx(), emptyFx()];
    s.phase = "countdown"; s.timer = 3;
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
/* canvas                                                              */
/* ------------------------------------------------------------------ */

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
  const trail = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const arenaDef = ARENAS.find((a) => a.id === arena) ?? ARENAS[0];
    const pSkin = PADDLE_SKINS.find((s) => s.id === paddleSkin) ?? PADDLE_SKINS[0];
    const bSkin = BALL_SKINS.find((s) => s.id === ballSkin) ?? BALL_SKINS[0];

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
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
      const fx = (x: number) => x * sx;

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, arenaDef.bg[0]);
      g.addColorStop(1, arenaDef.bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // linha central + halo
      ctx.strokeStyle = arenaDef.line;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.setLineDash([10 * dpr, 12 * dpr]);
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = arenaDef.glow;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // rastro da bola
      trail.current.push({ x: sim.bx, y: sim.by });
      if (trail.current.length > 12) trail.current.shift();
      trail.current.forEach((p, i) => {
        const a = (i / trail.current.length) * 0.35;
        ctx.globalAlpha = a;
        ctx.fillStyle = bSkin.trail;
        ctx.beginPath();
        ctx.arc(fx(p.x), fy(p.y), FIELD.ballR * sx * (0.4 + (i / trail.current.length) * 0.6), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      const drawPaddle = (x: number, y: number, side: 0 | 1) => {
        const f = sim.fx[side] ?? emptyFx();
        const half = paddleHalf(f) * sx;
        const hh = FIELD.paddleH * sy;
        const mine = side === mySide;
        const color = mine ? pSkin.color : "#94a3b8";
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * dpr * (f.speed > 0 || f.magnet > 0 ? 1.6 : 1);
        ctx.fillStyle = color;
        const px = fx(x) - half, py = fy(y) - hh / 2;
        const r = hh / 2;
        ctx.beginPath();
        ctx.roundRect(px, py, half * 2, hh, r);
        ctx.fill();
        if (f.shield > 0 && !f.shieldUsed) {
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 3 * dpr;
          ctx.beginPath();
          ctx.roundRect(px - 6 * dpr, py - 6 * dpr, half * 2 + 12 * dpr, hh + 12 * dpr, r + 6 * dpr);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        if (f.clone > 0) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = color;
          const cy = fy(side === 0 ? y - 0.22 : y + 0.22) - hh / 2;
          ctx.beginPath();
          ctx.roundRect(px, cy, half * 2, hh, r);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      };

      drawPaddle(sim.p0, FIELD.h - FIELD.paddleInset, 0);
      drawPaddle(sim.p1, FIELD.paddleInset, 1);

      // bola
      ctx.save();
      ctx.shadowColor = bSkin.color;
      ctx.shadowBlur = 24 * dpr;
      ctx.fillStyle = bSkin.color;
      ctx.beginPath();
      ctx.arc(fx(sim.bx), fy(sim.by), FIELD.ballR * sx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // impactos
      const now = performance.now();
      impactsRef.current = impactsRef.current.filter((i) => now - i.t < 520);
      for (const i of impactsRef.current) {
        const t = (now - i.t) / 520;
        const rad = (i.big ? 90 : 44) * dpr * t;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.strokeStyle = i.color;
        ctx.lineWidth = (i.big ? 4 : 2.5) * dpr * (1 - t);
        ctx.beginPath();
        ctx.arc(fx(i.x), fy(i.y), rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [simRef, impactsRef, mySide, arena, paddleSkin, ballSkin]);

  const handle = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onTarget(((e.clientX - rect.left) / rect.width) * FIELD.w);
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
