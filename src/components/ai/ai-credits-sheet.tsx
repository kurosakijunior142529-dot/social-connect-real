import { useState } from "react";
import { Gem, Plus, X, Sparkles, Image as ImageIcon, Video, MessageSquare, Check, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import {
  COIN_PACKS,
  AI_DAILY_LIMITS,
  AI_COST_PER_ACTION,
  useAiCredits,
  useAiUsage,
} from "@/lib/ai-credits";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "creditos" | "limites" | "historico";

export function AiCreditsSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("creditos");
  const credits = useAiCredits(userId);
  const usage = useAiUsage(userId);
  const { openCheckout, checkoutElement, isOpen, closeCheckout } = useStripeCheckout();

  function buy(priceId: string) {
    try {
      openCheckout({
        priceId,
        returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Pagamento indisponível neste ambiente.");
    }
  }

  const used = usage.data?.usedToday ?? { image: 0, video: 0 };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-background ring-1 ring-[color:var(--hairline)] pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-5 pt-4 pb-3 hairline-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Gem className="h-5 w-5 text-primary" /> Créditos e preços
            </h2>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 inline-flex rounded-full bg-[color:var(--surface-2)] p-1 text-xs">
            {([["creditos", "Créditos"], ["limites", "Limites"], ["historico", "Histórico"]] as const).map(
              ([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full font-medium transition",
                    tab === id ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="p-5 space-y-6">
          {tab === "creditos" ? (
            <>
              <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-[color:var(--surface)] to-[color:var(--surface)] ring-1 ring-[color:var(--hairline)] p-5">
                <div className="text-xs text-muted-foreground">Meus créditos</div>
                <div className="mt-1 flex items-center gap-2">
                  <Gem className="h-6 w-6 text-primary" />
                  <span className="text-4xl font-bold tabular">
                    {(credits.data ?? 0).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Escolha seu pacote</h3>
                <div className="grid gap-3">
                  {COIN_PACKS.map((p) => (
                    <button
                      key={p.priceId}
                      onClick={() => buy(p.priceId)}
                      className={cn(
                        "flex items-center justify-between rounded-2xl bg-[color:var(--surface)] ring-1 ring-[color:var(--hairline)] p-4 text-left transition active:scale-[0.99] hover:ring-primary/40",
                        p.highlight && "ring-primary/40",
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2 font-semibold">
                          <Gem className="h-4 w-4 text-primary" />
                          {p.coins.toLocaleString("pt-BR")} créditos
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tabular">{p.price}</div>
                        <div className="text-[11px] text-primary font-medium">Comprar</div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pagamento seguro pelo mesmo sistema já usado no Vibely (cartão e Pix).
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Custo por criação</h3>
                {[
                  { icon: MessageSquare, label: "Texto", cost: AI_COST_PER_ACTION.text },
                  { icon: ImageIcon, label: "Imagem", cost: AI_COST_PER_ACTION.image },
                  { icon: Video, label: "Vídeo", cost: AI_COST_PER_ACTION.video },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between rounded-2xl bg-[color:var(--surface)] px-4 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <r.icon className="h-4 w-4 text-muted-foreground" /> {r.label}
                    </span>
                    <span className="text-muted-foreground">
                      {r.cost === null ? "sem cobrança — só limite diário" : `${r.cost} créditos`}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground flex gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  Hoje as criações não descontam créditos: o controle é feito pelos limites diários.
                </p>
              </section>
            </>
          ) : null}

          {tab === "limites" ? (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Limite diário (últimas 24h)</h3>
              {[
                { label: "Imagens", icon: ImageIcon, used: used.image, max: AI_DAILY_LIMITS.image },
                { label: "Vídeos", icon: Video, used: used.video, max: AI_DAILY_LIMITS.video },
              ].map((l) => (
                <div key={l.label} className="rounded-2xl bg-[color:var(--surface)] p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <l.icon className="h-4 w-4 text-muted-foreground" /> {l.label}
                    </span>
                    <span className="tabular text-muted-foreground">
                      {l.used} / {l.max}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (l.used / l.max) * 100)} className="mt-3 h-2" />
                </div>
              ))}
              <div className="rounded-2xl bg-[color:var(--surface)] p-4 text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> Conversas por texto
                </span>
                <span className="text-muted-foreground">sem limite</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Só é possível gerar um vídeo por vez. Os limites se renovam 24 horas após cada criação.
              </p>
            </section>
          ) : null}

          {tab === "historico" ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Histórico de criações</h3>
              {usage.isLoading ? (
                <div className="h-20 rounded-2xl bg-[color:var(--surface)] animate-pulse" />
              ) : !usage.data?.history.length ? (
                <p className="text-sm text-muted-foreground">
                  Você ainda não criou imagens nem vídeos por aqui.
                </p>
              ) : (
                usage.data.history.map((h) => (
                  <div key={h.id} className="rounded-2xl bg-[color:var(--surface)] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {h.kind === "image" ? (
                          <ImageIcon className="h-4 w-4 text-primary" />
                        ) : (
                          <Video className="h-4 w-4 text-primary" />
                        )}
                        {h.kind === "image" ? "Imagem" : "Vídeo"}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          h.status === "completed"
                            ? "text-primary"
                            : h.status === "failed"
                              ? "text-red-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {h.status === "completed" ? (
                          <>
                            <Check className="h-3 w-3" /> Concluído
                          </>
                        ) : h.status === "failed" ? (
                          <>
                            <AlertCircle className="h-3 w-3" /> Falhou
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" /> Em andamento
                          </>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">“{h.prompt}”</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))
              )}
            </section>
          ) : null}
        </div>

        <div className="sticky bottom-0 bg-background/95 backdrop-blur p-4 hairline-t">
          <Button className="w-full h-12 rounded-full text-base" onClick={() => setTab("creditos")}>
            <Plus className="h-4 w-4 mr-1.5" /> Recarregar créditos
          </Button>
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/70 grid place-items-center p-4">
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
      ) : null}
    </div>
  );
}

export function NoCreditsNotice({ onRecharge }: { onRecharge: () => void }) {
  return (
    <div className="rounded-3xl bg-[color:var(--surface)] ring-1 ring-primary/25 p-4 text-center space-y-3">
      <Sparkles className="h-6 w-6 text-primary mx-auto" />
      <div>
        <p className="font-medium">Seus créditos acabaram.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Recarregue seus créditos para continuar usando a IA.
        </p>
      </div>
      <Button className="rounded-full" onClick={onRecharge}>
        <Plus className="h-4 w-4 mr-1.5" /> Recarregar créditos
      </Button>
    </div>
  );
}
