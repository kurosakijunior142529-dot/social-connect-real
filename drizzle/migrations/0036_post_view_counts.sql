-- Conta visualizações reais em posts.view_count
CREATE OR REPLACE FUNCTION public.log_post_view(_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _new boolean := false;
BEGIN
  IF _me IS NULL OR _post_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.post_views(user_id, post_id, viewed_at)
  VALUES (_me, _post_id, now())
  ON CONFLICT (user_id, post_id) DO UPDATE SET viewed_at = now()
  RETURNING (xmax = 0) INTO _new;

  IF _new THEN
    UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = _post_id;
  END IF;

  INSERT INTO public.user_topic_affinity(user_id, topic, weight, updated_at)
  SELECT _me, h.tag, 1, now()
    FROM public.post_hashtags ph JOIN public.hashtags h ON h.id = ph.hashtag_id
   WHERE ph.post_id = _post_id
  ON CONFLICT (user_id, topic) DO UPDATE
    SET weight = LEAST(50, public.user_topic_affinity.weight + 1), updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.log_post_view(uuid) TO authenticated;

-- Reconstrói o histórico já registrado
UPDATE public.posts p
   SET view_count = GREATEST(COALESCE(p.view_count, 0), v.c)
  FROM (SELECT post_id, count(*)::int AS c FROM public.post_views GROUP BY post_id) v
 WHERE v.post_id = p.id;