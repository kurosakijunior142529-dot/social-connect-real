import { PhoneOff, Maximize2, Phone } from "lucide-react";
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
      <div className="glass-heavy mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-primary/25 px-3 py-2 shadow-elegant">
        <span className="relative">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
          <UserAvatar avatarPath={avatarUrl ?? null} displayName={name} className="h-9 w-9 ring-2 ring-primary/50" />
        </span>
        <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Phone className="h-3 w-3" />
            <span className="tabular-nums">{label}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={onExpand}
          aria-label="Voltar para a chamada"
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] transition active:scale-90"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onHangup}
          aria-label="Encerrar chamada"
          className="grid h-9 w-9 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition active:scale-90"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
