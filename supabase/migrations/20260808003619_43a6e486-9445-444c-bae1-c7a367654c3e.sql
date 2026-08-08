DROP POLICY IF EXISTS "Stickers read own" ON storage.objects;
CREATE POLICY "Stickers read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stickers');

DROP POLICY IF EXISTS "Stickers insert own" ON storage.objects;
CREATE POLICY "Stickers insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Stickers delete own" ON storage.objects;
CREATE POLICY "Stickers delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);
