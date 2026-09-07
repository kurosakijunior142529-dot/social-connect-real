DROP POLICY IF EXISTS "Anyone can view reactions" ON public.live_reactions;
DROP POLICY IF EXISTS "live_reactions_select" ON public.live_reactions;
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON public.live_reactions;

CREATE POLICY "live_reactions_select_visible"
ON public.live_reactions
FOR SELECT
TO authenticated
USING (public.can_view_live(live_id, auth.uid()));