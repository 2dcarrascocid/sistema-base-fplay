-- Phase 4: configuration maintainers and audit screen.

-- Integrity of the audit hash chain, for the audit screen (requires security.audit:view).
create function app.audit_chain_status() returns table (valid boolean, broken_id bigint, total bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_broken bigint;
begin
  if not app.has_permission('security.audit', 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_broken := app.verify_audit_chain();
  return query select v_broken is null, v_broken, (select count(*) from app.audit_log);
end
$$;

revoke execute on function app.audit_chain_status() from public;
grant execute on function app.audit_chain_status() to app_api;

-- Audit screen filters.
create index audit_log_entity_idx on app.audit_log (entity_type, entity_id, occurred_at);
