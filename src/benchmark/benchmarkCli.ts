import { BenchmarkRunner } from './benchmarkRunner.js';

const runner = new BenchmarkRunner();
const report = await runner.run();

console.log(
  JSON.stringify(
    {
      event: 'benchmark_completed',
      reportId: report.id,
      mode: report.mode,
      bestScenario: report.summary.bestScenario,
      enterpriseReady: report.summary.enterpriseReady,
      avgLatencyMs: report.summary.avgLatencyMs,
      avgQualityScore: report.summary.avgQualityScore,
      failureRate: report.summary.failureRate,
      outputs: {
        latest: 'data/benchmark-results/latest.json',
        history: 'data/benchmark-history.json',
        markdown: 'reports/benchmark-report.md',
      },
    },
    null,
    2,
  ),
);
