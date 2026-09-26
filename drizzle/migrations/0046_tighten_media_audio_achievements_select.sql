DROP POLICY IF EXISTS post_media_select_all ON public.post_media;
CREATE POLICY post_media_select_visible ON public.post_media FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id AND NOT public.is_blocked_pair(auth.uid(), p.author_id)));

DROP POLICY IF EXISTS "Audio reactions readable" ON public.reel_audio_reactions;
CREATE POLICY "Audio reactions readable by post viewers" ON public.reel_audio_reactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = reel_audio_reactions.post_id
  AND NOT public.is_blocked_pair(auth.uid(), p.author_id)
  AND NOT public.is_blocked_pair(auth.uid(), reel_audio_reactions.user_id)));
CREATE POLICY "Post owner deletes audio reactions" ON public.reel_audio_reactions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = reel_audio_reactions.post_id AND p.author_id = auth.uid()));

DROP POLICY IF EXISTS "user achievements readable" ON public.user_achievements;
CREATE POLICY "user achievements readable by members" ON public.user_achievements FOR SELECT TO authenticated
USING (NOT public.is_blocked_pair(auth.uid(), user_id));