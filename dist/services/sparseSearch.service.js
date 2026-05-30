import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
const indexPath = join(process.cwd(), 'data', 'sparse-index.json');
export class SparseSearchService {
    async indexChunks(chunks) {
        if (!config.retrieval.sparseEnabled || chunks.length === 0)
            return;
        const existing = await this.readIndex();
        const byHash = new Map(existing.map((record) => [record.metadata.contentHash, record]));
        for (const chunk of chunks) {
            byHash.set(chunk.metadata.contentHash, {
                id: chunk.id,
                text: chunk.text,
                metadata: chunk.metadata,
                terms: this.termFrequency(`${chunk.metadata.title} ${chunk.metadata.tags.join(' ')} ${chunk.text}`),
                length: this.tokenize(chunk.text).length,
            });
        }
        await this.writeIndex([...byHash.values()]);
    }
    async search(request, limit = config.retrieval.sparseLimit) {
        if (!config.retrieval.sparseEnabled)
            return [];
        const records = (await this.readIndex())
            .filter((record) => record.metadata.tenantId === request.tenantId)
            .filter((record) => !record.metadata.containsPersonalData)
            .filter((record) => record.metadata.approvedForRetrieval || record.metadata.status === 'approved')
            .filter((record) => !request.projectId || record.metadata.projectId === request.projectId)
            .filter((record) => !request.sourceType || record.metadata.sourceType === request.sourceType)
            .filter((record) => !request.status || record.metadata.status === request.status)
            .filter((record) => !request.tags?.length || request.tags.some((tag) => record.metadata.tags.includes(tag)));
        const queryTerms = [...new Set(this.tokenize(request.query))];
        if (queryTerms.length === 0 || records.length === 0)
            return [];
        const avgLength = records.reduce((sum, record) => sum + record.length, 0) / records.length;
        const scored = records
            .map((record) => ({
            record,
            score: this.bm25Score(record, records, queryTerms, avgLength),
        }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        return scored.map((item) => ({
            text: item.record.text,
            score: Math.round(item.score * 1000) / 1000,
            metadata: item.record.metadata,
        }));
    }
    bm25Score(record, corpus, queryTerms, avgLength) {
        const k1 = 1.2;
        const b = 0.75;
        return queryTerms.reduce((score, term) => {
            const tf = record.terms[term] ?? 0;
            if (tf === 0)
                return score;
            const docsWithTerm = corpus.filter((item) => item.terms[term]).length;
            const idf = Math.log(1 + (corpus.length - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
            const denominator = tf + k1 * (1 - b + b * (record.length / Math.max(avgLength, 1)));
            return score + idf * ((tf * (k1 + 1)) / denominator);
        }, 0);
    }
    termFrequency(text) {
        return this.tokenize(text).reduce((acc, term) => {
            acc[term] = (acc[term] ?? 0) + 1;
            return acc;
        }, {});
    }
    tokenize(text) {
        return text
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9_.-]+/i)
            .map((term) => term.trim())
            .filter((term) => term.length >= 2);
    }
    async readIndex() {
        try {
            return JSON.parse(await readFile(indexPath, 'utf8'));
        }
        catch {
            return [];
        }
    }
    async writeIndex(records) {
        await mkdir(dirname(indexPath), { recursive: true });
        await writeFile(indexPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    }
}
