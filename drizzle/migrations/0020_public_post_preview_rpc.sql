create or replace function public.public_post_preview(_id uuid)
returns table(
  id uuid,
  caption text,
  media_type text,
  post_kind text,
  created_at timestamptz,
  username text,
  display_name text,
  likes bigint,
  comments bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.caption,
         p.media_type::text,
         p.post_kind,
         p.created_at,
         pr.username,
         pr.display_name,
         (select count(*) from public.likes l where l.post_id = p.id),
         (select count(*) from public.comments c where c.post_id = p.id)
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.id = _id
    and pr.banned_at is null
  limit 1
$$;

grant execute on function public.public_post_preview(uuid) to anon, authenticated;