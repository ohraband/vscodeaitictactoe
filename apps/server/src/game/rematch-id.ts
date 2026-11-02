import { createHash } from 'node:crypto';

const REMATCH_NAMESPACE = '1f4f5a1e-6a2b-5c7d-9e8f-0a1b2c3d4e5f';

export function rematchGameId(gameId: string): string {
  const namespace = Buffer.from(REMATCH_NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(namespace).update(gameId).digest();

  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;

  const hex = hash.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
