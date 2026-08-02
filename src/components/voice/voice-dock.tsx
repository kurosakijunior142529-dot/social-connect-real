import { Link } from "@tanstack/react-router";
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useVoice } from "@/components/voice/voice-provider";
import { useRouterState } from "@tanstack/react-router";

export function VoiceDock() {
  const { channel, status, members, micEnabled, deafened, toggleMic, toggleDeafen, leave } = useVoice();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "connected") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (!channel || status === "idle") return null;
  if (pathname === `/voice/${channel.id}`) return null;

  const speaking = members.some((m) => m.speaking);

  return (
    <div className="fixed inset-x-3 bottom-[72px] z-[90] animate-in slide-in-from-bottom-4 fade-in duration-300 md:bottom-4 md:left-auto md:right-4 md:w-80">
      <div
        className={`glass-heavy mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-3 py-2 shadow-elegant transition-colors ${
          speaking ? "border-primary/60" : "border-primary/20"
        }`}
      >
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          {speaking ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" /> : null}
          <Headphones className="h-4 w-4" />
        </span>
        <Link to="/voice/$id" params={{ id: channel.id }} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold">
            {channel.emoji ?? "🔊"} {channel.name}
          </div>
          <div className="text-xs text-primary">
            {status === "connecting"
              ? "Conectando…"
              : `${members.length} na sala · ${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`}
          </div>
        </Link>
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micEnabled ? "Silenciar microfone" : "Ativar microfone"}
          className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${
            micEnabled ? "bg-[color:var(--surface-2)]" : "bg-red-600 text-white"
          }`}
        >
          {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleDeafen}
          aria-label={deafened ? "Ativar áudio" : "Silenciar tudo"}
          className={`hidden h-9 w-9 place-items-center rounded-full transition active:scale-90 sm:grid ${
            deafened ? "bg-red-600 text-white" : "bg-[color:var(--surface-2)]"
          }`}
        >
          {deafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
        </button>
        <Link
          to="/voice/$id"
          params={{ id: channel.id }}
          aria-label="Abrir canal"
          className="hidden h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] transition active:scale-90 sm:grid"
        >
          <Maximize2 className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={leave}
          aria-label="Sair do canal"
          className="grid h-9 w-9 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition active:scale-90"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
