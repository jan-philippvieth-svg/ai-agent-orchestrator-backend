import { LlmService } from '../services/llm.service.js';
import { MetricsService } from '../services/metrics.service.js';
import { QdrantService } from '../services/qdrant.service.js';
export async function healthRoutes(app) {
    const qdrant = new QdrantService();
    const llm = new LlmService();
    const metrics = MetricsService.getInstance();
    async function buildHealth(scope) {
        const [qdrantOk, llmOk] = await Promise.all([qdrant.health(), llm.health()]);
        const memory = process.memoryUsage();
        return {
            status: 'ok',
            scope,
            timestamp: new Date().toISOString(),
            services: {
                qdrant: (qdrantOk ? 'ok' : 'unavailable'),
                llm: (llmOk ? 'ok' : 'unavailable'),
            },
            memory: {
                rssMb: Math.round(memory.rss / 1024 / 1024),
                heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
                heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
                externalMb: Math.round(memory.external / 1024 / 1024),
                arrayBuffersMb: Math.round(memory.arrayBuffers / 1024 / 1024),
            },
            metrics: metrics.snapshot(),
        };
    }
    app.get('/health', async () => {
        return buildHealth('global');
    });
    app.get('/api/health', async () => {
        return buildHealth('api');
    });
    app.get('/bff/health', async () => {
        return buildHealth('bff');
    });
}
