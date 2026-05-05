import type { FastifyInstance } from 'fastify';
import { LlmService } from '../services/llm.service.js';

export async function modelsRoutes(app: FastifyInstance): Promise<void> {
  const llm = new LlmService();

  app.get('/models', async () => llm.models());
}
