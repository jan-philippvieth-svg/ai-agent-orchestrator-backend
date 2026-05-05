import { ingestRequestSchema } from '../schemas/ingest.schema.js';
import { IngestionService } from '../services/ingestion.service.js';
export async function ingestRoutes(app) {
    const ingestion = new IngestionService();
    app.post('/ingest', async (request, reply) => {
        const parsed = ingestRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const result = await ingestion.ingest(parsed.data);
        return reply.code(result.success ? 200 : 422).send(result);
    });
}
