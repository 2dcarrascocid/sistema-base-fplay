begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant app_api to postgres with set true, inherit false;
grant usage on schema extensions to app_api;
create temp table saphi_test_company(id uuid);
do $$ begin
 execute format('grant all on all tables in schema %I to app_api',pg_my_temp_schema()::regnamespace);
 execute format('grant all on all sequences in schema %I to app_api',pg_my_temp_schema()::regnamespace);
end $$;

select set_config('app.user_id','',true);
select set_config('saphi.company_id','',true);
insert into app.users(id,email,first_name,last_name,role_id,status) values
 ('91000000-0000-4000-8000-000000000001','saphi.manager.sql@test.cl','Manager','SQL',3,'active'),
 ('91000000-0000-4000-8000-000000000002','saphi.recipient.sql@test.cl','Recipient','SQL',3,'active');
insert into app.profiles(id,name) values('92000000-0000-4000-8000-000000000001','Saphi SQL administration fixtures');
insert into app.profile_permissions(profile_id,menu_action_id)
 select '92000000-0000-4000-8000-000000000001',ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id where m.code like 'saphi.%';
insert into app.user_profiles(user_id,profile_id) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001');

select ok(not has_function_privilege('app_api','saphi.resolve_permission_keys(text[])','EXECUTE'),'internal resolver not exposed');
select ok(not has_function_privilege('app_api','saphi.admin_context(uuid)','EXECUTE'),'internal admin lock not exposed');
select ok(not has_function_privilege('app_api','saphi.ensure_manager(uuid)','EXECUTE'),'manager count guard not exposed');
select ok(not has_function_privilege('app_api','saphi.audit_administration(uuid,uuid,text,text,jsonb,jsonb)','EXECUTE'),'no arbitrary audit writer exposed');
select ok(has_function_privilege('app_api','saphi.bootstrap_company(text,text,text,text,text,uuid,text[],text)','EXECUTE'),'bootstrap has narrow runtime entry');
select ok(not has_table_privilege('app_api','saphi.company_users','UPDATE'),'administration does not grant raw membership DML');

set local role app_api;
select set_config('app.user_id','00000000-0000-0000-0000-000000000001',true);
select throws_ok($$select saphi.bootstrap_company('12345678-5','A',null,null,null,'00000000-0000-0000-0000-000000000001',array['saphi.companies:view'],'Self')$$,
 '42501',null,'bootstrap cannot assign the actor');
select throws_ok($$select saphi.bootstrap_company('12345678-5','A',null,null,null,'91000000-0000-4000-8000-000000000001',array['saphi.companies:view'],'Reason')$$,
 '22023',null,'initial member must be a real manager');
select throws_ok($$select saphi.bootstrap_company('12345678-5','A',null,null,null,'91000000-0000-4000-8000-000000000002',array['saphi.companies:view','saphi.memberships:view','saphi.memberships:edit'],'Reason')$$,
 '42501',null,'recipient must have global ceiling');
select throws_ok($$select saphi.bootstrap_company('12345678-5','A',null,null,null,'91000000-0000-4000-8000-000000000001',array['saphi.companies:view','saphi.memberships:view','saphi.memberships:edit'],'')$$,
 '22023',null,'reason required in database too');
select throws_ok($$select saphi.bootstrap_company('12345678-5','A',null,null,null,'91000000-0000-4000-8000-000000000001',array['security.users:view'],'Reason')$$,
 '22023',null,'foreign permission definitions rejected');
select lives_ok($$insert into pg_temp.saphi_test_company select (saphi.bootstrap_company('12345678-5','A',null,null,null,
 '91000000-0000-4000-8000-000000000001',array['saphi.companies:view','saphi.companies:edit','saphi.memberships:view','saphi.memberships:edit','saphi.farms:view'],'Reason')).id$$,
 'bootstrap atomically creates company, member and scoped grants');
select is((select count(*)::int from saphi.companies where id=(select id from pg_temp.saphi_test_company)),0,'creator has no automatic company membership');
select throws_ok($$select saphi.set_membership((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',0,'active','Add')$$,
 '42501',null,'superuser without membership cannot administer company');
select set_config('app.user_id','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$select saphi.bootstrap_company('11111111-1','B',null,null,null,'91000000-0000-4000-8000-000000000002',array['saphi.companies:view'],'Reason')$$,
 '42501',null,'business manager cannot bootstrap platform company');
select throws_ok($$select saphi.set_membership((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000001',1,'inactive','Self')$$,
 '42501',null,'no self revocation');
select lives_ok($$select saphi.set_membership((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',0,'active','Add')$$,
 'manager can add an existing active user without permissions');
select throws_ok($$select saphi.set_member_permissions((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',1,array['saphi.companies:view'],'Grant')$$,
 '42501',null,'scope cannot exceed recipient global ceiling');
select throws_ok($$select saphi.set_member_permissions((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000001',1,array['saphi.companies:view'],'Self')$$,
 '42501',null,'no self permission changes');
select throws_ok($$select saphi.set_membership((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',99,'inactive','Stale')$$,
 'P0001','SAPHI_VERSION_CONFLICT','membership version checked in database');
select throws_ok($$select saphi.update_company((select id from pg_temp.saphi_test_company),1,'{"status":"inactive"}','Close')$$,
 '42501',null,'ordinary manager cannot deactivate a company');
select lives_ok($$select saphi.update_company((select id from pg_temp.saphi_test_company),1,'{"legalName":"Updated"}','Rename')$$,
 'company edit remains possible with scoped grant');
select throws_ok($$select saphi.update_company((select id from pg_temp.saphi_test_company),1,'{"legalName":"Stale"}','Rename')$$,
 'P0001','SAPHI_VERSION_CONFLICT','company version checked');
select throws_ok($$select saphi.update_company((select id from pg_temp.saphi_test_company),2,'{"rut":"11111111-1"}','Change')$$,
 '22023',null,'company identity is immutable');
reset role;
insert into app.user_profiles(user_id,profile_id) values('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001');
set local role app_api;
select lives_ok($$select saphi.set_member_permissions((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',1,array['saphi.companies:view','saphi.farms:view'],'Grant')$$,
 'grant succeeds within both ceilings');
select throws_ok($$select saphi.set_member_permissions((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',2,array['saphi.farms:view','saphi.farms:create'],'Grant')$$,
 '42501',null,'grant cannot exceed actor company scope even if global ceiling allows it');
select throws_ok($$select saphi.set_member_permissions((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',2,array['saphi.farms:view','saphi.farms:view'],'Duplicate')$$,
 '22023',null,'duplicate grant keys rejected');
select lives_ok($$select saphi.set_membership((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',2,'inactive','Revoke')$$,'revocation succeeds');
select lives_ok($$select saphi.set_membership((select id from pg_temp.saphi_test_company),'91000000-0000-4000-8000-000000000002',3,'active','Reactivate')$$,'reactivation revalidates conserved grants');
select is((select count(*)::int from saphi.members((select id from pg_temp.saphi_test_company))),2,'minimal tenant member projection');
reset role;
select throws_ok($$delete from saphi.company_user_permissions where company_id=(select id from pg_temp.saphi_test_company)
 and user_id='91000000-0000-4000-8000-000000000001'; select saphi.ensure_manager((select id from pg_temp.saphi_test_company))$$,
 'P0001','SAPHI_LAST_MANAGER','last manager invariant verified atomically');
select is(app.verify_audit_chain(),null::bigint,'administrative audit preserves hash chain');
select ok(exists(select 1 from app.audit_log where event_type='saphi.permissions.changed' and new_value->>'reason'='Grant'),'permission decisions have reasons in existing audit');
select * from finish();
rollback;
