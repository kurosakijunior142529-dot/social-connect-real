CREATE POLICY "realities read authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'realities');

CREATE POLICY "realities insert own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'realities' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "realities update own folder"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'realities' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "realities delete own folder"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'realities' AND (storage.foldername(name))[1] = auth.uid()::text);