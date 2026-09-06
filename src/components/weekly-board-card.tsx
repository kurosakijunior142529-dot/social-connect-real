import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Flame } from "lucide-react";

type Row = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  streak: number;
  messages: number;
  score: number;
};

/** Placar da semana entre amigos — vive só na aba Conversas e zera toda segunda. */
export function WeeklyBoardCard() {
  const q = useQuery({
    queryKey: ["weekly-board"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("weekly_friends_board");
      if (error) return [] as Row[];
      return ((data ?? []) as Row[]).filter((r) => r.score > 0).slice(0, 5);
    },
  });

  const rows = q.data ?? [];
  if (rows.length < 2) return null;

  return (
    <div className="px-4 pb-2">
      <div className="rounded-[22px] border border-white/[0.07] bg-[color:var(--surface)] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Placar da semana
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">zera segunda</span>
        </div>
        <div className="mt-3 space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.user_id} className="flex items-center gap-3">
              <span className="w-4 text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
              <UserAvatar
                avatarPath={r.avatar_url}
                displayName={r.display_name ?? r.username ?? "?"}
                className="h-8 w-8"
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {r.display_name ?? r.username}
              </span>
              {r.streak > 0 ? (
                <span className="flex items-center gap-1 text-[12px] text-primary tabular-nums">
                  <Flame className="h-3.5 w-3.5" />
                  {r.streak}
                </span>
              ) : null}
              <span className="w-10 text-right text-[12px] tabular-nums text-muted-foreground">
                {r.messages}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
