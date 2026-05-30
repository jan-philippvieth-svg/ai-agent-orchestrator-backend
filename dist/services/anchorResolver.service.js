import { config } from '../config.js';
import { AnchorRegistryService } from './anchorRegistry.service.js';
export class AnchorResolverService {
    registry;
    constructor(registry = new AnchorRegistryService()) {
        this.registry = registry;
    }
    async resolve(request, enabled) {
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
            .map((anchor) => {
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
    applyExplicitRequestBoundaries(filters, request) {
        return {
            projectId: request.metadata?.projectId ? undefined : filters.projectId,
            sourceType: request.metadata?.sourceType ? undefined : filters.sourceType,
            status: filters.status,
            tags: filters.tags,
        };
    }
    matchesKeyword(keyword, tokens, message) {
        const normalized = keyword.toLowerCase();
        if (normalized.includes('.') || normalized.includes('-') || normalized.includes(' ')) {
            return message.toLowerCase().includes(normalized);
        }
        return tokens.has(normalized);
    }
    keywordWeight(keyword) {
        if (keyword.includes('.') || keyword.includes('-'))
            return 3;
        if (keyword.length >= 9)
            return 2;
        return 1;
    }
    priorityWeight(priority) {
        if (priority === 'high')
            return 3;
        if (priority === 'medium')
            return 2;
        return 1;
    }
    suggest(tokens) {
        const interesting = [...tokens].filter((token) => token.length >= 5).slice(0, 4);
        if (interesting.length < 2)
            return undefined;
        return {
            suggestedKey: interesting.join('.'),
            reason: 'Recurring or domain-specific terms may justify a curated semantic anchor after human review.',
            matchedTerms: interesting,
            status: 'suggested',
        };
    }
    tokenize(text) {
        return new Set(text
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9_.-]+/i)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2));
    }
}
