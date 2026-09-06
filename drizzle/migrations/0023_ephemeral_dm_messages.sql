create or replace function public.view_ephemeral_message(_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  _m public.messages%rowtype;
  _exp timestamptz;
begin
  select * into _m from public.messages where id = _id;
  if _m.id is null then
    raise exception 'not found';
  end if;
  if _m.sender_id = auth.uid() then
    return _m.expires_at;
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = _m.conversation_id
      and auth.uid() in (c.user_a, c.user_b)
  ) then
    raise exception 'forbidden';
  end if;
  if (_m.meta->>'viewed_at') is not null then
    return _m.expires_at;
  end if;
  _exp := now() + interval '12 seconds';
  update public.messages
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('viewed_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SSZ')),
         expires_at = _exp
   where id = _id;
  return _exp;
end;
$$;

create or replace function public.report_ephemeral_capture(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _m public.messages%rowtype;
begin
  select * into _m from public.messages where id = _id;
  if _m.id is null then return; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = _m.conversation_id
      and auth.uid() in (c.user_a, c.user_b)
  ) then return; end if;
  if _m.sender_id = auth.uid() then return; end if;
  perform public.notify_user(_m.sender_id, auth.uid(), 'screenshot', 'message', _m.id, '{}'::jsonb);
end;
$$;

grant execute on function public.view_ephemeral_message(uuid) to authenticated;
grant execute on function public.report_ephemeral_capture(uuid) to authenticated;