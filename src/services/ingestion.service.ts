import { createHash, randomUUID } from 'node:crypto';
import type {
  ChunkMetadata,
  IngestAcceptedResponse,
  IngestRejectedResponse,
  IngestRequest,
  KnowledgeChunk,
  SourceType,
} from '../types/index.js';
import { normalizeForHash } from '../utils/textCleaner.js';
import { ChunkingService } from './chunking.service.js';
import { EmbeddingService } from './embedding.service.js';
import { IngestionQualityService } from './ingestionQuality.service.js';
import { QdrantService } from './qdrant.service.js';
import { SparseSearchService } from './sparseSearch.service.js';

export class IngestionService {
  constructor(
    private readonly qualityGate = new IngestionQualityService(),
    private readonly chunking = new ChunkingService(),
    private readonly embeddings = new EmbeddingService(),
    private readonly qdrant = new QdrantService(),
    private readonly sparse = new SparseSearchService(),
  ) {}

  async ingest(input: IngestRequest): Promise<IngestAcceptedResponse | IngestRejectedResponse> {
    const quality = this.qualityGate.evaluate(input);

    if (!quality.accepted || !quality.cleanedContent) {
      return {
        success: false,
        accepted: false,
        reason: quality.reason ?? 'Content rejected by ingestion quality gate',
        warnings: quality.warnings,
      };
    }

    const documentId = randomUUID();
    const documentHash = String(quality.metadataUpdates.documentHash);

    if (await this.qdrant.hasContentHash(input.tenantId, documentHash)) {
      return {
        success: false,
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: duplicate document',
        warnings: [...quality.warnings, 'Duplicate document hash already exists for this tenant.'],
      };
    }

    const rawChunks = this.chunking.chunk(quality.cleanedContent);
    if (rawChunks.length === 0) {
      return {
        success: false,
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: no high-quality chunks created',
        warnings: [...quality.warnings, 'No chunk passed minimum quality checks.'],
      };
    }

    const chunks: KnowledgeChunk[] = [];
    for (const [index, text] of rawChunks.entries()) {
      const contentHash = createHash('sha256').update(normalizeForHash(text)).digest('hex');
      if (await this.qdrant.hasContentHash(input.tenantId, contentHash)) continue;

      const metadata: ChunkMetadata = {
        tenantId: input.tenantId,
        projectId: input.projectId,
        sourceType: input.sourceType as SourceType,
        title: input.title,
        status: input.status,
        tags: input.tags,
        chunkIndex: index,
        documentId,
        contentHash,
        documentHash,
        createdAt: new Date().toISOString(),
        approvedForRetrieval: Boolean(quality.metadataUpdates.approvedForRetrieval),
        containsPersonalData: Boolean(quality.metadataUpdates.containsPersonalData),
        payloadRefs: Array.isArray(quality.metadataUpdates.payloadRefs)
          ? (quality.metadataUpdates.payloadRefs as string[])
          : [],
        privacyClass: String(quality.metadataUpdates.privacyClass ?? 'internal') as ChunkMetadata['privacyClass'],
        retentionPolicy: String(quality.metadataUpdates.retentionPolicy ?? 'knowledge_base'),
        deletionBehavior: String(
          quality.metadataUpdates.deletionBehavior ?? 'keep_if_pii_free',
        ) as ChunkMetadata['deletionBehavior'],
        warnings: quality.warnings,
      };

      chunks.push({
        id: randomUUID(),
        text,
        vector: await this.embeddings.embed(text),
        metadata,
      });
    }

    if (chunks.length === 0) {
      return {
        success: false,
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: duplicate chunks',
        warnings: [...quality.warnings, 'All chunks already exist for this tenant.'],
      };
    }

    await this.qdrant.upsertChunks(chunks);
    await this.sparse.indexChunks(chunks);

    return {
      success: true,
      documentId,
      accepted: true,
      chunksCreated: chunks.length,
      warnings: quality.warnings,
    };
  }
}
