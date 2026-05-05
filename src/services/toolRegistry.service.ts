import { config } from '../config.js';
import type { ChatRequest, SearchRequest, ToolCallResult, ToolName } from '../types/index.js';
import { EmbeddingService } from './embedding.service.js';
import { MetricsService } from './metrics.service.js';
import { QdrantService } from './qdrant.service.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

export class ToolRegistryService {
  constructor(
    private readonly embeddings = new EmbeddingService(),
    private readonly qdrant = new QdrantService(),
    private readonly metrics = MetricsService.getInstance(),
  ) {}

  async executeForChat(request: ChatRequest, selectedTools: ToolName[]): Promise<ToolCallResult[]> {
    if (!config.tools.enabled || selectedTools.length === 0) return [];

    const results: ToolCallResult[] = [];

    for (const toolName of selectedTools) {
      const result = toolName === 'get_stats' ? await this.getStats() : await this.searchKnowledge(request);
      this.metrics.recordTool({
        name: result.name,
        status: result.status,
        processingTimeMs: result.processingTimeMs,
        itemsUsed: result.itemsUsed,
        rawTokensEstimated: result.rawTokensEstimated,
        injectedTokens: result.injectedTokens,
        savedTokens: result.savedTokens,
      });
      results.push(result);
    }

    return results;
  }

  private async getStats(): Promise<ToolCallResult> {
    const start = Date.now();
    try {
      const snapshot = this.metrics.snapshot();
      const rawContent = JSON.stringify(snapshot, null, 2);
      const content = JSON.stringify(
        {
          efficiency: snapshot.efficiency,
          cache: snapshot.cache,
          guard: snapshot.guard,
          resilience: snapshot.resilience,
          tools: snapshot.tools,
        },
        null,
        2,
      );
      return {
        name: 'get_stats',
        status: 'success',
        content,
        itemsUsed: 1,
        ...this.tokenEfficiency(rawContent, content),
        processingTimeMs: Date.now() - start,
      };
    } catch (error) {
      return this.toolError('get_stats', start, error);
    }
  }

  private async searchKnowledge(request: ChatRequest): Promise<ToolCallResult> {
    const start = Date.now();
    try {
      const vector = await this.embeddings.embed(request.message);
      const searchRequest: SearchRequest = {
        tenantId: request.tenantId,
        query: request.message,
        projectId: request.metadata?.projectId,
        sourceType: request.metadata?.sourceType,
        limit: config.tools.searchLimit,
      };
      const results = await this.qdrant.search(vector, searchRequest);
      const rawContent = JSON.stringify(results, null, 2);
      const content = JSON.stringify(
        results.map((result) => ({
          score: result.score,
          title: result.metadata.title,
          sourceType: result.metadata.sourceType,
          projectId: result.metadata.projectId,
          chunkIndex: result.metadata.chunkIndex,
          excerpt: result.text.slice(0, 700),
        })),
        null,
        2,
      );

      return {
        name: 'search_knowledge',
        status: 'success',
        content,
        itemsUsed: results.length,
        ...this.tokenEfficiency(rawContent, content),
        processingTimeMs: Date.now() - start,
      };
    } catch (error) {
      return this.toolError('search_knowledge', start, error);
    }
  }

  private toolError(name: string, start: number, error: unknown): ToolCallResult {
    return {
      name,
      status: 'error',
      content: '',
      itemsUsed: 0,
      rawTokensEstimated: 0,
      injectedTokens: 0,
      savedTokens: 0,
      reductionPercent: 0,
      processingTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'tool_failed',
    };
  }

  private tokenEfficiency(rawContent: string, injectedContent: string) {
    const rawTokensEstimated = estimateTokens(rawContent);
    const injectedTokens = estimateTokens(injectedContent);
    const savedTokens = Math.max(0, rawTokensEstimated - injectedTokens);
    const reductionPercent =
      rawTokensEstimated > 0 ? Math.round((savedTokens / rawTokensEstimated) * 1000) / 10 : 0;

    return {
      rawTokensEstimated,
      injectedTokens,
      savedTokens,
      reductionPercent,
    };
  }
}
