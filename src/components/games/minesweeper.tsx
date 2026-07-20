import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Flag, Bomb, Clock } from "lucide-react";

type Diff = "easy" | "medium" | "hard";
const DIFF: Record<Diff, { rows: number; cols: number; mines: number }> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 12, cols: 9, mines: 20 },
  hard: { rows: 14, cols: 9, mines: 30 },
};

type Cell = { mine: boolean; revealed: boolean; flag: boolean; adj: number };
type Board = Cell[][];

function makeBoard(rows: number, cols: number, mines: number, avoid?: [number, number]): Board {
  const board: Board = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flag: false, adj: 0 })),
  );
  const forbidden = new Set<number>();
  if (avoid) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = avoid[0] + dr, c = avoid[1] + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c);
      }
    }
  }
  let placed = 0;
  while (placed < mines) {
    const idx = Math.floor(Math.random() * rows * cols);
    if (forbidden.has(idx)) continue;
    const r = Math.floor(idx / cols), c = idx % cols;
    if (board[r][c].mine) continue;
    board[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) n++;
      }
      board[r][c].adj = n;
    }
  }
  return board;
}

function flood(board: Board, r: number, c: number) {
  const rows = board.length, cols = board[0].length;
  const st: [number, number][] = [[r, c]];
  while (st.length) {
    const [cr, cc] = st.pop()!;
    const cell = board[cr][cc];
    if (cell.revealed || cell.flag) continue;
    cell.revealed = true;
    if (cell.adj === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) st.push([nr, nc]);
      }
    }
  }
}

const COLORS = ["", "text-blue-400", "text-green-400", "text-red-400", "text-purple-400", "text-yellow-400", "text-cyan-400", "text-pink-400", "text-orange-400"];

export function GameMinesweeper({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [diff, setDiff] = useState<Diff>("easy");
  const cfg = DIFF[diff];
  const [board, setBoard] = useState<Board>(() => makeBoard(cfg.rows, cfg.cols, cfg.mines));
  const [state, setState] = useState<"idle" | "playing" | "won" | "lost">("idle");
  const [time, setTime] = useState(0);
  const [flags, setFlags] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => { reset(); /* eslint-disable-next-line */ }, [diff]);

  useEffect(() => {
    if (state !== "playing") return;
    const iv = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [state]);

  function reset() {
    setBoard(makeBoard(cfg.rows, cfg.cols, cfg.mines));
    setState("idle");
    setTime(0);
    setFlags(0);
    startedRef.current = false;
  }

  function checkWin(b: Board) {
    for (const row of b) for (const c of row) if (!c.mine && !c.revealed) return false;
    return true;
  }

  function reveal(r: number, c: number) {
    if (state === "won" || state === "lost") return;
    let b = board;
    if (!startedRef.current) {
      b = makeBoard(cfg.rows, cfg.cols, cfg.mines, [r, c]);
      startedRef.current = true;
      setState("playing");
    }
    const nb = b.map((row) => row.map((c) => ({ ...c })));
    const cell = nb[r][c];
    if (cell.flag || cell.revealed) return;
    if (cell.mine) {
      for (const row of nb) for (const c2 of row) if (c2.mine) c2.revealed = true;
      setBoard(nb);
      setState("lost");
      onGameOver(0);
      return;
    }
    flood(nb, r, c);
    setBoard(nb);
    if (checkWin(nb)) {
      setState("won");
      const score = Math.max(10, 1000 - time * 5 - (diff === "easy" ? 0 : diff === "medium" ? -200 : -400));
      onGameOver(score);
    }
  }

  function toggleFlag(e: React.MouseEvent, r: number, c: number) {
    e.preventDefault();
    if (state === "won" || state === "lost") return;
    const nb = board.map((row) => row.map((c) => ({ ...c })));
    const cell = nb[r][c];
    if (cell.revealed) return;
    cell.flag = !cell.flag;
    setBoard(nb);
    setFlags((f) => f + (cell.flag ? 1 : -1));
  }

  const cellSize = useMemo(() => (cfg.cols > 10 ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm"), [cfg.cols]);

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-1 text-xs">
          {(["easy", "medium", "hard"] as Diff[]).map((d) => (
            <button
              key={d}
              onClick={() => setDiff(d)}
              className={`px-2 py-1 rounded ${diff === d ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
            >
              {d === "easy" ? "Fácil" : d === "medium" ? "Médio" : "Difícil"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs tabular">
          <span className="inline-flex items-center gap-1"><Bomb className="h-3 w-3" /> {cfg.mines - flags}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {time}</span>
        </div>
      </div>
      <div className="rounded-2xl bg-[color:var(--surface)] p-2 inline-block mx-auto" style={{ display: "block" }}>
        <div className="mx-auto" style={{ width: "fit-content" }}>
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => (
                <button
                  key={c}
                  onClick={() => reveal(r, c)}
                  onContextMenu={(e) => toggleFlag(e, r, c)}
                  onDoubleClick={(e) => toggleFlag(e, r, c)}
                  className={`${cellSize} m-[1px] rounded flex items-center justify-center font-bold ${
                    cell.revealed
                      ? cell.mine ? "bg-red-500 text-white" : "bg-[color:var(--surface-2)]"
                      : "bg-white/10 hover:bg-white/20 active:bg-white/30"
                  }`}
                >
                  {cell.revealed
                    ? cell.mine ? "💣" : cell.adj > 0 ? <span className={COLORS[cell.adj]}>{cell.adj}</span> : ""
                    : cell.flag ? <Flag className="h-3 w-3 text-red-400" /> : ""}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Duplo toque ou clique-direito para bandeirar</p>
        <Button size="sm" variant="secondary" onClick={reset}>Novo jogo</Button>
      </div>
      {state === "won" ? <p className="text-center text-primary mt-2 font-semibold">Você venceu! 🏆</p> : null}
      {state === "lost" ? <p className="text-center text-red-400 mt-2 font-semibold">💥 Boom!</p> : null}
    </div>
  );
}
