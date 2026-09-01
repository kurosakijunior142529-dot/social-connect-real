-- Profiles: only authenticated users can read, and only non-sensitive columns.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

GRANT SELECT (
  id, username, display_name, bio, avatar_url, created_at, updated_at,
  cover_url, website, location, pronouns, show_online, read_receipts,
  is_verified, is_creator, badge_variant, username_changed_at,
  dm_privacy, interests, favorite_track, featured_username
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

-- Live gifts: block any direct client insert; creation happens through
-- SECURITY DEFINER functions that debit coins atomically.
REVOKE INSERT, UPDATE, DELETE ON public.live_gifts FROM anon, authenticated;
GRANT SELECT ON public.live_gifts TO authenticated;
GRANT ALL ON public.live_gifts TO service_role;
