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
    // getSession() lê a sessão do armazenamento local (síncrono, sem rede).
    // getUser() faria uma ida ao servidor Auth ANTES da primeira pintura —
    // era isso que deixava a abertura em branco por segundos numa rede lenta.
    // A validação real do token continua acontecendo: em background aqui e em
    // toda requisição protegida (RLS + middleware de bearer).
    const { data, error } = await supabase.auth.getSession();
    const user = error ? null : (data.session?.user ?? null);
    if (user) {
      void supabase.auth.getUser().then(({ data: fresh, error: freshError }) => {
        if (freshError || !fresh.user) void supabase.auth.signOut();
      });
    }
    return { user: user as any };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [username, setUsername] = useState<string | undefined>();

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => setUsername(data?.username));
      return;
    }

    // Sem usuário: em aparelhos lentos (WebView do Android) a sessão pode
    // demorar a ficar disponível no armazenamento. Damos uma janela curta e
    // reavaliamos a rota antes de mandar para o login — assim a abertura nunca
    // fica numa tela vazia.
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!done && session?.user) {
        done = true;
        void router.invalidate();
      }
    });
    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (done) return;
        done = true;
        if (data.session?.user) void router.invalidate();
        else void navigate({ to: "/auth", replace: true });
      });
    }, 1200);

    return () => {
      done = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [user?.id, navigate, router]);

  // Client-side auth gate: enquanto não sabemos quem é o usuário, mostramos a
  // marca em vez de uma tela em branco.
  if (!user?.id) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <img src="/logo-vibely.png" alt="Vibely" className="w-[52vw] max-w-[260px] opacity-90" />
      </div>
    );
  }

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
