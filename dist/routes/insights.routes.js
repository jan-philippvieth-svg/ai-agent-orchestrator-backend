import { z } from 'zod';
import { UserInsightService } from '../services/userInsight.service.js';
const userInsightQuerySchema = z.object({
    tenantId: z.string().min(1).max(120),
    userId: z.string().min(1).max(120),
});
export async function insightsRoutes(app) {
    const insights = new UserInsightService();
    app.get('/insights/users', async () => {
        const state = await insights.getInsights();
        return {
            success: true,
            users: state.users,
            topInteractions: state.topInteractions.slice(0, 20),
            note: 'Scores are heuristics. Previews can be disabled with USER_INSIGHTS_STORE_PREVIEWS=false.',
        };
    });
    app.get('/insights/user', async (request, reply) => {
        const parsed = userInsightQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const result = await insights.getUser(parsed.data.tenantId, parsed.data.userId);
        if (!result.user) {
            return reply.code(404).send({
                success: false,
                error: 'UserInsightsNotFound',
                message: 'No user insight data found for tenantId/userId.',
            });
        }
        return {
            success: true,
            ...result,
        };
    });
    app.get('/insights/dashboard', async (_request, reply) => {
        const state = await insights.getInsights();
        const users = state.users.slice(0, 20);
        reply.header('content-type', 'text/html; charset=utf-8');
        return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>User Insight Dashboard</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif; margin: 32px; color: #17202a; background: #f7f8fa; }
    main { max-width: 1120px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    p { color: #52606d; }
    .panel { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 18px; margin-top: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px; border-bottom: 1px solid #e5e9f0; text-align: left; vertical-align: top; }
    th { color: #52606d; font-weight: 600; }
    .score { font-weight: 700; }
    .muted { color: #697586; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <h1>User Input Quality Insights</h1>
    <p>Welche User liefern die wertvollsten Prompts fuer Kontext, Retrieval und brauchbare Antworten?</p>
    <section class="panel">
      <table>
        <thead><tr><th>User</th><th>Tenant</th><th>Requests</th><th>Input Score</th><th>Answer Value</th><th>Overall</th><th>Saved Tokens</th><th>Retrieval</th></tr></thead>
        <tbody>
          ${users
            .map((user) => `<tr><td>${user.userId}</td><td>${user.tenantId}</td><td>${user.requests}</td><td class="score">${user.avgInputQualityScore}</td><td>${user.avgAnswerValueScore}</td><td class="score">${user.avgOverallValueScore}</td><td>${user.totalSavedTokens}</td><td>${Math.round(user.retrievalUseRate * 100)}%</td></tr>`)
            .join('')}
        </tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Top Fragen/Antworten</h2>
      <table>
        <thead><tr><th>Score</th><th>User</th><th>Frage</th><th>Antwort</th><th>Signale</th></tr></thead>
        <tbody>
          ${state.topInteractions
            .slice(0, 20)
            .map((item) => `<tr><td class="score">${item.overallValueScore}</td><td>${item.userId}</td><td>${item.messagePreview ?? item.messageHash}</td><td>${item.answerPreview ?? item.answerHash}</td><td class="muted">${item.inputSignals.join(', ')}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    </section>
    <p class="muted">Hinweis: Scores sind Heuristiken. Vollstaendige Inhalte werden nicht gespeichert; Previews koennen per USER_INSIGHTS_STORE_PREVIEWS=false deaktiviert werden.</p>
  </main>
</body>
</html>`;
    });
}
