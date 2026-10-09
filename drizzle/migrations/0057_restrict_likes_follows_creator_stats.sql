DROP POLICY IF EXISTS "Likes viewable by everyone" ON public.likes;
CREATE POLICY "Likes viewable by signed-in users" ON public.likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Follows viewable by everyone" ON public.follows;
CREATE POLICY "Follows viewable by signed-in users" ON public.follows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "creator_stats_public_read" ON public.creator_stats;
CREATE POLICY "creator_stats_own_read" ON public.creator_stats FOR SELECT TO authenticated USING (auth.uid() = user_id);