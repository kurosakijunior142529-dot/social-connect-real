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
import { ensureAudio, setArenaTrack, setIntensity, sfx, startMusic, stopMusic } from "@/lib/pong/audio";

/* ------------------------------------------------------------------ */
/* tipos                                                               */
/* ------------------------------------------------------------------ */

export type Phase = "lobby" | "countdown" | "playing" | "point" | "over";

/** duração restante de cada efeito no lado que o SOFRE (ou possui) */
export type Fx = Partial<Record<PowerId, number>> & { shieldUsed?: boolean };

const emptyFx = (): Fx => ({});
const mergeFx = (f: Fx | undefined): Fx => ({ ...(f ?? {}) });
const dur = (f: Fx | undefined, id: PowerId) => (f?.[id] ?? 0) as number;

type Snap = { t: number; bx: number; by: number; vx: number; vy: number; p0: number; p1: number; s0: number; s1: number };

type Stick = { side: 0 | 1; t: number } | null;

type Sim = {
  bx: number; by: number; vx: number; vy: number;
  p0: number; p1: number;
  /** sentinelas autônomas */
  g0: number; g1: number;
  spin: number;
  stick: Stick;
  s0: number; s1: number;
  phase: Phase;
  timer: number;
  serveTo: 0 | 1;
  fx: [Fx, Fx];
  /** histórico só do host, para o poder do Tempo */
  hist: Snap[];
  clock: number;
  rewindAt: number;
  /** rally atual — usado para intensidade da trilha */
  rally: number;
  /** multiplicador de pontos da disputa atual (Ponto de Ouro) */
  mult: number;
  /** força o próximo saque para um lado (Sacada) */
  serveOverride: 0 | 1 | null;
  /** Fôlego — instante em que a recarga zera para cada lado */
  sw: [number, number];
  /** Ímpeto — pilhas acumuladas por lado */
  mom: [number, number];
  /** último toque válido (lado) — usado por Cofre/Ressonância */
  lastHit: 0 | 1 | null;
};

export type Peer = { id: string; name: string; avatar: string | null; joinedAt: number; power: PowerId | null; ready: boolean };

export type Impact = { x: number; y: number; t: number; color: string; big?: boolean; kind?: "hit" | "goal" | "power" | "rewind" };

/* ------------------------------------------------------------------ */
/* motor                                                               */
/* ------------------------------------------------------------------ */

export function ballRadius(sim: Sim) {
  const giant = dur(sim.fx[0], "giant") > 0 || dur(sim.fx[1], "giant") > 0;
  const tiny = dur(sim.fx[0], "tiny") > 0 || dur(sim.fx[1], "tiny") > 0;
  return FIELD.ballR * (giant ? 1.7 : 1) * (tiny ? 0.55 : 1);
}

function serve(sim: Sim, to: 0 | 1) {
  const forced = sim.serveOverride;
  const dest: 0 | 1 = forced === null || forced === undefined ? to : forced;
  sim.serveOverride = null;
  sim.bx = FIELD.w / 2;
  sim.by = FIELD.h / 2;
  const angle = (Math.random() * 0.7 - 0.35) + (dest === 0 ? Math.PI / 2 : -Math.PI / 2);
  sim.vx = Math.cos(angle) * FIELD.baseSpeed;
  sim.vy = Math.sin(angle) * FIELD.baseSpeed;
  sim.serveTo = dest;
  sim.spin = 0;
  sim.stick = null;
  sim.rally = 0;
  sim.lastHit = null;
}

export function newSim(): Sim {
  const sim: Sim = {
    bx: FIELD.w / 2, by: FIELD.h / 2, vx: 0, vy: 0,
    p0: FIELD.w / 2, p1: FIELD.w / 2,
    g0: FIELD.w / 2, g1: FIELD.w / 2,
    spin: 0, stick: null,
    s0: 0, s1: 0,
    phase: "lobby", timer: 0, serveTo: 0,
    fx: [emptyFx(), emptyFx()],
    hist: [], clock: 0, rewindAt: 0, rally: 0,
    mult: 1, serveOverride: null, sw: [0, 0], mom: [0, 0], lastHit: null,
  };
  serve(sim, 0);
  return sim;
}

const TIMED: PowerId[] = [
  "gravity", "portal", "clone", "magnet", "speed", "reflex", "shield",
  "freeze", "shrink", "ghost", "wall", "fury",
  "curve", "blackhole", "invert", "fog", "slowmo", "hyper", "quake",
  "vortex", "stealth", "spikes", "sentinel", "chaos", "overdrive",
  "giant", "tiny", "sticky",
  // expansão
  "wrap", "ceiling", "anchor", "fuse", "saw", "current", "damp", "fork",
  "heavy", "feather",
  "root", "split", "counter", "parry", "tether", "bulwark", "secondwind",
  "serveback",
  "blind", "jam", "drift", "silence", "leech", "mirror", "narrow", "lead",
  "deadzone", "taunt",
  "vault", "netrise", "haven", "bubble", "momentum", "overload", "gambit",
  "curtain", "resonance",
];

function decay(fx: Fx, dt: number) {
  for (const k of TIMED) {
    const v = fx[k];
    if (v && v > 0) {
      const n = v - dt;
      if (n <= 0) delete fx[k];
      else fx[k] = n;
    }
  }
  if (!fx.shield) fx.shieldUsed = false;
}

export function paddleHalf(fx: Fx, mom = 0) {
  let h = FIELD.paddleHalf;
  if (dur(fx, "magnet") > 0) h *= 1.55;
  if (dur(fx, "shrink") > 0) h *= 0.55;
  if (dur(fx, "root") > 0) h *= 2;
  if (dur(fx, "split") > 0) h *= 1.75;
  if (dur(fx, "momentum") > 0) h *= 1 + Math.min(0.6, mom * 0.06);
  return h;
}

/** buraco central da raquete dividida (0 = sem buraco) */
export function splitGap(fx: Fx) {
  return dur(fx, "split") > 0 ? 0.42 : 0;
}

/** limites laterais efetivos do campo para um lado (Estreitar) */
export function courtInset(fx: Fx) {
  return dur(fx, "narrow") > 0 ? FIELD.w * 0.16 : 0;
}

/** y da placa "Teto" no campo de quem sofre */
export function ceilingY(side: 0 | 1) {
  return side === 0 ? FIELD.h * 0.88 : FIELD.h * 0.12;
}

/** posição Y da muralha de cada lado */
export function wallY(side: 0 | 1) {
  return side === 0 ? FIELD.h - FIELD.paddleInset - 0.17 : FIELD.paddleInset + 0.17;
}
export function cloneY(side: 0 | 1) {
  return side === 0 ? FIELD.h - FIELD.paddleInset - 0.24 : FIELD.paddleInset + 0.24;
}
export function sentinelY(side: 0 | 1) {
  return side === 0 ? FIELD.h - FIELD.paddleInset - 0.36 : FIELD.paddleInset + 0.36;
}
export function holeY(side: 0 | 1) {
  return side === 0 ? FIELD.h * 0.78 : FIELD.h * 0.22;
}

/** metade do campo em que a bola está (0 = baixo, 1 = cima) */
function ballHalf(sim: Sim): 0 | 1 {
  return sim.by > FIELD.h / 2 ? 0 : 1;
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

  // sentinelas perseguem a bola
  for (const side of [0, 1] as const) {
    if (dur(sim.fx[side], "sentinel") <= 0) continue;
    const cur = side === 0 ? sim.g0 : sim.g1;
    const d = sim.bx - cur;
    const nx = cur + Math.sign(d) * Math.min(Math.abs(d), 1.7 * dt);
    if (side === 0) sim.g0 = nx; else sim.g1 = nx;
  }

  const R = ballRadius(sim);

  // bola presa (Grude)
  if (sim.stick) {
    const side = sim.stick.side;
    const px = side === 0 ? sim.p0 : sim.p1;
    const py = side === 0 ? FIELD.h - FIELD.paddleInset : FIELD.paddleInset;
    sim.bx = px;
    sim.by = py + (side === 0 ? -1 : 1) * (R + FIELD.paddleH);
    sim.vx = 0; sim.vy = 0;
    sim.stick.t -= dt;
    if (sim.stick.t <= 0) {
      const dir = side === 0 ? -1 : 1;
      const foeX = side === 0 ? sim.p1 : sim.p0;
      // mira no canto mais distante da raquete adversária
      const aimX = foeX > FIELD.w / 2 ? 0.12 : FIELD.w - 0.12;
      const ang = Math.atan2(aimX - sim.bx, Math.abs(FIELD.h - 2 * FIELD.paddleInset)) * 1.6;
      const sp = FIELD.maxSpeed * 0.85;
      sim.vx = Math.sin(ang) * sp;
      sim.vy = dir * Math.abs(Math.cos(ang) * sp);
      sim.stick = null;
      onImpact({ x: sim.bx, y: sim.by, t: performance.now(), color: "#eab308", big: true, kind: "power" });
      sfx("sticky");
    }
    return;
  }

  const sub = 3;
  const h = dt / sub;

  for (let i = 0; i < sub; i++) {
    const half = ballHalf(sim);
    const foeOf = (s: 0 | 1) => (s === 0 ? 1 : 0) as 0 | 1;

    /* ---- forças de poderes ---- */
    for (const side of [0, 1] as const) {
      const f = sim.fx[side];

      // gravidade: quem lançou empurra a bola para o fundo do rival
      if (dur(f, "gravity") > 0) {
        const dir = side === 0 ? -1 : 1;
        sim.vy += dir * 0.55 * h;
      }
      // buraco negro (armazenado em quem sofre)
      if (dur(f, "blackhole") > 0) {
        const hx = FIELD.w / 2, hy = holeY(side);
        const dx = hx - sim.bx, dy = hy - sim.by;
        const d2 = Math.max(0.02, dx * dx + dy * dy);
        const g = 0.55 / d2;
        sim.vx += dx * g * h;
        sim.vy += dy * g * h;
      }
      // vórtice (em quem sofre): gira o vetor de velocidade no seu campo
      if (dur(f, "vortex") > 0 && half === side) {
        const w = 2.2 * h * (side === 0 ? 1 : -1);
        const nvx = sim.vx * Math.cos(w) - sim.vy * Math.sin(w);
        const nvy = sim.vx * Math.sin(w) + sim.vy * Math.cos(w);
        sim.vx = nvx; sim.vy = nvy;
      }
      // caos (em quem sofre)
      if (dur(f, "chaos") > 0 && half === side) {
        sim.vx += (Math.random() - 0.5) * 4.5 * h;
        sim.vy += (Math.random() - 0.5) * 2.5 * h;
      }
      // serrote (em quem sofre): zigue-zague em serra
      if (dur(f, "saw") > 0 && half === side) {
        sim.vx += Math.sign(Math.sin(sim.clock * 11)) * 2.6 * h;
      }
      // correnteza (em quem sofre): empurrão lateral constante
      if (dur(f, "current") > 0 && half === side) {
        sim.vx += (side === 0 ? 1 : -1) * 1.1 * h;
      }
      // refúgio (no dono): puxa a bola para o centro do próprio campo
      if (dur(f, "haven") > 0 && half === side) {
        sim.vx += (FIELD.w / 2 - sim.bx) * 3.2 * h;
      }
      // pluma (no dono): trava a bola no fundo do próprio campo
      if (dur(f, "feather") > 0 && half === side) {
        const deep = side === 0 ? sim.by > FIELD.h * 0.82 : sim.by < FIELD.h * 0.18;
        if (deep) { sim.vx *= Math.pow(0.25, h); sim.vy *= Math.pow(0.25, h); }
      }
    }

    // efeito curva (spin)
    if (Math.abs(sim.spin) > 0.001) {
      sim.vx += sim.spin * 1.5 * h;
      sim.spin *= Math.pow(0.55, h);
    }

    // limite de velocidade
    const sp = Math.hypot(sim.vx, sim.vy);
    const cap = FIELD.maxSpeed * 1.6;
    if (sp > cap) { sim.vx = (sim.vx / sp) * cap; sim.vy = (sim.vy / sp) * cap; }

    // multiplicador local (lento/hiper/bolha temporal)
    let mul = 1;
    if (dur(sim.fx[half], "slowmo") > 0) mul *= 0.55;
    if (dur(sim.fx[half], "hyper") > 0) mul *= 1.6;
    const bubbleOn = dur(sim.fx[0], "bubble") > 0 || dur(sim.fx[1], "bubble") > 0;
    if (bubbleOn && Math.abs(sim.by - FIELD.h / 2) < FIELD.h * 0.17) mul *= 0.5;

    const prevY = sim.by;
    const prevX = sim.bx;
    sim.bx += sim.vx * h * mul;
    sim.by += sim.vy * h * mul;


    // paredes laterais (com Fronteira Aberta, Estreitar e Amortecer)
    const wrapOn = dur(sim.fx[0], "wrap") > 0 || dur(sim.fx[1], "wrap") > 0;
    const inset = courtInset(sim.fx[half]);
    const damp = dur(sim.fx[half], "damp") > 0 ? 0.5 : 1;
    const leftX = inset + R;
    const rightX = FIELD.w - inset - R;
    if (sim.bx < leftX) {
      if (wrapOn && inset === 0) {
        sim.bx = FIELD.w - R;
      } else {
        sim.bx = leftX; sim.vx = Math.abs(sim.vx) * damp; sim.vy *= damp === 1 ? 1 : 0.85; sim.spin *= -0.5;
        sfx("wall"); onImpact({ x: sim.bx, y: sim.by, t: performance.now(), color: inset > 0 ? "#fb923c" : "#ffffff", kind: "hit" });
      }
    }
    if (sim.bx > rightX) {
      if (wrapOn && inset === 0) {
        sim.bx = R;
      } else {
        sim.bx = rightX; sim.vx = -Math.abs(sim.vx) * damp; sim.vy *= damp === 1 ? 1 : 0.85; sim.spin *= -0.5;
        sfx("wall"); onImpact({ x: sim.bx, y: sim.by, t: performance.now(), color: inset > 0 ? "#fb923c" : "#ffffff", kind: "hit" });
      }
    }

    // portal: espelha ao cruzar o meio
    const portalOn = dur(sim.fx[0], "portal") > 0 || dur(sim.fx[1], "portal") > 0;
    const crossedMid = (prevY < FIELD.h / 2 && sim.by >= FIELD.h / 2) || (prevY > FIELD.h / 2 && sim.by <= FIELD.h / 2);
    if (portalOn && crossedMid) {
      sim.bx = FIELD.w - sim.bx;
      sim.vx = -sim.vx;
      onImpact({ x: sim.bx, y: FIELD.h / 2, t: performance.now(), color: "#a855f7", kind: "power" });
      sfx("portal");
    }

    // rede alta: bolas fracas voltam ao cruzar o meio
    const netOn = dur(sim.fx[0], "netrise") > 0 || dur(sim.fx[1], "netrise") > 0;
    if (netOn && crossedMid && Math.abs(sim.vy) < FIELD.baseSpeed * 0.95) {
      sim.by = prevY;
      sim.vy = -sim.vy * 0.9;
      onImpact({ x: sim.bx, y: FIELD.h / 2, t: performance.now(), color: "#22c55e", kind: "power" });
      sfx("wall");
    }

    // cortina: barra vertical no meio do campo
    const curtainOn = dur(sim.fx[0], "curtain") > 0 || dur(sim.fx[1], "curtain") > 0;
    if (curtainOn && crossedMid) {
      const gapC = FIELD.w * 0.5;
      const inGap = Math.abs(sim.bx - gapC) < FIELD.w * 0.19;
      if (!inGap) {
        sim.by = prevY;
        sim.vy = -sim.vy;
        onImpact({ x: sim.bx, y: FIELD.h / 2, t: performance.now(), color: "#c084fc", kind: "power" });
        sfx("wall");
      }
    }

    // âncora: freia a bola ao entrar no campo de quem ativou
    for (const side of [0, 1] as const) {
      if (dur(sim.fx[side], "anchor") <= 0) continue;
      const entered = side === 0
        ? prevY <= FIELD.h / 2 && sim.by > FIELD.h / 2
        : prevY >= FIELD.h / 2 && sim.by < FIELD.h / 2;
      if (entered) {
        sim.vx *= 0.7; sim.vy *= 0.7;
        onImpact({ x: sim.bx, y: FIELD.h / 2, t: performance.now(), color: "#60a5fa", kind: "power" });
      }
    }

    // teto: placa que rebate no campo de quem sofre
    for (const side of [0, 1] as const) {
      if (dur(sim.fx[side], "ceiling") <= 0) continue;
      const cy = ceilingY(side);
      const down = side === 0;
      const crossed = down ? prevY < cy && sim.by >= cy : prevY > cy && sim.by <= cy;
      if (crossed) {
        sim.by = cy + (down ? -R : R);
        sim.vy = down ? -Math.abs(sim.vy) : Math.abs(sim.vy);
        onImpact({ x: sim.bx, y: cy, t: performance.now(), color: "#93c5fd", big: true, kind: "power" });
        sfx("wall");
      }
    }

    void prevX;

    const y0 = FIELD.h - FIELD.paddleInset;
    const y1 = FIELD.paddleInset;


    const hit = (px: number, side: 0 | 1, dirSign: 1 | -1, py: number, opts?: { wide?: boolean; auto?: boolean }) => {
      const f = sim.fx[side];
      const foeF = sim.fx[side === 0 ? 1 : 0];
      const wide = !!opts?.wide;
      const hw = wide ? FIELD.w : paddleHalf(f, sim.mom[side]) * (opts?.auto ? 0.6 : 1);
      const distX = Math.abs(sim.bx - px);
      if (distX > hw + R) return false;
      // Divisão: buraco no meio da raquete
      if (!wide && !opts?.auto && distX < hw * splitGap(f) - R) return false;

      // Grude: prende a bola
      if (dur(f, "sticky") > 0 && !wide && !opts?.auto) {
        delete f.sticky;
        sim.stick = { side, t: 0.75 };
        onImpact({ x: sim.bx, y: py, t: performance.now(), color: "#eab308", kind: "power" });
        sfx("sticky");
        return true;
      }

      const reflex = dur(f, "reflex") > 0;
      const spikes = dur(f, "spikes") > 0;
      const bulwark = dur(f, "bulwark") > 0;
      const heavy = dur(f, "heavy") > 0; // sofrido: devolução reta
      const incoming = Math.hypot(sim.vx, sim.vy);
      let boost = reflex ? 1.35 : spikes ? 1.3 : bulwark ? 1.18 : 1.05;
      let fury = false;
      let special = "";
      if (dur(f, "fury") > 0 && !wide && !opts?.auto) { boost *= 1.8; delete f.fury; fury = true; }
      // Aparar: janela curta de contra-ataque
      if (dur(f, "parry") > 0 && !wide && !opts?.auto) {
        delete f.parry;
        boost = 2.2;
        foeF.freeze = Math.max(dur(foeF, "freeze"), 1);
        special = "parry";
        sfx("power");
      }
      // Contragolpe: bolas rápidas voltam dobradas
      if (dur(f, "counter") > 0 && incoming > FIELD.maxSpeed * 0.7 && !wide && !opts?.auto) {
        boost *= 2;
        special = special || "counter";
      }
      // Aposta / Ressonância / Ímpeto / Estopim
      if (dur(f, "gambit") > 0) boost *= 1.4;
      const behind = side === 0 ? sim.s0 < sim.s1 : sim.s1 < sim.s0;
      if (dur(f, "resonance") > 0 && behind) boost *= 1.22;
      if (dur(f, "momentum") > 0) { sim.mom[side] = Math.min(10, sim.mom[side] + 1); boost *= 1 + sim.mom[side] * 0.04; }
      const fuseOn = dur(sim.fx[0], "fuse") > 0 || dur(sim.fx[1], "fuse") > 0;
      if (fuseOn) boost *= 1.08;

      const off = wide ? (sim.bx - FIELD.w / 2) / (FIELD.w / 2) : (sim.bx - px) / hw;
      const speedCap = FIELD.maxSpeed * (fury ? 1.5 : special ? 1.7 : 1);
      const speed = Math.min(speedCap, incoming * boost);
      let angle = reflex ? off * 0.5 : off * 0.9;
      if (spikes) angle += (Math.random() - 0.5) * 0.85;
      if (bulwark || heavy) angle = 0;
      // Bifurcação: mira automática no canto mais longe do rival
      if (dur(f, "fork") > 0 && !wide && !opts?.auto) {
        delete f.fork;
        const foeX = side === 0 ? sim.p1 : sim.p0;
        const aimX = foeX > FIELD.w / 2 ? FIELD.w * 0.1 : FIELD.w * 0.9;
        angle = Math.max(-0.9, Math.min(0.9, (aimX - sim.bx) * 1.5));
        special = special || "fork";
      }
      sim.vx = Math.sin(angle) * speed;
      sim.vy = dirSign * Math.abs(Math.cos(angle) * speed);
      sim.by = py + dirSign * (R + FIELD.paddleH * 0.6);
      sim.spin = dur(f, "curve") > 0 ? off * 1.9 : sim.spin * 0.3;
      sim.rally += 1;
      sim.lastHit = side;

      onImpact({
        x: sim.bx, y: py, t: performance.now(),
        color: special === "parry" ? "#fde047" : special === "counter" ? "#ef4444"
          : fury ? "#f97316" : spikes ? "#84cc16" : reflex ? "#fbbf24" : wide ? "#a3a3a3" : "#ffffff",
        big: fury || spikes || !!special, kind: "hit",
      });
      sfx(fury || special ? "hitHard" : "hit", Math.min(1, speed / FIELD.maxSpeed));
      return true;
    };


    // jogador 0 (baixo)
    if (sim.vy > 0) {
      if (sim.by + R >= y0 && prevY + R <= y0 + 0.07) hit(sim.p0, 0, -1, y0);
      if (dur(sim.fx[0], "clone") > 0) {
        const cy = cloneY(0);
        if (sim.by + R >= cy && prevY + R <= cy + 0.05) hit(sim.p0, 0, -1, cy);
      }
      if (dur(sim.fx[0], "sentinel") > 0) {
        const gy = sentinelY(0);
        if (sim.by + R >= gy && prevY + R <= gy + 0.05) hit(sim.g0, 0, -1, gy, { auto: true });
      }
      if (dur(sim.fx[0], "wall") > 0) {
        const wy = wallY(0);
        if (sim.by + R >= wy && prevY + R <= wy + 0.05) hit(FIELD.w / 2, 0, -1, wy, { wide: true });
      }
    }
    // jogador 1 (cima)
    if (sim.vy < 0) {
      if (sim.by - R <= y1 && prevY - R >= y1 - 0.07) hit(sim.p1, 1, 1, y1);
      if (dur(sim.fx[1], "clone") > 0) {
        const cy = cloneY(1);
        if (sim.by - R <= cy && prevY - R >= cy - 0.05) hit(sim.p1, 1, 1, cy);
      }
      if (dur(sim.fx[1], "sentinel") > 0) {
        const gy = sentinelY(1);
        if (sim.by - R <= gy && prevY - R >= gy - 0.05) hit(sim.g1, 1, 1, gy, { auto: true });
      }
      if (dur(sim.fx[1], "wall") > 0) {
        const wy = wallY(1);
        if (sim.by - R <= wy && prevY - R >= wy - 0.05) hit(FIELD.w / 2, 1, 1, wy, { wide: true });
      }
    }

    // pontos / escudo
    const award = (winner: 0 | 1) => {
      let pts = sim.mult;
      // Cofre: ponto extra em rally longo
      if (dur(sim.fx[winner], "vault") > 0 && sim.rally >= 6) {
        pts += 1;
        delete sim.fx[winner].vault;
        onImpact({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: "#facc15", big: true, kind: "goal" });
      }
      if (winner === 0) sim.s0 += pts; else sim.s1 += pts;
      // Fôlego é cancelado em quem tomou o ponto
      const loser: 0 | 1 = winner === 0 ? 1 : 0;
      delete sim.fx[loser].secondwind;
      sim.mom = [0, 0];
      sim.mult = 1;
      sim.rally = 0;
      // Sacada: quem ativou recebe o próximo saque
      if (dur(sim.fx[0], "serveback") > 0) { sim.serveOverride = 0; delete sim.fx[0].serveback; }
      else if (dur(sim.fx[1], "serveback") > 0) { sim.serveOverride = 1; delete sim.fx[1].serveback; }
    };

    if (sim.by > FIELD.h + 0.05) {
      if (dur(sim.fx[0], "shield") > 0 && !sim.fx[0].shieldUsed) {
        sim.fx[0].shieldUsed = true;
        sim.by = FIELD.h - 0.06;
        sim.vy = -Math.abs(sim.vy);
        onImpact({ x: sim.bx, y: FIELD.h - 0.04, t: performance.now(), color: "#22d3ee", big: true, kind: "power" });
        sfx("shield");
      } else {
        award(1);
        onImpact({ x: sim.bx, y: FIELD.h, t: performance.now(), color: "#f87171", big: true, kind: "goal" });
        sfx("concede");
        sim.phase = sim.s1 >= FIELD.winScore ? "over" : "point";
        sim.timer = 1.3;
        sim.serveTo = 0;
      }
    } else if (sim.by < -0.05) {
      if (dur(sim.fx[1], "shield") > 0 && !sim.fx[1].shieldUsed) {
        sim.fx[1].shieldUsed = true;
        sim.by = 0.06;
        sim.vy = Math.abs(sim.vy);
        onImpact({ x: sim.bx, y: 0.04, t: performance.now(), color: "#22d3ee", big: true, kind: "power" });
        sfx("shield");
      } else {
        award(0);
        onImpact({ x: sim.bx, y: 0, t: performance.now(), color: "#4ade80", big: true, kind: "goal" });
        sfx("goal");
        sim.phase = sim.s0 >= FIELD.winScore ? "over" : "point";
        sim.timer = 1.3;
        sim.serveTo = 1;
      }
    }
  }
}

function applyPower(sim: Sim, side: 0 | 1, id: PowerId, onImpact?: (i: Impact) => void) {
  const fx = sim.fx[side];
  const foeSide: 0 | 1 = side === 0 ? 1 : 0;
  const foe = sim.fx[foeSide];
  const base = POWER_MAP[id];
  if (!base) return;
  // Silenciar bloqueia poderes do lado afetado
  if (dur(fx, "silence") > 0) { sfx("wall"); return; }
  // Sobrecarga: o próximo poder dura o dobro
  let def = base;
  if (dur(fx, "overload") > 0 && id !== "overload" && base.duration > 0) {
    delete fx.overload;
    def = { ...base, duration: base.duration * 2 };
  }

  const at = (y: number, color = def.color, big = true) =>
    onImpact?.({ x: sim.bx, y, t: performance.now(), color, big, kind: "power" });

  switch (id) {
    /* instantâneos */
    case "teleport": {
      const cur = side === 0 ? sim.p0 : sim.p1;
      const target = Math.max(0.05, Math.min(FIELD.w - 0.05, sim.bx));
      const dx = Math.max(-0.4, Math.min(0.4, target - cur));
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
        sim.stick = null;
      }
      sim.rewindAt = performance.now();
      onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: "#facc15", big: true, kind: "rewind" });
      sfx("rewind");
      return;
    }
    case "laser": {
      const dir = side === 0 ? -1 : 1;
      const speed = FIELD.maxSpeed * 1.25;
      const off = (sim.bx - FIELD.w / 2) / (FIELD.w / 2);
      sim.vx = off * speed * 0.25;
      sim.vy = dir * speed;
      sim.spin = 0;
      sim.stick = null;
      at(sim.by);
      sfx("laser");
      return;
    }
    case "swap": {
      const a = sim.p0; sim.p0 = sim.p1; sim.p1 = a;
      onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: def.color, big: true, kind: "power" });
      sfx("portal");
      return;
    }
    case "recall": {
      serve(sim, foeSide);
      onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: def.color, big: true, kind: "power" });
      sfx("power");
      return;
    }
    case "steal": {
      const mine = side === 0 ? sim.s0 : sim.s1;
      const theirs = side === 0 ? sim.s1 : sim.s0;
      if (mine < theirs && theirs > 0) {
        if (side === 0) { sim.s0 += 1; sim.s1 -= 1; } else { sim.s1 += 1; sim.s0 -= 1; }
        onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: def.color, big: true, kind: "goal" });
        sfx("goal");
      } else {
        sfx("wall");
      }
      return;
    }

    /* ---- expansão: instantâneos ---- */
    case "dash": {
      const cur = side === 0 ? sim.p0 : sim.p1;
      const dirD = sim.bx >= cur ? 1 : -1;
      const nx = Math.max(0.05, Math.min(FIELD.w - 0.05, cur + dirD * 0.26));
      if (side === 0) sim.p0 = nx; else sim.p1 = nx;
      at(side === 0 ? FIELD.h - FIELD.paddleInset : FIELD.paddleInset);
      sfx("power");
      return;
    }
    case "shift": {
      const cur = side === 0 ? sim.p0 : sim.p1;
      const nx = FIELD.w - cur;
      if (side === 0) sim.p0 = nx; else sim.p1 = nx;
      at(side === 0 ? FIELD.h - FIELD.paddleInset : FIELD.paddleInset);
      sfx("portal");
      return;
    }
    case "taunt": {
      if (foeSide === 0) sim.p0 = FIELD.w / 2; else sim.p1 = FIELD.w / 2;
      foe.taunt = def.duration;
      foe.freeze = Math.max(dur(foe, "freeze"), def.duration);
      at(foeSide === 0 ? FIELD.h - FIELD.paddleInset : FIELD.paddleInset);
      sfx("freeze");
      return;
    }
    case "golden": {
      sim.mult = 2;
      onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: def.color, big: true, kind: "power" });
      sfx("power");
      return;
    }
    case "gambit": {
      if (side === 0) sim.s0 = Math.max(0, sim.s0 - 1); else sim.s1 = Math.max(0, sim.s1 - 1);
      fx.gambit = def.duration;
      onImpact?.({ x: FIELD.w / 2, y: FIELD.h / 2, t: performance.now(), color: def.color, big: true, kind: "power" });
      sfx("power");
      return;
    }

    /* duradouros no próprio jogador */
    case "gravity": case "portal": case "clone": case "magnet": case "speed":
    case "reflex": case "wall": case "fury": case "curve": case "slowmo":
    case "stealth": case "spikes": case "overdrive": case "giant":
    case "tiny": case "sticky":
    case "wrap": case "anchor": case "fuse": case "damp": case "fork":
    case "feather": case "root": case "split": case "counter": case "parry":
    case "tether": case "bulwark": case "secondwind": case "serveback":
    case "vault": case "netrise": case "haven": case "bubble":
    case "momentum": case "overload": case "curtain": case "resonance":
      fx[id] = def.duration;
      if (id === "momentum") sim.mom[side] = 0;
      break;
    case "sentinel":
      fx.sentinel = def.duration;
      if (side === 0) sim.g0 = sim.bx; else sim.g1 = sim.bx;
      break;
    case "shield":
      fx.shield = def.duration;
      fx.shieldUsed = false;
      break;

    /* duradouros no adversário */
    case "freeze": foe.freeze = def.duration; sfx("freeze"); break;
    case "shrink": foe.shrink = def.duration; break;
    case "ghost": foe.ghost = def.duration; break;
    case "blackhole": foe.blackhole = def.duration; break;
    case "invert": foe.invert = def.duration; break;
    case "fog": foe.fog = def.duration; break;
    case "hyper": foe.hyper = def.duration; break;
    case "quake": foe.quake = def.duration; sfx("quake"); break;
    case "vortex": foe.vortex = def.duration; break;
    case "chaos": foe.chaos = def.duration; break;
    case "ceiling": case "saw": case "current": case "heavy":
    case "blind": case "jam": case "drift": case "silence": case "leech":
    case "mirror": case "narrow": case "lead": case "deadzone":
      foe[id] = def.duration;
      break;
  }
  at(side === 0 ? FIELD.h - FIELD.paddleInset : FIELD.paddleInset);
  if (id !== "freeze" && id !== "quake") sfx("power");
}

/* ------------------------------------------------------------------ */
/* hook de rede + jogo                                                 */
/* ------------------------------------------------------------------ */

const fxEq = (a: Fx, b: Fx) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Math.abs(((a as any)[k] || 0) - ((b as any)[k] || 0)) < 0.24 || (a as any)[k] === (b as any)[k]);
};

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
  const cooldownTotalRef = useRef<number>(1);
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
      // reconciliação suave: corrige a bola sem teleportes bruscos
      const dx = p.bx - s.bx, dy = p.by - s.by;
      const far = Math.hypot(dx, dy) > 0.12 || p.ph !== s.phase;
      s.bx = far ? p.bx : s.bx + dx * 0.45;
      s.by = far ? p.by : s.by + dy * 0.45;
      s.vx = p.vx; s.vy = p.vy;
      s.p0 = p.p0;
      if (mySideRef.current !== 1) s.p1 = p.p1;
      s.g0 = p.g0 ?? s.g0; s.g1 = p.g1 ?? s.g1;
      s.stick = p.st ?? null;
      s.s0 = p.s0; s.s1 = p.s1;
      s.phase = p.ph;
      s.timer = p.tm;
      s.rally = p.ry ?? 0;
      s.fx = [mergeFx(p.fx?.[0]), mergeFx(p.fx?.[1])];
      if (p.rw && p.rw !== s.rewindAt) { s.rewindAt = performance.now(); sfx("rewind"); }
      setPhase(p.ph);
      setScore([p.s0, p.s1]);
      setCountdown(p.ph === "countdown" ? Math.max(0, Math.ceil(p.tm)) : 0);
      setFxView(s.fx);
      if (typeof p.t === "number") setLag(Math.max(0, Math.round(Date.now() - p.t)));
    });

    ch.on("broadcast", { event: "p" }, ({ payload }) => {
      if (!isHostRef.current) return;
      simRef.current.p1 = payload.x;
    });

    ch.on("broadcast", { event: "pw" }, ({ payload }) => {
      if (!isHostRef.current) return;
      applyPower(simRef.current, 1, payload.id as PowerId, pushImpact);
    });

    ch.on("broadcast", { event: "start" }, () => {
      const s = simRef.current;
      s.s0 = 0; s.s1 = 0; s.fx = [emptyFx(), emptyFx()];
      s.phase = "countdown"; s.timer = 3;
      s.hist = []; s.clock = 0;
      serve(s, 0);
      setPhase("countdown");
      setScore([0, 0]);
      startMusic();
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
      stopMusic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, me.id]);

  /* ---------------- loop principal ---------------- */
  const swArmed = useRef(false);
  useEffect(() => {
    const jamBuf: { t: number; x: number }[] = [];
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sendAcc = 0;
    let uiAcc = 0;
    let lastPhase: Phase = "lobby";
    let lastScore: [number, number] = [0, 0];
    let lastCd = -1;
    let lastFx: [Fx, Fx] = [{}, {}];

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      const side = mySideRef.current;

      // movimento da própria raquete (previsão local para ambos)
      const fxMe = sim.fx[side] ?? emptyFx();
      if (dur(fxMe, "freeze") <= 0 && dur(fxMe, "root") <= 0 && !sim.stick) {
        let spd = FIELD.paddleSpeed * (dur(fxMe, "speed") > 0 ? 1.7 : 1);
        if (dur(fxMe, "lead") > 0) spd *= 0.55;
        if (dur(fxMe, "momentum") > 0) spd *= 1 + Math.min(0.4, sim.mom[side] * 0.04);
        const cur = side === 0 ? sim.p0 : sim.p1;
        const half = paddleHalf(fxMe, sim.mom[side]);
        // Interferência: comando com atraso
        let want = targetRef.current;
        if (dur(fxMe, "jam") > 0) {
          jamBuf.push({ t: now, x: want });
          while (jamBuf.length > 1 && now - jamBuf[0].t > 260) jamBuf.shift();
          want = jamBuf[0].x;
        } else if (jamBuf.length) {
          jamBuf.length = 0;
        }
        if (dur(fxMe, "quake") > 0) want += Math.sin(now / 55) * 0.06 + (Math.random() - 0.5) * 0.02;
        // Deriva: escorrega sozinha para a lateral
        if (dur(fxMe, "drift") > 0) want += (side === 0 ? 0.22 : -0.22);
        // Corda: acompanha a bola sozinha em parte do caminho
        if (dur(fxMe, "tether") > 0) want = want * 0.55 + sim.bx * 0.45;
        const tgt = Math.max(half, Math.min(FIELD.w - half, want));
        const d = tgt - cur;
        const move = Math.sign(d) * Math.min(Math.abs(d), spd * dt);
        const nx = cur + move;
        if (side === 0) sim.p0 = nx; else sim.p1 = nx;
      }

      // Fôlego: zera a recarga quando o efeito termina sem ter sido cancelado
      if (swArmed.current && dur(fxMe, "secondwind") <= 0) {
        swArmed.current = false;
        cooldownUntilRef.current = 0;
        setCooldown(0);
        sfx("power");
      }


      if (isHostRef.current) {
        acc += dt;
        let guard = 0;
        while (acc > 1 / 120 && guard++ < 10) {
          step(sim, 1 / 120, pushImpact);
          acc -= 1 / 120;
        }
        if (guard >= 10) acc = 0;

        sendAcc += dt;
        if (sendAcc >= 0.045) {
          sendAcc = 0;
          chRef.current?.send({
            type: "broadcast",
            event: "s",
            payload: {
              bx: sim.bx, by: sim.by, vx: sim.vx, vy: sim.vy,
              p0: sim.p0, p1: sim.p1, g0: sim.g0, g1: sim.g1, st: sim.stick,
              s0: sim.s0, s1: sim.s1, ry: sim.rally,
              ph: sim.phase, tm: sim.timer, fx: sim.fx, rw: sim.rewindAt, t: Date.now(),
            },
          });
        }
      } else if (sim.phase === "playing" && !sim.stick) {
        // extrapolação suave da bola entre snapshots
        let mul = 1;
        const half = sim.by > FIELD.h / 2 ? 0 : 1;
        if (dur(sim.fx[half], "slowmo") > 0) mul *= 0.55;
        if (dur(sim.fx[half], "hyper") > 0) mul *= 1.6;
        sim.bx += sim.vx * dt * mul;
        sim.by += sim.vy * dt * mul;
        sendAcc += dt;
        if (sendAcc >= 0.045) {
          sendAcc = 0;
          chRef.current?.send({ type: "broadcast", event: "p", payload: { x: sim.p1 } });
        }
      } else {
        sendAcc += dt;
        if (sendAcc >= 0.045) {
          sendAcc = 0;
          chRef.current?.send({ type: "broadcast", event: "p", payload: { x: sim.p1 } });
        }
      }

      /* ---- UI: atualiza no máximo ~10x/s e só quando muda ---- */
      uiAcc += dt;
      if (uiAcc >= 0.1) {
        uiAcc = 0;
        if (isHostRef.current) {
          if (sim.phase !== lastPhase) { lastPhase = sim.phase; setPhase(sim.phase); }
          if (sim.s0 !== lastScore[0] || sim.s1 !== lastScore[1]) {
            lastScore = [sim.s0, sim.s1];
            setScore(lastScore);
          }
          const cd = sim.phase === "countdown" ? Math.max(0, Math.ceil(sim.timer)) : 0;
          if (cd !== lastCd) { lastCd = cd; setCountdown(cd); if (cd > 0) sfx("count"); else if (sim.phase === "playing") sfx("go"); }
          if (!fxEq(sim.fx[0], lastFx[0]) || !fxEq(sim.fx[1], lastFx[1])) {
            lastFx = [{ ...sim.fx[0] }, { ...sim.fx[1] }];
            setFxView(lastFx);
          }
        }
        const cdLeft = Math.max(0, (cooldownUntilRef.current - Date.now()) / 1000);
        setCooldown(cdLeft);
        setIntensity(Math.min(1, sim.rally / 8 + (sim.phase === "playing" ? 0.25 : 0)));
      }
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
  const setTarget = useCallback((x: number) => {
    const fxMe = simRef.current.fx[mySideRef.current] ?? {};
    targetRef.current = dur(fxMe, "invert") > 0 ? FIELD.w - x : x;
  }, []);

  const choosePower = useCallback((id: PowerId | null) => {
    setMyPower(id);
    myPowerRef.current = id;
    sfx("select");
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
    ensureAudio();
    const mine = simRef.current.fx[mySideRef.current] ?? {};
    if (dur(mine, "silence") > 0) { sfx("wall"); return; }
    let factor = 1;
    if (dur(mine, "overdrive") > 0) factor *= 0.5;
    if (dur(mine, "gambit") > 0) factor *= 0.5;
    if (dur(mine, "leech") > 0) factor *= 2;
    const total = POWER_MAP[id].cooldown * factor;
    cooldownTotalRef.current = total;
    cooldownUntilRef.current = Date.now() + total * 1000;
    setCooldown(total);
    if (id === "secondwind") swArmed.current = true;
    if (isHostRef.current) {
      applyPower(simRef.current, 0, id, pushImpact);
    } else {
      chRef.current?.send({ type: "broadcast", event: "pw", payload: { id } });
      pushImpact({ x: simRef.current.p1, y: FIELD.paddleInset, t: performance.now(), color: POWER_MAP[id].color, big: true, kind: "power" });
      sfx("power");
      if (id === "teleport") {
        const cur = simRef.current.p1;
        const dx = Math.max(-0.4, Math.min(0.4, simRef.current.bx - cur));
        simRef.current.p1 = cur + dx;
        targetRef.current = cur + dx;
      }
      if (id === "dash") {
        const cur = simRef.current.p1;
        const nx = Math.max(0.05, Math.min(FIELD.w - 0.05, cur + (simRef.current.bx >= cur ? 0.26 : -0.26)));
        simRef.current.p1 = nx; targetRef.current = nx;
      }
      if (id === "shift") {
        const nx = FIELD.w - simRef.current.p1;
        simRef.current.p1 = nx; targetRef.current = nx;
      }
      if (id === "rewind") { simRef.current.rewindAt = performance.now(); sfx("rewind"); }
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
    ensureAudio();
    startMusic();
    chRef.current?.send({ type: "broadcast", event: "start", payload: {} });
  }, []);

  useEffect(() => {
    if (phase === "over") {
      stopMusic();
      const won = mySide === 0 ? score[0] > score[1] : score[1] > score[0];
      sfx(won ? "win" : "lose");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return {
    sim: simRef, impacts: impactsRef,
    peers: sorted, opponent, connected, lag, opponentGone,
    phase, score, countdown, fxView, mySide, isHost,
    myPower, cooldown, cooldownTotal: cooldownTotalRef.current,
    setTarget, choosePower, usePower, startMatch,
  };
}

/* ------------------------------------------------------------------ */
/* canvas — camada gráfica                                             */
/* ------------------------------------------------------------------ */

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav?: number };

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
  const trail = useRef<{ x: number; y: number; t: number; r: number }[]>([]);
  const parts = useRef<Particle[]>([]);
  const stars = useRef<{ x: number; y: number; z: number; s: number }[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const bgRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { setArenaTrack(arena); }, [arena]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;
    const arenaDef = ARENAS.find((a) => a.id === arena) ?? ARENAS[0];
    const pSkin = PADDLE_SKINS.find((s) => s.id === paddleSkin) ?? PADDLE_SKINS[0];
    const bSkin = BALL_SKINS.find((s) => s.id === ballSkin) ?? BALL_SKINS[0];

    if (!stars.current.length) {
      stars.current = Array.from({ length: 90 }, () => ({
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
    let frameSkip = 0;
    let fpsAvg = 60;

    const burst = (x: number, y: number, color: string, count: number, power = 1) => {
      const n = Math.round(count * (fpsAvg < 45 ? 0.5 : 1));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.15 + Math.random() * 0.65) * power;
        parts.current.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0, max: 0.35 + Math.random() * 0.55,
          color, size: (1 + Math.random() * 2.6) * power,
          grav: 0.25,
        });
      }
      if (parts.current.length > 380) parts.current.splice(0, parts.current.length - 380);
    };

    /* fundo estático pré-renderizado (nebulosas + grade) */
    const buildBg = (W: number, H: number, dpr: number) => {
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const c = off.getContext("2d");
      if (!c) return off;
      const g = c.createLinearGradient(0, 0, W * 0.3, H);
      g.addColorStop(0, arenaDef.bg[0]);
      g.addColorStop(1, arenaDef.bg[1]);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      c.globalCompositeOperation = "lighter";
      for (let n = 0; n < 4; n++) {
        const cx = W * (0.15 + 0.24 * n);
        const cy = H * (0.12 + 0.26 * n);
        const rad = Math.min(W, H) * (0.4 + n * 0.12);
        const rg = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
        rg.addColorStop(0, hexA(n % 2 ? arenaDef.accent : arenaDef.glow, 0.11));
        rg.addColorStop(1, hexA(n % 2 ? arenaDef.accent : arenaDef.glow, 0));
        c.fillStyle = rg;
        c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill();
      }
      c.globalCompositeOperation = "source-over";

      // grade em perspectiva suave
      c.strokeStyle = hexA(arenaDef.glow, 0.09);
      c.lineWidth = Math.max(1, dpr * 0.7);
      for (let i = 1; i < 12; i++) {
        const y = (H / 12) * i;
        c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const x = (W / 8) * i;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      }
      // textura sutil
      c.globalAlpha = 0.05;
      for (let i = 0; i < 900; i++) {
        c.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
        c.fillRect(Math.random() * W, Math.random() * H, dpr, dpr);
      }
      c.globalAlpha = 1;
      return off;
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      fpsAvg = fpsAvg * 0.92 + (1 / Math.max(0.001, dt)) * 0.08;
      const el = (now - start) / 1000;

      // em dispositivos fracos, desenha a 30fps
      if (fpsAvg < 42 && (frameSkip = (frameSkip + 1) % 2) === 1) return;

      const dpr = Math.min(fpsAvg < 45 ? 1.4 : 2, window.devicePixelRatio || 1);
      const rect = cv.getBoundingClientRect();
      const wantW = Math.floor(rect.width * dpr);
      const wantH = Math.floor(rect.height * dpr);
      if (cv.width !== wantW || cv.height !== wantH) {
        cv.width = wantW; cv.height = wantH;
        bgRef.current = null;
      }
      const W = cv.width, H = cv.height;
      if (!W || !H) return;
      if (!bgRef.current) bgRef.current = buildBg(W, H, dpr);

      const sx = W / FIELD.w, sy = H / FIELD.h;
      const sim = simRef.current;
      const flip = mySide === 1;
      const fy = (y: number) => (flip ? FIELD.h - y : y) * sy;
      const fxp = (x: number) => (flip ? FIELD.w - x : x) * sx;

      const f0 = mergeFx(sim.fx?.[0]);
      const f1 = mergeFx(sim.fx?.[1]);
      const fxBySide = [f0, f1] as const;
      const meFx = fxBySide[mySide];
      const foeSide: 0 | 1 = mySide === 0 ? 1 : 0;
      const foeFx = fxBySide[foeSide];
      const R = ballRadius(sim);

      // ---- novos impactos viram partículas
      for (const i of impactsRef.current) {
        const key = i.t;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        if (i.kind === "goal") { burst(fxp(i.x), fy(i.y), i.color, 50, 1.7); shake = Math.max(shake, 15); }
        else if (i.kind === "power") { burst(fxp(i.x), fy(i.y), i.color, 34, 1.25); shake = Math.max(shake, 7); }
        else if (i.kind === "rewind") { burst(W / 2, H / 2, "#facc15", 64, 1.8); shake = Math.max(shake, 11); }
        else { burst(fxp(i.x), fy(i.y), i.color, i.big ? 28 : 12, i.big ? 1.5 : 0.8); shake = Math.max(shake, i.big ? 9 : 3.2); }
      }
      if (seen.current.size > 200) seen.current = new Set();

      if (dur(meFx, "quake") > 0) shake = Math.max(shake, 6);

      const rewinding = sim.rewindAt && now - sim.rewindAt < 900 ? 1 - (now - sim.rewindAt) / 900 : 0;

      ctx.save();
      shake = Math.max(0, shake - dt * 34);
      if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake * dpr, (Math.random() - 0.5) * shake * dpr);

      /* fundo -------------------------------------------------- */
      ctx.drawImage(bgRef.current, 0, 0);

      // estrelas com parallax leve seguindo a bola
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const st of stars.current) {
        const px = (st.x * W + Math.sin(el * 0.1 * st.z) * 8 * dpr + (sim.bx - 0.5) * 26 * dpr * st.z + W) % W;
        const py = (st.y * H + el * 7 * st.z * dpr) % H;
        ctx.globalAlpha = 0.2 + st.z * 0.55 * (0.6 + 0.4 * Math.sin(el * 2 + st.x * 10));
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(px, py, st.s * st.z * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      /* buraco negro -------------------------------------------- */
      for (const side of [0, 1] as const) {
        if (dur(fxBySide[side], "blackhole") <= 0) continue;
        const hx = fxp(FIELD.w / 2), hy = fy(holeY(side));
        const rad = Math.min(W, H) * 0.19;
        ctx.save();
        const hg = ctx.createRadialGradient(hx, hy, rad * 0.1, hx, hy, rad);
        hg.addColorStop(0, "rgba(0,0,0,0.95)");
        hg.addColorStop(0.6, hexA("#818cf8", 0.35));
        hg.addColorStop(1, hexA("#818cf8", 0));
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, rad, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexA("#c7d2fe", 0.5);
        ctx.lineWidth = 1.5 * dpr;
        for (let a = 0; a < 3; a++) {
          ctx.beginPath();
          for (let k = 0; k < 42; k++) {
            const th = k * 0.22 + el * 2.4 + a * 2.1;
            const rr = rad * (0.16 + k * 0.019);
            const X = hx + Math.cos(th) * rr, Y = hy + Math.sin(th) * rr * 0.85;
            k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
          }
          ctx.globalAlpha = 0.4;
          ctx.stroke();
        }
        ctx.restore();
      }

      /* vórtice --------------------------------------------------- */
      for (const side of [0, 1] as const) {
        if (dur(fxBySide[side], "vortex") <= 0) continue;
        const cx = fxp(FIELD.w / 2), cy = fy(holeY(side));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexA("#22c55e", 0.28);
        ctx.lineWidth = 2 * dpr;
        for (let a = 0; a < 4; a++) {
          ctx.beginPath();
          for (let k = 0; k < 50; k++) {
            const th = k * 0.3 - el * 3 + a * 1.57;
            const rr = Math.min(W, H) * (0.02 + k * 0.006);
            const X = cx + Math.cos(th) * rr, Y = cy + Math.sin(th) * rr;
            k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      /* linha central + moldura ---------------------------------- */
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
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.12 * (1 + 0.03 * Math.sin(el * 3)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = hexA(arenaDef.glow, 0.32);
      ctx.shadowBlur = 22 * dpr;
      ctx.strokeRect(dpr, dpr, W - dpr * 2, H - dpr * 2);
      ctx.restore();

      /* muralhas -------------------------------------------------- */
      const drawWall = (side: 0 | 1) => {
        const f = fxBySide[side];
        if (dur(f, "wall") <= 0) return;
        const y = fy(wallY(side));
        const a = Math.min(1, dur(f, "wall")) * 0.8;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const wg = ctx.createLinearGradient(0, y - 9 * dpr, 0, y + 9 * dpr);
        wg.addColorStop(0, hexA("#a3a3a3", 0));
        wg.addColorStop(0.5, hexA("#e5e7eb", a));
        wg.addColorStop(1, hexA("#a3a3a3", 0));
        ctx.fillStyle = wg;
        ctx.fillRect(0, y - 9 * dpr, W, 18 * dpr);
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1 * dpr;
        for (let x = 0; x < W; x += 18 * dpr) {
          ctx.beginPath();
          ctx.moveTo(x + ((el * 22 * dpr) % (18 * dpr)), y - 8 * dpr);
          ctx.lineTo(x, y + 8 * dpr);
          ctx.stroke();
        }
        ctx.restore();
      };
      drawWall(0); drawWall(1);

      /* rastro da bola ------------------------------------------ */
      trail.current.push({ x: sim.bx, y: sim.by, t: now, r: R });
      if (trail.current.length > 30) trail.current.shift();
      const furyBall = dur(f0, "fury") > 0 || dur(f1, "fury") > 0;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      trail.current.forEach((p, i) => {
        const k = i / trail.current.length;
        ctx.globalAlpha = k * k * 0.55;
        ctx.fillStyle = furyBall ? "rgba(249,115,22,0.6)" : bSkin.trail;
        ctx.beginPath();
        ctx.arc(fxp(p.x), fy(p.y), p.r * sx * (0.22 + k * 1.0), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      /* raquetes ------------------------------------------------- */
      const drawPaddle = (x: number, y: number, side: 0 | 1, alpha = 1, small = false) => {
        const f = fxBySide[side];
        const half = paddleHalf(f) * (small ? 0.6 : 1) * sx;
        const hh = FIELD.paddleH * sy * 1.2;
        const mine = side === mySide;
        // camuflagem: some para o rival
        let a = alpha;
        if (dur(f, "stealth") > 0 && !mine) a *= 0.08;
        else if (dur(f, "stealth") > 0) a *= 0.55;
        const color = mine ? pSkin.color : "#94a3b8";
        const trailC = mine ? pSkin.trail : "#cbd5e1";
        const px = fxp(x) - half, py = fy(y) - hh / 2;
        const r = hh / 2;

        ctx.save();
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(fxp(x), fy(y), 0, fxp(x), fy(y), half * 2);
        glow.addColorStop(0, hexA(color, 0.55));
        glow.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(px - half, py - hh * 3, half * 4, hh * 7);
        ctx.globalCompositeOperation = "source-over";

        const pg = ctx.createLinearGradient(0, py, 0, py + hh);
        pg.addColorStop(0, "#ffffff");
        pg.addColorStop(0.35, trailC);
        pg.addColorStop(1, color);
        ctx.fillStyle = pg;
        ctx.shadowColor = color;
        ctx.shadowBlur = 22 * dpr;
        ctx.beginPath();
        ctx.roundRect(px, py, half * 2, hh, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.roundRect(px + r * 0.5, py + hh * 0.16, Math.max(0, half * 2 - r), hh * 0.24, hh * 0.12);
        ctx.fill();
        ctx.globalAlpha = a;

        if (dur(f, "freeze") > 0) {
          ctx.strokeStyle = hexA("#67e8f9", 0.9);
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.roundRect(px - 3 * dpr, py - 3 * dpr, half * 2 + 6 * dpr, hh + 6 * dpr, r + 3 * dpr);
          ctx.stroke();
          for (let i = 0; i < 5; i++) {
            const fxx = px + (half * 2 * (i + 0.5)) / 5;
            ctx.globalAlpha = a * 0.6;
            ctx.fillStyle = "#e0f2fe";
            ctx.beginPath();
            ctx.arc(fxx, py + hh / 2 + Math.sin(el * 4 + i) * 2 * dpr, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = a;
          }
        }
        if (dur(f, "shield") > 0 && !f.shieldUsed) {
          ctx.globalCompositeOperation = "lighter";
          const sa = 0.3 + 0.2 * Math.sin(el * 5);
          ctx.strokeStyle = hexA("#22d3ee", sa + 0.35);
          ctx.lineWidth = 3 * dpr;
          ctx.beginPath();
          const arcY = fy(y) + (side === mySide ? -hh : hh);
          ctx.ellipse(fxp(x), arcY, half * 1.6, hh * 2.6, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
        if (dur(f, "fury") > 0) {
          ctx.globalCompositeOperation = "lighter";
          for (let i = 0; i < 6; i++) {
            const fxx = px + (half * 2 * (i + 0.5)) / 6;
            const hgt = (6 + Math.abs(Math.sin(el * 9 + i)) * 14) * dpr;
            ctx.fillStyle = hexA("#f97316", 0.5);
            ctx.beginPath();
            ctx.ellipse(fxx, py + (side === mySide ? -hgt / 2 : hh + hgt / 2), 3.5 * dpr, hgt / 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalCompositeOperation = "source-over";
        }
        if (dur(f, "spikes") > 0) {
          ctx.fillStyle = hexA("#84cc16", 0.85);
          for (let i = 0; i < 7; i++) {
            const fxx = px + (half * 2 * (i + 0.5)) / 7;
            const dir = side === mySide ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(fxx - 3 * dpr, py + (dir < 0 ? 0 : hh));
            ctx.lineTo(fxx + 3 * dpr, py + (dir < 0 ? 0 : hh));
            ctx.lineTo(fxx, py + (dir < 0 ? -7 * dpr : hh + 7 * dpr));
            ctx.closePath();
            ctx.fill();
          }
        }
        if (dur(f, "overdrive") > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = hexA("#fde047", 0.5 + 0.3 * Math.sin(el * 8));
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath();
          ctx.roundRect(px - 5 * dpr, py - 5 * dpr, half * 2 + 10 * dpr, hh + 10 * dpr, r + 5 * dpr);
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.restore();
      };

      drawPaddle(sim.p0, FIELD.h - FIELD.paddleInset, 0);
      drawPaddle(sim.p1, FIELD.paddleInset, 1);
      if (dur(f0, "clone") > 0) drawPaddle(sim.p0, cloneY(0), 0, 0.45);
      if (dur(f1, "clone") > 0) drawPaddle(sim.p1, cloneY(1), 1, 0.45);
      if (dur(f0, "sentinel") > 0) drawPaddle(sim.g0, sentinelY(0), 0, 0.75, true);
      if (dur(f1, "sentinel") > 0) drawPaddle(sim.g1, sentinelY(1), 1, 0.75, true);

      /* bola ------------------------------------------------------ */
      const ballInMyHalf = mySide === 0 ? sim.by > FIELD.h / 2 : sim.by < FIELD.h / 2;
      const ballAlpha = dur(meFx, "ghost") > 0 && ballInMyHalf ? 0.12 : 1;
      const bx = fxp(sim.bx), by = fy(sim.by);
      const br = R * sx;
      ctx.save();
      ctx.globalAlpha = ballAlpha;
      ctx.globalCompositeOperation = "lighter";
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br * 3.4);
      bg.addColorStop(0, hexA(furyBall ? "#fb923c" : bSkin.color, 0.9));
      bg.addColorStop(1, hexA(furyBall ? "#f97316" : bSkin.color, 0));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, br * 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const core = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.08, bx, by, br);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.6, furyBall ? "#fdba74" : bSkin.color);
      core.addColorStop(1, furyBall ? "#ea580c" : hexA(bSkin.color, 0.85));
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      // anel de spin
      if (Math.abs(sim.spin) > 0.05) {
        ctx.strokeStyle = hexA("#2dd4bf", 0.75);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(bx, by, br * 1.6, el * 8 * Math.sign(sim.spin), el * 8 * Math.sign(sim.spin) + Math.PI);
        ctx.stroke();
      }
      if (furyBall) {
        ctx.strokeStyle = hexA("#fdba74", 0.8);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(bx, by, br * (1.5 + 0.15 * Math.sin(el * 12)), el * 4, el * 4 + Math.PI * 1.3);
        ctx.stroke();
      }
      if (sim.stick) {
        ctx.strokeStyle = hexA("#eab308", 0.8);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(bx, by, br * (1.9 + 0.2 * Math.sin(el * 14)), 0, Math.PI * 2);
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
        p.vy += (p.grav ?? 0) * sy * dt * 0.35;
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
        const rad = (i.kind === "goal" ? 150 : i.big ? 105 : 48) * dpr * (1 - Math.pow(1 - t, 2));
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.strokeStyle = i.color;
        ctx.lineWidth = (i.big ? 4 : 2.5) * dpr * (1 - t);
        ctx.beginPath();
        ctx.arc(fxp(i.x), fy(i.y), rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      /* neblina no meu campo -------------------------------------- */
      if (dur(meFx, "fog") > 0) {
        const top = mySide === 0 ? H / 2 : 0;
        ctx.save();
        const fg = ctx.createLinearGradient(0, top, 0, top + H / 2);
        const strong = Math.min(1, dur(meFx, "fog") / 1.5);
        fg.addColorStop(0, hexA("#cbd5e1", 0.12 * strong));
        fg.addColorStop(0.6, hexA("#94a3b8", 0.55 * strong));
        fg.addColorStop(1, hexA("#e2e8f0", 0.7 * strong));
        ctx.fillStyle = fg;
        ctx.fillRect(0, top, W, H / 2);
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const cx = ((el * (12 + i * 7) + i * 180) % (W + 300)) - 150;
          const cy = top + (H / 2) * (0.2 + 0.14 * i);
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 150 * dpr);
          rg.addColorStop(0, hexA("#f8fafc", 0.14 * strong));
          rg.addColorStop(1, hexA("#f8fafc", 0));
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.arc(cx, cy, 150 * dpr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      /* inversão de controles ------------------------------------- */
      if (dur(meFx, "invert") > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexA("#f0abfc", 0.25 + 0.15 * Math.sin(el * 6));
        ctx.lineWidth = 5 * dpr;
        ctx.strokeRect(3 * dpr, 3 * dpr, W - 6 * dpr, H - 6 * dpr);
        ctx.restore();
      }

      /* efeito de retorno no tempo -------------------------------- */
      if (rewinding > 0) {
        ctx.save();
        ctx.globalAlpha = rewinding * 0.4;
        ctx.fillStyle = "#facc15";
        ctx.globalCompositeOperation = "overlay";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = rewinding * 0.3;
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1 * dpr;
        for (let y = 0; y < H; y += 6 * dpr) {
          ctx.beginPath(); ctx.moveTo(0, y + ((el * 200) % (6 * dpr))); ctx.lineTo(W, y); ctx.stroke();
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
      const statusColor =
        dur(meFx, "freeze") > 0 ? "#67e8f9"
          : dur(meFx, "shrink") > 0 ? "#fb7185"
            : dur(meFx, "chaos") > 0 ? "#e879f9"
              : dur(meFx, "ghost") > 0 ? "#e5e7eb"
                : dur(foeFx, "fury") > 0 ? "#f97316"
                  : null;
      if (statusColor) {
        ctx.save();
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, hexA(statusColor, 0));
        vg.addColorStop(1, hexA(statusColor, 0.28));
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // vinheta cinematográfica
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.8);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.5)");
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
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); ensureAudio(); handle(e); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") handle(e); }}
    />
  );
}

export { POWERS };
