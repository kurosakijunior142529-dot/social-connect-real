import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { useGlobalPresence } from "@/lib/presence";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Play, User as UserIcon, MapPin } from "lucide-react";
import { toast } from "sonner";

type Friend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Bolhas de amigos online em tempo real, no topo das conversas. */
export function OnlineBubbles({ currentUserId }: { currentUserId: string }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Friend | null>(null);
  const { online } = useGlobalPresence(currentUserId);

  const friends = useQuery({
    queryKey: ["presence-friends", currentUserId],
    staleTime: 60_000,
    queryFn: async (): Promise<Friend[]> => {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUserId);
      const ids = (follows ?? []).map((f) => f.following_id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids.slice(0, 200));
      return (data ?? []) as Friend[];
    },
  });

  const onlineFriends = useMemo(
    () => (friends.data ?? []).filter((f) => f.id !== currentUserId && online[f.id]),
    [friends.data, online],
  );

  const openChat = async (friend: Friend) => {
    try {
      const { data, error } = await supabase.rpc("get_or_create_conversation", {
        _other_user: friend.id,
      });
      if (error || !data) throw error ?? new Error("sem conversa");
      setSelected(null);
      navigate({ to: "/messages/$conversationId", params: { conversationId: data as string } });
    } catch {
      toast.error("Não foi possível abrir a conversa");
    }
  };

  if (onlineFriends.length === 0) return null;

  return (
    <>
      <section className="px-3 pb-3">
        <div className="relative overflow-hidden rounded-[24px] border border-primary/25 bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%),var(--surface)] p-3.5 shadow-elegant">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Online agora
              </span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold tabular text-primary">
                {onlineFriends.length}
              </span>
            </div>
            <Link
              to="/nearby"
              className="flex items-center gap-1 rounded-full bg-[color:var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition active:scale-95"
            >
              <MapPin className="h-3.5 w-3.5" /> Por perto
            </Link>
          </div>
          <div className="flex gap-3.5 overflow-x-auto scrollbar-none [scroll-snap-type:x_proximity]">
            {onlineFriends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelected(f)}
                className="flex w-[70px] shrink-0 flex-col items-center gap-1.5 [scroll-snap-align:start] transition active:scale-95"
              >
                <span className="relative grid place-items-center rounded-full bg-[conic-gradient(from_140deg,var(--primary),color-mix(in_oklab,var(--primary)_25%,transparent),var(--primary))] p-[2px]">
                  <span className="rounded-full bg-background p-[2px]">
                    <UserAvatar
                      avatarPath={f.avatar_url}
                      displayName={f.display_name ?? f.username}
                      className="h-14 w-14"
                    />
                  </span>
                  <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-background bg-primary shadow-[0_0_12px_var(--primary)]" />
                </span>
                <span className="w-full truncate text-center text-[11px] font-medium text-foreground/80">
                  {f.display_name ?? f.username}
                </span>
              </button>
            ))}
            <Link
              to="/nearby"
              className="flex w-[70px] shrink-0 flex-col items-center gap-1.5 [scroll-snap-align:start]"
            >
              <span className="grid h-[62px] w-[62px] place-items-center rounded-full border border-dashed border-primary/40 bg-[color:var(--surface-2)] text-primary">
                <MapPin className="h-5 w-5" />
              </span>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">Descobrir</span>
            </Link>
          </div>
        </div>
      </section>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xs rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-center text-base">
              {selected?.display_name ?? selected?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {selected ? (
              <UserAvatar
                avatarPath={selected.avatar_url}
                displayName={selected.display_name ?? selected.username}
                className="h-20 w-20"
                ring
              />
            ) : null}
            <p className="text-center text-xs text-primary">Está no app agora</p>
            <div className="grid w-full gap-2">
              <button
                type="button"
                onClick={() => selected && openChat(selected)}
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                <MessageCircle className="h-4 w-4" /> Conversar
              </button>
              <Link
                to="/reels"
                onClick={() => setSelected(null)}
                className="flex items-center justify-center gap-2 rounded-full bg-[color:var(--surface-2)] px-4 py-3 text-sm font-semibold"
              >
                <Play className="h-4 w-4" /> Ver reels juntos
              </Link>
              <Link
                to="/u/$username"
                params={{ username: selected?.username ?? "" }}
                onClick={() => setSelected(null)}
                className="flex items-center justify-center gap-2 rounded-full bg-[color:var(--surface-2)] px-4 py-3 text-sm font-semibold"
              >
                <UserIcon className="h-4 w-4" /> Ver perfil
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
