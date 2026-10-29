-- History follows sampling time, as specified by API12; masters retain creation order.
create index soil_samples_history_idx on saphi.soil_samples(company_id,sampled_at desc,id desc);
drop index saphi.soil_samples_page_idx;
