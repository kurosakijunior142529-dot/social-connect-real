import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  Bookmark,
  Compass,
  Crown,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Music,
  PlusSquare,
  Radio,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Store,
  Sun,
  Trophy,
  Tv,
  User as UserIcon,
  Wallet,
  Wand2,
} from "lucide-react";
import vibelyMascot from "@/assets/vibely-mascot.png";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { useAppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const SEEN_KEY = "vibely:more-seen";

type Entry = {
  to: string;
  params?: Record<string, string>;
  label: string;
  hint: string;
  icon: ReactNode;
  isNew?: boolean;
};

type Group = { title: string; items: Entry[] };

export function MobileMoreSheet({ onSignOut }: { onSignOut: () => void }) {
  const t = useT();
  const { theme, setTheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "admin")
          .maybeSingle(),
        supabase.from("profiles").select("username").eq("id", data.user.id).maybeSingle(),
      ]);
      setIsAdmin(!!r);
      setUsername(p?.username ?? null);
    });
  }, []);

  function markSeen() {
    setSeen(true);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked */
    }
  }

  const icon = "h-[18px] w-[18px]";

  const discover: Entry[] = [
    { to: "/nearby", label: t("nav.nearby"), hint: t("more.nearbyHint"), icon: <MapPin className={icon} />, isNew: true },
    { to: "/watch", label: t("nav.watch"), hint: t("more.watchHint"), icon: <Tv className={icon} />, isNew: true },
    { to: "/explore", label: t("nav.explore"), hint: t("more.exploreHint"), icon: <Compass className={icon} /> },
    { to: "/lives", label: t("nav.lives"), hint: t("more.livesHint"), icon: <Radio className={icon} /> },
    { to: "/marketplace", label: t("nav.marketplace"), hint: t("more.marketplaceHint"), icon: <Store className={icon} /> },
  ];

  const create: Entry[] = [
    { to: "/create", label: t("nav.create"), hint: t("more.createHint"), icon: <PlusSquare className={icon} /> },
    { to: "/create/studio", label: "Vibely Studio", hint: t("more.studioHint"), icon: <Wand2 className={icon} />, isNew: true },
    { to: "/stories/new", label: t("more.newVibe"), hint: t("more.newVibeHint"), icon: <ImageIcon className={icon} /> },
    { to: "/ai", label: "Vibely AI", hint: t("more.aiHint"), icon: <img src={vibelyMascot} alt="" width={816} height={816} className="h-[20px] w-[20px] object-contain" /> },
    { to: "/music", label: t("more.music"), hint: t("more.musicHint"), icon: <Music className={icon} /> },
  ];

  const fun: Entry[] = [
    { to: "/games", label: t("nav.games"), hint: t("more.gamesHint"), icon: <Gamepad2 className={icon} /> },
    { to: "/voice", label: t("nav.voice"), hint: t("more.voiceHint"), icon: <Headphones className={icon} /> },
    { to: "/messages", label: t("nav.messages"), hint: t("more.messagesHint"), icon: <MessageCircle className={icon} /> },
    { to: "/notifications", label: t("nav.notifications"), hint: t("more.notificationsHint"), icon: <Bell className={icon} /> },
    { to: "/saved", label: t("nav.saved"), hint: t("more.savedHint"), icon: <Bookmark className={icon} /> },
  ];

  const account: Entry[] = [];
  if (username) {
    account.push({
      to: "/u/$username",
      params: { username },
      label: t("nav.profile"),
      hint: t("more.profileHint"),
      icon: <UserIcon className={icon} />,
    });
    account.push({
      to: "/achievements/$username",
      params: { username },
      label: t("more.achievements"),
      hint: t("more.achievementsHint"),
      icon: <Trophy className={icon} />,
    });
  }
  account.push(
    { to: "/wallet", label: t("nav.wallet"), hint: t("more.walletHint"), icon: <Wallet className={icon} /> },
    { to: "/pro", label: "Vibely Pro", hint: t("more.proHint"), icon: <Crown className={icon} /> },
    { to: "/account", label: t("settings.account"), hint: t("more.accountHint"), icon: <SettingsIcon className={icon} /> },
    { to: "/settings", label: t("nav.settings"), hint: t("more.settingsHint"), icon: <Sparkles className={icon} /> },
  );
  if (isAdmin) {
    account.push({ to: "/admin", label: t("nav.admin"), hint: t("more.adminHint"), icon: <Shield className={icon} /> });
  }

  const groups: Group[] = [
    { title: t("more.groupDiscover"), items: discover },
    { title: t("more.groupCreate"), items: create },
    { title: t("more.groupFun"), items: fun },
    { title: t("more.groupAccount"), items: account },
  ];

  return (
    <>
      <button
        type="button"
        aria-label={t("more.title")}
        onClick={() => {
          setOpen(true);
          markSeen();
        }}
        className="relative grid h-11 w-11 place-items-center rounded-[15px] text-muted-foreground transition-colors active:bg-[color:var(--surface-2)]"
      >
        <Menu className="h-[22px] w-[22px]" strokeWidth={1.6} />
        {!seen ? (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-white/10 glass-heavy">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">{t("more.title")}</SheetTitle>
          </SheetHeader>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-[color:var(--surface-2)] px-3 py-3 text-left transition-colors active:opacity-80"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background text-primary">
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{t("more.theme")}</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {theme === "dark" ? t("more.themeDark") : t("more.themeLight")}
              </span>
            </span>
          </button>

          <div className="mt-2 grid gap-4 pb-6">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {g.title}
                </div>
                <div className="grid gap-1">
                  {g.items.map((e) => (
                    <Link
                      key={e.to + (e.params?.username ?? "")}
                      to={e.to}
                      params={e.params as never}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors active:bg-[color:var(--surface-2)]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--surface-2)] text-foreground">
                        {e.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold">{e.label}</span>
                          {e.isNew ? (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                              {t("more.new")}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">{e.hint}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-destructive transition-colors active:bg-[color:var(--surface-2)]",
              )}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--surface-2)]">
                <LogOut className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[15px] font-semibold">{t("nav.logout")}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
