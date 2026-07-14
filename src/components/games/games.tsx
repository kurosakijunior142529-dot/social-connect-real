import { useCallback, useEffect, useRef, useState } from "react";

/* =====================================================================
 * 2048
 * ===================================================================== */
type Grid = number[][];
const SIZE = 4;
const empty = (): Grid => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

function addRandom(g: Grid): Grid {
  const cells: [number, number][] = [];
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) if (!g[i][j]) cells.push([i, j]);
  if (!cells.length) return g;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  const n = g.map((row) => row.slice());
  n[r][c] = Math.random() < 0.9 ? 2 : 4;
  return n;
}

function slide(row: number[]): { row: number[]; gained: number } {
  const filtered = row.filter((n) => n);
  let gained = 0;
  for (let i = 0; i < filtered.length - 1; i++) {
    if (filtered[i] === filtered[i + 1]) {
      filtered[i] *= 2;
      gained += filtered[i];
      filtered.splice(i + 1, 1);
    }
  }
  while (filtered.length < SIZE) filtered.push(0);
  return { row: filtered, gained };
}

function move(g: Grid, dir: "L" | "R" | "U" | "D"): { g: Grid; gained: number; moved: boolean } {
  let total = 0;
  let moved = false;
  let n: Grid = g.map((r) => r.slice());
  const rotate = (grid: Grid) => grid[0].map((_, i) => grid.map((r) => r[i]).reverse());
  const rotations = { L: 0, U: 1, R: 2, D: 3 }[dir];
  for (let i = 0; i < rotations; i++) n = rotate(n);
  n = n.map((r) => {
    const { row, gained } = slide(r);
    total += gained;
    if (!moved) for (let i = 0; i < SIZE; i++) if (row[i] !== r[i]) moved = true;
    return row;
  });
  for (let i = 0; i < (4 - rotations) % 4; i++) n = rotate(n);
  return { g: n, gained: total, moved };
}

export function Game2048({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [grid, setGrid] = useState<Grid>(() => addRandom(addRandom(empty())));
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const overRef = useRef(false);

  const doMove = useCallback(
    (dir: "L" | "R" | "U" | "D") => {
      if (overRef.current) return;
      const { g, gained, moved } = move(grid, dir);
      if (!moved) return;
      const next = addRandom(g);
      setGrid(next);
      const newScore = score + gained;
      setScore(newScore);
      // check over
      const dirs: ("L" | "R" | "U" | "D")[] = ["L", "R", "U", "D"];
      const canMove = dirs.some((d) => move(next, d).moved);
      if (!canMove) {
        setOver(true);
        overRef.current = true;
        onGameOver(newScore);
      }
    },
    [grid, score, onGameOver],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const map: Record<string, "L" | "R" | "U" | "D"> = {
        ArrowLeft: "L", ArrowRight: "R", ArrowUp: "U", ArrowDown: "D",
        a: "L", d: "R", w: "U", s: "D",
      };
      const d = map[e.key];
      if (d) { e.preventDefault(); doMove(d); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doMove]);

  // Touch swipe
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "R" : "L");
    else doMove(dy > 0 ? "D" : "U");
    touchRef.current = null;
  };

  const colors: Record<number, string> = {
    0: "bg-white/5",
    2: "bg-[#eee4da] text-[#776e65]",
    4: "bg-[#ede0c8] text-[#776e65]",
    8: "bg-[#f2b179] text-white",
    16: "bg-[#f59563] text-white",
    32: "bg-[#f67c5f] text-white",
    64: "bg-[#f65e3b] text-white",
    128: "bg-[#edcf72] text-white",
    256: "bg-[#edcc61] text-white",
    512: "bg-[#edc850] text-white",
    1024: "bg-[#edc53f] text-white",
    2048: "bg-primary text-primary-foreground",
  };

  const reset = () => {
    setGrid(addRandom(addRandom(empty())));
    setScore(0);
    setOver(false);
    overRef.current = false;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold tabular">{score}</div>
        <button onClick={reset} className="rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-xs">Reiniciar</button>
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="grid gap-2 rounded-2xl bg-black/20 p-2 select-none"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`, touchAction: "none" }}
      >
        {grid.flatMap((row, i) =>
          row.map((n, j) => (
            <div
              key={`${i}-${j}`}
              className={`aspect-square rounded-lg grid place-items-center font-bold text-xl transition-all ${colors[n] ?? "bg-primary text-primary-foreground"}`}
            >
              {n || ""}
            </div>
          )),
        )}
      </div>
      {over ? <p className="text-center text-sm text-muted-foreground">Fim de jogo! Pontuação salva.</p> : null}
      <p className="text-center text-xs text-muted-foreground">Setas ou deslize</p>
    </div>
  );
}

/* =====================================================================
 * Snake
 * ===================================================================== */
export function GameSnake({ onGameOver }: { onGameOver: (score: number) => void }) {
  const COLS = 20;
  const ROWS = 20;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(true);
  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }],
    dir: { x: 1, y: 0 },
    food: { x: 5, y: 5 },
    dead: false,
  });

  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(cvs.clientWidth, 360);
    cvs.width = size * dpr;
    cvs.height = size * dpr;
    ctx.scale(dpr, dpr);
    const cell = size / COLS;

    let acc = 0;
    let last = performance.now();
    let stopped = false;

    const tick = (t: number) => {
      if (stopped) return;
      acc += t - last;
      last = t;
      if (acc > 130 && running) {
        acc = 0;
        const s = stateRef.current;
        const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || s.snake.some((p) => p.x === head.x && p.y === head.y)) {
          if (!s.dead) {
            s.dead = true;
            setRunning(false);
            onGameOver(score);
          }
        } else {
          s.snake.unshift(head);
          if (head.x === s.food.x && head.y === s.food.y) {
            setScore((v) => v + 1);
            s.food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
          } else s.snake.pop();
        }
      }
      // render
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, size, size);
      const s = stateRef.current;
      ctx.fillStyle = "#d7ff3a";
      s.snake.forEach((p, i) => {
        ctx.globalAlpha = 1 - i * 0.02;
        ctx.fillRect(p.x * cell + 1, p.y * cell + 1, cell - 2, cell - 2);
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff5b7a";
      ctx.beginPath();
      ctx.arc(s.food.x * cell + cell / 2, s.food.y * cell + cell / 2, cell / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { stopped = true; };
  }, [running, score, onGameOver]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const set = (x: number, y: number) => {
        if (s.dir.x + x === 0 && s.dir.y + y === 0) return;
        s.dir = { x, y };
      };
      if (e.key === "ArrowLeft" || e.key === "a") set(-1, 0);
      if (e.key === "ArrowRight" || e.key === "d") set(1, 0);
      if (e.key === "ArrowUp" || e.key === "w") set(0, -1);
      if (e.key === "ArrowDown" || e.key === "s") set(0, 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const setDir = (x: number, y: number) => {
    const s = stateRef.current;
    if (s.dir.x + x === 0 && s.dir.y + y === 0) return;
    s.dir = { x, y };
  };

  const reset = () => {
    stateRef.current = { snake: [{ x: 10, y: 10 }], dir: { x: 1, y: 0 }, food: { x: 5, y: 5 }, dead: false };
    setScore(0);
    setRunning(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold tabular">{score}</div>
        <button onClick={reset} className="rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-xs">Reiniciar</button>
      </div>
      <canvas
        ref={canvasRef}
        className="mx-auto block w-full max-w-[360px] aspect-square rounded-2xl bg-black"
        onTouchStart={(e) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; }}
        onTouchEnd={(e) => {
          if (!swipe.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - swipe.current.x;
          const dy = t.clientY - swipe.current.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
          if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
          else setDir(0, dy > 0 ? 1 : -1);
          swipe.current = null;
        }}
        style={{ touchAction: "none" }}
      />
      <p className="text-center text-xs text-muted-foreground">Setas ou deslize</p>
    </div>
  );
}

/* =====================================================================
 * Memory
 * ===================================================================== */
const EMOJIS = ["🐶", "🐱", "🦊", "🐼", "🦁", "🐯", "🐸", "🐵"];

export function GameMemory({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [cards, setCards] = useState<{ v: string; flipped: boolean; matched: boolean }[]>([]);
  const [pick, setPick] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [start] = useState(() => Date.now());
  const [done, setDone] = useState(false);

  const shuffle = useCallback(() => {
    const deck = [...EMOJIS, ...EMOJIS]
      .map((v) => ({ v, flipped: false, matched: false }))
      .sort(() => Math.random() - 0.5);
    setCards(deck);
    setPick([]);
    setMoves(0);
    setDone(false);
  }, []);

  useEffect(() => { shuffle(); }, [shuffle]);

  const flip = (i: number) => {
    if (done || cards[i].flipped || cards[i].matched || pick.length === 2) return;
    const next = cards.map((c, idx) => idx === i ? { ...c, flipped: true } : c);
    const newPick = [...pick, i];
    setCards(next);
    setPick(newPick);
    if (newPick.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = newPick;
      if (next[a].v === next[b].v) {
        setTimeout(() => {
          setCards((cs) => cs.map((c, idx) => idx === a || idx === b ? { ...c, matched: true } : c));
          setPick([]);
          const all = next.every((c, idx) => c.v === next[a].v && (idx === a || idx === b) ? true : c.matched || (idx === a || idx === b));
          if (all) {
            setDone(true);
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const score = Math.max(1000 - moves * 10 - elapsed * 5, 50);
            onGameOver(score);
          }
        }, 350);
      } else {
        setTimeout(() => {
          setCards((cs) => cs.map((c, idx) => idx === a || idx === b ? { ...c, flipped: false } : c));
          setPick([]);
        }, 700);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Movimentos: <span className="tabular font-bold text-foreground">{moves}</span></div>
        <button onClick={shuffle} className="rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-xs">Reiniciar</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((c, i) => (
          <button
            key={i}
            onClick={() => flip(i)}
            className={`aspect-square rounded-xl text-3xl grid place-items-center transition-all ${
              c.flipped || c.matched ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)]"
            } ${c.matched ? "opacity-60" : ""}`}
          >
            {c.flipped || c.matched ? c.v : ""}
          </button>
        ))}
      </div>
      {done ? <p className="text-center text-sm text-muted-foreground">Concluído! Pontuação salva.</p> : null}
    </div>
  );
}

/* =====================================================================
 * Reaction
 * ===================================================================== */
export function GameReaction({ onGameOver }: { onGameOver: (score: number) => void }) {
  type Phase = "idle" | "waiting" | "go" | "done" | "false";
  const [phase, setPhase] = useState<Phase>("idle");
  const [ms, setMs] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const start = () => {
    setPhase("waiting");
    setMs(0);
    const delay = 900 + Math.random() * 2600;
    timerRef.current = window.setTimeout(() => {
      startRef.current = performance.now();
      setPhase("go");
    }, delay);
  };

  const click = () => {
    if (phase === "waiting") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setPhase("false");
    } else if (phase === "go") {
      const t = Math.round(performance.now() - startRef.current);
      setMs(t);
      setPhase("done");
      const score = Math.max(1000 - t, 50);
      if (best === null || t < best) setBest(t);
      onGameOver(score);
    } else {
      start();
    }
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const bg = phase === "go" ? "bg-primary text-primary-foreground" : phase === "waiting" ? "bg-red-500 text-white" : "bg-[color:var(--surface-2)]";
  const label =
    phase === "idle" ? "Toque para começar" :
    phase === "waiting" ? "Espere o verde…" :
    phase === "go" ? "TOQUE AGORA!" :
    phase === "false" ? "Cedo demais! Toque para tentar" :
    `${ms}ms — Toque para jogar de novo`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Melhor: <span className="tabular font-bold text-foreground">{best !== null ? `${best}ms` : "—"}</span></div>
      </div>
      <button
        onClick={click}
        className={`w-full aspect-square rounded-3xl grid place-items-center text-2xl font-bold transition-colors ${bg}`}
      >
        {label}
      </button>
      <p className="text-center text-xs text-muted-foreground">Reaja assim que a tela ficar verde</p>
    </div>
  );
}
