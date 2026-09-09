import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Coins, Check, X, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useSubscription, useCoinBalance } from "@/hooks/use-subscription";
import { createPortalSession } from "@/lib/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { COIN_PACKS as AI_COIN_PACKS } from "@/lib/ai-credits";

export const Route = createFileRoute("/_authenticated/pro")({
  head: () => ({
    meta: [
      { title: "Vibely Pro · Assine e ganhe benefícios" },
      {
        name: "description",
        content: "Assine o Vibely Pro, compre moedas para presentes em lives e apoie seus criadores favoritos.",
      },
      { property: "og:title", content: "Vibely Pro" },
      {
        property: "og:description",
        content: "Assine o Vibely Pro e ganhe badge, uploads maiores e mais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProPage,
});

const PRO_FEATURES = [
  "Badge Pro no perfil e no chat",
  "Uploads de vídeo até 10 minutos",
  "Filtros e presets exclusivos",
  "Sem anúncios em nenhum lugar",
  "Prioridade na fila de lives",
  "Emblemas animados de reação",
];

const COIN_PACKS = AI_COIN_PACKS;

function ProPage() {
  const { user } = Route.useRouteContext();
  const { openCheckout, checkoutElement, isOpen, closeCheckout } = useStripeCheckout();
  const sub = useSubscription(user.id);
  const coins = useCoinBalance(user.id);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [portalLoading, setPortalLoading] = useState(false);

  const isPro = sub.data && ["active", "trialing"].includes(sub.data.status as string);
  const proPriceId = interval === "month" ? "vibely_pro_monthly" : "vibely_pro_yearly";

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const result = await createPortalSession({
        data: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/pro`,
        },
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao abrir gestão");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="pb-24">
      <PaymentTestModeBanner />

      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Vibely Pro</h1>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-sm">
            <Coins className="h-4 w-4 text-primary" />
            <span className="font-medium tabular">{coins.data ?? 0}</span>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-8">
        {/* Status atual */}
        {isPro && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-primary/10 border border-primary/20 p-4 flex items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-4 w-4 text-primary" /> Você é Pro
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sub.data?.cancel_at_period_end
                  ? "Cancelado. Acesso mantido até fim do período."
                  : "Renovação automática ativa."}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handlePortal} disabled={portalLoading}>
              Gerenciar <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </motion.div>
        )}

        {/* Plano Pro */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Vibely Pro</h2>
            <div className="inline-flex rounded-full bg-[color:var(--surface-2)] p-1 text-xs">
              <button
                onClick={() => setInterval("month")}
                className={cn(
                  "px-3 py-1.5 rounded-full font-medium transition",
                  interval === "month" && "bg-background shadow-sm",
                )}
              >
                Mensal
              </button>
              <button
                onClick={() => setInterval("year")}
                className={cn(
                  "px-3 py-1.5 rounded-full font-medium transition",
                  interval === "year" && "bg-background shadow-sm",
                )}
              >
                Anual <span className="text-primary ml-1">-25%</span>
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-[color:var(--surface)] to-[color:var(--surface)] border border-[color:var(--hairline)] p-6 space-y-5">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular">
                {interval === "month" ? "R$ 19,90" : "R$ 179,00"}
              </span>
              <span className="text-sm text-muted-foreground">
                / {interval === "month" ? "mês" : "ano"}
              </span>
            </div>
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="w-full rounded-full h-12 text-base"
              onClick={() =>
                openCheckout({
                  priceId: proPriceId,
                  returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
                })
              }
              disabled={!!isPro}
            >
              {isPro ? "Você já é Pro" : `Assinar ${interval === "month" ? "mensal" : "anual"}`}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Cancele a qualquer momento. Mudança de plano vale na próxima renovação.
            </p>
          </div>
        </section>

        {/* Moedas */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" /> Moedas Vibely
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Envie presentes para criadores em transmissões ao vivo.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {COIN_PACKS.map((p) => (
              <button
                key={p.priceId}
                onClick={() =>
                  openCheckout({
                    priceId: p.priceId,
                    returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
                  })
                }
                className={cn(
                  "rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 text-left transition hover:border-primary/40",
                  p.highlight && "border-primary/40 ring-1 ring-primary/20",
                )}
              >
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <Coins className="h-4 w-4" /> {p.coins}
                </div>
                <div className="text-2xl font-bold mt-2 tabular">{p.price}</div>
                <div className="text-xs text-muted-foreground mt-1">{p.desc}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Modal de checkout */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-background p-4 relative">
            <button
              onClick={closeCheckout}
              className="absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            {checkoutElement}
          </div>
        </div>
      )}
    </div>
  );
}
