
-- ============ STREAMING AMIGO: entrar por código ============
CREATE OR REPLACE FUNCTION public.join_watch_room_by_code(_code TEXT)
RETURNS TABLE(room_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
  _room UUID;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _code IS NULL OR length(trim(_code)) = 0 THEN RAISE EXCEPTION 'Invalid code'; END IF;

  SELECT id INTO _room FROM public.watch_rooms
   WHERE invite_code = trim(_code) AND closed_at IS NULL
   LIMIT 1;

  IF _room IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  INSERT INTO public.watch_room_members(room_id, user_id, left_at)
  VALUES (_room, _me, NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL;

  room_id := _room;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_watch_room_by_code(TEXT) TO authenticated;

-- ============ MEDIA POSTER / THUMBNAILS ============
ALTER TABLE public.messages       ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE public.chat_messages  ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE public.posts          ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- ============ MARKETPLACE ============
CREATE TABLE IF NOT EXISTS public.listing_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.listing_categories TO authenticated, anon;
GRANT ALL ON public.listing_categories TO service_role;
ALTER TABLE public.listing_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read_all" ON public.listing_categories FOR SELECT USING (true);

INSERT INTO public.listing_categories(id, label, emoji, position) VALUES
  ('electronics', 'Eletrônicos', '📱', 1),
  ('fashion',     'Moda',        '👕', 2),
  ('home',        'Casa',        '🏠', 3),
  ('vehicles',    'Veículos',    '🚗', 4),
  ('sports',      'Esportes',    '⚽', 5),
  ('services',    'Serviços',    '🛠️', 6),
  ('other',       'Outros',      '✨', 7)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  category_id TEXT REFERENCES public.listing_categories(id),
  condition TEXT NOT NULL DEFAULT 'used',
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_select_active_or_own" ON public.listings FOR SELECT TO authenticated
  USING (status = 'active' OR seller_id = auth.uid());
CREATE POLICY "listings_insert_own" ON public.listings FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());
CREATE POLICY "listings_update_own" ON public.listings FOR UPDATE TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());
CREATE POLICY "listings_delete_own" ON public.listings FOR DELETE TO authenticated
  USING (seller_id = auth.uid());
CREATE INDEX IF NOT EXISTS listings_status_created_idx ON public.listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_seller_idx ON public.listings(seller_id);
CREATE INDEX IF NOT EXISTS listings_category_idx ON public.listings(category_id);
CREATE TRIGGER listings_updated BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.listing_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_images TO authenticated;
GRANT ALL ON public.listing_images TO service_role;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_images_select_visible" ON public.listing_images FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND (l.status = 'active' OR l.seller_id = auth.uid())));
CREATE POLICY "listing_images_write_own" ON public.listing_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()));
CREATE INDEX IF NOT EXISTS listing_images_listing_idx ON public.listing_images(listing_id, position);

CREATE TABLE IF NOT EXISTS public.listing_likes (
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.listing_likes TO authenticated;
GRANT ALL ON public.listing_likes TO service_role;
ALTER TABLE public.listing_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_likes_select_all" ON public.listing_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "listing_likes_write_self" ON public.listing_likes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.listing_saves (
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.listing_saves TO authenticated;
GRANT ALL ON public.listing_saves TO service_role;
ALTER TABLE public.listing_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_saves_select_own" ON public.listing_saves FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "listing_saves_write_self" ON public.listing_saves FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
