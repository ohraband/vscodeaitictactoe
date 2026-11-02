import type { ErrorCode } from '@ttt/contracts';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
