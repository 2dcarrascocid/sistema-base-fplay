-- Phase 6: sliding-window rate limiting.
-- A fixed window lets a client spend its whole quota just before a window ends and again just after
-- (twice the limit in a moment). The previous window's hits now count in proportion to how much of
-- it still overlaps the last p_window_seconds. Same signature, so existing grants are kept.

create or replace function app.hit_rate_limit(p_key text, p_window_seconds integer, p_max_hits integer) returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_now numeric := extract(epoch from now());
  v_start numeric := floor(v_now / p_window_seconds) * p_window_seconds;
  v_hits integer;
  v_previous integer;
begin
  insert into app.rate_limits as r (key, window_start) values (p_key, to_timestamp(v_start))
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  select hits into v_previous from app.rate_limits
  where key = p_key and window_start = to_timestamp(v_start - p_window_seconds);

  return v_hits + coalesce(v_previous, 0) * (1 - (v_now - v_start) / p_window_seconds) <= p_max_hits;
end
$$;

comment on function app.hit_rate_limit(text, integer, integer) is
  'Counts one hit for key (sliding window: current window plus the overlapping part of the previous one). Returns true when allowed.';
