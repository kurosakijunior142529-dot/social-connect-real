import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, MapPin, Palette, Sparkles, Tv, X } from "lucide-react";
import { useT } from "@/lib/i18n";

const KEY = "vibely:whats-new-v1";

export function WhatsNewCard() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(KEY) !== "1");
    } catch {
      setShow(false);
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* storage blocked */
    }
  }

  if (!show) return null;

  const items = [
    { to: "/messages", icon: <Palette className="h-4 w-4" />, label: t("whatsNew.bubbles") },
    { to: "/nearby", icon: <MapPin className="h-4 w-4" />, label: t("whatsNew.nearby") },
    { to: "/messages", icon: <Flame className="h-4 w-4" />, label: t("whatsNew.streak") },
    { to: "/watch", icon: <Tv className="h-4 w-4" />, label: t("whatsNew.watch") },
  ];

  return (
    <section className="mx-4 mb-4 rounded-3xl bg-[color:var(--surface)] p-4 ring-1 ring-primary/20">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {t("whatsNew.title")}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("whatsNew.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("actions.close")}
          className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground active:bg-[color:var(--surface-2)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((i, idx) => (
          <Link
            key={idx}
            to={i.to}
            className="flex items-center gap-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2.5 text-[13px] font-medium active:scale-[0.98]"
          >
            <span className="text-primary">{i.icon}</span>
            <span className="truncate">{i.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
