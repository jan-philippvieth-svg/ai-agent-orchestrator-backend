import { ClassifierService } from '../services/classifier.service.js';
import { ModelRouterService } from '../services/modelRouter.service.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import type {
  ContextCollectionResult,
  ContextReductionResult,
  EnterpriseBenchmarkResult,
  LlmWorkCaseResult,
  LlmWorkResult,
  LlmWorkWeights,
  ModelPricing,
  ModelRoutingCaseResult,
  ModelRoutingResult,
  ToolRoutingCaseResult,
  ToolRoutingResult,
} from './benchmarkTypes.js';
import {
  MODEL_ROUTING_QUERIES,
  OUTPUT_TOKENS_BY_CLASSIFICATION,
  SYSTEM_PROMPT_OVERHEAD_TOKENS,
  TOOL_CATALOG,
  TOOL_ROUTING_CASES,
} from './enterpriseData.js';

// ── Benchmark 1: Tool Routing ─────────────────────────────────────────────────

function runToolRoutingBenchmark(): ToolRoutingResult {
  const allToolsTokens = TOOL_CATALOG.reduce((sum, t) => sum + t.estimatedTokens, 0);

  const cases: ToolRoutingCaseResult[] = TOOL_ROUTING_CASES.map((tc) => {
    const relevantTools = TOOL_CATALOG.filter((t) => tc.relevantTools.includes(t.name));
    const relevantTokens = relevantTools.reduce((sum, t) => sum + t.estimatedTokens, 0);
    const saved = allToolsTokens - relevantTokens;
    return {
      query: tc.query,
      category: tc.category,
      allToolsTokens,
      relevantToolsTokens: relevantTokens,
      relevantToolCount: relevantTools.length,
      savedTokens: saved,
      reductionPercent: pct(saved, allToolsTokens),
    };
  });

  const toolTokensInjected = cases.reduce((sum, c) => sum + c.relevantToolsTokens, 0);
  const toolTokensBaseline = allToolsTokens * cases.length;
  const toolTokensSaved = toolTokensBaseline - toolTokensInjected;
  const avgRelevant = cases.reduce((sum, c) => sum + c.relevantToolCount, 0) / cases.length;

  return {
    catalogSize: TOOL_CATALOG.length,
    testCases: cases.length,
    toolTokensBaseline,
    toolTokensInjected,
    toolTokensSaved,
    toolReductionPercent: pct(toolTokensSaved, toolTokensBaseline),
    avgRelevantToolsPerQuery: round2(avgRelevant),
    cases,
  };
}

// ── Benchmark 2: Context Reduction ───────────────────────────────────────────

// A representative sample document (~500 tokens = ~2000 chars of content).
// Deterministic: same content every run.
const SAMPLE_DOC_CONTENT =
  'Enterprise knowledge base entry. This document describes operational procedures, ' +
  'system architecture decisions, integration patterns, and compliance requirements ' +
  'for the platform. Sections cover authentication flows, data governance, multi-tenant ' +
  'isolation strategies, API versioning policies, incident response playbooks, and ' +
  'performance benchmarks. Each section is maintained by the responsible team and ' +
  'reviewed quarterly. References to external standards (ISO 27001, SOC 2, GDPR) are ' +
  'included where applicable. Configuration examples and code snippets are provided ' +
  'in appendices. Contact the platform team for access to restricted sections. ' +
  'Version history is tracked in Confluence. Approvals required for production changes.';

const AVG_DOC_TOKENS = estimateTokens(SAMPLE_DOC_CONTENT);
const TOP_K = 5;
const COLLECTION_SIZES = [500, 5_000, 50_000];

function runContextReductionBenchmark(): ContextReductionResult {
  const collections: ContextCollectionResult[] = COLLECTION_SIZES.map((size) => {
    const baseline = size * AVG_DOC_TOKENS;
    const injected = TOP_K * AVG_DOC_TOKENS;
    const saved = baseline - injected;
    return {
      collectionSize: size,
      topK: TOP_K,
      avgDocTokens: AVG_DOC_TOKENS,
      contextTokensBaseline: baseline,
      contextTokensInjected: injected,
      contextTokensSaved: saved,
      contextReductionPercent: pct(saved, baseline),
    };
  });
  return { collections };
}

// ── Benchmark 3: Model Routing ────────────────────────────────────────────────

const PRICING: ModelPricing = {
  small:  { inputPer1M: 0.15,  outputPer1M: 0.60  },
  medium: { inputPer1M: 2.50,  outputPer1M: 10.00 },
  large:  { inputPer1M: 15.00, outputPer1M: 75.00 },
};

function costUsd(inputTokens: number, outputTokens: number, model: keyof ModelPricing): number {
  const p = PRICING[model];
  return (inputTokens * p.inputPer1M + outputTokens * p.outputPer1M) / 1_000_000;
}

function runModelRoutingBenchmark(): ModelRoutingResult {
  const classifier = new ClassifierService();
  const router = new ModelRouterService();

  const cases: ModelRoutingCaseResult[] = MODEL_ROUTING_QUERIES.map((query) => {
    const classification = classifier.classify(query);
    const optimizedModel = router.selectModel(classification, 'auto', { allowLargeModelOverride: true });
    const inputTokens = estimateTokens(query) + SYSTEM_PROMPT_OVERHEAD_TOKENS;
    const outputTokens = OUTPUT_TOKENS_BY_CLASSIFICATION[classification] ?? 200;
    const baselineCostUsd = costUsd(inputTokens, outputTokens, 'large');
    const optimizedCostUsd = costUsd(inputTokens, outputTokens, optimizedModel);
    return {
      query,
      classification,
      baselineModel: 'large',
      optimizedModel,
      inputTokens,
      outputTokens,
      baselineCostUsd: round6(baselineCostUsd),
      optimizedCostUsd: round6(optimizedCostUsd),
      savedCostUsd: round6(baselineCostUsd - optimizedCostUsd),
    };
  });

  const baselineCostUsd = cases.reduce((s, c) => s + c.baselineCostUsd, 0);
  const optimizedCostUsd = cases.reduce((s, c) => s + c.optimizedCostUsd, 0);
  const savedCostUsd = baselineCostUsd - optimizedCostUsd;

  const dist = { small: 0, medium: 0, large: 0 };
  for (const c of cases) dist[c.optimizedModel as keyof typeof dist] += 1;

  // Projected monthly saving at 1M queries/month extrapolated from 20 test queries
  const projectedMonthlySavingsUsd = round2((savedCostUsd / cases.length) * 1_000_000);

  return {
    pricing: PRICING,
    testCases: cases.length,
    modelDistribution: dist,
    baselineCostUsd: round6(baselineCostUsd),
    optimizedCostUsd: round6(optimizedCostUsd),
    savedCostUsd: round6(savedCostUsd),
    savedCostPercent: pct(savedCostUsd, baselineCostUsd),
    projectedMonthlySavingsUsd,
    cases,
  };
}

// ── Benchmark 4: LLM Work Units ───────────────────────────────────────────────

const LLM_WORK_WEIGHTS: LlmWorkWeights = { small: 1, medium: 5, large: 20 };

function workUnits(tokens: number, model: keyof LlmWorkWeights): number {
  return (tokens / 1000) * LLM_WORK_WEIGHTS[model];
}

function runLlmWorkBenchmark(): LlmWorkResult {
  const classifier = new ClassifierService();
  const router = new ModelRouterService();

  const cases: LlmWorkCaseResult[] = MODEL_ROUTING_QUERIES.map((query) => {
    const classification = classifier.classify(query);
    const optimizedModel = router.selectModel(classification, 'auto', { allowLargeModelOverride: true });
    const outputTokens = OUTPUT_TOKENS_BY_CLASSIFICATION[classification] ?? 200;
    const tokenCount = estimateTokens(query) + SYSTEM_PROMPT_OVERHEAD_TOKENS + outputTokens;
    const baselineWU = workUnits(tokenCount, 'large');
    const actualWU = workUnits(tokenCount, optimizedModel);
    return {
      query,
      classification,
      optimizedModel,
      tokenCount,
      baselineWorkUnits: round3(baselineWU),
      actualWorkUnits: round3(actualWU),
      savedWorkUnits: round3(baselineWU - actualWU),
    };
  });

  const baselineTotal = cases.reduce((s, c) => s + c.baselineWorkUnits, 0);
  const actualTotal = cases.reduce((s, c) => s + c.actualWorkUnits, 0);
  const savedTotal = baselineTotal - actualTotal;

  return {
    weights: LLM_WORK_WEIGHTS,
    testCases: cases.length,
    baselineLlmWorkUnits: round3(baselineTotal),
    actualLlmWorkUnits: round3(actualTotal),
    savedLlmWorkUnits: round3(savedTotal),
    savedLlmWorkPercent: pct(savedTotal, baselineTotal),
    cases,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function runAllEnterpriseBenchmarks(): EnterpriseBenchmarkResult {
  return {
    toolRouting: runToolRoutingBenchmark(),
    contextReduction: runContextReductionBenchmark(),
    modelRouting: runModelRoutingBenchmark(),
    llmWork: runLlmWorkBenchmark(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(saved: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return Math.round(((saved / baseline) * 1000)) / 10;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function round6(n: number): number { return Math.round(n * 1_000_000) / 1_000_000; }
