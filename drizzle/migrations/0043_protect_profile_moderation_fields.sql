CREATE OR REPLACE FUNCTION public.protect_profile_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
    OR NEW.is_creator IS DISTINCT FROM OLD.is_creator
    OR NEW.badge_variant IS DISTINCT FROM OLD.badge_variant
    OR NEW.strikes IS DISTINCT FROM OLD.strikes
    OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
    OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
    OR NEW.is_minor IS DISTINCT FROM OLD.is_minor
    OR NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at
  THEN
    RAISE EXCEPTION 'Protected profile fields may only be changed by a trusted server operation'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_moderation_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_moderation_fields() TO service_role;

DROP TRIGGER IF EXISTS protect_profile_moderation_fields_before_update ON public.profiles;
CREATE TRIGGER protect_profile_moderation_fields_before_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_moderation_fields();