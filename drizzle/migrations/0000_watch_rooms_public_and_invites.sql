-- 1. Extra metadata for watch rooms (additive, nullable / defaulted)
ALTER TABLE public.watch_rooms
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'invite',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS max_members integer NOT NULL DEFAULT 50;

UPDATE public.watch_rooms
   SET visibility = CASE WHEN is_private THEN 'invite' ELSE 'public' END
 WHERE visibility = 'invite';

ALTER TABLE public.watch_rooms
  DROP CONSTRAINT IF EXISTS watch_rooms_visibility_chk;
ALTER TABLE public.watch_rooms
  ADD CONSTRAINT watch_rooms_visibility_chk CHECK (visibility IN ('public', 'private', 'invite'));

ALTER TABLE public.watch_rooms
  DROP CONSTRAINT IF EXISTS watch_rooms_max_members_chk;
ALTER TABLE public.watch_rooms
  ADD CONSTRAINT watch_rooms_max_members_chk CHECK (max_members BETWEEN 2 AND 500);

CREATE OR REPLACE FUNCTION public.sync_watch_room_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_private := (COALESCE(NEW.visibility, 'invite') <> 'public');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_watch_room_visibility ON public.watch_rooms;
CREATE TRIGGER trg_sync_watch_room_visibility
BEFORE INSERT OR UPDATE ON public.watch_rooms
FOR EACH ROW EXECUTE FUNCTION public.sync_watch_room_visibility();

CREATE INDEX IF NOT EXISTS watch_rooms_public_idx
  ON public.watch_rooms (visibility, created_at DESC)
  WHERE closed_at IS NULL;

-- 2. Joining is now only possible through validated SECURITY DEFINER functions.
DROP POLICY IF EXISTS members_insert_self ON public.watch_room_members;

-- 3. Validated join by room id (public rooms, hosts and existing members)
CREATE OR REPLACE FUNCTION public.join_watch_room(_room uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.join_watch_room_impl(_room);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_watch_room_impl(_room uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _r RECORD;
  _already boolean;
  _count integer;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT id, host_id, visibility, closed_at, max_members
    INTO _r
    FROM public.watch_rooms WHERE id = _room;

  IF _r.id IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF _r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'ROOM_CLOSED'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.watch_room_members
     WHERE room_id = _room AND user_id = _me
  ) INTO _already;

  IF NOT _already AND _r.host_id <> _me AND _r.visibility <> 'public' THEN
    RAISE EXCEPTION 'INVITE_REQUIRED';
  END IF;

  SELECT count(*) INTO _count
    FROM public.watch_room_members
   WHERE room_id = _room AND left_at IS NULL AND user_id <> _me;

  IF _count >= _r.max_members THEN RAISE EXCEPTION 'ROOM_FULL'; END IF;

  INSERT INTO public.watch_room_members (room_id, user_id, left_at)
  VALUES (_room, _me, NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL;

  RETURN 'ok';
END;
$$;

DROP FUNCTION IF EXISTS public.join_watch_room(uuid);
CREATE OR REPLACE FUNCTION public.join_watch_room(_room uuid)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.join_watch_room_impl(_room);
$$;

-- 4. Invite-code join, tolerant to links, paths and whitespace
CREATE OR REPLACE FUNCTION public.normalize_invite_code(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(
    CASE
      WHEN position('code=' in _code) > 0 THEN split_part(split_part(_code, 'code=', 2), '&', 1)
      WHEN position('/' in _code) > 0 THEN regexp_replace(split_part(regexp_replace(trim(_code), '/+$', ''), '?', 1), '^.*/', '')
      ELSE trim(_code)
    END, '[^a-zA-Z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.join_watch_room_by_code(_code text)
RETURNS TABLE(room_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text;
  _room uuid;
  _me uuid := auth.uid();
  _r RECORD;
  _count integer;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  _norm := public.normalize_invite_code(COALESCE(_code, ''));
  IF _norm IS NULL OR length(_norm) = 0 THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;

  SELECT id, closed_at, max_members INTO _r
    FROM public.watch_rooms WHERE lower(invite_code) = _norm LIMIT 1;

  IF _r.id IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF _r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'ROOM_CLOSED'; END IF;

  SELECT count(*) INTO _count
    FROM public.watch_room_members
   WHERE watch_room_members.room_id = _r.id AND left_at IS NULL AND user_id <> _me;
  IF _count >= _r.max_members THEN RAISE EXCEPTION 'ROOM_FULL'; END IF;

  INSERT INTO public.watch_room_members (room_id, user_id, left_at)
  VALUES (_r.id, _me, NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL;

  room_id := _r.id;
  RETURN NEXT;
END;
$$;

-- 5. Public discovery list
CREATE OR REPLACE FUNCTION public.list_public_watch_rooms(_search text DEFAULT NULL, _category text DEFAULT NULL, _limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  title text,
  provider text,
  video_id text,
  category text,
  cover_url text,
  created_at timestamptz,
  max_members integer,
  member_count bigint,
  host_id uuid,
  host_username text,
  host_display_name text,
  host_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.title, r.provider, r.video_id, r.category, r.cover_url, r.created_at, r.max_members,
         (SELECT count(*) FROM public.watch_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL),
         r.host_id, p.username, p.display_name, p.avatar_url
    FROM public.watch_rooms r
    LEFT JOIN public.profiles p ON p.id = r.host_id
   WHERE r.visibility = 'public'
     AND r.closed_at IS NULL
     AND (_category IS NULL OR _category = '' OR r.category = _category)
     AND (_search IS NULL OR _search = '' OR r.title ILIKE '%' || _search || '%' OR COALESCE(p.username,'') ILIKE '%' || _search || '%')
   ORDER BY (SELECT count(*) FROM public.watch_room_members m2 WHERE m2.room_id = r.id AND m2.left_at IS NULL) DESC,
            r.created_at DESC
   LIMIT LEAST(COALESCE(_limit, 50), 100);
$$;

-- 6. Invite preview (works signed out so the invite page can render before login)
CREATE OR REPLACE FUNCTION public.watch_room_invite_preview(_code text)
RETURNS TABLE(
  id uuid,
  title text,
  provider text,
  category text,
  cover_url text,
  video_id text,
  visibility text,
  closed boolean,
  max_members integer,
  member_count bigint,
  host_username text,
  host_display_name text,
  host_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.title, r.provider, r.category, r.cover_url, r.video_id, r.visibility,
         (r.closed_at IS NOT NULL),
         r.max_members,
         (SELECT count(*) FROM public.watch_room_members m WHERE m.room_id = r.id AND m.left_at IS NULL),
         p.username, p.display_name, p.avatar_url
    FROM public.watch_rooms r
    LEFT JOIN public.profiles p ON p.id = r.host_id
   WHERE lower(r.invite_code) = public.normalize_invite_code(COALESCE(_code, ''))
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.join_watch_room_impl(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_watch_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_watch_room_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_watch_rooms(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_room_invite_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_invite_code(text) TO anon, authenticated;
