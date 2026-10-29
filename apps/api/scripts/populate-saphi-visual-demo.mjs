/** Idempotent, local-only data for readable Saphi demo tables. No production imports. */
import pg from 'pg';

if (process.env.NODE_ENV === 'production' || !process.argv.includes('--local-demo')) {
  throw new Error('Use --local-demo only with the local Supabase database.');
}

// Deliberately fixed to the local Supabase instance; never accept a URL from env or CLI.
const db = new pg.Client({ host: '127.0.0.1', port: 54322, database: 'postgres', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 5000 });
const root = '00000000-0000-0000-0000-000000000001';
const demoNames = ['DEMO Saphi Satelital GEE', 'DEMO Saphi Valle del Maule SpA', 'DEMO Saphi Valle de Curicó SpA', 'DEMO Saphi Valle de Colchagua SpA'];
const dates = ['2026-10-06T12:00:00Z', '2026-10-16T12:00:00Z', '2026-10-26T12:00:00Z'];

await db.connect();
try {
  await db.query('begin');
  await db.query("select pg_advisory_xact_lock(hashtext('saphi-visual-demo-v1'))");
  const identity = await db.query("select 1 from app.users u join app.user_identities i on i.user_id=u.id where u.id=$1 and u.email='superadmin@local.test' and i.provider='local' and i.cognito_sub='local-superadmin-sub'", [root]);
  if (identity.rowCount !== 1) throw new Error('Local demo identity missing; refusing to write.');
  const companies = await db.query('select id,legal_name from saphi.companies where legal_name=any($1::text[]) and created_by=$2', [demoNames, root]);
  if (companies.rowCount !== 3 || !companies.rows.some(row => row.legal_name === demoNames[0]) ||
    !companies.rows.some(row => row.legal_name === demoNames[1]) ||
    !companies.rows.some(row => row.legal_name === demoNames[2] || row.legal_name === demoNames[3])) {
    throw new Error('Expected three local demo companies; refusing to write.');
  }
  await db.query("select set_config('app.user_id',$1,true),set_config('saphi.request_id','saphi-visual-demo-v1',true),set_config('saphi.reason','DEMO LOCAL: datos ficticios para tablas y visor',true)", [root]);

  const geeCompany = companies.rows.find(row => row.legal_name === demoNames[0]);
  const geePlot = await db.query("select id from saphi.plots where company_id=$1 and code='DEMO-GEE-C1' and status='active'", [geeCompany.id]);
  if (geePlot.rowCount !== 1) throw new Error('GEE demo plot missing; refusing to write.');
  // Wider reference cluster for a more legible tile. These are illustrative points, not a parcel boundary.
  const additionalPoints = [
    [-71.6600, -35.4300], [-71.6500, -35.4300], [-71.6600, -35.4220],
    [-71.6500, -35.4220], [-71.6550, -35.4300], [-71.6550, -35.4220],
  ];
  for (const [index, coordinates] of additionalPoints.entries()) {
    await db.query(`insert into saphi.sampling_points(company_id,plot_id,code,location,status)
      values($1,$2,$3,$4::jsonb,'active') on conflict(company_id,code) do nothing`,
      [geeCompany.id, geePlot.rows[0].id, `DEMO-GEE-P${index + 4}`, JSON.stringify({ type: 'Point', coordinates })]);
  }

  const plots = await db.query(`select p.id,p.company_id,p.code from saphi.plots p
    where p.company_id=any($1::uuid[]) and p.code like 'DEMO-%' order by p.company_id,p.code`, [companies.rows.map(row => row.id)]);
  for (const plot of plots.rows) {
    const point = await db.query('select id from saphi.sampling_points where company_id=$1 and plot_id=$2 and status=\'active\' order by code limit 1', [plot.company_id, plot.id]);
    if (!point.rowCount) continue;
    for (const [index, date] of dates.entries()) {
      const suffix = `${index + 1}`;
      await db.query(`insert into saphi.soil_samples(company_id,plot_id,sampling_point_id,code,sampled_at,notes)
        values($1,$2,$3,$4,$5,$6) on conflict(company_id,code) do nothing`,
        [plot.company_id, plot.id, point.rows[0].id, `${plot.code}-DEMO-M${suffix}`, date, 'DEMO local · muestra ilustrativa sin análisis de laboratorio']);
      const sourceId = `DEMO-${plot.code}-2026-10-${['06', '16', '26'][index]}`;
      let observation = await db.query(`insert into saphi.satellite_observations
        (company_id,plot_id,provider_code,source_observation_id,product_reference,licence_reference,acquired_at,quality_code,coverage_text)
        values($1,$2,'demo.local',$3,'DEMO local: sin imagen asociada','DEMO local: sin licencia de producto satelital',$4,'demo','Registro ficticio para recorrer la tabla; no es una escena de Earth Engine')
        on conflict(company_id,plot_id,provider_code,source_observation_id) do nothing returning id`,
        [plot.company_id, plot.id, sourceId, date]);
      if (!observation.rowCount) observation = await db.query(`select id from saphi.satellite_observations
        where company_id=$1 and plot_id=$2 and provider_code='demo.local' and source_observation_id=$3`, [plot.company_id, plot.id, sourceId]);
      await db.query(`insert into saphi.satellite_assets(company_id,observation_id,source_asset_reference)
        values($1,$2,$3) on conflict(company_id,observation_id,source_asset_reference) do nothing`,
        [plot.company_id, observation.rows[0].id, `DEMO-NO-DOWNLOAD-${sourceId}`]);
    }
  }
  const totals = await db.query(`select c.legal_name,
    (select count(*)::int from saphi.sampling_points where company_id=c.id) points,
    (select count(*)::int from saphi.soil_samples where company_id=c.id) samples,
    (select count(*)::int from saphi.satellite_observations where company_id=c.id) observations
    from saphi.companies c where c.id=any($1::uuid[]) order by c.legal_name`, [companies.rows.map(row => row.id)]);
  await db.query('commit');
  console.log(JSON.stringify(totals.rows, null, 2));
} catch (error) {
  await db.query('rollback');
  throw error;
} finally {
  await db.end();
}
