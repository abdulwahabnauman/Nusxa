/**
 * Runtime Observability, Telemetry, and Evaluation Engine for Nusxa Chat.
 * Tracks live token usage, latency (TTFT & total elapsed), cache hit ratios,
 * local tool activations, and clinical safety evaluations in real-time.
 * 100% on-device and privacy-preserving.
 */

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  query: string;
  route: 'emergency' | 'cache' | 'local_tool' | 'llm';
  source: 'guardrail' | 'cache' | 'local_database' | 'llm';
  latencyMs: number;
  tokensEstimated: number;
  costEstimatedCents: number;
  guardrailTriggered?: boolean;
  toolName?: string;
  error?: string;
  ragUsed?: boolean;
  ragChunksCount?: number;
  ragDrugs?: string[];
}

export interface TelemetrySummary {
  totalQueries: number;
  cacheHits: number;
  localToolQueries: number;
  llmCalls: number;
  emergenciesIntercepted: number;
  guardrailViolations: number;
  cacheHitRatePercent: number;
  averageLatencyMs: number;
  totalTokensEstimated: number;
  totalCostSavedCents: number;
  ragRetrievals: number;
}

const MAX_RING_BUFFER = 100;
const eventLog: TelemetryEvent[] = [];

let sessionStats = {
  totalQueries: 0,
  cacheHits: 0,
  localToolQueries: 0,
  llmCalls: 0,
  emergenciesIntercepted: 0,
  guardrailViolations: 0,
  totalLatencyMs: 0,
  totalTokens: 0,
  costSavedCents: 0,
  ragRetrievals: 0,
};

/**
 * Estimates token count from text using heuristic character-to-token ratio (~4 chars per token).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.trim().length / 3.8);
}

/**
 * Records a chat interaction event into the runtime observability telemetry store.
 */
export function logChatEvent(event: Omit<TelemetryEvent, 'id' | 'timestamp'>): TelemetryEvent {
  const fullEvent: TelemetryEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  if (eventLog.length >= MAX_RING_BUFFER) {
    eventLog.shift();
  }
  eventLog.push(fullEvent);

  // Update session counters
  sessionStats.totalQueries++;
  if (fullEvent.source === 'cache') {
    sessionStats.cacheHits++;
    sessionStats.costSavedCents += 0.05; // ~$0.0005 saved per cached query
  } else if (fullEvent.source === 'local_database') {
    sessionStats.localToolQueries++;
    sessionStats.costSavedCents += 0.05;
  } else if (fullEvent.source === 'guardrail') {
    sessionStats.emergenciesIntercepted++;
  } else if (fullEvent.source === 'llm') {
    sessionStats.llmCalls++;
    sessionStats.totalLatencyMs += fullEvent.latencyMs;
    sessionStats.totalTokens += fullEvent.tokensEstimated;
  }

  if (fullEvent.guardrailTriggered) {
    sessionStats.guardrailViolations++;
  }

  if (fullEvent.ragUsed) {
    sessionStats.ragRetrievals++;
  }

  return fullEvent;
}

/**
 * Computes an aggregated telemetry summary of chat operations.
 */
export function getChatTelemetrySummary(): TelemetrySummary {
  const avgLatency =
    sessionStats.llmCalls > 0
      ? Math.round(sessionStats.totalLatencyMs / sessionStats.llmCalls)
      : 0;

  const resolvedWithoutNetwork = sessionStats.cacheHits + sessionStats.localToolQueries;
  const hitRate =
    sessionStats.totalQueries > 0
      ? Math.round((resolvedWithoutNetwork / sessionStats.totalQueries) * 100)
      : 0;

  return {
    totalQueries: sessionStats.totalQueries,
    cacheHits: sessionStats.cacheHits,
    localToolQueries: sessionStats.localToolQueries,
    llmCalls: sessionStats.llmCalls,
    emergenciesIntercepted: sessionStats.emergenciesIntercepted,
    guardrailViolations: sessionStats.guardrailViolations,
    cacheHitRatePercent: hitRate,
    averageLatencyMs: avgLatency,
    totalTokensEstimated: sessionStats.totalTokens,
    totalCostSavedCents: Number(sessionStats.costSavedCents.toFixed(2)),
    ragRetrievals: sessionStats.ragRetrievals,
  };
}

/**
 * Returns recent telemetry events (most recent first).
 */
export function getRecentTelemetryEvents(limit = 20): TelemetryEvent[] {
  return [...eventLog].reverse().slice(0, limit);
}

/**
 * Clears runtime telemetry buffer.
 */
export function clearTelemetry(): void {
  eventLog.length = 0;
  sessionStats = {
    totalQueries: 0,
    cacheHits: 0,
    localToolQueries: 0,
    llmCalls: 0,
    emergenciesIntercepted: 0,
    guardrailViolations: 0,
    totalLatencyMs: 0,
    totalTokens: 0,
    costSavedCents: 0,
  };
}
