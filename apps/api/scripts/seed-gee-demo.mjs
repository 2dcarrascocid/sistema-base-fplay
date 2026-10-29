/** Explicit local demo through authenticated APIs; no owner SQL or implicit tenant bypass. */
import assert from 'node:assert/strict';
if(process.env.NODE_ENV==='production'||!process.argv.includes('--local-demo'))throw new Error('Use --local-demo only with the local simulator.');
const base='http://localhost:3000/api',origin='http://localhost:5173';
const managerId='de400000-0000-4000-8000-000000000001',profileName='DEMO Satélite GEE lectura';
async function request(path,{method='GET',body,session}={}){
  const response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20_000),headers:{origin,'content-type':'application/json',
    ...(session?{authorization:`Bearer ${session.token}`,cookie:session.cookie,'x-csrf-token':session.csrf}:{}),
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(`${method} ${path}: ${response.status} ${data.error?.code||'HTTP_ERROR'}`);}
  return {data:response.status===204?null:await response.json(),cookies:response.headers.getSetCookie()};
}
async function login(email){
  const first=await request('/auth/login',{method:'POST',body:{email,password:'Local-Dev-2026!',captchaToken:'local-demo'}});
  assert.equal(first.data.challenge,'SOFTWARE_TOKEN_MFA');
  const second=await request('/auth/challenge',{method:'POST',body:{session:first.data.session,challenge:first.data.challenge,code:'123456'}});
  const cookies=Object.fromEntries(second.cookies.map(value=>{const pair=value.split(';')[0],at=pair.indexOf('=');return[pair.slice(0,at),pair.slice(at+1)];}));
  return {token:second.data.accessToken,cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),csrf:decodeURIComponent(cookies['__Secure-bf_csrf'])};
}
const root=await login('superadmin@local.test');let manager;
try{
  assert.equal((await request('/me',{session:root})).data.role,'superuser');
  const recipient=(await request(`/admin/users/${managerId}`,{session:root})).data;
  assert.equal(recipient.user.email,'gestora.saphi@local.test');
  const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children||[])]);
  const catalogue=(await request('/admin/permission-catalog',{session:root})).data;
  const permission=flatten(catalogue.menus).find(node=>node.code==='saphi.satellite')?.actions.find(action=>action.code==='view');
  assert.ok(permission?.grantable);const actionId=permission.menuActionId;
  const profiles=(await request(`/admin/profiles?search=${encodeURIComponent(profileName)}&pageSize=100`,{session:root})).data.items;
  let profile=profiles.find(item=>item.name===profileName);
  if(!profile){const created=await request('/admin/profiles',{session:root,method:'POST',body:{name:profileName,description:'Visor local GEE; no concesión implícita por empresa.',menuActionIds:[actionId]}});profile={id:created.data.id};}
  const detail=(await request(`/admin/profiles/${profile.id}`,{session:root})).data;
  assert.equal(detail.profile.is_active,true);assert.deepEqual(detail.menuActionIds,[actionId]);
  const current=recipient.profiles.map(profile=>profile.id);
  if(!current.includes(profile.id))await request(`/admin/users/${managerId}/profiles`,{session:root,method:'PUT',body:{profileIds:[...current,profile.id]}});
  manager=await login('gestora.saphi@local.test');
  const companies=(await request('/saphi/companies?limit=100',{session:manager})).data.data;
  let company=companies.find(item=>item.legalName==='DEMO Saphi Satelital GEE');
  if(!company){
    const body='99000712';let sum=0,multiplier=2;for(const digit of [...body].reverse()){sum+=Number(digit)*multiplier;multiplier=multiplier===7?2:multiplier+1;}
    const check=11-sum%11;const rut=`${body}-${check===11?'0':check===10?'K':check}`;
    const permissions=['saphi.companies:view','saphi.memberships:view','saphi.memberships:edit','saphi.farms:view','saphi.farms:create',
      'saphi.plots:view','saphi.plots:create','saphi.samples:view','saphi.samples:create','saphi.satellite:view'];
    company=(await request('/saphi/companies',{session:root,method:'POST',body:{rut,legalName:'DEMO Saphi Satelital GEE',tradeName:'DEMO Visor GEE · ubicación ilustrativa',initialUserId:managerId,initialPermissions:permissions,reason:'Integración Fase 7 solicitada: empresa demo separada sin alterar concesiones existentes.'}})).data.data;
  }
  const path=`/saphi/companies/${company.id}`;
  const farms=(await request(`${path}/farms?limit=100`,{session:manager})).data.data;
  let farm=farms.find(item=>item.code==='DEMO-GEE-F1');
  if(!farm)farm=(await request(`${path}/farms`,{session:manager,method:'POST',body:{code:'DEMO-GEE-F1',name:'DEMO Referencia Talca, no predio real'}})).data.data;
  const plots=(await request(`${path}/plots?limit=100`,{session:manager})).data.data;
  let plot=plots.find(item=>item.code==='DEMO-GEE-C1');
  if(!plot)plot=(await request(`${path}/plots`,{session:manager,method:'POST',body:{farmId:farm.id,code:'DEMO-GEE-C1',name:'DEMO Área ilustrativa Sentinel-2'}})).data.data;
  const points=(await request(`${path}/sampling-points?plotId=${plot.id}&limit=100`,{session:manager})).data.data;
  const coordinates=[[-71.6558,-35.4268],[-71.6548,-35.4260],[-71.6555,-35.4259]];
  for(const [index,coordinate] of coordinates.entries()){
    const code=`DEMO-GEE-P${index+1}`;
    if(!points.some(point=>point.code===code))await request(`${path}/sampling-points`,{session:manager,method:'POST',body:{plotId:plot.id,code,location:{type:'Point',coordinates:coordinate}}});
  }
  console.log(JSON.stringify({status:'ready',companyId:company.id,plotId:plot.id,url:`http://localhost:5173${path}/satellite`,account:'gestora.saphi@local.test',note:'GEE IAM access is checked separately; no imagery is simulated.'}));
}finally{
  if(manager)await request('/auth/logout',{session:manager,method:'POST'});
  await request('/auth/logout',{session:root,method:'POST'});
}
