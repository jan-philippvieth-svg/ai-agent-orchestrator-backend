import { z } from 'zod';
export const ingestRequestSchema = z.object({
    tenantId: z.string().min(1).max(120),
    projectId: z.string().min(1).max(200),
    sourceType: z.enum(['document', 'note', 'email', 'markdown', 'pdf_text', 'other']),
    title: z.string().min(1).max(500),
    content: z.string().min(1).max(2_000_000),
    status: z.enum(['draft', 'reviewed', 'approved']),
    tags: z.array(z.string().min(1).max(80)).max(20).default([]),
});
