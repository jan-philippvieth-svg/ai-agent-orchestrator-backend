import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { ResilienceService } from './resilience.service.js';
const memoryStore = [];
export class QdrantService {
    resilience;
    constructor(resilience = ResilienceService.getInstance()) {
        this.resilience = resilience;
    }
    headers() {
        return {
            'content-type': 'application/json',
            ...(config.qdrant.apiKey ? { 'api-key': config.qdrant.apiKey } : {}),
        };
    }
    async upsertChunks(chunks) {
        if (config.stubExternalServices) {
            for (const chunk of chunks) {
                if (!memoryStore.some((stored) => stored.metadata.contentHash === chunk.metadata.contentHash)) {
                    memoryStore.push(chunk);
                }
            }
            return;
        }
        const points = chunks.map((chunk) => ({
            id: chunk.id || randomUUID(),
            vector: chunk.vector ?? [],
            payload: {
                text: chunk.text,
                metadata: chunk.metadata,
            },
        }));
        const response = await this.resilience.run('qdrant:upsert', (signal) => fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}/points?wait=true`, {
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify({ points }),
            signal,
        }));
        if (!response.ok) {
            throw new Error(`Qdrant upsert failed with HTTP ${response.status}`);
        }
    }
    async search(vector, request) {
        if (config.stubExternalServices) {
            return this.memorySearch(request);
        }
        const must = [
            { key: 'metadata.tenantId', match: { value: request.tenantId } },
            { key: 'metadata.containsPersonalData', match: { value: false } },
            {
                should: [
                    { key: 'metadata.approvedForRetrieval', match: { value: true } },
                    { key: 'metadata.status', match: { value: 'approved' } },
                ],
            },
        ];
        if (request.projectId)
            must.push({ key: 'metadata.projectId', match: { value: request.projectId } });
        if (request.sourceType)
            must.push({ key: 'metadata.sourceType', match: { value: request.sourceType } });
        if (request.status)
            must.push({ key: 'metadata.status', match: { value: request.status } });
        const response = await this.resilience.run('qdrant:search', (signal) => fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}/points/search`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                vector,
                limit: request.limit,
                with_payload: true,
                filter: { must },
            }),
            signal,
        }));
        if (!response.ok) {
            throw new Error(`Qdrant search failed with HTTP ${response.status}`);
        }
        const data = (await response.json());
        return (data.result ?? [])
            .filter((item) => item.payload?.text && item.payload.metadata)
            .map((item) => ({
            text: item.payload?.text ?? '',
            score: item.score,
            metadata: item.payload?.metadata,
        }));
    }
    async hasContentHash(tenantId, contentHash) {
        if (config.stubExternalServices) {
            return memoryStore.some((chunk) => chunk.metadata.tenantId === tenantId && chunk.metadata.contentHash === contentHash);
        }
        const response = await this.resilience.run('qdrant:scroll', (signal) => fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}/points/scroll`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                limit: 1,
                with_payload: false,
                filter: {
                    must: [
                        { key: 'metadata.tenantId', match: { value: tenantId } },
                        { key: 'metadata.contentHash', match: { value: contentHash } },
                    ],
                },
            }),
            signal,
        }));
        if (!response.ok)
            return false;
        const data = (await response.json());
        return Boolean(data.result?.points?.length);
    }
    async deleteChunksByPayloadRefs(tenantId, payloadRefs) {
        const refs = payloadRefs.filter(Boolean);
        if (refs.length === 0)
            return 0;
        if (config.stubExternalServices) {
            let deleted = 0;
            for (let index = memoryStore.length - 1; index >= 0; index -= 1) {
                const chunk = memoryStore[index];
                if (chunk.metadata.tenantId === tenantId &&
                    chunk.metadata.containsPersonalData &&
                    chunk.metadata.payloadRefs.some((ref) => refs.includes(ref))) {
                    memoryStore.splice(index, 1);
                    deleted += 1;
                }
            }
            return deleted;
        }
        const response = await this.resilience.run('qdrant:delete-privacy', (signal) => fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}/points/delete?wait=true`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                filter: {
                    must: [
                        { key: 'metadata.tenantId', match: { value: tenantId } },
                        { key: 'metadata.containsPersonalData', match: { value: true } },
                        {
                            should: refs.map((ref) => ({
                                key: 'metadata.payloadRefs',
                                match: { value: ref },
                            })),
                        },
                    ],
                },
            }),
            signal,
        }));
        if (!response.ok) {
            throw new Error(`Qdrant privacy delete failed with HTTP ${response.status}`);
        }
        return refs.length;
    }
    async health() {
        if (config.stubExternalServices)
            return true;
        try {
            const response = await this.resilience.run('qdrant:health', (signal) => fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}`, {
                headers: config.qdrant.apiKey ? { 'api-key': config.qdrant.apiKey } : undefined,
                signal,
            }), { retries: 0, timeoutMs: 1500 });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    memorySearch(request) {
        return memoryStore
            .filter((chunk) => chunk.metadata.tenantId === request.tenantId)
            .filter((chunk) => !chunk.metadata.containsPersonalData)
            .filter((chunk) => chunk.metadata.approvedForRetrieval || chunk.metadata.status === 'approved')
            .filter((chunk) => !request.projectId || chunk.metadata.projectId === request.projectId)
            .filter((chunk) => !request.sourceType || chunk.metadata.sourceType === request.sourceType)
            .filter((chunk) => !request.status || chunk.metadata.status === request.status)
            .map((chunk) => ({
            text: chunk.text,
            score: this.keywordScore(request.query, chunk.text),
            metadata: chunk.metadata,
        }))
            .filter((result) => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, request.limit);
    }
    keywordScore(query, text) {
        const queryTerms = new Set(query.toLowerCase().split(/\W+/).filter((term) => term.length > 2));
        if (queryTerms.size === 0)
            return 0.1;
        const lowerText = text.toLowerCase();
        const hits = [...queryTerms].filter((term) => lowerText.includes(term)).length;
        return hits / queryTerms.size;
    }
}
