CREATE TABLE public.reel_audio_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_path text NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms > 0 AND duration_ms <= 11000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reel_audio_reactions_post_idx ON public.reel_audio_reactions(post_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.reel_audio_reactions TO authenticated;
GRANT ALL ON public.reel_audio_reactions TO service_role;
ALTER TABLE public.reel_audio_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audio reactions readable" ON public.reel_audio_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own audio reaction" ON public.reel_audio_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND audio_path LIKE auth.uid()::text || '/%');
CREATE POLICY "Delete own audio reaction" ON public.reel_audio_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Reel audio upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reel-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Reel audio read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reel-audio' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.reel_audio_reactions r WHERE r.audio_path = storage.objects.name)));
CREATE POLICY "Reel audio delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reel-audio' AND (storage.foldername(name))[1] = auth.uid()::text);