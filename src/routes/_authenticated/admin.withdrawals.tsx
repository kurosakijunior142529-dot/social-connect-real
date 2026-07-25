import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  head: () => ({
    meta: [
      { title: "Admin · Saques" },
      { name: "description", content: "Painel de administração de saques do Vibely." },
      { property: "og:title", content: "Admin Saques" },
      { property: "og:description", content: "Aprove ou rejeite saques dos usuários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw redirect({ to: "/" });
  },
  component: AdminWithdrawals,
});

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AdminWithdrawals() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const list = useQuery({
    queryKey: ["admin-withdrawals", filter],
    queryFn: async () => {
      let q = supabase
        .from("withdrawals")
        .select("*, profile:profiles!withdrawals_user_id_fkey(username, display_name)")
        .order("created_at", { ascending: false });
      if (filter === "pending") q = q.in("status", ["pending", "approved"]);
      const { data } = await q;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const { error } = await supabase.rpc("admin_update_withdrawal", {
        _withdrawal_id: id,
        _new_status: status,
        _note: note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-2 px-4">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Saques (admin)</h1>
        </div>
      </header>
      <div className="p-4 space-y-3">
        <div className="inline-flex rounded-full bg-[color:var(--surface-2)] p-1 text-xs">
          <button onClick={() => setFilter("pending")} className={cn("px-3 py-1.5 rounded-full font-medium", filter === "pending" && "bg-background shadow-sm")}>Ativos</button>
          <button onClick={() => setFilter("all")} className={cn("px-3 py-1.5 rounded-full font-medium", filter === "all" && "bg-background shadow-sm")}>Todos</button>
        </div>

        {list.isLoading ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : list.data?.length ? (
          list.data.map((w: any) => (
            <WithdrawalCard key={w.id} w={w} onAction={(status, note) => update.mutate({ id: w.id, status, note })} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Nada por aqui.</p>
        )}
      </div>
    </div>
  );
}

function WithdrawalCard({ w, onAction }: { w: any; onAction: (status: string, note?: string) => void }) {
  const [note, setNote] = useState("");
  const b = w.bank_snapshot ?? {};
  const badge =
    w.status === "paid" ? { icon: CheckCircle2, label: "Pago", cls: "text-primary bg-primary/10" } :
    w.status === "rejected" ? { icon: XCircle, label: "Rejeitado", cls: "text-red-500 bg-red-500/10" } :
    w.status === "approved" ? { icon: CheckCircle2, label: "Aprovado", cls: "text-blue-500 bg-blue-500/10" } :
    { icon: Clock, label: "Pendente", cls: "text-yellow-500 bg-yellow-500/10" };
  const Icon = badge.icon;

  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold tabular">{formatBRL(Number(w.amount_brl))}</div>
          <div className="text-xs text-muted-foreground">{w.amount_coins} moedas · @{w.profile?.username ?? "?"}</div>
          <div className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString("pt-BR")}</div>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", badge.cls)}>
          <Icon className="h-3.5 w-3.5" /> {badge.label}
        </span>
      </div>
      <div className="rounded-xl bg-[color:var(--surface-2)] p-3 text-xs space-y-1">
        <div><b>{b.holder_name}</b> — {b.holder_document}</div>
        {b.method === "pix" ? (
          <div>Pix {String(b.pix_key_type).toUpperCase()}: <span className="font-mono">{b.pix_key}</span></div>
        ) : (
          <div>{b.bank_name} · Ag {b.bank_agency} · CC {b.bank_account} ({b.bank_account_type})</div>
        )}
      </div>
      {["pending", "approved"].includes(w.status) ? (
        <>
          <Textarea placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <div className="flex gap-2">
            {w.status === "pending" && (
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => onAction("approved", note)}>Aprovar</Button>
            )}
            <Button size="sm" className="flex-1" onClick={() => onAction("paid", note)}>Marcar como pago</Button>
            <Button size="sm" variant="destructive" className="flex-1" onClick={() => onAction("rejected", note)}>Rejeitar</Button>
          </div>
        </>
      ) : w.admin_note ? (
        <p className="text-xs text-muted-foreground">Nota: {w.admin_note}</p>
      ) : null}
    </div>
  );
}
