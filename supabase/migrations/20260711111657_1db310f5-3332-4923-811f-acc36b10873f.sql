-- Fix chat creation returning rows: owners must be able to see the chat they just created
DROP POLICY IF EXISTS "Members view chat" ON public.chats;
CREATE POLICY "Members or owner view chat"
ON public.chats
FOR SELECT
TO authenticated
USING (owner_id = auth.uid() OR public.is_chat_member(id, auth.uid()));

-- Keep watch-room membership rejoin fast and reliable
CREATE INDEX IF NOT EXISTS idx_watch_room_members_room_user_active
ON public.watch_room_members (room_id, user_id)
WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watch_room_members_user_active
ON public.watch_room_members (user_id, room_id)
WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watch_room_messages_room_created
ON public.watch_room_messages (room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_watch_room_state_room_updated
ON public.watch_room_state (room_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_rooms_invite_code_active
ON public.watch_rooms (invite_code)
WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watch_rooms_host_active_created
ON public.watch_rooms (host_id, created_at DESC)
WHERE closed_at IS NULL;

-- Calls: faster ringing/update lookups for both participants
CREATE INDEX IF NOT EXISTS idx_calls_callee_status_created
ON public.calls (callee_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_caller_status_created
ON public.calls (caller_id, status, created_at DESC);

-- Chat/group/channel access and message lists
CREATE INDEX IF NOT EXISTS idx_chat_members_user_chat
ON public.chat_members (user_id, chat_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created
ON public.chat_messages (chat_id, created_at);

-- DMs/feed helpers seen in slow-query review
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_user_a_last_message
ON public.conversations (user_a, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_b_last_message
ON public.conversations (user_b, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_posts_user_post
ON public.saved_posts (user_id, post_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON public.notifications (user_id, read_at)
WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stories_expires_created
ON public.stories (expires_at, created_at);