import { config } from '../config.js';
import type { ChatRequest, ChatResponse, SearchRequest, SearchResult } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { AnchorResolverService } from './anchorResolver.service.js';
import { CacheService } from './cache.service.js';
import { ClassifierService } from './classifier.service.js';
import { EfficiencyEstimatorService } from './efficiencyEstimator.service.js';
import { LlmService } from './llm.service.js';
import { LoggingService } from './logging.service.js';
import { MetricsService } from './metrics.service.js';
import { ModelRouterService } from './modelRouter.service.js';
import { PromptBuilderService } from './promptBuilder.service.js';
import { PromptGuardService } from './promptGuard.service.js';
import { RetrievalService, type RetrievalResult } from './retrieval.service.js';
import { ToolRegistryService } from './toolRegistry.service.js';
import { ToolRouterService } from './toolRouter.service.js';
import { UserInsightService } from './userInsight.service.js';

interface ChatOrchestratorOptions {
  providedApiKey?: string;
  allowLargeModelOverride?: boolean;
  correlationId?: string;
}

export class ChatOrchestratorService {
  constructor(
    private readonly classifier = new ClassifierService(),
    private readonly router = new ModelRouterService(),
    private readonly retrieval = new RetrievalService(),
    private readonly prompts = new PromptBuilderService(),
    private readonly llm = new LlmService(),
    private readonly logging = new LoggingService(),
    private readonly metrics = MetricsService.getInstance(),
    private readonly efficiency = new EfficiencyEstimatorService(),
    private readonly insights = new UserInsightService(),
    private readonly promptGuard = new PromptGuardService(),
    private readonly cache = CacheService.getInstance(),
    private readonly tools = new ToolRegistryService(),
    private readonly toolRouter = new ToolRouterService(),
    private readonly anchors = new AnchorResolverService(),
  ) {}

  async run(body: ChatRequest, options: ChatOrchestratorOptions = {}): Promise<ChatResponse> {
    const start = Date.now();
    const controls = body.controls ?? {};
    const promptGuardEnabled = controls.promptGuardEnabled !== false;
    const toolRouterEnabled = controls.toolRouterEnabled !== false;
    const cacheEnabled = controls.cacheEnabled !== false;
    const hybridRetrievalEnabled = controls.hybridRetrievalEnabled ?? config.retrieval.hybridEnabled;
    const semanticAnchorsEnabled = controls.semanticAnchorsEnabled ?? config.anchors.enabled;
    const guard = promptGuardEnabled
      ? this.promptGuard.evaluate(body.message)
      : {
          allowed: true,
          sanitizedMessage: body.message,
          warnings: ['prompt_guard_disabled_by_request'],
          categories: [],
          risk: 'low' as const,
        };
    const guardedBody: ChatRequest = { ...body, message: guard.sanitizedMessage };
    const classification = this.classifier.classify(guardedBody.message);

    if (!guard.allowed) {
      this.metrics.recordGuard({
        timestamp: new Date().toISOString(),
        blocked: true,
        reason: guard.reasonCode,
        category: guard.categories[0],
        tenantId: guardedBody.tenantId,
        userId: guardedBody.userId,
        classification,
        routedModel: 'small',
      });

      const processingTimeMs = Date.now() - start;
      const tokensEstimated = estimateTokens(guardedBody.message);
      const efficiency = this.efficiency.estimate({
        selectedModel: 'small',
        tokensEstimated,
        retrievalUsed: false,
        chunksUsed: 0,
      });

      return {
        success: true,
        answer:
          'Diese Anfrage wurde vom Prompt-Guard blockiert, weil sie versucht, interne Anweisungen oder sensible Informationen offenzulegen.',
        metadata: {
          selectedModel: 'small',
          routedModel: 'small',
          fallbackUsed: false,
          attemptedModels: [],
          classification,
          tokensEstimated,
          retrievalUsed: false,
          chunksUsed: 0,
          processingTimeMs,
          guard: {
            blocked: true,
            status: 'blocked',
            risk: guard.risk,
            category: guard.categories[0],
            categories: guard.categories,
            warnings: guard.warnings,
            reason: guard.reasonCode,
          },
          controls: {
            ...controls,
            retrievalEnabled: false,
            promptGuardEnabled,
            toolRouterEnabled,
            cacheEnabled,
            hybridRetrievalEnabled,
            semanticAnchorsEnabled,
            stubMode: config.stubExternalServices,
          },
          cache: {
            hit: false,
            eligible: false,
          },
          tools: {
            enabled: false,
            selected: [],
            calls: [],
          },
          efficiency: {
            actualTokens: efficiency.actualTokens,
            baselineTokens: efficiency.baselineTokens,
            savedTokens: efficiency.savedTokens,
            tokensSavedPercent: efficiency.tokensSavedPercent,
            estimatedLlmWorkSavedPercent: efficiency.savedPercent,
            actualLlmWorkUnits: efficiency.actualLlmWorkUnits,
            baselineLlmWorkUnits: efficiency.baselineLlmWorkUnits,
            savedLlmWorkUnits: efficiency.savedLlmWorkUnits,
            method: efficiency.method,
          },
        },
      };
    }

    const allowLargeModelOverride =
      Boolean(options.allowLargeModelOverride) ||
      config.security.largeModelAllowedUsers.includes(guardedBody.userId) ||
      (typeof options.providedApiKey === 'string' &&
        config.security.largeModelAllowedApiKeys.includes(options.providedApiKey));
    const anchorResolution = await this.anchors.resolve(guardedBody, semanticAnchorsEnabled);
    const selectedModel = this.router.selectModel(classification, guardedBody.preferredModel, { allowLargeModelOverride });
    const cacheEligible =
      config.cache.enabled &&
      cacheEnabled &&
      classification === 'simple' &&
      !guardedBody.useRetrieval &&
      selectedModel === 'small' &&
      !guard.categories.length;
    const cacheKey = cacheEligible
      ? this.cache.buildChatKey({
          tenantId: guardedBody.tenantId,
          userId: guardedBody.userId,
          message: guardedBody.message,
          selectedModel,
          preferredModel: guardedBody.preferredModel,
        })
      : undefined;

    if (cacheKey) {
      const cached = this.cache.get<Pick<ChatResponse, 'answer' | 'metadata'>>(cacheKey);
      if (cached) {
        this.metrics.recordCache('hit');
        this.metrics.recordGuard({
          timestamp: new Date().toISOString(),
          blocked: false,
          tenantId: guardedBody.tenantId,
          userId: guardedBody.userId,
          classification,
          routedModel: selectedModel,
        });

        const processingTimeMs = Date.now() - start;
        this.logging.chat({
          correlationId: options.correlationId,
          tenantId: guardedBody.tenantId,
          userId: guardedBody.userId,
          classification,
          selectedModel: cached.metadata.selectedModel,
          chunksUsed: cached.metadata.chunksUsed,
          processingTimeMs,
        });

        const response: ChatResponse = {
          success: true,
          answer: cached.answer,
          metadata: {
            ...cached.metadata,
            processingTimeMs,
            cache: {
              hit: true,
              eligible: true,
            },
            controls: {
              ...controls,
              retrievalEnabled: guardedBody.useRetrieval,
              promptGuardEnabled,
              toolRouterEnabled,
              cacheEnabled,
              hybridRetrievalEnabled,
              semanticAnchorsEnabled,
              stubMode: config.stubExternalServices,
            },
            anchors: anchorResolution,
          },
        };

        await this.insights.recordInteraction({
          tenantId: guardedBody.tenantId,
          userId: guardedBody.userId,
          message: guardedBody.message,
          response,
        });

        return response;
      }
      this.metrics.recordCache('miss');
    }

    this.metrics.recordGuard({
      timestamp: new Date().toISOString(),
      blocked: false,
      tenantId: guardedBody.tenantId,
      userId: guardedBody.userId,
      classification,
      routedModel: selectedModel,
    });

    let chunks: SearchResult[] = [];
    let retrievalResult: RetrievalResult | undefined;
    const warnings: string[] = [];
    if (guardedBody.useRetrieval) {
      try {
        const searchRequest: SearchRequest = {
          tenantId: guardedBody.tenantId,
          query: guardedBody.message,
          projectId: guardedBody.metadata?.projectId ?? anchorResolution.appliedFilters.projectId,
          sourceType: guardedBody.metadata?.sourceType ?? anchorResolution.appliedFilters.sourceType,
          status: anchorResolution.appliedFilters.status,
          tags: anchorResolution.appliedFilters.tags,
          limit: config.retrieval.defaultLimit,
          useHybridRetrieval: hybridRetrievalEnabled,
        };
        retrievalResult = await this.retrieval.retrieve(searchRequest);
        chunks = retrievalResult.results;
        warnings.push(...retrievalResult.warnings);
      } catch (error) {
        warnings.push('retrieval_unavailable');
        this.logging.chat({
          correlationId: options.correlationId,
          tenantId: guardedBody.tenantId,
          userId: guardedBody.userId,
          classification,
          selectedModel,
          chunksUsed: 0,
          processingTimeMs: Date.now() - start,
        });
      }
    }

    const toolRouting = toolRouterEnabled
      ? this.toolRouter.route({
          request: guardedBody,
          classification,
          selectedModel,
          anchors: anchorResolution,
        })
      : { enabled: false, selected: [] };
    const toolResults = await this.tools.executeForChat(
      guardedBody,
      toolRouting.selected.map((tool) => tool.name),
      anchorResolution,
    );
    const toolWarnings = toolResults.filter((result) => result.status === 'error').map((result) => `tool_failed:${result.name}`);
    warnings.push(...toolWarnings);

    const prompt = this.prompts.build(guardedBody.message, chunks, toolResults, toolRouting.selected);
    const completion = await this.llm.complete({
      modelSize: selectedModel,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
    });

    const processingTimeMs = Date.now() - start;
    const tokensEstimated = Math.max(prompt.tokensEstimated, completion.tokensEstimated);
    const efficiency = this.efficiency.estimate({
      selectedModel: completion.usedModelSize,
      tokensEstimated,
      retrievalUsed: guardedBody.useRetrieval,
      chunksUsed: chunks.length,
    });

    this.logging.chat({
      correlationId: options.correlationId,
      tenantId: guardedBody.tenantId,
      userId: guardedBody.userId,
      classification,
      selectedModel: completion.usedModelSize,
      chunksUsed: chunks.length,
      processingTimeMs,
    });
    this.metrics.recordChat({
      classification,
      selectedModel: completion.usedModelSize,
      retrievalUsed: guardedBody.useRetrieval,
      chunksUsed: chunks.length,
      tokensEstimated,
      processingTimeMs,
      actualLlmWorkUnits: efficiency.actualLlmWorkUnits,
      baselineLlmWorkUnits: efficiency.baselineLlmWorkUnits,
      savedLlmWorkUnits: efficiency.savedLlmWorkUnits,
      savedPercent: efficiency.savedPercent,
      actualTokens: efficiency.actualTokens,
      baselineTokens: efficiency.baselineTokens,
      savedTokens: efficiency.savedTokens,
      tokensSavedPercent: efficiency.tokensSavedPercent,
      fallbackUsed: completion.fallbackUsed,
      attemptedModels: completion.attemptedModels.length,
    });

    const response: ChatResponse = {
      success: true,
      answer: completion.answer,
      metadata: {
        selectedModel: completion.usedModelSize,
        routedModel: selectedModel,
        fallbackUsed: completion.fallbackUsed,
        attemptedModels: completion.attemptedModels,
        classification,
        tokensEstimated,
        retrievalUsed: guardedBody.useRetrieval,
        retrievalMode: guardedBody.useRetrieval
          ? (retrievalResult?.mode ?? (hybridRetrievalEnabled ? 'hybrid' : 'vector'))
          : 'disabled',
        retrievalDiagnostics: guardedBody.useRetrieval ? retrievalResult?.diagnostics : undefined,
        anchors: anchorResolution,
        chunksUsed: chunks.length,
        processingTimeMs,
        warnings: warnings.length > 0 ? warnings : undefined,
        cache: {
          hit: false,
          eligible: cacheEligible,
        },
        tools: {
          enabled: toolRouting.enabled,
          selected: toolRouting.selected,
          calls: toolResults.map((result) => ({
            name: result.name,
            status: result.status,
            itemsUsed: result.itemsUsed,
            rawTokensEstimated: result.rawTokensEstimated,
            injectedTokens: result.injectedTokens,
            savedTokens: result.savedTokens,
            reductionPercent: result.reductionPercent,
            processingTimeMs: result.processingTimeMs,
            error: result.error,
          })),
        },
        guard: {
          blocked: false,
          status: promptGuardEnabled ? 'allowed' : undefined,
          warnings: promptGuardEnabled ? undefined : guard.warnings,
        },
        controls: {
          ...controls,
          retrievalEnabled: guardedBody.useRetrieval,
          promptGuardEnabled,
          toolRouterEnabled,
          cacheEnabled,
          hybridRetrievalEnabled,
          semanticAnchorsEnabled,
          stubMode: config.stubExternalServices,
        },
        efficiency: {
          actualTokens: efficiency.actualTokens,
          baselineTokens: efficiency.baselineTokens,
          savedTokens: efficiency.savedTokens,
          tokensSavedPercent: efficiency.tokensSavedPercent,
          estimatedLlmWorkSavedPercent: efficiency.savedPercent,
          actualLlmWorkUnits: efficiency.actualLlmWorkUnits,
          baselineLlmWorkUnits: efficiency.baselineLlmWorkUnits,
          savedLlmWorkUnits: efficiency.savedLlmWorkUnits,
          method: efficiency.method,
        },
      },
    };

    await this.insights.recordInteraction({
      tenantId: guardedBody.tenantId,
      userId: guardedBody.userId,
      message: guardedBody.message,
      response,
    });

    if (cacheKey) {
      this.cache.set(cacheKey, this.cache.toChatCacheValue(response));
      this.metrics.recordCache('write');
    }

    return response;
  }
}
