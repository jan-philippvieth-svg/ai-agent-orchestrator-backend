import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export class BenchmarkHistoryService {
    historyPath = join(process.cwd(), 'data', 'benchmark-history.json');
    async list() {
        try {
            return JSON.parse(await readFile(this.historyPath, 'utf8'));
        }
        catch {
            return [];
        }
    }
    async latest() {
        const history = await this.list();
        return history.at(-1);
    }
}
