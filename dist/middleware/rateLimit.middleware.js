import { config } from '../config.js';
import { BffSessionService } from '../services/bffSession.service.js';
const buckets = new Map();
const sessions = new BffSessionService();
function getBodyUserId(body) {
    if (!body || typeof body !== 'object')
        return undefined;
    const userId = body.userId;
    return typeof userId === 'string' && userId ? userId : undefined;
}
export async function rateLimit(request, reply) {
    const apiKey = request.headers['x-api-key'];
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const bffSession = request.url.startsWith('/bff') ? sessions.verifyCookie(request.headers.cookie) : undefined;
    const bffLoginKey = request.headers['x-bff-login-key'];
    const keyPart = bffSession
        ? `bff:${bffSession.tenantId}`
        : Array.isArray(apiKey)
            ? apiKey[0]
            : apiKey ?? bearer ?? (Array.isArray(bffLoginKey) ? bffLoginKey[0] : bffLoginKey) ?? 'anonymous';
    const userPart = bffSession?.userId ?? getBodyUserId(request.body) ?? 'no-user';
    const bucketKey = `${keyPart}:${userPart}`;
    const now = Date.now();
    const existing = buckets.get(bucketKey);
    if (!existing || existing.resetAt <= now) {
        buckets.set(bucketKey, {
            count: 1,
            resetAt: now + config.security.rateLimitWindowMs,
        });
        return;
    }
    existing.count += 1;
    if (existing.count > config.security.rateLimitMaxRequests) {
        const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
        reply.header('retry-after', String(retryAfterSeconds));
        await reply.code(429).send({
            success: false,
            error: 'RateLimitExceeded',
            message: 'Too many requests. Please retry after the current rate-limit window.',
            retryAfterSeconds,
        });
    }
}
