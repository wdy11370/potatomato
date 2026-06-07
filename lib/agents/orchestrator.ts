import { generateDialogueReply } from "@/lib/agents/dialogueAgent";
import { generateFeedback } from "@/lib/agents/feedbackAgent";
import { generateReport } from "@/lib/agents/reportAgent";
import { assessPronunciation } from "@/lib/agents/tools/pronunciationTool";
import { ruleCoachTool } from "@/lib/agents/tools/ruleCoachTool";
import { pushTrace, summarizeText, traceStep } from "@/lib/agents/trace";
import type {
  AgentMetrics,
  AgentMode,
  AgentReportInput,
  AgentReportResult,
  AgentState,
  AgentTurnInput,
  AgentTurnResult,
  InputDiagnosis,
  TraceEvent
} from "@/lib/agents/state";
import type { Turn } from "@/lib/mockCoach";

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const trace: TraceEvent[] = [];
  const sessionId = input.sessionId || crypto.randomUUID();
  const latestText = input.text.trim();

  if (!latestText) {
    pushTrace(trace, "input.validation", "error", new Date(), {
      inputSummary: "empty user text",
      errorMessage: "User text is required."
    });
    throw new Error("User text is required.");
  }
  const conversationTurns = ensureLatestUserTurn(input.turns, latestText);

  pushTrace(trace, "input.validation", "success", new Date(), {
    inputSummary: summarizeText(latestText),
    outputSummary: "User text accepted."
  });

  const state = await traceStep(
    "state.create",
    trace,
    async () => {
      const value: AgentState = {
        sessionId,
        scenarioId: input.scenarioId,
        mode: resolveAgentMode(),
        turns: conversationTurns,
        latestUserText: latestText,
        metrics: calculateMetrics(conversationTurns)
      };

      return {
        value,
        status: "success" as const,
        outputSummary: `${value.mode} mode`
      };
    },
    sessionId
  );

  const diagnosis = await traceStep(
    "input.diagnosis",
    trace,
    async () => {
      const value = ruleCoachTool.diagnose(latestText);
      return {
        value,
        status: value.valid ? ("success" as const) : ("fallback" as const),
        provider: "rules" as const,
        outputSummary: value.valid ? "Valid input." : summarizeText(value.reason)
      };
    },
    summarizeText(latestText)
  );

  state.diagnosis = diagnosis;

  const dialogue = await traceStep(
    "dialogue.generate",
    trace,
    async () => {
      const value = await generateDialogueReply({
        scenarioId: input.scenarioId,
        turns: conversationTurns,
        latestText,
        diagnosis
      });

      return {
        value,
        status: value.fallback ? ("fallback" as const) : ("success" as const),
        provider: value.provider,
        outputSummary: summarizeText(value.text)
      };
    },
    summarizeText(latestText)
  );

  const feedbackResult = await traceStep(
    "feedback.generate",
    trace,
    async () => {
      const value = await generateFeedback(latestText);
      return {
        value,
        status: value.fallback ? ("fallback" as const) : ("success" as const),
        provider: value.provider,
        outputSummary: summarizeText(value.feedback.issue)
      };
    },
    summarizeText(latestText)
  );

  const pronunciation = await traceStep(
    "pronunciation.assess",
    trace,
    async () => {
      const value = await assessPronunciation({ text: latestText, audio: input.audio });
      return {
        value,
        status: pronunciationTraceStatus(value.mode),
        provider:
          value.mode === "azure" || value.mode === "azure-error"
            ? ("azure" as const)
            : value.mode === "iflytek" || value.mode === "iflytek-error"
              ? ("iflytek" as const)
              : undefined,
        outputSummary: summarizeText(value.note)
      };
    },
    input.audio ? `${summarizeText(latestText)} with audio` : `${summarizeText(latestText)} without audio`
  );

  const aiTurn: Turn = {
    id: crypto.randomUUID(),
    speaker: "ai",
    text: dialogue.text,
    createdAt: new Date().toISOString()
  };

  state.feedback = feedbackResult.feedback;
  state.pronunciation = pronunciation;
  state.turns = [...conversationTurns, aiTurn];
  state.metrics = calculateMetrics(state.turns);

  pushTrace(trace, "state.update", "success", new Date(), {
    outputSummary: `${state.metrics.validUserTurns} valid user turns, ${state.metrics.invalidUserTurns} invalid user turns`
  });
  pushTrace(trace, "response.compose", "success", new Date(), {
    outputSummary: summarizeText(aiTurn.text)
  });

  return {
    sessionId,
    aiTurn,
    updatedTurns: state.turns,
    feedback: feedbackResult.feedback,
    pronunciation,
    stateSummary: state.metrics,
    trace: input.includeTrace ? trace : undefined
  };
}

function ensureLatestUserTurn(turns: Turn[], latestText: string): Turn[] {
  const lastTurn = turns.at(-1);
  if (lastTurn?.speaker === "user" && lastTurn.text.trim() === latestText) return turns;

  return [
    ...turns,
    {
      id: crypto.randomUUID(),
      speaker: "user",
      text: latestText,
      createdAt: new Date().toISOString()
    }
  ];
}

export async function runAgentReport(input: AgentReportInput): Promise<AgentReportResult> {
  const trace: TraceEvent[] = [];
  const report = await traceStep(
    "report.generate",
    trace,
    async () => {
      const value = await generateReport(input.turns);
      return {
        value: value.report,
        status: value.fallback ? ("fallback" as const) : ("success" as const),
        provider: value.provider,
        outputSummary: `Overall score: ${value.report.overall}`
      };
    },
    `${input.turns.length} turns`
  );

  return {
    report,
    trace: input.includeTrace ? trace : undefined
  };
}

function resolveAgentMode(): AgentMode {
  const useLlm =
    process.env.USE_LLM_CHAT === "true" ||
    process.env.USE_LLM_FEEDBACK === "true" ||
    process.env.USE_LLM_REPORT === "true";

  if (useLlm && (process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL)) return "llm";
  return "demo";
}

function calculateMetrics(turns: Turn[]): AgentMetrics {
  const userTurns = turns.filter((turn) => turn.speaker === "user");
  const diagnoses = userTurns.map((turn) => ruleCoachTool.diagnose(turn.text));
  const validUserTurns = diagnoses.filter((diagnosis) => diagnosis.valid).length;
  const invalidUserTurns = diagnoses.length - validUserTurns;
  const totalWords = userTurns.reduce((sum, turn) => sum + getWords(turn.text).length, 0);
  const averageWordsPerUserTurn = userTurns.length ? Math.round((totalWords / userTurns.length) * 10) / 10 : 0;

  return {
    validUserTurns,
    invalidUserTurns,
    averageWordsPerUserTurn,
    repeatedIssues: getRepeatedIssues(diagnoses)
  };
}

function getRepeatedIssues(diagnoses: InputDiagnosis[]) {
  const counts = new Map<string, number>();
  for (const diagnosis of diagnoses) {
    if (diagnosis.valid) continue;
    counts.set(diagnosis.reason, (counts.get(diagnosis.reason) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1).map(([reason]) => reason);
}

function getWords(text: string) {
  return text.match(/[a-zA-Z]+(?:'[a-zA-Z]+)?|\d+%?/g) ?? [];
}

function pronunciationTraceStatus(mode: string) {
  if (mode === "azure-error" || mode === "iflytek-error" || mode === "mock" || mode === "configured" || mode === "skipped") return "fallback" as const;
  return "success" as const;
}
