import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const MOODS = [
  { key: "fogo", emoji: "🔥", label: "Foguete" },
  { key: "feliz", emoji: "😄", label: "Feliz" },
  { key: "tranquilo", emoji: "🌙", label: "Tranquilo" },
  { key: "cansado", emoji: "🥱", label: "Cansado" },
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

/** Vibe Check compacto: uma linha só, sem empurrar o feed. */
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
      <div className="flex h-12 items-center gap-2 rounded-full border border-border/60 bg-[color:var(--surface)]/70 pl-4 pr-1.5 backdrop-blur-xl">
        {showPicker ? (
          <>
            <span className="shrink-0 text-[12px] font-medium text-muted-foreground">Sua vibe hoje?</span>
            <div className="ml-auto flex items-center gap-0.5">
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  disabled={!!pending}
                  onClick={() => void answer(m.key)}
                  aria-label={m.label}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full text-[20px] transition active:scale-90",
                    mine?.mood === m.key || pending === m.key ? "bg-primary/15" : "hover:bg-[color:var(--surface-2)]",
                  )}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-w-0 items-center gap-2 text-left"
              aria-label="Mudar minha vibe"
            >
              <span className="text-[20px] leading-none">{myMood?.emoji ?? "✨"}</span>
              <span className="truncate text-[13px] font-medium">Hoje: {myMood?.label ?? "Registrado"}</span>
            </button>
            {friends.length > 0 ? (
              <div className="ml-auto flex items-center gap-2 pr-2">
                <div className="flex -space-x-2">
                  {friends.slice(0, 4).map((f) => (
                    <div key={f.user_id} className="relative">
                      <UserAvatar src={f.avatar_url} name={f.display_name ?? f.username ?? ""} size="sm" className="ring-2 ring-background" />
                      <span className="absolute -bottom-1 -right-1 text-[11px]">
                        {MOODS.find((m) => m.key === f.mood)?.emoji}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground tabular">{friends.length}</span>
              </div>
            ) : (
              <span className="ml-auto pr-3 text-[11px] text-muted-foreground">Amigos ainda não responderam</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
