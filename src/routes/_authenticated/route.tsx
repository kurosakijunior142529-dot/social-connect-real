import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { CallProvider } from "@/components/call-provider";
import { VoiceProvider } from "@/components/voice/voice-provider";
import { VoiceDock } from "@/components/voice/voice-dock";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // SSR: skip auth check to avoid hydration mismatches. The layout is
    // client-only (ssr:false), but during dev/prerender the server may still
    // evaluate beforeLoad. Returning a null user lets the client gate redirect.
    if (typeof document === "undefined") {
      return { user: null as any };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { user: null as any };
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | undefined>();

  useEffect(() => {
    if (!user?.id) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setUsername(data?.username));
  }, [user?.id, navigate]);

  // Client-side auth gate: don't render private UI until we know the user.
  if (!user?.id) return null;

  return (
    <CallProvider>
      <VoiceProvider>
        <AppShell currentUsername={username}>
          <Outlet />
        </AppShell>
        <VoiceDock />
      </VoiceProvider>
    </CallProvider>
  );
}
