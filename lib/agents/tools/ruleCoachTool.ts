import { diagnoseInput, mockFeedback, mockReply, mockReport, type Feedback, type Report, type Turn } from "@/lib/mockCoach";
import type { ScenarioId } from "@/lib/scenarios";
import type { InputDiagnosis } from "@/lib/agents/state";

export const ruleCoachTool = {
  diagnose(text: string): InputDiagnosis {
    return diagnoseInput(text);
  },

  reply(scenarioId: ScenarioId, userText: string, turnCount: number) {
    return mockReply(scenarioId, userText, turnCount);
  },

  feedback(text: string): Feedback {
    return mockFeedback(text);
  },

  report(turns: Turn[]): Report {
    return mockReport(turns);
  }
};
