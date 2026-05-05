import { BffSessionService } from '../services/bffSession.service.js';
const sessions = new BffSessionService();
function readBodyString(body, key) {
    if (!body || typeof body !== 'object')
        return undefined;
    const value = body[key];
    return typeof value === 'string' && value ? value : undefined;
}
export async function auditLog(request, _reply) {
    if (request.url === '/health')
        return;
    const bffSession = request.url.startsWith('/bff') ? sessions.verifyCookie(request.headers.cookie) : undefined;
    const tenantId = bffSession?.tenantId ?? readBodyString(request.body, 'tenantId') ?? 'unknown';
    const userId = bffSession?.userId ?? readBodyString(request.body, 'userId') ?? 'unknown';
    request.log.info({
        event: 'audit',
        correlationId: request.correlationId,
        method: request.method,
        endpoint: request.url.split('?')[0],
        tenantId,
        userId,
    });
}
