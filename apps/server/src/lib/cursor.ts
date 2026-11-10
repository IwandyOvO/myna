import { badRequest } from './errors';

/** Opaque keyset cursor: base64url("<iso timestamp>|<uuid>"). */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(c: string | undefined): { createdAt: Date; id: string } | null {
  if (!c) return null;
  const [ts, id] = Buffer.from(c, 'base64url').toString().split('|');
  const createdAt = new Date(ts ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) throw badRequest('bad_cursor');
  return { createdAt, id };
}
