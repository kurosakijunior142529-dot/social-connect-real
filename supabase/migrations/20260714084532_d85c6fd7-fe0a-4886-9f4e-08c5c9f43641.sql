CREATE TABLE public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game text NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_scores_game_score ON public.game_scores (game, score DESC, created_at DESC);
CREATE INDEX idx_game_scores_user ON public.game_scores (user_id, game);

GRANT SELECT, INSERT ON public.game_scores TO authenticated;
GRANT ALL ON public.game_scores TO service_role;

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read scores"
  ON public.game_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users insert own scores"
  ON public.game_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);