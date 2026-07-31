import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Disc = "red" | "yellow" | null;

function connectWinner(board: Disc[]) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const disc = board[row * 7 + col];
      if (!disc) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let step = 1; step < 4; step += 1) {
          const nextRow = row + dr * step;
          const nextCol = col + dc * step;
          if (nextRow < 0 || nextRow >= 6 || nextCol < 0 || nextCol >= 7 || board[nextRow * 7 + nextCol] !== disc) break;
          count += 1;
        }
        if (count === 4) return disc;
      }
    }
  }
  return board.every(Boolean) ? "draw" : null;
}

export function GameConnectFour({ onGameOver }: { onGameOver: (score: number) => void }) {
  const [board, setBoard] = useState<Disc[]>(Array(42).fill(null));
  const [turn, setTurn] = useState<Exclude<Disc, null>>("red");
  const [reported, setReported] = useState(false);
  const winner = connectWinner(board);

  function play(column: number) {
    if (winner) return;
    for (let row = 5; row >= 0; row -= 1) {
      const index = row * 7 + column;
      if (board[index]) continue;
      const next = board.slice();
      next[index] = turn;
      setBoard(next);
      const result = connectWinner(next);
      if (result && !reported) {
        setReported(true);
        onGameOver(result === "draw" ? 1 : 4);
      }
      setTurn(turn === "red" ? "yellow" : "red");
      break;
    }
  }

  function reset() {
    setBoard(Array(42).fill(null));
    setTurn("red");
    setReported(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="flex items-center justify-between text-sm"><span>{winner === "draw" ? "Empate" : winner ? `${winner === "red" ? "Vermelho" : "Amarelo"} venceu` : `Vez de ${turn === "red" ? "Vermelho" : "Amarelo"}`}</span><Button variant="secondary" size="sm" onClick={reset}>Reiniciar</Button></div>
      <div className="grid grid-cols-7 gap-1 rounded-lg bg-primary/20 p-2">
        {board.map((disc, index) => (
          <button key={index} type="button" aria-label={`Coluna ${(index % 7) + 1}`} onClick={() => play(index % 7)} className="aspect-square rounded-full bg-background p-1">
            <span className={`block h-full w-full rounded-full ${disc === "red" ? "bg-destructive" : disc === "yellow" ? "bg-yellow-400" : "bg-muted"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function GamePong({ onGameOver }: { onGameOver: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef(0.5);
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = 360;
    const height = 480;
    canvas.width = width;
    canvas.height = height;
    let ball = { x: width / 2, y: height / 2, vx: 3, vy: 4 };
    let stopped = false;

    const frame = () => {
      if (stopped) return;
      const paddleX = pointerRef.current * (width - 90);
      ball.x += ball.vx;
      ball.y += ball.vy;
      if (ball.x < 8 || ball.x > width - 8) ball.vx *= -1;
      if (ball.y < 10) ball.vy = Math.abs(ball.vy);
      if (ball.y > height - 34 && ball.y < height - 18 && ball.x > paddleX && ball.x < paddleX + 90) {
        ball.vy = -Math.abs(ball.vy) * 1.03;
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }
      if (ball.y > height + 12) {
        onGameOver(scoreRef.current);
        ball = { x: width / 2, y: height / 2, vx: 3, vy: 4 };
        scoreRef.current = 0;
        setScore(0);
      }
      context.fillStyle = "#070907";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#22e06a";
      context.fillRect(paddleX, height - 22, 90, 8);
      context.beginPath();
      context.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
      context.fill();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return () => { stopped = true; };
  }, [onGameOver]);

  return <div className="mx-auto max-w-sm space-y-2"><div className="text-center text-xl font-bold tabular-nums">{score}</div><canvas ref={canvasRef} className="w-full rounded-lg" onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); pointerRef.current = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); }} /></div>;
}