CREATE OR REPLACE FUNCTION public.list_public_watch_rooms(
  _search text DEFAULT NULL::text,
  _category text DEFAULT NULL::text,
  _limit integer DEFAULT 50
)
RETURNS SETOF public.watch_rooms
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.*
  FROM public.watch_rooms r
  WHERE r.closed_at IS NULL
    AND r.visibility = 'public'
    AND NOT EXISTS (SELECT 1 FROM public.realities x WHERE x.room_id = r.id)
    AND (_search IS NULL OR r.title ILIKE '%' || _search || '%')
    AND (_category IS NULL OR r.category = _category)
    AND (
      r.scheduled_at > now() - interval '1 hour'
      OR (
        r.created_at > now() - interval '24 hours'
        AND (
          EXISTS (SELECT 1 FROM public.watch_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.watch_room_state s WHERE s.room_id = r.id AND s.updated_at > now() - interval '30 minutes')
          OR EXISTS (SELECT 1 FROM public.watch_room_messages msg WHERE msg.room_id = r.id AND msg.created_at > now() - interval '30 minutes')
        )
      )
    )
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$function$;

CREATE OR REPLACE FUNCTION public.reality_room_ids(_ids uuid[])
RETURNS TABLE(room_id uuid, reality_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT x.room_id, x.id FROM public.realities x WHERE x.room_id = ANY(_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.reality_room_ids(uuid[]) TO authenticated;
