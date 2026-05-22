import type { BenchmarkRunReport } from './benchmarkTypes.js';

export function renderBenchmarkMarkdown(report: BenchmarkRunReport): string {
  const best = report.scenarioSummary.find((item) => item.scenario === report.summary.bestScenario);
  const bottleneck = [...report.scenarioSummary].sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)[0];

  return `# AI Benchmark Report

Generated: ${report.timestamp}

## 1. Management Summary

- Enterprise-tauglich: ${report.summary.enterpriseReady ? 'Ja, für den aktuellen Benchmark-Scope.' : 'Noch nicht belastbar genug.'}
- Empfohlene Variante: ${best?.scenario ?? 'n/a'} (${best?.recommendation ?? 'keine Empfehlung'})
- Wichtigster Engpass: ${bottleneck?.scenario ?? 'n/a'} mit Ø ${bottleneck?.avgLatencyMs ?? 0}ms Latenz
- Gesamtqualität: ${report.summary.avgQualityScore}/100
- Fehlerquote: ${report.summary.failureRate}%

Kurzbewertung: Die optimierte Variante ist in der Regel die beste Enterprise-Kandidatin, wenn Qualität, Nachvollziehbarkeit, Tenant-Isolation und Betriebsmetriken wichtiger sind als minimaler Prompt-Overhead.

## 2. Executive KPIs

| Szenario | Modell | Ø Latenz | Kontextreduktion | Antwortqualität | Halluzinationsrisiko | Betriebsrisiko | Empfehlung |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
${report.scenarioSummary
  .map((summary) => {
    const sample = report.results.find((item) => item.scenario === summary.scenario);
    return `| ${summary.scenario} | ${sample?.modelName ?? 'n/a'} | ${summary.avgLatencyMs}ms | ${summary.avgContextReductionPercent}% | ${summary.avgQualityScore}/100 | ${sample?.evaluation.hallucinationRisk ?? 'n/a'} | ${sample?.evaluation.operatingRisk ?? 'n/a'} | ${summary.recommendation} |`;
  })
  .join('\n')}

## 3. Technische Detailauswertung

| Case | Szenario | Erfolg | Total ms | Klassifikation | Retrieval | Kontext | Toolauswahl | LLM | Prompt Tokens | Completion Tokens | Chunks | Top Scores | Kosten |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
${report.results
  .map(
    (item) =>
      `| ${item.caseTitle} | ${item.scenario} | ${item.success ? 'ok' : 'failed'} | ${item.totalLatencyMs} | ${item.stepLatencies.classificationMs} | ${item.stepLatencies.retrievalMs} | ${item.stepLatencies.contextPreparationMs} | ${item.stepLatencies.toolSelectionMs} | ${item.stepLatencies.llmMs} | ${item.promptTokensEstimated} | ${item.completionTokensEstimated} | ${item.chunksUsed} | ${item.topRetrievalScores.join(', ')} | ${item.costEstimate.totalCost} |`,
  )
  .join('\n')}

## 4. Compliance- und Betriebsbewertung

| Kriterium | Bewertung |
| --- | --- |
| Datenschutzrisiko | Baseline hoch, RAG mittel, optimiert niedriger durch Prompt-Guard, Tenant-Filter und reduzierte Tool-Oberfläche |
| Nachvollziehbarkeit | Optimiert am besten, weil Klassifikation, Toolauswahl, Chunks, Scores und Metriken gespeichert werden |
| Mandantentrennung | Nur Varianten mit Qdrant tenantId-Filter und Orchestrator-Metadata sind für interne Wissensabfragen geeignet |
| Logging-/Auditierbarkeit | Strukturierte Benchmark- und Runtime-Metadaten ohne Payload-/Secret-Logging |
| Stabilität | Resilience-Layer, Timeouts, Fallbacks und Fehlerquote im Report sichtbar |
| Skalierbarkeit | Optimierte Variante skaliert besser, weil Kontext und Tool-Oberfläche begrenzt werden |

## 5. Handlungsempfehlung

- Baseline: geeignet für MVP und reine Funktionsproben, nicht geeignet für produktive Kundenprozesse.
- RAG: geeignet für interne Wissensabfragen, wenn Qdrant-Datenqualität und Tenant-Isolation sauber sind.
- Optimiert: bevorzugte Variante für Enterprise-nahe Tests, da Security, Nachvollziehbarkeit, Kontextreduktion und Tool-Routing zusammen bewertet werden.
- Weitere Optimierung nötig, wenn Fehlerquote > 0%, Latenz stark steigt oder Kontexttreue unter "medium" fällt.

## Artefakte

- JSON latest: \`data/benchmark-results/latest.json\`
- Historie: \`data/benchmark-history.json\`
- Markdown: \`reports/benchmark-report.md\`
`;
}
