import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Pencil, UserPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const MOODS = [
  { key: "fogo", emoji: "🔥", label: "Foguete", reply: "Que energia! Aproveita." },
  { key: "feliz", emoji: "😄", label: "Feliz", reply: "Adoramos ver isso." },
  { key: "tranquilo", emoji: "🌙", label: "Tranquilo", reply: "Dia leve é dia bom." },
  { key: "cansado", emoji: "🥱", label: "Cansado", reply: "Descansa, você merece." },
  { key: "caotico", emoji: "🌀", label: "Caótico", reply: "Força aí, amanhã melhora." },
];

type Row = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  mood: string;
  note: string | null;
  mine: boolean;
};

/** Vibe Check: um toque responde; depois mostra como os amigos estão. */
export function VibeCheckCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["vibe-checkins"],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("friends_vibe_checkins");
      if (error) return [] as Row[];
      return (data ?? []) as Row[];
    },
  });

  if (q.isLoading) return null;

  const rows = q.data ?? [];
  const mine = rows.find((r) => r.mine);
  const friends = rows.filter((r) => !r.mine);
  const myMood = MOODS.find((m) => m.key === mine?.mood);
  const showPicker = !mine || editing;

  async function answer(mood: string) {
    setPending(mood);
    await (supabase as any).rpc("set_vibe_checkin", { _mood: mood });
    await qc.invalidateQueries({ queryKey: ["vibe-checkins"] });
    setPending(null);
    setEditing(false);
  }

  return (
    <div className="px-4 pb-3">
      <div className="relative overflow-hidden rounded-[24px] border border-border bg-[color:var(--surface)] p-4 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
        />
        <div className="relative flex items-center gap-2">
          <span className="relative grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <Activity className="relative h-3.5 w-3.5" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Vibe check de hoje
          </span>
          {friends.length > 0 ? (
            <span className="ml-auto text-[11px] text-muted-foreground tabular">
              {friends.length} {friends.length === 1 ? "amigo respondeu" : "amigos responderam"}
            </span>
          ) : null}
        </div>

        {showPicker ? (
          <div className="relative">
            <div className="mt-2 font-display text-[17px] font-semibold">
              {editing ? "Mudou a vibe?" : "Como foi seu dia?"}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {MOODS.map((m) => {
                const active = mine?.mood === m.key || pending === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!!pending}
                    onClick={() => void answer(m.key)}
                    aria-label={m.label}
                    className={cn(
                      "group flex flex-col items-center gap-1 rounded-2xl border py-2.5 transition active:scale-95",
                      active
                        ? "border-primary/60 bg-primary/10"
                        : "border-transparent bg-[color:var(--surface-2)] hover:border-border",
                    )}
                  >
                    <span className="text-[24px] leading-none transition group-hover:scale-110">{m.emoji}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">{m.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Responda para ver como seus amigos estão.
              </p>
              {editing ? (
                <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-muted-foreground">
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[color:var(--surface-2)] p-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-[24px]">
                {myMood?.emoji ?? "✨"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">Hoje: {myMood?.label ?? "Registrado"}</div>
                <div className="truncate text-[12px] text-muted-foreground">{myMood?.reply ?? "Vibe registrada."}</div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Mudar vibe"
                className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--surface)] text-muted-foreground transition hover:text-foreground active:scale-95"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>

            {friends.length > 0 ? (
              <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar">
                {friends.map((r) => {
                  const mood = MOODS.find((m) => m.key === r.mood);
                  return (
                    <Link
                      key={r.user_id}
                      to="/u/$username"
                      params={{ username: r.username ?? "" }}
                      className="flex w-16 shrink-0 flex-col items-center gap-1"
                    >
                      <div className="relative rounded-full p-[2px] ring-1 ring-border">
                        <UserAvatar
                          avatarPath={r.avatar_url}
                          displayName={r.display_name ?? r.username ?? "?"}
                          className="h-12 w-12"
                        />
                        <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[color:var(--surface)] bg-[color:var(--surface-2)] text-[12px]">
                          {mood?.emoji ?? "✨"}
                        </span>
                      </div>
                      <span className="w-full truncate text-center text-[10px] font-medium">
                        {r.display_name ?? r.username}
                      </span>
                      <span className="-mt-1 text-[9px] text-muted-foreground">{mood?.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="flex-1 text-[12px] text-muted-foreground">
                  Nenhum amigo respondeu ainda. Chame a galera!
                </p>
                <Link to="/explore" className="text-[12px] font-semibold text-primary">
                  Encontrar
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
