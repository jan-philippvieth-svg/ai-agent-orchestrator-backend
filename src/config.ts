import 'dotenv/config';

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function readList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: readNumber('PORT', 3001),
  apiKey: process.env.API_KEY ?? 'dev-secret',
  qdrant: {
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    collection: process.env.QDRANT_COLLECTION ?? 'holtkamp_knowledge',
    apiKey: process.env.QDRANT_API_KEY,
  },
  llm: {
    small: {
      url: process.env.LLM_SMALL_URL ?? 'http://localhost:1234/v1/chat/completions',
      model: process.env.LLM_SMALL_MODEL ?? 'local-7b',
    },
    medium: {
      url: process.env.LLM_MEDIUM_URL ?? 'http://localhost:1235/v1/chat/completions',
      model: process.env.LLM_MEDIUM_MODEL ?? 'local-13b',
    },
    large: {
      url: process.env.LLM_LARGE_URL ?? 'http://localhost:1236/v1/chat/completions',
      model: process.env.LLM_LARGE_MODEL ?? 'local-32b',
    },
  },
  embedding: {
    url: process.env.EMBEDDING_URL ?? 'http://localhost:11434/api/embeddings',
    model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
  },
  stubExternalServices: readBoolean('STUB_EXTERNAL_SERVICES', true),
  retrieval: {
    defaultLimit: readNumber('RETRIEVAL_DEFAULT_LIMIT', 5),
    maxLimit: readNumber('RETRIEVAL_MAX_LIMIT', 12),
  },
  cors: {
    allowedOrigins: readList('CORS_ALLOWED_ORIGINS'),
  },
  security: {
    rateLimitWindowMs: readNumber('RATE_LIMIT_WINDOW_MS', 60_000),
    rateLimitMaxRequests: readNumber('RATE_LIMIT_MAX_REQUESTS', 30),
    largeModelAllowedUsers: readList('LARGE_MODEL_ALLOWED_USERS'),
    largeModelAllowedApiKeys: readList('LARGE_MODEL_ALLOWED_API_KEYS'),
  },
  bff: {
    devLoginKey: process.env.BFF_DEV_LOGIN_KEY ?? 'dev-bff-login',
    sessionSecret: process.env.BFF_SESSION_SECRET ?? 'dev-session-secret-change-me',
    sessionCookieName: process.env.BFF_SESSION_COOKIE_NAME ?? 'bff_session',
    sessionTtlSeconds: readNumber('BFF_SESSION_TTL_SECONDS', 8 * 60 * 60),
    cookieSecure: readBoolean('BFF_COOKIE_SECURE', false),
  },
  efficiency: {
    smallModelWorkFactor: readNumber('LLM_WORK_FACTOR_SMALL', 0.25),
    mediumModelWorkFactor: readNumber('LLM_WORK_FACTOR_MEDIUM', 0.55),
    largeModelWorkFactor: readNumber('LLM_WORK_FACTOR_LARGE', 1),
    baselineContextTokens: readNumber('TOKEN_SAVINGS_BASELINE_CONTEXT_TOKENS', 2_000),
    embeddingWorkUnits: readNumber('LLM_WORK_UNITS_EMBEDDING', 25),
    classificationWorkUnits: readNumber('LLM_WORK_UNITS_CLASSIFICATION', 1),
    retrievalWorkUnitsPerChunk: readNumber('LLM_WORK_UNITS_RETRIEVAL_PER_CHUNK', 2),
  },
  insights: {
    storePreviews: readBoolean('USER_INSIGHTS_STORE_PREVIEWS', true),
    maxPreviewChars: readNumber('USER_INSIGHTS_MAX_PREVIEW_CHARS', 180),
    maxTopInteractions: readNumber('USER_INSIGHTS_MAX_TOP_INTERACTIONS', 50),
  },
  resilience: {
    requestTimeoutMs: readNumber('EXTERNAL_REQUEST_TIMEOUT_MS', 10_000),
    retryAttempts: readNumber('EXTERNAL_RETRY_ATTEMPTS', 1),
    retryDelayMs: readNumber('EXTERNAL_RETRY_DELAY_MS', 150),
    circuitFailureThreshold: readNumber('CIRCUIT_FAILURE_THRESHOLD', 3),
    circuitCooldownMs: readNumber('CIRCUIT_COOLDOWN_MS', 30_000),
  },
  cache: {
    enabled: readBoolean('CHAT_CACHE_ENABLED', true),
    ttlSeconds: readNumber('CHAT_CACHE_TTL_SECONDS', 300),
    maxEntries: readNumber('CHAT_CACHE_MAX_ENTRIES', 500),
  },
  admin: {
    allowPrivateNetworksOnly: readBoolean('ADMIN_PRIVATE_NETWORKS_ONLY', false),
    allowedIps: readList('ADMIN_ALLOWED_IPS'),
  },
  tools: {
    enabled: readBoolean('TOOL_CALLING_ENABLED', true),
    searchLimit: readNumber('TOOL_SEARCH_LIMIT', 3),
  },
  benchmark: {
    timeoutMs: readNumber('BENCHMARK_TIMEOUT_MS', 30_000),
    priceInputPer1k: readNumber('BENCHMARK_PRICE_INPUT_PER_1K', 0),
    priceOutputPer1k: readNumber('BENCHMARK_PRICE_OUTPUT_PER_1K', 0),
    ragModel: (process.env.BENCHMARK_RAG_MODEL ?? 'medium') as 'small' | 'medium' | 'large',
  },
};

export type AppConfig = typeof config;
