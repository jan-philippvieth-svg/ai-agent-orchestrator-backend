import { z } from 'zod';

export const chatRequestSchema = z.object({
  tenantId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120),
  message: z.string().min(1).max(40_000),
  useRetrieval: z.boolean().default(true),
  preferredModel: z.enum(['auto', 'small', 'medium', 'large']).default('auto'),
  metadata: z
    .object({
      projectId: z.string().min(1).max(200).optional(),
      sourceType: z.string().min(1).max(80).optional(),
    })
    .strict()
    .optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
