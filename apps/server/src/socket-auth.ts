import type { IncomingHttpHeaders } from 'node:http';
import { originHost } from './security.js';
import { SESSION_COOKIE_NAME, verifySessionToken } from './session-token.js';

export function readSessionCookie(headers: IncomingHttpHeaders): string | null {
  const header = headers.cookie;

  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export function isAllowedHandshakeOrigin(headers: IncomingHttpHeaders): boolean {
  const origin = headers.origin;

  if (!origin) return true;

  const host = headers.host?.toLowerCase();

  return Boolean(host && originHost(origin) === host);
}

export function sessionPlayerId(
  headers: IncomingHttpHeaders,
  sessionSecret: string,
): string | null {
  const token = readSessionCookie(headers);

  return token ? verifySessionToken(token, sessionSecret) : null;
}
