-- 1) Mídias adicionais de uma publicação (carrossel do Reels)
CREATE TABLE IF NOT EXISTS public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  media_type text NOT NULL DEFAULT 'image',
  media_url text NOT NULL,
  thumbnail_url text,
  width integer,
  height integer,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, position)
);

CREATE INDEX IF NOT EXISTS post_media_post_idx ON public.post_media(post_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_media TO authenticated;
GRANT SELECT ON public.post_media TO anon;
GRANT ALL ON public.post_media TO service_role;

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_media_select_all ON public.post_media;
CREATE POLICY post_media_select_all ON public.post_media FOR SELECT USING (true);

DROP POLICY IF EXISTS post_media_write_own ON public.post_media;
CREATE POLICY post_media_write_own ON public.post_media FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

DROP POLICY IF EXISTS post_media_update_own ON public.post_media;
CREATE POLICY post_media_update_own ON public.post_media FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

DROP POLICY IF EXISTS post_media_delete_own ON public.post_media;
CREATE POLICY post_media_delete_own ON public.post_media FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

-- 2) Métricas adicionais para republicações e carrossel
ALTER TABLE public.post_metrics ADD COLUMN IF NOT EXISTS reposts integer NOT NULL DEFAULT 0;
ALTER TABLE public.post_metrics ADD COLUMN IF NOT EXISTS carousel_views integer NOT NULL DEFAULT 0;
ALTER TABLE public.post_metrics ADD COLUMN IF NOT EXISTS carousel_completes integer NOT NULL DEFAULT 0;
ALTER TABLE public.post_metrics ADD COLUMN IF NOT EXISTS repost_impressions integer NOT NULL DEFAULT 0;

-- 3) VIR: novos eventos (carrossel, pausa, republicação)
CREATE OR REPLACE FUNCTION public.vir_log_event(_post_id uuid, _event text, _value numeric DEFAULT 0, _source text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  a_id uuid;
  recent integer;
  safety jsonb := public.vir_cfg('safety');
  from_repost boolean := coalesce(_source, '') like 'repost%';
begin
  if uid is null then return; end if;
  if _event not in ('impression','video_start','watch_25','watch_50','watch_75','video_complete',
                    'replay','like','unlike','comment','share','save','unsave','follow','unfollow',
                    'profile_visit','search','skip','not_interested','report','hide',
                    'pause','resume','repost','unrepost','media_view','media_next','media_prev',
                    'carousel_complete','carousel_abandon') then
    return;
  end if;
  select count(*) into recent from public.vir_events
   where user_id = uid and created_at > now() - interval '1 minute';
  if recent > coalesce((safety->>'max_events_per_min')::int, 180) then return; end if;

  select author_id into a_id from public.posts where id = _post_id;
  insert into public.vir_events (user_id, post_id, author_id, event, value, source)
  values (uid, _post_id, a_id, _event, coalesce(_value, 0), _source);
  if _post_id is null then return; end if;

  insert into public.post_metrics (post_id, author_id) values (_post_id, a_id)
  on conflict (post_id) do nothing;

  update public.post_metrics m set
    impressions = m.impressions + (_event = 'impression')::int,
    repost_impressions = m.repost_impressions + (_event = 'impression' and from_repost)::int,
    starts = m.starts + (_event = 'video_start')::int,
    reached_50 = m.reached_50 + (_event = 'watch_50')::int,
    completes = m.completes + (_event = 'video_complete')::int,
    replays = m.replays + (_event = 'replay')::int,
    likes = m.likes + (_event = 'like')::int - (_event = 'unlike')::int,
    comments = m.comments + (_event = 'comment')::int,
    shares = m.shares + (_event = 'share')::int,
    saves = m.saves + (_event = 'save')::int - (_event = 'unsave')::int,
    reposts = m.reposts + (_event = 'repost')::int - (_event = 'unrepost')::int,
    carousel_views = m.carousel_views + (_event = 'media_view')::int,
    carousel_completes = m.carousel_completes + (_event = 'carousel_complete')::int,
    follows_gained = m.follows_gained + (_event = 'follow')::int,
    profile_visits = m.profile_visits + (_event = 'profile_visit')::int,
    skips = m.skips + (_event = 'skip')::int,
    negatives = m.negatives + (_event in ('not_interested','report','hide'))::int,
    watch_ms = m.watch_ms + case when _event in ('video_complete','watch_75','watch_50','watch_25','skip','media_view')
                                 then greatest(0, coalesce(_value,0))::bigint else 0 end,
    updated_at = now()
  where m.post_id = _post_id;

  perform public.vir_touch_topics(uid, _post_id, _event);
end;
$function$;

-- 4) Contexto social de republicação para o Reels
CREATE OR REPLACE FUNCTION public.reel_repost_context(_post_ids uuid[])
 RETURNS TABLE(post_id uuid, user_id uuid, username text, display_name text, avatar_url text,
               comment text, created_at timestamptz, is_following boolean, total_reposts integer)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.post_id,
         r.user_id,
         pr.username,
         pr.display_name,
         pr.avatar_url,
         r.comment,
         r.created_at,
         exists (select 1 from public.follows f
                  where f.follower_id = auth.uid() and f.following_id = r.user_id) as is_following,
         (select count(*)::int from public.reposts r2 where r2.post_id = r.post_id) as total_reposts
    from public.reposts r
    join public.profiles pr on pr.id = r.user_id
   where r.post_id = any(_post_ids)
     and auth.uid() is not null
     and not public.is_blocked_pair(auth.uid(), r.user_id)
   order by is_following desc, r.created_at desc
$function$;

GRANT EXECUTE ON FUNCTION public.reel_repost_context(uuid[]) TO authenticated;

-- 5) Segurança: presentes de live só pela função que debita moedas
DROP POLICY IF EXISTS "Users send gifts" ON public.live_gifts;
DROP POLICY IF EXISTS live_gifts_insert_own ON public.live_gifts;
DROP POLICY IF EXISTS "live_gifts_insert" ON public.live_gifts;
REVOKE INSERT, UPDATE, DELETE ON public.live_gifts FROM authenticated;