DROP POLICY IF EXISTS "music tracks readable by signed-in users" ON public.music_tracks;
CREATE POLICY "music tracks catalog or own" ON public.music_tracks FOR SELECT TO authenticated
USING (created_by IS NULL OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users read translations" ON public.translation_cache;

DROP POLICY IF EXISTS "Reel audio read" ON storage.objects;
CREATE POLICY "Reel audio read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reel-audio' AND (storage.foldername(name))[1] = (auth.uid())::text);