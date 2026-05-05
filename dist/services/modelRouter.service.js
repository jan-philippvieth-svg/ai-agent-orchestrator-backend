export class ModelRouterService {
    selectModel(classification, preferredModel, options) {
        const automaticModel = this.modelForClassification(classification);
        if (preferredModel === 'large' && !options?.allowLargeModelOverride) {
            return automaticModel;
        }
        if (preferredModel !== 'auto')
            return preferredModel;
        return automaticModel;
    }
    modelForClassification(classification) {
        const map = {
            simple: 'small',
            medium: 'medium',
            complex: 'large',
        };
        return map[classification];
    }
}
