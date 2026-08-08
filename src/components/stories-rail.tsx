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
      <div className="px-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {/* Your story: either add or view */}
          {myGroup ? (
            <button
              onClick={() => setViewing({ groups, index: 0 })}
              className="shrink-0 flex flex-col items-center gap-1.5 w-16"
            >
              <UserAvatar
                avatarPath={currentProfile?.avatar_url}
                displayName={currentProfile?.display_name ?? "?"}
                className="h-14 w-14"
                ring="story"
              />
              <span className="text-[11px] text-muted-foreground truncate w-full text-center">Seu story</span>
            </button>
          ) : (
            <Link
              to="/stories/new"
              className="shrink-0 flex flex-col items-center gap-1.5 w-16"
            >
              <div className="relative rounded-full p-[2px] bg-white/10">
                <UserAvatar
                  avatarPath={currentProfile?.avatar_url}
                  displayName={currentProfile?.display_name ?? "?"}
                  className="h-14 w-14"
                />
                <span className="absolute -bottom-0 -right-0 grid place-items-center h-5 w-5 rounded-full bg-gradient-brand ring-2 ring-background">
                  <Plus className="h-3 w-3 text-white" />
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground truncate w-full text-center">Adicionar</span>
            </Link>
          )}

          {others.map((g, idx) => (
            <button
              key={g.userId}
              onClick={() => setViewing({ groups, index: myGroup ? idx + 1 : idx })}
              className="shrink-0 flex flex-col items-center gap-1.5 w-16"
            >
              <UserAvatar
                avatarPath={g.profile?.avatar_url}
                displayName={g.profile?.display_name ?? "?"}
                className="h-14 w-14"
                ring="story"
              />
              <span className="text-[11px] truncate w-full text-center">
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
