
-- 1) credit_coins must not be callable directly by clients
REVOKE EXECUTE ON FUNCTION public.credit_coins(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer) TO service_role;

-- 2) SECURITY DEFINER functions must not be callable by anonymous visitors
REVOKE EXECUTE ON FUNCTION public.admin_update_withdrawal(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_live(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coins_to_brl(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_vibely_pro(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_watch_host(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_watch_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_watch_room_by_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_conversation_wallpaper(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bump_ai_thread() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_watch_member_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_watch_room_insert() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_withdrawal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_live(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coins_to_brl(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_vibely_pro(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_watch_host(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_watch_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_watch_room_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_conversation_wallpaper(uuid, text, text) TO authenticated;

-- 3) Marketplace storage: scope reads to owners or files of active listings
DROP POLICY IF EXISTS "marketplace_read_all_auth" ON storage.objects;
CREATE POLICY "marketplace_read_scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'marketplace'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.listing_images li
      JOIN public.listings l ON l.id = li.listing_id
      WHERE li.storage_path = storage.objects.name
        AND l.status = 'active'
    )
  )
);
