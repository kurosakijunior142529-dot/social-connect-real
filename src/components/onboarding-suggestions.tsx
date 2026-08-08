import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";

const DISMISS_KEY = "vibely:onboardingSuggestionsDismissed";
const PRIORITY = ["anny", "vibely"];

/**
 * Sugestões de perfis para seguir — aparece para contas novas
 * (sem ninguém seguido) e some após seguir/dispensar.
 */
export function OnboardingSuggestions({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
  );
  const [pending, setPending] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);

  const suggestions = useQuery({
    queryKey: ["onboarding-suggestions", currentUserId],
    enabled: !dismissed,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUserId);
      const followingIds = (follows ?? []).map((f) => f.following_id);
      if (followingIds.length > 0) return null; // já não é conta nova

      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, is_verified, badge_variant")
        .neq("id", currentUserId)
        .limit(12);

      const rows = data ?? [];
      return rows
        .slice()
        .sort((a, b) => {
          const ai = PRIORITY.indexOf((a.username ?? "").toLowerCase());
          const bi = PRIORITY.indexOf((b.username ?? "").toLowerCase());
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .slice(0, 6);
    },
  });

  async function follow(id: string) {
    setPending(id);
    const { error } = await supabase.from("follows").insert({ follower_id: currentUserId, following_id: id });
    setPending(null);
    if (error) return toast.error("Não foi possível seguir agora");
    setFollowed((f) => [...f, id]);
    queryClient.invalidateQueries({ queryKey: ["feed", currentUserId] });
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  if (suggestions.isLoading) {
    return (
      <div className="mx-4 mt-4 rounded-[28px] bg-[color:var(--surface)] p-4 space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  const list = suggestions.data;
  if (!list || list.length === 0) return null;

  return (
    <section className="mx-4 mt-4 rounded-[28px] border border-[color:var(--hairline)] bg-[radial-gradient(circle_at_15%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%),var(--surface)] p-4">
      <header className="flex items-start gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Comece seguindo alguém</h2>
          <p className="text-[11px] text-muted-foreground">Seu feed fica melhor com perfis para acompanhar.</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar sugestões"
          className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <ul className="mt-3 divide-y divide-[color:var(--hairline)]">
        {list.map((p) => {
          const done = followed.includes(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <Link to="/u/$username" params={{ username: p.username }} className="shrink-0">
                <UserAvatar avatarPath={p.avatar_url} displayName={p.display_name ?? p.username} className="h-11 w-11" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to="/u/$username"
                  params={{ username: p.username }}
                  className="block truncate text-sm font-medium"
                >
                  {p.display_name ?? p.username}
                </Link>
                <div className="truncate text-[11px] text-muted-foreground">@{p.username}</div>
              </div>
              <Button
                size="sm"
                variant={done ? "secondary" : "default"}
                className="rounded-full min-w-[86px]"
                disabled={done || pending === p.id}
                onClick={() => follow(p.id)}
              >
                {done ? "Seguindo" : pending === p.id ? "…" : "Seguir"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
