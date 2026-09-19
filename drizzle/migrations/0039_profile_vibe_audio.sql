ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vibe_audio_path text;

CREATE POLICY "Profile audio readable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'profile-audio');

CREATE POLICY "Users upload own profile audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own profile audio"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own profile audio"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-audio' AND (storage.foldername(name))[1] = auth.uid()::text);