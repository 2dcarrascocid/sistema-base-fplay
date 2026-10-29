/** Start the local private Python provider for the authenticated Saphi API. No deployment. */
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,stat,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import net from 'node:net';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const backend=join(root,'examples/mi-proyecto-satelital/backend-serverless');
if(process.env.NODE_ENV==='production')throw new Error('Local development only');
const key=process.env.GEE_KEY_FILE||join(root,'apps/api/credenciales-gee.json');
await stat(key);
const scripts=join(backend,'.venv',process.platform==='win32'?'Scripts':'bin');
const python=join(scripts,process.platform==='win32'?'python.exe':'python');await stat(python);
const serverless=join(backend,'node_modules/serverless/bin/serverless.js');await stat(serverless);
const occupied=await new Promise(resolve=>{
  const socket=net.connect({host:'localhost',port:3001});socket.once('connect',()=>{socket.destroy();resolve(true);});
  socket.once('error',()=>{socket.destroy();resolve(false);});
});
if(occupied)throw new Error('Port 3001 is already in use. Stop that provider before restarting.');
const token=randomBytes(32).toString('hex');const directory=join(root,'.local');const config=join(directory,'saphi-gee.json');
await mkdir(directory,{recursive:true});await writeFile(config,JSON.stringify({token}),{mode:0o600});
const env={...process.env,GEE_KEY_FILE:key,SAPHI_GEE_INTERNAL_TOKEN:token};
const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';env[pathKey]=`${scripts}${process.platform==='win32'?';':':'}${env[pathKey]||''}`;
console.log('Starting private Earth Engine provider on localhost:3001; credentials and token remain server-side.');
const child=spawn(process.execPath,[serverless,'offline','start','--stage','dev','--httpPort','3001'],{cwd:backend,env,stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.once('exit',async code=>{
  try{if(JSON.parse(await readFile(config,'utf8')).token===token)await unlink(config);}catch{/* already removed */}
  process.exitCode=code??1;
});
