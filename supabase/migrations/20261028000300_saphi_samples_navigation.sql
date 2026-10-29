-- Phase 5: immutable samples already have RLS, INSERT-only grants and composite FKs.
create index soil_samples_page_idx on saphi.soil_samples(company_id,created_at desc,id desc);
-- Keep the existing point bridge; the Sampling menu now opens samples and links to points.
update app.menus set route='/saphi/samples' where code='saphi.samples';
