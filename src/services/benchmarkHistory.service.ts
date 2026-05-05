import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BenchmarkRun {
  id: string;
  timestamp: string;
  mode: 'stub' | 'real-services';
  summary: {
    cases: number;
    actualTokens: number;
    baselineTokens: number;
    savedTokens: number;
    tokensSavedPercent: number;
    avgLatencyMs: number;
    avgQualityScore: number;
    modelDistribution: {
      small: number;
      medium: number;
      large: number;
    };
    actualLlmWorkUnits: number;
    baselineLlmWorkUnits: number;
    savedLlmWorkUnits: number;
    estimatedLlmWorkSavedPercent: number;
    tools?: {
      calls: number;
      errors: number;
      latencyMs: number;
      itemsUsed: number;
      avgLatencyMs: number;
      rawTokensEstimated?: number;
      injectedTokens?: number;
      savedTokens?: number;
      reductionPercent?: number;
    };
  };
  results: Array<Record<string, unknown>>;
  scenarios?: Record<string, unknown>;
  toolComparison?: {
    withoutTools: BenchmarkRun['summary'];
    withTools: BenchmarkRun['summary'];
    delta: {
      actualTokens: number;
      savedTokens: number;
      avgLatencyMs: number;
      avgQualityScore: number;
      toolCalls: number;
      toolLatencyMs: number;
      toolRawTokensEstimated?: number;
      toolInjectedTokens?: number;
      toolSavedTokens?: number;
      toolReductionPercent?: number;
      estimatedLlmWorkSavedPercent: number;
    };
    cases: Array<Record<string, unknown>>;
  };
}

export class BenchmarkHistoryService {
  private readonly historyPath = join(process.cwd(), 'data', 'benchmark-history.json');

  async list(): Promise<BenchmarkRun[]> {
    try {
      return JSON.parse(await readFile(this.historyPath, 'utf8')) as BenchmarkRun[];
    } catch {
      return [];
    }
  }

  async latest(): Promise<BenchmarkRun | undefined> {
    const history = await this.list();
    return history.at(-1);
  }
}
