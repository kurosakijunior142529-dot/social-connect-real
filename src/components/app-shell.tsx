import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Search, PlusSquare, Bell, MessageCircle, User as UserIcon, LogOut, Settings as SettingsIcon, Bookmark, Play, Tv, Store, Gamepad2, Sparkles, Radio, Crown, Wallet, Shield, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/use-notifications";
import { signOutAndClearSession } from "@/lib/auth-session";

type NavItem = { to: string; label: string; Icon: typeof Home };

function AdminLink({ pathname }: { pathname: string }) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!r);
    });
  }, []);
  if (!isAdmin) return null;
  return (
    <Link
      to="/admin/withdrawals"
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        pathname.startsWith("/admin") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
      )}
    >
      <Shield className="h-[18px] w-[18px]" strokeWidth={1.6} />
      Admin · Saques
    </Link>
  );
}

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
    { to: "/lives", label: "Lives", Icon: Radio },
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

  // Mobile bottom nav: Home · Reels · Pesquisar · Criar · Conversas · Perfil
  const mobileItems: NavItem[] = [
    { to: "/", label: "Feed", Icon: Home },
    { to: "/reels", label: "Reels", Icon: Play },
    { to: "/explore", label: "Pesquisar", Icon: Search },
    { to: "/create", label: "Criar", Icon: PlusSquare },
    { to: "/messages", label: "Conversas", Icon: MessageCircle },
    {
      to: currentUsername ? `/u/${currentUsername}` : "/settings",
      label: "Perfil",
      Icon: UserIcon,
    },
  ];



  const handleSignOut = async () => {
    await signOutAndClearSession(queryClient, navigate);
  };

  const isRoot =
    pathname === "/" ||
    pathname === "/reels" ||
    pathname === "/explore" ||
    pathname === "/messages" ||
    pathname === "/notifications" ||
    pathname === "/create" ||
    pathname === "/settings" ||
    pathname === "/games" ||
    pathname === "/saved";

  const Badge = () =>
    unreadCount > 0 ? (
      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
    ) : null;

  const content = children;

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
          <Link
            to="/marketplace"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/marketplace") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Store className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Marketplace
          </Link>
          <Link
            to="/watch"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/watch") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Tv className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Streaming Amigo
          </Link>
          <Link
            to="/games"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/games") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Gamepad2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Jogos
          </Link>
          <Link
            to="/voice"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/voice") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Headphones className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Canais de voz
          </Link>
          <Link
            to="/ai"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/ai") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Vibely AI
          </Link>
          <Link
            to="/wallet"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/wallet") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Wallet className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Carteira
          </Link>
          <Link
            to="/pro"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/pro") ? "bg-[color:var(--surface-2)] text-foreground" : "text-primary hover:bg-[color:var(--surface)]",
            )}
          >
            <Crown className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Vibely Pro
          </Link>
          <AdminLink pathname={pathname} />
        </nav>
        <div className="p-3 hairline-t space-y-0.5">
          <Link
            to="/account"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]"
          >
            <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.6} /> Conta
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
            {mobileItems.map(({ to, label, Icon }) => {
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
