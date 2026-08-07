import { createFileRoute } from "@tanstack/react-router";

const ALLOWED = /^(media[0-9]*\.tenor\.com|c\.tenor\.com|media\.tenor\.com)$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/gif")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const src = new URL(request.url).searchParams.get("src");
          if (!src) return new Response("missing src", { status: 400, headers: CORS });
          let target: URL;
          try {
            target = new URL(src);
          } catch {
            return new Response("bad src", { status: 400, headers: CORS });
          }
          if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) {
            return new Response("forbidden host", { status: 403, headers: CORS });
          }
          const upstream = await fetch(target.toString(), {
            headers: { accept: "image/*,video/*" },
          });
          if (!upstream.ok || !upstream.body) {
            console.error("[gif-proxy] upstream", upstream.status, target.hostname);
            return new Response("upstream error", { status: 502, headers: CORS });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              ...CORS,
              "Content-Type": upstream.headers.get("content-type") ?? "image/gif",
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
        } catch (e) {
          console.error("[gif-proxy] failed", e);
          return new Response("proxy error", { status: 500, headers: CORS });
        }
      },
    },
  },
});
