import { createHash } from 'node:crypto';
import type { IngestRequest, QualityGateResult } from '../types/index.js';
import { cleanText, normalizeForHash, removeBoilerplate } from '../utils/textCleaner.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

const junkPatterns = [
  /^\s*(test|asdf|lorem ipsum|debug|hello world)[\s.!-]*$/i,
  /\b(stacktrace|traceback|console\.log|undefined undefined)\b/i,
];

const secretPatterns = [
  /\b(api[_-]?key|secret|password|passwd|private[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*\S+/i,
  /-----BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY-----/i,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
];

const piiPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?\d[\s.-]?){10,}\b/,
];

export class IngestionQualityService {
  evaluate(input: IngestRequest): QualityGateResult {
    const warnings: string[] = [];
    const cleanedContent = removeBoilerplate(cleanText(input.content));
    const tokens = estimateTokens(cleanedContent);

    if (tokens < 60) {
      return {
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: too short or low information density',
        warnings: ['Content is too short for reliable retrieval.'],
        metadataUpdates: {},
      };
    }

    if (junkPatterns.some((pattern) => pattern.test(cleanedContent))) {
      return {
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: irrelevant or debug/test content',
        warnings: ['Content looks like test, debug, or non-knowledge material.'],
        metadataUpdates: {},
      };
    }

    if (secretPatterns.some((pattern) => pattern.test(cleanedContent))) {
      return {
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: potential secret detected',
        warnings: ['Potential password, token, API key, or private credential detected.'],
        metadataUpdates: { containsSecrets: true },
      };
    }

    const containsPotentialPii = piiPatterns.some((pattern) => pattern.test(cleanedContent));
    if (containsPotentialPii || input.privacy?.containsPersonalData) {
      return {
        accepted: false,
        reason: 'Content rejected by ingestion quality gate: personal data must be stored as external payload references',
        warnings: [
          'Potential PII detected in RAG content.',
          'Store personal data in the payload store and reference it via privacy.payloadRefs instead.',
        ],
        metadataUpdates: { containsPersonalData: true },
      };
    }

    if (input.status !== 'approved') {
      warnings.push('Content is not approved; chunks will not be eligible for retrieval by default.');
    }

    const normalized = normalizeForHash(cleanedContent);
    const contentHash = createHash('sha256').update(normalized).digest('hex');

    return {
      accepted: true,
      cleanedContent,
      warnings,
      metadataUpdates: {
        documentHash: contentHash,
        approvedForRetrieval: input.status === 'approved',
        containsPotentialPii: false,
        containsPersonalData: false,
        payloadRefs: input.privacy?.payloadRefs ?? [],
        privacyClass: input.privacy?.privacyClass ?? 'internal',
        retentionPolicy: 'knowledge_base',
        deletionBehavior: input.privacy?.deletionBehavior ?? 'keep_if_pii_free',
      },
    };
  }
}
