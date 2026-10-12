DROP POLICY IF EXISTS "reposts_select_all" ON public.reposts;
CREATE POLICY "reposts_select_visible" ON public.reposts FOR SELECT TO authenticated
USING (auth.uid() = user_id OR NOT public.is_blocked_pair(auth.uid(), user_id));

DROP POLICY IF EXISTS "comment_likes_select" ON public.comment_likes;
CREATE POLICY "comment_likes_select_visible" ON public.comment_likes FOR SELECT TO authenticated
USING (auth.uid() = user_id OR NOT public.is_blocked_pair(auth.uid(), user_id));

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles viewable unless blocked" ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR NOT public.is_blocked_pair(auth.uid(), id));