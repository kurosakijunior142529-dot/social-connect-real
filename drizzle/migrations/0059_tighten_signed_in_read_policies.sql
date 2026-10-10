DROP POLICY IF EXISTS "Posts viewable by signed-in users" ON public.posts;
CREATE POLICY "Posts viewable by signed-in users" ON public.posts FOR SELECT TO authenticated
  USING (auth.uid() = author_id OR NOT public.is_blocked_pair(auth.uid(), author_id));
DROP POLICY IF EXISTS "Comments viewable by signed-in users" ON public.comments;
CREATE POLICY "Comments viewable by signed-in users" ON public.comments FOR SELECT TO authenticated
  USING (auth.uid() = author_id OR NOT public.is_blocked_pair(auth.uid(), author_id));
DROP POLICY IF EXISTS "Likes viewable by signed-in users" ON public.likes;
CREATE POLICY "Likes viewable by signed-in users" ON public.likes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR NOT public.is_blocked_pair(auth.uid(), user_id));
DROP POLICY IF EXISTS "Follows viewable by signed-in users" ON public.follows;
CREATE POLICY "Follows viewable by signed-in users" ON public.follows FOR SELECT TO authenticated
  USING (auth.uid() IN (follower_id, following_id) OR (NOT public.is_blocked_pair(auth.uid(), follower_id) AND NOT public.is_blocked_pair(auth.uid(), following_id)));
DROP POLICY IF EXISTS "Post hashtags viewable by signed-in users" ON public.post_hashtags;
CREATE POLICY "Post hashtags viewable by signed-in users" ON public.post_hashtags FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "hashtag edges viewable by signed-in users" ON public.hashtag_edges;
CREATE POLICY "hashtag edges viewable by signed-in users" ON public.hashtag_edges FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Hashtags viewable by signed-in users" ON public.hashtags;
CREATE POLICY "Hashtags viewable by signed-in users" ON public.hashtags FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "music tracks readable by signed-in users" ON public.music_tracks;
CREATE POLICY "music tracks readable by signed-in users" ON public.music_tracks FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "achievements readable by signed-in users" ON public.achievements;
CREATE POLICY "achievements readable by signed-in users" ON public.achievements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users read translations" ON public.translation_cache;
CREATE POLICY "Authenticated users read translations" ON public.translation_cache FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Polls viewable by signed-in users" ON public.polls;
CREATE POLICY "Polls viewable by signed-in users" ON public.polls FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Signed-in users read settings" ON public.app_settings;
CREATE POLICY "Signed-in users read settings" ON public.app_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);