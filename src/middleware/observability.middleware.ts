import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MetricsService } from '../services/metrics.service.js';

const metrics = MetricsService.getInstance();

export async function attachCorrelationId(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const incoming = request.headers['x-correlation-id'];
  request.correlationId = Array.isArray(incoming) ? incoming[0] : incoming || randomUUID();
  request.requestStartedAt = Date.now();
  reply.header('x-correlation-id', request.correlationId);
}

export async function recordRequestMetrics(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const latencyMs = Date.now() - request.requestStartedAt;
  const route = request.routeOptions.url ?? request.url.split('?')[0] ?? 'unknown';
  metrics.recordHttpRequest(request.method, route, reply.statusCode, latencyMs);
}
