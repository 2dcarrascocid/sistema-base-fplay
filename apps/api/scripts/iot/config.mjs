import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {X509Certificate,createPrivateKey,createPublicKey} from 'node:crypto';
export const apiRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export function configuration(env=process.env){
  const host=env.API_AWS_IOT;
  if(!host||!/^[a-z0-9-]+\.iot\.us-east-1\.amazonaws\.com$/.test(host))throw new Error('API_AWS_IOT must be an AWS IoT hostname in us-east-1');
  const deviceId=env.IOT_DEVICE_ID||'sensor-piloto-001';
  if(!/^[a-zA-Z0-9:_-]{1,128}$/.test(deviceId))throw new Error('Invalid IOT_DEVICE_ID');
  if(env.IOT_CLIENT_ID&&!/^[a-zA-Z0-9:_-]{1,128}$/.test(env.IOT_CLIENT_ID))throw new Error('Invalid IOT_CLIENT_ID');
  const topic=(env.IOT_TOPIC||'sensores/telemetria').replace('{deviceId}',deviceId);
  if(!['sensores/telemetria',`sensores/${deviceId}/telemetria`].includes(topic))throw new Error('Unsupported pilot topic');
  const mode=env.IOT_MODE||'check';if(!['check','publish'].includes(mode))throw new Error('IOT_MODE must be check or publish');
  const integer=(key,fallback,min,max)=>{const n=Number(env[key]??fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Invalid ${key}`);return n;};
  const number=(key,fallback)=>{const n=Number(env[key]??fallback);if(!Number.isFinite(n))throw new Error(`Invalid ${key}`);return n;};
  return {host,deviceId,clientId:env.IOT_CLIENT_ID||deviceId,topic,mode,
    intervalMs:integer('IOT_INTERVAL_MS',10000,1000,3600000),maxMessages:integer('IOT_MAX_MESSAGES',1,1,10000),
    temperature:number('IOT_TEMPERATURE',19.5),soilMoisture:number('IOT_SOIL_MOISTURE',28.4)};
}
export function certificates(folder=resolve(apiRoot,'iot')){
  const names=readdirSync(folder);
  const one=suffix=>{const found=names.filter(n=>n.endsWith(suffix));if(found.length!==1)throw new Error('Expected exactly one device certificate/key');return resolve(folder,found[0]);};
  const cert=one('-certificate.pem.crt'),key=one('-private.pem.key'),ca=resolve(folder,'AmazonRootCA1.pem');
  for(const file of [cert,key,ca])if(!statSync(file).isFile()||statSync(file).size===0)throw new Error('Certificate file missing or empty');
  const x509=new X509Certificate(readFileSync(cert));
  const now=Date.now();if(now<Date.parse(x509.validFrom)||now>Date.parse(x509.validTo))throw new Error('Device certificate outside validity period');
  if(!x509.publicKey.equals(createPublicKey(createPrivateKey(readFileSync(key)))))throw new Error('Certificate and private key do not match');
  return {cert,key,ca};
}
