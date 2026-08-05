ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS badge_variant text,
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_badge_variant_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_badge_variant_check
  CHECK (badge_variant IS NULL OR badge_variant IN ('verified','premium','developer','partner','creator','star','founder'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.change_username(_new_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cleaned text := lower(trim(_new_username));
  last_change timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
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
  UPDATE public.profiles
     SET username = cleaned, username_changed_at = now(), updated_at = now()
   WHERE id = uid;
  RETURN cleaned;
END;
$$;

REVOKE ALL ON FUNCTION public.change_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;