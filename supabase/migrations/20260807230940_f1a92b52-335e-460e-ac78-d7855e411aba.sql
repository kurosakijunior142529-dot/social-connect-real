create or replace function public.enforce_dm_recipient_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() = old.sender_id then
    return new;
  end if;
  -- Recipient may only touch read_at; restore every other column.
  new.id := old.id;
  new.conversation_id := old.conversation_id;
  new.sender_id := old.sender_id;
  new.content := old.content;
  new.created_at := old.created_at;
  new.reply_to := old.reply_to;
  new.edited_at := old.edited_at;
  new.deleted_at := old.deleted_at;
  new.expires_at := old.expires_at;
  new.kind := old.kind;
  new.media_url := old.media_url;
  new.media_bucket := old.media_bucket;
  new.media_type := old.media_type;
  new.media_name := old.media_name;
  new.media_size := old.media_size;
  new.media_duration_ms := old.media_duration_ms;
  new.meta := old.meta;
  new.poster_url := old.poster_url;
  return new;
end;
$$;

drop trigger if exists enforce_dm_recipient_read_only on public.messages;
create trigger enforce_dm_recipient_read_only
before update on public.messages
for each row execute function public.enforce_dm_recipient_read_only();