import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PROVIDER_LABEL } from "@/lib/watch/adapters";
import { Radio, Users } from "lucide-react";

export function WatchRoomsRail() {
  const rooms = useQuery({
    queryKey: ["feed-watch-rooms"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_public_watch_rooms", { _limit: 10 });
      if (error) return [];
      return (data ?? []) as any[];
    },
  });

  if (!rooms.data?.length) return null;

  return (
    <section className="space-y-2 px-4 pb-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Radio className="h-4 w-4 text-muted-foreground" /> Salas rolando agora
        </h2>
        <Link to="/watch" className="text-xs font-medium text-muted-foreground transition hover:text-foreground">
          Ver todas
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {rooms.data.map((r: any) => (
          <Link
            key={r.id}
            to="/watch/$roomId"
            params={{ roomId: r.id }}
            className="w-44 shrink-0 rounded-2xl border border-white/[0.06] bg-[color:var(--surface)] p-3 transition active:scale-[0.97]"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {PROVIDER_LABEL[r.provider as keyof typeof PROVIDER_LABEL] ?? r.provider}
            </div>
            <div className="mt-1 truncate text-[13px] font-semibold">{r.title ?? "Sala de assistir"}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              {r.member_count ?? 1} assistindo
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
