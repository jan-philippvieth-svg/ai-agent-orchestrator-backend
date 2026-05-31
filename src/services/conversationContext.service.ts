import type { ConversationMessage } from '../types/index.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// Messages below this token count are candidates for follow-up detection.
const FOLLOWUP_TOKEN_THRESHOLD = 12; // ≈ 48 chars

// How many messages to expose to the PromptBuilder for LLM context (last N).
const PROMPT_CONTEXT_MESSAGES = 6; // 3 turns

// Server-side history: max 20 messages (10 turns) per conversation.
const MAX_STORED_MESSAGES = 20;

// Server-side TTL: 1 hour.
const CONVERSATION_TTL_MS = 60 * 60 * 1000;

// Short-message patterns — all anchored at ^ to avoid matching mid-sentence.
// Only fire when the message STARTS with one of these tokens.
const FOLLOWUP_PATTERNS: RegExp[] = [
  /^(ja|nein|ok|okay|genau|gut|passt|stimmt|super|prima|alles klar|klar|gerne|danke|natürlich|sicher|richtig|korrekt)\b/i,
  /^(mach so|mach das|nimm|bitte|erstell|zeig|gib mir|schreib|statt|lieber|eher|beides)\b/i,
  /^(dieses|letztes|nächstes|aktuelles|voriges|diesen|letzten|nächsten|vorigen)\b/i,
  /^(performance|kosten|qualität|detail|kurzfassung|detailfassung|kurz|lang|ohne|mit|nur)\b/i,
  /^(das|die|den|dem|der|eine|einen|ein)\s+\w+$/i,  // single article + noun phrase
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FollowUpResolution {
  isFollowUp: boolean;
  /** Used for classification + retrieval instead of the raw current message. */
  resolvedIntent: string;
  /** The original substantive user message that started this topic. */
  topicMessage: string;
  /** Last ≤6 messages for the PromptBuilder's conversation_context section. */
  contextForPrompt: ConversationMessage[];
}

interface StoredConversation {
  messages: ConversationMessage[];
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
   * Analyses the current message in the context of the conversation history.
   *
   * If the message is a short follow-up (e.g. "Dieses Jahr", "Performance",
   * "OK"), it is resolved against the last substantive user message to produce
   * a `resolvedIntent` that can be used for classification and retrieval.
   *
   * If there is no history or the message is not a follow-up, `resolvedIntent`
   * equals the original message and `isFollowUp` is false.
   */
  resolve(currentMessage: string, history: ConversationMessage[]): FollowUpResolution {
    const contextForPrompt = history.slice(-PROMPT_CONTEXT_MESSAGES);

    if (history.length < 1 || !this.isFollowUpMessage(currentMessage)) {
      return {
        isFollowUp: false,
        resolvedIntent: currentMessage,
        topicMessage: currentMessage,
        contextForPrompt,
      };
    }

    const topicMessage = this.findTopicMessage(history);

    if (!topicMessage) {
      return {
        isFollowUp: false,
        resolvedIntent: currentMessage,
        topicMessage: currentMessage,
        contextForPrompt,
      };
    }

    return {
      isFollowUp: true,
      resolvedIntent: `${topicMessage} – ${currentMessage}`,
      topicMessage,
      contextForPrompt,
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
    const entry = this.store.get(conversationId);
    if (!entry) return [];
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(conversationId);
      return [];
    }
    return entry.messages;
  }

  /**
   * Called after each completed chat turn to persist the exchange.
   * Content is capped at 1000 chars per message to limit memory usage.
   */
  addTurn(conversationId: string, userMessage: string, assistantMessage: string): void {
    const existing = this.getHistory(conversationId);
    const messages: ConversationMessage[] = [
      ...existing,
      { role: 'user' as const, content: userMessage.slice(0, 1000) },
      { role: 'assistant' as const, content: assistantMessage.slice(0, 1000) },
    ].slice(-MAX_STORED_MESSAGES);

    this.store.set(conversationId, {
      messages,
      expiresAt: Date.now() + CONVERSATION_TTL_MS,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

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
