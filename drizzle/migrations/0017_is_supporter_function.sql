create or replace function public.is_supporter(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channel_subscriptions
    where subscriber_id = _user and status = 'active'
  )
$$;

grant execute on function public.is_supporter(uuid) to authenticated, anon;