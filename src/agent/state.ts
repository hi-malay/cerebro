import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

export const AgentState = Annotation.Root({
  question: Annotation<string>(),
  context: Annotation<string>(),
  graphContext: Annotation<string>(),
  chatHistory: Annotation<string>(),
  answer: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  iterations: Annotation<number>(),
  toolsUsed: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});
