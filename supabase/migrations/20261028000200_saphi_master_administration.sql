-- Phase 4. No direct company/membership DML grants; administration through reviewed functions.
create index farms_page_idx on saphi.farms(company_id,created_at desc,id desc);
create index plots_page_idx on saphi.plots(company_id,created_at desc,id desc);
create index sampling_points_page_idx on saphi.sampling_points(company_id,created_at desc,id desc);
create index company_users_page_idx on saphi.company_users(company_id,created_at desc,user_id desc);

create function saphi.resolve_permission_keys(p_keys text[]) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare ids uuid[];
begin
  if p_keys is null or cardinality(p_keys)>27 or array_position(p_keys,null) is not null
    or cardinality(p_keys)<>(select count(distinct k) from unnest(p_keys) k) then
    raise exception 'SAPHI_INVALID_PERMISSIONS' using errcode='22023';
  end if;
  select coalesce(array_agg(ma.id),'{}'::uuid[]) into ids
  from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
  join saphi.catalog_actions() cat on cat.menu_code=m.code and cat.action_code=a.code
  where m.code||':'||a.code=any(p_keys);
  if cardinality(ids)<>cardinality(p_keys) then
    raise exception 'SAPHI_INVALID_PERMISSIONS' using errcode='22023';
  end if;
  -- Interactive writes require read of the same resource (also necessary for RLS RETURNING).
  if exists(select 1 from unnest(p_keys) k where split_part(k,':',2)<>'view'
    and not (split_part(k,':',1)||':view'=any(p_keys))) then
    raise exception 'SAPHI_INVALID_PERMISSIONS' using errcode='22023';
  end if;
  return ids;
end $$;

create function saphi.check_recipient_permissions(p_user uuid,p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from app.users where id=p_user and status='active') then
    raise exception 'SAPHI_USER_NOT_AVAILABLE' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_ids) id where not exists
    (select 1 from app.v_user_permissions vp where vp.user_id=p_user and vp.menu_action_id=id)) then
    raise exception 'recipient global ceiling exceeded' using errcode='42501';
  end if;
end $$;

create function saphi.require_reason(p_reason text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'SAPHI_REASON_REQUIRED' using errcode='22023';
  end if;
end $$;

create function saphi.admin_context(p_company uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Exclusive lock FIRST: acquiring a shared lock before this would risk lock-upgrade deadlocks.
  perform 1 from saphi.companies where id=p_company for update;
  if not found or not saphi.has_permission(p_company,'saphi.memberships','view')
    or not saphi.has_permission(p_company,'saphi.memberships','edit') then
    raise exception 'company administration forbidden' using errcode='42501';
  end if;
  if saphi.current_company_id() is not null and saphi.current_company_id()<>p_company then
    raise exception 'company context cannot change' using errcode='42501';
  end if;
  perform set_config('saphi.company_id',p_company::text,true);
end $$;

create function saphi.ensure_manager(p_company uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from saphi.company_users cu join app.users u on u.id=cu.user_id and u.status='active'
    where cu.company_id=p_company and cu.status='active' and not exists (
      select 1 from (values ('saphi.companies','view'),('saphi.memberships','view'),('saphi.memberships','edit')) need(menu,action)
      where not exists (
        select 1 from saphi.company_user_permissions cp join app.v_user_permissions vp
          on vp.user_id=cp.user_id and vp.menu_action_id=cp.menu_action_id
        where cp.company_id=cu.company_id and cp.user_id=cu.user_id and vp.menu_code=need.menu and vp.action_code=need.action
      )
    )
  ) then raise exception 'SAPHI_LAST_MANAGER' using errcode='P0001'; end if;
end $$;

create function saphi.audit_administration(p_company uuid,p_user uuid,p_event text,p_reason text,p_old jsonb,p_new jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into app.audit_log(actor_user_id,actor_email,event_type,entity_type,entity_id,result,request_id,ip,user_agent,old_value,new_value)
  values(app.current_user_id(),(select email from app.users where id=app.current_user_id()),p_event,'saphi.membership',p_user::text,'success',
    nullif(current_setting('saphi.request_id',true),''),nullif(current_setting('saphi.ip',true),'')::inet,
    nullif(current_setting('saphi.user_agent',true),''),
    jsonb_build_object('companyId',p_company,'record',p_old),
    jsonb_build_object('companyId',p_company,'reason',p_reason,'record',p_new))
$$;

create function saphi.bootstrap_company(p_rut text,p_name text,p_trade text,p_email text,p_phone text,
  p_initial_user uuid,p_permissions text[],p_reason text) returns saphi.companies
language plpgsql volatile security definer set search_path = '' as $$
declare c saphi.companies; ids uuid[];
begin
  if not app.is_superuser() or p_initial_user=app.current_user_id() then
    raise exception 'company bootstrap forbidden' using errcode='42501';
  end if;
  perform saphi.require_reason(p_reason);
  ids:=saphi.resolve_permission_keys(p_permissions);
  if not (p_permissions @> array['saphi.companies:view','saphi.memberships:view','saphi.memberships:edit']) then
    raise exception 'SAPHI_INITIAL_MANAGER_REQUIRED' using errcode='22023';
  end if;
  perform saphi.check_recipient_permissions(p_initial_user,ids);
  insert into saphi.companies(rut,legal_name,trade_name,contact_email,contact_phone)
    values(p_rut,p_name,p_trade,p_email,p_phone) returning * into c;
  insert into saphi.company_users(company_id,user_id) values(c.id,p_initial_user);
  insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
    select c.id,p_initial_user,id from unnest(ids) id;
  perform saphi.ensure_manager(c.id);
  perform saphi.audit_administration(c.id,p_initial_user,'saphi.company.bootstrap',p_reason,null,to_jsonb(p_permissions));
  return c;
end $$;

create function saphi.set_membership(p_company uuid,p_user uuid,p_version bigint,p_status text,p_reason text)
returns saphi.company_users language plpgsql volatile security definer set search_path = '' as $$
declare m saphi.company_users; old_m jsonb; ids uuid[];
begin
  perform saphi.require_reason(p_reason);
  perform saphi.admin_context(p_company);
  if p_user=app.current_user_id() then raise exception 'self membership change forbidden' using errcode='42501'; end if;
  if p_status is null or p_status not in ('active','inactive') or p_version is null or p_version<0 then
    raise exception 'SAPHI_INVALID_MEMBERSHIP' using errcode='22023';
  end if;
  select * into m from saphi.company_users where company_id=p_company and user_id=p_user for update;
  old_m:=case when found then to_jsonb(m) else null end;
  if old_m is null then
    if p_version<>0 then raise exception 'SAPHI_VERSION_CONFLICT' using errcode='P0001'; end if;
    perform saphi.check_recipient_permissions(p_user,'{}');
    insert into saphi.company_users(company_id,user_id,status) values(p_company,p_user,p_status) returning * into m;
  else
    if m.version<>p_version then raise exception 'SAPHI_VERSION_CONFLICT' using errcode='P0001'; end if;
    if p_status='active' then
      select coalesce(array_agg(menu_action_id),'{}'::uuid[]) into ids from saphi.company_user_permissions
        where company_id=p_company and user_id=p_user;
      perform saphi.check_recipient_permissions(p_user,ids);
      if exists(select 1 from app.menu_actions ma join app.menus menu on menu.id=ma.menu_id join app.actions a on a.id=ma.action_id
        where ma.id=any(ids) and not saphi.has_permission(p_company,menu.code,a.code)) then
        raise exception 'reactivation exceeds actor scope' using errcode='42501';
      end if;
    end if;
    update saphi.company_users set status=p_status where company_id=p_company and user_id=p_user returning * into m;
  end if;
  perform saphi.ensure_manager(p_company);
  perform saphi.audit_administration(p_company,p_user,'saphi.membership.changed',p_reason,old_m,to_jsonb(m));
  return m;
end $$;

create function saphi.set_member_permissions(p_company uuid,p_user uuid,p_version bigint,p_permissions text[],p_reason text)
returns saphi.company_users language plpgsql volatile security definer set search_path = '' as $$
declare m saphi.company_users; ids uuid[]; old_ids jsonb;
begin
  perform saphi.require_reason(p_reason);
  perform saphi.admin_context(p_company);
  if p_user=app.current_user_id() then raise exception 'self permission change forbidden' using errcode='42501'; end if;
  select * into m from saphi.company_users where company_id=p_company and user_id=p_user for update;
  if not found then raise exception 'SAPHI_NOT_FOUND' using errcode='P0001'; end if;
  if p_version is null or m.version<>p_version then raise exception 'SAPHI_VERSION_CONFLICT' using errcode='P0001'; end if;
  ids:=saphi.resolve_permission_keys(p_permissions);
  perform saphi.check_recipient_permissions(p_user,ids);
  if exists(select 1 from app.menu_actions ma join app.menus menu on menu.id=ma.menu_id join app.actions a on a.id=ma.action_id
    where ma.id=any(ids) and not saphi.has_permission(p_company,menu.code,a.code)) then
    raise exception 'grant exceeds actor scope' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(menu_action_id),'[]') into old_ids from saphi.company_user_permissions where company_id=p_company and user_id=p_user;
  delete from saphi.company_user_permissions where company_id=p_company and user_id=p_user;
  insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
    select p_company,p_user,id from unnest(ids) id;
  update saphi.company_users set status=status where company_id=p_company and user_id=p_user returning * into m;
  perform saphi.ensure_manager(p_company);
  perform saphi.audit_administration(p_company,p_user,'saphi.permissions.changed',p_reason,old_ids,to_jsonb(p_permissions));
  return m;
end $$;

create function saphi.update_company(p_company uuid,p_version bigint,p_changes jsonb,p_reason text) returns saphi.companies
language plpgsql volatile security definer set search_path = '' as $$
declare c saphi.companies;
begin
  perform saphi.require_reason(p_reason);
  select * into c from saphi.companies where id=p_company for update;
  if not found or not saphi.has_permission(p_company,'saphi.companies','view')
    or not saphi.has_permission(p_company,'saphi.companies','edit') then
    raise exception 'company update forbidden' using errcode='42501';
  end if;
  if saphi.current_company_id() is not null and saphi.current_company_id()<>p_company then
    raise exception 'company context cannot change' using errcode='42501';
  end if;
  perform set_config('saphi.company_id',p_company::text,true);
  if p_version is null or c.version<>p_version then raise exception 'SAPHI_VERSION_CONFLICT' using errcode='P0001'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb
    or p_changes-array['legalName','tradeName','contactEmail','contactPhone','status']<>'{}'::jsonb then
    raise exception 'SAPHI_INVALID_COMPANY' using errcode='22023';
  end if;
  if p_changes ? 'status' and not app.is_superuser() then raise exception 'company state requires superuser' using errcode='42501'; end if;
  perform set_config('saphi.reason',p_reason,true);
  update saphi.companies set
    legal_name=case when p_changes ? 'legalName' then p_changes->>'legalName' else legal_name end,
    trade_name=case when p_changes ? 'tradeName' then p_changes->>'tradeName' else trade_name end,
    contact_email=case when p_changes ? 'contactEmail' then p_changes->>'contactEmail' else contact_email end,
    contact_phone=case when p_changes ? 'contactPhone' then p_changes->>'contactPhone' else contact_phone end,
    status=case when p_changes ? 'status' then p_changes->>'status' else status end
  where id=p_company returning * into c;
  return c;
end $$;

-- Minimal directory projection for tenant administration, not app.users SELECT privilege.
create function saphi.members(p_company uuid) returns table(user_id uuid,first_name text,last_name text,status text,version bigint,permissions text[],created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not saphi.can_access(p_company,'saphi.memberships','view') then raise exception 'members forbidden' using errcode='42501'; end if;
  return query select cu.user_id,u.first_name,u.last_name,cu.status,cu.version,
    coalesce((select array_agg(m.code||':'||a.code order by m.code,a.code) from saphi.company_user_permissions cp
      join app.menu_actions ma on ma.id=cp.menu_action_id join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
      where cp.company_id=cu.company_id and cp.user_id=cu.user_id),'{}'::text[]),cu.created_at
  from saphi.company_users cu join app.users u on u.id=cu.user_id where cu.company_id=p_company;
end $$;

-- Audit metadata is transaction-local and supplied from the authenticated request.
create or replace function saphi.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_new jsonb:=to_jsonb(new); v_old jsonb;
begin
  if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
  insert into app.audit_log(actor_user_id,actor_email,event_type,entity_type,entity_id,result,request_id,ip,user_agent,old_value,new_value)
  values(app.current_user_id(),(select email from app.users where id=app.current_user_id()),
    'saphi.'||tg_table_name||case when tg_op='INSERT' then '.created' else '.updated' end,
    'saphi.'||tg_table_name,coalesce(v_new->>'id',v_new->>'user_id'),'success',
    nullif(current_setting('saphi.request_id',true),''),nullif(current_setting('saphi.ip',true),'')::inet,
    nullif(current_setting('saphi.user_agent',true),''),
    case when v_old is null then null else jsonb_build_object('companyId',coalesce(v_old->>'company_id',v_old->>'id'),'record',v_old) end,
    jsonb_build_object('companyId',coalesce(v_new->>'company_id',v_new->>'id'),'reason',nullif(current_setting('saphi.reason',true),''),'record',v_new));
  return new;
end $$;

revoke execute on all functions in schema saphi from public;
grant execute on function saphi.bootstrap_company(text,text,text,text,text,uuid,text[],text),
  saphi.set_membership(uuid,uuid,bigint,text,text),saphi.set_member_permissions(uuid,uuid,bigint,text[],text),
  saphi.update_company(uuid,bigint,jsonb,text),saphi.members(uuid) to app_api;
-- Only implemented modules get routes. These static paths are resolved by Vue bridge routes.
update app.menus set route=case code
  when 'saphi.companies' then '/saphi/companies' when 'saphi.memberships' then '/saphi/memberships'
  when 'saphi.farms' then '/saphi/farms' when 'saphi.plots' then '/saphi/plots'
  when 'saphi.samples' then '/saphi/sampling-points' end
where code in ('saphi.companies','saphi.memberships','saphi.farms','saphi.plots','saphi.samples');
update app.menus set name='{"es":"Muestreo","en":"Sampling"}' where code='saphi.samples';
