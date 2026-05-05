import { config } from '../config.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { ResilienceService } from './resilience.service.js';
export class LlmService {
    resilience;
    constructor(resilience = ResilienceService.getInstance()) {
        this.resilience = resilience;
    }
    async complete(request) {
        const attemptedModels = [];
        if (config.stubExternalServices) {
            const userMessage = [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
            return {
                answer: `[stub:${request.modelSize}] ${userMessage.slice(0, 700)}`,
                tokensEstimated: estimateTokens(request.messages),
                usedModelSize: request.modelSize,
                fallbackUsed: false,
                attemptedModels: [request.modelSize],
            };
        }
        let lastError;
        for (const modelSize of this.fallbackOrder(request.modelSize)) {
            attemptedModels.push(modelSize);
            try {
                return await this.completeWithModel({ ...request, modelSize }, attemptedModels, modelSize !== request.modelSize);
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError instanceof Error ? lastError : new Error(`LLM ${request.modelSize} failed`);
    }
    async completeWithModel(request, attemptedModels, fallbackUsed) {
        const modelConfig = config.llm[request.modelSize];
        const response = await this.resilience.run(`llm:${request.modelSize}`, (signal) => fetch(modelConfig.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model: modelConfig.model,
                messages: request.messages,
                temperature: request.temperature ?? 0.2,
                max_tokens: request.maxTokens ?? 1200,
            }),
            signal,
        }));
        if (!response.ok) {
            throw new Error(`LLM ${request.modelSize} failed with HTTP ${response.status}`);
        }
        const data = (await response.json());
        const answer = data.choices?.[0]?.message?.content;
        if (!answer) {
            throw new Error(`LLM ${request.modelSize} returned no answer`);
        }
        return {
            answer,
            tokensEstimated: data.usage?.total_tokens ?? estimateTokens(request.messages) + estimateTokens(answer),
            usedModelSize: request.modelSize,
            fallbackUsed,
            attemptedModels: [...attemptedModels],
        };
    }
    fallbackOrder(modelSize) {
        if (modelSize === 'large')
            return ['large', 'medium', 'small'];
        if (modelSize === 'medium')
            return ['medium', 'small', 'large'];
        return ['small', 'medium', 'large'];
    }
    async health() {
        if (config.stubExternalServices)
            return true;
        return this.modelHealth('small');
    }
    models() {
        return {
            small: config.llm.small.model,
            medium: config.llm.medium.model,
            large: config.llm.large.model,
        };
    }
    async modelHealth(modelSize) {
        try {
            const modelConfig = config.llm[modelSize];
            const response = await this.resilience.run(`llm:${modelSize}:health`, (signal) => fetch(modelConfig.url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: modelConfig.model,
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 1,
                }),
                signal,
            }), { retries: 0, timeoutMs: 1500 });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
