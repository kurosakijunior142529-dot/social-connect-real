-- 1) Áudio do perfil: leitura só do próprio dono ou do arquivo realmente
-- publicado no perfil (profiles.vibe_audio_path), nunca de arquivos avulsos.
DROP POLICY IF EXISTS "Profile audio readable by authenticated" ON storage.objects;

CREATE POLICY "Profile audio readable when published"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-audio'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.vibe_audio_path = storage.objects.name
    )
  )
);

-- 2) dm_privacy é preferência de conta: não deve ser legível por outros
-- usuários. As funções SECURITY DEFINER (can_message, my_profile) continuam
-- lendo normalmente.
REVOKE SELECT (dm_privacy) ON public.profiles FROM authenticated;
REVOKE SELECT (dm_privacy) ON public.profiles FROM anon;