import { z } from 'zod';
import { open, seal, sha256 } from '../../lib/crypto.js';
import type { Deps } from '../../lib/deps.js';
import { badRequest } from '../../lib/errors.js';
import type { Boundary, Slice } from '../domain/pagination.js';
import { entityIdSchema, type Page } from '@base/saphi';

const boundarySchema = z.strictObject({ id: entityIdSchema, createdAt: z.iso.datetime() });

/** Uses Base Fairplay's authenticated encryption; a dedicated purpose binds every query. */
export function cursorCodec(deps: Pick<Deps, 'originSecret' | 'encryptionKey'>, binding: object) {
  const key = sha256(`saphi.cursor.v1:${deps.originSecret ?? deps.encryptionKey.toString('base64')}`);
  const purpose = `saphi.cursor.v1:${JSON.stringify(binding)}`;
  return {
    decode(token?: string): Boundary | undefined {
      if (!token) return undefined;
      if (!/^[A-Za-z0-9_-]+$/.test(token) || Buffer.from(token,'base64url').toString('base64url') !== token) throw badRequest('INVALID_CURSOR');
      const parsed = boundarySchema.safeParse(open<unknown>(key, purpose, token));
      if (!parsed.success) throw badRequest('INVALID_CURSOR');
      return parsed.data;
    },
    page<T>(result: Slice<T>): Page<T> {
      return { data: result.items, page: { nextCursor: result.next ? seal(key, purpose, result.next, 900) : null, hasMore: result.next !== null } };
    },
  };
}
