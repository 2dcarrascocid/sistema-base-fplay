import { describe, expect, it } from 'vitest';
import { createRouter } from '../../src/lib/http.js';
import { saphiRoutes } from '../../src/saphi/routes.js';
import { apiDb, apiEvent, makeDeps } from '../helpers.js';

const routes = saphiRoutes(makeDeps(apiDb));
const handler = createRouter(routes);

describe('Saphi phase boundary', () => {
  it('requires a session for every registered Saphi method and resource',async()=>{
    for(const key of Object.keys(routes)){
      const [method,resource]=key.split(' ') as [string,string];
      const response=await handler(apiEvent(method,resource));
      expect(response.statusCode,key).toBe(401);
      expect(JSON.parse(response.body).error.code,key).toBe('SESSION_INVALID');
    }
  });
  it('registers masters and immutable samples without future integrations', () => {
    expect(Object.keys(routes)).toHaveLength(34);
    expect(Object.keys(routes).filter(key=>key.includes('telemetry')).every(key=>key.startsWith('GET '))).toBe(true);
  });

  it.each(['/saphi/companies', '/saphi/companies/{companyId}/farms', '/ingestion/telemetry'])(
    'does not fabricate data or accept writes for %s', async (resource) => {
      for (const method of ['GET', 'POST', 'PATCH']) {
        const response = await handler(apiEvent(method, resource));
        const registered = `${method} ${resource}` in routes;
        expect(response.statusCode).toBe(registered ? 401 : 404);
        expect(JSON.parse(response.body).error.code).toBe(registered ? 'SESSION_INVALID' : 'NOT_FOUND');
      }
    },
  );
});
