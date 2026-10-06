import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/signed-image";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Todos", "Criadores", "Música", "Novidades", "Tecnologia"];

export function formatMembers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi inscritos`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil inscritos`;
  return `${n} ${n === 1 ? "inscrito" : "inscritos"}`;
}

export function useChannelCounts(ids: string[]) {
  return useQuery({
    queryKey: ["channel-counts", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("channel_member_counts", { _ids: ids });
      return new Map(((data ?? []) as any[]).map((r) => [r.chat_id as string, Number(r.member_count)]));
    },
  });
}

export function ChannelDiscover() {
  const qc = useQueryClient();
  const [cat, setCat] = useState("Todos");
  const [busy, setBusy] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["discover-channels"],
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("discover_channels", { _limit: 30 });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const list = (q.data ?? []).filter((c) => cat === "Todos" || c.category === cat);

  async function follow(id: string) {
    setBusy(id);
    const { error } = await (supabase as any).rpc("follow_channel", { _chat: id });
    setBusy(null);
    if (error) return toast.error("Não foi possível seguir");
    setFollowed((s) => new Set(s).add(id));
    navigator.vibrate?.(10);
    toast.success("Seguindo o canal");
    qc.invalidateQueries({ queryKey: ["chats", "channel"] });
  }

  if (!q.isLoading && !(q.data ?? []).length) return null;

  return (
    <section className="pt-2 pb-3">
      <div className="flex items-baseline justify-between px-4 pb-2">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">Descobrir canais</h2>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Em alta</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 no-scrollbar">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition active:scale-95",
              cat === c ? "border-foreground bg-foreground text-background" : "border-[color:var(--hairline)] text-muted-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar snap-x">
        {q.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[188px] w-[148px] shrink-0 animate-pulse rounded-3xl bg-[color:var(--surface)]" />)
          : list.length === 0
            ? <p className="px-1 py-6 text-[13px] text-muted-foreground">Nenhum canal nessa categoria ainda.</p>
            : list.map((c) => {
                const done = followed.has(c.id);
                return (
                  <div key={c.id} className="flex w-[148px] shrink-0 snap-start flex-col items-center rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-3 text-center">
                    <Link to="/chats/$id" params={{ id: c.id }} className="flex flex-col items-center">
                      <div className="mb-2 grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[color:var(--surface-2)]">
                        {c.avatar_url ? <SignedImage bucket="chats" path={c.avatar_url} alt="" className="h-full w-full object-cover" /> : <Megaphone className="h-6 w-6 text-muted-foreground" strokeWidth={1.6} />}
                      </div>
                      <div className="line-clamp-1 text-[14px] font-semibold">{c.title}</div>
                      <div className="text-[11px] text-muted-foreground">{formatMembers(Number(c.member_count))}</div>
                    </Link>
                    <button
                      disabled={done || busy === c.id}
                      onClick={() => follow(c.id)}
                      className={cn(
                        "mt-3 inline-flex h-8 w-full items-center justify-center gap-1 rounded-full text-[12px] font-semibold transition active:scale-95",
                        done ? "bg-[color:var(--surface-2)] text-muted-foreground" : "bg-primary text-primary-foreground",
                      )}
                    >
                      {done ? <><Check className="h-3.5 w-3.5" /> Seguindo</> : <><Plus className="h-3.5 w-3.5" /> Seguir</>}
                    </button>
                  </div>
                );
              })}
      </div>
    </section>
  );
}
