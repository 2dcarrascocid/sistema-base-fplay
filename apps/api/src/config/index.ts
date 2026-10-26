import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getDeps } from '../lib/aws/deps.js';
import { createRouter } from '../lib/http.js';
import { configRoutes } from './routes.js';

export const handler = async (event: APIGatewayProxyEvent) => {
  const deps = await getDeps();
  return createRouter(configRoutes(deps), { originSecret: deps.originSecret })(event);
};
