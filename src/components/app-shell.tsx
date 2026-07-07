import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Compass, PlusSquare, MessageCircle, User as UserIcon, LogOut, Users, Settings as SettingsIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; Icon: typeof Home };

export function AppShell({
  children,
  currentUsername,
}: {
  children: ReactNode;
  currentUsername?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items: NavItem[] = [
    { to: "/", label: "Feed", Icon: Home },
    { to: "/explore", label: "Explorar", Icon: Compass },
    { to: "/create", label: "Criar", Icon: PlusSquare },
    { to: "/messages", label: "Conversas", Icon: MessageCircle },
    {
      to: currentUsername ? `/u/${currentUsername}` : "/settings",
      label: "Perfil",
      Icon: UserIcon,
    },
  ];

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col md:border-r md:border-border/50 md:bg-sidebar/60 md:backdrop-blur-xl">
        <div className="px-6 pt-10 pb-6">
          <Link to="/" className="inline-flex items-baseline gap-1">
            <span className="text-3xl font-display font-black tracking-tight text-gradient-brand">Vibely</span>
            <span className="h-2 w-2 rounded-full bg-primary shadow-elegant" />
          </Link>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Midnight edition</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, label, Icon }) => {
            const active =
              to === "/"
                ? pathname === "/"
                : pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-brand text-white shadow-elegant"
                    : "text-foreground/80 hover:bg-white/5",
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "" : "text-primary/90")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/50 space-y-1">
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-white/5"
          >
            <SettingsIcon className="h-4 w-4" /> Configurações
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-2xl px-4"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="md:pl-64 pb-24 md:pb-8">
        <div className="mx-auto max-w-2xl px-4 pt-4 md:pt-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-3 mb-3 glass rounded-3xl shadow-elegant">
          <div className="flex items-center justify-around px-2 py-2">
            {items.map(({ to, label, Icon }) => {
              const active =
                to === "/"
                  ? pathname === "/"
                  : pathname === to || pathname.startsWith(to + "/");
              const isCreate = to === "/create";
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-2xl transition",
                    isCreate ? "h-12 w-12 -mt-4 bg-gradient-brand text-white shadow-elegant" : "px-3 py-2",
                    !isCreate && (active ? "text-primary" : "text-muted-foreground"),
                  )}
                  aria-label={label}
                >
                  <Icon className={cn(isCreate ? "h-6 w-6" : "h-6 w-6", active && !isCreate && "drop-shadow-[0_0_8px_var(--primary)]")} />
                  {!isCreate && active && (
                    <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
