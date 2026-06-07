import { z } from "zod";
import { reportPrompt } from "@/lib/agents/prompts/report";
import { generateText } from "@/lib/agents/tools/textModelTool";
import { ruleCoachTool } from "@/lib/agents/tools/ruleCoachTool";
import type { AgentProvider } from "@/lib/agents/state";
import type { Report, Turn } from "@/lib/mockCoach";

const scoreSchema = z.number().min(0).max(100);

const reportSchema = z.object({
  overall: scoreSchema,
  pronunciation: scoreSchema,
  fluency: scoreSchema,
  grammar: scoreSchema,
  vocabulary: scoreSchema,
  taskCompletion: scoreSchema,
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  drills: z.array(z.string())
});

type ReportResult = {
  report: Report;
  provider: AgentProvider;
  fallback: boolean;
};

export async function generateReport(turns: Turn[]): Promise<ReportResult> {
  const ruleReport = ruleCoachTool.report(turns);

  if (process.env.USE_LLM_REPORT !== "true") {
    return { report: ruleReport, provider: "rules", fallback: false };
  }

  try {
    const result = await generateText(
      [
        { role: "system", content: reportPrompt },
        { role: "user", content: JSON.stringify(turns) }
      ],
      { json: true, temperature: 0.25 }
    );

    if (!result.content) return { report: ruleReport, provider: "rules", fallback: true };

    const parsed = reportSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) return { report: ruleReport, provider: "rules", fallback: true };

    return {
      report: parsed.data,
      provider: result.provider ?? "rules",
      fallback: false
    };
  } catch {
    return { report: ruleReport, provider: "rules", fallback: true };
  }
}
