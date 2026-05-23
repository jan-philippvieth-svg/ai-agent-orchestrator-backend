import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PrivacyPayloadRecord } from '../types/index.js';

const storePath = join(process.cwd(), 'data', 'privacy-payloads.json');

export class PayloadStoreService {
  async upsert(input: Omit<PrivacyPayloadRecord, 'createdAt' | 'updatedAt' | 'status'>): Promise<PrivacyPayloadRecord> {
    const records = await this.readAll();
    const now = new Date().toISOString();
    const existingIndex = records.findIndex(
      (record) => record.tenantId === input.tenantId && record.payloadId === input.payloadId,
    );
    const next: PrivacyPayloadRecord = {
      ...input,
      createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : now,
      updatedAt: now,
      status: 'active',
    };

    if (existingIndex >= 0) {
      records[existingIndex] = next;
    } else {
      records.push(next);
    }

    await this.writeAll(records);
    return next;
  }

  async activeRefsForSubject(tenantId: string, subjectId: string): Promise<string[]> {
    const records = await this.readAll();
    return records
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => record.subjectId === subjectId)
      .filter((record) => record.status === 'active')
      .map((record) => record.payloadId);
  }

  async activeRefs(tenantId: string, payloadRefs: string[]): Promise<Set<string>> {
    const refs = new Set(payloadRefs.filter(Boolean));
    if (refs.size === 0) return new Set();

    const records = await this.readAll();
    return new Set(
      records
        .filter((record) => record.tenantId === tenantId)
        .filter((record) => refs.has(record.payloadId))
        .filter((record) => record.status === 'active')
        .map((record) => record.payloadId),
    );
  }

  async deleteBySubject(tenantId: string, subjectId: string): Promise<number> {
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
        status: 'deleted' as const,
        deletedAt: now,
        updatedAt: now,
      };
    });

    await this.writeAll(next);
    return deleted;
  }

  private async readAll(): Promise<PrivacyPayloadRecord[]> {
    try {
      return JSON.parse(await readFile(storePath, 'utf8')) as PrivacyPayloadRecord[];
    } catch {
      return [];
    }
  }

  private async writeAll(records: PrivacyPayloadRecord[]): Promise<void> {
    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  }
}
