import { z } from 'zod';
export const payloadUpsertSchema = z.object({
    tenantId: z.string().min(1).max(120),
    payloadId: z.string().min(1).max(160),
    subjectId: z.string().min(1).max(160),
    payloadType: z.enum(['customer', 'user', 'ticket', 'contract', 'other']).default('other'),
    data: z.record(z.unknown()).default({}),
});
export const deletionRequestSchema = z.object({
    tenantId: z.string().min(1).max(120),
    subjectId: z.string().min(1).max(160),
});
