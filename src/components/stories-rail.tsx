import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { useMemo, useState } from "react";
import { StoryViewer } from "@/components/story-viewer";

type StoryRow = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
};

type Grouped = {
  userId: string;
  profile: { id: string; username: string; display_name: string; avatar_url: string | null } | undefined;
  stories: StoryRow[];
};

export function StoriesRail({ currentUserId, currentProfile }: {
  currentUserId: string;
  currentProfile?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
}) {
  const [viewing, setViewing] = useState<{ groups: Grouped[]; index: number } | null>(null);

  const q = useQuery({
    queryKey: ["stories-rail", currentUserId],
    queryFn: async () => {
      const { data: rows } = await (supabase as any)
        .from("stories")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      const list = (rows ?? []) as StoryRow[];
      const userIds = Array.from(new Set(list.map((s) => s.user_id)));
      const { data: profs } = userIds.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", userIds)
        : { data: [] as any[] };
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const byUser = new Map<string, Grouped>();
      for (const s of list) {
        const g: Grouped = byUser.get(s.user_id) ?? { userId: s.user_id, profile: pmap.get(s.user_id), stories: [] as StoryRow[] };
        g.stories.push(s);
        byUser.set(s.user_id, g);
      }
      const arr = Array.from(byUser.values());
      // Current user first
      arr.sort((a, b) => (a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : 0));
      return arr;
    },
    staleTime: 30_000,
  });

  const groups = q.data ?? [];
  const myGroup = useMemo(() => groups.find((g) => g.userId === currentUserId), [groups, currentUserId]);
  const others = useMemo(() => groups.filter((g) => g.userId !== currentUserId), [groups, currentUserId]);

  return (
    <>
      <div className="px-3">
        <div className="social-card no-scrollbar relative flex gap-3 overflow-x-auto rounded-[22px] px-3 py-3">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:color-mix(in_oklab,var(--primary)_60%,transparent)] to-transparent"
          />
          {/* Your story: either add or view */}
          {myGroup ? (
            <button
              onClick={() => setViewing({ groups, index: 0 })}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl py-1 transition-transform hover:-translate-y-0.5"
            >
              <span className="rounded-full bg-gradient-brand p-[2px] shadow-[0_0_16px_-2px_color-mix(in_oklab,var(--primary)_65%,transparent)]">
                <UserAvatar
                  avatarPath={currentProfile?.avatar_url}
                  displayName={currentProfile?.display_name ?? "?"}
                  className="h-14 w-14 ring-2 ring-background"
                />
              </span>
              <span className="w-full truncate text-center text-[11px] font-medium">Sua Vibe</span>
            </button>
          ) : (
            <Link
              to="/stories/new"
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl py-1 transition-transform hover:-translate-y-0.5"
            >
              <div className="relative rounded-full bg-surface-2 p-[2px]">
                <UserAvatar
                  avatarPath={currentProfile?.avatar_url}
                  displayName={currentProfile?.display_name ?? "?"}
                  className="h-14 w-14 opacity-90"
                />
                <span className="absolute -bottom-0 -right-0 grid h-5 w-5 place-items-center rounded-full bg-gradient-brand ring-2 ring-background shadow-[0_0_12px_-2px_color-mix(in_oklab,var(--primary)_75%,transparent)]">
                  <Plus className="h-3 w-3 text-primary-foreground" />
                </span>
              </div>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">Nova Vibe</span>
            </Link>
          )}

          {others.map((g, idx) => (
            <button
              key={g.userId}
              onClick={() => setViewing({ groups, index: myGroup ? idx + 1 : idx })}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl py-1 transition-transform hover:-translate-y-0.5"
            >
              <span className="rounded-full bg-gradient-brand p-[2px] shadow-[0_0_14px_-3px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
                <UserAvatar
                  avatarPath={g.profile?.avatar_url}
                  displayName={g.profile?.display_name ?? "?"}
                  className="h-14 w-14 ring-2 ring-background"
                />
              </span>
              <span className="w-full truncate text-center text-[11px]">
                {g.profile?.username ?? "?"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {viewing ? (
        <StoryViewer
          groups={viewing.groups}
          startIndex={viewing.index}
          viewerId={currentUserId}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}
