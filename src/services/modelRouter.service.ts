import type { Classification, ModelSize, PreferredModel } from '../types/index.js';

interface ModelRoutingOptions {
  allowLargeModelOverride: boolean;
}

export class ModelRouterService {
  selectModel(classification: Classification, preferredModel: PreferredModel, options?: ModelRoutingOptions): ModelSize {
    const automaticModel = this.modelForClassification(classification);

    if (preferredModel === 'large' && !options?.allowLargeModelOverride) {
      return automaticModel;
    }

    if (preferredModel !== 'auto') return preferredModel;
    return automaticModel;
  }

  private modelForClassification(classification: Classification): ModelSize {
    const map: Record<Classification, ModelSize> = {
      simple: 'small',
      medium: 'medium',
      complex: 'large',
    };

    return map[classification];
  }
}
