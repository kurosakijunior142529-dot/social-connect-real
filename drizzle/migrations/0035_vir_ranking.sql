-- VIR — Vibely Intelligence Ranking (camada aditiva de recomendação)

create table if not exists public.vir_config (
  key text primary key,
  value jsonb not null,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
grant all on public.vir_config to service_role;
alter table public.vir_config enable row level security;

insert into public.vir_config (key, value, note) values
  ('weights', jsonb_build_object(
      'relevance', 1.00, 'quality', 0.90, 'freshness', 0.45, 'affinity', 0.55,
      'trending', 0.30, 'discovery', 0.35, 'trust', 0.60, 'negative', 1.20
   ), 'Pesos do VIR Score'),
  ('exploration', jsonb_build_object('ratio', 0.15, 'min_ratio', 0.08, 'max_ratio', 0.30, 'new_creator_days', 30), 'Exploracao vs relevancia'),
  ('diversity', jsonb_build_object('author_decay', 0.45, 'topic_decay', 0.30, 'max_per_author', 3), 'Reranking de diversidade'),
  ('stages', jsonb_build_object('targets', jsonb_build_array(150, 600, 3000, 15000, 80000),
      'promote_threshold', 0.42, 'pause_threshold', 0.18, 'second_chance_max', 2, 'second_chance_after_hours', 18), 'Distribuicao progressiva'),
  ('safety', jsonb_build_object('min_trust', 0.25, 'suspect_trust', 0.55, 'young_account_hours', 48, 'max_events_per_min', 90), 'Trust & Safety')
on conflict (key) do nothing;

create table if not exists public.vir_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  author_id uuid,
  event text not null,
  value numeric not null default 0,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists vir_events_user_idx on public.vir_events (user_id, created_at desc);
create index if not exists vir_events_post_idx on public.vir_events (post_id, event, created_at desc);
grant select on public.vir_events to authenticated;
grant all on public.vir_events to service_role;
alter table public.vir_events enable row level security;
drop policy if exists "vir_events_own_read" on public.vir_events;
create policy "vir_events_own_read" on public.vir_events for select to authenticated using (auth.uid() = user_id);

create table if not exists public.post_metrics (
  post_id uuid primary key references public.posts(id) on delete cascade,
  author_id uuid,
  impressions integer not null default 0,
  starts integer not null default 0,
  watch_ms bigint not null default 0,
  reached_50 integer not null default 0,
  completes integer not null default 0,
  replays integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  follows_gained integer not null default 0,
  profile_visits integer not null default 0,
  skips integer not null default 0,
  negatives integer not null default 0,
  quality numeric not null default 0,
  confidence numeric not null default 0,
  stage smallint not null default 0,
  second_chance_count smallint not null default 0,
  last_stage_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists post_metrics_stage_idx on public.post_metrics (stage, quality desc);
create index if not exists post_metrics_author_idx on public.post_metrics (author_id);
grant select on public.post_metrics to authenticated;
grant all on public.post_metrics to service_role;
alter table public.post_metrics enable row level security;
drop policy if exists "post_metrics_public_read" on public.post_metrics;
create policy "post_metrics_public_read" on public.post_metrics for select to authenticated using (true);

create table if not exists public.creator_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  followers integer not null default 0,
  posts_count integer not null default 0,
  avg_quality numeric not null default 0,
  trust numeric not null default 0.7,
  suspicion numeric not null default 0,
  first_post_at timestamptz,
  updated_at timestamptz not null default now()
);
grant select on public.creator_stats to authenticated;
grant all on public.creator_stats to service_role;
alter table public.creator_stats enable row level security;
drop policy if exists "creator_stats_public_read" on public.creator_stats;
create policy "creator_stats_public_read" on public.creator_stats for select to authenticated using (true);

create table if not exists public.vir_user_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  long_weight numeric not null default 0,
  short_weight numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);
create index if not exists vir_user_topics_idx on public.vir_user_topics (user_id, long_weight desc);
grant select on public.vir_user_topics to authenticated;
grant all on public.vir_user_topics to service_role;
alter table public.vir_user_topics enable row level security;
drop policy if exists "vir_user_topics_own" on public.vir_user_topics;
create policy "vir_user_topics_own" on public.vir_user_topics for select to authenticated using (auth.uid() = user_id);

create table if not exists public.post_topics (
  post_id uuid not null references public.posts(id) on delete cascade,
  topic text not null,
  weight numeric not null default 1,
  source text not null default 'hashtag',
  primary key (post_id, topic)
);
create index if not exists post_topics_topic_idx on public.post_topics (topic);
grant select on public.post_topics to authenticated;
grant all on public.post_topics to service_role;
alter table public.post_topics enable row level security;
drop policy if exists "post_topics_public_read" on public.post_topics;
create policy "post_topics_public_read" on public.post_topics for select to authenticated using (true);

create table if not exists public.vir_baselines (
  kind text primary key,
  avg_completion numeric not null default 0,
  avg_engagement numeric not null default 0,
  samples integer not null default 0,
  updated_at timestamptz not null default now()
);
grant select on public.vir_baselines to authenticated;
grant all on public.vir_baselines to service_role;
alter table public.vir_baselines enable row level security;
drop policy if exists "vir_baselines_read" on public.vir_baselines;
create policy "vir_baselines_read" on public.vir_baselines for select to authenticated using (true);

create or replace function public.vir_cfg(_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.vir_config where key = _key
$$;

create or replace function public.vir_wilson(_pos numeric, _n numeric)
returns numeric language sql immutable as $$
  select case when _n <= 0 then 0 else
    greatest(0, least(1,
      ((_pos + 1.9208) / _n - 1.96 * sqrt(((_pos * (_n - _pos)) / _n + 0.9604) / _n) / _n)
      / (1 + 3.8416 / _n)))
  end
$$;

create or replace function public.vir_variant(_user uuid)
returns text language sql immutable as $$
  select case when (abs(hashtext(_user::text)) % 100) < 50 then 'A' else 'B' end
$$;

create or replace function public.vir_touch_topics(_user uuid, _post_id uuid, _event text)
returns void language plpgsql security definer set search_path = public as $$
declare
  delta numeric := case _event
    when 'video_complete' then 1.0 when 'replay' then 1.2 when 'share' then 1.4
    when 'save' then 1.3 when 'follow' then 1.5 when 'like' then 0.8
    when 'comment' then 1.0 when 'profile_visit' then 0.6 when 'watch_75' then 0.5
    when 'watch_50' then 0.25 when 'skip' then -0.5 when 'not_interested' then -2.5
    when 'hide' then -2.0 when 'report' then -3.0 else 0 end;
begin
  if delta = 0 or _post_id is null then return; end if;
  insert into public.vir_user_topics (user_id, topic, long_weight, short_weight, updated_at)
  select _user, t.topic, delta * t.weight * 0.35, delta * t.weight, now()
    from public.post_topics t where t.post_id = _post_id
  on conflict (user_id, topic) do update set
    long_weight = least(50, greatest(-20, public.vir_user_topics.long_weight + excluded.long_weight)),
    short_weight = least(50, greatest(-20, public.vir_user_topics.short_weight + excluded.short_weight)),
    updated_at = now();
end;
$$;

create or replace function public.vir_log_event(_post_id uuid, _event text, _value numeric default 0, _source text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a_id uuid;
  recent integer;
  safety jsonb := public.vir_cfg('safety');
begin
  if uid is null then return; end if;
  if _event not in ('impression','video_start','watch_25','watch_50','watch_75','video_complete',
                    'replay','like','unlike','comment','share','save','unsave','follow','unfollow',
                    'profile_visit','search','skip','not_interested','report','hide') then
    return;
  end if;
  select count(*) into recent from public.vir_events
   where user_id = uid and created_at > now() - interval '1 minute';
  if recent > coalesce((safety->>'max_events_per_min')::int, 90) then return; end if;

  select author_id into a_id from public.posts where id = _post_id;
  insert into public.vir_events (user_id, post_id, author_id, event, value, source)
  values (uid, _post_id, a_id, _event, coalesce(_value, 0), _source);
  if _post_id is null then return; end if;

  insert into public.post_metrics (post_id, author_id) values (_post_id, a_id)
  on conflict (post_id) do nothing;

  update public.post_metrics m set
    impressions = m.impressions + (_event = 'impression')::int,
    starts = m.starts + (_event = 'video_start')::int,
    reached_50 = m.reached_50 + (_event = 'watch_50')::int,
    completes = m.completes + (_event = 'video_complete')::int,
    replays = m.replays + (_event = 'replay')::int,
    likes = m.likes + (_event = 'like')::int - (_event = 'unlike')::int,
    comments = m.comments + (_event = 'comment')::int,
    shares = m.shares + (_event = 'share')::int,
    saves = m.saves + (_event = 'save')::int - (_event = 'unsave')::int,
    follows_gained = m.follows_gained + (_event = 'follow')::int,
    profile_visits = m.profile_visits + (_event = 'profile_visit')::int,
    skips = m.skips + (_event = 'skip')::int,
    negatives = m.negatives + (_event in ('not_interested','report','hide'))::int,
    watch_ms = m.watch_ms + case when _event in ('video_complete','watch_75','watch_50','watch_25','skip')
                                 then greatest(0, coalesce(_value,0))::bigint else 0 end,
    updated_at = now()
  where m.post_id = _post_id;

  perform public.vir_touch_topics(uid, _post_id, _event);
end;
$$;

create or replace function public.vir_not_interested(_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.vir_log_event(_post_id, 'not_interested', 0, 'feed');
  insert into public.hidden_posts (user_id, post_id) values (auth.uid(), _post_id)
  on conflict do nothing;
end;
$$;

create or replace function public.vir_index_post_topics(_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cap text;
begin
  select caption into cap from public.posts where id = _post_id;
  insert into public.post_topics (post_id, topic, weight, source)
  select ph.post_id, h.tag, 1.0, 'hashtag'
    from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id
   where ph.post_id = _post_id
  on conflict (post_id, topic) do update set weight = greatest(public.post_topics.weight, excluded.weight);

  if cap is not null then
    insert into public.post_topics (post_id, topic, weight, source)
    select _post_id, w, 0.5, 'caption' from (
      select distinct public.normalize_search(t) as w
        from unnest(regexp_split_to_array(lower(cap), '[^a-z0-9à-ÿ]+')) as t
       where length(t) >= 4
       limit 8
    ) s
    where w is not null and length(w) >= 4
    on conflict (post_id, topic) do nothing;
  end if;
end;
$$;

create or replace function public.vir_posts_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.post_metrics (post_id, author_id) values (new.id, new.author_id)
  on conflict (post_id) do nothing;
  perform public.vir_index_post_topics(new.id);
  return new;
end;
$$;
drop trigger if exists vir_posts_after_insert on public.posts;
create trigger vir_posts_after_insert after insert on public.posts
for each row execute function public.vir_posts_after_insert();

create or replace function public.vir_post_hashtags_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.vir_index_post_topics(new.post_id);
  return new;
end;
$$;
drop trigger if exists vir_post_hashtags_after_insert on public.post_hashtags;
create trigger vir_post_hashtags_after_insert after insert on public.post_hashtags
for each row execute function public.vir_post_hashtags_after_insert();

create or replace function public.vir_recompute()
returns void language plpgsql security definer set search_path = public as $$
declare
  stages jsonb := public.vir_cfg('stages');
  safety jsonb := public.vir_cfg('safety');
  targets jsonb := coalesce(stages->'targets', '[150,600,3000,15000,80000]'::jsonb);
begin
  insert into public.vir_baselines (kind, avg_completion, avg_engagement, samples, updated_at)
  select coalesce(p.post_kind, 'post'),
         avg(case when m.starts > 0 then m.completes::numeric / m.starts else 0 end),
         avg(case when m.impressions > 0 then (m.likes + m.comments + m.shares + m.saves)::numeric / m.impressions else 0 end),
         count(*), now()
    from public.post_metrics m join public.posts p on p.id = m.post_id
   where m.impressions >= 20 group by 1
  on conflict (kind) do update set
    avg_completion = excluded.avg_completion, avg_engagement = excluded.avg_engagement,
    samples = excluded.samples, updated_at = now();

  update public.post_metrics m set
    quality = least(1, greatest(0,
        0.45 * public.vir_wilson(m.completes, greatest(m.starts, 1))
      + 0.20 * public.vir_wilson(m.reached_50, greatest(m.starts, 1))
      + 0.20 * public.vir_wilson(m.likes + m.comments + 2 * m.shares + 2 * m.saves + 3 * m.follows_gained, greatest(m.impressions, 1))
      + 0.15 * least(1, m.replays::numeric / greatest(m.starts, 1))
      - 0.35 * least(1, m.negatives::numeric / greatest(m.impressions, 1) * 10))),
    confidence = least(1, m.impressions::numeric / 400),
    updated_at = now();

  update public.post_metrics m set
    stage = case
      when m.quality >= coalesce((stages->>'promote_threshold')::numeric, 0.42) then m.stage + 1
      when m.quality < coalesce((stages->>'pause_threshold')::numeric, 0.18) then -1::smallint
      else m.stage end,
    last_stage_at = now()
  where m.stage >= 0
    and m.impressions >= coalesce((targets->>least(m.stage, jsonb_array_length(targets) - 1))::int, 150);

  update public.post_metrics m set
    stage = 0, second_chance_count = m.second_chance_count + 1, last_stage_at = now()
  where m.stage = -1
    and m.second_chance_count < coalesce((stages->>'second_chance_max')::int, 2)
    and m.last_stage_at < now() - make_interval(hours => coalesce((stages->>'second_chance_after_hours')::int, 18))
    and (m.shares + m.saves + m.follows_gained) >= 2;

  insert into public.creator_stats (user_id, followers, posts_count, avg_quality, first_post_at, updated_at)
  select p.author_id,
         (select count(*) from public.follows f where f.following_id = p.author_id),
         count(*), coalesce(avg(m.quality), 0), min(p.created_at), now()
    from public.posts p left join public.post_metrics m on m.post_id = p.id
   group by p.author_id
  on conflict (user_id) do update set
    followers = excluded.followers, posts_count = excluded.posts_count,
    avg_quality = excluded.avg_quality, first_post_at = excluded.first_post_at, updated_at = now();

  update public.creator_stats c set
    suspicion = least(1, coalesce(s.ratio, 0)),
    trust = greatest(0, least(1, 0.55 + 0.45 * c.avg_quality - coalesce(s.ratio, 0))),
    updated_at = now()
  from (
    select e.author_id,
           avg(case when u.created_at > now() - make_interval(hours => coalesce((safety->>'young_account_hours')::int, 48)) then 1 else 0 end) as ratio
      from public.vir_events e join auth.users u on u.id = e.user_id
     where e.event in ('like','comment','share','follow') and e.created_at > now() - interval '7 days'
     group by e.author_id having count(*) >= 10
  ) s
  where c.user_id = s.author_id;
end;
$$;

create or replace function public.vir_feed(_limit int default 12, _offset int default 0, _kind text default 'reel')
returns table (post_id uuid, author_id uuid, score numeric, reason text, source text)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w jsonb := public.vir_cfg('weights');
  expl jsonb := public.vir_cfg('exploration');
  div jsonb := public.vir_cfg('diversity');
  safety jsonb := public.vir_cfg('safety');
  ratio numeric := coalesce((public.vir_cfg('exploration')->>'ratio')::numeric, 0.15);
begin
  if uid is null then return; end if;
  return query
  with me_topics as (
    select t.topic, t.long_weight, t.short_weight from public.vir_user_topics t where t.user_id = uid
  ),
  following as (select f.following_id as id from public.follows f where f.follower_id = uid),
  seen as (
    select v.post_id from public.post_views v where v.user_id = uid and v.viewed_at > now() - interval '14 days'
    union
    select e.post_id from public.vir_events e
     where e.user_id = uid and e.post_id is not null
       and e.event in ('impression','skip','not_interested','hide')
       and e.created_at > now() - interval '7 days'
  ),
  base as (
    select p.id, p.author_id, p.created_at,
           coalesce(m.quality, 0) as quality,
           coalesce(m.stage, 0) as stage,
           coalesce(m.second_chance_count, 0) as second_chance,
           coalesce(cs.trust, 0.7) as trust,
           coalesce(cs.followers, 0) as followers,
           coalesce(cs.first_post_at, p.created_at) as creator_since
      from public.posts p
      left join public.post_metrics m on m.post_id = p.id
      left join public.creator_stats cs on cs.user_id = p.author_id
     where p.created_at > now() - interval '120 days'
       and (_kind is null or _kind = 'all' or p.post_kind = _kind)
       and p.author_id <> uid
       and not exists (select 1 from public.hidden_posts h where h.user_id = uid and h.post_id = p.id)
       and not exists (select 1 from seen s where s.post_id = p.id)
       and not public.is_blocked_pair(uid, p.author_id)
       and coalesce(cs.trust, 0.7) >= coalesce((safety->>'min_trust')::numeric, 0.25)
  ),
  scored as (
    select b.id, b.author_id, b.created_at, b.quality, b.stage, b.trust, b.followers, b.creator_since,
      coalesce((select sum(least(3, greatest(-3, (t.long_weight * 0.6 + t.short_weight * 0.4) / 6)) * pt.weight)
                  from public.post_topics pt join me_topics t on t.topic = pt.topic
                 where pt.post_id = b.id), 0) as relevance,
      exists (select 1 from following f where f.id = b.author_id) as follows_author,
      exp(-extract(epoch from (now() - b.created_at)) / 172800.0) as freshness,
      (b.creator_since > now() - make_interval(days => coalesce((expl->>'new_creator_days')::int, 30)) or b.followers < 200) as is_new_creator,
      b.second_chance > 0 as is_second_chance
    from base b
  ),
  ranked as (
    select s.id, s.author_id, s.created_at,
      (coalesce((w->>'relevance')::numeric, 1) * least(3, s.relevance)
       + coalesce((w->>'quality')::numeric, 0.9) * s.quality * (0.4 + 0.6 * least(1, s.stage + 1))
       + coalesce((w->>'freshness')::numeric, 0.45) * s.freshness
       + coalesce((w->>'affinity')::numeric, 0.55) * (case when s.follows_author then 1 else 0 end)
       + coalesce((w->>'trust')::numeric, 0.6) * (s.trust - 0.5)
       + coalesce((w->>'discovery')::numeric, 0.35) * (case when s.is_new_creator then 1 else 0 end)
         * (case when s.quality >= 0.2 or s.stage = 0 then 1 else 0.3 end)
       + case when s.is_second_chance then 0.25 else 0 end
       + ratio * random()) as score,
      case when s.follows_author then 'Porque você segue este criador'
           when s.relevance > 0.5 then 'Porque você costuma assistir conteúdos parecidos'
           when s.is_new_creator then 'Novo criador para você descobrir'
           when s.quality > 0.5 then 'Em alta agora'
           else 'Sugestão para descobrir algo novo' end as reason,
      case when s.follows_author then 'following'
           when s.is_second_chance then 'second_chance'
           when s.is_new_creator then 'discovery'
           when s.relevance > 0.5 then 'personalized'
           else 'explore' end as src
    from scored s
    order by 4 desc
    limit 300
  ),
  diverse as (
    select r.*, row_number() over (partition by r.author_id order by r.score desc) as author_rank from ranked r
  )
  select d.id, d.author_id,
         (d.score / (1 + coalesce((div->>'author_decay')::numeric, 0.45) * (d.author_rank - 1)))::numeric,
         d.reason, d.src
    from diverse d
   where d.author_rank <= coalesce((div->>'max_per_author')::int, 3)
   order by 3 desc, d.created_at desc
   limit greatest(1, _limit) offset greatest(0, _offset);
end;
$$;

create or replace function public.vir_admin_config()
returns setof public.vir_config language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query select * from public.vir_config order by key;
end;
$$;

create or replace function public.vir_admin_set_config(_key text, _value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  insert into public.vir_config (key, value, updated_at, updated_by)
  values (_key, _value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end;
$$;

create or replace function public.vir_fairness_report()
returns table (bucket text, creators bigint, posts bigint, impressions bigint, avg_quality numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query
  select case when cs.followers < 1000 then '0-1k'
              when cs.followers < 10000 then '1k-10k'
              when cs.followers < 100000 then '10k-100k'
              when cs.followers < 1000000 then '100k-1M'
              else '1M+' end as bucket,
         count(distinct cs.user_id), count(m.post_id),
         coalesce(sum(m.impressions), 0)::bigint, coalesce(avg(m.quality), 0)
    from public.creator_stats cs
    left join public.post_metrics m on m.author_id = cs.user_id
   group by 1 order by 1;
end;
$$;

grant execute on function public.vir_log_event(uuid, text, numeric, text) to authenticated;
grant execute on function public.vir_not_interested(uuid) to authenticated;
grant execute on function public.vir_feed(int, int, text) to authenticated;
grant execute on function public.vir_admin_config() to authenticated;
grant execute on function public.vir_admin_set_config(text, jsonb) to authenticated;
grant execute on function public.vir_fairness_report() to authenticated;
grant execute on function public.vir_variant(uuid) to authenticated;
revoke execute on function public.vir_recompute() from authenticated;
grant execute on function public.vir_recompute() to service_role;

insert into public.post_metrics (post_id, author_id, impressions)
select p.id, p.author_id, coalesce(p.view_count, 0) from public.posts p
on conflict (post_id) do nothing;

insert into public.post_topics (post_id, topic, weight, source)
select ph.post_id, h.tag, 1.0, 'hashtag'
  from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id
on conflict (post_id, topic) do nothing;

insert into public.vir_user_topics (user_id, topic, long_weight, short_weight)
select ua.user_id, ua.topic, ua.weight, ua.weight * 0.5 from public.user_topic_affinity ua
on conflict (user_id, topic) do nothing;

select public.vir_recompute();