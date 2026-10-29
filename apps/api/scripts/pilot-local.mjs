/** Local technical pilot against the running development API; no agricultural writes or grants. */
import assert from 'node:assert/strict';

if (process.env.NODE_ENV === 'production' || !process.argv.includes('--local-pilot')) {
  throw new Error('Use --local-pilot exclusively with the local development simulator.');
}
const api = 'http://127.0.0.1:3000/api';
const origin = 'http://localhost:5173';
const companies = ['f462682d-6281-4d12-b36b-7abf5caee753','43d129bb-21a3-43af-a087-54ec13c717e8'];
const results = [];
let checks = 0;
async function request(path, { method='GET', body, token, cookie, csrf } = {}) {
  const response = await fetch(`${api}${path}`, {
    method, redirect:'error', signal:AbortSignal.timeout(20_000),
    headers:{origin,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),
      ...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  const data = response.status===204 ? null : await response.json();
  return {status:response.status,data,cookies:response.headers.getSetCookie()};
}
function expectStatus(response,status,label){
  assert.equal(response.status,status,`${label}: HTTP ${response.status}, expected ${status}`);checks++;
}
async function get(path,token,status=200){const response=await request(path,{token});expectStatus(response,status,path);return response.data;}
async function login(email){
  const first=await request('/auth/login',{method:'POST',body:{email,password:'Local-Dev-2026!',captchaToken:'local-pilot'}});
  expectStatus(first,200,'Local login');assert.equal(first.data.status,'challenge');assert.equal(first.data.challenge,'SOFTWARE_TOKEN_MFA');checks+=2;
  const second=await request('/auth/challenge',{method:'POST',body:{session:first.data.session,challenge:first.data.challenge,code:'123456'}});
  expectStatus(second,200,'Local MFA');assert.equal(second.data.status,'authenticated');checks++;
  const cookies=Object.fromEntries(second.cookies.map(value=>{
    const pair=value.split(';')[0];const split=pair.indexOf('=');return [pair.slice(0,split),pair.slice(split+1)];
  }));
  assert.ok(cookies['__Secure-bf_rt']);assert.ok(cookies['__Secure-bf_csrf']);checks+=2;
  return {token:second.data.accessToken,cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),csrf:decodeURIComponent(cookies['__Secure-bf_csrf'])};
}
async function points(companyId,token){
  let cursor=null;const ids=new Set();let pages=0;
  do{
    const query=new URLSearchParams({limit:'25',...(cursor?{cursor}:{})});
    const page=await get(`/saphi/companies/${companyId}/sampling-points?${query}`,token);
    assert.ok(page.data.length<=25);checks++;
    for(const row of page.data){assert.equal(row.companyId,companyId);assert.ok(!ids.has(row.id));ids.add(row.id);checks+=2;}
    cursor=page.page.nextCursor;assert.equal(page.page.hasMore,!!cursor);checks++;pages++;
    assert.ok(pages<=10,'Pagination must terminate');checks++;
  }while(cursor);
  assert.equal(ids.size,36);assert.equal(pages,2);checks+=2;
  return {records:ids.size,pages};
}

try{
  expectStatus(await request('/saphi/companies'),401,'Unauthenticated company directory');
  for(const role of ['gestora','operador','consulta','sinacceso']){
    const session=await login(`${role}.saphi@local.test`);
    try{
      const me=await get('/me',session.token);assert.equal(me.role,'client');checks++;
      const directory=await get('/saphi/companies',session.token);
      assert.deepEqual(directory.data.map(row=>row.id).sort(),role==='sinacceso'?[]:[...companies].sort());checks++;
      const scopes=[];let firstPlot;
      for(const [index,companyId] of companies.entries()){
        const prefix=`/saphi/companies/${companyId}`;
        if(role==='sinacceso'){
          await get(`${prefix}/capabilities`,session.token,404);await get(`${prefix}/farms`,session.token,404);continue;
        }
        const capabilities=await get(`${prefix}/capabilities`,session.token);
        const edit=capabilities.data.effectivePermissions.includes('saphi.farms:edit');
        assert.equal(edit,role==='gestora'||(role==='operador'&&index===0));checks++;
        const farms=await get(`${prefix}/farms`,session.token);assert.equal(farms.data.length,3);checks++;
        for(const farm of farms.data){assert.equal(farm.companyId,companyId);checks++;}
        const plots=await get(`${prefix}/plots`,session.token);assert.equal(plots.data.length,6);checks++;
        for(const plot of plots.data){assert.equal(plot.companyId,companyId);checks++;}
        if(index===0)firstPlot=plots.data[0].id;
        else await get(`${prefix}/plots/${firstPlot}`,session.token,404);
        const paging=await points(companyId,session.token);
        await get(`${prefix}/dashboard?from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z`,session.token,403);
        scopes.push({companyId,canEditFarms:edit,farms:farms.data.length,plots:plots.data.length,points:paging});
      }
      results.push({account:role,companies:directory.data.length,scopes});
    }finally{
      const logout=await request('/auth/logout',{method:'POST',...session});expectStatus(logout,204,'Logout');
      await get('/saphi/companies',session.token,401);
    }
  }
  console.log(JSON.stringify({status:'passed',environment:'local-development-simulators',checkedAt:new Date().toISOString(),checks,results,
    deferred:['agricultural writes','new module grants','real IoT/satellite integrations','analysis catalogue','indicator formulas','client acceptance','deployment']},null,2));
}catch(error){
  // Never emit response bodies, authentication state, cookies or tokens.
  console.error(`Local pilot failed: ${error instanceof Error?error.message:'unexpected error'}`);process.exitCode=1;
}
