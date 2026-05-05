import { config } from '../config.js';
export class EfficiencyEstimatorService {
    estimate(input) {
        const modelWorkFactors = this.modelWorkFactors();
        const actualTokens = input.tokensEstimated;
        const actualLlmWork = actualTokens * modelWorkFactors[input.selectedModel];
        const orchestrationOverhead = config.efficiency.classificationWorkUnits +
            (input.retrievalUsed ? config.efficiency.embeddingWorkUnits : 0) +
            input.chunksUsed * config.efficiency.retrievalWorkUnitsPerChunk;
        const actualLlmWorkUnits = Math.max(1, actualLlmWork + orchestrationOverhead);
        // Baseline: same request would go to the 32B/large model with a broad context budget.
        const baselineTokens = Math.max(actualTokens, actualTokens + config.efficiency.baselineContextTokens);
        const savedTokens = Math.max(0, baselineTokens - actualTokens);
        const tokensSavedPercent = Math.max(0, Math.min(100, (savedTokens / baselineTokens) * 100));
        const baselineLlmWorkUnits = Math.max(1, baselineTokens * modelWorkFactors.large);
        const savedLlmWorkUnits = Math.max(0, baselineLlmWorkUnits - actualLlmWorkUnits);
        const savedPercent = Math.max(0, Math.min(100, (savedLlmWorkUnits / baselineLlmWorkUnits) * 100));
        return {
            actualTokens,
            baselineTokens,
            savedTokens,
            tokensSavedPercent: Math.round(tokensSavedPercent * 10) / 10,
            actualLlmWorkUnits: Math.round(actualLlmWorkUnits),
            baselineLlmWorkUnits: Math.round(baselineLlmWorkUnits),
            savedLlmWorkUnits: Math.round(savedLlmWorkUnits),
            savedPercent: Math.round(savedPercent * 10) / 10,
            method: 'estimated_llm_work_units',
            assumptions: {
                baselineModel: 'large',
                baselineContextTokens: config.efficiency.baselineContextTokens,
                modelWorkFactors,
                embeddingWorkUnits: config.efficiency.embeddingWorkUnits,
                classificationWorkUnits: config.efficiency.classificationWorkUnits,
                retrievalWorkUnitsPerChunk: config.efficiency.retrievalWorkUnitsPerChunk,
            },
        };
    }
    modelWorkFactors() {
        return {
            small: config.efficiency.smallModelWorkFactor,
            medium: config.efficiency.mediumModelWorkFactor,
            large: config.efficiency.largeModelWorkFactor,
        };
    }
}
