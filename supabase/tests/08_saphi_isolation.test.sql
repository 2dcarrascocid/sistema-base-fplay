begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant app_api, app_auth to postgres with set true, inherit false;
grant usage on schema extensions to app_api, app_auth;
do $$ begin
 execute format('grant all on all tables in schema %I to app_api,app_auth',pg_my_temp_schema()::regnamespace);
 execute format('grant all on all sequences in schema %I to app_api,app_auth',pg_my_temp_schema()::regnamespace);
end $$;

select set_config('app.user_id','',true);
insert into app.users(id,email,first_name,last_name,role_id,status) values
 ('85000000-0000-4000-8000-000000000001','saphi.editor@test.cl','Editor','A',3,'active'),
 ('85000000-0000-4000-8000-000000000002','saphi.no.global@test.cl','No','Global',3,'active'),
 ('85000000-0000-4000-8000-000000000003','saphi.no.member@test.cl','No','Member',3,'active');
insert into app.profiles(id,name) values('86000000-0000-4000-8000-000000000001','Saphi tests only');
insert into app.profile_permissions(profile_id,menu_action_id)
 select '86000000-0000-4000-8000-000000000001',ma.id from app.menu_actions ma
 join app.menus m on m.id=ma.menu_id where m.code like 'saphi.%';
insert into app.user_profiles(user_id,profile_id) values
 ('85000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001'),
 ('85000000-0000-4000-8000-000000000003','86000000-0000-4000-8000-000000000001');
insert into saphi.companies(id,rut,legal_name) values
 ('87000000-0000-4000-8000-000000000001','12345678-5','A'),
 ('87000000-0000-4000-8000-000000000002','11111111-1','B');
insert into saphi.company_users(company_id,user_id) values
 ('87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001'),
 ('87000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000001'),
 ('87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002');
insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
 select cu.company_id,cu.user_id,ma.id from saphi.company_users cu
 cross join app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
 where cu.company_id in ('87000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002')
 and m.code like 'saphi.%' and (cu.company_id='87000000-0000-4000-8000-000000000001' or a.code='view');
insert into saphi.farms(id,company_id,code,name) values
 ('88000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','P1','A'),
 ('88000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','P1','B');
insert into saphi.plots(id,company_id,farm_id,code,name) values
 ('89000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','C1','A'),
 ('89000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000002','C1','B');
insert into saphi.sampling_points(id,company_id,plot_id,code,location) values
 ('8a000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','S1','{"type":"Point","coordinates":[-70,-33]}'),
 ('8a000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','S1','{"type":"Point","coordinates":[-71,-34]}');
insert into saphi.soil_samples(company_id,plot_id,sampling_point_id,code,sampled_at) values
 ('87000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001','M1',now()),
 ('87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','8a000000-0000-4000-8000-000000000002','M1',now());

select throws_ok($$insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
 select '87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',ma.id from app.menu_actions ma
 join app.menus m on m.id=ma.menu_id where m.code='security.users' limit 1$$,'23514',null,'scope cannot reference foreign permission catalogue');

set local role app_api;
select is((select count(*)::int from saphi.farms),0,'no actor/context reveals no farms');
select set_config('app.user_id','85000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from saphi.companies),2,'discovery lists only accessible companies');
select is((select count(*)::int from saphi.farms),0,'membership without company context reveals no agricultural rows');
select saphi.set_company_context('87000000-0000-4000-8000-000000000001');
select is((select count(*)::int from saphi.farms),1,'A context sees only A');
select is((select count(*)::int from saphi.plots),1,'A sees only its own plots');
select is((select count(*)::int from saphi.sampling_points),1,'A sees only its own sampling points');
select is((select count(*)::int from saphi.soil_samples),1,'A sees only its own soil samples');
select throws_ok($$insert into saphi.plots(company_id,farm_id,code,name) values('87000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000002','Cross','Invalid')$$,'23503',null,'RLS-approved A write cannot reference B farm');
select throws_ok($$insert into saphi.sampling_points(company_id,plot_id,code,location) values('87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','Cross','{"type":"Point","coordinates":[0,0]}')$$,'42501',null,'point WITH CHECK rejects foreign company');
select throws_ok($$insert into saphi.soil_samples(company_id,plot_id,code,sampled_at) values('87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','Cross',now())$$,'42501',null,'sample WITH CHECK rejects foreign company');
select ok(saphi.can_access('87000000-0000-4000-8000-000000000001','saphi.farms','edit'),'editor in A');
select lives_ok($$update saphi.farms set name='Edited A' where id='88000000-0000-4000-8000-000000000001'$$,'authorized edit succeeds');
select is((select version from saphi.farms where id='88000000-0000-4000-8000-000000000001'),2::bigint,'version increments in database');
select is((select updated_by::text from saphi.farms where id='88000000-0000-4000-8000-000000000001'),'85000000-0000-4000-8000-000000000001','database stamps real actor');
select is((select count(*)::int from saphi.farms where id='88000000-0000-4000-8000-000000000002'),0,'direct B UUID does not bypass RLS');
select throws_ok($$insert into saphi.farms(company_id,code,name) values('87000000-0000-4000-8000-000000000002','Injected','Wrong')$$,'42501',null,'WITH CHECK rejects injected B company');
select throws_ok($$update saphi.farms set company_id='87000000-0000-4000-8000-000000000002'$$,'42501',null,'cannot change company column');
select throws_ok($$select saphi.set_company_context('87000000-0000-4000-8000-000000000002')$$,'42501',null,'normal context setter rejects switching company mid-transaction');
select throws_ok($$insert into saphi.company_users(company_id,user_id) values('87000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000003')$$,'42501',null,'no self-service membership insert');
select throws_ok($$delete from saphi.company_user_permissions$$,'42501',null,'no direct scope edits');

-- Forging the selector does not create permissions. The runtime role is server-only.
select set_config('saphi.company_id','87000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from saphi.farms),1,'B reader sees B only');
select ok(not saphi.can_access('87000000-0000-4000-8000-000000000002','saphi.farms','edit'),'same user cannot edit B');
update saphi.farms set name='Hacked B' where id='88000000-0000-4000-8000-000000000002';
select is((select name from saphi.farms where id='88000000-0000-4000-8000-000000000002'),'B','UPDATE silently affects no unauthorized rows');
select set_config('saphi.company_id','broken',true);
select is(saphi.current_company_id(),null::uuid,'malformed context safely closes data access');
select is((select count(*)::int from saphi.farms),0,'malformed context reveals no data');

select set_config('app.user_id','85000000-0000-4000-8000-000000000002',true);
select set_config('saphi.company_id','87000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from saphi.farms),0,'contextual grant without global ceiling denied');
select set_config('app.user_id','85000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from saphi.farms),0,'global permission without membership denied');
select throws_ok($$select saphi.set_company_context('87000000-0000-4000-8000-000000000001')$$,'42501',null,'context setter validates membership');
select set_config('app.user_id','00000000-0000-0000-0000-000000000001',true);
select is((select count(*)::int from saphi.farms),0,'superuser has no implicit tenant membership');

reset role;
update saphi.company_users set status='inactive'
 where company_id='87000000-0000-4000-8000-000000000001' and user_id='85000000-0000-4000-8000-000000000001';
set local role app_api;
select set_config('app.user_id','85000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from saphi.farms),0,'revoked membership takes effect without permission cache');
reset role;
update saphi.company_users set status='active'
 where company_id='87000000-0000-4000-8000-000000000001' and user_id='85000000-0000-4000-8000-000000000001';
update app.profiles set is_active=false where id='86000000-0000-4000-8000-000000000001';
set local role app_api;
select is((select count(*)::int from saphi.farms),0,'inactive global profile removes ceiling immediately');
reset role;
update app.profiles set is_active=true where id='86000000-0000-4000-8000-000000000001';
update saphi.companies set status='inactive' where id='87000000-0000-4000-8000-000000000001';
set local role app_api;
select is((select count(*)::int from saphi.farms),0,'inactive company denied');
select throws_ok($$select saphi.set_company_context('87000000-0000-4000-8000-000000000001')$$,'42501',null,'inactive company cannot initialize context');
reset role;
update saphi.companies set status='active' where id='87000000-0000-4000-8000-000000000001';
update app.users set status='inactive' where id='85000000-0000-4000-8000-000000000001';
set local role app_api;
select is((select count(*)::int from saphi.farms),0,'inactive actor denied despite both permission assignments');
reset role;
select ok(exists(select 1 from app.audit_log where event_type='saphi.farms.updated'
 and actor_user_id='85000000-0000-4000-8000-000000000001'
 and new_value->>'companyId'='87000000-0000-4000-8000-000000000001'),'master changes reuse audit chain with tenant metadata');
select is(app.verify_audit_chain(),null::bigint,'hash chain verifies after tenant operations');
select * from finish();
rollback;
