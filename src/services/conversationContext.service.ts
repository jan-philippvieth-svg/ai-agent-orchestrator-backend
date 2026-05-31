import type { ContextPackage, ConversationMessage, ConversationSummary, SessionFacts } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// Messages below this token count are candidates for follow-up detection.
const FOLLOWUP_TOKEN_THRESHOLD = 12; // ≈ 48 chars

// How many messages to expose verbatim in the prompt (last N).
const PROMPT_CONTEXT_MESSAGES = 6; // 3 turns

// Server-side history: max 20 messages (10 turns) per conversation.
const MAX_STORED_MESSAGES = 20;

// Server-side TTL: 1 hour.
const CONVERSATION_TTL_MS = 60 * 60 * 1000;

// Keyword retrieval: max archived turn-pairs to surface.
const RETRIEVED_CONTEXT_MAX = 2;

// Entity extraction: minimum word length to be considered an entity.
const ENTITY_MIN_LENGTH = 4;

// Caps on accumulated facts to bound memory usage.
const MAX_ENTITIES = 10;
const MAX_DECISIONS = 5;

// Char limits for deterministic summary compression per message.
const COMPRESS_USER_CHARS = 120;
const COMPRESS_ASST_CHARS = 120;

// Short-message patterns — anchored at ^ to avoid matching mid-sentence.
const FOLLOWUP_PATTERNS: RegExp[] = [
  /^(ja|nein|ok|okay|genau|gut|passt|stimmt|super|prima|alles klar|klar|gerne|danke|natürlich|sicher|richtig|korrekt)\b/i,
  /^(mach so|mach das|nimm|bitte|erstell|zeig|gib mir|schreib|statt|lieber|eher|beides)\b/i,
  /^(dieses|letztes|nächstes|aktuelles|voriges|diesen|letzten|nächsten|vorigen)\b/i,
  /^(performance|kosten|qualität|detail|kurzfassung|detailfassung|kurz|lang|ohne|mit|nur)\b/i,
  /^(das|die|den|dem|der|eine|einen|ein)\s+\w+$/i, // single article + noun phrase
];

// Time-context patterns: [pattern, label | null]. null = use capture groups from match.
const TIME_PATTERNS: [RegExp, string | null][] = [
  [/\bdieses?\s+jahr\b/i, 'dieses Jahr'],
  [/\bletztes?\s+jahr\b/i, 'letztes Jahr'],
  [/\bnächstes?\s+jahr\b/i, 'nächstes Jahr'],
  [/\bdieses?\s+quartal\b/i, 'dieses Quartal'],
  [/\bletztes?\s+quartal\b/i, 'letztes Quartal'],
  [/\bnächstes?\s+quartal\b/i, 'nächstes Quartal'],
  [/\b(Q[1-4])\s*(\d{4})\b/i, null],  // e.g. "Q1 2025" — use m[1] + m[2]
  [/\b(20\d{2})\b/, null],             // bare year — use m[1]
];

// Detail-level patterns in order of specificity.
const DETAIL_PATTERNS: [RegExp, 'brief' | 'technical' | 'executive'][] = [
  [/kurz(e|er|es|fassung)?|brief|prägnant|kompakt/i, 'brief'],
  [/technisch|detail(iert)?|ausführlich|tiefgehend/i, 'technical'],
  [/executive|management|überblick|high.?level/i, 'executive'],
];

// Decision markers in assistant messages.
const DECISION_PATTERNS: RegExp[] = [
  /ich\s+(empfehle|schlage\s+vor|rate)\b/i,
  /wir\s+(nehmen|verwenden|nutzen|entscheiden\s+uns\s+für)\b/i,
  /das\s+(beste|optimale|richtige)\s+(ist|wäre)\b/i,
  /also\s+(nehmen|verwenden|machen)\s+wir\b/i,
  /zusammenfassend\b/i,
];

// German functional words excluded from keyword matching.
const STOPWORDS = new Set([
  'dass', 'nicht', 'auch', 'aber', 'oder', 'und', 'mit', 'von',
  'die', 'der', 'den', 'dem', 'das', 'eine', 'einen', 'sein', 'sich',
  'ist', 'sind', 'war', 'haben', 'werden', 'kann', 'muss', 'soll',
  'beim', 'nach', 'über', 'unter', 'ohne', 'doch', 'noch', 'dann', 'wenn',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoredConversation {
  messages: ConversationMessage[];
  summary?: ConversationSummary;  // deterministically compressed archive
  facts: SessionFacts;            // incrementally extracted
  expiresAt: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ConversationContextService {
  private static instance: ConversationContextService | undefined;
  private readonly store = new Map<string, StoredConversation>();

  static getInstance(): ConversationContextService {
    ConversationContextService.instance ??= new ConversationContextService();
    return ConversationContextService.instance;
  }

  // ── Context resolution ──────────────────────────────────────────────────────

  /**
   * Resolves the current message against conversation history and returns a
   * full ContextPackage containing intent resolution, recent turns, a
   * deterministic summary of older turns, extracted session facts, and
   * keyword-retrieved archived turns.
   *
   * When `conversationId` is provided and the store has a matching entry,
   * the pre-computed incremental facts and summary are used instead of
   * being recomputed from the history array.
   */
  resolve(
    currentMessage: string,
    history: ConversationMessage[],
    conversationId?: string,
  ): ContextPackage {
    const recentTurns = history.slice(-PROMPT_CONTEXT_MESSAGES);
    const archive = history.length > PROMPT_CONTEXT_MESSAGES
      ? history.slice(0, -PROMPT_CONTEXT_MESSAGES)
      : [];

    // Prefer stored (incremental) facts/summary over recomputing from scratch.
    const stored = conversationId ? this.getStoredEntry(conversationId) : undefined;
    const facts = stored?.facts ?? this.extractFactsFromHistory(history);
    const summary = stored?.summary;

    const hasHistory = history.length >= 1;
    const isFollowUp = hasHistory && this.isFollowUpMessage(currentMessage);

    if (!isFollowUp) {
      return {
        isFollowUp: false,
        resolvedIntent: currentMessage,
        topicMessage: currentMessage,
        recentTurns,
        summary,
        facts,
        retrievedContext: this.retrieveContext(currentMessage, archive),
      };
    }

    const topicMessage = this.findTopicMessage(history);
    if (!topicMessage) {
      return {
        isFollowUp: false,
        resolvedIntent: currentMessage,
        topicMessage: currentMessage,
        recentTurns,
        summary,
        facts,
        retrievedContext: this.retrieveContext(currentMessage, archive),
      };
    }

    const resolvedIntent = `${topicMessage} – ${currentMessage}`;
    return {
      isFollowUp: true,
      resolvedIntent,
      topicMessage,
      recentTurns,
      summary,
      facts,
      retrievedContext: this.retrieveContext(resolvedIntent, archive),
    };
  }

  /**
   * Returns true when `message` looks like a follow-up to a previous turn:
   * short (< FOLLOWUP_TOKEN_THRESHOLD tokens) AND starts with a known
   * confirmation/selection/reference pattern.
   */
  isFollowUpMessage(message: string): boolean {
    if (estimateTokens(message) >= FOLLOWUP_TOKEN_THRESHOLD) return false;
    const trimmed = message.trim();
    return FOLLOWUP_PATTERNS.some((p) => p.test(trimmed));
  }

  // ── Server-side history storage ─────────────────────────────────────────────

  getHistory(conversationId: string): ConversationMessage[] {
    return this.getStoredEntry(conversationId)?.messages ?? [];
  }

  /**
   * Persists a completed turn and incrementally updates facts and summary.
   * Content is capped at 1 000 chars per message to limit memory usage.
   */
  addTurn(conversationId: string, userMessage: string, assistantMessage: string): void {
    const existing = this.getHistory(conversationId);
    const existingEntry = this.getStoredEntry(conversationId);

    const messages: ConversationMessage[] = [
      ...existing,
      { role: 'user' as const, content: userMessage.slice(0, 1000) },
      { role: 'assistant' as const, content: assistantMessage.slice(0, 1000) },
    ].slice(-MAX_STORED_MESSAGES);

    const entry: StoredConversation = {
      messages,
      facts: existingEntry?.facts ?? defaultFacts(),
      expiresAt: Date.now() + CONVERSATION_TTL_MS,
    };

    this.updateFacts(entry, userMessage, assistantMessage);

    const archive = messages.length > PROMPT_CONTEXT_MESSAGES
      ? messages.slice(0, -PROMPT_CONTEXT_MESSAGES)
      : [];
    entry.summary = archive.length > 0 ? this.buildSummary(archive) : undefined;

    this.store.set(conversationId, entry);
  }

  // ── Deterministic summary ───────────────────────────────────────────────────

  /**
   * Compresses an archive of messages into a concise summary string without
   * LLM calls. Each turn pair is extractively summarised to one line.
   */
  private buildSummary(archive: ConversationMessage[]): ConversationSummary {
    const lines: string[] = [];

    for (let i = 0; i < archive.length; i += 2) {
      const userMsg = archive[i];
      const asstMsg = archive[i + 1];
      if (!userMsg) continue;

      const cu = userMsg.content.length <= COMPRESS_USER_CHARS
        ? userMsg.content
        : `${userMsg.content.slice(0, COMPRESS_USER_CHARS - 3)}...`;

      let ca = '';
      if (asstMsg) {
        // First sentence of the assistant response.
        const m = asstMsg.content.match(/^[^.!?\n]+[.!?]?/);
        const first = m ? m[0].trim() : asstMsg.content;
        ca = first.length <= COMPRESS_ASST_CHARS
          ? first
          : `${first.slice(0, COMPRESS_ASST_CHARS - 3)}...`;
      }

      lines.push(asstMsg ? `[U] ${cu} → [A] ${ca}` : `[U] ${cu}`);
    }

    return {
      text: lines.join('\n'),
      generatedAt: new Date().toISOString(),
      coveredMessages: archive.length,
    };
  }

  // ── Session facts extraction ────────────────────────────────────────────────

  /** Full-scan variant used by resolve() when no stored state is available. */
  private extractFactsFromHistory(history: ConversationMessage[]): SessionFacts {
    const facts = defaultFacts();
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role !== 'user') continue;
      const next = history[i + 1];
      this.applyFactsFromTurn(
        facts,
        msg.content,
        next?.role === 'assistant' ? next.content : '',
      );
    }
    return facts;
  }

  /** Incremental variant: only inspects the newly added turn. */
  private updateFacts(stored: StoredConversation, userMsg: string, assistantMsg: string): void {
    this.applyFactsFromTurn(stored.facts, userMsg, assistantMsg);
  }

  /**
   * Mutates `facts` in-place by extracting signals from a single turn.
   * All extractions are additive/idempotent — existing values are preserved.
   */
  private applyFactsFromTurn(facts: SessionFacts, userMsg: string, assistantMsg: string): void {
    // topic: set once from first substantive user message
    if (!facts.topic && !this.isFollowUpMessage(userMsg) && estimateTokens(userMsg) >= 3) {
      facts.topic = userMsg.slice(0, 80);
    }

    // timeContext: first match wins
    if (!facts.timeContext) {
      facts.timeContext = this.extractTimeContext(userMsg) ?? undefined;
    }

    // detailLevel: first match wins across user + assistant text
    if (!facts.detailLevel) {
      const combined = `${userMsg} ${assistantMsg}`;
      for (const [pattern, level] of DETAIL_PATTERNS) {
        if (pattern.test(combined)) {
          facts.detailLevel = level;
          break;
        }
      }
    }

    // entities: capitalised words in user message (skip first word of message)
    const words = userMsg.trim().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const clean = words[i].replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
      if (
        clean.length >= ENTITY_MIN_LENGTH &&
        /^[A-ZÄÖÜ]/.test(clean) &&
        !facts.entities.includes(clean) &&
        facts.entities.length < MAX_ENTITIES
      ) {
        facts.entities.push(clean);
      }
    }

    // decisions: sentences from assistant matching decision patterns
    if (assistantMsg && facts.decisions.length < MAX_DECISIONS) {
      // Split on sentence boundaries while keeping delimiters.
      const sentences = assistantMsg.split(/(?<=[.!?])\s+/);
      for (const pattern of DECISION_PATTERNS) {
        if (!pattern.test(assistantMsg)) continue;
        for (const sentence of sentences) {
          if (pattern.test(sentence)) {
            const d = sentence.trim().slice(0, 100);
            if (!facts.decisions.includes(d)) {
              facts.decisions.push(d);
            }
            break;
          }
        }
        if (facts.decisions.length >= MAX_DECISIONS) break;
      }
    }

    facts.lastUpdatedAt = new Date().toISOString();
  }

  private extractTimeContext(text: string): string | null {
    for (const [pattern, label] of TIME_PATTERNS) {
      const m = pattern.exec(text);
      if (!m) continue;
      if (label !== null) return label;
      // Capture-group patterns: Q1 2025 uses m[1]+m[2]; bare year uses m[1].
      if (m[1] && m[2]) return `${m[1]} ${m[2]}`;
      if (m[1]) return m[1];
    }
    return null;
  }

  // ── Retrieved context ───────────────────────────────────────────────────────

  /**
   * Keyword-matches `resolvedIntent` against archived user messages and
   * returns up to RETRIEVED_CONTEXT_MAX turn pairs (user + assistant).
   */
  private retrieveContext(resolvedIntent: string, archive: ConversationMessage[]): ConversationMessage[] {
    if (archive.length === 0) return [];

    const tokens = resolvedIntent
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));

    if (tokens.length === 0) return [];

    const scored: { idx: number; score: number }[] = [];
    for (let i = 0; i < archive.length; i++) {
      if (archive[i].role !== 'user') continue;
      const content = archive[i].content.toLowerCase();
      const score = tokens.filter((t) => content.includes(t)).length;
      if (score >= 1) scored.push({ idx: i, score });
    }

    scored.sort((a, b) => b.score - a.score);

    const result: ConversationMessage[] = [];
    for (const { idx } of scored.slice(0, RETRIEVED_CONTEXT_MAX)) {
      result.push(archive[idx]);
      if (idx + 1 < archive.length && archive[idx + 1].role === 'assistant') {
        result.push(archive[idx + 1]);
      }
    }
    return result;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private getStoredEntry(conversationId: string): StoredConversation | undefined {
    const entry = this.store.get(conversationId);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(conversationId);
      return undefined;
    }
    return entry;
  }

  /**
   * Walks backwards through user messages to find the last substantive one
   * (i.e. one that is not itself a follow-up).
   */
  private findTopicMessage(history: ConversationMessage[]): string | undefined {
    const userMessages = history.filter((m) => m.role === 'user').reverse();
    for (const msg of userMessages) {
      if (!this.isFollowUpMessage(msg.content)) return msg.content;
    }
    return undefined;
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function defaultFacts(): SessionFacts {
  return {
    entities: [],
    decisions: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}
