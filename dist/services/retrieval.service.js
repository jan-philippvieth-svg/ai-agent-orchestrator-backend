import { config } from '../config.js';
import { EmbeddingService } from './embedding.service.js';
import { PrivacyRetrievalService } from './privacyRetrieval.service.js';
import { QdrantService } from './qdrant.service.js';
import { RankFusionService } from './rankFusion.service.js';
import { SparseSearchService } from './sparseSearch.service.js';
export class RetrievalService {
    embeddings;
    qdrant;
    sparse;
    fusion;
    privacy;
    constructor(embeddings = new EmbeddingService(), qdrant = new QdrantService(), sparse = new SparseSearchService(), fusion = new RankFusionService(), privacy = new PrivacyRetrievalService()) {
        this.embeddings = embeddings;
        this.qdrant = qdrant;
        this.sparse = sparse;
        this.fusion = fusion;
        this.privacy = privacy;
    }
    async retrieve(request) {
        const useHybrid = request.useHybridRetrieval ?? config.retrieval.hybridEnabled;
        const vector = await this.embeddings.embed(request.query);
        const vectorResults = await this.qdrant.search(vector, request);
        const sparseResults = useHybrid ? await this.sparse.search(request) : [];
        const fused = useHybrid
            ? this.fusion.reciprocalRankFusion(vectorResults, sparseResults, request.limit)
            : vectorResults.slice(0, request.limit);
        const privacyFiltered = await this.privacy.filter(request.tenantId, fused);
        return {
            results: privacyFiltered.chunks,
            warnings: privacyFiltered.warnings,
            mode: useHybrid ? 'hybrid' : 'vector',
            diagnostics: {
                vectorResults: vectorResults.length,
                sparseResults: sparseResults.length,
                fusedResults: fused.length,
                rankFusion: useHybrid ? 'rrf' : 'none',
            },
        };
    }
}
