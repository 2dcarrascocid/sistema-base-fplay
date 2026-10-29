/** Opt-in fixtures for the fixed local Supabase database. Never imported by production. */
import pg from 'pg';
import { computeRutCheckDigit } from '@base/shared';
import { SAPHI_PERMISSIONS } from '@base/saphi';

if (process.env['NODE_ENV'] === 'production' || !process.argv.includes('--local-demo')) {
  throw new Error('Use --local-demo exclusively with the local development environment.');
}
// Deliberately no URL/env override: this script cannot target a remote database.
const localConnection={host:'127.0.0.1',port:54322,database:'postgres',connectionTimeoutMillis:5000};
let db = new pg.Client({...localConnection,user:'postgres',password:'postgres'});
const root='00000000-0000-0000-0000-000000000001';
const uid=(n:number)=>`de400000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const implemented=SAPHI_PERMISSIONS.filter(p=>(/saphi\.(companies|memberships|farms|plots|samples|devices|telemetry|satellite|dashboard|indicators):/.test(p)
  &&p!=='saphi.companies:create')||p==='saphi.laboratory:view');
const read=implemented.filter(p=>p.endsWith(':view')&&!p.startsWith('saphi.memberships:'));
const operate=implemented.filter(p=>!p.startsWith('saphi.memberships:')&&p!=='saphi.companies:edit');
const reason='DEMO LOCAL Saphi: datos completos para recorrido funcional';
const people=[
  {id:uid(1),email:'gestora.saphi@local.test',first:'Camila',last:'Demo Gestora',keys:implemented},
  {id:uid(2),email:'operador.saphi@local.test',first:'Diego',last:'Demo Operador',keys:implemented},
  {id:uid(3),email:'consulta.saphi@local.test',first:'Valentina',last:'Demo Consulta',keys:read},
  {id:uid(4),email:'sinacceso.saphi@local.test',first:'Tomás',last:'Demo Sin acceso',keys:read},
];
async function actor(user:string,company?:string){
  await db.query("select set_config('app.user_id',$1,true),set_config('saphi.company_id','',true),set_config('saphi.request_id','saphi-local-demo-v1',true),set_config('saphi.reason',$2,true)",[user,reason]);
  if(company)await db.query('select saphi.set_company_context($1::uuid)',[company]);
}
async function member(company:string,user:string,keys:readonly string[],status='active'){
  // Administrative RPCs acquire their own company lock before setting context.
  await actor(user===uid(1)?root:uid(1),company);
  const existing=await db.query('select * from saphi.members($1::uuid) where user_id=$2::uuid',[company,user]);
  if(existing.rowCount){
    // Add new demo capabilities without removing any existing grants.
    const current=existing.rows[0];
    const granted=current.permissions as string[];
    const merged=[...new Set([...granted,...keys])];
    if(merged.length!==granted.length)await db.query('select saphi.set_member_permissions($1::uuid,$2::uuid,$3::bigint,$4::text[],$5)',[company,user,current.version,merged,reason]);
    return;
  }
  const result=await db.query('select * from saphi.set_membership($1::uuid,$2::uuid,0,$3,$4)',[company,user,status,reason]);
  if(keys.length)await db.query('select saphi.set_member_permissions($1::uuid,$2::uuid,$3::bigint,$4::text[],$5)',[company,user,result.rows[0].version,keys,reason]);
}
await db.connect();
try{
  await db.query('begin');
  await db.query("select pg_advisory_xact_lock(hashtext('saphi-local-demo-v1'))");
  const local=await db.query("select 1 from app.users u join app.user_identities i on i.user_id=u.id where u.id=$1 and u.email='superadmin@local.test' and i.provider='local' and i.cognito_sub='local-superadmin-sub'",[root]);
  if(local.rowCount!==1)throw new Error('Local seed identity missing: refusing to populate this database.');
  await db.query("select set_config('app.user_id',$1,true)",[root]);
  for(const person of people){
    const existing=await db.query('select id,email from app.users where id=$1 or email=$2',[person.id,person.email]);
    if(existing.rows.some(r=>r.id!==person.id||r.email!==person.email))throw new Error(`Demo identity collision: ${person.email}`);
    if(!existing.rowCount){
      await db.query(`insert into app.users(id,email,first_name,last_name,role_id,status,must_change_password,password_changed_at,mfa_enabled,locale,time_zone,job_title)
        values($1,$2,$3,$4,3,'active',false,now(),true,'es','America/Santiago','Demostración local Saphi')`,[person.id,person.email,person.first,person.last]);
      await db.query("insert into app.user_identities(user_id,provider,cognito_sub,provider_subject) values($1,'local',$2,$2)",[person.id,`saphi-demo-${person.id}`]);
    }
    const profileId=uid(person.id===uid(3)||person.id===uid(4)?102:101);
    const profileName=profileId===uid(101)?'DEMO Saphi gestión local':'DEMO Saphi consulta local';
    const profiles=await db.query('select id,name from app.profiles where id=$1 or lower(name)=lower($2)',[profileId,profileName]);
    if(profiles.rows.some(r=>r.id!==profileId||r.name!==profileName))throw new Error('Demo profile collision');
    if(!profiles.rowCount){
      await db.query('insert into app.profiles(id,name,description) values($1,$2,$3)',[profileId,profileName,'Datos ficticios locales para los módulos Saphi implementados.']);
    }
    await db.query(`insert into app.profile_permissions(profile_id,menu_action_id)
      select $1,ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
      where m.code||':'||a.code=any($2::text[]) on conflict do nothing`,[profileId,person.keys]);
    await db.query('insert into app.user_profiles(user_id,profile_id) values($1,$2) on conflict do nothing',[person.id,profileId]);
  }
  // Extend existing local demo memberships before using the scoped runtime connection.
  // The administration RPC intentionally forbids a manager from granting permissions
  // they do not yet hold, so this one-time fixture upgrade uses the guarded local owner.
  for(const [index,rutBody] of ['99000401','99000402'].entries()){
    const rut=`${rutBody}-${computeRutCheckDigit(rutBody)}`;
    const existing=(await db.query('select id from saphi.companies where rut=$1 and created_by=$2',[rut,root])).rows[0];
    if(!existing)continue;
    for(const [user,keys] of [[root,implemented],[uid(1),implemented],[uid(2),index===0?operate:read],[uid(3),read]] as const){
      await db.query(`insert into saphi.company_user_permissions(company_id,user_id,menu_action_id)
        select $1,$2,ma.id from app.menu_actions ma join app.menus m on m.id=ma.menu_id join app.actions a on a.id=ma.action_id
        where m.code||':'||a.code=any($3::text[]) and exists(select 1 from saphi.company_users where company_id=$1 and user_id=$2)
        on conflict do nothing`,[existing.id,user,keys]);
    }
  }
  await db.query('commit');
  await db.end();
  // The local owner intentionally cannot SET ROLE app_api. Use the real runtime login;
  // keep each company and its fixtures atomic without changing database role grants.
  db=new pg.Client({...localConnection,user:'app_api',password:'app_api_local'});
  await db.connect();
  const summaries=[];
  const counts=[];
  for(const [index,label] of ['Valle del Maule','Valle de Curicó'].entries()){
    await db.query('begin');
    await db.query("select pg_advisory_xact_lock(hashtext('saphi-local-demo-v1'))");
    const rutBody=String(99000401+index);
    const rut=`${rutBody}-${computeRutCheckDigit(rutBody)}`;
    await actor(root);
    let company=(await db.query('select id,legal_name,created_by,version from saphi.companies where rut=$1',[rut])).rows[0];
    const legalName=`DEMO Saphi ${label} SpA`;
    const legacyName=index===1?'DEMO Saphi Valle de Colchagua SpA':legalName;
    if(company&&(![legalName,legacyName].includes(company.legal_name)||company.created_by!==root))throw new Error(`Demo company collision: ${rut}`);
    if(!company)company=(await db.query(`select * from saphi.bootstrap_company($1,$2,$3,$4,null,$5::uuid,$6::text[],$7)`,
      [rut,legalName,`DEMO ${label}`,`demo.valle${index+1}@local.test`,uid(1),implemented,reason])).rows[0];
    const companyId=company.id as string;
    await member(companyId,root,implemented);
    if(company.legal_name!==legalName){
      await actor(root,companyId);
      await db.query('select saphi.update_company($1::uuid,$2::bigint,$3::jsonb,$4)',[companyId,company.version,JSON.stringify({legalName,tradeName:`DEMO ${label}`}),reason]);
    }
    await member(companyId,uid(1),implemented);
    await member(companyId,uid(2),index===0?operate:read);
    await member(companyId,uid(3),read);
    if(index===0)await member(companyId,uid(4),[],'inactive');
    await actor(uid(1),companyId);
    const farmNames=index===0?['Los Maitenes','Santa Aurora','El Arrayán']:['La Estrella','Los Aromos','El Molino'];
    for(let f=0;f<3;f++){
      const farmCode=`DEMO-P${f+1}`;
      let farm=(await db.query(`insert into saphi.farms(company_id,code,name,area_ha,status) values($1,$2,$3,$4,$5)
        on conflict(company_id,code) do nothing returning id`,[companyId,farmCode,`DEMO ${farmNames[f]}`,String(30+f*12),f===2?'inactive':'active'])).rows[0];
      farm??=(await db.query('select id from saphi.farms where company_id=$1 and code=$2',[companyId,farmCode])).rows[0];
      for(let p=0;p<2;p++){
        const plotCode=`DEMO-P${f+1}-C${p+1}`;
        let plot=(await db.query(`insert into saphi.plots(company_id,farm_id,code,name,area_ha,grape_variety,planting_year,soil_type,status)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(company_id,code) do nothing returning id`,
          [companyId,farm.id,plotCode,`DEMO Cuartel ${f+1}.${p+1}`,String(8+f*2+p),['Cabernet Sauvignon','Carménère'][p],2014+f+p,['Franco','Franco arcilloso'][p],f===2?'inactive':'active'])).rows[0];
        plot??=(await db.query('select id from saphi.plots where company_id=$1 and code=$2',[companyId,plotCode])).rows[0];
        const [baseLongitude,baseLatitude]=index===0?[-71.7400,-35.3900]:[-71.3300,-35.0500];
        for(let s=0;s<6;s++){
          // Small, coherent clusters near Talca and Curicó in Región del Maule; illustrative only.
          const longitude=Number((baseLongitude+f*0.012+p*0.002+s*0.00018).toFixed(6));
          const latitude=Number((baseLatitude+f*0.007+p*0.002+s*0.00016).toFixed(6));
          await db.query(`insert into saphi.sampling_points(company_id,plot_id,code,location,status) values($1,$2,$3,$4::jsonb,$5)
            on conflict(company_id,code) do update set location=excluded.location
            where saphi.sampling_points.location is distinct from excluded.location`,[companyId,plot.id,`${plotCode}-M${s+1}`,JSON.stringify({type:'Point',coordinates:[longitude,latitude]}),f===2||s===5?'inactive':'active']);
        }
        const point=(await db.query('select id from saphi.sampling_points where company_id=$1 and code=$2',[companyId,`${plotCode}-M1`])).rows[0];
        for(const [sampleIndex,sampledAt] of ['2026-10-20T12:00:00Z','2026-10-24T14:30:00Z','2026-10-27T09:15:00Z'].entries()){
          await db.query(`insert into saphi.soil_samples(company_id,plot_id,sampling_point_id,code,sampled_at,notes)
            values($1,$2,$3,$4,$5,$6) on conflict(company_id,code) do nothing`,
            [companyId,plot.id,point.id,`${plotCode}-S${sampleIndex+1}`,sampledAt,'DEMO local · muestra ficticia sin resultado de laboratorio']);
        }
        await db.query(`insert into saphi.devices(company_id,plot_id,code,provider_code,external_device_id,status,metadata)
          values($1,$2,$3,'aws.iot',$4,$5,$6::jsonb) on conflict(company_id,code) do nothing`,
          [companyId,plot.id,`${plotCode}-D1`,`demo-${index+1}-${f+1}-${p+1}`,f===2?'inactive':'active',JSON.stringify({manufacturer:'DEMO local',model:'Simulador'})]);
      }
    }
    counts.push((await db.query(`select
      (select count(*) from saphi.farms where company_id=$1) farms,
      (select count(*) from saphi.plots where company_id=$1) plots,
      (select count(*) from saphi.sampling_points where company_id=$1) points`,[companyId])).rows[0]);
    await db.query('commit');
    summaries.push({companyId,name:legalName,url:`http://localhost:5173/saphi/companies/${companyId}`});
  }
  await db.end();
  // Machine-only and catalogue tables have no human INSERT grants. Populate them only
  // in this guarded local fixture phase; every source reference is explicitly DEMO.
  db=new pg.Client({...localConnection,user:'postgres',password:'postgres'});
  await db.connect();
  await db.query('begin');
  await db.query("select pg_advisory_xact_lock(hashtext('saphi-local-demo-v1'))");
  await db.query("select set_config('app.user_id',$1,true),set_config('saphi.request_id','saphi-local-demo-v2',true),set_config('saphi.reason',$2,true)",[root,reason]);
  const demoCompanies=(await db.query("select id from saphi.companies where legal_name in ('DEMO Saphi Valle del Maule SpA','DEMO Saphi Valle de Curicó SpA') and created_by=$1",[root])).rows;
  for(const {id:companyId} of demoCompanies){
    const fixtures=(await db.query(`select d.id device_id,d.external_device_id,d.status,p.id plot_id,p.code plot_code
      from saphi.devices d join saphi.plots p on p.id=d.plot_id and p.company_id=d.company_id
      where d.company_id=$1 and d.code like 'DEMO-P%-D1'`,[companyId])).rows;
    for(const [n,row] of fixtures.entries()){
      let observation=(await db.query(`insert into saphi.satellite_observations
        (company_id,plot_id,provider_code,source_observation_id,product_reference,licence_reference,acquired_at,quality_code,coverage_text)
        values($1,$2,'demo.local',$3,'DEMO local sin imagen','DEMO: sin licencia de producto satelital','2026-10-18T12:00:00Z','demo','Cobertura ficticia para recorrido local')
        on conflict(company_id,plot_id,provider_code,source_observation_id) do nothing returning id`,
        [companyId,row.plot_id,`demo-${row.plot_code}`])).rows[0];
      observation??=(await db.query(`select id from saphi.satellite_observations
        where company_id=$1 and plot_id=$2 and provider_code='demo.local' and source_observation_id=$3`,
        [companyId,row.plot_id,`demo-${row.plot_code}`])).rows[0];
      await db.query(`insert into saphi.satellite_assets(company_id,observation_id,source_asset_reference)
        values($1,$2,$3) on conflict(company_id,observation_id,source_asset_reference) do nothing`,
        [companyId,observation.id,`DEMO-NO-DOWNLOAD-${row.plot_code}`]);
      if(row.status!=='active')continue;
      let binding=(await db.query(`insert into saphi.iot_bindings(company_id,device_id,account_id,principal,client_id,external_device_id,topic,temperature_metric,max_past_seconds,max_future_seconds)
        values($1,$2,'000000000000',$3,$4,$5,$6,'soil_temperature',31536000,300)
        on conflict(device_id) do nothing returning id,version`,
        [companyId,row.device_id,'d'.repeat(64),`demo-${row.external_device_id}`,row.external_device_id,`demo/${row.external_device_id}`])).rows[0];
      binding??=(await db.query('select id,version from saphi.iot_bindings where device_id=$1',[row.device_id])).rows[0];
      const messageId=`de600000-0000-4000-8000-${String(n+1+summaries.length*100).padStart(12,'0')}`;
      const hash='e'.repeat(64);
      await db.query(`insert into saphi.iot_receipts(binding_id,id,payload_hash,source)
        values($1,$2,$3,'simulator') on conflict(binding_id,id) do nothing`,[binding.id,messageId,hash]);
      await db.query(`insert into saphi.sensor_readings(company_id,device_id,source_message_id,sample_index,metric_code,value,unit_code,observed_at,quality_code,payload_hash,binding_version)
        values($1,$2,$3,0,'soil_moisture',$4,'%','2026-10-20T12:00:00Z','demo',$5,$6)
        on conflict(company_id,device_id,source_message_id,sample_index) do nothing`,
        [companyId,row.device_id,messageId,Number(22+n*1.5).toFixed(1),hash,binding.version]);
    }
  }
  const companyIds=summaries.map(item=>item.companyId);
  const tableNames=['companies','company_users','company_user_permissions','farms','plots','sampling_points','soil_samples',
    'devices','sensor_readings','satellite_observations','satellite_assets','iot_bindings','iot_receipts'] as const;
  const inventory:Record<string,number>={};
  for(const table of tableNames){
    const relation=table==='iot_receipts'
      ?`select count(*)::int as total from saphi.iot_receipts r join saphi.iot_bindings b on b.id=r.binding_id where b.company_id=any($1::uuid[])`
      :`select count(*)::int as total from saphi.${table} where ${table==='companies'?'id':'company_id'}=any($1::uuid[])`;
    inventory[table]=(await db.query(relation,[companyIds])).rows[0].total;
    if(inventory[table]===0)throw new Error(`Incomplete local demo: saphi.${table} is empty`);
  }
  await db.query('commit');
  console.log(JSON.stringify({companies:summaries,counts,inventory,users:people.map(p=>({id:p.id,email:p.email})),note:'Demo local cargada; coordenadas DEMO actualizadas y demás registros repetibles.'},null,2));
}catch(error){await db.query('rollback');throw error;}
finally{await db.end();}
