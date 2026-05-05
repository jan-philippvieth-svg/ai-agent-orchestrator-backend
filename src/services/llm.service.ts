import { config } from '../config.js';
import type { LlmRequest, LlmResponse, ModelSize } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { ResilienceService } from './resilience.service.js';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

export class LlmService {
  constructor(private readonly resilience = ResilienceService.getInstance()) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const attemptedModels: ModelSize[] = [];

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

    let lastError: unknown;
    for (const modelSize of this.fallbackOrder(request.modelSize)) {
      attemptedModels.push(modelSize);
      try {
        return await this.completeWithModel({ ...request, modelSize }, attemptedModels, modelSize !== request.modelSize);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`LLM ${request.modelSize} failed`);
  }

  private async completeWithModel(
    request: LlmRequest,
    attemptedModels: ModelSize[],
    fallbackUsed: boolean,
  ): Promise<LlmResponse> {
    const modelConfig = config.llm[request.modelSize];
    const response = await this.resilience.run(`llm:${request.modelSize}`, (signal) =>
      fetch(modelConfig.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modelConfig.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 1200,
        }),
        signal,
      }),
    );

    if (!response.ok) {
      throw new Error(`LLM ${request.modelSize} failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as OpenAiChatResponse;
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

  private fallbackOrder(modelSize: ModelSize): ModelSize[] {
    if (modelSize === 'large') return ['large', 'medium', 'small'];
    if (modelSize === 'medium') return ['medium', 'small', 'large'];
    return ['small', 'medium', 'large'];
  }

  async health(): Promise<boolean> {
    if (config.stubExternalServices) return true;
    return this.modelHealth('small');
  }

  models(): Record<ModelSize, string> {
    return {
      small: config.llm.small.model,
      medium: config.llm.medium.model,
      large: config.llm.large.model,
    };
  }

  private async modelHealth(modelSize: ModelSize): Promise<boolean> {
    try {
      const modelConfig = config.llm[modelSize];
      const response = await this.resilience.run(
        `llm:${modelSize}:health`,
        (signal) =>
          fetch(modelConfig.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: modelConfig.model,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
            signal,
          }),
        { retries: 0, timeoutMs: 1500 },
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
