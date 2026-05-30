import { config } from '../config.js';
import type { AnchorFilters, AnchorMatch, AnchorResolution, AnchorSuggestion, ChatRequest } from '../types/index.js';
import { AnchorRegistryService } from './anchorRegistry.service.js';

export class AnchorResolverService {
  constructor(private readonly registry = new AnchorRegistryService()) {}

  async resolve(request: ChatRequest, enabled: boolean): Promise<AnchorResolution> {
    if (!enabled || !config.anchors.enabled) {
      return {
        enabled: false,
        matched: false,
        candidates: [],
        appliedFilters: {},
      };
    }

    const anchors = await this.registry.listApproved();
    const tokens = this.tokenize(request.message);
    const candidates = anchors
      .map((anchor): AnchorMatch => {
        const matchedKeywords = anchor.keywords.filter((keyword) => this.matchesKeyword(keyword, tokens, request.message));
        const score = matchedKeywords.reduce((sum, keyword) => sum + this.keywordWeight(keyword), 0);
        return {
          anchorKey: anchor.anchorKey,
          title: anchor.title,
          score,
          priority: anchor.priority,
          matchedKeywords,
          qdrantFilters: anchor.qdrantFilters,
          preferredTools: anchor.preferredTools,
          preferredModel: anchor.preferredModel,
        };
      })
      .filter((candidate) => candidate.score >= config.anchors.minScore)
      .sort((a, b) => b.score - a.score || this.priorityWeight(b.priority) - this.priorityWeight(a.priority))
      .slice(0, config.anchors.maxCandidates);

    const selected = candidates[0];
    return {
      enabled: true,
      matched: Boolean(selected),
      selected,
      candidates,
      appliedFilters: selected ? this.applyExplicitRequestBoundaries(selected.qdrantFilters, request) : {},
      suggestion: selected ? undefined : this.suggest(tokens),
    };
  }

  private applyExplicitRequestBoundaries(filters: AnchorFilters, request: ChatRequest): AnchorFilters {
    return {
      projectId: request.metadata?.projectId ? undefined : filters.projectId,
      sourceType: request.metadata?.sourceType ? undefined : filters.sourceType,
      status: filters.status,
      tags: filters.tags,
    };
  }

  private matchesKeyword(keyword: string, tokens: Set<string>, message: string): boolean {
    const normalized = keyword.toLowerCase();
    if (normalized.includes('.') || normalized.includes('-') || normalized.includes(' ')) {
      return message.toLowerCase().includes(normalized);
    }
    return tokens.has(normalized);
  }

  private keywordWeight(keyword: string): number {
    if (keyword.includes('.') || keyword.includes('-')) return 3;
    if (keyword.length >= 9) return 2;
    return 1;
  }

  private priorityWeight(priority: AnchorMatch['priority']): number {
    if (priority === 'high') return 3;
    if (priority === 'medium') return 2;
    return 1;
  }

  private suggest(tokens: Set<string>): AnchorSuggestion | undefined {
    const interesting = [...tokens].filter((token) => token.length >= 5).slice(0, 4);
    if (interesting.length < 2) return undefined;

    return {
      suggestedKey: interesting.join('.'),
      reason: 'Recurring or domain-specific terms may justify a curated semantic anchor after human review.',
      matchedTerms: interesting,
      status: 'suggested',
    };
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9_.-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    );
  }
}
