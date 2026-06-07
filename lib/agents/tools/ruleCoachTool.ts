import { diagnoseInput } from "@/lib/mockCoach";
import type { InputDiagnosis } from "@/lib/agents/state";

export const ruleCoachTool = {
  diagnose(text: string): InputDiagnosis {
    return diagnoseInput(text);
  }
};
