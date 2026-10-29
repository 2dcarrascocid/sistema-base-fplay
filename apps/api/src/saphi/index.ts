import { createRouter } from '../lib/http.js';
import { saphiRoutes } from './routes.js';
import { getDeps } from '../lib/aws/deps.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent) => {
  const deps = await getDeps();
  return createRouter(saphiRoutes(deps), { originSecret: deps.originSecret })(event);
};
