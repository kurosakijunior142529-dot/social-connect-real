-- Cache compartilhado de traduções (evita cobrar duas vezes pela mesma frase)
CREATE TABLE public.translation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash text NOT NULL,
  target_lang text NOT NULL,
  source_text text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_hash, target_lang)
);
GRANT SELECT, INSERT ON public.translation_cache TO authenticated;
GRANT ALL ON public.translation_cache TO service_role;
ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read translations"
  ON public.translation_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users add translations"
  ON public.translation_cache FOR INSERT TO authenticated WITH CHECK (true);

-- Eventos agendados no Streaming Amigo
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
CREATE INDEX IF NOT EXISTS watch_rooms_scheduled_at_idx ON public.watch_rooms (scheduled_at) WHERE scheduled_at IS NOT NULL AND closed_at IS NULL;

-- Salas agendadas futuras aparecem na listagem pública mesmo sem atividade recente
CREATE OR REPLACE FUNCTION public.list_public_watch_rooms(_limit integer DEFAULT 24)
RETURNS SETOF public.watch_rooms
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT r.*
  FROM public.watch_rooms r
  WHERE r.closed_at IS NULL
    AND r.visibility = 'public'
    AND (
      r.scheduled_at > now() - interval '1 hour'
      OR (
        r.created_at > now() - interval '24 hours'
        AND (
          EXISTS (
            SELECT 1 FROM public.watch_room_members m
            WHERE m.room_id = r.id AND m.left_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM public.watch_room_state s
            WHERE s.room_id = r.id AND s.updated_at > now() - interval '30 minutes'
          )
          OR EXISTS (
            SELECT 1 FROM public.watch_room_messages msg
            WHERE msg.room_id = r.id AND msg.created_at > now() - interval '30 minutes'
          )
        )
      )
    )
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$fn$;