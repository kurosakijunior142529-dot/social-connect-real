CREATE POLICY "Read daily prompts" ON public.daily_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read listing categories" ON public.listing_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read post topics" ON public.post_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage vir config" ON public.vir_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage vir baselines" ON public.vir_baselines FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read private config" ON public.app_private_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));