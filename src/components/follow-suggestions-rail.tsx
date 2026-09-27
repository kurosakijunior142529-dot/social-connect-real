import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCheck, Check, Compass, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HIDE_KEY = "vibely:followRailHiddenUntil";

/** Carrossel "Na sua sintonia" — sugestões de perfis para seguir. */
export function FollowSuggestionsRail({ currentUserId }: { currentUserId: string }) {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now();
  });
  const [removed, setRemoved] = useState<string[]>([]);
  const [followed, setFollowed] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["follow-suggestions", currentUserId],
    enabled: !hidden,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: mine }, { data: fans }] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", currentUserId),
        supabase.from("follows").select("follower_id").eq("following_id", currentUserId).limit(200),
      ]);
      const following = new Set((mine ?? []).map((f) => f.following_id));
      const followsMe = new Set((fans ?? []).map((f) => f.follower_id));
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, is_verified")
        .neq("id", currentUserId)
        .limit(60);
      return (data ?? [])
        .filter((p) => !following.has(p.id))
        .map((p) => ({ ...p, followsMe: followsMe.has(p.id) }))
        .sort((a, b) => Number(b.followsMe) - Number(a.followsMe) || Number(b.is_verified) - Number(a.is_verified))
        .slice(0, 12);
    },
  });

  async function follow(id: string) {
    setPending(id);
    const { error } = await supabase.from("follows").insert({ follower_id: currentUserId, following_id: id });
    setPending(null);
    if (error) return toast.error("Não foi possível seguir agora");
    setFollowed((f) => [...f, id]);
  }

  function hideAll() {
    localStorage.setItem(HIDE_KEY, String(Date.now() + 3 * 24 * 3600_000));
    setHidden(true);
  }

  if (hidden) return null;
  const list = (q.data ?? []).filter((p) => !removed.includes(p.id));
  if (!q.isLoading && list.length === 0) return null;

  return (
    <section className="py-3">
      <header className="flex items-center gap-2 px-4 pb-3">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--surface-2)] text-primary">
          <Compass className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold font-display">Na sua sintonia</h2>
          <p className="text-[11px] text-muted-foreground">Pessoas que combinam com a sua vibe</p>
        </div>
        <Link to="/explore" className="text-[12px] font-semibold text-foreground/80">Ver todos</Link>
        <button type="button" onClick={hideAll} aria-label="Ocultar sugestões" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {q.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[228px] w-[156px] shrink-0 rounded-[26px]" />)
          : list.map((p) => {
              const done = followed.includes(p.id);
              const name = p.display_name ?? p.username;
              return (
                <article
                  key={p.id}
                  className="relative flex w-[156px] shrink-0 snap-start flex-col items-center overflow-hidden rounded-[26px] border border-[color:var(--hairline)] bg-[radial-gradient(120%_70%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_60%),var(--surface)] px-3 pb-3 pt-5 text-center"
                >
                  <button
                    type="button"
                    onClick={() => setRemoved((r) => [...r, p.id])}
                    aria-label="Dispensar"
                    className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <Link to="/u/$username" params={{ username: p.username }} className="relative">
                    <div className={cn("rounded-full p-[2px]", done ? "bg-primary" : "bg-[color:var(--hairline)]")}>
                      <div className="rounded-full bg-[color:var(--surface)] p-[2px]">
                        <UserAvatar avatarPath={p.avatar_url} displayName={name} className="h-[72px] w-[72px]" />
                      </div>
                    </div>
                  </Link>
                  <Link to="/u/$username" params={{ username: p.username }} className="mt-2.5 flex max-w-full items-center gap-1">
                    <span className="truncate text-[13px] font-semibold">{name}</span>
                    {p.is_verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                  </Link>
                  <span className="max-w-full truncate text-[11px] text-muted-foreground">@{p.username}</span>
                  <span className="mt-1.5 h-5 max-w-full truncate rounded-full bg-[color:var(--surface-2)] px-2 text-[10px] leading-5 text-muted-foreground">
                    {p.followsMe ? "Segue você" : p.bio ? p.bio : "Novo por aqui"}
                  </span>
                  <button
                    type="button"
                    disabled={done || pending === p.id}
                    onClick={() => follow(p.id)}
                    className={cn(
                      "mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition active:scale-95",
                      done ? "bg-[color:var(--surface-2)] text-foreground" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {done ? "Na sintonia" : pending === p.id ? "…" : p.followsMe ? "Seguir de volta" : "Seguir"}
                  </button>
                </article>
              );
            })}
      </div>
    </section>
  );
}
