import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Coins, Gift, Radio, TrendingUp, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account/monetization")({
  head: () => ({
    meta: [
      { title: "Monetização · Vibely" },
      { name: "description", content: "Acompanhe seus ganhos com presentes, lives e assinaturas de canal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MonetizationPage,
});

function MonetizationPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const stats = useQuery({
    queryKey: ["monetization", user.id],
    staleTime: 60_000,
    queryFn: async () => {
      const [giftsRes, settingsRes, subsRes, livesRes] = await Promise.all([
        supabase.from("live_gifts").select("coins_spent, created_at").eq("recipient_id", user.id),
        supabase.from("app_settings").select("coin_to_brl_rate, min_withdrawal_brl").maybeSingle(),
        supabase
          .from("channel_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", user.id)
          .eq("status", "active"),
        supabase.from("lives").select("id", { count: "exact", head: true }).eq("host_id", user.id),
      ]);

      const gifts = giftsRes.data ?? [];
      const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
      const total = gifts.reduce((s, g) => s + (g.coins_spent ?? 0), 0);
      const last30 = gifts
        .filter((g) => new Date(g.created_at as string).getTime() >= monthAgo)
        .reduce((s, g) => s + (g.coins_spent ?? 0), 0);

      return {
        totalCoins: total,
        last30Coins: last30,
        giftCount: gifts.length,
        subscribers: subsRes.count ?? 0,
        lives: livesRes.count ?? 0,
        rate: Number(settingsRes.data?.coin_to_brl_rate ?? 0.0645),
        minWithdrawal: Number(settingsRes.data?.min_withdrawal_brl ?? 0),
      };
    },
  });

  const d = stats.data;
  const brl = (coins: number) =>
    (coins * (d?.rate ?? 0.0645)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6 pb-6 max-w-lg">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/account" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface)]"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary">criadores</div>
          <h1 className="text-2xl font-display font-black leading-tight">Monetização</h1>
        </div>
      </header>

      {stats.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-[color:var(--hairline)] bg-gradient-to-br from-primary/15 via-[color:var(--surface)] to-[color:var(--surface)] p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ganhos totais</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-display font-black tabular">{brl(d?.totalCoins ?? 0)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-primary tabular">
              <Coins className="h-3.5 w-3.5" />
              {(d?.totalCoins ?? 0).toLocaleString("pt-BR")} moedas recebidas
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Últimos 30 dias: <span className="text-foreground tabular">{brl(d?.last30Coins ?? 0)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Gift className="h-4 w-4" />} label="Presentes" value={(d?.giftCount ?? 0).toString()} />
            <Stat icon={<Users className="h-4 w-4" />} label="Inscritos ativos" value={(d?.subscribers ?? 0).toString()} />
            <Stat icon={<Radio className="h-4 w-4" />} label="Lives feitas" value={(d?.lives ?? 0).toString()} />
            <Stat
              icon={<TrendingUp className="h-4 w-4" />}
              label="Valor por moeda"
              value={(d?.rate ?? 0.0645).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 })}
            />
          </div>
        </>
      )}

      <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] overflow-hidden divide-y divide-[color:var(--hairline)]">
        <Row to="/wallet" label="Carteira e saques" hint="Converta moedas em Pix" />
        <Row to="/pro" label="Vibely Pro" hint="Benefícios e recargas de moedas" />
      </div>

      <p className="text-[11px] text-muted-foreground px-1">
        Saques exigem conta bancária cadastrada e valor mínimo de{" "}
        {(d?.minWithdrawal ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4">
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-[color:var(--surface-2)] text-primary">{icon}</div>
      <div className="mt-2 text-lg font-display font-bold tabular">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({ to, label, hint }: { to: "/wallet" | "/pro"; label: string; hint: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[color:var(--surface-2)] transition">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
