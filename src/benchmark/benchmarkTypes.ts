import type { Classification, ModelSize, PreferredModel, SourceType } from '../types/index.js';

export type BenchmarkScenario = 'baseline' | 'rag' | 'optimized';

export interface BenchmarkCase {
  id: string;
  title: string;
  tenantId: string;
  userId: string;
  message: string;
  useRetrieval?: boolean;
  preferredModel?: PreferredModel;
  metadata?: {
    projectId?: string;
    sourceType?: SourceType;
  };
  expectedKeywords?: string[];
}

export interface StepLatencies {
  classificationMs: number;
  qualityGateMs: number;
  retrievalMs: number;
  contextPreparationMs: number;
  toolSelectionMs: number;
  llmMs: number;
}

export interface BenchmarkEvaluation {
  hallucinationRisk: 'low' | 'medium' | 'high';
  contextFidelity: 'low' | 'medium' | 'high';
  answerCompleteness: 'low' | 'medium' | 'high';
  answerQualityScore: number;
  operatingRisk: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface BenchmarkScenarioResult {
  caseId: string;
  caseTitle: string;
  scenario: BenchmarkScenario;
  success: boolean;
  modelName: string;
  modelSize: ModelSize;
  classification?: Classification;
  totalLatencyMs: number;
  stepLatencies: StepLatencies;
  promptTokensEstimated: number;
  completionTokensEstimated: number;
  contextTokensBeforeReduction: number;
  contextTokensAfterReduction: number;
  contextReductionPercent: number;
  chunksUsed: number;
  topRetrievalScores: number[];
  toolNames: string[];
  costEstimate: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
  evaluation: BenchmarkEvaluation;
  answerPreview: string;
  error?: string;
}

export interface BenchmarkRunReport {
  id: string;
  timestamp: string;
  mode: 'stub' | 'real-services';
  summary: {
    cases: number;
    scenarios: number;
    bestScenario: BenchmarkScenario;
    enterpriseReady: boolean;
    avgLatencyMs: number;
    avgQualityScore: number;
    avgContextReductionPercent: number;
    totalCostEstimate: number;
    failureRate: number;
    actualTokens: number;
    baselineTokens: number;
    savedTokens: number;
    tokensSavedPercent: number;
    modelDistribution: {
      small: number;
      medium: number;
      large: number;
    };
    actualLlmWorkUnits: number;
    baselineLlmWorkUnits: number;
    savedLlmWorkUnits: number;
    estimatedLlmWorkSavedPercent: number;
    tools: {
      calls: number;
      errors: number;
      latencyMs: number;
      itemsUsed: number;
      avgLatencyMs: number;
      rawTokensEstimated: number;
      injectedTokens: number;
      savedTokens: number;
      reductionPercent: number;
    };
  };
  scenarioSummary: Array<{
    scenario: BenchmarkScenario;
    avgLatencyMs: number;
    avgQualityScore: number;
    avgContextReductionPercent: number;
    failureRate: number;
    totalCostEstimate: number;
    recommendation: string;
  }>;
  results: BenchmarkScenarioResult[];
}
