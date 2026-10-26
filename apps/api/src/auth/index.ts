import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getDeps } from '../lib/aws/deps.js';
import { createRouter } from '../lib/http.js';
import { authRoutes } from './routes.js';

export const handler = async (event: APIGatewayProxyEvent) => createRouter(authRoutes(await getDeps()))(event);
