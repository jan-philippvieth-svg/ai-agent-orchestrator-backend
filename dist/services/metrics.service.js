export class MetricsService {
    static instance;
    http = new Map();
    chat = new Map();
    guard = new Map();
    cache = { hits: 0, misses: 0, writes: 0 };
    tools = new Map();
    guardEvents = [];
    startedAt = Date.now();
    static getInstance() {
        MetricsService.instance ??= new MetricsService();
        return MetricsService.instance;
    }
    recordHttpRequest(method, route, statusCode, latencyMs) {
        const key = `${method}|${route}|${statusCode}`;
        const metric = this.http.get(key) ?? { count: 0, totalLatencyMs: 0 };
        metric.count += 1;
        metric.totalLatencyMs += latencyMs;
        this.http.set(key, metric);
    }
    recordChat(event) {
        const key = `${event.classification}|${event.selectedModel}|${event.retrievalUsed}`;
        const metric = this.chat.get(key) ?? {
            count: 0,
            totalProcessingTimeMs: 0,
            totalTokensEstimated: 0,
            totalBaselineTokens: 0,
            totalSavedTokens: 0,
            totalChunksUsed: 0,
            totalActualLlmWorkUnits: 0,
            totalBaselineLlmWorkUnits: 0,
            totalSavedLlmWorkUnits: 0,
            totalAttemptedModels: 0,
            fallbackCount: 0,
        };
        metric.count += 1;
        metric.totalProcessingTimeMs += event.processingTimeMs;
        metric.totalTokensEstimated += event.actualTokens;
        metric.totalBaselineTokens += event.baselineTokens;
        metric.totalSavedTokens += event.savedTokens;
        metric.totalChunksUsed += event.chunksUsed;
        metric.totalActualLlmWorkUnits += event.actualLlmWorkUnits;
        metric.totalBaselineLlmWorkUnits += event.baselineLlmWorkUnits;
        metric.totalSavedLlmWorkUnits += event.savedLlmWorkUnits;
        metric.totalAttemptedModels += event.attemptedModels;
        if (event.fallbackUsed)
            metric.fallbackCount += 1;
        this.chat.set(key, metric);
    }
    recordGuard(event) {
        const key = `${event.blocked}|${event.reason ?? 'none'}|${event.category ?? 'none'}`;
        const metric = this.guard.get(key) ?? { guarded: 0, rejected: 0 };
        metric.guarded += 1;
        if (event.blocked)
            metric.rejected += 1;
        this.guard.set(key, metric);
        if (event.blocked) {
            this.guardEvents.unshift(event);
            this.guardEvents.splice(50);
        }
    }
    recordCache(event) {
        if (event === 'hit')
            this.cache.hits += 1;
        if (event === 'miss')
            this.cache.misses += 1;
        if (event === 'write')
            this.cache.writes += 1;
    }
    recordTool(event) {
        const key = `${event.name}|${event.status}`;
        const metric = this.tools.get(key) ?? {
            count: 0,
            errors: 0,
            totalLatencyMs: 0,
            totalItemsUsed: 0,
            totalRawTokensEstimated: 0,
            totalInjectedTokens: 0,
            totalSavedTokens: 0,
        };
        metric.count += 1;
        if (event.status === 'error')
            metric.errors += 1;
        metric.totalLatencyMs += event.processingTimeMs;
        metric.totalItemsUsed += event.itemsUsed;
        metric.totalRawTokensEstimated += event.rawTokensEstimated;
        metric.totalInjectedTokens += event.injectedTokens;
        metric.totalSavedTokens += event.savedTokens;
        this.tools.set(key, metric);
    }
    snapshot() {
        const efficiency = this.efficiencySummary();
        return {
            uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
            httpSeries: this.http.size,
            chatSeries: this.chat.size,
            efficiency,
            resilience: this.resilienceSummary(),
            guard: this.guardSummary(),
            cache: this.cacheSummary(),
            tools: this.toolSummary(),
        };
    }
    toolSummary() {
        let calls = 0;
        let errors = 0;
        let itemsUsed = 0;
        let rawTokensEstimated = 0;
        let injectedTokens = 0;
        let savedTokens = 0;
        for (const metric of this.tools.values()) {
            calls += metric.count;
            errors += metric.errors;
            itemsUsed += metric.totalItemsUsed;
            rawTokensEstimated += metric.totalRawTokensEstimated;
            injectedTokens += metric.totalInjectedTokens;
            savedTokens += metric.totalSavedTokens;
        }
        return {
            calls,
            errors,
            itemsUsed,
            errorRate: calls > 0 ? Math.round((errors / calls) * 1000) / 10 : 0,
            rawTokensEstimated,
            injectedTokens,
            savedTokens,
            reductionPercent: rawTokensEstimated > 0 ? Math.round((savedTokens / rawTokensEstimated) * 1000) / 10 : 0,
        };
    }
    cacheSummary() {
        const lookups = this.cache.hits + this.cache.misses;
        return {
            hits: this.cache.hits,
            misses: this.cache.misses,
            writes: this.cache.writes,
            hitRate: lookups > 0 ? Math.round((this.cache.hits / lookups) * 1000) / 10 : 0,
        };
    }
    guardSummary() {
        let promptsGuarded = 0;
        let guardRejections = 0;
        for (const metric of this.guard.values()) {
            promptsGuarded += metric.guarded;
            guardRejections += metric.rejected;
        }
        return {
            promptsGuarded,
            guardRejections,
            guardRejectionRate: promptsGuarded > 0 ? Math.round((guardRejections / promptsGuarded) * 1000) / 10 : 0,
        };
    }
    resilienceSummary() {
        let requests = 0;
        let fallbackCount = 0;
        let attemptedModels = 0;
        for (const metric of this.chat.values()) {
            requests += metric.count;
            fallbackCount += metric.fallbackCount;
            attemptedModels += metric.totalAttemptedModels;
        }
        return {
            fallbackCount,
            fallbackRate: requests > 0 ? Math.round((fallbackCount / requests) * 1000) / 10 : 0,
            avgAttemptsPerRequest: requests > 0 ? Math.round((attemptedModels / requests) * 100) / 100 : 0,
        };
    }
    recentGuardEvents() {
        return [...this.guardEvents];
    }
    efficiencySummary() {
        let requests = 0;
        let actualLlmWorkUnits = 0;
        let baselineLlmWorkUnits = 0;
        let savedLlmWorkUnits = 0;
        let tokensEstimated = 0;
        let baselineTokens = 0;
        let savedTokens = 0;
        let chunksUsed = 0;
        for (const metric of this.chat.values()) {
            requests += metric.count;
            actualLlmWorkUnits += metric.totalActualLlmWorkUnits;
            baselineLlmWorkUnits += metric.totalBaselineLlmWorkUnits;
            savedLlmWorkUnits += metric.totalSavedLlmWorkUnits;
            tokensEstimated += metric.totalTokensEstimated;
            baselineTokens += metric.totalBaselineTokens;
            savedTokens += metric.totalSavedTokens;
            chunksUsed += metric.totalChunksUsed;
        }
        return {
            requests,
            actualLlmWorkUnits: Math.round(actualLlmWorkUnits),
            baselineLlmWorkUnits: Math.round(baselineLlmWorkUnits),
            savedLlmWorkUnits: Math.round(savedLlmWorkUnits),
            estimatedLlmWorkSavedPercent: baselineLlmWorkUnits > 0 ? Math.round((savedLlmWorkUnits / baselineLlmWorkUnits) * 1000) / 10 : 0,
            tokensEstimated,
            baselineTokens,
            savedTokens,
            tokensSavedPercent: baselineTokens > 0 ? Math.round((savedTokens / baselineTokens) * 1000) / 10 : 0,
            chunksUsed,
        };
    }
    renderPrometheus() {
        const lines = [
            '# HELP ai_agent_orchestrator_uptime_seconds Process uptime in seconds.',
            '# TYPE ai_agent_orchestrator_uptime_seconds gauge',
            `ai_agent_orchestrator_uptime_seconds ${Math.round((Date.now() - this.startedAt) / 1000)}`,
            '# HELP ai_agent_orchestrator_http_requests_total Total HTTP requests.',
            '# TYPE ai_agent_orchestrator_http_requests_total counter',
        ];
        for (const [key, metric] of this.http.entries()) {
            const [method, route, statusCode] = key.split('|');
            lines.push(`ai_agent_orchestrator_http_requests_total{method="${method}",route="${route}",status="${statusCode}"} ${metric.count}`);
        }
        lines.push('# HELP ai_agent_orchestrator_http_request_latency_ms_total Total HTTP request latency in milliseconds.');
        lines.push('# TYPE ai_agent_orchestrator_http_request_latency_ms_total counter');
        for (const [key, metric] of this.http.entries()) {
            const [method, route, statusCode] = key.split('|');
            lines.push(`ai_agent_orchestrator_http_request_latency_ms_total{method="${method}",route="${route}",status="${statusCode}"} ${Math.round(metric.totalLatencyMs)}`);
        }
        lines.push('# HELP ai_agent_orchestrator_chat_requests_total Total chat requests.');
        lines.push('# TYPE ai_agent_orchestrator_chat_requests_total counter');
        for (const [key, metric] of this.chat.entries()) {
            const [classification, selectedModel, retrievalUsed] = key.split('|');
            lines.push(`ai_agent_orchestrator_chat_requests_total{classification="${classification}",selected_model="${selectedModel}",retrieval_used="${retrievalUsed}"} ${metric.count}`);
        }
        lines.push('# HELP ai_agent_orchestrator_llm_requests_total Total LLM requests routed by model and classification.');
        lines.push('# TYPE ai_agent_orchestrator_llm_requests_total counter');
        for (const [key, metric] of this.chat.entries()) {
            const [classification, selectedModel] = key.split('|');
            lines.push(`ai_agent_orchestrator_llm_requests_total{model="${selectedModel}",classification="${classification}"} ${metric.count}`);
        }
        lines.push('# HELP ai_agent_orchestrator_chat_tokens_estimated_total Estimated chat tokens.');
        lines.push('# TYPE ai_agent_orchestrator_chat_tokens_estimated_total counter');
        for (const [key, metric] of this.chat.entries()) {
            const [classification, selectedModel, retrievalUsed] = key.split('|');
            lines.push(`ai_agent_orchestrator_chat_tokens_estimated_total{classification="${classification}",selected_model="${selectedModel}",retrieval_used="${retrievalUsed}"} ${metric.totalTokensEstimated}`);
        }
        lines.push('# HELP ai_agent_orchestrator_chat_baseline_tokens_total Estimated baseline tokens if broad context was sent.');
        lines.push('# TYPE ai_agent_orchestrator_chat_baseline_tokens_total counter');
        for (const [key, metric] of this.chat.entries()) {
            const [classification, selectedModel, retrievalUsed] = key.split('|');
            lines.push(`ai_agent_orchestrator_chat_baseline_tokens_total{classification="${classification}",selected_model="${selectedModel}",retrieval_used="${retrievalUsed}"} ${metric.totalBaselineTokens}`);
        }
        lines.push('# HELP ai_agent_orchestrator_chat_saved_tokens_total Estimated tokens saved by routing and context reduction.');
        lines.push('# TYPE ai_agent_orchestrator_chat_saved_tokens_total counter');
        for (const [key, metric] of this.chat.entries()) {
            const [classification, selectedModel, retrievalUsed] = key.split('|');
            lines.push(`ai_agent_orchestrator_chat_saved_tokens_total{classification="${classification}",selected_model="${selectedModel}",retrieval_used="${retrievalUsed}"} ${metric.totalSavedTokens}`);
        }
        lines.push('# HELP ai_agent_orchestrator_chat_chunks_used_total Retrieved chunks used by chat.');
        lines.push('# TYPE ai_agent_orchestrator_chat_chunks_used_total counter');
        for (const [key, metric] of this.chat.entries()) {
            const [classification, selectedModel, retrievalUsed] = key.split('|');
            lines.push(`ai_agent_orchestrator_chat_chunks_used_total{classification="${classification}",selected_model="${selectedModel}",retrieval_used="${retrievalUsed}"} ${metric.totalChunksUsed}`);
        }
        const efficiency = this.efficiencySummary();
        lines.push('# HELP ai_agent_orchestrator_llm_work_actual_units_total Estimated actual LLM work units.');
        lines.push('# TYPE ai_agent_orchestrator_llm_work_actual_units_total counter');
        lines.push(`ai_agent_orchestrator_llm_work_actual_units_total ${efficiency.actualLlmWorkUnits}`);
        lines.push('# HELP ai_agent_orchestrator_llm_work_baseline_units_total Estimated baseline LLM work units if every request used the large model.');
        lines.push('# TYPE ai_agent_orchestrator_llm_work_baseline_units_total counter');
        lines.push(`ai_agent_orchestrator_llm_work_baseline_units_total ${efficiency.baselineLlmWorkUnits}`);
        lines.push('# HELP ai_agent_orchestrator_llm_work_saved_units_total Estimated saved LLM work units.');
        lines.push('# TYPE ai_agent_orchestrator_llm_work_saved_units_total counter');
        lines.push(`ai_agent_orchestrator_llm_work_saved_units_total ${efficiency.savedLlmWorkUnits}`);
        lines.push('# HELP ai_agent_orchestrator_llm_work_saved_percent Estimated LLM work saved percent.');
        lines.push('# TYPE ai_agent_orchestrator_llm_work_saved_percent gauge');
        lines.push(`ai_agent_orchestrator_llm_work_saved_percent ${efficiency.estimatedLlmWorkSavedPercent}`);
        lines.push('# HELP ai_agent_orchestrator_tokens_saved_percent Estimated token savings percent.');
        lines.push('# TYPE ai_agent_orchestrator_tokens_saved_percent gauge');
        lines.push(`ai_agent_orchestrator_tokens_saved_percent ${efficiency.tokensSavedPercent}`);
        const guard = this.guardSummary();
        lines.push('# HELP ai_agent_orchestrator_prompts_guarded_total Total prompts evaluated by prompt guard.');
        lines.push('# TYPE ai_agent_orchestrator_prompts_guarded_total counter');
        lines.push(`ai_agent_orchestrator_prompts_guarded_total ${guard.promptsGuarded}`);
        lines.push('# HELP ai_agent_orchestrator_guard_rejections_total Total prompts rejected by prompt guard.');
        lines.push('# TYPE ai_agent_orchestrator_guard_rejections_total counter');
        for (const [key, metric] of this.guard.entries()) {
            const [blocked, reason, category] = key.split('|');
            if (blocked !== 'true')
                continue;
            lines.push(`ai_agent_orchestrator_guard_rejections_total{reason="${reason}",category="${category}"} ${metric.rejected}`);
        }
        const resilience = this.resilienceSummary();
        lines.push('# HELP ai_agent_orchestrator_llm_fallback_rate_percent Percent of chat requests that used LLM fallback.');
        lines.push('# TYPE ai_agent_orchestrator_llm_fallback_rate_percent gauge');
        lines.push(`ai_agent_orchestrator_llm_fallback_rate_percent ${resilience.fallbackRate}`);
        lines.push('# HELP ai_agent_orchestrator_llm_avg_attempts_per_request Average LLM attempts per chat request.');
        lines.push('# TYPE ai_agent_orchestrator_llm_avg_attempts_per_request gauge');
        lines.push(`ai_agent_orchestrator_llm_avg_attempts_per_request ${resilience.avgAttemptsPerRequest}`);
        const cache = this.cacheSummary();
        lines.push('# HELP ai_agent_orchestrator_chat_cache_hits_total Total simple chat cache hits.');
        lines.push('# TYPE ai_agent_orchestrator_chat_cache_hits_total counter');
        lines.push(`ai_agent_orchestrator_chat_cache_hits_total ${cache.hits}`);
        lines.push('# HELP ai_agent_orchestrator_chat_cache_misses_total Total simple chat cache misses.');
        lines.push('# TYPE ai_agent_orchestrator_chat_cache_misses_total counter');
        lines.push(`ai_agent_orchestrator_chat_cache_misses_total ${cache.misses}`);
        lines.push('# HELP ai_agent_orchestrator_chat_cache_writes_total Total simple chat cache writes.');
        lines.push('# TYPE ai_agent_orchestrator_chat_cache_writes_total counter');
        lines.push(`ai_agent_orchestrator_chat_cache_writes_total ${cache.writes}`);
        lines.push('# HELP ai_agent_orchestrator_chat_cache_hit_rate_percent Simple chat cache hit rate.');
        lines.push('# TYPE ai_agent_orchestrator_chat_cache_hit_rate_percent gauge');
        lines.push(`ai_agent_orchestrator_chat_cache_hit_rate_percent ${cache.hitRate}`);
        lines.push('# HELP ai_agent_orchestrator_tool_calls_total Total internal tool calls.');
        lines.push('# TYPE ai_agent_orchestrator_tool_calls_total counter');
        for (const [key, metric] of this.tools.entries()) {
            const [name, status] = key.split('|');
            lines.push(`ai_agent_orchestrator_tool_calls_total{name="${name}",status="${status}"} ${metric.count}`);
        }
        lines.push('# HELP ai_agent_orchestrator_tool_latency_ms_total Total internal tool latency in milliseconds.');
        lines.push('# TYPE ai_agent_orchestrator_tool_latency_ms_total counter');
        for (const [key, metric] of this.tools.entries()) {
            const [name, status] = key.split('|');
            lines.push(`ai_agent_orchestrator_tool_latency_ms_total{name="${name}",status="${status}"} ${Math.round(metric.totalLatencyMs)}`);
        }
        lines.push('# HELP ai_agent_orchestrator_tool_items_used_total Total items returned by internal tools.');
        lines.push('# TYPE ai_agent_orchestrator_tool_items_used_total counter');
        for (const [key, metric] of this.tools.entries()) {
            const [name, status] = key.split('|');
            lines.push(`ai_agent_orchestrator_tool_items_used_total{name="${name}",status="${status}"} ${metric.totalItemsUsed}`);
        }
        lines.push('# HELP ai_agent_orchestrator_tool_raw_tokens_estimated_total Estimated raw tokens before tool output reduction.');
        lines.push('# TYPE ai_agent_orchestrator_tool_raw_tokens_estimated_total counter');
        for (const [key, metric] of this.tools.entries()) {
            const [name, status] = key.split('|');
            lines.push(`ai_agent_orchestrator_tool_raw_tokens_estimated_total{name="${name}",status="${status}"} ${metric.totalRawTokensEstimated}`);
        }
        lines.push('# HELP ai_agent_orchestrator_tool_injected_tokens_total Estimated tokens injected from reduced tool output.');
        lines.push('# TYPE ai_agent_orchestrator_tool_injected_tokens_total counter');
        for (const [key, metric] of this.tools.entries()) {
            const [name, status] = key.split('|');
            lines.push(`ai_agent_orchestrator_tool_injected_tokens_total{name="${name}",status="${status}"} ${metric.totalInjectedTokens}`);
        }
        lines.push('# HELP ai_agent_orchestrator_tool_saved_tokens_total Estimated tokens saved by reducing tool output.');
        lines.push('# TYPE ai_agent_orchestrator_tool_saved_tokens_total counter');
        for (const [key, metric] of this.tools.entries()) {
            const [name, status] = key.split('|');
            lines.push(`ai_agent_orchestrator_tool_saved_tokens_total{name="${name}",status="${status}"} ${metric.totalSavedTokens}`);
        }
        return `${lines.join('\n')}\n`;
    }
}
