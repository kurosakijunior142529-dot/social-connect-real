import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Grid = number[][];
type Diff = "easy" | "medium" | "hard";

function emptyGrid(): Grid { return Array.from({ length: 9 }, () => Array(9).fill(0)); }
function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function isValid(g: Grid, r: number, c: number, n: number) {
  for (let i = 0; i < 9; i++) if (g[r][i] === n || g[i][c] === n) return false;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (g[br + i][bc + j] === n) return false;
  return true;
}

function solve(g: Grid): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (g[r][c] === 0) {
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const n of nums) {
        if (isValid(g, r, c, n)) {
          g[r][c] = n;
          if (solve(g)) return true;
          g[r][c] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

function generate(diff: Diff): { puzzle: Grid; solution: Grid } {
  const solution = emptyGrid();
  solve(solution);
  const puzzle = solution.map((row) => row.slice());
  const removeCount = diff === "easy" ? 36 : diff === "medium" ? 46 : 54;
  let removed = 0;
  while (removed < removeCount) {
    const r = Math.floor(Math.random() * 9);
    const c = Math.floor(Math.random() * 9);
    if (puzzle[r][c] !== 0) { puzzle[r][c] = 0; removed++; }
  }
  return { puzzle, solution };
}

export function GameSudoku({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [diff, setDiff] = useState<Diff>("easy");
  const [{ puzzle, solution }, setGame] = useState(() => generate("easy"));
  const [grid, setGrid] = useState<Grid>(() => puzzle.map((r) => r.slice()));
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [time, setTime] = useState(0);
  const [won, setWon] = useState(false);

  useEffect(() => {
    const g = generate(diff);
    setGame(g);
    setGrid(g.puzzle.map((r) => r.slice()));
    setSel(null);
    setTime(0);
    setWon(false);
  }, [diff]);

  useEffect(() => {
    if (won) return;
    const iv = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [won]);

  const errors = useMemo(() => {
    const err = new Set<string>();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (grid[r][c] && grid[r][c] !== solution[r][c]) err.add(`${r},${c}`);
    }
    return err;
  }, [grid, solution]);

  function setNum(n: number) {
    if (!sel || won) return;
    const [r, c] = sel;
    if (puzzle[r][c] !== 0) return;
    const next = grid.map((r) => r.slice());
    next[r][c] = n;
    setGrid(next);
    // check win
    let ok = true;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if (next[i][j] !== solution[i][j]) { ok = false; break; }
    if (ok) {
      setWon(true);
      const score = Math.max(100, 2000 - time * 3 - (diff === "easy" ? 0 : diff === "medium" ? -300 : -600));
      onGameOver(score);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 flex items-center justify-between text-xs">
        <div className="flex gap-1">
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
        <span className="tabular text-muted-foreground">⏱ {time}s</span>
      </div>
      <div className="grid grid-cols-9 gap-0 rounded-2xl overflow-hidden bg-[color:var(--surface)] p-1 aspect-square">
        {grid.map((row, r) =>
          row.map((n, c) => {
            const fixed = puzzle[r][c] !== 0;
            const isSel = sel && sel[0] === r && sel[1] === c;
            const sameNum = sel && n && grid[sel[0]][sel[1]] === n;
            const hasErr = errors.has(`${r},${c}`);
            const borderR = c % 3 === 2 && c !== 8;
            const borderB = r % 3 === 2 && r !== 8;
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setSel([r, c])}
                className={`aspect-square flex items-center justify-center text-sm font-bold ${
                  isSel ? "bg-primary/30" : sameNum ? "bg-primary/10" : "bg-transparent"
                } ${borderR ? "border-r-2 border-r-white/20" : "border-r border-r-white/5"} ${
                  borderB ? "border-b-2 border-b-white/20" : "border-b border-b-white/5"
                } ${fixed ? "text-foreground" : hasErr ? "text-red-400" : "text-primary"}`}
              >
                {n || ""}
              </button>
            );
          }),
        )}
      </div>
      <div className="mt-3 grid grid-cols-9 gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => setNum(n)}
            className="aspect-square rounded-lg bg-[color:var(--surface-2)] font-bold text-sm hover:bg-primary/20"
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between items-center">
        <Button size="sm" variant="ghost" onClick={() => setNum(0)}>Apagar</Button>
        <Button size="sm" variant="secondary" onClick={() => { const g = generate(diff); setGame(g); setGrid(g.puzzle.map((r) => r.slice())); setSel(null); setTime(0); setWon(false); }}>
          Novo jogo
        </Button>
      </div>
      {won ? <p className="text-center text-primary mt-2 font-semibold">🏆 Resolvido!</p> : null}
    </div>
  );
}
