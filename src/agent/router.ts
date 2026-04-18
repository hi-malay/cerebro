import { parseToolCall } from "../tools/registry";
import { AgentState } from "./state";

const MAX_ITERATIONS = 5;

export function routeAgent(state: typeof AgentState.State): "use_tools" | "done" {
  if (!state.messages.length) return "done";

  const last = state.messages[state.messages.length - 1];
  const content = typeof last.content === "string" ? last.content : "";
  const hasToolCall = parseToolCall(content) !== null;
  const underLimit = (state.iterations ?? 0) < MAX_ITERATIONS;

  return hasToolCall && underLimit ? "use_tools" : "done";
}
