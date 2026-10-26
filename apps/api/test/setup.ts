import { afterAll } from 'vitest';
import { apiDb, authDb, ownerDb } from './helpers.js';

afterAll(async () => {
  await Promise.all([apiDb.destroy(), authDb.destroy(), ownerDb.destroy()]);
});
