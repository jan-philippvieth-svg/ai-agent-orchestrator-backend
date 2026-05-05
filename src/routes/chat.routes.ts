import type { FastifyInstance } from 'fastify';
import { chatRequestSchema } from '../schemas/chat.schema.js';
import { ChatOrchestratorService } from '../services/chatOrchestrator.service.js';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const chat = new ChatOrchestratorService();

  app.post('/chat', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
    }

    const apiKey = request.headers['x-api-key'];
    const providedApiKey = Array.isArray(apiKey) ? apiKey[0] : apiKey;
    return chat.run(parsed.data, { providedApiKey, correlationId: request.correlationId });
  });
}
