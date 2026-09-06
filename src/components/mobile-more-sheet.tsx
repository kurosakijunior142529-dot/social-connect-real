import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  Bookmark,
  Crown,
  Gamepad2,
  Headphones,
  LogOut,
  MapPin,
  Menu,
  Radio,
  Settings as SettingsIcon,
  Shield,
  Store,
  Tv,
  Wallet,
} from "lucide-react";
import vibelyMascot from "@/assets/vibely-mascot.png";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SEEN_KEY = "vibely:more-seen";

type Entry = {
  to: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  isNew?: boolean;
};

export function MobileMoreSheet({ onSignOut }: { onSignOut: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
      const { data: r } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!r);
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

  const entries: Entry[] = [
    { to: "/nearby", label: t("nav.nearby"), hint: t("more.nearbyHint"), icon: <MapPin className="h-[18px] w-[18px]" />, isNew: true },
    { to: "/watch", label: t("nav.watch"), hint: t("more.watchHint"), icon: <Tv className="h-[18px] w-[18px]" />, isNew: true },
    { to: "/ai", label: "Vibely AI", hint: t("more.aiHint"), icon: <img src={vibelyMascot} alt="" width={816} height={816} className="h-[20px] w-[20px] object-contain" /> },
    { to: "/lives", label: t("nav.lives"), hint: t("more.livesHint"), icon: <Radio className="h-[18px] w-[18px]" /> },
    { to: "/notifications", label: t("nav.notifications"), hint: t("more.notificationsHint"), icon: <Bell className="h-[18px] w-[18px]" /> },
    { to: "/saved", label: t("nav.saved"), hint: t("more.savedHint"), icon: <Bookmark className="h-[18px] w-[18px]" /> },
    { to: "/games", label: t("nav.games"), hint: t("more.gamesHint"), icon: <Gamepad2 className="h-[18px] w-[18px]" /> },
    { to: "/voice", label: t("nav.voice"), hint: t("more.voiceHint"), icon: <Headphones className="h-[18px] w-[18px]" /> },
    { to: "/marketplace", label: t("nav.marketplace"), hint: t("more.marketplaceHint"), icon: <Store className="h-[18px] w-[18px]" /> },
    { to: "/wallet", label: t("nav.wallet"), hint: t("more.walletHint"), icon: <Wallet className="h-[18px] w-[18px]" /> },
    { to: "/pro", label: "Vibely Pro", hint: t("more.proHint"), icon: <Crown className="h-[18px] w-[18px]" /> },
    { to: "/account", label: t("settings.account"), hint: t("more.accountHint"), icon: <SettingsIcon className="h-[18px] w-[18px]" /> },
  ];

  if (isAdmin) {
    entries.push({ to: "/admin", label: "Painel admin", hint: t("more.adminHint"), icon: <Shield className="h-[18px] w-[18px]" /> });
  }

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
          <div className="mt-3 grid gap-1 pb-6">
            {entries.map((e) => (
              <Link
                key={e.to}
                to={e.to}
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
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={cn(
                "mt-2 flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-destructive transition-colors active:bg-[color:var(--surface-2)]",
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
