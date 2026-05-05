export type Classification = 'simple' | 'medium' | 'complex';
export type ModelSize = 'small' | 'medium' | 'large';
export type PreferredModel = 'auto' | ModelSize;
export type SourceType = 'document' | 'note' | 'email' | 'markdown' | 'pdf_text' | 'other';
export type DocumentStatus = 'draft' | 'reviewed' | 'approved';
export type ServiceStatus = 'ok' | 'unavailable';

export interface ChatRequest {
  tenantId: string;
  userId: string;
  message: string;
  useRetrieval: boolean;
  preferredModel: PreferredModel;
  metadata?: {
    projectId?: string;
    sourceType?: string;
  };
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
  limit: number;
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
