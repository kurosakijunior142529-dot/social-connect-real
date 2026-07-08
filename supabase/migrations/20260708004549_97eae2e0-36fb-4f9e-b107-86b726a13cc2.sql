-- Trigger-only functions: strip EXECUTE from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_chat() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chats_after_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_chat_invite_accepted() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_chat_invite_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_chat_message_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_comment_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_follow_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_like_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_message_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_story_reaction_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_story_view_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_chat_message_reparent() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_dm_reparent() FROM anon, authenticated;