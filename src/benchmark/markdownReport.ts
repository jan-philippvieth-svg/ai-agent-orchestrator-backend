import type { BenchmarkRunReport } from './benchmarkTypes.js';

export function renderBenchmarkMarkdown(report: BenchmarkRunReport): string {
  const best = report.scenarioSummary.find((item) => item.scenario === report.summary.bestScenario);
  const bottleneck = [...report.scenarioSummary].sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)[0];
  const isStub = report.mode === 'stub';
  const enterpriseStatus = isStub
    ? 'Nein. Stub-Ergebnis: technische Funktionsprüfung, nicht produktiv belastbar.'
    : report.summary.enterpriseReady
      ? 'Ja, für den aktuellen Benchmark-Scope.'
      : 'Noch nicht belastbar genug.';
  const summaryNote = isStub
    ? 'Dieser Lauf nutzt Stub-Services. Die Zahlen zeigen, ob Pipeline, Reports und Heuristiken funktionieren; sie ersetzen keine Bewertung mit echter Qdrant-Collection, echten LLM-Endpunkten und realen Chunks.'
    : 'Die optimierte Variante ist in der Regel die beste Enterprise-Kandidatin, wenn Qualität, Nachvollziehbarkeit, Tenant-Isolation und Betriebsmetriken wichtiger sind als minimaler Prompt-Overhead.';

  return `# AI Benchmark Report

Generated: ${report.timestamp}
Mode: ${report.mode}

## 1. Management Summary

- Enterprise-tauglich: ${enterpriseStatus}
- Empfohlene Variante: ${best?.scenario ?? 'n/a'} (${best?.recommendation ?? 'keine Empfehlung'})
- Wichtigster Engpass: ${bottleneck?.scenario ?? 'n/a'} mit Ø ${bottleneck?.avgLatencyMs ?? 0}ms Latenz
- Gesamtqualität: ${report.summary.avgQualityScore}/100
- Fehlerquote: ${report.summary.failureRate}%

Kurzbewertung: ${summaryNote}

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
${report.enterprise ? renderEnterpriseSection(report.enterprise) : ''}`;
}

function renderEnterpriseSection(e: NonNullable<import('./benchmarkTypes.js').BenchmarkRunReport['enterprise']>): string {
  const tr = e.toolRouting;
  const cr = e.contextReduction;
  const mr = e.modelRouting;
  const lw = e.llmWork;

  return `
## 6. Enterprise KPI: Tool-Routing

Simulated catalog: **${tr.catalogSize} tools** | Test queries: **${tr.testCases}** | Avg. relevant tools per query: **${tr.avgRelevantToolsPerQuery}**

| Metrik | Wert |
| --- | ---: |
| Tool-Token-Baseline (alle Tools × Queries) | ${tr.toolTokensBaseline.toLocaleString('de-DE')} |
| Tool-Token injiziert (nur relevante Tools) | ${tr.toolTokensInjected.toLocaleString('de-DE')} |
| Tool-Token eingespart | ${tr.toolTokensSaved.toLocaleString('de-DE')} |
| Tool-Reduktion | **${tr.toolReductionPercent} %** |

| Query | Kategorie | Alle Tools | Relevante Tools | Anzahl | Einsparung |
| --- | --- | ---: | ---: | ---: | ---: |
${tr.cases.map((c) => `| ${c.query.slice(0, 50)} | ${c.category} | ${c.allToolsTokens} | ${c.relevantToolsTokens} | ${c.relevantToolCount} | ${c.reductionPercent} % |`).join('\n')}

## 7. Enterprise KPI: Kontextreduktion

topK = ${cr.collections[0]?.topK ?? 5} | Ø Dokument-Token: ${cr.collections[0]?.avgDocTokens ?? '-'}

| Sammlung (Docs) | Baseline Tokens | Injizierte Tokens | Eingespart | Reduktion |
| ---: | ---: | ---: | ---: | ---: |
${cr.collections.map((c) => `| ${c.collectionSize.toLocaleString('de-DE')} | ${c.contextTokensBaseline.toLocaleString('de-DE')} | ${c.contextTokensInjected.toLocaleString('de-DE')} | ${c.contextTokensSaved.toLocaleString('de-DE')} | **${c.contextReductionPercent} %** |`).join('\n')}

## 8. Enterprise KPI: Modell-Routing & Kostenanalyse

Preise pro 1 Mio Token (USD) — small ${mr.pricing.small.inputPer1M}/${mr.pricing.small.outputPer1M} | medium ${mr.pricing.medium.inputPer1M}/${mr.pricing.medium.outputPer1M} | large ${mr.pricing.large.inputPer1M}/${mr.pricing.large.outputPer1M}

| Metrik | Wert |
| --- | ---: |
| Test-Queries | ${mr.testCases} |
| Baseline-Kosten (alle → large) | $ ${mr.baselineCostUsd.toFixed(6)} |
| Optimierte Kosten (geroutetes Modell) | $ ${mr.optimizedCostUsd.toFixed(6)} |
| Eingespart | $ ${mr.savedCostUsd.toFixed(6)} |
| Kosteneinsparung | **${mr.savedCostPercent} %** |
| Modellverteilung | small: ${mr.modelDistribution.small} / medium: ${mr.modelDistribution.medium} / large: ${mr.modelDistribution.large} |
| Hochrechnung 1 Mio Queries/Monat | **$ ${mr.projectedMonthlySavingsUsd.toLocaleString('en-US')} Einsparung** |

| Query | Klassifikation | Modell | In-Tokens | Out-Tokens | Baseline $ | Optimiert $ | Einsparung $ |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
${mr.cases.map((c) => `| ${c.query.slice(0, 40)} | ${c.classification} | ${c.optimizedModel} | ${c.inputTokens} | ${c.outputTokens} | ${c.baselineCostUsd.toFixed(6)} | ${c.optimizedCostUsd.toFixed(6)} | ${c.savedCostUsd.toFixed(6)} |`).join('\n')}

## 9. Enterprise KPI: LLM Work Units

Gewichte — small: ${lw.weights.small} | medium: ${lw.weights.medium} | large: ${lw.weights.large} (pro 1.000 Token)

| Metrik | Wert |
| --- | ---: |
| Test-Queries | ${lw.testCases} |
| Baseline Work Units (alle → large) | ${lw.baselineLlmWorkUnits.toFixed(3)} |
| Actual Work Units (geroutetes Modell) | ${lw.actualLlmWorkUnits.toFixed(3)} |
| Eingespart | ${lw.savedLlmWorkUnits.toFixed(3)} |
| LLM-Work-Einsparung | **${lw.savedLlmWorkPercent} %** |

| Query | Klassifikation | Modell | Token | Baseline WU | Actual WU | Eingespart WU |
| --- | --- | --- | ---: | ---: | ---: | ---: |
${lw.cases.map((c) => `| ${c.query.slice(0, 40)} | ${c.classification} | ${c.optimizedModel} | ${c.tokenCount} | ${c.baselineWorkUnits} | ${c.actualWorkUnits} | ${c.savedWorkUnits} |`).join('\n')}
`;
}
