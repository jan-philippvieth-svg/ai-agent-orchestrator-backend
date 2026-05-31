import type { Classification } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

// Trailing \b only — no leading \b. This catches German compound nouns that
// CONTAIN the keyword: Systemarchitektur, Datenmigration, Lastskalierung, etc.
// The leading \b was removed intentionally: missing a compound noun causes a
// wrong model downgrade (complex→simple), while a false-positive here is
// harmless (at worst over-routes to large).
const complexPatterns = [
  /(architektur|codeanalyse|refactoring?|security|skalierung|migration|systemdesign)\b/i,
  /\b(produktionsnah|bewertung|bewerte komplex|laengere technische bewertung|längere technische bewertung)\b/i,
  /\b(chunking|retrieval eligibility|context reduction|tenant-isolation|multi-tenant)\b/i,
];

// Extracted as a named const so it is reused identically in classify() and
// in the medium-guard that protects the simple branch.
// \brag\b: "rag" without boundary matched substrings in common German words
// (e.g. "Frage" → F-rag-e, "Betrag", "fragt"). Other terms are long enough
// that substring collisions are negligible in practice.
const mediumPattern = /warum|vergleiche|fasse zusammen|zusammenfassung|technisch|\brag\b/i;

// JS \b treats non-ASCII chars (ü, ä, ö …) as \W, so \bübersetze\b never
// fires when preceded by a space or string start (both \W → no boundary).
// (?<![a-zA-Z]) / (?![a-zA-Z]) is an ASCII-aware portable alternative.
const simplePatterns = [
  /(?<![a-zA-Z])(rezept|kurze mail|smalltalk|umformulieren|erklaer kurz|erkläre kurz|übersetze)(?![a-zA-Z])/i,
  /\b(hallo|hi|danke|bitte)\b/i,
];

export interface ClassifierExplanation {
  classification: Classification;
  tokens: number;
  rule: 'complex_pattern' | 'complex_tokens' | 'medium_pattern' | 'medium_tokens' | 'simple_pattern' | 'simple_default';
  detail: string;
}

export class ClassifierService {
  classify(message: string): Classification {
    return this.explain(message).classification;
  }

  explain(message: string): ClassifierExplanation {
    const tokens = estimateTokens(message);

    // ── 1. Complex ────────────────────────────────────────────────────────────
    for (let i = 0; i < complexPatterns.length; i++) {
      const m = complexPatterns[i].exec(message);
      if (m) {
        return { classification: 'complex', tokens, rule: 'complex_pattern', detail: `complexPatterns[${i}] matched "${m[0]}"` };
      }
    }
    if (tokens > 900) {
      return { classification: 'complex', tokens, rule: 'complex_tokens', detail: `tokens ${tokens} > 900` };
    }

    // ── 2. Medium — checked BEFORE simple ────────────────────────────────────
    // Polite openers ("bitte", "hi", "hallo" …) must not suppress medium-level
    // content. "Bitte fasse die technische Dokumentation zusammen" must route
    // to medium, not small.
    const mediumMatch = mediumPattern.exec(message);
    if (mediumMatch) {
      return { classification: 'medium', tokens, rule: 'medium_pattern', detail: `mediumPattern matched "${mediumMatch[0]}"` };
    }
    if (tokens > 350) {
      return { classification: 'medium', tokens, rule: 'medium_tokens', detail: `tokens ${tokens} > 350` };
    }

    // ── 3. Simple ─────────────────────────────────────────────────────────────
    for (let i = 0; i < simplePatterns.length; i++) {
      const m = simplePatterns[i].exec(message);
      if (m && tokens < 250) {
        return { classification: 'simple', tokens, rule: 'simple_pattern', detail: `simplePatterns[${i}] matched "${m[0]}"` };
      }
    }

    // ── 4. Default ────────────────────────────────────────────────────────────
    return { classification: 'simple', tokens, rule: 'simple_default', detail: 'no pattern matched, default classification' };
  }
}
