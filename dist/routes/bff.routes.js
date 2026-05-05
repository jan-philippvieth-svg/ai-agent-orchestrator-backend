import { z } from 'zod';
import { config } from '../config.js';
import { bffChatRequestSchema, bffIngestRequestSchema, bffSearchRequestSchema } from '../schemas/bff.schema.js';
import { BffSessionService } from '../services/bffSession.service.js';
import { ChatOrchestratorService } from '../services/chatOrchestrator.service.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { IngestionService } from '../services/ingestion.service.js';
import { QdrantService } from '../services/qdrant.service.js';
const bffSessionRequestSchema = z.object({
    tenantId: z.string().min(1).max(120),
    userId: z.string().min(1).max(120),
});
async function requireBffSession(request, reply, sessions) {
    const session = sessions.verifyCookie(request.headers.cookie);
    if (!session) {
        await reply.code(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Missing or invalid BFF session',
        });
        return undefined;
    }
    return session;
}
async function requireCsrf(request, reply, session) {
    const csrfHeader = request.headers['x-csrf-token'];
    const provided = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (provided !== session.csrfToken) {
        await reply.code(403).send({
            success: false,
            error: 'CsrfTokenInvalid',
            message: 'Missing or invalid CSRF token',
        });
        return false;
    }
    return true;
}
export async function bffRoutes(app) {
    const sessions = new BffSessionService();
    const chat = new ChatOrchestratorService();
    const ingestion = new IngestionService();
    const embeddings = new EmbeddingService();
    const qdrant = new QdrantService();
    app.post('/bff/session', async (request, reply) => {
        const devLoginKey = request.headers['x-bff-login-key'];
        const providedKey = Array.isArray(devLoginKey) ? devLoginKey[0] : devLoginKey;
        if (providedKey !== config.bff.devLoginKey) {
            return reply.code(401).send({
                success: false,
                error: 'Unauthorized',
                message: 'Missing or invalid BFF login key',
            });
        }
        const parsed = bffSessionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const session = sessions.createSession(parsed.data);
        reply.header('set-cookie', session.cookie);
        return {
            success: true,
            tenantId: parsed.data.tenantId,
            userId: parsed.data.userId,
            csrfToken: session.csrfToken,
        };
    });
    app.post('/bff/logout', async (request, reply) => {
        const session = await requireBffSession(request, reply, sessions);
        if (!session)
            return;
        if (!(await requireCsrf(request, reply, session)))
            return;
        reply.header('set-cookie', sessions.clearCookie());
        return { success: true };
    });
    app.post('/bff/chat', async (request, reply) => {
        const session = await requireBffSession(request, reply, sessions);
        if (!session)
            return;
        if (!(await requireCsrf(request, reply, session)))
            return;
        const parsed = bffChatRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        return chat.run({
            ...parsed.data,
            tenantId: session.tenantId,
            userId: session.userId,
        }, { correlationId: request.correlationId });
    });
    app.post('/bff/search', async (request, reply) => {
        const session = await requireBffSession(request, reply, sessions);
        if (!session)
            return;
        if (!(await requireCsrf(request, reply, session)))
            return;
        const parsed = bffSearchRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const vector = await embeddings.embed(parsed.data.query);
        const results = await qdrant.search(vector, {
            ...parsed.data,
            tenantId: session.tenantId,
            limit: Math.min(parsed.data.limit, config.retrieval.maxLimit),
        });
        return {
            success: true,
            results,
        };
    });
    app.post('/bff/ingest', async (request, reply) => {
        const session = await requireBffSession(request, reply, sessions);
        if (!session)
            return;
        if (!(await requireCsrf(request, reply, session)))
            return;
        const parsed = bffIngestRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ success: false, error: 'ValidationError', issues: parsed.error.flatten() });
        }
        const result = await ingestion.ingest({
            ...parsed.data,
            tenantId: session.tenantId,
        });
        return reply.code(result.success ? 200 : 422).send(result);
    });
}
