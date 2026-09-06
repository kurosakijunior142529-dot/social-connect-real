import { PhoneOff, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";

type Props = {
  name: string;
  avatarUrl?: string | null;
  status: string;
  startedAt: number | null;
  onExpand: () => void;
  onHangup: () => void;
};

export function CallMiniBar({ name, avatarUrl, status, startedAt, onExpand, onHangup }: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const label = startedAt
    ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
    : status;

  return (
    <div className="fixed inset-x-3 top-3 z-[95] animate-in slide-in-from-top-4 fade-in duration-300 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-full border border-white/[0.08] bg-black/70 px-3 py-2 backdrop-blur-2xl">
        <UserAvatar avatarPath={avatarUrl ?? null} displayName={name} className="h-9 w-9" />
        <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[14px] font-medium text-white">{name}</div>
          <div className="flex items-center gap-1.5 text-[12px] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="tabular-nums">{label}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={onExpand}
          aria-label="Voltar para a chamada"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-white/70 transition active:scale-90"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onHangup}
          aria-label="Encerrar chamada"
          className="grid h-9 w-9 place-items-center rounded-full bg-red-600 text-white transition active:scale-90"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
