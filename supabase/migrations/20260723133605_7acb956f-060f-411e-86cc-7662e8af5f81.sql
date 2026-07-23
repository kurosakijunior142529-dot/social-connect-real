
-- ============ TABELAS ============

CREATE TABLE IF NOT EXISTS public.lives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livekit_room text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text,
  tags text[] DEFAULT '{}'::text[],
  thumbnail_url text,
  language text DEFAULT 'pt-BR',
  age_restricted boolean NOT NULL DEFAULT false,
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','followers','friends','private','subs_only')),
  allow_guests boolean NOT NULL DEFAULT true,
  auto_record boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','live','ended')),
  started_at timestamptz,
  ended_at timestamptz,
  viewer_count int NOT NULL DEFAULT 0,
  peak_viewer_count int NOT NULL DEFAULT 0,
  like_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lives_status ON public.lives(status);
CREATE INDEX IF NOT EXISTS idx_lives_host ON public.lives(host_id);
CREATE INDEX IF NOT EXISTS idx_lives_started ON public.lives(started_at DESC);

CREATE TABLE IF NOT EXISTS public.live_moderators (
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_bans (
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  reply_to uuid REFERENCES public.live_chat_messages(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  deleted boolean NOT NULL DEFAULT false,
  is_highlighted boolean NOT NULL DEFAULT false,
  gift_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_chat_live ON public.live_chat_messages(live_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '❤️',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_reactions_live ON public.live_reactions(live_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_viewers (
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (live_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_coins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gift_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL,
  cost_coins int NOT NULL CHECK (cost_coins > 0),
  animation text DEFAULT 'default',
  tier text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','premium','epic','legendary')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.gift_catalog(id),
  coins_spent int NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_gifts_live ON public.live_gifts(live_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_gifts_recipient ON public.live_gifts(recipient_id);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON public.subscriptions(user_id);

CREATE TABLE IF NOT EXISTS public.channel_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier int NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  UNIQUE (subscriber_id, creator_id)
);

CREATE TABLE IF NOT EXISTS public.live_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  storage_path text,
  external_url text,
  duration_sec int,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lives TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_moderators TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_bans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_chat_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_viewers TO authenticated;
GRANT SELECT ON public.user_coins TO authenticated;
GRANT SELECT ON public.gift_catalog TO authenticated;
GRANT SELECT, INSERT ON public.live_gifts TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_recordings TO authenticated;
GRANT ALL ON public.lives, public.live_moderators, public.live_bans, public.live_chat_messages,
  public.live_reactions, public.live_viewers, public.user_coins, public.gift_catalog,
  public.live_gifts, public.subscriptions, public.channel_subscriptions, public.live_recordings TO service_role;

-- ============ RLS ============
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_recordings ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "Lives visible" ON public.lives FOR SELECT TO authenticated
  USING (audience IN ('public','followers','friends','subs_only') OR host_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = lives.id AND m.user_id = auth.uid()));
CREATE POLICY "Host insert lives" ON public.lives FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY "Host update lives" ON public.lives FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
CREATE POLICY "Host delete lives" ON public.lives FOR DELETE TO authenticated USING (host_id = auth.uid());

CREATE POLICY "Mods visible" ON public.live_moderators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Host add mods" ON public.live_moderators FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid()));
CREATE POLICY "Host remove mods" ON public.live_moderators FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid()));

CREATE POLICY "Bans visible" ON public.live_bans FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = live_bans.live_id AND m.user_id = auth.uid()));
CREATE POLICY "Host/mods insert bans" ON public.live_bans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = live_bans.live_id AND m.user_id = auth.uid()));
CREATE POLICY "Host/mods remove bans" ON public.live_bans FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = live_bans.live_id AND m.user_id = auth.uid()));

CREATE POLICY "Chat visible" ON public.live_chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id));
CREATE POLICY "Send chat" ON public.live_chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.live_bans b WHERE b.live_id = live_chat_messages.live_id AND b.user_id = auth.uid() AND (b.expires_at IS NULL OR b.expires_at > now())));
CREATE POLICY "Update chat" ON public.live_chat_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = live_chat_messages.live_id AND m.user_id = auth.uid())
    OR sender_id = auth.uid());
CREATE POLICY "Delete chat" ON public.live_chat_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = live_chat_messages.live_id AND m.user_id = auth.uid())
    OR sender_id = auth.uid());

CREATE POLICY "Reactions visible" ON public.live_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Send reactions" ON public.live_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Viewers visible" ON public.live_viewers FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = live_viewers.live_id AND m.user_id = auth.uid()));
CREATE POLICY "Self track viewer" ON public.live_viewers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Self update viewer" ON public.live_viewers FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Self delete viewer" ON public.live_viewers FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Own coins" ON public.user_coins FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Catalog visible" ON public.gift_catalog FOR SELECT TO authenticated USING (active = true);

CREATE POLICY "Gifts visible" ON public.live_gifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Own gifts insert" ON public.live_gifts FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Own channel subs" ON public.channel_subscriptions FOR SELECT TO authenticated
  USING (subscriber_id = auth.uid() OR creator_id = auth.uid());

CREATE POLICY "Recording visible" ON public.live_recordings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id));
CREATE POLICY "Host manages recording" ON public.live_recordings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lives l WHERE l.id = live_id AND l.host_id = auth.uid()));

CREATE TRIGGER lives_updated_at BEFORE UPDATE ON public.lives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED CATALOG ============
INSERT INTO public.gift_catalog(name, emoji, cost_coins, tier) VALUES
  ('Coração', '❤️', 1, 'basic'),
  ('Rosa', '🌹', 5, 'basic'),
  ('Estrela', '⭐', 10, 'basic'),
  ('Foguete', '🚀', 50, 'premium'),
  ('Diamante', '💎', 100, 'premium'),
  ('Coroa', '👑', 500, 'epic'),
  ('Leão', '🦁', 1000, 'epic'),
  ('Unicórnio', '🦄', 5000, 'legendary')
ON CONFLICT DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.lives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_gifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_viewers;
