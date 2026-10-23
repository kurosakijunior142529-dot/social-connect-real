import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { appConfirm } from "@/components/app-dialog";

type Mode = "requests" | "followers" | "muted" | "restricted";
export function PrivacyPeople({ userId }: { userId: string }) {
  const [mode, setMode] = useState<Mode>("requests");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["privacy-people", userId, mode],
    queryFn: async () => {
      let ids: string[] = [];
      if (mode === "requests") {
        const { data, error } = await supabase.from("follow_requests").select("requester_id").eq("target_id", userId);
        if (error) throw error;
        ids = (data ?? []).map(r => r.requester_id);
      } else if (mode === "followers") {
        const { data, error } = await supabase.from("follows").select("follower_id").eq("following_id", userId);
        if (error) throw error;
        ids = (data ?? []).map(r => r.follower_id);
      } else if (mode === "muted") {
        const { data, error } = await supabase.from("muted_users").select("muted_id").eq("user_id", userId);
        if (error) throw error;
        ids = (data ?? []).map(r => r.muted_id);
      } else {
        const { data, error } = await supabase.from("restricted_users").select("restricted_id").eq("user_id", userId);
        if (error) throw error;
        ids = (data ?? []).map(r => r.restricted_id);
      }
      if (!ids.length) return [];
      const { data, error } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  async function act(id: string, approve = false) {
    if (mode === "followers" && !await appConfirm("Remover este seguidor?", { description: "A pessoa não será bloqueada.", confirmText: "Remover" })) return;
    setBusy(true);
    try {
      const result = mode === "requests"
        ? approve ? await supabase.rpc("approve_follow_request", { _requester: id }) : await supabase.from("follow_requests").delete().match({ requester_id: id, target_id: userId })
        : mode === "followers" ? await supabase.rpc("remove_follower", { _follower: id })
        : mode === "muted" ? await supabase.from("muted_users").delete().match({ user_id: userId, muted_id: id })
        : await supabase.from("restricted_users").delete().match({ user_id: userId, restricted_id: id });
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["privacy-people"] });
      await qc.invalidateQueries({ queryKey: ["profile-stats"] });
      toast.success("Lista atualizada");
    } catch { toast.error("Não foi possível atualizar a lista"); }
    finally { setBusy(false); }
  }
  const filtered = (list.data ?? []).filter(p => `${p.display_name} ${p.username}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-3 border-t border-border pt-6">
    <h2 className="font-display text-lg font-semibold">Pessoas e solicitações</h2>
    <div className="flex flex-wrap gap-1" role="group" aria-label="Listas de pessoas">
      {([["requests", "Solicitações"], ["followers", "Seguidores"], ["muted", "Silenciados"], ["restricted", "Restritos"]] as const).map(([key, label]) => <Button key={key} variant={mode === key ? "secondary" : "ghost"} size="sm" onClick={() => setMode(key)} aria-pressed={mode === key}>{label}</Button>)}
    </div>
    <Input aria-label="Buscar pessoa nesta lista" placeholder="Buscar nome ou @" value={search} onChange={e => setSearch(e.target.value)} />
    {list.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : list.isError ? <Button variant="outline" onClick={() => list.refetch()}>Tentar novamente</Button> : !filtered.length ? <p className="py-4 text-sm text-muted-foreground">Nenhuma pessoa nesta lista.</p> : <div className="divide-y divide-border">{filtered.map(p => <div key={p.id} className="flex items-center gap-3 py-3">
      <UserAvatar avatarPath={p.avatar_url} displayName={p.display_name ?? p.username} className="h-10 w-10" />
      <Link to="/u/$username" params={{ username: p.username }} className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.display_name ?? p.username}</span><span className="block truncate text-xs text-muted-foreground">@{p.username}</span></Link>
      {mode === "requests" && <Button size="sm" disabled={busy} onClick={() => act(p.id, true)}>Aceitar</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(p.id)}>{mode === "requests" ? "Recusar" : mode === "followers" ? "Remover" : "Desfazer"}</Button>
    </div>)}</div>}
  </section>;
}