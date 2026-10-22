-- Bookreel's cloud conversion queue, in the "bookreel" schema of its own free Supabase project (ref kapqzvyciukjyiyqabhl).
-- The web app never talks to the database: Vercel functions call public.bookreel_rpc with a shared token,
-- and pg_cron wakes the Vercel worker (/api/worker) every minute while a job is due.
-- Applied with the Supabase tools; the token and worker URL go into bookreel.settings separately,
-- and two cron jobs run bookreel.kick() every minute and bookreel.tidy() daily (see the end of this file).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists bookreel;
revoke all on schema bookreel from public, anon, authenticated;

create table if not exists bookreel.jobs (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  title text not null,
  authors jsonb not null default '[]'::jsonb,
  source jsonb not null default '{}'::jsonb,           -- {"kind":"gutenberg","gid":2680} | {"kind":"file"}
  status text not null default 'queued' check (status in ('queued', 'working', 'waiting', 'done', 'failed', 'cancelled')),
  stage text not null default 'plan' check (stage in ('plan', 'write', 'finish')),
  parts jsonb,                                          -- the book in 20 parts; cleared when done
  words int not null default 0,
  plan jsonb,
  chapters jsonb not null default '[]'::jsonb,          -- 20 slots, null until written
  extras jsonb not null default '[]'::jsonb,            -- speakers the plan missed
  notes jsonb not null default '[]'::jsonb,             -- quality notes per chapter
  pack jsonb,
  models jsonb not null default '{}'::jsonb,
  allow_lite boolean not null default false,
  attempts int not null default 0,
  wait_until timestamptz not null default now(),
  wait_reason text,
  last_error text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_due on bookreel.jobs (status, wait_until);
create index if not exists jobs_item on bookreel.jobs (item_id, created_at desc);

-- Models whose free daily quota is used up, and until when.
create table if not exists bookreel.quota (model text primary key, exhausted_until timestamptz not null);
create table if not exists bookreel.settings (key text primary key, value text not null);

create or replace function public.bookreel_rpc(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = bookreel, pg_temp
as $$
declare
  j bookreel.jobs;
  n int;
  out jsonb;
  patch jsonb := coalesce(p_args -> 'patch', '{}'::jsonb);
begin
  if p_token is null or p_token <> (select value from bookreel.settings where key = 'token') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action = 'create' then
    update bookreel.jobs set status = 'cancelled', updated_at = now()
      where item_id = p_args ->> 'item_id' and status in ('queued', 'working', 'waiting');
    insert into bookreel.jobs (item_id, title, authors, source, parts, words, allow_lite, chapters)
      values (p_args ->> 'item_id', p_args ->> 'title', coalesce(p_args -> 'authors', '[]'::jsonb), coalesce(p_args -> 'source', '{}'::jsonb),
              p_args -> 'parts', coalesce((p_args ->> 'words')::int, 0), coalesce((p_args ->> 'allow_lite')::boolean, false),
              (select jsonb_agg(null::jsonb) from generate_series(1, 20)))
      returning * into j;
    return jsonb_build_object('id', j.id);

  elsif p_action = 'status' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'item_id', x.item_id, 'title', x.title, 'status', x.status, 'stage', x.stage,
        'done', (select count(*) from jsonb_array_elements(x.chapters) c where c <> 'null'::jsonb),
        'wait_until', x.wait_until, 'wait_reason', x.wait_reason, 'last_error', x.last_error, 'allow_lite', x.allow_lite,
        'models', x.models, 'has_plan', x.plan is not null, 'created_at', x.created_at, 'updated_at', x.updated_at, 'finished_at', x.finished_at,
        'working', x.locked_until is not null and x.locked_until > now(),
        'last_hook', (select c -> 'posts' -> 0 || jsonb_build_object('n', c -> 'n') from jsonb_array_elements(x.chapters) c
                      where c <> 'null'::jsonb order by (c ->> 'n')::int desc limit 1)
      )), '[]'::jsonb) into out
      from bookreel.jobs x where x.id::text in (select jsonb_array_elements_text(p_args -> 'ids'));
    return out;

  elsif p_action = 'result' then
    select * into j from bookreel.jobs where id = (p_args ->> 'id')::uuid;
    if not found then return null; end if;
    return jsonb_build_object('id', j.id, 'item_id', j.item_id, 'status', j.status, 'pack', j.pack);

  elsif p_action = 'cancel' then
    update bookreel.jobs set status = 'cancelled', updated_at = now(), locked_until = null
      where id = (p_args ->> 'id')::uuid and status in ('queued', 'working', 'waiting');
    return jsonb_build_object('ok', true);

  elsif p_action = 'lite' then
    -- "Finish now with Flash-Lite": stop waiting for the better model's daily quota.
    update bookreel.jobs set allow_lite = true, wait_until = least(wait_until, now()), wait_reason = null, updated_at = now()
      where id = (p_args ->> 'id')::uuid and status in ('queued', 'working', 'waiting');
    return jsonb_build_object('ok', true);

  elsif p_action = 'retry' then
    update bookreel.jobs set status = 'queued', attempts = 0, last_error = null, wait_until = now(), wait_reason = null, updated_at = now()
      where id = (p_args ->> 'id')::uuid and status in ('failed', 'cancelled') and parts is not null;
    return jsonb_build_object('ok', true);

  elsif p_action = 'claim' then
    -- One due job for the worker, leased so nothing else touches it meanwhile.
    select * into j from bookreel.jobs
      where status in ('queued', 'working', 'waiting') and wait_until <= now() and (locked_until is null or locked_until < now())
      order by created_at limit 1 for update skip locked;
    if not found then return null; end if;
    update bookreel.jobs set locked_until = now() + make_interval(secs => coalesce((p_args ->> 'lease')::int, 300)),
        status = 'working', updated_at = now()
      where id = j.id;
    if j.stage = 'plan' then
      return jsonb_build_object('id', j.id, 'stage', 'plan', 'item_id', j.item_id, 'title', j.title, 'authors', j.authors, 'source', j.source,
        'parts', j.parts, 'allow_lite', j.allow_lite, 'attempts', j.attempts, 'models', j.models);
    elsif j.stage = 'write' then
      select min(i) into n from generate_series(1, 20) i where j.chapters -> (i - 1) is null or j.chapters -> (i - 1) = 'null'::jsonb;
      if n is null then
        update bookreel.jobs set stage = 'finish' where id = j.id;
        j.stage := 'finish';
      else
        return jsonb_build_object('id', j.id, 'stage', 'write', 'n', n, 'item_id', j.item_id, 'title', j.title, 'authors', j.authors,
          'plan', j.plan, 'part', j.parts -> (n - 1), 'prev_cliff', case when n > 1 then j.chapters -> (n - 2) -> 'posts' -> 9 ->> 'text' end,
          'extras', j.extras, 'allow_lite', j.allow_lite, 'attempts', j.attempts, 'models', j.models);
      end if;
    end if;
    return jsonb_build_object('id', j.id, 'stage', 'finish', 'item_id', j.item_id, 'title', j.title, 'authors', j.authors, 'source', j.source,
      'plan', j.plan, 'chapters', j.chapters, 'extras', j.extras, 'models', j.models, 'notes', j.notes, 'created_at', j.created_at);

  elsif p_action = 'save' then
    -- The worker's result for one step. Every key in patch is optional.
    update bookreel.jobs set
      plan = coalesce(patch -> 'plan', plan),
      chapters = case when patch ? 'chapter' then jsonb_set(chapters, array[((patch -> 'chapter' ->> 'n')::int - 1)::text], patch -> 'chapter') else chapters end,
      extras = coalesce(patch -> 'extras', extras),
      notes = case when patch ? 'note' then notes || jsonb_build_array(patch -> 'note') else notes end,
      models = models || coalesce(patch -> 'models', '{}'::jsonb),
      stage = coalesce(patch ->> 'stage', stage),
      status = coalesce(patch ->> 'status', status),
      attempts = coalesce((patch ->> 'attempts')::int, attempts),
      wait_until = coalesce((patch ->> 'wait_until')::timestamptz, wait_until),
      wait_reason = case when patch ? 'wait_reason' then patch ->> 'wait_reason' else wait_reason end,
      last_error = case when patch ? 'last_error' then patch ->> 'last_error' else last_error end,
      pack = coalesce(patch -> 'pack', pack),
      parts = case when (patch ->> 'clear_parts')::boolean then null else parts end,
      finished_at = case when patch ->> 'status' = 'done' then now() else finished_at end,
      locked_until = null,
      updated_at = now()
    where id = (p_args ->> 'id')::uuid and status <> 'cancelled';
    return jsonb_build_object('ok', true);

  elsif p_action = 'quota' then
    select coalesce(jsonb_object_agg(model, exhausted_until), '{}'::jsonb) into out from bookreel.quota where exhausted_until > now();
    return out;

  elsif p_action = 'quota_set' then
    insert into bookreel.quota (model, exhausted_until) values (p_args ->> 'model', (p_args ->> 'until')::timestamptz)
      on conflict (model) do update set exhausted_until = excluded.exhausted_until;
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'unknown action %', p_action;
end;
$$;

revoke all on function public.bookreel_rpc(text, text, jsonb) from public;
grant execute on function public.bookreel_rpc(text, text, jsonb) to anon, authenticated;

-- Wakes the Vercel worker when a job is due and no worker is busy. Cheap when idle.
create or replace function bookreel.kick()
returns void
language plpgsql
security definer
set search_path = bookreel, pg_temp
as $$
begin
  if not exists (select 1 from bookreel.jobs where status in ('queued', 'working', 'waiting') and wait_until <= now()
                 and (locked_until is null or locked_until < now())) then
    return;
  end if;
  if exists (select 1 from bookreel.jobs where locked_until > now()) then
    return; -- one worker at a time keeps us inside the free per-minute limits
  end if;
  perform net.http_post(
    url := (select value from bookreel.settings where key = 'worker_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bookreel-token', (select value from bookreel.settings where key = 'token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 295000
  );
end;
$$;
revoke all on function bookreel.kick() from public;

-- Finished jobs keep their pack for 30 days; abandoned ones are cleared after 14.
create or replace function bookreel.tidy()
returns void
language sql
security definer
set search_path = bookreel, pg_temp
as $$
  delete from bookreel.jobs where (status = 'done' and finished_at < now() - interval '30 days')
    or (status in ('failed', 'cancelled') and updated_at < now() - interval '14 days');
  delete from bookreel.quota where exhausted_until < now() - interval '1 day';
$$;
revoke all on function bookreel.tidy() from public;

-- Schedules (run once):
--   select cron.schedule('bookreel-worker', '* * * * *', 'select bookreel.kick()');
--   select cron.schedule('bookreel-tidy', '17 3 * * *', 'select bookreel.tidy()');
-- Settings (run once, with the real token that is also in Vercel's BOOKREEL_TOKEN):
--   insert into bookreel.settings values ('token', '<token>'), ('worker_url', 'https://bookreel-sand.vercel.app/api/worker');
