import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VerifiedName } from "@/components/verified-badge";
import { useT } from "@/lib/i18n";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications, markAllRead, type NotificationRow } from "@/hooks/use-notifications";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle, UserPlus, Smile, Users, Bell } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
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

const ALLOWED = new Set(["like", "comment", "follow", "story_reaction", "chat_invite"]);

function label(n: NotificationRow) {
  const name = n.actor?.display_name ?? "Alguém";
  switch (n.type) {
    case "like": return `${name} curtiu seu post`;
    case "comment": return `${name} comentou: "${n.metadata?.preview ?? ""}"`;
    case "follow": return `${name} começou a te seguir`;
     case "story_reaction": return `${name} reagiu à sua Vibe ${n.metadata?.emoji ?? ""}`;
    case "chat_invite": return `${name} te convidou para um grupo`;
    default: return `${name} interagiu com você`;
  }
}

function NotificationsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useNotifications(user.id);
  const items = (q.data ?? []).filter((n) => ALLOWED.has(n.type));

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
      <header className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="font-display text-3xl font-bold">{t("notifications.title")}</h1>
      </header>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t("notifications.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            const isInvite = n.type === "chat_invite";
            return (
              <li
                key={n.id}
                className="group flex items-start gap-3 rounded-2xl p-3 hover:bg-white/5 transition cursor-pointer"
                onClick={() => !isInvite && openTarget(n)}
              >
                <div className="relative">
                  {n.actor ? (
                    <UserAvatar avatarPath={n.actor.avatar_url} displayName={n.actor.display_name} verified={!!(n.actor as any).is_verified} badgeVariant={((n.actor as any).badge_variant) ?? null} className="h-11 w-11" />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-muted grid place-items-center"><Bell className="h-5 w-5" /></div>
                  )}
                  <span className="absolute -bottom-1 -right-1 grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                    <Icon className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {n.actor?.username ? (
                      <Link
                        to="/u/$username"
                        params={{ username: n.actor.username }}
                        className="font-semibold hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <VerifiedName name={n.actor.display_name} verified={(n.actor as any).is_verified} badgeVariant={(n.actor as any).badge_variant} size={13} />
                      </Link>
                    ) : "Alguém"}
                    <span className="text-muted-foreground"> — {label(n).split(" — ")[0].replace(n.actor?.display_name ?? "", "").trim() || label(n)}</span>
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
                  </span>
                  {isInvite && n.entity_id ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); respondInvite(n.entity_id!, true); }}>Aceitar</Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); respondInvite(n.entity_id!, false); }}>Recusar</Button>
                    </div>
                  ) : null}
                </div>
                {!n.read_at ? <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
