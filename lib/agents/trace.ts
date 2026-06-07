import type { AgentProvider, AgentStep, TraceEvent, TraceStatus } from "@/lib/agents/state";

type TraceOptions = {
  provider?: AgentProvider;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
};

export function createTraceEvent(
  step: AgentStep,
  status: TraceStatus,
  startedAt: Date,
  options: TraceOptions = {}
): TraceEvent {
  return {
    id: crypto.randomUUID(),
    step,
    status,
    startedAt: startedAt.toISOString(),
    durationMs: Math.max(0, Date.now() - startedAt.getTime()),
    ...options
  };
}

export async function traceStep<T>(
  step: AgentStep,
  events: TraceEvent[],
  action: () => Promise<{ value: T; status?: TraceStatus; provider?: AgentProvider; outputSummary?: string }>,
  inputSummary?: string
) {
  const startedAt = new Date();
  try {
    const result = await action();
    events.push(
      createTraceEvent(step, result.status ?? "success", startedAt, {
        provider: result.provider,
        inputSummary,
        outputSummary: result.outputSummary
      })
    );
    return result.value;
  } catch (error) {
    events.push(
      createTraceEvent(step, "error", startedAt, {
        inputSummary,
        errorMessage: summarizeError(error)
      })
    );
    throw error;
  }
}

export function pushTrace(
  events: TraceEvent[],
  step: AgentStep,
  status: TraceStatus,
  startedAt: Date,
  options: TraceOptions = {}
) {
  events.push(createTraceEvent(step, status, startedAt, options));
}

export function summarizeText(value: string, maxLength = 120) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

export function summarizeError(error: unknown) {
  if (error instanceof Error) return summarizeText(error.message, 160);
  return "Unknown error";
}
