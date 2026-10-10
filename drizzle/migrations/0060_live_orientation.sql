ALTER TABLE public.lives ADD COLUMN IF NOT EXISTS orientation text NOT NULL DEFAULT 'portrait';
ALTER TABLE public.lives DROP CONSTRAINT IF EXISTS lives_orientation_check;
ALTER TABLE public.lives ADD CONSTRAINT lives_orientation_check CHECK (orientation IN ('portrait','landscape','square'));
