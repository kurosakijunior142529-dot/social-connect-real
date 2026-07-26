REVOKE ALL ON FUNCTION public.credit_coins(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.submit_game_score(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_game_score(text, integer) TO authenticated, service_role;