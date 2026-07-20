import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { Button } from "@/components/ui/button";

const PIECES: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evalBoard(chess: Chess): number {
  const b = chess.board();
  let s = 0;
  for (const row of b) for (const c of row) {
    if (!c) continue;
    const v = VALUES[c.type];
    s += c.color === "w" ? v : -v;
  }
  return s;
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, maxPlayer: boolean): number {
  if (depth === 0 || chess.isGameOver()) return evalBoard(chess) * (maxPlayer ? 1 : -1);
  const moves = chess.moves();
  if (maxPlayer) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const v = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      const v = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      best = Math.min(best, v);
      beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function pickAiMove(chess: Chess, depth: number): string | null {
  const moves = chess.moves();
  if (!moves.length) return null;
  const isMax = chess.turn() === "w";
  let best = isMax ? -Infinity : Infinity;
  let choice: string[] = [];
  for (const m of moves) {
    chess.move(m);
    const v = minimax(chess, depth - 1, -Infinity, Infinity, !isMax);
    chess.undo();
    if (isMax ? v > best : v < best) { best = v; choice = [m]; }
    else if (v === best) choice.push(m);
  }
  return choice[Math.floor(Math.random() * choice.length)];
}

type Level = "easy" | "medium" | "hard";
const DEPTH: Record<Level, number> = { easy: 1, medium: 2, hard: 3 };

export function GameChess({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [level, setLevel] = useState<Level>("easy");
  const chessRef = useRef(new Chess());
  const [, force] = useState(0);
  const [sel, setSel] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Square[]>([]);
  const [thinking, setThinking] = useState(false);
  const [ended, setEnded] = useState(false);

  const board = chessRef.current.board();
  const turn = chessRef.current.turn();
  const isOver = chessRef.current.isGameOver();

  useEffect(() => {
    if (!isOver || ended) return;
    setEnded(true);
    const c = chessRef.current;
    if (c.isCheckmate()) {
      onGameOver(c.turn() === "b" ? (level === "easy" ? 100 : level === "medium" ? 300 : 600) : 0);
    } else onGameOver(50);
  }, [isOver, ended, level, onGameOver]);

  function tap(sq: Square) {
    const c = chessRef.current;
    if (thinking || isOver || c.turn() !== "w") return;
    const piece = c.get(sq);
    if (sel && legal.includes(sq)) {
      c.move({ from: sel, to: sq, promotion: "q" });
      setSel(null); setLegal([]); force((x) => x + 1);
      setTimeout(() => aiTurn(), 300);
      return;
    }
    if (piece && piece.color === "w") {
      setSel(sq);
      const moves = c.moves({ square: sq, verbose: true }) as Move[];
      setLegal(moves.map((m) => m.to as Square));
    } else {
      setSel(null); setLegal([]);
    }
  }

  function aiTurn() {
    const c = chessRef.current;
    if (c.isGameOver() || c.turn() !== "b") return;
    setThinking(true);
    setTimeout(() => {
      const move = pickAiMove(c, DEPTH[level]);
      if (move) c.move(move);
      setThinking(false);
      force((x) => x + 1);
    }, 50);
  }

  function reset() {
    chessRef.current = new Chess();
    setSel(null); setLegal([]); setEnded(false);
    force((x) => x + 1);
  }

  function undo() {
    chessRef.current.undo(); // AI move
    chessRef.current.undo(); // player move
    setSel(null); setLegal([]);
    force((x) => x + 1);
  }

  const status = useMemo(() => {
    const c = chessRef.current;
    if (c.isCheckmate()) return c.turn() === "b" ? "Xeque-mate! Você venceu 🏆" : "Xeque-mate! IA venceu";
    if (c.isDraw()) return "Empate";
    if (c.isCheck()) return "Xeque!";
    return thinking ? "IA pensando…" : turn === "w" ? "Sua vez" : "IA…";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, thinking, turn]);

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 flex items-center justify-between text-xs">
        <div className="flex gap-1">
          {(["easy", "medium", "hard"] as Level[]).map((l) => (
            <button
              key={l}
              onClick={() => { setLevel(l); reset(); }}
              className={`px-2 py-1 rounded ${level === l ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
            >
              {l === "easy" ? "Fácil" : l === "medium" ? "Médio" : "Difícil"}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground">{status}</span>
      </div>
      <div className="grid grid-cols-8 aspect-square rounded-2xl overflow-hidden shadow-elegant">
        {board.map((row, r) =>
          row.map((cell, c) => {
            const sq = `${"abcdefgh"[c]}${8 - r}` as Square;
            const light = (r + c) % 2 === 0;
            const isSel = sel === sq;
            const isLegal = legal.includes(sq);
            return (
              <button
                key={sq}
                onClick={() => tap(sq)}
                className={`relative flex items-center justify-center text-3xl leading-none ${
                  light ? "bg-[#EAD7B7]" : "bg-[#7B5E3B]"
                } ${isSel ? "ring-2 ring-primary z-10" : ""}`}
              >
                {cell ? (
                  <span className={cell.color === "w" ? "text-white drop-shadow" : "text-black"}>
                    {PIECES[cell.color + cell.type.toUpperCase()]}
                  </span>
                ) : null}
                {isLegal ? (
                  <span className={`absolute rounded-full ${cell ? "inset-1 border-4 border-primary/70" : "h-3 w-3 bg-primary/70"}`} />
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      <div className="mt-3 flex justify-between">
        <Button size="sm" variant="ghost" onClick={undo} disabled={chessRef.current.history().length < 2}>Voltar</Button>
        <Button size="sm" variant="secondary" onClick={reset}>Novo jogo</Button>
      </div>
    </div>
  );
}
