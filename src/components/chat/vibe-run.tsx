import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Flag, Flame, Footprints, Gauge, Minimize2, RotateCcw, Timer, Trophy, X, Zap } from "lucide-react";
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

const goalChip = (g: RunGoal) =>
  g.type === "distance" ? `${g.km} KM` : g.type === "time" ? `${g.min} MIN` : "RITMO LIVRE";

/** Pede revanche: a conversa escuta este evento e envia um novo convite. */
export function requestRematch(goal: RunGoal) {
  window.dispatchEvent(new CustomEvent("vibe-run-rematch", { detail: goal }));
}

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
              <div className="text-xs text-muted-foreground">Duelo ao vivo com mapa real, cada um no seu lugar</div>
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
            Enviar desafio
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type Person = { id: string; name: string; avatar: string | null };

/** Busca os dois participantes da conversa (quem enviou e o outro). */
function useRunPeople(conversationId: string, senderId: string) {
  const q = useQuery({
    queryKey: ["run-people", conversationId],
    staleTime: 300_000,
    enabled: !!conversationId,
    queryFn: async () => {
      const { data: c } = await supabase.from("conversations").select("user_a, user_b").eq("id", conversationId).maybeSingle();
      if (!c) return [] as Person[];
      const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", [c.user_a, c.user_b]);
      return (data ?? []).map((p: any) => ({ id: p.id, name: p.display_name || p.username || "Amigo", avatar: p.avatar_url })) as Person[];
    },
  });
  const list = q.data ?? [];
  const sender = list.find((p) => p.id === senderId) ?? null;
  const other = list.find((p) => p.id !== senderId) ?? null;
  return { sender, other };
}

const firstName = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] || "Amigo";

function Avatar({ person, accent, crown }: { person: Person | null; accent?: boolean; crown?: boolean }) {
  const name = person?.name ?? "?";
  return (
    <div className="flex w-20 flex-col items-center gap-1">
      <div className="relative">
        {crown ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-base">👑</span> : null}
        {person?.avatar ? (
          <img src={person.avatar} alt={name} className={cn("h-12 w-12 rounded-full object-cover ring-2", accent ? "ring-primary" : "ring-[color:var(--hairline)]")} />
        ) : (
          <div className={cn("grid h-12 w-12 place-items-center rounded-full text-lg font-bold ring-2",
            accent ? "bg-primary/20 text-primary ring-primary" : "bg-[color:var(--surface-2)] ring-[color:var(--hairline)]")}>
            {(name.trim()[0] ?? "?").toUpperCase()}
          </div>
        )}
      </div>
      <span className="max-w-full truncate text-[11px] font-semibold">{firstName(name)}</span>
    </div>
  );
}

export function RunInviteBody({ msg, mine, onFinish }: { msg: any; mine: boolean; onFinish?: (s: RunState) => void }) {
  const meta = msg.meta ?? {};
  const run = useRun();
  const { sender, other } = useRunPeople(msg.conversation_id, msg.sender_id);
  const active = run?.runId === meta.runId;
  if (meta.result) return <RunResultBody meta={meta} mine={mine} sender={sender} other={other} />;
  const goal: RunGoal = meta.goal ?? { type: "free" };
  const join = () => startRun({ runId: meta.runId, conversationId: msg.conversation_id, goal, onFinish });
  return (
    <div className="w-64 overflow-hidden rounded-2xl bg-[color:var(--surface)] ring-1 ring-primary/30">
      <div className="flex items-center justify-between bg-gradient-to-r from-primary/25 to-transparent px-3 py-2">
        <span className="text-[11px] font-bold tracking-wider text-primary">⚡ DESAFIO · {goalChip(goal)}</span>
        <Footprints className="h-4 w-4 text-primary" />
      </div>
      <div className="flex items-center justify-center gap-2 px-3 py-4">
        <Avatar person={sender} accent />
        <span className="animate-pulse text-sm font-black text-primary">VS</span>
        <Avatar person={other} />
      </div>
      <div className="px-3 text-center text-[13px] text-foreground/85">
        {mine
          ? (active ? "Duelo em andamento!" : `Aguardando ${firstName(other?.name)} calçar os tênis…`)
          : `${firstName(sender?.name)} te desafiou para uma disputa ao vivo!`}
      </div>
      <div className="p-3">
        <button type="button" onClick={join}
          className="h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[0_6px_20px_-6px_var(--primary)] active:scale-95">
          {active ? "Abrir placar" : mine ? "Entrar na pista ⚡" : "Aceitar desafio 🔥"}
        </button>
      </div>
    </div>
  );
}

function RunResultBody({ meta, mine, sender: senderP, other: otherP }: { meta: any; mine: boolean; sender: Person | null; other: Person | null }) {
  const r = meta.result;
  // r.me = quem enviou o resumo
  const sender = r.me, partner = r.other;
  const you = mine ? sender : partner, them = mine ? partner : sender;
  const youP = mine ? senderP : otherP, themP = mine ? otherP : senderP;
  const goal: RunGoal = meta.goal ?? { type: "free" };
  const draw = !you || !them || Math.abs((you?.meters ?? 0) - (them?.meters ?? 0)) < 5;
  const youWon = !draw && you.meters > them.meters;
  const rows: [string, (s: any) => string][] = [
    ["Distância", (s) => `${(s.meters / 1000).toFixed(2)} km`],
    ["Tempo", (s) => fmtTime(s.ms)],
    ["Pace médio", (s) => `${fmtPace(s.pace)}/km`],
    ["Vel. máx.", (s) => `${((s.maxSpeed ?? 0) * 3.6).toFixed(1)} km/h`],
    ["Calorias", (s) => `${s.kcal} kcal`],
  ];
  return (
    <div className="w-72 overflow-hidden rounded-2xl bg-[color:var(--surface)] ring-1 ring-primary/30">
      <div className="bg-gradient-to-br from-primary/30 via-primary/10 to-transparent px-3 py-3 text-center">
        <Trophy className="mx-auto h-7 w-7 text-primary" />
        <div className="mt-1 text-[15px] font-bold">
          {draw ? "Missão cumprida em dupla! 🤝" : youWon ? "Vitória sua! 🏆" : "Vitória do parceiro! 🏆"}
        </div>
        <div className="text-[11px] text-muted-foreground">{goalLabel(goal)}</div>
      </div>
      <div className="px-3 py-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-[12px]">
          <span />
          <span className={cn("text-right font-bold", youWon && "text-primary")}>Você</span>
          <span className={cn("text-right font-bold", !draw && !youWon && "text-primary")}>Parceiro</span>
          {rows.map(([label, f]) => (
            <Row3 key={label} label={label} a={you ? f(you) : "—"} b={them ? f(them) : "—"} />
          ))}
        </div>
      </div>
      <RunMap height={140} paths={[
        ...(them?.path?.length ? [{ path: them.path, me: false }] : []),
        ...(you?.path?.length ? [{ path: you.path, me: true }] : []),
      ]} showFlags />
      <div className="p-3">
        <button type="button" onClick={() => requestRematch(goal)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground active:scale-95">
          <RotateCcw className="h-4 w-4" /> Pedir revanche
        </button>
      </div>
    </div>
  );
}

function Row3({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold tabular-nums">{a}</span>
      <span className="text-right tabular-nums text-foreground/75">{b}</span>
    </>
  );
}

// ---------- Mapa real (OpenStreetMap) ----------
const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z;
};

type MapPath = { path: [number, number][]; me: boolean; label?: string };

function RunMap({ paths, height = 220, showFlags }: { paths: MapPath[]; height?: number; showFlags?: boolean }) {
  const W = 360, H = height;
  const all = paths.flatMap((p) => p.path);
  if (all.length === 0) {
    return (
      <div className="grid place-items-center bg-[color:var(--surface-2)] text-xs text-muted-foreground" style={{ height: H }}>
        Buscando sinal de GPS…
      </div>
    );
  }
  const lats = all.map((p) => p[0]), lngs = all.map((p) => p[1]);
  let z = 18;
  while (z > 3) {
    const dx = lon2x(Math.max(...lngs), z) - lon2x(Math.min(...lngs), z);
    const dy = lat2y(Math.min(...lats), z) - lat2y(Math.max(...lats), z);
    if (dx < W * 0.75 && dy < H * 0.7) break;
    z--;
  }
  const cx = (lon2x(Math.max(...lngs), z) + lon2x(Math.min(...lngs), z)) / 2;
  const cy = (lat2y(Math.max(...lats), z) + lat2y(Math.min(...lats), z)) / 2;
  const left = cx - W / 2, top = cy - H / 2;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W) / 256); tx++)
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) tiles.push({ x: tx, y: ty });
  const px = (p: [number, number]) => [lon2x(p[1], z) - left, lat2y(p[0], z) - top] as const;
  const pts = (ps: [number, number][]) => ps.map((p) => px(p).join(",")).join(" ");
  return (
    <div className="relative w-full overflow-hidden bg-[color:var(--surface-2)]" style={{ height: H }}>
      <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: W, height: H }}>
        {tiles.map((t) => (
          <img key={`${t.x}-${t.y}`} alt="" draggable={false} referrerPolicy="no-referrer-when-downgrade"
            src={`https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`}
            className="absolute select-none opacity-90 dark:[filter:invert(1)_hue-rotate(180deg)_brightness(0.85)_contrast(0.9)]"
            style={{ left: t.x * 256 - left, top: t.y * 256 - top, width: 256, height: 256 }} />
        ))}
        <svg className="absolute inset-0" width={W} height={H}>
          {paths.map((p, i) => p.path.length > 1 ? (
            <g key={i}>
              {p.me ? <polyline points={pts(p.path)} fill="none" stroke="var(--primary)" strokeOpacity={0.35} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" /> : null}
              <polyline points={pts(p.path)} fill="none" stroke={p.me ? "var(--primary)" : "var(--foreground)"} strokeOpacity={p.me ? 1 : 0.6}
                strokeWidth={p.me ? 4 : 3} strokeDasharray={p.me ? undefined : "6 5"} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : null)}
        </svg>
        {paths.map((p, i) => {
          const end = p.path[p.path.length - 1];
          if (!end) return null;
          const [x, y] = px(end);
          const [sx, sy] = px(p.path[0]);
          return (
            <div key={i}>
              {showFlags && p.path.length > 1 ? (
                <span className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background text-[10px] shadow" style={{ left: sx, top: sy }}>🏁</span>
              ) : null}
              <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
                {p.me && !showFlags ? <span className="absolute -inset-2 animate-ping rounded-full bg-primary/40" /> : null}
                <span className={cn("relative grid h-7 w-7 place-items-center rounded-full border-2 border-background text-[10px] font-bold shadow-lg",
                  p.me ? "bg-primary text-primary-foreground" : "bg-foreground text-background")}>
                  {p.label ?? (p.me ? "Eu" : "★")}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <span className="absolute bottom-1 right-1.5 rounded bg-background/70 px-1 text-[8px] text-muted-foreground">© OpenStreetMap</span>
    </div>
  );
}

function farApart(a: [number, number][], b: [number, number][]) {
  const x = a[a.length - 1], y = b[b.length - 1];
  if (!x || !y) return false;
  return Math.abs(x[0] - y[0]) > 0.03 || Math.abs(x[1] - y[1]) > 0.03; // ~3 km
}

export function LiveRunHost({ conversationId, otherName }: { conversationId: string; otherName: string }) {
  const run = useRun();
  const [viewOther, setViewOther] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    if (!run?.overtakeAt) return;
    const t = setTimeout(() => force((x) => x + 1), 2000);
    return () => clearTimeout(t);
  }, [run?.overtakeAt]);
  if (!run || run.conversationId !== conversationId) return null;
  const { me, other } = run;
  const goalM = run.goal.type === "distance" ? run.goal.km * 1000 : 0;
  const total = Math.max(me.meters, other?.meters ?? 0, goalM || 1);
  const leading = !other || me.meters >= other.meters;
  const gap = other ? Math.abs(me.meters - other.meters) : 0;
  const turbo = me.speed * 3.6 > 10;
  const showOvertake = Date.now() - run.overtakeAt < 2000;
  const initialOther = (otherName.trim()[0] ?? "?").toUpperCase();
  const apart = other ? farApart(me.path, other.path) : false;
  const mapPaths: MapPath[] = apart
    ? [viewOther ? { path: other!.path, me: false, label: initialOther } : { path: me.path, me: true }]
    : [...(other ? [{ path: other.path, me: false, label: initialOther }] : []), { path: me.path, me: true }];
  const acc = run.gpsAccuracy;
  const gpsOk = acc != null && acc <= 20;

  if (run.minimized) {
    return (
      <button type="button" onClick={() => setMinimized(false)}
        className="fixed left-1/2 top-[max(env(safe-area-inset-top),0.5rem)] z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-primary/40">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {(me.meters / 1000).toFixed(2)} km · {leading ? "Você na frente" : `${otherName} na frente`}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="flex items-center justify-between px-5">
        <div>
          <div className="text-lg font-bold">Corrida em Dupla</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {goalLabel(run.goal)}
            {run.status === "running" ? (
              <span className="flex items-center gap-1">
                <span className={cn("h-1.5 w-1.5 rounded-full", gpsOk ? "bg-primary" : "animate-pulse bg-amber-400")} />
                {gpsOk ? "GPS forte" : "Buscando satélite"}
              </span>
            ) : null}
          </div>
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
        <div className="mt-4 flex flex-1 flex-col gap-3 overflow-y-auto px-5">
          {run.status === "finished" ? (
            <div className="rounded-3xl bg-primary/15 p-4 text-center">
              <Trophy className="mx-auto h-8 w-8 text-primary" />
              <div className="mt-1 text-lg font-bold">{leading ? "Você venceu! 🎉" : `${otherName} venceu!`}</div>
              <div className="text-xs text-muted-foreground">O resumo foi enviado na conversa</div>
            </div>
          ) : null}

          <div className="relative overflow-hidden rounded-3xl ring-1 ring-[color:var(--hairline)]">
            <RunMap paths={mapPaths} height={230} />
            {apart ? (
              <button type="button" onClick={() => setViewOther((v) => !v)}
                className="absolute left-2 top-2 rounded-full bg-background/85 px-3 py-1 text-[11px] font-semibold shadow backdrop-blur">
                {viewOther ? "Ver meu percurso" : `Ver percurso de ${otherName}`}
              </button>
            ) : null}
            {showOvertake ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-primary/20 animate-in fade-in zoom-in-90">
                <div className="rounded-2xl bg-background/90 px-4 py-2 text-center text-lg font-black text-primary shadow-xl">
                  {leading ? "ULTRAPASSOU! 🚀" : `${otherName} passou você!`}
                </div>
              </div>
            ) : null}
          </div>

          <div className={cn("space-y-3 rounded-3xl bg-[color:var(--surface)] p-4 ring-1 transition", turbo ? "ring-primary shadow-[0_0_30px_-8px_var(--primary)]" : "ring-[color:var(--hairline)]")}>
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>QUEM ESTÁ NA FRENTE</span>
              {other ? <span className="text-primary">{gap < 1000 ? `${Math.round(gap)} m` : `${(gap / 1000).toFixed(2)} km`} de diferença</span> : null}
            </div>
            <Track label="Você" initial="Eu" m={me.meters} total={total} me turbo={turbo} />
            <Track label={otherName} initial={initialOther} m={other?.meters ?? 0} total={total} waiting={!other} turbo={!!other && other.speed * 3.6 > 10} />
            {goalM ? <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground"><Flag className="h-3 w-3" /> faltam {Math.max(0, (goalM - Math.max(me.meters, other?.meters ?? 0)) / 1000).toFixed(2)} km</div> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Footprints className="h-4 w-4" />} label="Distância" value={`${(me.meters / 1000).toFixed(2)} km`} sub={other ? `${otherName}: ${(other.meters / 1000).toFixed(2)}` : undefined} />
            <Stat icon={<Timer className="h-4 w-4" />} label="Tempo" value={fmtTime(me.ms)} />
            <Stat icon={<Gauge className="h-4 w-4" />} label="Ritmo" value={`${fmtPace(me.pace)}/km`} sub={other ? `${otherName}: ${fmtPace(other.pace)}` : undefined} />
            <Stat icon={<Flame className="h-4 w-4" />} label="Calorias" value={`${me.kcal} kcal`} sub={other ? `${otherName}: ${other.kcal}` : undefined} />
          </div>
          <div className={cn("flex items-center justify-center gap-2 rounded-2xl py-2 text-sm font-semibold", turbo ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
            {turbo ? <Zap className="h-4 w-4 animate-pulse" /> : null}
            {(me.speed * 3.6).toFixed(1)} km/h {turbo ? "· MODO TURBO" : ""}
          </div>
          {run.gpsError ? <div className="rounded-2xl bg-destructive/15 p-3 text-sm text-destructive">{run.gpsError}. Libere a localização para medir sua distância.</div> : null}
        </div>
      )}

      {run.status === "running" ? (
        <div className="px-5">
          <button type="button" onClick={finishRun} className="mt-3 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground active:scale-[0.98]">Encerrar e enviar resumo</button>
        </div>
      ) : null}
    </div>
  );
}

function Countdown({ startedAt }: { startedAt: number }) {
  const [, f] = useState(0);
  useEffect(() => { const t = setInterval(() => f((x) => x + 1), 150); return () => clearInterval(t); }, []);
  const left = startedAt - Date.now();
  const n = Math.ceil(left / 1000);
  return (
    <div className="grid flex-1 place-items-center">
      <div key={n} className="text-9xl font-black text-primary animate-in zoom-in-50 fade-in duration-300">{n > 0 ? n : "VAI!"}</div>
    </div>
  );
}

function Track({ label, initial, m, total, me, waiting, turbo }: { label: string; initial: string; m: number; total: number; me?: boolean; waiting?: boolean; turbo?: boolean }) {
  const pct = Math.min(100, (m / total) * 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{waiting ? "aguardando…" : `${(m / 1000).toFixed(2)} km`}</span></div>
      <div className="relative h-8 rounded-full bg-[color:var(--surface-2)]">
        <div className="absolute inset-y-[13px] left-3 right-3 border-t border-dashed border-foreground/15" />
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-700", me ? "bg-primary/30" : "bg-foreground/10")} style={{ width: `calc(${pct}% * 0.88 + 2rem)` }} />
        <span className={cn("absolute top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border-2 border-background text-[10px] font-bold shadow transition-all duration-700",
          me ? "bg-primary text-primary-foreground" : "bg-foreground text-background", turbo && "shadow-[0_0_14px_var(--primary)]")}
          style={{ left: `calc(${pct}% * 0.88 + 2px)` }}>
          {initial}
          {turbo ? <span className="absolute -left-3 text-xs">🔥</span> : null}
        </span>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--hairline)]">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
