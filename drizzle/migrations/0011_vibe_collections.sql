CREATE TABLE public.vibe_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  accent text NOT NULL DEFAULT '#22E06A',
  cover_bucket text NOT NULL DEFAULT 'stories',
  cover_path text,
  is_pinned boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vibe_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.vibe_collections(id) ON DELETE CASCADE,
  story_id uuid,
  bucket text NOT NULL DEFAULT 'stories',
  media_path text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vibe_collections_user_idx ON public.vibe_collections (user_id, is_pinned DESC, position, created_at);
CREATE INDEX vibe_collection_items_col_idx ON public.vibe_collection_items (collection_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vibe_collections TO authenticated;
GRANT SELECT ON public.vibe_collections TO anon;
GRANT ALL ON public.vibe_collections TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vibe_collection_items TO authenticated;
GRANT SELECT ON public.vibe_collection_items TO anon;
GRANT ALL ON public.vibe_collection_items TO service_role;

ALTER TABLE public.vibe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vibe_collections_public_read" ON public.vibe_collections FOR SELECT USING (true);
CREATE POLICY "vibe_collections_owner_insert" ON public.vibe_collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vibe_collections_owner_update" ON public.vibe_collections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vibe_collections_owner_delete" ON public.vibe_collections FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "vibe_items_public_read" ON public.vibe_collection_items FOR SELECT USING (true);
CREATE POLICY "vibe_items_owner_insert" ON public.vibe_collection_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.vibe_collections c WHERE c.id = collection_id AND c.user_id = auth.uid()));
CREATE POLICY "vibe_items_owner_update" ON public.vibe_collection_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vibe_collections c WHERE c.id = collection_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vibe_collections c WHERE c.id = collection_id AND c.user_id = auth.uid()));
CREATE POLICY "vibe_items_owner_delete" ON public.vibe_collection_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vibe_collections c WHERE c.id = collection_id AND c.user_id = auth.uid()));

CREATE TRIGGER vibe_collections_updated_at BEFORE UPDATE ON public.vibe_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
