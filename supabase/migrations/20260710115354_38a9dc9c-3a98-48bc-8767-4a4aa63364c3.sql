
CREATE POLICY "marketplace_read_all_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketplace');
CREATE POLICY "marketplace_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "marketplace_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "marketplace_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);
