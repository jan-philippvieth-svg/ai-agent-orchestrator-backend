import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { ResilienceService } from './resilience.service.js';

interface OllamaEmbeddingResponse {
  embedding?: number[];
}

export class EmbeddingService {
  constructor(private readonly resilience = ResilienceService.getInstance()) {}

  async embed(text: string): Promise<number[]> {
    if (config.stubExternalServices) {
      return this.stubEmbedding(text);
    }

    const response = await this.resilience.run('embedding:default', (signal) =>
      fetch(config.embedding.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.embedding.model,
          prompt: text,
        }),
        signal,
      }),
    );

    if (!response.ok) {
      throw new Error(`Embedding service failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;
    if (!Array.isArray(data.embedding)) {
      throw new Error('Embedding service returned no embedding vector');
    }

    return data.embedding;
  }

  async health(): Promise<boolean> {
    if (config.stubExternalServices) return true;

    try {
      const response = await this.resilience.run(
        'embedding:health',
        (signal) =>
          fetch(config.embedding.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: config.embedding.model, prompt: 'health' }),
            signal,
          }),
        { retries: 0, timeoutMs: 1500 },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private stubEmbedding(text: string): number[] {
    const hash = createHash('sha256').update(text).digest();
    return Array.from({ length: 128 }, (_, index) => {
      const value = hash[index % hash.length];
      return (value / 255) * 2 - 1;
    });
  }
}
