import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const MOODS = [
  { key: "fogo", emoji: "🔥", label: "Foguete" },
  { key: "tranquilo", emoji: "🌙", label: "Tranquilo" },
  { key: "cansado", emoji: "🥱", label: "Cansado" },
  { key: "feliz", emoji: "😄", label: "Feliz" },
  { key: "caotico", emoji: "🌀", label: "Caótico" },
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

/** Vibe Check: aparece uma vez por dia, no fim da tarde. Um toque responde. */
export function VibeCheckCard() {
  const qc = useQueryClient();
  const hour = new Date().getHours();

  const q = useQuery({
    queryKey: ["vibe-checkins"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("friends_vibe_checkins");
      if (error) return [] as Row[];
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];
  const mine = rows.find((r) => r.mine);

  // Só convida a partir das 17h; se já respondeu, mostra o resultado o dia todo.
  if (!mine && hour < 17) return null;

  async function answer(mood: string) {
    await (supabase as any).rpc("set_vibe_checkin", { _mood: mood });
    qc.invalidateQueries({ queryKey: ["vibe-checkins"] });
  }

  return (
    <div className="px-4 pb-3">
      <div className="rounded-[22px] border border-white/[0.07] bg-[color:var(--surface)] p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Vibe check de hoje
        </div>
        {!mine ? (
          <>
            <div className="mt-1 text-[14px] font-medium">Como foi seu dia?</div>
            <div className="mt-3 flex items-center gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => void answer(m.key)}
                  aria-label={m.label}
                  className="grid h-11 flex-1 place-items-center rounded-2xl bg-[color:var(--surface-2)] text-[20px] transition active:scale-95"
                >
                  {m.emoji}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Responda para ver como seus amigos estão hoje.
            </p>
          </>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2 text-[14px]">
              <span className="text-[18px]">{MOODS.find((m) => m.key === mine.mood)?.emoji ?? "✨"}</span>
              <span className="text-muted-foreground">Seu dia registrado</span>
              <button
                type="button"
                onClick={() => void answer(mine.mood === "feliz" ? "fogo" : "feliz")}
                className="ml-auto text-[12px] text-primary"
              >
                Trocar
              </button>
            </div>
            {rows.filter((r) => !r.mine).length > 0 ? (
              <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar">
                {rows
                  .filter((r) => !r.mine)
                  .map((r) => (
                    <div key={r.user_id} className="flex w-14 shrink-0 flex-col items-center gap-1">
                      <div className="relative">
                        <UserAvatar
                          avatarPath={r.avatar_url}
                          displayName={r.display_name ?? r.username ?? "?"}
                          className="h-11 w-11"
                        />
                        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--surface-2)] text-[11px]">
                          {MOODS.find((m) => m.key === r.mood)?.emoji ?? "✨"}
                        </span>
                      </div>
                      <span className={cn("w-full truncate text-center text-[10px] text-muted-foreground")}>
                        {r.display_name ?? r.username}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nenhum amigo respondeu ainda hoje.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
