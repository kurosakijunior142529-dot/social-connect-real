ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_check;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_check CHECK (
  (content IS NOT NULL AND length(content) BETWEEN 1 AND 500)
  OR (sticker_url IS NOT NULL AND (content IS NULL OR length(content) <= 500))
);