-- Rate limiting and the immutable, hash-chained security audit log.

create table app.rate_limits (
  key text not null check (length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

-- Counts one hit for key in the current fixed window. Returns true when the request is allowed.
create function app.hit_rate_limit(p_key text, p_window_seconds integer, p_max_hits integer) returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into app.rate_limits as r (key, window_start) values (p_key, v_window)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max_hits;
end
$$;

create function app.purge_rate_limits(p_older_than interval default interval '1 day') returns integer
language sql volatile security definer
set search_path = ''
as $$
  with deleted as (delete from app.rate_limits where window_start < now() - p_older_than returning 1)
  select count(*)::integer from deleted
$$;

create table app.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references app.users (id),
  actor_email text check (length(actor_email) <= 254),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' and length(event_type) <= 100),
  entity_type text check (length(entity_type) <= 64),
  entity_id text check (length(entity_id) <= 128),
  result text not null check (result in ('success', 'failure')),
  ip inet,
  user_agent text check (length(user_agent) <= 500),
  request_id text check (length(request_id) <= 128),
  old_value jsonb,
  new_value jsonb,
  prev_hash bytea,
  hash bytea not null default '\x00'
);

create index audit_log_occurred_idx on app.audit_log (occurred_at);
create index audit_log_actor_idx on app.audit_log (actor_user_id, occurred_at);
create index audit_log_event_idx on app.audit_log (event_type, occurred_at);

create function app.audit_row_hash(prev bytea, r app.audit_log) returns bytea
language sql immutable
set search_path = ''
as $$
  -- jsonb text is canonical (sorted keys); the timestamp is hashed as epoch so the session
  -- TimeZone setting cannot change the result.
  select sha256(coalesce(prev, '\x'::bytea) || convert_to(
    jsonb_set(to_jsonb(r) - 'hash' - 'prev_hash', '{occurred_at}', to_jsonb(extract(epoch from r.occurred_at)))::text,
    'UTF8'))
$$;

-- Sets server time and chains each row to the previous one. Inserts are serialized by an
-- advisory lock so the chain stays linear. SECURITY DEFINER: the inserting role may not be
-- allowed to read audit_log (RLS) but the chain needs the last hash.
create function app.audit_log_chain() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('app.audit_log'));
  new.occurred_at := now();
  select hash into new.prev_hash from app.audit_log order by id desc limit 1;
  new.hash := app.audit_row_hash(new.prev_hash, new);
  return new;
end
$$;

create trigger audit_log_chain before insert on app.audit_log
  for each row execute function app.audit_log_chain();

create function app.audit_log_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end
$$;

create trigger audit_log_no_update_delete before update or delete on app.audit_log
  for each row execute function app.audit_log_immutable();

create trigger audit_log_no_truncate before truncate on app.audit_log
  for each statement execute function app.audit_log_immutable();

-- Returns the id of the first row whose hash does not verify, or null when the chain is intact.
create function app.verify_audit_chain() returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
declare
  r app.audit_log;
  prev bytea := null;
begin
  for r in select * from app.audit_log order by id loop
    if r.prev_hash is distinct from prev or r.hash <> app.audit_row_hash(prev, r) then
      return r.id;
    end if;
    prev := r.hash;
  end loop;
  return null;
end
$$;
