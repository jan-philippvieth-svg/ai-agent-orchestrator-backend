import { z } from 'zod';

export const searchRequestSchema = z.object({
  tenantId: z.string().min(1).max(120),
  query: z.string().min(1).max(20_000),
  projectId: z.string().min(1).max(200).optional(),
  sourceType: z.string().min(1).max(80).optional(),
  status: z.enum(['draft', 'reviewed', 'approved']).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;
