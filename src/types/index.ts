export type Classification = 'simple' | 'medium' | 'complex';
export type ModelSize = 'small' | 'medium' | 'large';
export type PreferredModel = 'auto' | ModelSize;
export type SourceType = 'document' | 'note' | 'email' | 'markdown' | 'pdf_text' | 'other';
export type DocumentStatus = 'draft' | 'reviewed' | 'approved';
export type ServiceStatus = 'ok' | 'unavailable';
export type PrivacyClass = 'public_internal' | 'internal' | 'confidential' | 'personal_reference';
export type DeletionBehavior = 'keep_if_pii_free' | 'delete_payload_only' | 'delete_chunk_if_pii';
export type AnchorPriority = 'low' | 'medium' | 'high';
export type AnchorStatus = 'suggested' | 'approved' | 'disabled';

export interface ChatControls {
  promptGuardEnabled?: boolean;
  toolRouterEnabled?: boolean;
  cacheEnabled?: boolean;
  benchmarkMode?: boolean;
  hybridRetrievalEnabled?: boolean;
  semanticAnchorsEnabled?: boolean;
}

export interface ChatRequest {
  tenantId: string;
  userId: string;
  message: string;
  useRetrieval: boolean;
  preferredModel: PreferredModel;
  controls?: ChatControls;
  metadata?: {
    projectId?: string;
    sourceType?: string;
  };
}

export interface AnchorFilters {
  projectId?: string;
  sourceType?: string;
  status?: DocumentStatus;
  tags?: string[];
}

export interface AnchorExternalRef {
  type: 'github_topic' | 'wikidata' | 'dbpedia' | 'owasp' | 'cncf' | 'internal_doc' | 'other';
  id: string;
  url?: string;
}

export interface SemanticAnchor {
  anchorKey: string;
  title: string;
  description: string;
  keywords: string[];
  qdrantFilters: AnchorFilters;
  preferredTools: ToolName[];
  preferredModel?: ModelSize;
  priority: AnchorPriority;
  status: AnchorStatus;
  source: 'internal' | 'public_seed';
  externalRefs: AnchorExternalRef[];
}

export interface AnchorMatch {
  anchorKey: string;
  title: string;
  score: number;
  priority: AnchorPriority;
  matchedKeywords: string[];
  qdrantFilters: AnchorFilters;
  preferredTools: ToolName[];
  preferredModel?: ModelSize;
}

export interface AnchorSuggestion {
  suggestedKey: string;
  reason: string;
  matchedTerms: string[];
  status: 'suggested';
}

export interface AnchorResolution {
  enabled: boolean;
  matched: boolean;
  selected?: AnchorMatch;
  candidates: AnchorMatch[];
  appliedFilters: AnchorFilters;
  suggestion?: AnchorSuggestion;
}

export interface ChatResponse {
  success: true;
  answer: string;
  metadata: {
    selectedModel: ModelSize;
    routedModel: ModelSize;
    fallbackUsed: boolean;
    attemptedModels: ModelSize[];
    classification: Classification;
    tokensEstimated: number;
    retrievalUsed: boolean;
    chunksUsed: number;
    processingTimeMs: number;
    warnings?: string[];
    cache: {
      hit: boolean;
      eligible: boolean;
    };
    tools: {
      enabled: boolean;
      selected: ToolSelection[];
      calls: ToolCallMetadata[];
    };
    guard: PromptGuardMetadata;
    controls?: ChatControls & {
      retrievalEnabled: boolean;
      hybridRetrievalEnabled: boolean;
      semanticAnchorsEnabled: boolean;
      stubMode: boolean;
    };
    anchors?: AnchorResolution;
    retrievalMode?: 'disabled' | 'vector' | 'hybrid';
    retrievalDiagnostics?: {
      vectorResults: number;
      sparseResults: number;
      fusedResults: number;
      rankFusion: 'rrf' | 'none';
    };
    efficiency: {
      actualTokens: number;
      baselineTokens: number;
      savedTokens: number;
      tokensSavedPercent: number;
      estimatedLlmWorkSavedPercent: number;
      actualLlmWorkUnits: number;
      baselineLlmWorkUnits: number;
      savedLlmWorkUnits: number;
      method: string;
    };
  };
}

export interface IngestRequest {
  tenantId: string;
  projectId: string;
  sourceType: SourceType;
  title: string;
  content: string;
  status: DocumentStatus;
  tags: string[];
  privacy?: {
    privacyClass?: PrivacyClass;
    payloadRefs?: string[];
    containsPersonalData?: boolean;
    deletionBehavior?: DeletionBehavior;
  };
}

export interface IngestAcceptedResponse {
  success: true;
  documentId: string;
  accepted: true;
  chunksCreated: number;
  warnings: string[];
}

export interface IngestRejectedResponse {
  success: false;
  accepted: false;
  reason: string;
  warnings: string[];
}

export interface SearchRequest {
  tenantId: string;
  query: string;
  projectId?: string;
  sourceType?: string;
  status?: DocumentStatus;
  tags?: string[];
  limit: number;
  useHybridRetrieval?: boolean;
}

export interface ChunkMetadata {
  tenantId: string;
  projectId: string;
  sourceType: SourceType;
  title: string;
  status: DocumentStatus;
  tags: string[];
  chunkIndex: number;
  documentId: string;
  contentHash: string;
  documentHash: string;
  createdAt: string;
  approvedForRetrieval: boolean;
  containsPersonalData: boolean;
  payloadRefs: string[];
  privacyClass: PrivacyClass;
  retentionPolicy: string;
  deletionBehavior: DeletionBehavior;
  warnings?: string[];
  [key: string]: unknown;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  vector?: number[];
  metadata: ChunkMetadata;
}

export interface SearchResult {
  text: string;
  score: number;
  metadata: ChunkMetadata;
}

export interface QualityGateResult {
  accepted: boolean;
  reason?: string;
  cleanedContent?: string;
  warnings: string[];
  metadataUpdates: Record<string, unknown>;
}

export interface PrivacyPayloadRecord {
  tenantId: string;
  payloadId: string;
  subjectId: string;
  payloadType: 'customer' | 'user' | 'ticket' | 'contract' | 'other';
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  status: 'active' | 'deleted';
}

export interface DeletionRequestResult {
  success: true;
  tenantId: string;
  subjectId: string;
  deletedPayloads: number;
  qdrantChunksDeleted: number;
  qdrantKnowledgeUnaffected: boolean;
  warnings: string[];
}

export type ToolCallStatus = 'success' | 'skipped' | 'error';
export type ToolName = 'get_stats' | 'search_knowledge';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  useWhen: string;
}

export interface ToolSelection extends ToolDefinition {
  reason: string;
}

export interface ToolCallResult {
  name: string;
  status: ToolCallStatus;
  content: string;
  itemsUsed: number;
  rawTokensEstimated: number;
  injectedTokens: number;
  savedTokens: number;
  reductionPercent: number;
  processingTimeMs: number;
  error?: string;
}

export interface ToolCallMetadata {
  name: string;
  status: ToolCallStatus;
  itemsUsed: number;
  rawTokensEstimated: number;
  injectedTokens: number;
  savedTokens: number;
  reductionPercent: number;
  processingTimeMs: number;
  error?: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type PromptGuardRisk = 'low' | 'medium' | 'high' | 'blocked';
export type PromptGuardStatus = 'allowed' | 'blocked';

export interface PromptGuardMetadata {
  blocked: boolean;
  status?: PromptGuardStatus;
  risk?: PromptGuardRisk;
  category?: string;
  categories?: string[];
  warnings?: string[];
  reason?: string;
}

export interface PromptGuardResult {
  allowed: boolean;
  sanitizedMessage: string;
  warnings: string[];
  categories: string[];
  risk: PromptGuardRisk;
  reasonCode?: string;
  reason?: string;
}

export interface LlmRequest {
  modelSize: ModelSize;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  answer: string;
  tokensEstimated: number;
  usedModelSize: ModelSize;
  fallbackUsed: boolean;
  attemptedModels: ModelSize[];
}
