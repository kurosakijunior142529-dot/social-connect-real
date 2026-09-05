import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Gamepad2, Info, Wifi, Crown, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/games/xcloud")({
  component: XCloudPage,
  head: () => ({
    meta: [
      { title: "Xbox Cloud Gaming · vibely" },
      { name: "description", content: "Jogue centenas de jogos do Xbox direto na nuvem, sem baixar nada, pelo vibely." },
      { property: "og:title", content: "Xbox Cloud Gaming · vibely" },
      { property: "og:description", content: "Acesse o Xbox Cloud Gaming (xCloud) pelo vibely e jogue na nuvem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const XCLOUD_URL = "https://www.xbox.com/play";

function open(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function XCloudPage() {
  return (
    <div className="px-4 pt-2 pb-10">
      <Link to="/games" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Jogos
      </Link>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-transparent border border-primary/25 p-5 shadow-elegant">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15" />
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-display font-semibold tracking-tight">Xbox Cloud Gaming</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Centenas de jogos do Xbox rodando na nuvem — sem download, direto no seu aparelho.
        </p>
        <button
          type="button"
          onClick={() => open(XCLOUD_URL)}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elegant active:scale-[0.98] transition-transform"
        >
          Abrir Xbox Cloud Gaming <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      <section className="mt-5 space-y-3">
        <div className="flex gap-3 rounded-3xl bg-[color:var(--surface)] p-4">
          <Crown className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">Precisa de Game Pass Ultimate</div>
            <p className="text-xs text-muted-foreground">
              O jogo na nuvem é liberado com a assinatura da Microsoft. Você entra com a sua conta Xbox.
            </p>
          </div>
        </div>
        <div className="flex gap-3 rounded-3xl bg-[color:var(--surface)] p-4">
          <Wifi className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">Internet estável</div>
            <p className="text-xs text-muted-foreground">
              Recomendado 20 Mbps ou mais. Wi-Fi ou 5G deixam a jogatina bem mais fluida.
            </p>
          </div>
        </div>
        <div className="flex gap-3 rounded-3xl bg-[color:var(--surface)] p-4">
          <Info className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold">Abre em uma janela própria</div>
            <p className="text-xs text-muted-foreground">
              A Microsoft não permite que o jogo rode dentro de outros apps, então ele abre no navegador. É só
              voltar ao vibely quando terminar.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => open("https://www.xbox.com/xbox-game-pass/cloud-gaming")}
          className="rounded-3xl bg-[color:var(--surface)] p-4 text-left active:scale-[0.98] transition-transform"
        >
          <div className="text-sm font-semibold">Ver catálogo</div>
          <div className="text-[11px] text-muted-foreground">Jogos disponíveis na nuvem</div>
        </button>
        <button
          type="button"
          onClick={() => open("https://www.xbox.com/xbox-game-pass")}
          className="rounded-3xl bg-[color:var(--surface)] p-4 text-left active:scale-[0.98] transition-transform"
        >
          <div className="text-sm font-semibold">Assinar Game Pass</div>
          <div className="text-[11px] text-muted-foreground">Planos e preços da Microsoft</div>
        </button>
      </div>
    </div>
  );
}
