import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { CallProvider } from "@/components/call-provider";
import { VoiceProvider } from "@/components/voice/voice-provider";
import { VoiceDock } from "@/components/voice/voice-dock";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // SSR: skip the redirect to avoid hydration mismatches. The layout is
    // already ssr:false, but during dev/prerender the server may still evaluate
    // beforeLoad. Returning a null user lets the client gate take over.
    if (typeof document === "undefined") {
      return { user: null as any };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const [username, setUsername] = useState<string | undefined>();

  useEffect(() => {
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setUsername(data?.username));
  }, [user.id]);

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
