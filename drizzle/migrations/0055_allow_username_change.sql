CREATE OR REPLACE FUNCTION public.protect_profile_moderation_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
    OR NEW.is_creator IS DISTINCT FROM OLD.is_creator
    OR NEW.badge_variant IS DISTINCT FROM OLD.badge_variant
    OR NEW.strikes IS DISTINCT FROM OLD.strikes
    OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
    OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
    OR NEW.is_minor IS DISTINCT FROM OLD.is_minor
    OR (NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at
        AND coalesce(current_setting('vibely.username_change', true), '') <> '1')
  THEN
    RAISE EXCEPTION 'Protected profile fields may only be changed by a trusted server operation'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_username(_new_username text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  cleaned text := lower(trim(_new_username));
  last_change timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF cleaned !~ '^[a-z0-9_.]{3,20}$' THEN
    RAISE EXCEPTION 'Use 3 a 20 caracteres: letras, números, ponto ou underline';
  END IF;
  SELECT username_changed_at INTO last_change FROM public.profiles WHERE id = uid;
  IF last_change IS NOT NULL AND last_change > now() - interval '14 days' THEN
    RAISE EXCEPTION 'Você só pode alterar o @ a cada 14 dias';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = cleaned AND id <> uid) THEN
    RAISE EXCEPTION 'Este @ já está em uso';
  END IF;
  PERFORM set_config('vibely.username_change', '1', true);
  UPDATE public.profiles SET username = cleaned, username_changed_at = now(), updated_at = now() WHERE id = uid;
  PERFORM set_config('vibely.username_change', '', true);
  RETURN cleaned;
END;
$function$;