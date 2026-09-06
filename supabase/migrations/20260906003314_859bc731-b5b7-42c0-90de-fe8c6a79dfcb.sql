-- Fecha salas antigas sem ninguém dentro e sem atividade nas últimas 48h
UPDATE public.watch_rooms r
   SET closed_at = now()
 WHERE r.closed_at IS NULL
   AND r.created_at < now() - interval '48 hours'
   AND NOT EXISTS (
     SELECT 1 FROM public.watch_room_members m
      WHERE m.room_id = r.id AND m.left_at IS NULL
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.watch_room_state s
      WHERE s.room_id = r.id AND s.updated_at > now() - interval '48 hours'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.watch_room_messages msg
      WHERE msg.room_id = r.id AND msg.created_at > now() - interval '48 hours'
   );

-- Lista pública passa a mostrar só salas vivas:
-- alguém dentro, ou atividade (estado/chat) nas últimas 24h
CREATE OR REPLACE FUNCTION public.list_public_watch_rooms(
  _search text DEFAULT NULL::text,
  _category text DEFAULT NULL::text,
  _limit integer DEFAULT 50
)
 RETURNS TABLE(id uuid, title text, provider text, video_id text, category text, cover_url text, created_at timestamp with time zone, max_members integer, member_count bigint, host_id uuid, host_username text, host_display_name text, host_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.title, r.provider, r.video_id, r.category, r.cover_url, r.created_at, r.max_members,
         (SELECT count(*) FROM public.watch_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL),
         r.host_id, p.username, p.display_name, p.avatar_url
    FROM public.watch_rooms r
    LEFT JOIN public.profiles p ON p.id = r.host_id
   WHERE r.visibility = 'public'
     AND r.closed_at IS NULL
     AND (
       EXISTS (SELECT 1 FROM public.watch_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL)
       OR r.created_at > now() - interval '24 hours'
       OR EXISTS (SELECT 1 FROM public.watch_room_state s WHERE s.room_id = r.id AND s.updated_at > now() - interval '24 hours')
       OR EXISTS (SELECT 1 FROM public.watch_room_messages msg WHERE msg.room_id = r.id AND msg.created_at > now() - interval '24 hours')
     )
     AND (_category IS NULL OR _category = '' OR r.category = _category)
     AND (_search IS NULL OR _search = '' OR r.title ILIKE '%' || _search || '%' OR COALESCE(p.username,'') ILIKE '%' || _search || '%')
   ORDER BY (SELECT count(*) FROM public.watch_room_members m2 WHERE m2.room_id = r.id AND m2.left_at IS NULL) DESC,
            r.created_at DESC
   LIMIT LEAST(COALESCE(_limit, 50), 100);
$function$;