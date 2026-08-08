import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBlockUser } from "@/hooks/use-blocks";
import { ChevronLeft, Search, ShieldOff, UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/account/blocked")({
  head: () => ({
    meta: [
      { title: "Usuários bloqueados · Vibely" },
      { name: "description", content: "Gerencie sua lista de usuários bloqueados." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const unblock = useBlockUser();

  const list = useQuery({
    queryKey: ["blocked-list", user.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("blocks")
        .select("blocked_id, created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.blocked_id);
      if (ids.length === 0) return [] as any[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => ({
        ...r,
        profile: map.get(r.blocked_id) ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list.data ?? [];
    return (list.data ?? []).filter((r: any) => {
      const u = (r.profile?.username ?? "").toLowerCase();
      const n = (r.profile?.display_name ?? "").toLowerCase();
      return u.includes(term) || n.includes(term);
    });
  }, [list.data, q]);

  return (
    <div className="space-y-5 pb-8">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/account" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] transition"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary">privacidade</div>
          <h1 className="text-2xl font-display font-black leading-tight">Usuários bloqueados</h1>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou @usuário"
          className="pl-9 rounded-full"
        />
      </div>

      {list.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color:var(--surface-2)] text-primary mb-3">
            <ShieldOff className="h-5 w-5" />
          </div>
          <div className="font-semibold">Nenhum usuário bloqueado</div>
          <div className="text-[13px] text-muted-foreground mt-1">
            Usuários que você bloquear aparecerão aqui e você poderá desbloqueá-los a qualquer momento.
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] overflow-hidden divide-y divide-[color:var(--hairline)]">
          {filtered.map((r: any) => {
            const p = r.profile;
            const name = p?.display_name ?? p?.username ?? "Usuário";
            const date = new Date(r.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit", month: "short", year: "numeric",
            });
            return (
              <div key={r.blocked_id} className="flex items-center gap-3 px-4 py-3">
                {p?.username ? (
                  <Link to="/u/$username" params={{ username: p.username }} className="shrink-0">
                    <UserAvatar avatarPath={p?.avatar_url} displayName={name} className="h-11 w-11" />
                  </Link>
                ) : (
                  <UserAvatar avatarPath={p?.avatar_url} displayName={name} className="h-11 w-11" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{name}</div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    @{p?.username ?? "—"} · bloqueado em {date}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-1.5"
                  onClick={() => setConfirmTarget({ id: r.blocked_id, name })}
                  disabled={unblock.isPending}
                >
                  <UserX className="h-4 w-4" /> Desbloquear
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desbloquear {confirmTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vocês voltarão a poder se ver, se seguir, conversar e interagir normalmente no aplicativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmTarget) return;
                unblock.mutate({ targetId: confirmTarget.id, block: false });
                setConfirmTarget(null);
              }}
            >
              Desbloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
