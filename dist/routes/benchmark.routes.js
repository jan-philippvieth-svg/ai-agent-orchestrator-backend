import { BenchmarkHistoryService } from '../services/benchmarkHistory.service.js';
export async function benchmarkRoutes(app) {
    const history = new BenchmarkHistoryService();
    app.get('/benchmark/history', async () => {
        const runs = await history.list();
        return {
            success: true,
            runs,
        };
    });
    app.get('/benchmark/latest', async (_request, reply) => {
        const latest = await history.latest();
        if (!latest) {
            return reply.code(404).send({
                success: false,
                error: 'BenchmarkHistoryEmpty',
                message: 'No benchmark report exists yet. Run npm.cmd run benchmark first.',
            });
        }
        return {
            success: true,
            run: latest,
        };
    });
    app.get('/benchmark/dashboard', async (_request, reply) => {
        const runs = await history.list();
        const latest = runs.at(-1);
        reply.header('content-type', 'text/html; charset=utf-8');
        const labels = runs.map((run) => new Date(run.timestamp).toLocaleString('de-DE'));
        const savedTokens = runs.map((run) => run.summary.savedTokens);
        const tokensSavedPercent = runs.map((run) => run.summary.tokensSavedPercent);
        const avgLatency = runs.map((run) => run.summary.avgLatencyMs);
        const quality = runs.map((run) => run.summary.avgQualityScore);
        return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Benchmark Dashboard</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; margin: 32px; color: #17202a; background: #f7f8fa; }
    main { max-width: 1120px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    p { color: #52606d; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin: 24px 0; }
    .card, .panel { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 18px; }
    .label { font-size: 13px; color: #697586; }
    .value { font-size: 30px; font-weight: 700; margin-top: 6px; }
    canvas { width: 100%; height: 260px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px; border-bottom: 1px solid #e5e9f0; text-align: left; }
    th { color: #52606d; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>Benchmark-Bericht</h1>
    <p>10 typische Beispielanfragen mit Modellwahl, Tokens vorher/nachher, Latenz und heuristischer Antwortqualitaet.</p>
    ${latest
            ? `<section class="grid">
      <div class="card"><div class="label">Runs historisch</div><div class="value">${runs.length}</div></div>
      <div class="card"><div class="label">Tokens eingespart</div><div class="value">${latest.summary.savedTokens}</div></div>
      <div class="card"><div class="label">Token-Ersparnis</div><div class="value">${latest.summary.tokensSavedPercent}%</div></div>
      <div class="card"><div class="label">Ø Latenz</div><div class="value">${latest.summary.avgLatencyMs}ms</div></div>
      <div class="card"><div class="label">Ø Qualitaet</div><div class="value">${latest.summary.avgQualityScore}</div></div>
      <div class="card"><div class="label">Tool Calls</div><div class="value">${latest.summary.tools?.calls ?? 0}</div></div>
      <div class="card"><div class="label">Tool Latenz</div><div class="value">${latest.summary.tools?.latencyMs ?? 0}ms</div></div>
      <div class="card"><div class="label">Tool Tokens gespart</div><div class="value">${latest.summary.tools?.savedTokens ?? 0}</div></div>
      <div class="card"><div class="label">Tool Reduction</div><div class="value">${latest.summary.tools?.reductionPercent ?? 0}%</div></div>
    </section>`
            : '<section class="panel"><p>Noch keine Benchmark-Historie. Fuehre zuerst <code>npm.cmd run benchmark</code> aus.</p></section>'}
    ${latest?.toolComparison
            ? `<section class="panel">
      <h2>Tool-Impact: vorher/nachher</h2>
      <table>
        <thead><tr><th>Metrik</th><th>Ohne Tools</th><th>Mit Tools</th><th>Delta</th></tr></thead>
        <tbody>
          <tr><td>Actual Tokens</td><td>${latest.toolComparison.withoutTools.actualTokens}</td><td>${latest.toolComparison.withTools.actualTokens}</td><td>${latest.toolComparison.delta.actualTokens}</td></tr>
          <tr><td>Saved Tokens</td><td>${latest.toolComparison.withoutTools.savedTokens}</td><td>${latest.toolComparison.withTools.savedTokens}</td><td>${latest.toolComparison.delta.savedTokens}</td></tr>
          <tr><td>Ø Latenz</td><td>${latest.toolComparison.withoutTools.avgLatencyMs}ms</td><td>${latest.toolComparison.withTools.avgLatencyMs}ms</td><td>${latest.toolComparison.delta.avgLatencyMs}ms</td></tr>
          <tr><td>Ø Qualitaet</td><td>${latest.toolComparison.withoutTools.avgQualityScore}</td><td>${latest.toolComparison.withTools.avgQualityScore}</td><td>${latest.toolComparison.delta.avgQualityScore}</td></tr>
          <tr><td>Tool Calls</td><td>${latest.toolComparison.withoutTools.tools?.calls ?? 0}</td><td>${latest.toolComparison.withTools.tools?.calls ?? 0}</td><td>${latest.toolComparison.delta.toolCalls}</td></tr>
          <tr><td>Tool Latenz</td><td>${latest.toolComparison.withoutTools.tools?.latencyMs ?? 0}ms</td><td>${latest.toolComparison.withTools.tools?.latencyMs ?? 0}ms</td><td>${latest.toolComparison.delta.toolLatencyMs}ms</td></tr>
          <tr><td>Tool Raw Tokens</td><td>${latest.toolComparison.withoutTools.tools?.rawTokensEstimated ?? 0}</td><td>${latest.toolComparison.withTools.tools?.rawTokensEstimated ?? 0}</td><td>${latest.toolComparison.delta.toolRawTokensEstimated ?? 0}</td></tr>
          <tr><td>Tool Injected Tokens</td><td>${latest.toolComparison.withoutTools.tools?.injectedTokens ?? 0}</td><td>${latest.toolComparison.withTools.tools?.injectedTokens ?? 0}</td><td>${latest.toolComparison.delta.toolInjectedTokens ?? 0}</td></tr>
          <tr><td>Tool Tokens gespart</td><td>${latest.toolComparison.withoutTools.tools?.savedTokens ?? 0}</td><td>${latest.toolComparison.withTools.tools?.savedTokens ?? 0}</td><td>${latest.toolComparison.delta.toolSavedTokens ?? 0}</td></tr>
          <tr><td>Tool Reduction</td><td>${latest.toolComparison.withoutTools.tools?.reductionPercent ?? 0}%</td><td>${latest.toolComparison.withTools.tools?.reductionPercent ?? 0}%</td><td>${latest.toolComparison.delta.toolReductionPercent ?? 0}%</td></tr>
        </tbody>
      </table>
    </section>`
            : ''}
    <section class="panel"><canvas id="trend"></canvas></section>
    ${latest
            ? `<section class="panel">
      <table>
        <thead><tr><th>Case</th><th>Modell</th><th>Klasse</th><th>Tokens vorher</th><th>Tokens nachher</th><th>Gespart</th><th>Latenz</th><th>Tools</th><th>Tool Saved</th><th>Qualitaet</th></tr></thead>
        <tbody>
          ${latest.results
                .map((item) => {
                const toolNames = Array.isArray(item.toolNames) ? item.toolNames.join(', ') : '';
                return `<tr><td>${item.title}</td><td>${item.selectedModel}</td><td>${item.classification}</td><td>${item.baselineTokens}</td><td>${item.actualTokens}</td><td>${item.savedTokens}</td><td>${item.latencyMs}ms</td><td>${toolNames}</td><td>${item.toolSavedTokens ?? 0}</td><td>${item.quality?.score ?? ''}</td></tr>`;
            })
                .join('')}
        </tbody>
      </table>
    </section>`
            : ''}
  </main>
  <script>
    const labels = ${JSON.stringify(labels)};
    const savedTokens = ${JSON.stringify(savedTokens)};
    const tokensSavedPercent = ${JSON.stringify(tokensSavedPercent)};
    const avgLatency = ${JSON.stringify(avgLatency)};
    const quality = ${JSON.stringify(quality)};
    const canvas = document.getElementById('trend');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#17202a';
    ctx.font = '14px Inter, system-ui';
    ctx.fillText('Historischer Vergleich: saved tokens, token %, latency, quality', 16, 24);
    function drawLine(data, color, label, yOffset) {
      if (!data.length) return;
      const max = Math.max(...data, 1);
      const min = Math.min(...data, 0);
      const span = Math.max(1, max - min);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((value, index) => {
        const x = 24 + (index * (w - 64)) / Math.max(1, data.length - 1);
        const y = yOffset + 56 - ((value - min) / span) * 44;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, 24, yOffset + 72);
    }
    drawLine(savedTokens, '#2563eb', 'saved tokens', 36);
    drawLine(tokensSavedPercent, '#059669', 'token %', 86);
    drawLine(avgLatency, '#dc2626', 'latency', 136);
    drawLine(quality, '#7c3aed', 'quality', 186);
  </script>
</body>
</html>`;
    });
}
