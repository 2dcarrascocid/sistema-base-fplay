begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
grant app_api to postgres with set true, inherit false;
grant usage on schema extensions to app_api;
do $$ begin
 execute format('grant all on all tables in schema %I to app_api',pg_my_temp_schema()::regnamespace);
 execute format('grant all on all sequences in schema %I to app_api',pg_my_temp_schema()::regnamespace);
end $$;
select ok(has_table_privilege('app_api','saphi.satellite_observations','SELECT'),'observation read is granted');
select ok(not has_table_privilege('app_api','saphi.satellite_observations','INSERT'),'no human observation ingestion');
select ok(not has_table_privilege('app_api','saphi.satellite_observations','UPDATE'),'no observation overwrite');
select ok(not has_table_privilege('app_api','saphi.satellite_observations','DELETE'),'no observation delete');
select ok(has_column_privilege('app_api','saphi.satellite_assets','id','SELECT'),'opaque asset ID readable');
select ok(not has_column_privilege('app_api','saphi.satellite_assets','source_asset_reference','SELECT'),'raw source asset reference private at SQL level');
select ok(not has_table_privilege('app_api','saphi.satellite_assets','INSERT'),'no human asset ingestion');
select ok(not has_table_privilege('app_auth','saphi.satellite_observations','SELECT'),'auth runtime cannot read observations');
select has_index('saphi','satellite_observations','satellite_observations_history_idx','acquisition history index exists');

select set_config('app.user_id','00000000-0000-0000-0000-000000000001',true);
insert into saphi.companies(id,rut,legal_name) values
 ('e7000000-0000-4000-8000-000000000001','44444444-4','Satellite A'),('e7000000-0000-4000-8000-000000000002','55555555-5','Satellite B');
insert into saphi.company_users(company_id,user_id) values('e7000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001');
insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
 select 'e7000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001',ma.id
 from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
 where m.code in ('saphi.satellite','saphi.plots') and a.code='view';
insert into saphi.farms(id,company_id,code,name) values
 ('e7100000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','F','Farm'),
 ('e7100000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000002','F','Farm');
insert into saphi.plots(id,company_id,farm_id,code,name) values
 ('e7200000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','e7100000-0000-4000-8000-000000000001','P','Plot'),
 ('e7200000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000002','e7100000-0000-4000-8000-000000000002','P','Plot');
insert into saphi.satellite_observations(id,company_id,plot_id,provider_code,source_observation_id,product_reference,licence_reference,acquired_at) values
 ('e7300000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','e7200000-0000-4000-8000-000000000001','test.provider','origin','test.product.v1','test.licence','2026-10-01T00:00:00Z'),
 ('e7300000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000002','e7200000-0000-4000-8000-000000000002','test.provider','origin','test.product.v1','test.licence','2026-10-01T00:00:00Z');
insert into saphi.satellite_assets(id,company_id,observation_id,source_asset_reference) values
 ('e7400000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000001','private-origin-A'),
 ('e7400000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000002','e7300000-0000-4000-8000-000000000002','private-origin-B');
select throws_ok($$insert into saphi.satellite_assets(company_id,observation_id,source_asset_reference) values('e7000000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000002','cross')$$,'23503',null,'asset cannot reference a foreign company observation');
select throws_ok($$insert into saphi.satellite_assets(company_id,observation_id,source_asset_reference) values('e7000000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000001','private-origin-A')$$,'23505',null,'asset reference uniqueness preserves identity');
select throws_ok($$insert into saphi.satellite_observations(company_id,plot_id,provider_code,source_observation_id,product_reference,licence_reference,acquired_at) values('e7000000-0000-4000-8000-000000000001','e7200000-0000-4000-8000-000000000001','test.provider','origin','test.product.v1','test.licence',now())$$,'23505',null,'source observation identity unique within plot/provider');
select throws_ok($$insert into saphi.satellite_observations(company_id,plot_id,provider_code,source_observation_id,product_reference,licence_reference,acquired_at) values('e7000000-0000-4000-8000-000000000001','e7200000-0000-4000-8000-000000000001','test.provider','bad-time','test.product.v1','test.licence','infinity')$$,'23514',null,'acquisition instant finite');
set local role app_api;
select saphi.set_company_context('e7000000-0000-4000-8000-000000000001');
select is((select count(*)::int from saphi.satellite_observations),1,'observations tenant isolation');
select is((select count(id)::int from saphi.satellite_assets),1,'asset IDs tenant isolation');
select throws_ok($$select source_asset_reference from saphi.satellite_assets$$,'42501',null,'even own private asset reference cannot be selected');
select throws_ok($$update saphi.satellite_observations set product_reference='altered'$$,'42501',null,'runtime cannot overwrite products');
reset role;
select is(app.verify_audit_chain(),null::bigint,'catalogue test leaves audit chain intact');
select * from finish();
rollback;
