CREATE TABLE public.music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'vibely',
  external_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT,
  cover_url TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  /* fonte do áudio realmente reproduzível: 'vibely' (gerado no app) ou 'preview' (prévia autorizada do provedor) */
  audio_source TEXT NOT NULL DEFAULT 'vibely',
  audio_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX music_tracks_provider_external_key
  ON public.music_tracks (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX music_tracks_title_idx ON public.music_tracks (lower(title));

GRANT SELECT, INSERT ON public.music_tracks TO authenticated;
GRANT SELECT ON public.music_tracks TO anon;
GRANT ALL ON public.music_tracks TO service_role;

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "music tracks readable" ON public.music_tracks
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "music tracks insert by authenticated" ON public.music_tracks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.posts ADD COLUMN music_track_id UUID REFERENCES public.music_tracks(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN music_start_ms INTEGER;
ALTER TABLE public.posts ADD COLUMN music_end_ms INTEGER;
ALTER TABLE public.posts ADD COLUMN music_volume REAL;

CREATE INDEX posts_music_track_idx ON public.posts (music_track_id, created_at DESC) WHERE music_track_id IS NOT NULL;