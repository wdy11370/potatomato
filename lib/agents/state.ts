import type { Feedback, Report, Turn } from "@/lib/mockCoach";
import type { ScenarioId } from "@/lib/scenarios";

export type AgentMode = "demo" | "llm" | "hybrid";

export type AgentProvider = "rules" | "deepseek" | "openai" | "ollama" | "azure" | "iflytek";

export type AgentStep =
  | "input.validation"
  | "state.create"
  | "input.diagnosis"
  | "dialogue.generate"
  | "feedback.generate"
  | "pronunciation.assess"
  | "state.update"
  | "report.generate"
  | "response.compose";

export type TraceStatus = "success" | "fallback" | "skipped" | "error";

export type TraceEvent = {
  id: string;
  step: AgentStep;
  status: TraceStatus;
  startedAt: string;
  durationMs: number;
  provider?: AgentProvider;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
};

export type InputDiagnosis = {
  valid: boolean;
  severity: "ok" | "weak" | "invalid";
  reason: string;
  coachingReply: string;
};

export type AgentMetrics = {
  validUserTurns: number;
  invalidUserTurns: number;
  averageWordsPerUserTurn: number;
  repeatedIssues: string[];
};

export type PronunciationSummary = {
  mode: "mock" | "configured" | "azure" | "azure-error" | "iflytek" | "iflytek-error" | "skipped";
  pronScore?: number | null;
  accuracyScore?: number | null;
  fluencyScore?: number | null;
  completenessScore?: number | null;
  prosodyScore?: number | null;
  note: string;
  words?: unknown[];
  transcode?: {
    inputType: string;
    inputSizeKb: number;
    output: string;
  };
};

export type AgentState = {
  sessionId: string;
  scenarioId: ScenarioId;
  mode: AgentMode;
  turns: Turn[];
  latestUserText: string;
  diagnosis?: InputDiagnosis;
  feedback?: Feedback;
  pronunciation?: PronunciationSummary;
  metrics: AgentMetrics;
};

export type AgentTurnInput = {
  sessionId?: string;
  scenarioId: ScenarioId;
  turns: Turn[];
  text: string;
  includeTrace?: boolean;
  audio?: File;
};

export type AgentTurnResult = {
  sessionId: string;
  aiTurn: Turn;
  updatedTurns: Turn[];
  feedback: Feedback;
  pronunciation?: PronunciationSummary;
  stateSummary: AgentMetrics;
  trace?: TraceEvent[];
};

export type AgentReportInput = {
  sessionId?: string;
  scenarioId: ScenarioId;
  turns: Turn[];
  includeTrace?: boolean;
};

export type AgentReportResult = {
  report: Report;
  trace?: TraceEvent[];
};
