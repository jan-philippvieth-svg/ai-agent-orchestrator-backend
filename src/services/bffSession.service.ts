import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export interface BffSession {
  tenantId: string;
  userId: string;
  exp: number;
  csrfToken: string;
}

export interface CreatedBffSession {
  cookie: string;
  csrfToken: string;
}

export class BffSessionService {
  createSession(session: Omit<BffSession, 'exp' | 'csrfToken'>): CreatedBffSession {
    const csrfToken = randomBytes(32).toString('base64url');
    const payload: BffSession = {
      ...session,
      exp: Math.floor(Date.now() / 1000) + config.bff.sessionTtlSeconds,
      csrfToken,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.sign(encodedPayload);
    const value = `${encodedPayload}.${signature}`;

    const cookie = [
      `${config.bff.sessionCookieName}=${value}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/bff',
      `Max-Age=${config.bff.sessionTtlSeconds}`,
      ...(config.bff.cookieSecure ? ['Secure'] : []),
    ].join('; ');

    return { cookie, csrfToken };
  }

  clearCookie(): string {
    return [
      `${config.bff.sessionCookieName}=`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/bff',
      'Max-Age=0',
      ...(config.bff.cookieSecure ? ['Secure'] : []),
    ].join('; ');
  }

  verifyCookie(cookieHeader: string | undefined): BffSession | undefined {
    const value = this.readCookie(cookieHeader, config.bff.sessionCookieName);
    if (!value) return undefined;

    const [encodedPayload, signature] = value.split('.');
    if (!encodedPayload || !signature || !this.isValidSignature(encodedPayload, signature)) return undefined;

    try {
      const session = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as BffSession;
      if (!session.tenantId || !session.userId || !session.csrfToken || session.exp < Math.floor(Date.now() / 1000)) {
        return undefined;
      }
      return session;
    } catch {
      return undefined;
    }
  }

  private readCookie(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader) return undefined;
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    const prefix = `${name}=`;
    return cookies.find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);
  }

  private sign(value: string): string {
    return createHmac('sha256', config.bff.sessionSecret).update(value).digest('base64url');
  }

  private isValidSignature(value: string, signature: string): boolean {
    const expected = this.sign(value);
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
