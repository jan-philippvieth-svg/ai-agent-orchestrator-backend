import { config } from '../config.js';
import type { SearchRequest, SearchResult } from '../types/index.js';
import { EmbeddingService } from './embedding.service.js';
import { PrivacyRetrievalService } from './privacyRetrieval.service.js';
import { QdrantService } from './qdrant.service.js';
import { RankFusionService } from './rankFusion.service.js';
import { SparseSearchService } from './sparseSearch.service.js';

export interface RetrievalResult {
  results: SearchResult[];
  warnings: string[];
  mode: 'vector' | 'hybrid';
  diagnostics: {
    vectorResults: number;
    sparseResults: number;
    fusedResults: number;
    rankFusion: 'rrf' | 'none';
  };
}

export class RetrievalService {
  constructor(
    private readonly embeddings = new EmbeddingService(),
    private readonly qdrant = new QdrantService(),
    private readonly sparse = new SparseSearchService(),
    private readonly fusion = new RankFusionService(),
    private readonly privacy = new PrivacyRetrievalService(),
  ) {}

  async retrieve(request: SearchRequest): Promise<RetrievalResult> {
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
