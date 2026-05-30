import { config } from '../config.js';
import type { AnchorResolution, ChatRequest, Classification, ModelSize, ToolDefinition, ToolSelection } from '../types/index.js';

interface ToolRouterContext {
  request: ChatRequest;
  classification: Classification;
  selectedModel: ModelSize;
  anchors?: AnchorResolution;
}

export class ToolRouterService {
  private readonly definitions: ToolDefinition[] = [
    {
      name: 'get_stats',
      description: 'Reads internal orchestrator metrics: token savings, cache, prompt guard, resilience and tool usage.',
      useWhen: 'Use for questions about metrics, token savings, cache, guard, fallback, resilience, benchmark or dashboard state.',
    },
    {
      name: 'search_knowledge',
      description: 'Runs a tenant-filtered knowledge search via embedding and Qdrant and returns reduced excerpts.',
      useWhen: 'Use for questions that explicitly need knowledge-base, Qdrant, RAG, document, source or context lookup.',
    },
  ];

  route(context: ToolRouterContext): { enabled: boolean; selected: ToolSelection[] } {
    if (!config.tools.enabled || context.selectedModel !== 'large') {
      return { enabled: false, selected: [] };
    }

    const message = context.request.message;
    const selected: ToolSelection[] = [];

    for (const toolName of context.anchors?.selected?.preferredTools ?? []) {
      selected.push({
        ...this.definition(toolName),
        reason: `Semantic anchor ${context.anchors?.selected?.anchorKey} recommends this tool.`,
      });
    }

    if (/\b(stats|metrics|metriken|einspar|tokens|fallback|cache|guard|resilience|benchmark|dashboard|performance)\b/i.test(message)) {
      selected.push({
        ...this.definition('get_stats'),
        reason: 'Prompt asks about system metrics, performance, token savings or operational state.',
      });
    }

    if (
      !context.request.useRetrieval &&
      /\b(suche|finde|wissensbasis|knowledge|qdrant|rag|dokument|quelle|kontext|retrieval)\b/i.test(message)
    ) {
      selected.push({
        ...this.definition('search_knowledge'),
        reason: 'Prompt asks for knowledge-base or document context and normal retrieval is not already active.',
      });
    }

    return { enabled: true, selected: this.dedupe(selected) };
  }

  private definition(name: ToolDefinition['name']): ToolDefinition {
    const definition = this.definitions.find((item) => item.name === name);
    if (!definition) throw new Error(`Unknown tool definition: ${name}`);
    return definition;
  }

  private dedupe(items: ToolSelection[]): ToolSelection[] {
    const byName = new Map<ToolSelection['name'], ToolSelection>();
    for (const item of items) {
      if (!byName.has(item.name)) byName.set(item.name, item);
    }
    return [...byName.values()];
  }
}
