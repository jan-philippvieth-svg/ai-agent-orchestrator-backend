import { config } from '../config.js';
import { searchRequestSchema } from '../schemas/search.schema.js';
import { RetrievalService } from '../services/retrieval.service.js';
export async function searchRoutes(app) {
    const retrieval = new RetrievalService();
    app.post('/search', async (request, reply) => {
        const parsed = searchRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const body = {
            ...parsed.data,
            limit: Math.min(parsed.data.limit, config.retrieval.maxLimit),
        };
        const retrievalResult = await retrieval.retrieve(body);
        return {
            success: true,
            results: retrievalResult.results,
            retrievalMode: retrievalResult.mode,
            retrievalDiagnostics: retrievalResult.diagnostics,
            warnings: retrievalResult.warnings.length > 0 ? retrievalResult.warnings : undefined,
        };
    });
}
