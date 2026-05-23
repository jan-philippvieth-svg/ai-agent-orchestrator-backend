import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const storePath = join(process.cwd(), 'data', 'privacy-payloads.json');
export class PayloadStoreService {
    async upsert(input) {
        const records = await this.readAll();
        const now = new Date().toISOString();
        const existingIndex = records.findIndex((record) => record.tenantId === input.tenantId && record.payloadId === input.payloadId);
        const next = {
            ...input,
            createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : now,
            updatedAt: now,
            status: 'active',
        };
        if (existingIndex >= 0) {
            records[existingIndex] = next;
        }
        else {
            records.push(next);
        }
        await this.writeAll(records);
        return next;
    }
    async activeRefsForSubject(tenantId, subjectId) {
        const records = await this.readAll();
        return records
            .filter((record) => record.tenantId === tenantId)
            .filter((record) => record.subjectId === subjectId)
            .filter((record) => record.status === 'active')
            .map((record) => record.payloadId);
    }
    async activeRefs(tenantId, payloadRefs) {
        const refs = new Set(payloadRefs.filter(Boolean));
        if (refs.size === 0)
            return new Set();
        const records = await this.readAll();
        return new Set(records
            .filter((record) => record.tenantId === tenantId)
            .filter((record) => refs.has(record.payloadId))
            .filter((record) => record.status === 'active')
            .map((record) => record.payloadId));
    }
    async deleteBySubject(tenantId, subjectId) {
        const records = await this.readAll();
        const now = new Date().toISOString();
        let deleted = 0;
        const next = records.map((record) => {
            if (record.tenantId !== tenantId || record.subjectId !== subjectId || record.status === 'deleted') {
                return record;
            }
            deleted += 1;
            return {
                ...record,
                data: {},
                status: 'deleted',
                deletedAt: now,
                updatedAt: now,
            };
        });
        await this.writeAll(next);
        return deleted;
    }
    async readAll() {
        try {
            return JSON.parse(await readFile(storePath, 'utf8'));
        }
        catch {
            return [];
        }
    }
    async writeAll(records) {
        await mkdir(dirname(storePath), { recursive: true });
        await writeFile(storePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    }
}
