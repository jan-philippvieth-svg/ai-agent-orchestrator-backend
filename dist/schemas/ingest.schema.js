import { z } from 'zod';
export const ingestRequestSchema = z.object({
    tenantId: z.string().min(1).max(120),
    projectId: z.string().min(1).max(200),
    sourceType: z.enum(['document', 'note', 'email', 'markdown', 'pdf_text', 'other']),
    title: z.string().min(1).max(500),
    content: z.string().min(1).max(2_000_000),
    status: z.enum(['draft', 'reviewed', 'approved']),
    tags: z.array(z.string().min(1).max(80)).max(20).default([]),
    privacy: z
        .object({
        privacyClass: z.enum(['public_internal', 'internal', 'confidential', 'personal_reference']).optional(),
        payloadRefs: z.array(z.string().min(1).max(160)).max(50).default([]),
        containsPersonalData: z.boolean().optional(),
        deletionBehavior: z.enum(['keep_if_pii_free', 'delete_payload_only', 'delete_chunk_if_pii']).optional(),
    })
        .strict()
        .optional(),
});
