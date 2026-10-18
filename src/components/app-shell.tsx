import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import vibelyMascot from "@/assets/vibely-mascot.png";
import { Home, Search, PlusSquare, Bell, MessageCircle, User as UserIcon, LogOut, Settings as SettingsIcon, Bookmark, Play, Tv, Store, Gamepad2, Radio, Crown, Wallet, Shield, Headphones, MapPin, Aperture } from "lucide-react";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/use-notifications";
import { signOutAndClearSession } from "@/lib/auth-session";
import { MobileMoreSheet } from "@/components/mobile-more-sheet";
import { InAppBanner } from "@/components/in-app-banner";
import { PullToRefresh } from "@/components/pull-to-refresh";

type NavItem = { to: string; label: string; Icon: typeof Home };

function AdminLink({ pathname }: { pathname: string }) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then((r) => ({ data: { user: r.data.session?.user ?? null } })).then(async ({ data }) => {
      if (!data.user) return;
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!r);
    });
  }, []);
  if (!isAdmin) return null;
  const cls = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      active
        ? "bg-[color:var(--surface-2)] text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
    );
  return (
    <>
      <Link to="/admin" className={cls(pathname === "/admin")}>
        <Shield className="h-[18px] w-[18px]" strokeWidth={1.6} />
        Painel admin
      </Link>
      <Link to="/admin/withdrawals" className={cls(pathname.startsWith("/admin/withdrawals"))}>
        <Shield className="h-[18px] w-[18px]" strokeWidth={1.6} />
        Admin · Saques
      </Link>
    </>
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
    supabase.auth.getSession().then((r) => ({ data: { user: r.data.session?.user ?? null } })).then(({ data }) => setUserId(data.user?.id));
  }, []);
  // "Continuar de onde parou": registra a última tela relevante.
  useEffect(() => {
    void import("@/lib/resume").then((m) => m.trackResume(pathname));
  }, [pathname]);
  // Mantém o registro de push válido quando o usuário já autorizou os avisos.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { enablePush, isNativeApp, pushPermission } = await import("@/lib/push");
      if (cancelled) return;
      if (isNativeApp() || pushPermission() === "granted") await enablePush();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const t = useT();
  const unread = useUnreadNotifications(userId);

  const unreadCount = unread.data ?? 0;

  const items: NavItem[] = [
    { to: "/", label: t("nav.home"), Icon: Home },
    { to: "/reels", label: t("nav.reels"), Icon: Play },
    { to: "/lives", label: t("nav.lives"), Icon: Radio },
    { to: "/explore", label: t("nav.explore"), Icon: Search },
    { to: "/create", label: t("nav.create"), Icon: PlusSquare },
    { to: "/notifications", label: t("nav.notifications"), Icon: Bell },
    { to: "/messages", label: t("nav.messages"), Icon: MessageCircle },
    {
      to: currentUsername ? `/u/${currentUsername}` : "/settings",
      label: t("nav.profile"),
      Icon: UserIcon,
    },
  ];

  // Mobile bottom nav: Home · Reels · Pesquisar · Criar · Conversas · Perfil
  const mobileItems: NavItem[] = [
    { to: "/", label: t("nav.home"), Icon: Home },
    { to: "/reels", label: t("nav.reels"), Icon: Play },
    { to: "/explore", label: t("nav.explore"), Icon: Search },
    { to: "/create", label: t("nav.create"), Icon: PlusSquare },
    { to: "/messages", label: t("nav.messages"), Icon: MessageCircle },
    {
      to: currentUsername ? `/u/${currentUsername}` : "/settings",
      label: t("nav.profile"),
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
    pathname === "/saved";
  const isProfile = pathname.startsWith("/u/");
  const isReels = pathname === "/reels";
  const isConversation = (/^\/(messages|chats)\/.+/.test(pathname) && pathname !== "/chats/new") || /^\/watch\/.+/.test(pathname);
  const [dockHidden, setDockHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80 || y < last - 4) setDockHidden(false);
      else if (y > last + 8) setDockHidden(true);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setDockHidden(false), [pathname]);

  const Badge = () =>
    unreadCount > 0 ? (
      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
    ) : null;

  // Arrastar para o lado troca de aba (Feed ↔ Reels ↔ Explorar ↔ Conversas ↔ Perfil).
  // Carrosséis, faixas roláveis e campos de texto têm prioridade sobre o gesto.
  const swipeTabs = mobileItems.filter((i) => i.to !== "/create").map((i) => i.to);
  const swipeIdx = swipeTabs.indexOf(pathname);
  useEffect(() => {
    if (swipeIdx < 0) return;
    let sx = 0, sy = 0, st = 0, ok = false;
    const blocked = (t: EventTarget | null) => {
      let el = t as HTMLElement | null;
      while (el && el !== document.body) {
        if (el.dataset?.swipeLock !== undefined) return true;
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return true;
        if (el.scrollWidth > el.clientWidth + 2) {
          const ox = getComputedStyle(el).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
        el = el.parentElement;
      }
      return false;
    };
    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.innerWidth >= 768) { ok = false; return; }
      ok = !blocked(e.target) && !document.querySelector("[role=dialog]");
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    };
    const up = (e: TouchEvent) => {
      if (!ok) return;
      ok = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - st > 700) return;
      const next = swipeIdx + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= swipeTabs.length) return;
      try { navigator.vibrate?.(6); } catch { /* noop */ }
      void navigate({ to: swipeTabs[next] });
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    return () => { window.removeEventListener("touchstart", down); window.removeEventListener("touchend", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipeIdx, swipeTabs.join("|"), navigate]);

  const refreshKeys = pathname === "/" ? ["feed-graph", "feed", "stories-rail"]
    : pathname === "/messages" ? ["conversations", "conv-prefs", "chats", "chat-mutes"] : [];
  const content = refreshKeys.length ? (
    <PullToRefresh key={pathname} onRefresh={async () => {
      for (const key of refreshKeys) {
        await queryClient.invalidateQueries({ queryKey: [key], refetchType: "active" });
      }
    }}>{children}</PullToRefresh>
  ) : children;

  return (
    <div className="min-h-screen bg-background">
      <InAppBanner userId={userId} />
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col md:border-r md:border-[color:var(--hairline)] md:bg-sidebar">
        <div className="px-6 pt-8 pb-7">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="text-[26px] font-display font-semibold">vibely</span>
            <span className="h-2 w-2 rounded-full bg-primary" />
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
                   "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                   active ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
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
            {t("nav.saved")}
          </Link>
          <Link
            to="/nearby"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/nearby") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <MapPin className="h-[18px] w-[18px]" strokeWidth={1.6} />
            {t("nav.nearby")}
          </Link>

          <Link
            to="/watch"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/watch") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <Tv className="h-[18px] w-[18px]" strokeWidth={1.6} />
            {t("nav.watch")}
          </Link>
          <Link
            to="/ai"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/ai") ? "bg-[color:var(--surface-2)] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]",
            )}
          >
            <img src={vibelyMascot} alt="" loading="lazy" width={816} height={816} className="h-[20px] w-[20px] object-contain" />
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
            {t("nav.wallet")}
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
            <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.6} /> {t("settings.account")}
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-xl px-3 h-auto py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface)]"
            onClick={handleSignOut}
          >
            <LogOut className="h-[18px] w-[18px]" />
            {t("nav.logout")}
          </Button>
        </div>
      </aside>

      <main className={cn("pb-24 md:pl-64 md:pb-8", isProfile && "pb-28", isReels && "pb-0 md:pb-0", isConversation && "pb-0")}>
        <div className={cn("mx-auto md:px-5 md:pt-6", pathname.startsWith("/u/") ? "max-w-6xl" : "max-w-2xl", isReels && "md:pt-6")}>{content}</div>
      </main>

      {/* Atalho flutuante para a IA — apenas na aba de Conversas */}
      {pathname === "/messages" ? (
        <Link
          to="/ai"
          aria-label="Vibely AI"
          className="md:hidden fixed right-4 bottom-[92px] z-30 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--surface-2)] ring-1 ring-white/10 shadow-lg transition-transform active:scale-95"
        >
          <img
            src={vibelyMascot}
            alt="Vibely AI"
            loading="lazy"
            width={816}
            height={816}
            className="h-11 w-11 object-contain"
          />
        </Link>
      ) : null}


      {/* Mobile bottom nav — Dynamic Dock */}
      <nav className={cn("md:hidden fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] pointer-events-none transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]", dockHidden && "translate-y-[calc(100%+4px)]", isConversation && "hidden")}>
        <div className={cn("pointer-events-auto mx-3 mb-3 overflow-visible rounded-[26px] dock-glass", isProfile && "shadow-[0_18px_48px_-22px_color-mix(in_oklab,var(--primary)_28%,transparent)]", isReels && "dark bg-black/35 backdrop-blur-xl ring-1 ring-white/10")}>
          <div className={cn("flex items-center justify-between px-2 py-2", isProfile && "min-h-16")}>
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
                    className="dock-aura relative grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90"
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
                    "relative grid h-11 w-11 place-items-center rounded-[15px] transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <span className="relative">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.6} />
                    {isNotif ? <Badge /> : null}
                  </span>
                  {active ? <span className="absolute bottom-1 h-1 w-3 rounded-full bg-primary" /> : null}
                </Link>
              );
            })}
            <MobileMoreSheet onSignOut={handleSignOut} />
          </div>
        </div>
      </nav>
    </div>
  );
}
