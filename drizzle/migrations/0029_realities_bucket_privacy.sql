DROP POLICY IF EXISTS "realities read authenticated" ON storage.objects;

CREATE POLICY "realities read visible"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'realities'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.realities r
      WHERE (r.generated_image = storage.objects.name OR r.original_image = storage.objects.name)
        AND public.can_view_reality(r.id)
    )
  )
);