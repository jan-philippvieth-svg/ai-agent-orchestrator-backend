import type { SearchResult } from '../types/index.js';
import { PayloadStoreService } from './payloadStore.service.js';

export interface PrivacyFilteredRetrieval {
  chunks: SearchResult[];
  warnings: string[];
  blockedChunks: number;
}

export class PrivacyRetrievalService {
  constructor(private readonly payloads = new PayloadStoreService()) {}

  async filter(tenantId: string, chunks: SearchResult[]): Promise<PrivacyFilteredRetrieval> {
    const warnings: string[] = [];
    const safeChunks: SearchResult[] = [];
    let blockedChunks = 0;

    const refs = [...new Set(chunks.flatMap((chunk) => chunk.metadata.payloadRefs ?? []))];
    const activeRefs = await this.payloads.activeRefs(tenantId, refs);

    for (const chunk of chunks) {
      if (chunk.metadata.containsPersonalData) {
        blockedChunks += 1;
        warnings.push(`privacy_blocked_pii_chunk:${chunk.metadata.documentId}:${chunk.metadata.chunkIndex}`);
        continue;
      }

      const payloadRefs = chunk.metadata.payloadRefs ?? [];
      const inactiveRefs = payloadRefs.filter((ref) => !activeRefs.has(ref));
      if (inactiveRefs.length > 0) {
        safeChunks.push({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            payloadRefs: payloadRefs.filter((ref) => activeRefs.has(ref)),
            warnings: [...(chunk.metadata.warnings ?? []), 'Inactive or deleted payload references were removed before prompt use.'],
          },
        });
        warnings.push(`privacy_payload_refs_removed:${inactiveRefs.length}`);
        continue;
      }

      safeChunks.push(chunk);
    }

    return {
      chunks: safeChunks,
      warnings: [...new Set(warnings)],
      blockedChunks,
    };
  }
}
