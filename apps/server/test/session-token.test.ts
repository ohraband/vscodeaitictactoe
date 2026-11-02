import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../src/session-token.js';

const secret = 'test-secret-that-is-long-enough-123';
const playerId = '11111111-1111-4111-8111-111111111111';

describe('session tokens', () => {
  it('creates and verifies a signed player id', () => {
    const token = createSessionToken(playerId, secret);

    expect(token.startsWith(`${playerId}.`)).toBe(true);
    expect(verifySessionToken(token, secret)).toBe(playerId);
  });

  it('rejects tokens signed with another secret', () => {
    const token = createSessionToken(playerId, secret);

    expect(verifySessionToken(token, 'another-secret-that-is-long-enough')).toBeNull();
  });

  it('rejects tampered player ids and signatures', () => {
    const token = createSessionToken(playerId, secret);
    const [, signature] = token.split('.');

    expect(
      verifySessionToken(`22222222-2222-4222-8222-222222222222.${signature}`, secret),
    ).toBeNull();
    expect(verifySessionToken(`${playerId}.not-the-signature`, secret)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('', secret)).toBeNull();
    expect(verifySessionToken(playerId, secret)).toBeNull();
    expect(verifySessionToken(`${playerId}.`, secret)).toBeNull();
    expect(verifySessionToken(`not-a-uuid.${secret}`, secret)).toBeNull();
    expect(verifySessionToken(`${playerId}.signature.extra`, secret)).toBeNull();
    expect(verifySessionToken(createSessionToken('not-a-uuid', secret), secret)).toBeNull();
  });

  it('exposes the cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('ttt_session');
  });
});
