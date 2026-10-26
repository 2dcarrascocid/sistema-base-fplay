-- app.hit_rate_limit(): sliding window (the previous window still counts while it overlaps).
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(app.hit_rate_limit('test:fresh', 60, 1), 'a first hit is allowed');
select ok(not app.hit_rate_limit('test:fresh', 60, 1), 'the hit over the limit in the same window is rejected');

-- A huge previous window: whatever fraction of it still overlaps outweighs the limit.
insert into app.rate_limits (key, window_start, hits)
values ('test:previous', to_timestamp((floor(extract(epoch from now()) / 60) - 1) * 60), 2000000000);
select ok(not app.hit_rate_limit('test:previous', 60, 5), 'hits from the previous window count at the window boundary');

select * from finish();
rollback;
