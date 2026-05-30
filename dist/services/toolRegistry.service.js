import { config } from '../config.js';
import { MetricsService } from './metrics.service.js';
import { RetrievalService } from './retrieval.service.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
export class ToolRegistryService {
    retrieval;
    metrics;
    constructor(retrieval = new RetrievalService(), metrics = MetricsService.getInstance()) {
        this.retrieval = retrieval;
        this.metrics = metrics;
    }
    async executeForChat(request, selectedTools, anchors) {
        if (!config.tools.enabled || selectedTools.length === 0)
            return [];
        const results = [];
        for (const toolName of selectedTools) {
            const result = toolName === 'get_stats' ? await this.getStats() : await this.searchKnowledge(request, anchors);
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
    async getStats() {
        const start = Date.now();
        try {
            const snapshot = this.metrics.snapshot();
            const rawContent = JSON.stringify(snapshot, null, 2);
            const content = JSON.stringify({
                efficiency: snapshot.efficiency,
                cache: snapshot.cache,
                guard: snapshot.guard,
                resilience: snapshot.resilience,
                tools: snapshot.tools,
            }, null, 2);
            return {
                name: 'get_stats',
                status: 'success',
                content,
                itemsUsed: 1,
                ...this.tokenEfficiency(rawContent, content),
                processingTimeMs: Date.now() - start,
            };
        }
        catch (error) {
            return this.toolError('get_stats', start, error);
        }
    }
    async searchKnowledge(request, anchors) {
        const start = Date.now();
        try {
            const searchRequest = {
                tenantId: request.tenantId,
                query: request.message,
                projectId: request.metadata?.projectId ?? anchors?.appliedFilters.projectId,
                sourceType: request.metadata?.sourceType ?? anchors?.appliedFilters.sourceType,
                status: anchors?.appliedFilters.status,
                tags: anchors?.appliedFilters.tags,
                limit: config.tools.searchLimit,
                useHybridRetrieval: request.controls?.hybridRetrievalEnabled ?? config.retrieval.hybridEnabled,
            };
            const retrievalResult = await this.retrieval.retrieve(searchRequest);
            const rawContent = JSON.stringify(retrievalResult, null, 2);
            const content = JSON.stringify({
                retrievalMode: retrievalResult.mode,
                diagnostics: retrievalResult.diagnostics,
                results: retrievalResult.results.map((result) => ({
                    score: result.score,
                    title: result.metadata.title,
                    sourceType: result.metadata.sourceType,
                    projectId: result.metadata.projectId,
                    chunkIndex: result.metadata.chunkIndex,
                    excerpt: result.text.slice(0, 700),
                })),
            }, null, 2);
            return {
                name: 'search_knowledge',
                status: 'success',
                content,
                itemsUsed: retrievalResult.results.length,
                ...this.tokenEfficiency(rawContent, content),
                processingTimeMs: Date.now() - start,
            };
        }
        catch (error) {
            return this.toolError('search_knowledge', start, error);
        }
    }
    toolError(name, start, error) {
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
    tokenEfficiency(rawContent, injectedContent) {
        const rawTokensEstimated = estimateTokens(rawContent);
        const injectedTokens = estimateTokens(injectedContent);
        const savedTokens = Math.max(0, rawTokensEstimated - injectedTokens);
        const reductionPercent = rawTokensEstimated > 0 ? Math.round((savedTokens / rawTokensEstimated) * 1000) / 10 : 0;
        return {
            rawTokensEstimated,
            injectedTokens,
            savedTokens,
            reductionPercent,
        };
    }
}
