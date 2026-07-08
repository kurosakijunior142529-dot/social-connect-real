import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function stripAuthArtifactsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const dirtyHash =
    url.hash.includes("access_token") ||
    url.hash.includes("refresh_token") ||
    url.hash.includes("type=recovery") ||
    url.hash.includes("provider_token");
  const dirtyQuery =
    url.searchParams.has("code") ||
    url.searchParams.has("access_token") ||
    url.searchParams.has("refresh_token");
  if (!dirtyHash && !dirtyQuery) return;
  ["code", "access_token", "refresh_token", "expires_in", "expires_at", "token_type", "provider_token", "type"].forEach(
    (k) => url.searchParams.delete(k),
  );
  url.hash = "";
  window.history.replaceState({}, "", url.pathname + url.search);
}

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // Give Supabase a tick to consume tokens from the URL fragment.
      for (let i = 0; i < 40; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      stripAuthArtifactsFromUrl();
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      navigate({ to: data.session ? "/" : "/auth", replace: true });
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Finalizando login…</div>
    </div>
  );
}
