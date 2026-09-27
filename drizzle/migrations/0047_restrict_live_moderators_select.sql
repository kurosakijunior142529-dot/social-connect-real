DROP POLICY IF EXISTS "Mods visible" ON public.live_moderators;
CREATE POLICY "Mods visible to host and self" ON public.live_moderators FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_moderators.live_id AND l.host_id = auth.uid()));