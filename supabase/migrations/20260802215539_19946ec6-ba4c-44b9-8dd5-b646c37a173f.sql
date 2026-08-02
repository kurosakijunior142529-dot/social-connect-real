CREATE TABLE public.voice_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  topic text,
  emoji text DEFAULT '🔊',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  max_members integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_channels TO authenticated;
GRANT ALL ON public.voice_channels TO service_role;

ALTER TABLE public.voice_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_channels_select" ON public.voice_channels
  FOR SELECT TO authenticated USING (is_public OR created_by = auth.uid());
CREATE POLICY "voice_channels_insert" ON public.voice_channels
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "voice_channels_update" ON public.voice_channels
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "voice_channels_delete" ON public.voice_channels
  FOR DELETE TO authenticated USING (created_by = auth.uid());

INSERT INTO public.voice_channels (name, topic, emoji, created_by)
SELECT v.name, v.topic, v.emoji, p.id
FROM (VALUES
  ('Geral', 'Bate-papo livre da comunidade', '🎧'),
  ('Gaming', 'Voz durante as partidas', '🎮'),
  ('Música', 'Ouvindo som juntos', '🎵'),
  ('Estudos', 'Foco e silêncio produtivo', '📚')
) AS v(name, topic, emoji)
CROSS JOIN LATERAL (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) p;