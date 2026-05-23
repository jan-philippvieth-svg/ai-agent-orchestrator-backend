import { config } from '../config.js';
export class RankFusionService {
    reciprocalRankFusion(vectorResults, sparseResults, limit) {
        const k = config.retrieval.rankFusionK;
        const byHash = new Map();
        this.addScores(byHash, vectorResults, k);
        this.addScores(byHash, sparseResults, k);
        return [...byHash.values()]
            .sort((a, b) => b.fusedScore - a.fusedScore || b.bestScore - a.bestScore)
            .slice(0, limit)
            .map((item) => ({
            ...item.result,
            score: Math.round(item.fusedScore * 1000) / 1000,
        }));
    }
    addScores(byHash, results, k) {
        results.forEach((result, index) => {
            const key = result.metadata.contentHash;
            const rankScore = 1 / (k + index + 1);
            const existing = byHash.get(key);
            if (existing) {
                existing.fusedScore += rankScore;
                existing.bestScore = Math.max(existing.bestScore, result.score);
            }
            else {
                byHash.set(key, { result, fusedScore: rankScore, bestScore: result.score });
            }
        });
    }
}
