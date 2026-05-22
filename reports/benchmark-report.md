# AI Benchmark Report

Generated: 2026-05-22T22:47:55.053Z
Mode: stub

## 1. Management Summary

- Enterprise-tauglich: Nein. Stub-Ergebnis: technische Funktionsprüfung, nicht produktiv belastbar.
- Empfohlene Variante: optimized (empfohlene Enterprise-Variante)
- Wichtigster Engpass: optimized mit Ø 1ms Latenz
- Gesamtqualität: 63.7/100
- Fehlerquote: 0%

Kurzbewertung: Dieser Lauf nutzt Stub-Services. Die Zahlen zeigen, ob Pipeline, Reports und Heuristiken funktionieren; sie ersetzen keine Bewertung mit echter Qdrant-Collection, echten LLM-Endpunkten und realen Chunks.

## 2. Executive KPIs

| Szenario | Modell | Ø Latenz | Kontextreduktion | Antwortqualität | Halluzinationsrisiko | Betriebsrisiko | Empfehlung |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| baseline | local-7b | 0ms | 0% | 47.7/100 | high | high | nur für einfache MVP-Tests geeignet |
| rag | local-13b | 0ms | 0% | 65.7/100 | medium | medium | geeignet für interne Wissensabfragen |
| optimized | local-7b | 1ms | 0% | 77.7/100 | low | low | empfohlene Enterprise-Variante |

## 3. Technische Detailauswertung

| Case | Szenario | Erfolg | Total ms | Klassifikation | Retrieval | Kontext | Toolauswahl | LLM | Prompt Tokens | Completion Tokens | Chunks | Top Scores | Kosten |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Einfache Wissensfrage | baseline | ok | 1 | 0 | 0 | 0 | 0 | 1 | 217 | 30 | 0 |  | 0 |
| Einfache Wissensfrage | rag | ok | 1 | 0 | 1 | 0 | 0 | 0 | 217 | 30 | 0 |  | 0 |
| Einfache Wissensfrage | optimized | ok | 2 | 0 | 0 | 0 | 0 | 0 | 217 | 30 | 0 |  | 0 |
| RAG Architekturreview | baseline | ok | 0 | 0 | 0 | 0 | 0 | 0 | 220 | 32 | 0 |  | 0 |
| RAG Architekturreview | rag | ok | 0 | 0 | 0 | 0 | 0 | 0 | 220 | 32 | 0 |  | 0 |
| RAG Architekturreview | optimized | ok | 1 | 0 | 0 | 0 | 0 | 0 | 220 | 32 | 0 |  | 0 |
| Toolgestützte Betriebsbewertung | baseline | ok | 0 | 0 | 0 | 0 | 0 | 0 | 228 | 40 | 0 |  | 0 |
| Toolgestützte Betriebsbewertung | rag | ok | 0 | 0 | 0 | 0 | 0 | 0 | 228 | 41 | 0 |  | 0 |
| Toolgestützte Betriebsbewertung | optimized | ok | 1 | 0 | 1 | 0 | 0 | 0 | 228 | 40 | 0 |  | 0 |

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

- JSON latest: `data/benchmark-results/latest.json`
- Historie: `data/benchmark-history.json`
- Markdown: `reports/benchmark-report.md`
