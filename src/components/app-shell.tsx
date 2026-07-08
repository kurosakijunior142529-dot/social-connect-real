import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Search, PlusSquare, Bell, MessageCircle, User as UserIcon, LogOut, Settings as SettingsIcon, Bookmark, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/use-notifications";
import { SwipeableTabs } from "@/components/gestures/swipeable-tabs";
import { SwipeBack } from "@/components/gestures/swipe-back";

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
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);
  const unread = useUnreadNotifications(userId);
  const unreadCount = unread.data ?? 0;

  const items: NavItem[] = [
    { to: "/", label: "Feed", Icon: Home },
    { to: "/reels", label: "Reels", Icon: Play },
    { to: "/explore", label: "Explorar", Icon: Search },
    { to: "/create", label: "Criar", Icon: PlusSquare },
    { to: "/notifications", label: "Alertas", Icon: Bell },
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
    // scope: 'global' revoga o refresh token no servidor (invalida a sessão em todos os dispositivos)
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // se a chamada de rede falhar, ainda limpamos o armazenamento local abaixo
    }
    // Rede de segurança: apaga qualquer token residual do Supabase no navegador
    if (typeof window !== "undefined") {
      try {
        const wipe = (store: Storage) => {
          const keys: string[] = [];
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k && (k.startsWith("sb-") || k.includes("supabase"))) keys.push(k);
          }
          keys.forEach((k) => store.removeItem(k));
        };
        wipe(window.localStorage);
        wipe(window.sessionStorage);
      } catch {
        /* storage indisponível */
      }
    }
    navigate({ to: "/auth", replace: true });
  };

  const isRoot =
    pathname === "/" ||
    pathname === "/reels" ||
    pathname === "/explore" ||
    pathname === "/messages" ||
    pathname === "/notifications" ||
    pathname === "/create" ||
    pathname === "/settings" ||
    pathname === "/saved";

  const Badge = () =>
    unreadCount > 0 ? (
      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
    ) : null;

  const content = isRoot ? <SwipeableTabs>{children}</SwipeableTabs> : <SwipeBack>{children}</SwipeBack>;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-60 md:flex-col md:border-r md:border-[color:var(--hairline)] md:bg-sidebar">
        <div className="px-6 pt-8 pb-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="text-2xl font-display font-semibold tracking-tight">vibely</span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map(({ to, label, Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
            const isNotif = to === "/notifications";
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
                )}
              >
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.6} />
                  {isNotif ? <Badge /> : null}
                </span>
                {label}
              </Link>
            );
          })}
          <Link
            to="/saved"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/saved") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Bookmark className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Salvos
          </Link>
        </nav>
        <div className="p-3 hairline-t space-y-0.5">
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]"
          >
            <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.6} /> Configurações
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-xl px-3 h-auto py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]"
            onClick={handleSignOut}
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="md:pl-60 pb-24 md:pb-8">
        <div className="mx-auto max-w-2xl md:px-4 md:pt-6">{content}</div>
      </main>

      {/* Mobile bottom nav — floating pill */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] pointer-events-none">
        <div className="mx-4 mb-3 pointer-events-auto glass-heavy rounded-full">
          <div className="flex items-center justify-between px-2 py-1.5">
            {items.map(({ to, label, Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
              const isCreate = to === "/create";
              const isNotif = to === "/notifications";
              if (isCreate) {
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-label={label}
                    className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </Link>
                );
              }
              return (
                <Link
                  key={to}
                  to={to}
                  aria-label={label}
                  className={cn(
                    "relative grid h-11 w-11 place-items-center rounded-full transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.6} />
                    {isNotif ? <Badge /> : null}
                  </span>
                  {active ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
