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
      const [{ data: following }, { data: followers }, { data: convs }] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", currentUserId),
        supabase.from("follows").select("follower_id").eq("following_id", currentUserId),
        supabase
          .from("conversations")
          .select("user_a, user_b")
          .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`)
          .order("last_message_at", { ascending: false })
          .limit(30),
      ]);
      const ids = new Set<string>();
      for (const f of following ?? []) ids.add(f.following_id);
      for (const f of followers ?? []) ids.add(f.follower_id);
      for (const c of (convs ?? []) as any[]) {
        ids.add(c.user_a === currentUserId ? c.user_b : c.user_a);
      }
      ids.delete(currentUserId);
      if (ids.size === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", Array.from(ids).slice(0, 200));
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

  const hasOnline = onlineFriends.length > 0;

  return (
    <>
      <section className="px-3 pb-2">
        <div className="relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_55%),var(--surface)] p-2.5 shadow-elegant">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Online agora
              </span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tabular text-primary/90">
                {onlineFriends.length}
              </span>
            </div>
            <Link
              to="/nearby"
              className="flex items-center gap-1 rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition active:scale-95"
            >
              <MapPin className="h-3 w-3" /> Por perto
            </Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none [scroll-snap-type:x_proximity]">
            {!hasOnline && (
              <div className="flex min-w-0 flex-1 items-center gap-2 py-1 text-[11px] text-muted-foreground">
                <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full border border-dashed border-border bg-[color:var(--surface-2)]">
                  <MessageCircle className="h-4 w-4 opacity-60" />
                </span>
                <span className="leading-snug">
                  Ninguém online agora.
                  <br />
                  Quando um amigo abrir o app, ele aparece aqui.
                </span>
              </div>
            )}
            {onlineFriends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelected(f)}
                className="flex w-[54px] shrink-0 flex-col items-center gap-1 [scroll-snap-align:start] transition active:scale-95"
              >
                <span className="relative grid place-items-center rounded-full bg-[conic-gradient(from_140deg,var(--primary),color-mix(in_oklab,var(--primary)_25%,transparent),var(--primary))] p-[2px]">
                  <span className="rounded-full bg-background p-[1.5px]">
                    <UserAvatar
                      avatarPath={f.avatar_url}
                      displayName={f.display_name ?? f.username}
                      className="h-10 w-10"
                    />
                  </span>
                  <span className="absolute bottom-0 right-0 h-3 w-3 animate-pulse rounded-full border-2 border-background bg-primary shadow-[0_0_10px_var(--primary)]" />
                </span>
                <span className="w-full truncate text-center text-[10px] font-medium text-foreground/80">
                  {f.display_name ?? f.username}
                </span>
              </button>
            ))}
            <Link
              to="/nearby"
              className="flex w-[54px] shrink-0 flex-col items-center gap-1 [scroll-snap-align:start]"
            >
              <span className="grid h-[46px] w-[46px] place-items-center rounded-full border border-dashed border-white/15 bg-[color:var(--surface-2)] text-muted-foreground">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">Descobrir</span>
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
            <p className="text-center text-xs text-muted-foreground">Está no app agora</p>
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
                search={{ post: undefined }}
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
