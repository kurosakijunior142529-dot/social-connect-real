// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Gera um index.html estático (shell do app) para o pacote Android/Capacitor.
    // O shell é leve: o app hidrata no cliente e não depende do servidor para pintar.
    prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false },
    pages: [{ path: "/" }],
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        workbox: {
          navigateFallback: undefined,
          navigateFallbackDenylist: [/^\/~/],
          runtimeCaching: [
            {
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst" as const,
              options: {
                cacheName: "pages",
                expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|ico|webp)$/i,
              handler: "CacheFirst" as const,
              options: {
                cacheName: "assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: 'index.html',
      },
      ssrManifest: false,
    },
    server: {
      middlewareMode: false,
    },
  },
});
