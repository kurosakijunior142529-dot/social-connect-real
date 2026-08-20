-- 1) Column-level protection for sensitive profile fields
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, username, display_name, bio, avatar_url, cover_url, website, location,
  pronouns, show_online, read_receipts, is_verified, is_creator, badge_variant,
  created_at, updated_at, username_changed_at
) ON public.profiles TO anon, authenticated;

GRANT ALL ON public.profiles TO service_role;

-- 2) Owner access to the full row through a security definer function
CREATE OR REPLACE FUNCTION public.my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_account_state()
RETURNS TABLE(strikes integer, is_minor boolean, suspended_until timestamptz, banned_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.strikes, p.is_minor, p.suspended_until, p.banned_at
  FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_account_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_state() TO authenticated, service_role;

-- 3) Extra contact protection for minors: no adult <-> minor private conversations
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  a UUID; b UUID;
  conv_id UUID;
  me_minor BOOLEAN;
  other_minor BOOLEAN;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF me = _other_user THEN RAISE EXCEPTION 'Cannot message yourself'; END IF;

  SELECT is_minor INTO me_minor FROM public.profiles WHERE id = me;
  SELECT is_minor INTO other_minor FROM public.profiles WHERE id = _other_user;
  IF other_minor IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
  IF COALESCE(me_minor,false) <> COALESCE(other_minor,false) THEN
    RAISE EXCEPTION 'Conversas entre adultos e contas de menores não são permitidas';
  END IF;

  IF me < _other_user THEN a := me; b := _other_user; ELSE a := _other_user; b := me; END IF;
  SELECT id INTO conv_id FROM public.conversations WHERE user_a = a AND user_b = b;
  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (user_a, user_b) VALUES (a, b) RETURNING id INTO conv_id;
  END IF;
  RETURN conv_id;
END; $$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated, service_role;