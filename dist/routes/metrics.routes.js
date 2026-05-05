import { MetricsService } from '../services/metrics.service.js';
import { ResilienceService } from '../services/resilience.service.js';
export async function metricsRoutes(app) {
    const metrics = MetricsService.getInstance();
    const resilience = ResilienceService.getInstance();
    app.get('/metrics', async (_request, reply) => {
        reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
        return metrics.renderPrometheus();
    });
    app.get('/stats', async () => {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            metrics: metrics.snapshot(),
            note: 'LLM work savings are estimated comparison units, not direct macOS GPU power telemetry.',
        };
    });
    app.get('/admin/guard-events', async () => {
        return {
            success: true,
            events: metrics.recentGuardEvents(),
        };
    });
    app.get('/admin/resilience', async () => {
        return {
            success: true,
            circuits: resilience.snapshot(),
        };
    });
    app.get('/dashboard', async (_request, reply) => {
        const snapshot = metrics.snapshot();
        const efficiency = snapshot.efficiency;
        reply.header('content-type', 'text/html; charset=utf-8');
        return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Agent Orchestrator Dashboard</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; margin: 32px; color: #17202a; background: #f7f8fa; }
    main { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    p { color: #52606d; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-top: 24px; }
    .card { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 18px; }
    .label { font-size: 13px; color: #697586; }
    .value { font-size: 30px; font-weight: 700; margin-top: 6px; }
    .small { font-size: 13px; color: #697586; margin-top: 24px; }
  </style>
</head>
<body>
  <main>
    <h1>AI-agent-orchestrator-backend</h1>
    <p>Token- und LLM-Work-Ersparnis gegenueber der Baseline: jede Anfrage geht an large/32B mit breitem Kontext.</p>
    <section class="grid">
      <div class="card"><div class="label">Tokens eingespart</div><div class="value">${efficiency.savedTokens}</div></div>
      <div class="card"><div class="label">Token-Ersparnis</div><div class="value">${efficiency.tokensSavedPercent}%</div></div>
      <div class="card"><div class="label">Actual Tokens</div><div class="value">${efficiency.tokensEstimated}</div></div>
      <div class="card"><div class="label">Baseline Tokens</div><div class="value">${efficiency.baselineTokens}</div></div>
      <div class="card"><div class="label">Geschaetzte LLM-Work-Ersparnis</div><div class="value">${efficiency.estimatedLlmWorkSavedPercent}%</div></div>
      <div class="card"><div class="label">Chat Requests</div><div class="value">${efficiency.requests}</div></div>
      <div class="card"><div class="label">Actual LLM Work Units</div><div class="value">${efficiency.actualLlmWorkUnits}</div></div>
      <div class="card"><div class="label">Baseline LLM Work Units</div><div class="value">${efficiency.baselineLlmWorkUnits}</div></div>
      <div class="card"><div class="label">Saved LLM Work Units</div><div class="value">${efficiency.savedLlmWorkUnits}</div></div>
      <div class="card"><div class="label">Chunks verwendet</div><div class="value">${efficiency.chunksUsed}</div></div>
      <div class="card"><div class="label">Uptime Sekunden</div><div class="value">${snapshot.uptimeSeconds}</div></div>
    </section>
    <p class="small">Hinweis: Das ist eine reproduzierbare interne LLM-Work-Vergleichsmetrik. Echte macOS-GPU-Telemetrie kann spaeter optional daneben gelegt werden.</p>
  </main>
</body>
</html>`;
    });
}
