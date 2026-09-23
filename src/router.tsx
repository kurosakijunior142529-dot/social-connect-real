import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
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
    // O Vibely é um app autenticado e orientado ao cliente. Evitar SSR por
    // padrão impede que uma API secundária ou um stream interrompido derrube
    // a abertura inteira; rotas públicas podem habilitar SSR explicitamente.
    defaultSsr: false,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 60,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
  });

  return router;
};
