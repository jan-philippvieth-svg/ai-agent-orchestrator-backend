import { LlmService } from '../services/llm.service.js';
export async function modelsRoutes(app) {
    const llm = new LlmService();
    app.get('/models', async () => llm.models());
}
