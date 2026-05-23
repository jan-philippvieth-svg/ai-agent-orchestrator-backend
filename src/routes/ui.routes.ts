import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';

const uiRoot = join(process.cwd(), 'web');

const assets: Record<string, { file: string; type: string }> = {
  '/ui': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/ui/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/ui/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
  '/ui/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
};

export async function uiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ui/config', async () => ({
    success: true,
    appName: 'AI Agent Orchestrator',
    stubMode: config.stubExternalServices,
    toolCallingEnabled: config.tools.enabled,
    cacheEnabled: config.cache.enabled,
    benchmark: {
      ragModel: config.benchmark.ragModel,
      timeoutMs: config.benchmark.timeoutMs,
    },
  }));

  for (const [route, asset] of Object.entries(assets)) {
    app.get(route, async (_request, reply) => {
      const content = await readFile(join(uiRoot, asset.file), 'utf8');
      return reply.type(asset.type).send(content);
    });
  }
}
