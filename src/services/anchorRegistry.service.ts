import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import type { SemanticAnchor } from '../types/index.js';

export class AnchorRegistryService {
  private cache?: SemanticAnchor[];

  async listApproved(): Promise<SemanticAnchor[]> {
    const anchors = await this.readAnchors();
    return anchors.filter((anchor) => anchor.status === 'approved');
  }

  private async readAnchors(): Promise<SemanticAnchor[]> {
    if (this.cache) return this.cache;

    try {
      const raw = await readFile(config.anchors.registryPath, 'utf8');
      const parsed = JSON.parse(raw) as { anchors?: SemanticAnchor[] };
      this.cache = Array.isArray(parsed.anchors) ? parsed.anchors : [];
      return this.cache;
    } catch {
      this.cache = [];
      return this.cache;
    }
  }
}
