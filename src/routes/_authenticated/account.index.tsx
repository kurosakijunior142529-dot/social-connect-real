import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Crown,
  Wallet as WalletIcon,
  CreditCard,
  Landmark,
  ArrowDownToLine,
  ReceiptText,
  TrendingUp,
  Bell,
  Settings as SettingsIcon,
  Lock,
  ShieldCheck,
  HelpCircle,
  LogOut,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { signOutAndClearSession } from "@/lib/auth-session";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [
      { title: "Conta · Vibely" },
      { name: "description", content: "Gerencie carteira, pagamentos, assinaturas, notificações, privacidade e segurança." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountHubPage,
});

type Row = { to: string; icon: any; label: string; hint?: string; accent?: boolean };

function AccountHubPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const wallet = useQuery({
    queryKey: ["account-hub-wallet", user.id],
    queryFn: async () => {
      const [coinsRes, settingsRes] = await Promise.all([
        supabase.from("user_coins").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("app_settings").select("coin_to_brl_rate").maybeSingle(),
      ]);
      return {
        coins: coinsRes.data?.balance ?? 0,
        rate: Number(settingsRes.data?.coin_to_brl_rate ?? 0.0645),
      };
    },
    staleTime: 60_000,
  });
  const coins = wallet.data?.coins ?? 0;
  const brl = coins * (wallet.data?.rate ?? 0.0645);

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Premium",
      rows: [
        { to: "/pro", icon: Crown, label: "Assinaturas & Premium", hint: "Vibely Pro, benefícios e recargas", accent: true },
      ],
    },
    {
      title: "Financeiro",
      rows: [
        { to: "/wallet", icon: WalletIcon, label: "Carteira", hint: "Saldo, moedas e resumo" },
        { to: "/wallet", icon: CreditCard, label: "Pagamentos", hint: "Métodos e cobranças" },
        { to: "/wallet", icon: Landmark, label: "Conta bancária & Pix", hint: "Cadastro para recebimentos" },
        { to: "/wallet", icon: ArrowDownToLine, label: "Solicitar saque", hint: "Retire seus ganhos" },
        { to: "/wallet", icon: ReceiptText, label: "Histórico financeiro", hint: "Entradas, saídas e saques" },
        { to: "/wallet", icon: TrendingUp, label: "Monetização", hint: "Ganhos por vídeos, lives, presentes" },
      ],
    },
    {
      title: "Preferências",
      rows: [
        { to: "/notifications", icon: Bell, label: "Notificações", hint: "Central de alertas" },
        { to: "/settings", icon: SettingsIcon, label: "Configurações", hint: "Perfil, idioma, tema" },
        { to: "/settings", icon: Lock, label: "Privacidade", hint: "Quem pode interagir com você" },
        { to: "/settings", icon: ShieldCheck, label: "Segurança", hint: "Senha, sessões, 2FA" },
        { to: "/settings", icon: HelpCircle, label: "Ajuda e suporte", hint: "FAQ e tickets" },
      ],
    },
  ];

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] transition"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary">sua conta</div>
          <h1 className="text-2xl font-display font-black leading-tight">Conta</h1>
        </div>
      </header>

      <Link
        to="/wallet"
        className="block rounded-3xl border border-[color:var(--hairline)] bg-gradient-to-br from-primary/15 via-[color:var(--surface)] to-[color:var(--surface)] p-4"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <WalletIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Saldo disponível</div>
            <div className="text-lg font-display font-bold tabular">
              {coins.toLocaleString("pt-BR")} <span className="text-xs font-medium text-muted-foreground">moedas</span>
            </div>
            <div className="text-[11px] text-primary tabular">
              {brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>

      {groups.map((g) => (
        <section key={g.title} className="space-y-2">
          <div className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {g.title}
          </div>
          <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] overflow-hidden divide-y divide-[color:var(--hairline)]">
            {g.rows.map((r, i) => (
              <Link key={i} to={r.to as any} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[color:var(--surface-2)] transition">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-xl ${
                    r.accent ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)] text-foreground/80"
                  }`}
                >
                  <r.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.label}</div>
                  {r.hint ? <div className="text-[11px] text-muted-foreground truncate">{r.hint}</div> : null}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => signOutAndClearSession(queryClient, navigate)}
        className="w-full flex items-center justify-center gap-2 rounded-3xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 px-4 py-3.5 text-sm font-semibold text-destructive transition"
      >
        <LogOut className="h-4 w-4" />
        Sair da conta
      </button>

      <div className="text-center text-[11px] text-muted-foreground pt-2">
        Vibely · {new Date().getFullYear()}
      </div>
    </div>
  );
}
