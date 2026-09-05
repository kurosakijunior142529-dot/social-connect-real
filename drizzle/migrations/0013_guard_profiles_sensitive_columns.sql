-- Impede que usuários editem colunas de moderação/confiança do próprio perfil
-- (is_verified, is_creator, badge_variant, strikes, suspended_until, banned_at).
-- Somente admins (user_roles.role='admin') ou o service_role conseguem alterá-las.

CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  is_service boolean;
BEGIN
  is_service := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  is_admin := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );

  IF is_service OR is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_verified IS TRUE
       OR NEW.is_creator IS TRUE
       OR NEW.badge_variant IS NOT NULL
       OR COALESCE(NEW.strikes, 0) <> 0
       OR NEW.suspended_until IS NOT NULL
       OR NEW.banned_at IS NOT NULL THEN
      RAISE EXCEPTION 'Você não pode definir campos de moderação do perfil.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.is_creator IS DISTINCT FROM OLD.is_creator
     OR NEW.badge_variant IS DISTINCT FROM OLD.badge_variant
     OR NEW.strikes IS DISTINCT FROM OLD.strikes
     OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN
    RAISE EXCEPTION 'Você não pode alterar campos de moderação do perfil.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_sensitive ON public.profiles;
CREATE TRIGGER guard_profiles_sensitive
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_sensitive_columns();