import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Compass, PlusSquare, MessageCircle, User as UserIcon, LogOut } from "lucide-react";
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
    { to: "/messages", label: "Mensagens", Icon: MessageCircle },
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
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col md:border-r md:bg-card">
        <div className="px-6 py-8">
          <Link to="/" className="text-2xl font-bold text-gradient-brand">
            Vibely
          </Link>
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
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-brand text-white shadow-lg shadow-primary/30"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-1">
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Configurações
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

      {/* Main content */}
      <main className="md:pl-64 pb-20 md:pb-8">
        <div className="mx-auto max-w-2xl px-4 pt-6 md:pt-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
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
                  "flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 transition",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-label={label}
              >
                <Icon className={cn("h-6 w-6", active && "fill-primary/20")} />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
