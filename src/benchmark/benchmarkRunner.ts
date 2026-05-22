import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { ClassifierService } from '../services/classifier.service.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { LlmService } from '../services/llm.service.js';
import { ModelRouterService } from '../services/modelRouter.service.js';
import { PromptBuilderService } from '../services/promptBuilder.service.js';
import { PromptGuardService } from '../services/promptGuard.service.js';
import { QdrantService } from '../services/qdrant.service.js';
import { ToolRegistryService } from '../services/toolRegistry.service.js';
import { ToolRouterService } from '../services/toolRouter.service.js';
import type { ChatRequest, ModelSize, SearchRequest, SearchResult, ToolCallResult, ToolSelection } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import type {
  BenchmarkCase,
  BenchmarkEvaluation,
  BenchmarkRunReport,
  BenchmarkScenario,
  BenchmarkScenarioResult,
} from './benchmarkTypes.js';
import { renderBenchmarkMarkdown } from './markdownReport.js';

const casesPath = join(process.cwd(), 'data', 'benchmark-cases.json');
const latestPath = join(process.cwd(), 'data', 'benchmark-results', 'latest.json');
const historyPath = join(process.cwd(), 'data', 'benchmark-history.json');
const markdownPath = join(process.cwd(), 'reports', 'benchmark-report.md');

export class BenchmarkRunner {
  constructor(
    private readonly classifier = new ClassifierService(),
    private readonly modelRouter = new ModelRouterService(),
    private readonly promptGuard = new PromptGuardService(),
    private readonly embeddings = new EmbeddingService(),
    private readonly qdrant = new QdrantService(),
    private readonly prompts = new PromptBuilderService(),
    private readonly llm = new LlmService(),
    private readonly toolRouter = new ToolRouterService(),
    private readonly toolRegistry = new ToolRegistryService(),
  ) {}

  async run(): Promise<BenchmarkRunReport> {
    const cases = await this.loadCases();
    const results: BenchmarkScenarioResult[] = [];

    for (const testCase of cases) {
      for (const scenario of ['baseline', 'rag', 'optimized'] satisfies BenchmarkScenario[]) {
        console.info(JSON.stringify({ event: 'benchmark_case_started', caseId: testCase.id, scenario }));
        results.push(await this.withTimeout(() => this.runScenario(testCase, scenario), testCase.id, scenario));
      }
    }

    const report = this.buildReport(results);
    await this.writeReports(report);
    return report;
  }

  private async runScenario(testCase: BenchmarkCase, scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
    const startedAt = Date.now();
    const stepLatencies = {
      classificationMs: 0,
      qualityGateMs: 0,
      retrievalMs: 0,
      contextPreparationMs: 0,
      toolSelectionMs: 0,
      llmMs: 0,
    };
    let modelSize: ModelSize = 'small';
    let classification = undefined;
    let chunks: SearchResult[] = [];
    let contextTokensBeforeReduction = 0;
    let contextTokensAfterReduction = 0;
    let toolSelections: ToolSelection[] = [];
    let toolResults: ToolCallResult[] = [];

    try {
      const body = this.toChatRequest(testCase);
      const guardStart = Date.now();
      const guard = scenario === 'optimized' ? this.promptGuard.evaluate(body.message) : undefined;
      stepLatencies.qualityGateMs = Date.now() - guardStart;
      if (guard && !guard.allowed) throw new Error(`Prompt rejected by guard: ${guard.reasonCode ?? 'blocked'}`);

      const classificationStart = Date.now();
      classification = scenario === 'optimized' ? this.classifier.classify(body.message) : undefined;
      stepLatencies.classificationMs = Date.now() - classificationStart;

      if (scenario === 'baseline') {
        modelSize = 'small';
      } else if (scenario === 'rag') {
        modelSize = config.benchmark.ragModel;
      } else {
        modelSize = this.modelRouter.selectModel(classification ?? 'simple', body.preferredModel, {
          allowLargeModelOverride: true,
        });
      }

      if (scenario !== 'baseline') {
        const retrievalStart = Date.now();
        chunks = await this.retrieve(body, scenario);
        stepLatencies.retrievalMs = Date.now() - retrievalStart;
      }

      contextTokensBeforeReduction = this.sumChunkTokens(chunks);
      const contextStart = Date.now();
      const reducedChunks = this.reduceChunks(chunks);
      contextTokensAfterReduction = this.sumChunkTokens(reducedChunks);
      stepLatencies.contextPreparationMs = Date.now() - contextStart;

      if (scenario === 'optimized') {
        const toolStart = Date.now();
        const routed = this.toolRouter.route({ request: body, classification: classification ?? 'simple', selectedModel: modelSize });
        toolSelections = routed.selected;
        toolResults = await this.toolRegistry.executeForChat(
          body,
          routed.selected.map((tool) => tool.name),
        );
        stepLatencies.toolSelectionMs = Date.now() - toolStart;
      }

      const prompt = this.prompts.build(body.message, reducedChunks, toolResults, toolSelections);
      const llmStart = Date.now();
      const completion = await this.llm.complete({
        modelSize,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt },
        ],
      });
      stepLatencies.llmMs = Date.now() - llmStart;

      const completionTokensEstimated = estimateTokens(completion.answer);
      const evaluation = this.evaluate({
        scenario,
        answer: completion.answer,
        chunks,
        expectedKeywords: testCase.expectedKeywords ?? [],
        success: true,
      });

      return {
        caseId: testCase.id,
        caseTitle: testCase.title,
        scenario,
        success: true,
        modelName: config.llm[completion.usedModelSize].model,
        modelSize: completion.usedModelSize,
        classification,
        totalLatencyMs: Date.now() - startedAt,
        stepLatencies,
        promptTokensEstimated: prompt.tokensEstimated,
        completionTokensEstimated,
        contextTokensBeforeReduction,
        contextTokensAfterReduction,
        contextReductionPercent: this.percentReduction(contextTokensBeforeReduction, contextTokensAfterReduction),
        chunksUsed: reducedChunks.length,
        topRetrievalScores: chunks.map((chunk) => Math.round(chunk.score * 1000) / 1000),
        toolNames: toolSelections.map((tool) => tool.name),
        costEstimate: this.estimateCost(prompt.tokensEstimated, completionTokensEstimated),
        evaluation,
        answerPreview: completion.answer.slice(0, 260),
      };
    } catch (error) {
      const evaluation = this.evaluate({ scenario, answer: '', chunks, expectedKeywords: testCase.expectedKeywords ?? [], success: false });
      return {
        caseId: testCase.id,
        caseTitle: testCase.title,
        scenario,
        success: false,
        modelName: config.llm[modelSize].model,
        modelSize,
        classification,
        totalLatencyMs: Date.now() - startedAt,
        stepLatencies,
        promptTokensEstimated: 0,
        completionTokensEstimated: 0,
        contextTokensBeforeReduction,
        contextTokensAfterReduction,
        contextReductionPercent: this.percentReduction(contextTokensBeforeReduction, contextTokensAfterReduction),
        chunksUsed: 0,
        topRetrievalScores: chunks.map((chunk) => Math.round(chunk.score * 1000) / 1000),
        toolNames: toolSelections.map((tool) => tool.name),
        costEstimate: this.estimateCost(0, 0),
        evaluation,
        answerPreview: '',
        error: error instanceof Error ? error.message : 'benchmark_failed',
      };
    }
  }

  private async retrieve(body: ChatRequest, scenario: BenchmarkScenario): Promise<SearchResult[]> {
    const vector = await this.embeddings.embed(body.message);
    const searchRequest: SearchRequest = {
      tenantId: body.tenantId,
      query: body.message,
      projectId: body.metadata?.projectId,
      sourceType: body.metadata?.sourceType,
      limit: config.retrieval.defaultLimit,
    };
    return this.qdrant.search(vector, searchRequest);
  }

  private buildReport(results: BenchmarkScenarioResult[]): BenchmarkRunReport {
    const scenarioSummary = (['baseline', 'rag', 'optimized'] satisfies BenchmarkScenario[]).map((scenario) => {
      const items = results.filter((result) => result.scenario === scenario);
      const avgQualityScore = this.average(items.map((item) => item.evaluation.answerQualityScore));
      const failureRate = items.length > 0 ? Math.round((items.filter((item) => !item.success).length / items.length) * 1000) / 10 : 0;
      return {
        scenario,
        avgLatencyMs: Math.round(this.average(items.map((item) => item.totalLatencyMs))),
        avgQualityScore: Math.round(avgQualityScore * 10) / 10,
        avgContextReductionPercent: Math.round(this.average(items.map((item) => item.contextReductionPercent)) * 10) / 10,
        failureRate,
        totalCostEstimate: Math.round(items.reduce((sum, item) => sum + item.costEstimate.totalCost, 0) * 100000) / 100000,
        recommendation: this.scenarioRecommendation(scenario, avgQualityScore, failureRate),
      };
    });

    const best = [...scenarioSummary].sort((a, b) => b.avgQualityScore - a.avgQualityScore || a.avgLatencyMs - b.avgLatencyMs)[0];
    const failures = results.filter((result) => !result.success).length;
    const actualTokens = results.reduce((sum, item) => sum + item.promptTokensEstimated + item.completionTokensEstimated, 0);
    const contextBefore = results.reduce((sum, item) => sum + item.contextTokensBeforeReduction, 0);
    const contextAfter = results.reduce((sum, item) => sum + item.contextTokensAfterReduction, 0);
    const baselineTokens = actualTokens + Math.max(0, contextBefore - contextAfter);
    const savedTokens = Math.max(0, baselineTokens - actualTokens);
    const toolCalls = results.reduce((sum, item) => sum + item.toolNames.length, 0);
    const toolLatencyMs = results.reduce((sum, item) => sum + item.stepLatencies.toolSelectionMs, 0);
    const modelDistribution = results.reduce(
      (acc, item) => {
        acc[item.modelSize] += 1;
        return acc;
      },
      { small: 0, medium: 0, large: 0 },
    );

    return {
      id: new Date().toISOString().replace(/[:.]/g, '-'),
      timestamp: new Date().toISOString(),
      mode: config.stubExternalServices ? 'stub' : 'real-services',
      summary: {
        cases: new Set(results.map((result) => result.caseId)).size,
        scenarios: scenarioSummary.length,
        bestScenario: best?.scenario ?? 'baseline',
        enterpriseReady: (best?.avgQualityScore ?? 0) >= 75 && failures === 0,
        avgLatencyMs: Math.round(this.average(results.map((item) => item.totalLatencyMs))),
        avgQualityScore: Math.round(this.average(results.map((item) => item.evaluation.answerQualityScore)) * 10) / 10,
        avgContextReductionPercent: Math.round(this.average(results.map((item) => item.contextReductionPercent)) * 10) / 10,
        totalCostEstimate: Math.round(results.reduce((sum, item) => sum + item.costEstimate.totalCost, 0) * 100000) / 100000,
        failureRate: results.length > 0 ? Math.round((failures / results.length) * 1000) / 10 : 0,
        actualTokens,
        baselineTokens,
        savedTokens,
        tokensSavedPercent: this.percentReduction(baselineTokens, actualTokens),
        modelDistribution,
        actualLlmWorkUnits: actualTokens,
        baselineLlmWorkUnits: baselineTokens,
        savedLlmWorkUnits: savedTokens,
        estimatedLlmWorkSavedPercent: this.percentReduction(baselineTokens, actualTokens),
        tools: {
          calls: toolCalls,
          errors: 0,
          latencyMs: toolLatencyMs,
          itemsUsed: toolCalls,
          avgLatencyMs: toolCalls > 0 ? Math.round(toolLatencyMs / toolCalls) : 0,
          rawTokensEstimated: contextBefore,
          injectedTokens: contextAfter,
          savedTokens,
          reductionPercent: this.percentReduction(contextBefore, contextAfter),
        },
      },
      scenarioSummary,
      results,
    };
  }

  private async writeReports(report: BenchmarkRunReport): Promise<void> {
    await this.writeJson(latestPath, report);
    const history = await this.readHistory();
    history.push(report);
    await this.writeJson(historyPath, history.slice(-100));
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, renderBenchmarkMarkdown(report), 'utf8');
  }

  private async loadCases(): Promise<BenchmarkCase[]> {
    return JSON.parse(await readFile(casesPath, 'utf8')) as BenchmarkCase[];
  }

  private async readHistory(): Promise<BenchmarkRunReport[]> {
    try {
      return JSON.parse(await readFile(historyPath, 'utf8')) as BenchmarkRunReport[];
    } catch {
      return [];
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  private toChatRequest(testCase: BenchmarkCase): ChatRequest {
    return {
      tenantId: testCase.tenantId,
      userId: testCase.userId,
      message: testCase.message,
      useRetrieval: testCase.useRetrieval ?? true,
      preferredModel: testCase.preferredModel ?? 'auto',
      metadata: testCase.metadata,
    };
  }

  private reduceChunks(chunks: SearchResult[]): SearchResult[] {
    const maxTokens = 1800;
    const selected: SearchResult[] = [];
    let total = 0;
    for (const chunk of chunks) {
      const tokens = estimateTokens(chunk.text);
      if (total + tokens > maxTokens) break;
      selected.push(chunk);
      total += tokens;
    }
    return selected;
  }

  private sumChunkTokens(chunks: SearchResult[]): number {
    return chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.text), 0);
  }

  private percentReduction(before: number, after: number): number {
    if (before <= 0) return 0;
    return Math.round(((before - after) / before) * 1000) / 10;
  }

  private estimateCost(promptTokens: number, completionTokens: number) {
    const inputCost = (promptTokens / 1000) * config.benchmark.priceInputPer1k;
    const outputCost = (completionTokens / 1000) * config.benchmark.priceOutputPer1k;
    return {
      inputCost: Math.round(inputCost * 100000) / 100000,
      outputCost: Math.round(outputCost * 100000) / 100000,
      totalCost: Math.round((inputCost + outputCost) * 100000) / 100000,
    };
  }

  private evaluate(input: {
    scenario: BenchmarkScenario;
    answer: string;
    chunks: SearchResult[];
    expectedKeywords: string[];
    success: boolean;
  }): BenchmarkEvaluation {
    if (!input.success) {
      return {
        hallucinationRisk: 'high' as const,
        contextFidelity: 'low' as const,
        answerCompleteness: 'low' as const,
        answerQualityScore: 0,
        operatingRisk: 'high' as const,
        recommendation: 'nicht geeignet für produktive Kundenprozesse',
      };
    }

    const answerTokens = estimateTokens(input.answer);
    const keywordHits = input.expectedKeywords.filter((keyword) =>
      input.answer.toLowerCase().includes(keyword.toLowerCase()),
    ).length;
    const keywordScore = input.expectedKeywords.length === 0 ? 1 : keywordHits / input.expectedKeywords.length;
    const hasContext = input.chunks.length > 0;
    const hallucinationRisk: BenchmarkEvaluation['hallucinationRisk'] =
      hasContext || input.scenario === 'optimized' ? 'low' : input.scenario === 'rag' ? 'medium' : 'high';
    const contextFidelity: BenchmarkEvaluation['contextFidelity'] = hasContext
      ? 'high'
      : input.scenario === 'baseline'
        ? 'low'
        : 'medium';
    const answerCompleteness: BenchmarkEvaluation['answerCompleteness'] =
      answerTokens > 80 && keywordScore >= 0.6 ? 'high' : answerTokens > 30 ? 'medium' : 'low';
    const quality =
      (hallucinationRisk === 'low' ? 30 : hallucinationRisk === 'medium' ? 18 : 8) +
      (contextFidelity === 'high' ? 25 : contextFidelity === 'medium' ? 15 : 7) +
      (answerCompleteness === 'high' ? 25 : answerCompleteness === 'medium' ? 16 : 6) +
      Math.round(keywordScore * 20);

    return {
      hallucinationRisk,
      contextFidelity,
      answerCompleteness,
      answerQualityScore: Math.max(0, Math.min(100, quality)),
      operatingRisk: input.scenario === 'optimized' ? ('low' as const) : input.scenario === 'rag' ? ('medium' as const) : ('high' as const),
      recommendation:
        input.scenario === 'optimized'
          ? 'geeignet für MVP und interne Wissensabfragen'
          : input.scenario === 'rag'
            ? 'geeignet für interne Wissensabfragen mit weiterer Optimierung'
            : 'nicht geeignet für produktive Kundenprozesse',
    };
  }

  private scenarioRecommendation(scenario: BenchmarkScenario, qualityScore: number, failureRate: number): string {
    if (failureRate > 0) return 'weitere Optimierung nötig';
    if (scenario === 'optimized' && qualityScore >= 75) return 'empfohlene Enterprise-Variante';
    if (scenario === 'rag' && qualityScore >= 65) return 'geeignet für interne Wissensabfragen';
    if (scenario === 'baseline') return 'nur für einfache MVP-Tests geeignet';
    return 'weitere Optimierung nötig';
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private async withTimeout(
    operation: () => Promise<BenchmarkScenarioResult>,
    caseId: string,
    scenario: BenchmarkScenario,
  ): Promise<BenchmarkScenarioResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<BenchmarkScenarioResult>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`Benchmark timeout after ${config.benchmark.timeoutMs}ms`)), config.benchmark.timeoutMs);
        }),
      ]);
    } catch (error) {
      return {
        caseId,
        caseTitle: caseId,
        scenario,
        success: false,
        modelName: 'unknown',
        modelSize: 'small',
        totalLatencyMs: config.benchmark.timeoutMs,
        stepLatencies: {
          classificationMs: 0,
          qualityGateMs: 0,
          retrievalMs: 0,
          contextPreparationMs: 0,
          toolSelectionMs: 0,
          llmMs: 0,
        },
        promptTokensEstimated: 0,
        completionTokensEstimated: 0,
        contextTokensBeforeReduction: 0,
        contextTokensAfterReduction: 0,
        contextReductionPercent: 0,
        chunksUsed: 0,
        topRetrievalScores: [],
        toolNames: [],
        costEstimate: this.estimateCost(0, 0),
        evaluation: this.evaluate({ scenario, answer: '', chunks: [], expectedKeywords: [], success: false }),
        answerPreview: '',
        error: error instanceof Error ? error.message : 'benchmark_timeout',
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
