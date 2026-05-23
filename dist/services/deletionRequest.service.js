import { PayloadStoreService } from './payloadStore.service.js';
import { QdrantService } from './qdrant.service.js';
export class DeletionRequestService {
    payloads;
    qdrant;
    constructor(payloads = new PayloadStoreService(), qdrant = new QdrantService()) {
        this.payloads = payloads;
        this.qdrant = qdrant;
    }
    async deleteSubject(tenantId, subjectId) {
        const payloadRefs = await this.payloads.activeRefsForSubject(tenantId, subjectId);
        const deletedPayloads = await this.payloads.deleteBySubject(tenantId, subjectId);
        const qdrantChunksDeleted = await this.qdrant.deleteChunksByPayloadRefs(tenantId, payloadRefs);
        return {
            success: true,
            tenantId,
            subjectId,
            deletedPayloads,
            qdrantChunksDeleted,
            qdrantKnowledgeUnaffected: qdrantChunksDeleted === 0,
            warnings: qdrantChunksDeleted > 0
                ? ['Some Qdrant chunks were marked as containing personal data and had to be deleted.']
                : ['Only payload records were deleted. PII-free knowledge chunks remain available.'],
        };
    }
}
