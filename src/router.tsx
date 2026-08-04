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
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount) => failureCount < 3,
        retryDelay: (attempt) =>
          Math.round(Math.min(15_000, 400 * 2 ** attempt) * (0.7 + Math.random() * 0.6)),
      },
      mutations: {
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(8_000, 500 * 2 ** attempt),
      },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
