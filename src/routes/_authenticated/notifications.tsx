import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VerifiedName } from "@/components/verified-badge";
import { useT } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications, markAllRead, type NotificationRow } from "@/hooks/use-notifications";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle, UserPlus, Smile, Users, Bell } from "lucide-react";
import { formatDistanceToNowStrict } from "@/lib/safe-date";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const ICONS: Record<string, any> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  story_reaction: Smile,
  chat_invite: Users,
};

const ALLOWED = new Set(["like", "comment", "follow", "story_reaction", "chat_invite", "system"]);

function label(n: NotificationRow) {
  const name = n.actor?.display_name ?? "Alguém";
  switch (n.type) {
    case "system": return (n.metadata?.message as string) ?? "Aviso do Vibely";
    case "like": return `${name} curtiu seu post`;
    case "comment": return `${name} comentou: "${n.metadata?.preview ?? ""}"`;
    case "follow": return `${name} começou a te seguir`;
     case "story_reaction": return `${name} reagiu à sua Vibe ${n.metadata?.emoji ?? ""}`;
    case "chat_invite": return `${name} te convidou para um grupo`;
    default: return `${name} interagiu com você`;
  }
}

type Tab = "all" | "likes" | "comments" | "follows" | "invites";
const TABS: [Tab, string][] = [["all", "Tudo"], ["likes", "Curtidas"], ["comments", "Comentários"], ["follows", "Seguidores"], ["invites", "Convites"]];
const TAB_TYPES: Record<Exclude<Tab, "all">, string[]> = {
  likes: ["like", "story_reaction"],
  comments: ["comment"],
  follows: ["follow"],
  invites: ["chat_invite", "system"],
};

function dayGroup(iso: string) {
  const d = new Date(iso); const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (d.toDateString() === now.toDateString()) return "Hoje";
  if (diff < 7) return "Esta semana";
  return "Anteriores";
}

function NotificationsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useNotifications(user.id);
  const [tab, setTab] = useState<Tab>("all");
  const all = useMemo(() => (q.data ?? []).filter((n) => ALLOWED.has(n.type)), [q.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [k, types] of Object.entries(TAB_TYPES)) c[k] = all.filter((n) => !n.read_at && types.includes(n.type)).length;
    return c;
  }, [all]);
  const items = useMemo(() => {
    const base = tab === "all" ? all : all.filter((n) => TAB_TYPES[tab].includes(n.type));
    const out: (NotificationRow & { others?: number })[] = [];
    const likeIdx = new Map<string, number>();
    for (const n of base) {
      if (n.type === "like" && n.entity_id) {
        const i = likeIdx.get(n.entity_id);
        if (i !== undefined) { out[i] = { ...out[i], others: (out[i].others ?? 0) + 1 }; continue; }
        likeIdx.set(n.entity_id, out.length);
      }
      out.push(n);
    }
    return out;
  }, [all, tab]);
  const groups = useMemo(() => {
    const g: { label: string; items: typeof items }[] = [];
    for (const n of items) {
      const l = dayGroup(n.created_at);
      const last = g[g.length - 1];
      if (last?.label === l) last.items.push(n); else g.push({ label: l, items: [n] });
    }
    return g;
  }, [items]);

  useEffect(() => {
    markAllRead().then(() => qc.invalidateQueries({ queryKey: ["notifications-unread", user.id] }));
  }, [user.id, qc]);

  async function respondInvite(inviteId: string, accept: boolean) {
    const { error } = await (supabase as any)
      .from("chat_invites")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", inviteId);
    if (error) return toast.error(error.message);
    toast.success(accept ? "Você entrou no grupo" : "Convite recusado");
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  }

  const t = useT();

  function openTarget(n: NotificationRow) {
    if (n.entity_type === "post" && n.entity_id) navigate({ to: "/p/$id", params: { id: n.entity_id } });
    else if (n.entity_type === "conversation" && n.entity_id) navigate({ to: "/messages/$conversationId", params: { conversationId: n.entity_id } });
    else if (n.entity_type === "chat" && n.entity_id) navigate({ to: "/chats/$id", params: { id: n.entity_id } });
    else if (n.type === "follow" && n.actor?.username) navigate({ to: "/u/$username", params: { username: n.actor.username } });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold truncate">{t("notifications.title")}</h1>
          <p className="text-xs text-muted-foreground">Tudo o que rolou com você</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface)]">
          <Bell className="h-5 w-5" />
        </span>
      </header>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {TABS.map(([k, l]) => {
          const c = k === "all" ? 0 : counts[k];
          return (
            <button key={k} type="button" onClick={() => setTab(k)} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition active:scale-95 ${tab === k ? "border-transparent bg-foreground text-background" : "border-[color:var(--hairline)] bg-[color:var(--surface)] text-muted-foreground"}`}>
              {l}
              {c > 0 ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{c}</span> : null}
            </button>
          );
        })}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-10 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--surface-2)]">
            <Bell className="h-6 w-6 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">Nada por aqui ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("notifications.empty")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</h2>
              <ul className="overflow-hidden rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] divide-y divide-[color:var(--hairline)]">
                {g.items.map((n) => {
                  const Icon = ICONS[n.type] ?? Bell;
                  const isInvite = n.type === "chat_invite";
                  return (
                    <li
                      key={n.id}
                      className={`flex items-start gap-3 p-3 transition cursor-pointer active:bg-[color:var(--surface-2)] ${!n.read_at ? "bg-primary/5" : ""}`}
                      onClick={() => !isInvite && openTarget(n)}
                    >
                      <div className="relative shrink-0">
                        {n.actor ? (
                          <UserAvatar avatarPath={n.actor.avatar_url} displayName={n.actor.display_name} verified={!!(n.actor as any).is_verified} badgeVariant={((n.actor as any).badge_variant) ?? null} className="h-11 w-11" />
                        ) : (
                          <div className="h-11 w-11 rounded-full bg-muted grid place-items-center"><Bell className="h-5 w-5" /></div>
                        )}
                        <span className="absolute -bottom-1 -right-1 grid place-items-center h-5 w-5 rounded-full border-2 border-[color:var(--surface)] bg-foreground text-background">
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">
                          {n.actor?.username ? (
                            <Link
                              to="/u/$username"
                              params={{ username: n.actor.username }}
                              className="font-semibold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <VerifiedName name={n.actor.display_name} verified={(n.actor as any).is_verified} badgeVariant={(n.actor as any).badge_variant} size={13} />
                            </Link>
                          ) : n.type === "system" ? <span className="font-semibold">Vibely</span> : "Alguém"}
                          {n.others ? <span className="font-semibold"> e mais {n.others}</span> : null}
                          <span className="text-muted-foreground"> {n.others ? "curtiram seu post" : label(n).replace(n.actor?.display_name ?? "", "").trim() || label(n)}</span>
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                        {isInvite && n.entity_id ? (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" className="rounded-full" onClick={(e) => { e.stopPropagation(); respondInvite(n.entity_id!, true); }}>Aceitar</Button>
                            <Button size="sm" variant="secondary" className="rounded-full" onClick={(e) => { e.stopPropagation(); respondInvite(n.entity_id!, false); }}>Recusar</Button>
                          </div>
                        ) : null}
                      </div>
                      {!n.read_at ? <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" /> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
