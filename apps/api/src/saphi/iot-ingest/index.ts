import {createDb} from '../../lib/db.js';
import {getJsonSecret} from '../../lib/aws/services.js';
import {ingest,postgresIngestionStore} from '../integrations/iot/ingest.js';
const required=(key:string)=>{const value=process.env[key];if(!value)throw new Error('IOT_CONFIGURATION_REQUIRED');return value;};
async function connect(){
  const secret=await getJsonSecret(required('IOT_DB_SECRET_ARN'));
  if(secret['username']!=='saphi_ingest'||!secret['password'])throw new Error('IOT_SERVICE_IDENTITY_REQUIRED');
  return postgresIngestionStore(createDb({host:required('DB_HOST'),port:Number(required('DB_PORT')),database:required('DB_NAME'),
    user:'saphi_ingest',password:secret['password'],ssl:true,...(secret['ca']?{ca:secret['ca']}:{})}));
}
let store:ReturnType<typeof connect>|undefined;
/** No API Gateway event, Cognito dependency or human actor; only the restricted IoT invocation. */
export async function handler(event:unknown){
  store??=connect().catch(()=>{store=undefined;throw new Error('IOT_CONFIGURATION_UNAVAILABLE');});
  const result=await ingest(event,await store);
  console.info(JSON.stringify({event:'saphi.iot.ingestion',...result}));
  return result;
}
