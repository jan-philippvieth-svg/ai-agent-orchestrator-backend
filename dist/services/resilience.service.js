import { config } from '../config.js';
export class CircuitOpenError extends Error {
    circuitKey;
    constructor(circuitKey) {
        super(`Circuit ${circuitKey} is open`);
        this.circuitKey = circuitKey;
    }
}
export class ResilienceService {
    static instance;
    circuits = new Map();
    static getInstance() {
        ResilienceService.instance ??= new ResilienceService();
        return ResilienceService.instance;
    }
    async run(key, operation, options = {}) {
        const retries = options.retries ?? config.resilience.retryAttempts;
        const timeoutMs = options.timeoutMs ?? config.resilience.requestTimeoutMs;
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            this.assertCircuitAllowsRequest(key);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const result = await operation(controller.signal);
                clearTimeout(timeout);
                this.recordSuccess(key);
                return result;
            }
            catch (error) {
                clearTimeout(timeout);
                lastError = error;
                if (attempt < retries) {
                    await this.delay(config.resilience.retryDelayMs);
                    continue;
                }
            }
        }
        this.recordFailure(key, lastError);
        throw lastError instanceof Error ? lastError : new Error(`External operation ${key} failed`);
    }
    snapshot() {
        return [...this.circuits.values()].map((record) => ({
            key: record.key,
            state: this.state(record),
            failures: record.failures,
            openedUntil: record.openedUntil ? new Date(record.openedUntil).toISOString() : undefined,
            lastError: record.lastError,
            lastFailureAt: record.lastFailureAt,
            lastSuccessAt: record.lastSuccessAt,
        }));
    }
    assertCircuitAllowsRequest(key) {
        const record = this.circuits.get(key);
        if (!record?.openedUntil)
            return;
        if (Date.now() >= record.openedUntil)
            return;
        throw new CircuitOpenError(key);
    }
    recordSuccess(key) {
        this.circuits.set(key, {
            key,
            failures: 0,
            lastSuccessAt: new Date().toISOString(),
        });
    }
    recordFailure(key, error) {
        const previous = this.circuits.get(key);
        const failures = (previous?.failures ?? 0) + 1;
        const shouldOpen = failures >= config.resilience.circuitFailureThreshold;
        this.circuits.set(key, {
            key,
            failures,
            openedUntil: shouldOpen ? Date.now() + config.resilience.circuitCooldownMs : previous?.openedUntil,
            lastError: error instanceof Error ? error.message : String(error),
            lastFailureAt: new Date().toISOString(),
            lastSuccessAt: previous?.lastSuccessAt,
        });
    }
    state(record) {
        if (!record.openedUntil)
            return 'closed';
        return Date.now() >= record.openedUntil ? 'half_open' : 'open';
    }
    async delay(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
