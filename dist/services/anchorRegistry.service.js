import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
export class AnchorRegistryService {
    cache;
    async listApproved() {
        const anchors = await this.readAnchors();
        return anchors.filter((anchor) => anchor.status === 'approved');
    }
    async readAnchors() {
        if (this.cache)
            return this.cache;
        try {
            const raw = await readFile(config.anchors.registryPath, 'utf8');
            const parsed = JSON.parse(raw);
            this.cache = Array.isArray(parsed.anchors) ? parsed.anchors : [];
            return this.cache;
        }
        catch {
            this.cache = [];
            return this.cache;
        }
    }
}
