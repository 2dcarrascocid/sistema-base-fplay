// Explicit trusted local administration, never a public API or device-selected tenant.
import {parseArgs} from 'node:util';
import {loadEnvFile} from 'node:process';
import {resolve} from 'node:path';
import pg from 'pg';
import {apiRoot,configuration,certificates} from './config.mjs';
import {basename} from 'node:path';
const {values}=parseArgs({options:{'local-iot':{type:'boolean'},device:{type:'string'},company:{type:'string'},account:{type:'string'},
 'temperature-kind':{type:'string'},'max-past-seconds':{type:'string'},'max-future-seconds':{type:'string'}}});
try{
 if(!values['local-iot']||process.env.NODE_ENV==='production')throw new Error('Local administration only');
 loadEnvFile(resolve(apiRoot,'.env'));
 const url=new URL(process.env.IOT_ADMIN_DATABASE_URL||'');
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.port!=='54322')throw new Error('Local database on port 54322 required');
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!uuid.test(values.device||'')||!uuid.test(values.company||'')||!/^\d{12}$/.test(values.account||''))throw new Error('Explicit device, company and account required');
 const kinds={unspecified:'temperature.unspecified',air:'air_temperature',soil:'soil_temperature'};
 const metric=kinds[values['temperature-kind']];if(!metric)throw new Error('Temperature kind must be explicitly air, soil or unspecified');
 const past=Number(values['max-past-seconds']),future=Number(values['max-future-seconds']);
 if(!Number.isInteger(past)||past<1||past>31536000||!Number.isInteger(future)||future<0||future>86400)throw new Error('Explicit clock policy required');
 const config=configuration(),files=certificates();const principal=basename(files.cert).replace('-certificate.pem.crt','');
 if(!/^[a-f0-9]{64}$/.test(principal))throw new Error('Certificate identifier must match the AWS certificate file name');
 const client=new pg.Client({connectionString:url.toString()});await client.connect();
 try{
  await client.query('begin');
  const device=await client.query("select id from saphi.devices where id=$1 and company_id=$2 and external_device_id=$3 and provider_code='aws.iot' and status='active' for share",[values.device,values.company,config.deviceId]);
  if(device.rowCount!==1)throw new Error('Device must already be registered in the selected company by an authorized user');
  const result=await client.query(`insert into saphi.iot_bindings(company_id,device_id,account_id,principal,client_id,external_device_id,topic,temperature_metric,max_past_seconds,max_future_seconds)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,[values.company,values.device,values.account,principal,config.clientId,config.deviceId,config.topic,metric,past,future]);
  await client.query('commit');console.info(JSON.stringify({status:'binding_created',id:result.rows[0].id}));
 }catch{await client.query('rollback');throw new Error('Binding rejected');}finally{await client.end();}
}catch{console.error('Binding not created. Check explicit options, local admin access and existing device. No secrets logged.');process.exitCode=1;}
