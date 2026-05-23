import { deletionRequestSchema, payloadUpsertSchema } from '../schemas/privacy.schema.js';
import { DeletionRequestService } from '../services/deletionRequest.service.js';
import { PayloadStoreService } from '../services/payloadStore.service.js';
export async function privacyRoutes(app) {
    const payloads = new PayloadStoreService();
    const deletionRequests = new DeletionRequestService();
    app.post('/privacy/payloads', async (request, reply) => {
        const parsed = payloadUpsertSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const record = await payloads.upsert(parsed.data);
        return {
            success: true,
            payloadRef: record.payloadId,
            status: record.status,
            message: 'Payload stored outside Qdrant. Reference it from RAG chunks via privacy.payloadRefs.',
        };
    });
    app.post('/privacy/delete-subject', async (request, reply) => {
        const parsed = deletionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        return deletionRequests.deleteSubject(parsed.data.tenantId, parsed.data.subjectId);
    });
}
