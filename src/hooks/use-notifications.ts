import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any>;
  read_at: string | null;
  created_at: string;
  actor?: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
};

export function useUnreadNotifications(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications-unread", userId] });
          qc.invalidateQueries({ queryKey: ["notifications", userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  return useQuery({
    queryKey: ["notifications-unread", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      const rows = (data ?? []) as NotificationRow[];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
      const { data: profs } = actorIds.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds)
        : { data: [] as any[] };
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, actor: r.actor_id ? pmap.get(r.actor_id) ?? null : null }));
    },
  });
}

export async function markAllRead() {
  await (supabase as any).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}
