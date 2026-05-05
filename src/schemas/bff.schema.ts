import { chatRequestSchema } from './chat.schema.js';
import { ingestRequestSchema } from './ingest.schema.js';
import { searchRequestSchema } from './search.schema.js';

export const bffChatRequestSchema = chatRequestSchema
  .omit({
    tenantId: true,
    userId: true,
  })
  .extend({
    message: chatRequestSchema.shape.message.max(8_000),
  });

export const bffSearchRequestSchema = searchRequestSchema.omit({
  tenantId: true,
});

export const bffIngestRequestSchema = ingestRequestSchema.omit({
  tenantId: true,
});
