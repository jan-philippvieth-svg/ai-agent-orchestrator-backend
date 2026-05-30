import { z } from 'zod';

export const searchRequestSchema = z.object({
  tenantId: z.string().min(1).max(120),
  query: z.string().min(1).max(20_000),
  projectId: z.string().min(1).max(200).optional(),
  sourceType: z.string().min(1).max(80).optional(),
  status: z.enum(['draft', 'reviewed', 'approved']).optional(),
  tags: z.array(z.string().min(1).max(80)).max(20).optional(),
  limit: z.number().int().min(1).max(20).default(5),
  useHybridRetrieval: z.boolean().optional(),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;
