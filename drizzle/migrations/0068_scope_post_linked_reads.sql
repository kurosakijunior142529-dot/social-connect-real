DROP POLICY IF EXISTS "Polls viewable by signed-in users" ON public.polls;
CREATE POLICY "Polls viewable with their post" ON public.polls FOR SELECT TO authenticated
USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.posts p WHERE p.poll_id = polls.id));

DROP POLICY IF EXISTS "Post hashtags viewable by signed-in users" ON public.post_hashtags;
CREATE POLICY "Post hashtags viewable with their post" ON public.post_hashtags FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_hashtags.post_id));

DROP POLICY IF EXISTS "Read post topics" ON public.post_topics;
CREATE POLICY "Post topics viewable with their post" ON public.post_topics FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_topics.post_id));