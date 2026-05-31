# Conversation Context — Architecture

## Baseline (before da89d30)

Each chat request was stateless. The orchestrator received a raw `message` string, classified it, optionally retrieved knowledge chunks, built a prompt, and called the LLM. No history was retained between requests.

```
ChatRequest { message }
    │
    ├─ ClassifierService.classify(message)
    ├─ RetrievalService.retrieve(message)
    ├─ PromptBuilderService.build(message, chunks)
    └─ LlmService.complete(prompt)
```

Short follow-up inputs ("Dieses Jahr", "Performance", "OK") were classified and retrieved as-is — always landing on `simple` with near-zero retrieval signal.

---

## Current Architecture (0af8150)

### Request flow

```
ChatRequest { message, conversationId?, messageHistory? }
    │
    ▼
ConversationContextService.resolve(message, history, conversationId?)
    ├─ getHistory(conversationId)        ← server-side store (TTL 1 h, max 20 msgs)
    ├─ fallback to messageHistory        ← client-supplied history
    ├─ isFollowUpMessage()               ← token-count < 12 + anchored regex patterns
    ├─ findTopicMessage()                ← backward walk over user turns, skips follow-ups
    ├─ resolvedIntent = topic + " – " + followUp
    │
    ├─ recentTurns  = history.slice(-6)          ← verbatim in prompt
    ├─ archive      = history.slice(0, -6)
    │       ├─ summary        = buildSummary(archive)      ← deterministic compression
    │       └─ retrievedContext = retrieveContext(resolvedIntent, archive)  ← keyword match
    └─ facts = stored.facts (incremental) OR extractFactsFromHistory(history)
    │
    ▼ ContextPackage
    ├─ ClassifierService.classify(resolvedIntent)   ← inherits topic complexity
    ├─ RetrievalService.retrieve(resolvedIntent)    ← searches topic, not "OK"
    ├─ CacheService.buildChatKey(resolvedIntent)    ← scoped to conversationId
    │       └─ follow-ups (isFollowUp === true) bypass cache entirely
    ├─ PromptBuilderService.build(message, chunks, tools, contextPackage)
    │       renders in order:
    │           <conversation_summary>   ← contextPackage.summary.text
    │           <retrieved_context>      ← contextPackage.retrievedContext
    │           <conversation_context>   ← contextPackage.recentTurns
    │           <context_untrusted>      ← knowledge chunks
    │           <available_tools> / <tool_results_untrusted>
    │           <user_question>
    └─ LlmService.complete(prompt)
           │
           └─ addTurn(conversationId, message, answer)
                  ├─ updateFacts()      ← incremental fact extraction
                  └─ buildSummary()     ← rebuild archive compression
```

---

### Component reference

| Component | Role |
|---|---|
| `resolve(message, history, conversationId?)` | Returns a full `ContextPackage`; uses stored incremental state when `conversationId` is provided |
| `isFollowUpMessage()` | Token threshold (< 12 tokens) + anchored regex patterns (confirmations, time refs, selection words) |
| `findTopicMessage()` | Walks user messages backward, skips follow-ups, returns the last substantive message |
| `resolvedIntent` | Used for classification, retrieval, and cache keying; raw message is used only for the LLM user prompt |
| `addTurn()` | Stores messages (cap 20), runs `updateFacts()`, rebuilds `summary` from the archive portion |
| `getHistory()` | Returns stored messages for a `conversationId`; evicts on TTL expiry |
| `buildSummary(archive)` | Extractive compression: each archived turn pair → one line `[U] … → [A] <first sentence>` |
| `retrieveContext(resolvedIntent, archive)` | Tokenises intent, scores archived user messages by keyword overlap, returns top-2 pairs |
| `applyFactsFromTurn()` | Extracts topic, timeContext, detailLevel, entities, decisions from a single user+assistant turn |
| `extractFactsFromHistory()` | Full-scan fallback used by `resolve()` when no stored state exists |
| Cache key | SHA-256 of `resolvedIntent` (not raw message), scoped to `conversationId` |

---

### Types — fully implemented

```typescript
ConversationMessage   // { role: 'user' | 'assistant', content: string }

ConversationSummary {
  text: string;            // compressed archive lines joined with \n
  generatedAt: string;     // ISO timestamp
  coveredMessages: number; // count of archived messages covered
}

SessionFacts {
  topic?: string;                              // first substantive user message (≤80 chars)
  timeContext?: string;                        // e.g. "dieses Jahr", "Q1 2025"
  detailLevel?: 'technical' | 'executive' | 'brief';
  entities: string[];                          // capitalised words ≥4 chars, capped at 10
  decisions: string[];                         // decision-marker sentences, capped at 5
  lastUpdatedAt: string;                       // ISO timestamp of last update
}

ContextPackage {
  isFollowUp: boolean;
  resolvedIntent: string;
  topicMessage: string;
  recentTurns: ConversationMessage[];          // last 6 messages, verbatim in prompt
  summary?: ConversationSummary;              // present when archive exists (history > 6)
  facts: SessionFacts;
  retrievedContext: ConversationMessage[];    // keyword-matched older turns (up to 2 pairs)
}
```

---

### SessionFacts extraction rules

| Field | Source | Rule |
|---|---|---|
| `topic` | User message | Set once from first non-follow-up message with ≥3 tokens; never overwritten |
| `timeContext` | User message | 8 regex patterns in priority order; normalised labels; first match wins |
| `detailLevel` | User + assistant | `brief` ← kurz/Kurzfassung/kompakt; `technical` ← technisch/ausführlich; `executive` ← Überblick/management |
| `entities` | User message | Capitalised words ≥4 chars, skipping the first word of the message; deduplicated |
| `decisions` | Assistant message | Sentences matching "ich empfehle", "wir verwenden", "zusammenfassend", etc.; first sentence per pattern |

### ConversationSummary compression

Archive = `storedMessages.slice(0, -6)` — everything older than the sliding window.

Each user/assistant pair in the archive is compressed to one line:
```
[U] <user message, capped at 120 chars> → [A] <first sentence of assistant, capped at 120 chars>
```

Lines are joined with `\n`. Summary is rebuilt on every `addTurn()` call (deterministic, O(n) in archive size).

### RetrievedContext keyword matching

1. Tokenise `resolvedIntent`: lowercase, split on `\W+`, filter length ≥4, remove German stopwords
2. Score each archived **user** message: count how many intent tokens appear in it
3. Sort descending, take up to 2 with score ≥ 1
4. For each matched message also include the immediately following assistant message
5. Return as a flat `ConversationMessage[]`

---

## Remaining Gap

### Long-term / cross-session persistence

**Problem:** All state (`StoredConversation`: messages, summary, facts) lives in an in-process `Map`. It is lost on server restart or after the 1-hour TTL.

**What needs to be built:**
- A `ConversationRepository` interface abstracting the storage backend
- A Redis or SQLite adapter implementing that interface
- Retention and deletion policies (GDPR-aligned, per-tenant, honouring the existing `DeletionBehavior` type)
- The service delegates `get`/`set` to the repository instead of the `Map`

Everything else documented above is complete and tested (72 tests, 18 suites, 0 failures).
