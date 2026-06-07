import { callTextModelWithProvider } from "@/lib/textModel";
import type { ChatMessage, TextModelOptions, TextModelProvider } from "@/lib/textModel";

export type TextToolResult =
  | {
      content: string;
      provider: TextModelProvider;
    }
  | {
      content: null;
      provider?: undefined;
    };

export async function generateText(messages: ChatMessage[], options: TextModelOptions = {}): Promise<TextToolResult> {
  const result = await callTextModelWithProvider(messages, options);
  if (!result) return { content: null };
  return { content: result.content, provider: result.provider };
}
