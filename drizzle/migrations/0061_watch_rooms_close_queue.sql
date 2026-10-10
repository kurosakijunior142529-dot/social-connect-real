CREATE OR REPLACE FUNCTION public.list_public_watch_rooms(_search text DEFAULT NULL::text, _category text DEFAULT NULL::text, _limit integer DEFAULT 50)
 RETURNS SETOF watch_rooms
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.*
  FROM public.watch_rooms r
  WHERE r.closed_at IS NULL
    AND r.visibility = 'public'
    AND NOT EXISTS (SELECT 1 FROM public.realities x WHERE x.room_id = r.id)
    AND (_search IS NULL OR r.title ILIKE '%' || _search || '%')
    AND (_category IS NULL OR r.category = _category)
    AND (
      r.scheduled_at > now()
      OR (
        EXISTS (SELECT 1 FROM public.watch_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL)
        AND (
          EXISTS (SELECT 1 FROM public.watch_room_state s WHERE s.room_id = r.id AND s.updated_at > now() - interval '10 minutes')
          OR EXISTS (SELECT 1 FROM public.watch_room_messages msg WHERE msg.room_id = r.id AND msg.created_at > now() - interval '10 minutes')
          OR r.created_at > now() - interval '15 minutes'
        )
      )
    )
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$function$;

CREATE OR REPLACE FUNCTION public.close_watch_room(_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_watch_host(_room, auth.uid()) THEN RAISE EXCEPTION 'NOT_HOST'; END IF;
  UPDATE public.watch_rooms SET closed_at = now(), updated_at = now() WHERE id = _room AND closed_at IS NULL;
  UPDATE public.watch_room_members SET left_at = now() WHERE room_id = _room AND left_at IS NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.close_watch_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_watch_room(_room uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _closed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  UPDATE public.watch_room_members SET left_at = now() WHERE room_id = _room AND user_id = auth.uid() AND left_at IS NULL;
  IF public.is_watch_host(_room, auth.uid())
     OR NOT EXISTS (SELECT 1 FROM public.watch_room_members WHERE room_id = _room AND left_at IS NULL) THEN
    UPDATE public.watch_rooms SET closed_at = now(), updated_at = now() WHERE id = _room AND closed_at IS NULL;
    UPDATE public.watch_room_members SET left_at = now() WHERE room_id = _room AND left_at IS NULL;
    _closed := true;
  END IF;
  RETURN _closed;
END $$;
GRANT EXECUTE ON FUNCTION public.leave_watch_room(uuid) TO authenticated;

CREATE TABLE public.watch_room_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  video_id text NOT NULL CHECK (char_length(video_id) BETWEEN 6 AND 20),
  title text CHECK (title IS NULL OR char_length(title) <= 120),
  added_by uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','played')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX watch_room_queue_room_idx ON public.watch_room_queue(room_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_room_queue TO authenticated;
GRANT ALL ON public.watch_room_queue TO service_role;
ALTER TABLE public.watch_room_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read queue" ON public.watch_room_queue FOR SELECT TO authenticated
  USING (public.is_watch_member(room_id, auth.uid()) OR public.is_watch_host(room_id, auth.uid()));
CREATE POLICY "members suggest" ON public.watch_room_queue FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND status = 'pending' AND (public.is_watch_member(room_id, auth.uid()) OR public.is_watch_host(room_id, auth.uid())));
CREATE POLICY "host manages queue" ON public.watch_room_queue FOR UPDATE TO authenticated
  USING (public.is_watch_host(room_id, auth.uid())) WITH CHECK (public.is_watch_host(room_id, auth.uid()));
CREATE POLICY "host or author deletes" ON public.watch_room_queue FOR DELETE TO authenticated
  USING (added_by = auth.uid() OR public.is_watch_host(room_id, auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_queue;