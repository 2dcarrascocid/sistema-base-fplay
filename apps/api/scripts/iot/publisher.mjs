import {randomUUID} from 'node:crypto';
export function payload(config){return {schemaVersion:1,messageId:randomUUID(),deviceId:config.deviceId,timestamp:new Date().toISOString(),
  measurements:{temperature:{value:config.temperature,unit:'C'},soilMoisture:{value:config.soilMoisture,unit:'%'}},source:'simulator'};}
/** Transport injected so publication can be verified without connecting to AWS. */
export async function publishDemo(client,config){
 const message=payload(config);
 const ack=await client.publish({topicName:config.topic,qos:1,retain:false,payload:JSON.stringify(message)});
 if(!ack||ack.reasonCode>=128)throw new Error('MQTT publication rejected');
 return message.messageId;
}
