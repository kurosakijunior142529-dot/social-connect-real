DROP POLICY IF EXISTS "post_topics_public_read" ON public.post_topics;
DROP POLICY IF EXISTS "vir_baselines_read" ON public.vir_baselines;
DROP POLICY IF EXISTS "post_metrics_public_read" ON public.post_metrics;
CREATE POLICY "post_metrics_author_read" ON public.post_metrics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_metrics.post_id AND p.author_id = auth.uid()));
DROP POLICY IF EXISTS "Authenticated can read prompts" ON public.daily_prompts;