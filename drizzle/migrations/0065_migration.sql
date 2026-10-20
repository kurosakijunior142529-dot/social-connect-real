create table public.user_notes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
grant select, insert, update, delete on public.user_notes to authenticated;
grant all on public.user_notes to service_role;
alter table public.user_notes enable row level security;
create policy "Read notes of non-blocked users" on public.user_notes for select to authenticated
  using (expires_at > now() and not public.is_blocked_pair(auth.uid(), user_id));
create policy "Own note insert" on public.user_notes for insert to authenticated with check (auth.uid() = user_id);
create policy "Own note update" on public.user_notes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own note delete" on public.user_notes for delete to authenticated using (auth.uid() = user_id);