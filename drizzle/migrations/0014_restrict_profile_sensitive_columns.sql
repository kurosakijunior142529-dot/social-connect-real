-- Sensitive child-safety / moderation columns must not be readable by every
-- authenticated user. Owners read them through my_profile()/my_account_state()
-- (security definer), admins through admin_* functions.
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id, username, display_name, bio, avatar_url, created_at, updated_at,
  cover_url, website, location, pronouns, show_online, read_receipts,
  is_verified, is_creator, badge_variant, username_changed_at,
  dm_privacy, interests, favorite_track, featured_username
) ON public.profiles TO authenticated;

GRANT SELECT (
  id, username, display_name, bio, avatar_url, created_at, updated_at,
  cover_url, website, location, pronouns, is_verified, is_creator,
  badge_variant, interests, favorite_track, featured_username
) ON public.profiles TO anon;

GRANT ALL ON public.profiles TO service_role;
