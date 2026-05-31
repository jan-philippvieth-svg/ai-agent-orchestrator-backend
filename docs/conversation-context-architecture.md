# Conversation Context — Architecture

## Previous Architecture (before this commit)

Each chat request was stateless. The orchestrator received a raw `message` string, classified it, optionally retrieved knowledge chunks, built a prompt, and called the LLM. No history was retained between requests.

```
ChatRequest { message }
    │
    ├─ ClassifierService.classify(message)
    ├─ RetrievalService.retrieve(message)
    ├─ PromptBuilderService.build(message, chunks)
    └─ LlmService.complete(prompt)
```

Short follow-up inputs ("Dieses Jahr", "Performance", "OK") were classified and retrieved as-is — always landing on `simple` with near-zero retrieval signal, regardless of the preceding conversation.

---

## Current Architecture (da89d30)

### New layer: `ConversationContextService`

A singleton in-process store keyed by `conversationId`. Each completed turn is persisted server-side via `addTurn`. On the next request `getHistory` provides that history to the `resolve` pipeline.

```
ChatRequest { message, conversationId?, messageHistory? }
    │
    ▼
ConversationContextService
    ├─ getHistory(conversationId)            ← server-side store (TTL 1 h, max 20 msgs)
    ├─ fallback to messageHistory            ← client-supplied history
    └─ resolve(message, history)
           ├─ isFollowUpMessage()            ← token-count + regex pattern match
           ├─ findTopicMessage()             ← backward walk over user turns
           └─ resolvedIntent = topic + " – " + followUp
    │
    ▼ resolvedIntent (or original message)
    ├─ ClassifierService.classify(resolvedIntent)   ← inherits topic complexity
    ├─ RetrievalService.retrieve(resolvedIntent)    ← searches topic, not "OK"
    ├─ CacheService.buildChatKey(resolvedIntent)    ← collision-safe, scoped to conversationId
    │       └─ follow-ups bypass cache entirely
    ├─ PromptBuilderService.build(message, chunks, ..., contextForPrompt)
    │       └─ <conversation_context> section with last ≤6 messages
    └─ LlmService.complete(prompt)
           │
           └─ addTurn(conversationId, message, answer)   ← persist for next request
```

### What each piece does

| Component | Role |
|---|---|
| `ConversationContextService.resolve()` | Detects follow-ups, constructs `resolvedIntent`, returns sliding-window `contextForPrompt` |
| `isFollowUpMessage()` | Token threshold (< 12 tokens) + anchored regex patterns (confirmations, time refs, selection words) |
| `findTopicMessage()` | Walks user messages backward, skips follow-ups, returns the last substantive message |
| `addTurn()` / `getHistory()` | In-process map with TTL expiry and 20-message cap |
| `resolvedIntent` | Used for classification, retrieval, and cache keying — the raw message is used only for the LLM user prompt |
| Cache key | Scoped to `conversationId` + `resolvedIntent` hash; follow-ups (`isFollowUp === true`) are unconditionally excluded |
| `contextForPrompt` | Last 6 messages injected into `<conversation_context>` in the user prompt |

### Types introduced

```typescript
ConversationMessage   // { role, content } — the base turn unit
FollowUpResolution    // service return type: isFollowUp, resolvedIntent, topicMessage, contextForPrompt
```

### Type stubs for the next phase (not yet implemented)

```typescript
ConversationSummary   // LLM-generated rolling summary of older turns
SessionFacts          // Pattern-extracted structured facts: topic, timeContext, detailLevel
ContextPackage        // Full context object combining recentTurns + summary + facts + retrievedContext
```

---

## Remaining Gaps

### 1. `ConversationSummary` — rolling summary of older turns

**Problem:** The sliding window exposes the last 6 messages verbatim. Turns older than that are silently dropped. Long conversations lose early context.

**Design intent (stub in `types/index.ts`):**
```typescript
interface ConversationSummary {
  text: string;
  generatedAt: string;
  coveredMessages: number;
}
```

**What needs to be built:**
- After `addTurn`, if stored history exceeds the window, invoke a small LLM call to compress the oldest N messages into a `text` summary.
- Store the summary alongside the message array in `StoredConversation`.
- Surface the summary in `ContextPackage.summary` and inject it above the sliding window in the prompt.

---

### 2. `SessionFacts` — structured fact extraction

**Problem:** Structured signals (topic, time period, requested detail level) are inferred implicitly through `resolvedIntent`. They are not surfaced for routing or prompt construction decisions.

**Design intent (stub in `types/index.ts`):**
```typescript
interface SessionFacts {
  topic?: string;
  timeContext?: string;
  detailLevel?: 'technical' | 'executive' | 'brief';
  lastUpdatedAt: string;
}
```

**What needs to be built:**
- Pattern extraction from user messages (e.g. "letztes Quartal" → `timeContext: "Q4"`, "kurze Zusammenfassung" → `detailLevel: "brief"`).
- Persist extracted facts per `conversationId` alongside the message store.
- Use facts to influence model selection, retrieval filters, or prompt framing.

---

### 3. `ContextPackage` — unified context object

**Problem:** `ContextPackage` is defined as the intended public API of the context layer but is never constructed. The orchestrator currently destructures `FollowUpResolution` directly.

**Design intent (stub in `types/index.ts`):**
```typescript
interface ContextPackage {
  isFollowUp: boolean;
  resolvedIntent: string;
  topicMessage: string;
  recentTurns: ConversationMessage[];       // sliding window
  summary?: ConversationSummary;            // compressed older turns
  facts: SessionFacts;                      // extracted structured facts
  retrievedContext: ConversationMessage[];  // keyword-matched older turns
}
```

**What needs to be built:**
- Refactor `ConversationContextService.resolve()` to return `ContextPackage` instead of `FollowUpResolution`.
- Implement `retrievedContext`: keyword matching of `resolvedIntent` against stored message history to surface relevant older turns that fall outside the sliding window but contain domain-relevant content.
- Propagate `ContextPackage` through the orchestrator to the prompt builder.

---

### 4. Long-term / cross-session memory

**Problem:** All state is in-process with a 1-hour TTL. A conversation is permanently lost when the server restarts or the TTL expires. There is no cross-session continuity.

**What needs to be built:**
- Persist `StoredConversation` (messages + summary + facts) to Redis or a lightweight database.
- Implement a `ConversationRepository` abstraction the service delegates to.
- Define retention and deletion policies (GDPR-aligned, per-tenant).

---

## Scope Boundary

The current implementation stops at stateless-to-stateful follow-up resolution for a single server process within a single session TTL. Everything above the line is the next phase.
