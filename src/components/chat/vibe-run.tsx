import { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Flame, Footprints, Minimize2, Timer, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  closeRun, finishRun, fmtPace, fmtTime, goalLabel, setMinimized, startRun, useRun,
  type RunGoal, type RunState,
} from "@/lib/vibe-run";

const GOALS: { label: string; goal: RunGoal }[] = [
  { label: "Livre", goal: { type: "free" } },
  { label: "1 km", goal: { type: "distance", km: 1 } },
  { label: "3 km", goal: { type: "distance", km: 3 } },
  { label: "5 km", goal: { type: "distance", km: 5 } },
  { label: "15 min", goal: { type: "time", min: 15 } },
  { label: "30 min", goal: { type: "time", min: 30 } },
];

export function RunInviteDrawer({ open, onOpenChange, onSend }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSend: (goal: RunGoal) => void;
}) {
  const [i, setI] = useState(0);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-[max(env(safe-area-inset-bottom),1rem)]">
        <DrawerTitle className="sr-only">Corrida em Dupla</DrawerTitle>
        <div className="space-y-4 px-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Footprints className="h-5 w-5" /></div>
            <div>
              <div className="font-semibold">Corrida em Dupla</div>
              <div className="text-xs text-muted-foreground">Corram ou caminhem juntos, cada um no seu lugar</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {GOALS.map((g, idx) => (
              <button key={g.label} type="button" onClick={() => setI(idx)}
                className={cn("rounded-2xl border px-2 py-3 text-sm font-medium transition active:scale-95",
                  idx === i ? "border-primary bg-primary/10 text-primary" : "border-[color:var(--hairline)] bg-[color:var(--surface)]")}>
                {g.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { onSend(GOALS[i].goal); onOpenChange(false); }}
            className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground active:scale-[0.98]">
            Enviar convite
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function RunInviteBody({ msg, mine, onFinish }: { msg: any; mine: boolean; onFinish?: (s: RunState) => void }) {
  const meta = msg.meta ?? {};
  const run = useRun();
  const active = run?.runId === meta.runId;
  if (meta.result) return <RunResultBody meta={meta} mine={mine} />;
  const join = () => startRun({ runId: meta.runId, conversationId: msg.conversation_id, goal: meta.goal ?? { type: "free" }, onFinish });
  return (
    <div className="w-60 space-y-2">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><Footprints className="h-4 w-4" /></div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Corrida em Dupla</div>
          <div className="text-[11px] opacity-70">{goalLabel(meta.goal ?? { type: "free" })}</div>
        </div>
      </div>
      <div className="text-[13px] opacity-85">{mine ? "Você chamou para correr junto. Entre quando quiser." : "Te chamou para correr/caminhar junto agora!"}</div>
      <button type="button" onClick={join}
        className="h-9 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground active:scale-95">
        {active ? "Abrir placar" : mine ? "Começar" : "Aceitar desafio"}
      </button>
    </div>
  );
}

function RunResultBody({ meta, mine }: { meta: any; mine: boolean }) {
  const r = meta.result;
  const a = r.me, b = r.other;
  const won = !b || a.meters >= b.meters;
  return (
    <div className="w-60 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Resumo da corrida</div>
      <Row label={mine ? "Você" : "Ele(a)"} s={a} lead={won} />
      {b ? <Row label={mine ? "Parceiro(a)" : "Você"} s={b} lead={!won} /> : null}
      <MiniPath path={a.path ?? []} other={b?.path ?? []} />
    </div>
  );
}

function Row({ label, s, lead }: { label: string; s: any; lead: boolean }) {
  return (
    <div className={cn("rounded-xl px-2.5 py-1.5 text-[12px]", lead ? "bg-primary/15" : "bg-black/10")}>
      <div className="font-semibold">{label} {lead ? "🏆" : ""}</div>
      <div className="opacity-80">{(s.meters / 1000).toFixed(2)} km · {fmtTime(s.ms)} · {fmtPace(s.pace)}/km · {s.kcal} kcal</div>
    </div>
  );
}

function MiniPath({ path, other }: { path: [number, number][]; other: [number, number][] }) {
  const all = [...path, ...other];
  if (all.length < 2) return null;
  const lats = all.map((p) => p[0]), lngs = all.map((p) => p[1]);
  const [minA, maxA, minB, maxB] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxA - minA, maxB - minB) || 1e-5;
  const pts = (ps: [number, number][]) => ps.map(([la, ln]) => `${((ln - minB) / span) * 90 + 5},${95 - ((la - minA) / span) * 90}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-full rounded-xl bg-[color:var(--surface-2)]">
      {other.length > 1 ? <polyline points={pts(other)} fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" /> : null}
      {path.length > 1 ? <polyline points={pts(path)} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function LiveRunHost({ conversationId, otherName }: { conversationId: string; otherName: string }) {
  const run = useRun();
  if (!run || run.conversationId !== conversationId) return null;
  const { me, other } = run;
  const total = Math.max(me.meters, other?.meters ?? 0, run.goal.type === "distance" ? run.goal.km * 1000 : 1);
  const leading = !other || me.meters >= other.meters;

  if (run.minimized) {
    return (
      <button type="button" onClick={() => setMinimized(false)}
        className="fixed left-1/2 top-[max(env(safe-area-inset-top),0.5rem)] z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-[color:var(--hairline)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {(me.meters / 1000).toFixed(2)} km · {leading ? "Você na frente" : `${otherName} na frente`}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold">Corrida em Dupla</div>
          <div className="text-xs text-muted-foreground">{goalLabel(run.goal)}</div>
        </div>
        <div className="flex gap-2">
          {run.status !== "finished" ? (
            <button type="button" aria-label="Minimizar" onClick={() => setMinimized(true)} className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--surface-2)]"><Minimize2 className="h-4 w-4" /></button>
          ) : null}
          <button type="button" aria-label="Fechar" onClick={() => { if (run.status === "finished" || confirm("Sair da corrida?")) closeRun(); }} className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--surface-2)]"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {run.status === "countdown" ? (
        <Countdown startedAt={run.startedAt} />
      ) : (
        <div className="mt-6 flex flex-1 flex-col gap-4 overflow-y-auto">
          {run.status === "finished" ? (
            <div className="rounded-3xl bg-primary/15 p-4 text-center">
              <Trophy className="mx-auto h-8 w-8 text-primary" />
              <div className="mt-1 text-lg font-bold">{leading ? "Você venceu! 🎉" : `${otherName} venceu!`}</div>
              <div className="text-xs text-muted-foreground">O resumo foi enviado na conversa</div>
            </div>
          ) : null}
          <div className="space-y-3 rounded-3xl bg-[color:var(--surface)] p-4 ring-1 ring-[color:var(--hairline)]">
            <div className="text-xs font-semibold text-muted-foreground">QUEM ESTÁ NA FRENTE</div>
            <Bar label="Você" m={me.meters} total={total} highlight />
            <Bar label={otherName} m={other?.meters ?? 0} total={total} waiting={!other} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Footprints className="h-4 w-4" />} label="Distância" value={`${(me.meters / 1000).toFixed(2)} km`} sub={other ? `${otherName}: ${(other.meters / 1000).toFixed(2)}` : undefined} />
            <Stat icon={<Timer className="h-4 w-4" />} label="Tempo" value={fmtTime(me.ms)} />
            <Stat icon={<Footprints className="h-4 w-4" />} label="Ritmo" value={`${fmtPace(me.pace)}/km`} sub={other ? `${otherName}: ${fmtPace(other.pace)}` : undefined} />
            <Stat icon={<Flame className="h-4 w-4" />} label="Calorias" value={`${me.kcal} kcal`} sub={other ? `${otherName}: ${other.kcal}` : undefined} />
          </div>
          <MiniPath path={me.path} other={other?.path ?? []} />
          {run.gpsError ? <div className="rounded-2xl bg-destructive/15 p-3 text-sm text-destructive">{run.gpsError}. Libere a localização para medir sua distância.</div> : null}
          <div className="text-center text-[11px] text-muted-foreground">Velocidade atual {(me.speed * 3.6).toFixed(1)} km/h · calorias estimadas</div>
        </div>
      )}

      {run.status === "running" ? (
        <button type="button" onClick={finishRun} className="mt-4 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground active:scale-[0.98]">Encerrar e enviar resumo</button>
      ) : null}
    </div>
  );
}

function Countdown({ startedAt }: { startedAt: number }) {
  const [, f] = useState(0);
  setTimeout(() => f((x) => x + 1), 200);
  const n = Math.max(1, Math.ceil((startedAt - Date.now()) / 1000));
  return <div className="grid flex-1 place-items-center"><div className="text-8xl font-bold text-primary">{n}</div></div>;
}

function Bar({ label, m, total, highlight, waiting }: { label: string; m: number; total: number; highlight?: boolean; waiting?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted-foreground">{waiting ? "aguardando…" : `${(m / 1000).toFixed(2)} km`}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
        <div className={cn("h-full rounded-full transition-all duration-700", highlight ? "bg-primary" : "bg-foreground/50")} style={{ width: `${Math.min(100, (m / total) * 100)}%` }} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--hairline)]">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
