CREATE OR REPLACE FUNCTION public.set_conversation_wallpaper(_conversation uuid, _type text, _value text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me UUID := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _type IS NULL OR _type !~ '^[a-z0-9-]{1,32}$' THEN RAISE EXCEPTION 'Invalid wallpaper'; END IF;
  IF _type = 'custom' AND (_value IS NULL OR length(_value) = 0) THEN
    RAISE EXCEPTION 'Custom wallpaper requires a value';
  END IF;
  UPDATE public.conversations
  SET wallpaper_type = _type,
      wallpaper_value = CASE WHEN _type = 'custom' THEN _value ELSE NULL END
  WHERE id = _conversation AND (user_a = _me OR user_b = _me);
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
END;
$function$;