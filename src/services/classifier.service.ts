import type { Classification } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

const simplePatterns = [
  /\b(rezept|kurze mail|smalltalk|umformulieren|übersetze|erklaer kurz|erkläre kurz)\b/i,
  /\b(hallo|hi|danke|bitte)\b/i,
];

const complexPatterns = [
  /\b(architektur|codeanalyse|refactor|security|skalierung|migration|systemdesign)\b/i,
  /\b(produktionsnah|bewertung|bewerte komplex|laengere technische bewertung|längere technische bewertung)\b/i,
  /\b(chunking|retrieval eligibility|context reduction|tenant-isolation|multi-tenant)\b/i,
];

export class ClassifierService {
  classify(message: string): Classification {
    const tokens = estimateTokens(message);

    if (complexPatterns.some((pattern) => pattern.test(message)) || tokens > 900) {
      return 'complex';
    }

    if (simplePatterns.some((pattern) => pattern.test(message)) && tokens < 250) {
      return 'simple';
    }

    if (tokens > 350 || /warum|vergleiche|fasse zusammen|zusammenfassung|technisch|rag/i.test(message)) {
      return 'medium';
    }

    return 'simple';
  }
}
