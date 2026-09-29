import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

type P = { id: string; username: string; display_name: string; avatar_url: string | null };

/** Lista da Sintonia VIP: escolha quem vê suas Vibes exclusivas. */
export function CloseFriendsSheet({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const data = useQuery({
    queryKey: ["close-friends", userId],
    enabled: open,
    queryFn: async () => {
      const [{ data: follows }, { data: vip }] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", userId).limit(500),
        supabase.from("close_friends").select("friend_id").eq("user_id", userId),
      ]);
      const ids = Array.from(new Set([...(follows ?? []).map((f) => f.following_id), ...(vip ?? []).map((v) => v.friend_id)]));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as P[] };
      return { people: (profs ?? []) as P[], vip: new Set((vip ?? []).map((v) => v.friend_id)) };
    },
  });

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const arr = (data.data?.people ?? []).filter((p) => !t || p.display_name?.toLowerCase().includes(t) || p.username?.toLowerCase().includes(t));
    const vip = data.data?.vip;
    return arr.sort((a, b) => Number(vip?.has(b.id)) - Number(vip?.has(a.id)));
  }, [data.data, q]);

  const toggle = async (id: string, on: boolean) => {
    const { error } = on
      ? await supabase.from("close_friends").delete().eq("user_id", userId).eq("friend_id", id)
      : await supabase.from("close_friends").insert({ user_id: userId, friend_id: id });
    if (error) return toast.error("Não foi possível atualizar");
    void qc.invalidateQueries({ queryKey: ["close-friends", userId] });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="z-[80] max-h-[80dvh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Star className="h-4 w-4 fill-primary text-primary" /> Sintonia VIP</SheetTitle>
          <SheetDescription>Só quem estiver aqui vê as Vibes que você mandar para a Sintonia VIP. Ninguém é avisado.</SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-muted px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar quem você segue" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <div className="mt-3 max-h-[52dvh] space-y-1 overflow-y-auto pb-4">
          {data.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p> :
            list.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Siga pessoas para montar sua Sintonia VIP.</p> :
            list.map((p) => {
              const on = !!data.data?.vip.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                  <UserAvatar avatarPath={p.avatar_url} displayName={p.display_name} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
                  </div>
                  <button onClick={() => toggle(p.id, on)} aria-label={on ? "Remover da Sintonia VIP" : "Adicionar à Sintonia VIP"}
                    className={cn("grid h-9 w-9 place-items-center rounded-full border transition active:scale-90", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                    <Star className={cn("h-4 w-4", on && "fill-current")} />
                  </button>
                </div>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
