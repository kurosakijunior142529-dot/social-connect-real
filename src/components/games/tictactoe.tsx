import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Cell = "X" | "O" | null;
type Board = Cell[];

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(b: Board): Cell | "draw" | null {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return b.every(Boolean) ? "draw" : null;
}

// Perfect minimax
function bestMove(b: Board, ai: Cell, hu: Cell): number {
  let best = -Infinity;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = ai;
    const s = minimax(b, false, ai, hu, 0);
    b[i] = null;
    if (s > best) { best = s; move = i; }
  }
  return move;
}
function minimax(b: Board, isAi: boolean, ai: Cell, hu: Cell, depth: number): number {
  const w = winner(b);
  if (w === ai) return 10 - depth;
  if (w === hu) return depth - 10;
  if (w === "draw") return 0;
  let best = isAi ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = isAi ? ai : hu;
    const s = minimax(b, !isAi, ai, hu, depth + 1);
    b[i] = null;
    best = isAi ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

export function GameTicTacToe({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [youAre, setYouAre] = useState<"X" | "O">("X");
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [reported, setReported] = useState(false);
  const w = useMemo(() => winner(board), [board]);

  function play(i: number) {
    if (board[i] || w) return;
    if (turn !== youAre) return;
    const next = board.slice();
    next[i] = youAre;
    setBoard(next);
    const post = winner(next);
    if (post) return handleEnd(post);
    setTurn(youAre === "X" ? "O" : "X");
    // AI
    setTimeout(() => {
      const ai = youAre === "X" ? "O" : "X";
      const move = bestMove(next.slice(), ai, youAre);
      if (move < 0) return;
      const after = next.slice();
      after[move] = ai;
      setBoard(after);
      const post2 = winner(after);
      if (post2) return handleEnd(post2);
      setTurn(youAre);
    }, 220);
  }

  function handleEnd(res: Cell | "draw") {
    if (reported) return;
    setReported(true);
    if (res === youAre) onGameOver(3);
    else if (res === "draw") onGameOver(1);
    else onGameOver(0);
  }

  function reset(newSide: "X" | "O" = youAre) {
    setBoard(Array(9).fill(null));
    setYouAre(newSide);
    setTurn("X");
    setReported(false);
    if (newSide === "O") {
      // AI plays first as X
      setTimeout(() => {
        const b = Array(9).fill(null) as Board;
        b[4] = "X";
        setBoard(b);
        setTurn("O");
      }, 200);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {w === "draw" ? "Empate!" : w ? (w === youAre ? "Você venceu 🎉" : "IA venceu 😔") : `Vez do ${turn}`}
        </div>
        <div className="flex gap-1 text-xs">
          <button
            className={`px-2 py-1 rounded ${youAre === "X" ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
            onClick={() => reset("X")}
          >X</button>
          <button
            className={`px-2 py-1 rounded ${youAre === "O" ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
            onClick={() => reset("O")}
          >O</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 aspect-square">
        {board.map((c, i) => (
          <button
            key={i}
            onClick={() => play(i)}
            className="rounded-2xl bg-[color:var(--surface)] text-4xl font-bold flex items-center justify-center hover:bg-[color:var(--surface-2)] transition-colors"
          >
            <span className={c === "X" ? "text-primary" : "text-orange-400"}>{c}</span>
          </button>
        ))}
      </div>
      <Button className="w-full mt-4" variant="secondary" onClick={() => reset(youAre)}>Novo jogo</Button>
    </div>
  );
}
