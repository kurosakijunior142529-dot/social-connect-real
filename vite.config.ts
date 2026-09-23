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
    // Prerender fica desligado: este app depende de server functions (LiveKit,
    // IA, moderação, pagamentos), então o HTML é servido pelo runtime SSR.

  },
  vite: {
    resolve: {
      alias: {
        // A versão Node desse pacote lê arquivos do disco (node:fs) ao carregar e
        // derrubava o servidor publicado em toda abertura. A versão web não usa disco.
        "@vercel/oidc": new URL("./node_modules/@vercel/oidc/dist/index-browser.js", import.meta.url).pathname,
      },
    },
    plugins: [
      {
        // A câmera de efeitos (Snap Camera Kit) só funciona no navegador e acessa
        // "location" ao carregar; no servidor ela derrubava todas as páginas.
        name: "vibely-camera-kit-server-stub",
        enforce: "pre" as const,
        resolveId(id: string, _importer: string | undefined, opts: { ssr?: boolean }) {
          if (opts?.ssr && id === "@snap/camera-kit") return "\0vibely-camera-kit-stub";
          return null;
        },
        load(id: string) {
          if (id === "\0vibely-camera-kit-stub") {
            return "export const bootstrapCameraKit = () => { throw new Error('Camera Kit indisponível no servidor'); }; export const createMediaStreamSource = bootstrapCameraKit; export const Transform2D = {}; export default {};";
          }
          return null;
        },
      },
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
      // outDir padrão do template (dist/client + dist/server). Não sobrescrever o
      // input do rollup: o TanStack Start gera o documento HTML, não existe um
      // index.html manual como entrada.
      emptyOutDir: true,
    },

  },
});
