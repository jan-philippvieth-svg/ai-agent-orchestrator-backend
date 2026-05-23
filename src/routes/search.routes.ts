import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { searchRequestSchema } from '../schemas/search.schema.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { PrivacyRetrievalService } from '../services/privacyRetrieval.service.js';
import { QdrantService } from '../services/qdrant.service.js';

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  const embeddings = new EmbeddingService();
  const qdrant = new QdrantService();
  const privacyRetrieval = new PrivacyRetrievalService();

  app.post('/search', async (request, reply) => {
    const parsed = searchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
    }

    const body = {
      ...parsed.data,
      limit: Math.min(parsed.data.limit, config.retrieval.maxLimit),
    };

    const vector = await embeddings.embed(body.query);
    const results = await qdrant.search(vector, body);
    const privacyFiltered = await privacyRetrieval.filter(body.tenantId, results);

    return {
      success: true,
      results: privacyFiltered.chunks,
      warnings: privacyFiltered.warnings.length > 0 ? privacyFiltered.warnings : undefined,
    };
  });
}
