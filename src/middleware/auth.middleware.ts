import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.url.startsWith('/bff')) {
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
