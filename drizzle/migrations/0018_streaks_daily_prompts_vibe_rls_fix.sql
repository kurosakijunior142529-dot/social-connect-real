-- 1) Streaks de conversa (DMs 1:1)
create table if not exists public.chat_streaks (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_a uuid not null,
  user_b uuid not null,
  a_last_day date,
  b_last_day date,
  last_both_day date,
  streak integer not null default 0,
  best integer not null default 0,
  updated_at timestamptz not null default now()
);

grant select on public.chat_streaks to authenticated;
grant all on public.chat_streaks to service_role;

alter table public.chat_streaks enable row level security;

create policy "Participants can read streak"
  on public.chat_streaks for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create or replace function public.update_chat_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv record;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  yesterday date := today - 1;
  s record;
  new_streak int;
begin
  select user_a, user_b into conv from public.conversations where id = new.conversation_id;
  if not found then
    return new;
  end if;

  insert into public.chat_streaks (conversation_id, user_a, user_b)
  values (new.conversation_id, conv.user_a, conv.user_b)
  on conflict (conversation_id) do nothing;

  if new.sender_id = conv.user_a then
    update public.chat_streaks set a_last_day = today, updated_at = now()
    where conversation_id = new.conversation_id;
  elsif new.sender_id = conv.user_b then
    update public.chat_streaks set b_last_day = today, updated_at = now()
    where conversation_id = new.conversation_id;
  end if;

  select * into s from public.chat_streaks where conversation_id = new.conversation_id;

  if s.a_last_day = today and s.b_last_day = today
     and (s.last_both_day is null or s.last_both_day < today) then
    if s.last_both_day = yesterday then
      new_streak := s.streak + 1;
    else
      new_streak := 1;
    end if;
    update public.chat_streaks
    set streak = new_streak,
        best = greatest(best, new_streak),
        last_both_day = today,
        updated_at = now()
    where conversation_id = new.conversation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_streak on public.messages;
create trigger messages_streak
  after insert on public.messages
  for each row execute function public.update_chat_streak();

create or replace function public.get_streak(_conversation uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when last_both_day is null then 0
    when last_both_day < ((now() at time zone 'America/Sao_Paulo')::date - 1) then 0
    else streak
  end
  from public.chat_streaks
  where conversation_id = _conversation
    and (auth.uid() = user_a or auth.uid() = user_b)
$$;

grant execute on function public.get_streak(uuid) to authenticated;

-- 2) Vibe diária
create table if not exists public.daily_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  active_on date not null unique,
  created_at timestamptz not null default now()
);

grant select on public.daily_prompts to authenticated;
grant all on public.daily_prompts to service_role;

alter table public.daily_prompts enable row level security;

create policy "Authenticated can read prompts"
  on public.daily_prompts for select to authenticated
  using (true);

create or replace function public.today_prompt()
returns table(id uuid, prompt text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.prompt
  from public.daily_prompts p
  where p.active_on <= (now() at time zone 'America/Sao_Paulo')::date
  order by p.active_on desc
  limit 1
$$;

grant execute on function public.today_prompt() to authenticated;

insert into public.daily_prompts (prompt, active_on) values
  ('Mostra o que você tá fazendo agora', '2026-09-06'),
  ('O som que não sai do seu repeat', '2026-09-07'),
  ('Seu almoço ou lanche de hoje', '2026-09-08'),
  ('Uma vista da sua janela', '2026-09-09'),
  ('Seu look de hoje', '2026-09-10'),
  ('Algo que te fez rir hoje', '2026-09-11'),
  ('Seu pet (ou o pet que você queria ter)', '2026-09-12'),
  ('Um lugar que você ama', '2026-09-13'),
  ('Sua bebida favorita do momento', '2026-09-14'),
  ('Um talento seu em 15 segundos', '2026-09-15'),
  ('O céu da sua cidade hoje', '2026-09-16'),
  ('Algo vintage que você tem', '2026-09-17'),
  ('Seu prato favorito', '2026-09-18'),
  ('Um antes e depois seu', '2026-09-19')
on conflict (active_on) do nothing;

-- 3) Correção de segurança: coleções de Vibes só para usuários logados, respeitando bloqueio
drop policy if exists "Collections are viewable by everyone" on public.vibe_collections;
drop policy if exists "Public read collections" on public.vibe_collections;
drop policy if exists "Anyone can view collections" on public.vibe_collections;
drop policy if exists "Anyone can view vibe collections" on public.vibe_collections;
drop policy if exists "Collections are public" on public.vibe_collections;
drop policy if exists "Items are viewable by everyone" on public.vibe_collection_items;
drop policy if exists "Public read items" on public.vibe_collection_items;
drop policy if exists "Anyone can view items" on public.vibe_collection_items;
drop policy if exists "Anyone can view collection items" on public.vibe_collection_items;
drop policy if exists "Items are public" on public.vibe_collection_items;

drop policy if exists "Authenticated can view collections" on public.vibe_collections;
create policy "Authenticated can view collections"
  on public.vibe_collections for select to authenticated
  using (
    auth.uid() = user_id
    or not public.is_blocked_pair(auth.uid(), user_id)
  );

drop policy if exists "Authenticated can view collection items" on public.vibe_collection_items;
create policy "Authenticated can view collection items"
  on public.vibe_collection_items for select to authenticated
  using (
    exists (
      select 1 from public.vibe_collections c
      where c.id = collection_id
        and (c.user_id = auth.uid() or not public.is_blocked_pair(auth.uid(), c.user_id))
    )
  );