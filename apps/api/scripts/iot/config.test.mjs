import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuration,certificates,apiRoot} from './config.mjs';
import {resolve} from 'node:path';
import {publishDemo} from './publisher.mjs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
const base={API_AWS_IOT:'test-ats.iot.us-east-1.amazonaws.com'};
test('validates endpoint, interval, mode and topic without connecting',()=>{
 assert.equal(configuration(base).mode,'check');
 assert.equal(configuration({...base,IOT_TOPIC:'sensores/{deviceId}/telemetria'}).topic,'sensores/sensor-piloto-001/telemetria');
 for(const env of [{},{...base,API_AWS_IOT:'https://other.test'},{...base,IOT_INTERVAL_MS:'0'},{...base,IOT_MODE:'invalid'},{...base,IOT_TOPIC:'#'}])assert.throws(()=>configuration(env));
});
test('certificate lookup is relative to the module, never the process working directory',()=>{
 const moduleUrl=new URL('./config.mjs',import.meta.url).href;
 const observed=execFileSync(process.execPath,['--input-type=module','-e',`const c=await import(${JSON.stringify(moduleUrl)});process.stdout.write(c.apiRoot);`],{cwd:tmpdir(),encoding:'utf8'});
 assert.equal(observed,apiRoot);
 assert.throws(()=>certificates(resolve(apiRoot,'nonexistent-test-certificates')));
});
test('publishes strictly demo payloads with unique IDs and QoS 1, checking acknowledgements',async()=>{
 const config=configuration({...base,IOT_MODE:'publish'});const sent=[];
 const client={publish:async p=>{sent.push(p);return {reasonCode:0};}};
 const first=await publishDemo(client,config),second=await publishDemo(client,config);assert.notEqual(first,second);
 assert.equal(sent[0].qos,1);const message=JSON.parse(sent[0].payload);assert.equal(message.source,'simulator');assert.equal(message.companyId,undefined);
 await assert.rejects(()=>publishDemo({publish:async()=>({reasonCode:135})},config));
 await assert.rejects(()=>publishDemo({publish:async()=>{throw new Error('transport');}},config));
});
