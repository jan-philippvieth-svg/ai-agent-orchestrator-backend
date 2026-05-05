import type { Classification, ModelSize } from '../types/index.js';

interface ChatLogEvent {
  correlationId?: string;
  tenantId: string;
  userId: string;
  classification: Classification;
  selectedModel: ModelSize;
  chunksUsed: number;
  processingTimeMs: number;
}

export class LoggingService {
  chat(event: ChatLogEvent): void {
    console.info(
      JSON.stringify({
        event: 'chat',
        ...event,
      }),
    );
  }
}
