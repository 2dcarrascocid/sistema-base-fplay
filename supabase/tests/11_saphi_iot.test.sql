begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Test-local impersonation only, rolled back below; production role grants stay unchanged.
grant app_api to postgres with set true, inherit false;
grant usage on schema extensions to app_api;
do $$ begin
 execute format('grant all on all tables in schema %I to app_api',pg_my_temp_schema()::regnamespace);
 execute format('grant all on all sequences in schema %I to app_api',pg_my_temp_schema()::regnamespace);
end $$;
select ok(has_table_privilege('app_api','saphi.devices','SELECT'),'runtime device read');
select ok(has_column_privilege('app_api','saphi.devices','metadata','UPDATE'),'runtime device metadata edit');
select ok(not has_column_privilege('app_api','saphi.devices','external_device_id','UPDATE'),'external identity not editable');
select ok(not has_table_privilege('app_api','saphi.devices','DELETE'),'no device deletes');
select ok(not has_table_privilege('app_api','saphi.sensor_readings','INSERT'),'human API cannot ingest');
select ok(not has_table_privilege('app_api','saphi.sensor_readings','UPDATE'),'readings cannot be overwritten');
select ok(not has_table_privilege('app_api','saphi.sensor_readings','DELETE'),'readings cannot be deleted');
select ok(not has_table_privilege('app_auth','saphi.sensor_readings','SELECT'),'auth role has no telemetry');
select ok(saphi.valid_device_metadata('{"model":"Example"}'),'bounded metadata allowed');
select ok(not saphi.valid_device_metadata('{"token":"no"}'),'secret-like field names rejected');
select ok(not saphi.valid_device_metadata('42'),'scalar metadata safely rejected');
select has_index('saphi','sensor_readings','sensor_readings_history_idx','history index');
select has_index('saphi','sensor_readings','sensor_readings_metric_idx','per metric index');

select set_config('app.user_id','00000000-0000-0000-0000-000000000001',true);
insert into saphi.companies(id,rut,legal_name) values
 ('e6000000-0000-4000-8000-000000000001','22222222-2','IoT A'),('e6000000-0000-4000-8000-000000000002','33333333-3','IoT B');
insert into saphi.company_users(company_id,user_id) values('e6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001');
insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
 select 'e6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001',ma.id
 from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
 where m.code in ('saphi.devices','saphi.telemetry') and a.code='view';
insert into saphi.farms(id,company_id,code,name) values
 ('e6100000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','F','Farm'),
 ('e6100000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000002','F','Farm');
insert into saphi.plots(id,company_id,farm_id,code,name) values
 ('e6200000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001','P','Plot'),
 ('e6200000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000002','e6100000-0000-4000-8000-000000000002','P','Plot');
insert into saphi.devices(id,company_id,plot_id,code,provider_code,external_device_id) values
 ('e6300000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000001','D','test.provider','shared-info'),
 ('e6300000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000002','e6200000-0000-4000-8000-000000000002','D','test.provider','shared-info');
select throws_ok($$update saphi.devices set external_device_id='changed' where id='e6300000-0000-4000-8000-000000000001'$$,'42501',null,'owner cannot silently reassign device identity');
select throws_ok($$update saphi.devices set metadata='{"password":"x"}' where id='e6300000-0000-4000-8000-000000000001'$$,'23514',null,'database also rejects unknown metadata');
insert into saphi.sensor_readings(company_id,device_id,source_message_id,sample_index,metric_code,value,unit_code,observed_at,payload_hash,binding_version) values
 ('e6000000-0000-4000-8000-000000000001','e6300000-0000-4000-8000-000000000001','m1',0,'test.metric',1.234567890123456789,'test.unit','2026-10-01T00:00:00Z',repeat('a',64),1),
 ('e6000000-0000-4000-8000-000000000002','e6300000-0000-4000-8000-000000000002','m1',0,'test.metric',2,'test.unit','2026-10-01T00:00:00Z',repeat('b',64),1);
select throws_ok($$insert into saphi.sensor_readings(company_id,device_id,source_message_id,sample_index,metric_code,value,unit_code,observed_at,payload_hash,binding_version)
 values('e6000000-0000-4000-8000-000000000001','e6300000-0000-4000-8000-000000000001','m1',0,'test.metric',1,'test.unit',now(),repeat('a',64),1)$$,'23505',null,'stable message/index identity deduplicates structurally');
select throws_ok($$insert into saphi.sensor_readings(company_id,device_id,source_message_id,sample_index,metric_code,value,unit_code,observed_at,payload_hash,binding_version)
 values('e6000000-0000-4000-8000-000000000001','e6300000-0000-4000-8000-000000000002','cross',0,'test.metric',1,'test.unit',now(),repeat('a',64),1)$$,'23503',null,'device cannot cross companies');
select throws_ok($$insert into saphi.sensor_readings(company_id,device_id,source_message_id,sample_index,metric_code,value,unit_code,observed_at,payload_hash,binding_version)
 values('e6000000-0000-4000-8000-000000000001','e6300000-0000-4000-8000-000000000001','nan',0,'test.metric','NaN','test.unit',now(),repeat('a',64),1)$$,'23514',null,'numeric NaN rejected');
set local role app_api;
select saphi.set_company_context('e6000000-0000-4000-8000-000000000001');
select is((select count(*)::int from saphi.devices),1,'device RLS shows own company only');
select is((select count(*)::int from saphi.sensor_readings),1,'reading RLS shows own company only');
select is((select value::text from saphi.sensor_readings),'1.234567890123456789','decimal precision preserved');
select throws_ok($$update saphi.sensor_readings set value=99$$,'42501',null,'runtime cannot correct readings by overwrite');
reset role;
select is(app.verify_audit_chain(),null::bigint,'device changes preserve immutable audit chain');
select * from finish();
rollback;
