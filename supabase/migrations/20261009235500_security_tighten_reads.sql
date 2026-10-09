-- Recursos removidos (Marketplace, jogos): fecha a leitura que sobrou
DROP POLICY IF EXISTS "marketplace_read_scoped" ON storage.objects;
DROP POLICY IF EXISTS "listing_likes_select_all" ON public.listing_likes;
DROP POLICY IF EXISTS "categories_read_all" ON public.listing_categories;
DROP POLICY IF EXISTS "Anyone signed in can read scores" ON public.game_scores;
DROP POLICY IF EXISTS "pong_stats_public_read" ON public.pong_stats;

-- Músicas: cada faixa nova fica ligada a quem a cadastrou
ALTER TABLE public.music_tracks ALTER COLUMN created_by SET DEFAULT auth.uid();
DROP POLICY IF EXISTS "music tracks insert by authenticated" ON public.music_tracks;
CREATE POLICY "music tracks insert by authenticated" ON public.music_tracks
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Cache de tradução: só o servidor grava (evita traduções falsas)
DROP POLICY IF EXISTS "Authenticated users add translations" ON public.translation_cache;
REVOKE INSERT, UPDATE, DELETE ON public.translation_cache FROM authenticated, anon;

-- Conteúdo social: o app só abre com login, então visitantes sem conta não leem mais direto
DROP POLICY IF EXISTS "Posts viewable by everyone" ON public.posts;
CREATE POLICY "Posts viewable by signed-in users" ON public.posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Comments viewable by everyone" ON public.comments;
CREATE POLICY "Comments viewable by signed-in users" ON public.comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Hashtags viewable by everyone" ON public.hashtags;
CREATE POLICY "Hashtags viewable by signed-in users" ON public.hashtags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Post hashtags viewable by everyone" ON public.post_hashtags;
CREATE POLICY "Post hashtags viewable by signed-in users" ON public.post_hashtags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "hashtag edges are public" ON public.hashtag_edges;
CREATE POLICY "hashtag edges viewable by signed-in users" ON public.hashtag_edges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Polls viewable by everyone" ON public.polls;
CREATE POLICY "Polls viewable by signed-in users" ON public.polls FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "achievements readable" ON public.achievements;
CREATE POLICY "achievements readable by signed-in users" ON public.achievements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "music tracks readable" ON public.music_tracks;
CREATE POLICY "music tracks readable by signed-in users" ON public.music_tracks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Anyone reads settings" ON public.app_settings;
CREATE POLICY "Signed-in users read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
