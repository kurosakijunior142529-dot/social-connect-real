-- Applied: discover_channels, channel_member_counts, follow_channel (security definer, authenticated only)
CREATE OR REPLACE FUNCTION public.follow_channel(_chat uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM chats WHERE id = _chat AND type = 'channel') THEN RAISE EXCEPTION 'not a channel'; END IF;
  INSERT INTO chat_members(chat_id, user_id, role) VALUES (_chat, auth.uid(), 'member') ON CONFLICT DO NOTHING;
END $$;
