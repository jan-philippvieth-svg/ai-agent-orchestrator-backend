import { config } from '../config.js';
import { searchRequestSchema } from '../schemas/search.schema.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { QdrantService } from '../services/qdrant.service.js';
export async function searchRoutes(app) {
    const embeddings = new EmbeddingService();
    const qdrant = new QdrantService();
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
        return {
            success: true,
            results,
        };
    });
}
