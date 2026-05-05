import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;
const apiKey = 'dev-secret';
const historyPath = join(process.cwd(), 'data', 'benchmark-history.json');

const cases = [
  {
    id: 'simple-recipe',
    title: 'Kuchenrezept',
    expectedModel: 'small',
    expectedClassification: 'simple',
    message: 'Gib mir ein einfaches Kuchenrezept.',
  },
  {
    id: 'simple-email',
    title: 'Kurze Mail',
    expectedModel: 'small',
    expectedClassification: 'simple',
    message: 'Formuliere eine kurze freundliche Mail, dass ich morgen 10 Minuten spaeter komme.',
  },
  {
    id: 'simple-rewrite',
    title: 'Umformulierung',
    expectedModel: 'small',
    expectedClassification: 'simple',
    message: 'Formuliere diesen Satz professioneller: Wir melden uns bald bei dir.',
  },
  {
    id: 'medium-summary',
    title: 'Zusammenfassung',
    expectedModel: 'medium',
    expectedClassification: 'medium',
    message: 'Fasse kurz zusammen, warum ein API-Orchestrator fuer lokale LLMs sinnvoll ist.',
  },
  {
    id: 'medium-technical',
    title: 'Technische Frage',
    expectedModel: 'medium',
    expectedClassification: 'medium',
    message: 'Warum hilft RAG dabei, weniger Tokens an ein LLM zu senden?',
  },
  {
    id: 'medium-compare',
    title: 'Vergleich',
    expectedModel: 'medium',
    expectedClassification: 'medium',
    message: 'Vergleiche kurz Ollama, LM Studio und MLX als lokale LLM-Backends.',
  },
  {
    id: 'complex-architecture',
    title: 'Architektur-Bewertung',
    expectedModel: 'large',
    expectedClassification: 'complex',
    message: 'Bewerte diese Backend-Architektur fuer lokale LLMs, Qdrant, BFF und sichere Tenant-Isolation.',
  },
  {
    id: 'complex-security',
    title: 'Security Review',
    expectedModel: 'large',
    expectedClassification: 'complex',
    message: 'Mache eine laengere technische Bewertung der Security-Architektur mit BFF, CSRF, Rate Limiting und Qdrant Auth.',
  },
  {
    id: 'complex-code-analysis',
    title: 'Codeanalyse',
    expectedModel: 'large',
    expectedClassification: 'complex',
    message: 'Analysiere eine Node.js Backend-Struktur hinsichtlich Wartbarkeit, Fehlerbehandlung, Observability und Security.',
  },
  {
    id: 'complex-rag',
    title: 'RAG Bewertung',
    expectedModel: 'large',
    expectedClassification: 'complex',
    message: 'Bewerte komplex, wie Chunking, Embeddings, Retrieval Eligibility und Context Reduction zusammenspielen sollten.',
  },
  {
    id: 'tool-stats-review',
    title: 'Tool: Stats Review',
    expectedModel: 'large',
    expectedClassification: 'complex',
    expectedTool: 'get_stats',
    message: 'Bewerte komplex die Architektur-Metrics, Token-Einsparungen, Cache, Guard, Fallback und Resilience des Systems.',
  },
  {
    id: 'tool-knowledge-search',
    title: 'Tool: Knowledge Search',
    expectedModel: 'large',
    expectedClassification: 'complex',
    expectedTool: 'search_knowledge',
    message: 'Bewerte komplex und suche in der Wissensbasis nach Kontext zu Qdrant, RAG, Retrieval und Architektur.',
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined,
  };
}

function startServer(extraEnv) {
  const server = spawn(process.execPath, ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: apiKey,
      STUB_EXTERNAL_SERVICES: process.env.STUB_EXTERNAL_SERVICES ?? 'true',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  server.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  return { server, output: () => output };
}

async function stopServer(server) {
  if (server.killed) return;
  await new Promise((resolve) => {
    server.once('exit', resolve);
    server.kill();
    setTimeout(resolve, 1000);
  });
}

async function waitForHealth(serverOutput) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const result = await request('/health');
      if (result.status === 200 && result.body?.status === 'ok') return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not become healthy. Output:\n${serverOutput()}`);
}

function qualityHeuristic(testCase, result) {
  const metadata = result.metadata;
  let score = 100;
  const notes = [];

  if (metadata.selectedModel !== testCase.expectedModel) {
    score -= 25;
    notes.push(`expected model ${testCase.expectedModel}, got ${metadata.selectedModel}`);
  }
  if (metadata.classification !== testCase.expectedClassification) {
    score -= 25;
    notes.push(`expected classification ${testCase.expectedClassification}, got ${metadata.classification}`);
  }
  if (!result.answer || result.answer.length < 20) {
    score -= 15;
    notes.push('answer is very short');
  }
  if (metadata.tokensEstimated > metadata.efficiency.baselineTokens) {
    score -= 15;
    notes.push('actual tokens exceed baseline tokens');
  }
  if (metadata.processingTimeMs > 10_000) {
    score -= 10;
    notes.push('latency above 10s');
  }
  if (testCase.expectedTool && !metadata.tools.calls.some((call) => call.name === testCase.expectedTool && call.status === 'success')) {
    score -= 10;
    notes.push(`expected tool ${testCase.expectedTool} did not run successfully`);
  }

  return {
    score: Math.max(0, score),
    rating: score >= 90 ? 'good' : score >= 70 ? 'ok' : 'needs_review',
    notes: notes.length ? notes : ['heuristic checks passed; semantic quality still needs human review'],
  };
}

async function readHistory() {
  try {
    return JSON.parse(await readFile(historyPath, 'utf8'));
  } catch {
    return [];
  }
}

async function writeHistory(history) {
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(history.slice(-50), null, 2)}\n`, 'utf8');
}

function summarize(results) {
  const totals = results.reduce(
    (acc, result) => {
      acc.actualTokens += result.actualTokens;
      acc.baselineTokens += result.baselineTokens;
      acc.savedTokens += result.savedTokens;
      acc.latencyMs += result.latencyMs;
      acc.qualityScore += result.quality.score;
      acc.actualLlmWorkUnits += result.actualLlmWorkUnits;
      acc.baselineLlmWorkUnits += result.baselineLlmWorkUnits;
      acc.savedLlmWorkUnits += result.savedLlmWorkUnits;
      acc.toolCalls += result.toolCalls;
      acc.toolErrors += result.toolErrors;
      acc.toolLatencyMs += result.toolLatencyMs;
      acc.toolItemsUsed += result.toolItemsUsed;
      acc.toolRawTokensEstimated += result.toolRawTokensEstimated;
      acc.toolInjectedTokens += result.toolInjectedTokens;
      acc.toolSavedTokens += result.toolSavedTokens;
      acc[result.selectedModel] += 1;
      return acc;
    },
    {
      actualTokens: 0,
      baselineTokens: 0,
      savedTokens: 0,
      latencyMs: 0,
      qualityScore: 0,
      actualLlmWorkUnits: 0,
      baselineLlmWorkUnits: 0,
      savedLlmWorkUnits: 0,
      toolCalls: 0,
      toolErrors: 0,
      toolLatencyMs: 0,
      toolItemsUsed: 0,
      toolRawTokensEstimated: 0,
      toolInjectedTokens: 0,
      toolSavedTokens: 0,
      small: 0,
      medium: 0,
      large: 0,
    },
  );

  return {
    cases: results.length,
    actualTokens: totals.actualTokens,
    baselineTokens: totals.baselineTokens,
    savedTokens: totals.savedTokens,
    tokensSavedPercent: totals.baselineTokens > 0 ? Math.round((totals.savedTokens / totals.baselineTokens) * 1000) / 10 : 0,
    avgLatencyMs: Math.round(totals.latencyMs / results.length),
    avgQualityScore: Math.round((totals.qualityScore / results.length) * 10) / 10,
    modelDistribution: {
      small: totals.small,
      medium: totals.medium,
      large: totals.large,
    },
    actualLlmWorkUnits: totals.actualLlmWorkUnits,
    baselineLlmWorkUnits: totals.baselineLlmWorkUnits,
    savedLlmWorkUnits: totals.savedLlmWorkUnits,
    estimatedLlmWorkSavedPercent:
      totals.baselineLlmWorkUnits > 0 ? Math.round((totals.savedLlmWorkUnits / totals.baselineLlmWorkUnits) * 1000) / 10 : 0,
    tools: {
      calls: totals.toolCalls,
      errors: totals.toolErrors,
      latencyMs: totals.toolLatencyMs,
      itemsUsed: totals.toolItemsUsed,
      avgLatencyMs: totals.toolCalls > 0 ? Math.round(totals.toolLatencyMs / totals.toolCalls) : 0,
      rawTokensEstimated: totals.toolRawTokensEstimated,
      injectedTokens: totals.toolInjectedTokens,
      savedTokens: totals.toolSavedTokens,
      reductionPercent:
        totals.toolRawTokensEstimated > 0
          ? Math.round((totals.toolSavedTokens / totals.toolRawTokensEstimated) * 1000) / 10
          : 0,
    },
  };
}

function compareToolRuns(withoutTools, withTools) {
  return {
    withoutTools: withoutTools.summary,
    withTools: withTools.summary,
    delta: {
      actualTokens: withTools.summary.actualTokens - withoutTools.summary.actualTokens,
      savedTokens: withTools.summary.savedTokens - withoutTools.summary.savedTokens,
      avgLatencyMs: withTools.summary.avgLatencyMs - withoutTools.summary.avgLatencyMs,
      avgQualityScore: Math.round((withTools.summary.avgQualityScore - withoutTools.summary.avgQualityScore) * 10) / 10,
      toolCalls: withTools.summary.tools.calls - withoutTools.summary.tools.calls,
      toolLatencyMs: withTools.summary.tools.latencyMs - withoutTools.summary.tools.latencyMs,
      toolRawTokensEstimated: withTools.summary.tools.rawTokensEstimated - withoutTools.summary.tools.rawTokensEstimated,
      toolInjectedTokens: withTools.summary.tools.injectedTokens - withoutTools.summary.tools.injectedTokens,
      toolSavedTokens: withTools.summary.tools.savedTokens - withoutTools.summary.tools.savedTokens,
      toolReductionPercent:
        Math.round((withTools.summary.tools.reductionPercent - withoutTools.summary.tools.reductionPercent) * 10) / 10,
      estimatedLlmWorkSavedPercent:
        Math.round((withTools.summary.estimatedLlmWorkSavedPercent - withoutTools.summary.estimatedLlmWorkSavedPercent) * 10) /
        10,
    },
    cases: withTools.results
      .filter((result) => result.expectedTool)
      .map((withToolResult) => {
        const withoutToolResult = withoutTools.results.find((result) => result.id === withToolResult.id);
        return {
          id: withToolResult.id,
          title: withToolResult.title,
          expectedTool: withToolResult.expectedTool,
          withoutTools: withoutToolResult
            ? {
                actualTokens: withoutToolResult.actualTokens,
                latencyMs: withoutToolResult.latencyMs,
                qualityScore: withoutToolResult.quality.score,
                toolCalls: withoutToolResult.toolCalls,
                toolRawTokensEstimated: withoutToolResult.toolRawTokensEstimated,
                toolInjectedTokens: withoutToolResult.toolInjectedTokens,
                toolSavedTokens: withoutToolResult.toolSavedTokens,
              }
            : undefined,
          withTools: {
            actualTokens: withToolResult.actualTokens,
            latencyMs: withToolResult.latencyMs,
            qualityScore: withToolResult.quality.score,
            toolCalls: withToolResult.toolCalls,
            toolNames: withToolResult.toolNames,
            toolRawTokensEstimated: withToolResult.toolRawTokensEstimated,
            toolInjectedTokens: withToolResult.toolInjectedTokens,
            toolSavedTokens: withToolResult.toolSavedTokens,
            toolReductionPercent: withToolResult.toolReductionPercent,
          },
          delta: withoutToolResult
            ? {
                actualTokens: withToolResult.actualTokens - withoutToolResult.actualTokens,
                latencyMs: withToolResult.latencyMs - withoutToolResult.latencyMs,
                qualityScore: Math.round((withToolResult.quality.score - withoutToolResult.quality.score) * 10) / 10,
                toolCalls: withToolResult.toolCalls - withoutToolResult.toolCalls,
                toolRawTokensEstimated: withToolResult.toolRawTokensEstimated - withoutToolResult.toolRawTokensEstimated,
                toolInjectedTokens: withToolResult.toolInjectedTokens - withoutToolResult.toolInjectedTokens,
                toolSavedTokens: withToolResult.toolSavedTokens - withoutToolResult.toolSavedTokens,
              }
            : undefined,
        };
      }),
  };
}

async function runScenario(label, toolCallingEnabled) {
  const handle = startServer({ TOOL_CALLING_ENABLED: toolCallingEnabled ? 'true' : 'false' });
  await waitForHealth(handle.output);
  const results = [];

  try {
    for (const testCase of cases) {
      const startedAt = Date.now();
      const response = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'benchmark-tenant',
          userId: 'benchmark-user',
          message: testCase.message,
          useRetrieval: false,
          preferredModel: 'auto',
        }),
      });

      assert(response.status === 200, `Benchmark case ${testCase.id} failed with status ${response.status}`);
      const metadata = response.body.metadata;
      const quality = qualityHeuristic(testCase, response.body);
      const toolCalls = metadata.tools.calls.length;
      const toolErrors = metadata.tools.calls.filter((call) => call.status === 'error').length;
      const toolLatencyMs = metadata.tools.calls.reduce((sum, call) => sum + call.processingTimeMs, 0);
      const toolItemsUsed = metadata.tools.calls.reduce((sum, call) => sum + call.itemsUsed, 0);
      const toolRawTokensEstimated = metadata.tools.calls.reduce((sum, call) => sum + call.rawTokensEstimated, 0);
      const toolInjectedTokens = metadata.tools.calls.reduce((sum, call) => sum + call.injectedTokens, 0);
      const toolSavedTokens = metadata.tools.calls.reduce((sum, call) => sum + call.savedTokens, 0);

      results.push({
        id: testCase.id,
        title: testCase.title,
        expectedModel: testCase.expectedModel,
        expectedClassification: testCase.expectedClassification,
        expectedTool: testCase.expectedTool,
        selectedModel: metadata.selectedModel,
        classification: metadata.classification,
        latencyMs: metadata.processingTimeMs || Date.now() - startedAt,
        actualTokens: metadata.efficiency.actualTokens,
        baselineTokens: metadata.efficiency.baselineTokens,
        savedTokens: metadata.efficiency.savedTokens,
        tokensSavedPercent: metadata.efficiency.tokensSavedPercent,
        actualLlmWorkUnits: metadata.efficiency.actualLlmWorkUnits,
        baselineLlmWorkUnits: metadata.efficiency.baselineLlmWorkUnits,
        savedLlmWorkUnits: metadata.efficiency.savedLlmWorkUnits,
        estimatedLlmWorkSavedPercent: metadata.efficiency.estimatedLlmWorkSavedPercent,
        toolCallingEnabled: metadata.tools.enabled,
        toolCalls,
        toolErrors,
        toolLatencyMs,
        toolItemsUsed,
        toolRawTokensEstimated,
        toolInjectedTokens,
        toolSavedTokens,
        toolReductionPercent:
          toolRawTokensEstimated > 0 ? Math.round((toolSavedTokens / toolRawTokensEstimated) * 1000) / 10 : 0,
        toolNames: metadata.tools.calls.map((call) => call.name),
        quality,
      });
    }
  } finally {
    await stopServer(handle.server);
  }

  return {
    label,
    toolCallingEnabled,
    summary: summarize(results),
    results,
  };
}

async function run() {
  const withoutTools = await runScenario('without-tools', false);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const withTools = await runScenario('with-tools', true);

  const runReport = {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    timestamp: new Date().toISOString(),
    mode: process.env.STUB_EXTERNAL_SERVICES === 'false' ? 'real-services' : 'stub',
    summary: withTools.summary,
    results: withTools.results,
    scenarios: {
      withoutTools,
      withTools,
    },
    toolComparison: compareToolRuns(withoutTools, withTools),
  };

  const history = await readHistory();
  history.push(runReport);
  await writeHistory(history);

  console.log(JSON.stringify(runReport, null, 2));
}

await run();
