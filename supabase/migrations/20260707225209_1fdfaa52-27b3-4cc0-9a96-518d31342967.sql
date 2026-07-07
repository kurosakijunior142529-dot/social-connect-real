
CREATE POLICY "auth read stories bucket" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stories');
CREATE POLICY "auth upload own stories" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth delete own stories" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth read chats bucket" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chats');
CREATE POLICY "auth upload chats" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chats' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth read covers" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'covers');
CREATE POLICY "auth upload own cover" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth update own cover" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth delete own cover" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text);
