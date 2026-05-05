import { estimateTokens } from '../utils/tokenEstimator.js';
export class ChunkingService {
    chunk(content) {
        const paragraphs = content
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean);
        const chunks = [];
        let current = '';
        for (const paragraph of paragraphs) {
            const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
            if (estimateTokens(candidate) > 700 && current) {
                chunks.push(current);
                const overlap = this.tailOverlap(current, 80);
                current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
            }
            else {
                current = candidate;
            }
        }
        if (current)
            chunks.push(current);
        return chunks.flatMap((chunk) => this.splitOversizedChunk(chunk)).filter((chunk) => this.isQualityChunk(chunk));
    }
    splitOversizedChunk(chunk) {
        if (estimateTokens(chunk) <= 800)
            return [chunk];
        const sentences = chunk.match(/[^.!?\n]+[.!?]*/g) ?? [chunk];
        const result = [];
        let current = '';
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            const candidate = current ? `${current} ${trimmed}` : trimmed;
            if (estimateTokens(candidate) > 650 && current) {
                result.push(current);
                current = trimmed;
            }
            else {
                current = candidate;
            }
        }
        if (current)
            result.push(current);
        return result;
    }
    tailOverlap(text, maxTokens) {
        const words = text.split(/\s+/);
        const approxWords = Math.max(1, Math.floor(maxTokens * 0.75));
        return words.slice(-approxWords).join(' ');
    }
    isQualityChunk(chunk) {
        const tokens = estimateTokens(chunk);
        if (tokens < 45)
            return false;
        const words = chunk.split(/\s+/).filter(Boolean);
        const alphaWords = words.filter((word) => /[a-zäöüß]{3,}/i.test(word));
        if (alphaWords.length < 25)
            return false;
        if (/^(#+\s*)?[\w\s-]{1,80}$/i.test(chunk.trim()))
            return false;
        return true;
    }
}
