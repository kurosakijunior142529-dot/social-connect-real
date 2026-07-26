-- Consolidate to one best row per (user_id, game)
DELETE FROM public.game_scores gs
USING public.game_scores keep
WHERE gs.user_id = keep.user_id
  AND gs.game = keep.game
  AND (keep.score > gs.score OR (keep.score = gs.score AND keep.created_at < gs.created_at))
  AND gs.id <> keep.id;

ALTER TABLE public.game_scores
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.game_scores SET updated_at = created_at WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS game_scores_user_game_key ON public.game_scores (user_id, game);
CREATE INDEX IF NOT EXISTS game_scores_game_score_idx ON public.game_scores (game, score DESC);

GRANT SELECT, INSERT, UPDATE ON public.game_scores TO authenticated;
GRANT ALL ON public.game_scores TO service_role;

CREATE OR REPLACE FUNCTION public.submit_game_score(_game TEXT, _score INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
  _best INTEGER;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _game IS NULL OR length(_game) = 0 THEN RAISE EXCEPTION 'Invalid game'; END IF;
  IF _score IS NULL OR _score < 0 THEN RAISE EXCEPTION 'Invalid score'; END IF;

  INSERT INTO public.game_scores (user_id, game, score, updated_at)
  VALUES (_me, _game, _score, now())
  ON CONFLICT (user_id, game) DO UPDATE
    SET score = GREATEST(public.game_scores.score, EXCLUDED.score),
        updated_at = CASE WHEN EXCLUDED.score > public.game_scores.score THEN now() ELSE public.game_scores.updated_at END
  RETURNING score INTO _best;

  RETURN _best;
END;
$$;
