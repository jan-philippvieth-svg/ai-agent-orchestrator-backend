import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastify from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { adminNetworkGuard } from './middleware/adminNetwork.middleware.js';
import { apiKeyAuth } from './middleware/auth.middleware.js';
import { auditLog } from './middleware/audit.middleware.js';
import { attachCorrelationId, recordRequestMetrics } from './middleware/observability.middleware.js';
import { rateLimit } from './middleware/rateLimit.middleware.js';
import { benchmarkRoutes } from './routes/benchmark.routes.js';
import { bffRoutes } from './routes/bff.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { ingestRoutes } from './routes/ingest.routes.js';
import { insightsRoutes } from './routes/insights.routes.js';
import { metricsRoutes } from './routes/metrics.routes.js';
import { modelsRoutes } from './routes/models.routes.js';
import { privacyRoutes } from './routes/privacy.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { uiRoutes } from './routes/ui.routes.js';

export async function buildApp() {
  const app = fastify({
    logger: true,
    routerOptions: {
      maxParamLength: 5000,
    },
    bodyLimit: 2_500_000,
  });

  await app.register(helmet, {
    hsts: config.bff.cookieSecure,
  });
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, config.cors.allowedOrigins.includes(origin));
    },
  });

  app.addHook('onRequest', attachCorrelationId);
  app.addHook('preHandler', apiKeyAuth);
  app.addHook('preHandler', adminNetworkGuard);
  app.addHook('preHandler', rateLimit);
  app.addHook('preHandler', auditLog);
  app.addHook('onResponse', recordRequestMetrics);

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ success: false, error: 'ValidationError', issues: error.flatten() });
    }

    request.log.error({ err: error, endpoint: request.url.split('?')[0], method: request.method });
    if (request.url.startsWith('/bff')) {
      return reply.code(500).send({
        success: false,
        error: 'InternalServerError',
        message: 'Ein interner Fehler ist aufgetreten',
      });
    }

    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return reply.code(500).send({
      success: false,
      error: 'InternalServerError',
      message,
    });
  });

  await app.register(bffRoutes);
  await app.register(benchmarkRoutes);
  await app.register(healthRoutes);
  await app.register(chatRoutes);
  await app.register(ingestRoutes);
  await app.register(insightsRoutes);
  await app.register(privacyRoutes);
  await app.register(searchRoutes);
  await app.register(modelsRoutes);
  await app.register(metricsRoutes);
  await app.register(uiRoutes);

  return app;
}
