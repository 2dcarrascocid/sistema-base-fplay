import {loadEnvFile} from 'node:process';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {iot,mqtt5} from 'aws-iot-device-sdk-v2';
import {apiRoot,configuration,certificates} from './config.mjs';
import {publishDemo} from './publisher.mjs';
try{loadEnvFile(resolve(apiRoot,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
async function run(){
  const config=configuration(),files=certificates();
  const builder=iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(config.host,files.cert,files.key)
    .withCertificateAuthorityFromPath(undefined,files.ca).withConnectProperties({clientId:config.clientId,keepAliveIntervalSeconds:30})
    .withMinReconnectDelayMs(1000).withMaxReconnectDelayMs(10000);
  const client=new mqtt5.Mqtt5Client(builder.build());const cancel=new AbortController();
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;cancel.abort();client.stop();};
  const stopped=new Promise(resolve=>client.on('stopped',resolve));
  client.on('error',()=>console.error('MQTT transport error'));
  client.on('disconnection',()=>{if(!stopping)console.info('MQTT disconnected; reconnecting');});
  client.on('connectionFailure',()=>console.error('MQTT connection attempt failed'));
  const connected=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('MQTT connection timeout')),20000);
    client.once('connectionSuccess',()=>{clearTimeout(timeout);console.info('MQTT5 connection accepted');resolve();});
    cancel.signal.addEventListener('abort',()=>{clearTimeout(timeout);reject(new Error('Stopped'));},{once:true});
  });
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    client.start();await connected;
    if(config.mode==='publish')for(let i=0;i<config.maxMessages&&!stopping;i++){
      const messageId=await Promise.race([publishDemo(client,config),
        sleep(20000,undefined,{signal:cancel.signal}).then(()=>{throw new Error('MQTT publication timeout');})]);
      console.info(JSON.stringify({event:'demo.publish.confirmed',messageId,sequence:i+1}));
      if(i+1<config.maxMessages)await sleep(config.intervalMs,undefined,{signal:cancel.signal});
    }
  }finally{
    stop();await Promise.race([stopped,sleep(5000)]);client.close();
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
}
run().catch(()=>{console.error('IoT simulator stopped: check configuration, certificate policy and network. No credentials logged.');process.exitCode=1;});
