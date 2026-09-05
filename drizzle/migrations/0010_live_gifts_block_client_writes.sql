-- Gifts may only be created by public.send_live_gift(), which validates the
-- catalog price and atomically debits the sender's coins. Clients get read
-- access only; INSERT/UPDATE/DELETE stay unavailable from the Data API.
REVOKE ALL ON TABLE public.live_gifts FROM anon, authenticated;
GRANT SELECT ON TABLE public.live_gifts TO authenticated;
GRANT ALL ON TABLE public.live_gifts TO service_role;

DROP POLICY IF EXISTS "No client gift inserts" ON public.live_gifts;
CREATE POLICY "No client gift inserts"
ON public.live_gifts
FOR INSERT
TO authenticated
WITH CHECK (false);