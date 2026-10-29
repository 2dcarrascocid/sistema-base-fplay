-- Place the company membership maintainer after the operational Saphi sections.
update app.menus set sort_order = 130
where code = 'saphi.memberships' and sort_order <> 130;
