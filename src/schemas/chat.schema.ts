import { z } from 'zod';

export const chatRequestSchema = z.object({
  tenantId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120),
  message: z.string().min(1).max(40_000),
  conversationId: z.string().min(1).max(100).optional(),
  messageHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(1000),
      }),
    )
    .max(10)
    .optional(),
  useRetrieval: z.boolean().default(true),
  preferredModel: z.enum(['auto', 'small', 'medium', 'large']).default('auto'),
  controls: z
    .object({
      promptGuardEnabled: z.boolean().optional(),
      toolRouterEnabled: z.boolean().optional(),
      cacheEnabled: z.boolean().optional(),
      benchmarkMode: z.boolean().optional(),
      hybridRetrievalEnabled: z.boolean().optional(),
      semanticAnchorsEnabled: z.boolean().optional(),
    })
    .strict()
    .optional(),
  metadata: z
    .object({
      projectId: z.string().min(1).max(200).optional(),
      sourceType: z.string().min(1).max(80).optional(),
    })
    .strict()
    .optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
