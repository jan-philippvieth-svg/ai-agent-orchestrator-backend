import { config } from '../config.js';
export async function apiKeyAuth(request, reply) {
    if (request.url.startsWith('/bff') || request.url.startsWith('/ui') || request.url === '/favicon.ico') {
        return;
    }
    const apiKey = request.headers['x-api-key'];
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const provided = Array.isArray(apiKey) ? apiKey[0] : apiKey ?? bearer;
    if (!provided || provided !== config.apiKey) {
        await reply.code(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Missing or invalid API key',
        });
    }
}
