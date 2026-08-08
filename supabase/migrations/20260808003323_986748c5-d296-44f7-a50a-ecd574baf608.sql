ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS comments_post_id_created_idx ON public.comments(post_id, created_at);

DROP POLICY IF EXISTS "Users update own comments" ON public.comments;
CREATE POLICY "Users update own comments"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Post owner deletes comments" ON public.comments;
CREATE POLICY "Post owner deletes comments"
  ON public.comments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id AND p.author_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_comment_reparent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.post_id <> OLD.post_id OR NEW.author_id <> OLD.author_id THEN
    RAISE EXCEPTION 'post_id and author_id are immutable';
  END IF;
  NEW.parent_id := OLD.parent_id;
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_comment_reparent ON public.comments;
CREATE TRIGGER trg_prevent_comment_reparent
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_comment_reparent();
