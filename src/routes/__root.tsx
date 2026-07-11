import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { registerPWA } from "@/lib/pwa-register";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient-brand">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O conteúdo que você procura não existe ou foi removido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/30"
          >
            Voltar ao feed
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente novamente ou volte para o início.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white"
          >
            Tentar de novo
          </button>
          <a href="/" className="rounded-full border px-5 py-2.5 text-sm font-medium">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Vibely — sua rede social de verdade" },
      {
        name: "description",
        content:
          "Compartilhe fotos e vídeos, siga amigos, converse em tempo real. Tudo em um só lugar.",
      },
      { property: "og:title", content: "Vibely — sua rede social de verdade" },
      { property: "og:description", content: "Compartilhe fotos e vídeos, siga amigos, converse em tempo real. Tudo em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Vibely — sua rede social de verdade" },
      { name: "twitter:description", content: "Compartilhe fotos e vídeos, siga amigos, converse em tempo real. Tudo em um só lugar." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/df934fd2-d3de-41b2-9e63-d055c0e2a707/id-preview-4a00225b--1ba4969f-0e25-4120-b942-2fecf308cde3.lovable.app-1783460781736.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/df934fd2-d3de-41b2-9e63-d055c0e2a707/id-preview-4a00225b--1ba4969f-0e25-4120-b942-2fecf308cde3.lovable.app-1783460781736.png" },
      { name: "theme-color", content: "#E8436B" },
      { name: "background-color", content: "#FEFDFB" },
      { name: "application-name", content: "Vibely" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Vibely" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
      { name: "msapplication-TileColor", content: "#E8436B" },
      { name: "msapplication-TileImage", content: "/icon-192.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "apple-touch-startup-image", href: "/splash-1284x1920.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    registerPWA();
  }, []);

  useEffect(() => {
    // Refresh router + query cache on auth state changes
    let unsub: (() => void) | undefined;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        // Safety net: strip any auth tokens that may still be in the URL so
        // users can't accidentally share a link that logs someone else in as them.
        if (typeof window !== "undefined" && event !== "SIGNED_OUT") {
          const url = new URL(window.location.href);
          const hasTokens =
            url.hash.includes("access_token") ||
            url.hash.includes("refresh_token") ||
            url.hash.includes("type=recovery") ||
            url.hash.includes("provider_token") ||
            url.searchParams.has("code") ||
            url.searchParams.has("access_token") ||
            url.searchParams.has("refresh_token");
          if (hasTokens) {
            ["code", "access_token", "refresh_token", "expires_in", "expires_at", "token_type", "provider_token", "type"].forEach(
              (k) => url.searchParams.delete(k),
            );
            url.hash = "";
            window.history.replaceState({}, "", url.pathname + url.search);
          }
        }
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
