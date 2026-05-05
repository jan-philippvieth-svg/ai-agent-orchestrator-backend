import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
export class UserInsightService {
    statePath = join(process.cwd(), 'data', 'user-insights.json');
    async recordInteraction(input) {
        if (input.response.metadata.guard.blocked)
            return;
        const state = await this.load();
        const interaction = this.buildInteraction(input);
        const existing = state.users.find((user) => user.tenantId === input.tenantId && user.userId === input.userId);
        if (existing) {
            this.updateUser(existing, interaction);
        }
        else {
            state.users.push(this.createUser(input.tenantId, input.userId, interaction));
        }
        state.topInteractions.push(interaction);
        state.topInteractions.sort((a, b) => b.overallValueScore - a.overallValueScore);
        state.topInteractions = state.topInteractions.slice(0, config.insights.maxTopInteractions);
        state.users.sort((a, b) => b.avgOverallValueScore - a.avgOverallValueScore);
        await this.save(state);
    }
    async getInsights() {
        return this.load();
    }
    async getUser(tenantId, userId) {
        const state = await this.load();
        return {
            user: state.users.find((item) => item.tenantId === tenantId && item.userId === userId),
            topInteractions: state.topInteractions.filter((item) => item.tenantId === tenantId && item.userId === userId),
        };
    }
    buildInteraction(input) {
        const metadata = input.response.metadata;
        const inputScore = this.scoreInput(input.message, metadata.chunksUsed, metadata.retrievalUsed);
        const answerScore = this.scoreAnswer(input.response.answer, metadata);
        const overallValueScore = Math.round(inputScore.score * 0.55 + answerScore * 0.45);
        return {
            id: createHash('sha256').update(`${input.tenantId}:${input.userId}:${input.message}:${Date.now()}`).digest('hex'),
            timestamp: new Date().toISOString(),
            tenantId: input.tenantId,
            userId: input.userId,
            messageHash: this.hash(input.message),
            answerHash: this.hash(input.response.answer),
            messagePreview: this.preview(input.message),
            answerPreview: this.preview(input.response.answer),
            inputQualityScore: inputScore.score,
            answerValueScore: answerScore,
            overallValueScore,
            inputSignals: inputScore.signals,
            selectedModel: metadata.selectedModel,
            classification: metadata.classification,
            tokensEstimated: metadata.tokensEstimated,
            savedTokens: metadata.efficiency.savedTokens,
            tokensSavedPercent: metadata.efficiency.tokensSavedPercent,
            chunksUsed: metadata.chunksUsed,
            retrievalUsed: metadata.retrievalUsed,
            processingTimeMs: metadata.processingTimeMs,
        };
    }
    scoreInput(message, chunksUsed, retrievalUsed) {
        const tokens = estimateTokens(message);
        const signals = [];
        let score = 35;
        if (tokens >= 8 && tokens <= 180) {
            score += 18;
            signals.push('good_length');
        }
        else if (tokens > 180 && tokens <= 600) {
            score += 10;
            signals.push('detailed_but_long');
        }
        else {
            signals.push(tokens < 8 ? 'very_short' : 'very_long');
        }
        if (/[?]/.test(message) || /\b(bewerte|vergleiche|fasse|warum|wie|analysiere|erstelle)\b/i.test(message)) {
            score += 15;
            signals.push('clear_task');
        }
        if (/\b(qdrant|rag|embedding|tenant|bff|security|tokens|modell|architektur|chunking|retrieval)\b/i.test(message)) {
            score += 15;
            signals.push('domain_specific');
        }
        if (/\b(ziel|kontext|erwartung|format|beispiel|kriterien|daten|annahmen)\b/i.test(message)) {
            score += 12;
            signals.push('context_or_constraints');
        }
        if (retrievalUsed && chunksUsed > 0) {
            score += 10;
            signals.push('retrieval_matched');
        }
        if (/\b(test|asdf|hallo|ok)\b/i.test(message) && tokens < 15) {
            score -= 20;
            signals.push('low_information');
        }
        return { score: Math.max(0, Math.min(100, score)), signals };
    }
    scoreAnswer(answer, metadata) {
        let score = 35;
        const answerTokens = estimateTokens(answer);
        if (answerTokens >= 20)
            score += 20;
        if (metadata.efficiency.tokensSavedPercent >= 50)
            score += 15;
        if (metadata.processingTimeMs < 3_000)
            score += 10;
        if (metadata.selectedModel !== 'large' || metadata.classification === 'complex')
            score += 10;
        if (metadata.retrievalUsed && metadata.chunksUsed === 0)
            score -= 10;
        return Math.max(0, Math.min(100, score));
    }
    createUser(tenantId, userId, interaction) {
        return {
            tenantId,
            userId,
            requests: 1,
            avgInputQualityScore: interaction.inputQualityScore,
            avgAnswerValueScore: interaction.answerValueScore,
            avgOverallValueScore: interaction.overallValueScore,
            totalSavedTokens: interaction.savedTokens,
            avgTokensSavedPercent: interaction.tokensSavedPercent,
            avgLatencyMs: interaction.processingTimeMs,
            retrievalUseRate: interaction.retrievalUsed ? 1 : 0,
            modelDistribution: { small: 0, medium: 0, large: 0, [interaction.selectedModel]: 1 },
            classificationDistribution: { simple: 0, medium: 0, complex: 0, [interaction.classification]: 1 },
            lastSeenAt: interaction.timestamp,
        };
    }
    updateUser(user, interaction) {
        const previous = user.requests;
        user.requests += 1;
        user.avgInputQualityScore = this.runningAverage(user.avgInputQualityScore, interaction.inputQualityScore, previous);
        user.avgAnswerValueScore = this.runningAverage(user.avgAnswerValueScore, interaction.answerValueScore, previous);
        user.avgOverallValueScore = this.runningAverage(user.avgOverallValueScore, interaction.overallValueScore, previous);
        user.totalSavedTokens += interaction.savedTokens;
        user.avgTokensSavedPercent = this.runningAverage(user.avgTokensSavedPercent, interaction.tokensSavedPercent, previous);
        user.avgLatencyMs = this.runningAverage(user.avgLatencyMs, interaction.processingTimeMs, previous);
        user.retrievalUseRate = this.runningAverage(user.retrievalUseRate, interaction.retrievalUsed ? 1 : 0, previous);
        user.modelDistribution[interaction.selectedModel] += 1;
        user.classificationDistribution[interaction.classification] += 1;
        user.lastSeenAt = interaction.timestamp;
    }
    runningAverage(currentAverage, nextValue, previousCount) {
        return Math.round(((currentAverage * previousCount + nextValue) / (previousCount + 1)) * 10) / 10;
    }
    preview(value) {
        if (!config.insights.storePreviews)
            return undefined;
        return value.replace(/\s+/g, ' ').trim().slice(0, config.insights.maxPreviewChars);
    }
    hash(value) {
        return createHash('sha256').update(value).digest('hex');
    }
    async load() {
        try {
            return JSON.parse(await readFile(this.statePath, 'utf8'));
        }
        catch {
            return { users: [], topInteractions: [] };
        }
    }
    async save(state) {
        await mkdir(dirname(this.statePath), { recursive: true });
        await writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    }
}
