import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { cn } from "@/lib/utils";

function fmtDur(s: number) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ""}`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Registro de chamada centralizado no histórico — não é um balão de mensagem. */
export function CallEvent({ m, outgoing }: { m: any; outgoing: boolean }) {
  const meta = m.meta ?? {};
  const video = meta.call_type === "video";
  const outcome: string = meta.outcome ?? "completed";
  const missed = outcome !== "completed";
  const kind = video ? "vídeo" : "voz";
  const title = missed
    ? outgoing
      ? outcome === "declined" ? `Chamada de ${kind} recusada` : `Chamada de ${kind} não atendida`
      : `Chamada de ${kind} perdida`
    : `Chamada de ${kind}`;
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const Icon = missed && !outgoing ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;

  return (
    <div className="my-3 flex justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)]/70 py-2 pl-2 pr-2 backdrop-blur-md">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full",
            missed && !outgoing ? "bg-destructive/12 text-destructive" : "bg-[color:var(--surface-2)] text-foreground/80",
          )}
        >
          {video ? <Video className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 pr-1">
          <div className={cn("text-[13px] font-semibold", missed && !outgoing && "text-destructive")}>{title}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {time}
            {!missed && meta.duration_s ? ` · ${fmtDur(meta.duration_s)}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("vibely:callback", { detail: video ? "video" : "audio" }))}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] text-foreground transition active:scale-90"
          aria-label="Ligar de volta"
        >
          {video ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
