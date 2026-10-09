import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // stale-while-revalidate: mostra o cache na hora e revalida em background.
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount) => failureCount < 3,
        retryDelay: (attempt) =>
          Math.round(Math.min(15_000, 400 * 2 ** attempt) * (0.7 + Math.random() * 0.6)),
      },
      mutations: {
        // Writes are not idempotent (saques, likes, RPCs). Never auto-retry:
        // a timeout after the server already applied the change would duplicate it.
        retry: 0,
      },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 60_000,
    defaultStructuralSharing: true,
    defaultPendingMs: 1500,
    defaultPendingMinMs: 0,
    defaultPendingComponent: PendingScreen,
    // Qualquer tela que quebrar mostra "Tentar de novo" no lugar de ficar branca,
    // e o resto do app (menu, conversas) continua funcionando.
    defaultErrorComponent: RouteErrorScreen,
  });

  return router;
};

function PendingScreen() {
  return (
    <div className="grid min-h-[60vh] place-items-center bg-background">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
    </div>
  );
}

function RouteErrorScreen({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  if (typeof console !== "undefined") console.error(error);
  return (
    <div className="grid min-h-[60vh] place-items-center bg-background px-6">
      <div className="max-w-sm text-center">
        <p className="text-base font-semibold text-foreground">Essa tela não carregou</p>
        <p className="mt-1 text-sm text-muted-foreground">Pode ter sido a internet. Toque para tentar de novo.</p>
        <button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
