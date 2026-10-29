-- Foundation constraints and grants. Transactional fixtures never survive the suite.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_schema('saphi');
select tables_are('saphi', array['companies','company_users','company_user_permissions','farms','plots','sampling_points','soil_samples','devices','sensor_readings','satellite_observations','satellite_assets','iot_bindings','iot_receipts']);
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='saphi' and c.relkind='r' and not c.relrowsecurity), 0, 'all Saphi tables have RLS');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='saphi' and pg_get_userbyid(c.relowner) in ('app_api','app_auth')), 0, 'runtime owns no Saphi tables');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='saphi' and p.prosecdef and not exists
  (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')), 0, 'definer helpers pin search_path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='saphi' and has_function_privilege('public',p.oid,'EXECUTE')), 0, 'no PUBLIC function execution');
select is((select count(*)::int from information_schema.role_table_grants where table_schema='saphi' and grantee='PUBLIC'), 0, 'no PUBLIC table grants');
select ok(not has_schema_privilege('app_api','saphi','CREATE'), 'runtime cannot create schema objects');
select ok(not has_schema_privilege('app_auth','saphi','USAGE'), 'auth role has no Saphi access');
select ok(not has_table_privilege('app_api','saphi.companies','INSERT'), 'company bootstrap remains closed');
select ok(not has_table_privilege('app_api','saphi.company_users','UPDATE'), 'no direct membership changes');
select ok(not has_table_privilege('app_api','saphi.company_user_permissions','INSERT'), 'no direct self-grants');
select ok(not has_table_privilege('app_api','saphi.farms','DELETE'), 'no physical master deletion');
select ok(not has_table_privilege('app_api','saphi.soil_samples','UPDATE'), 'samples are not freely overwritten');
select ok(not has_column_privilege('app_api','saphi.farms','company_id','UPDATE'), 'company is immutable to runtime');
select ok(not has_column_privilege('app_api','saphi.plots','farm_id','UPDATE'), 'parent is immutable to runtime');
select ok(not has_column_privilege('app_api','saphi.farms','created_by','INSERT'), 'actor cannot be injected in a write');
select is((select count(*)::int from saphi.catalog_actions()), 27, '27 catalogue definitions match Phase 2');
select is((select count(*)::int from app.menu_actions ma join app.menus m on m.id=ma.menu_id where m.code like 'saphi.%'), 27, 'catalogue works with seeded actions');
select is((select count(*)::int from app.profile_permissions pp join app.menu_actions ma on ma.id=pp.menu_action_id
  join app.menus m on m.id=ma.menu_id where m.code like 'saphi.%' and pp.profile_id in
  ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003')),
  0, 'base profiles receive no automatic Saphi grants');
select is((select count(*)::int from app.menus where code like 'saphi%' and route is not null), 8, 'only implemented module links are active');

select set_config('app.user_id','',true);
insert into saphi.companies (id,rut,legal_name) values
 ('81000000-0000-4000-8000-000000000001','12345678-5','A'),
 ('81000000-0000-4000-8000-000000000002','11111111-1','B');
insert into saphi.farms (id,company_id,code,name) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','P1','A'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','P1','B');
select throws_ok($$insert into saphi.companies(rut,legal_name) values('12345678-5','Duplicate')$$,'23505',null,'RUT unique globally');
select throws_ok($$insert into saphi.companies(rut,legal_name) values('12345678-4','Invalid')$$,'23514',null,'RUT uses existing validator');
select throws_ok($$insert into saphi.farms(company_id,code,name) values('81000000-0000-4000-8000-000000000001','P1','Duplicate')$$,'23505',null,'code unique within company');
select throws_ok($$insert into saphi.farms(company_id,code,name,area_ha) values('81000000-0000-4000-8000-000000000001','P2','Bad',0)$$,'23514',null,'area positive');
select throws_ok($$insert into saphi.farms(company_id,code,name,area_ha) values('81000000-0000-4000-8000-000000000001','P2','Bad',1.00001)$$,'23514',null,'no silently rounded surface');
select throws_ok($$insert into saphi.farms(company_id,code,name,area_ha) values('81000000-0000-4000-8000-000000000001','P2','Bad','NaN')$$,'23514',null,'NaN rejected');
select throws_ok($$insert into saphi.plots(company_id,farm_id,code,name) values('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','C1','Cross')$$,'23503',null,'plot cannot reference foreign company farm');
select throws_ok($$update saphi.farms set company_id='81000000-0000-4000-8000-000000000002' where id='82000000-0000-4000-8000-000000000001'$$,'42501',null,'identity guard also protects owner writes');

insert into saphi.plots(id,company_id,farm_id,code,name) values
 ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','C1','Plot 1'),
 ('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','C2','Plot 2');
insert into saphi.sampling_points(id,company_id,plot_id,code,location) values
 ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','S1','{"type":"Point","coordinates":[-70,-33]}');
select ok(saphi.is_point('{"type":"Point","coordinates":[-180,90]}'), 'point bounds inclusive');
select ok(not saphi.is_point('{}'), 'missing point shape rejected');
select ok(not saphi.is_point('{"type":"Point","coordinates":[181,0]}'), 'longitude bounded');
select ok(not saphi.is_point('{"type":"Point","coordinates":[0,-91]}'), 'latitude bounded');
select ok(not saphi.is_point('{"type":"Point","coordinates":["0",0]}'), 'numeric coordinates only');
select ok(not saphi.is_point('{"type":"Point","coordinates":[0,0,0]}'), 'two dimensions only');
select ok(not saphi.is_point('{"type":"Point","coordinates":{}}'), 'invalid array safely rejected');
select ok(not saphi.is_point('{"type":"Point","coordinates":[0,0],"secret":"x"}'), 'unknown point properties rejected');
select throws_ok($$insert into saphi.soil_samples(company_id,plot_id,sampling_point_id,code,sampled_at) values('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','X',now())$$,'23503',null,'sample point must belong to the same plot');
select throws_ok($$insert into saphi.soil_samples(company_id,plot_id,code,sampled_at) values('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','X','infinity')$$,'23514',null,'sample date finite');
select lives_ok($$insert into saphi.soil_samples(company_id,plot_id,sampling_point_id,code,sampled_at) values('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','X',now())$$,'valid sample accepted');
select throws_ok($$delete from saphi.farms where id='82000000-0000-4000-8000-000000000001'$$,'23503',null,'no cascade deleting populated farms');
select is(app.verify_audit_chain(),null::bigint,'existing audit chain remains valid');
select * from finish();
rollback;
