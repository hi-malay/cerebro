import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "../llm/client";
import { ragState } from "../qdrant/client";
import * as neo4jClient from "../neo4j/client";
import { searchGraphContext } from "../neo4j/repository";
import { TOOL_MAP, TOOL_DESCRIPTIONS, parseToolCall } from "../tools/registry";
import { AgentState } from "./state";

export async function retrieve(state: typeof AgentState.State) {
  if (!ragState.enabled || !ragState.retriever) {
    return { context: "" };
  }
  const docs = await ragState.retriever.similaritySearch(state.question, 4);
  return { context: docs.map((d) => d.pageContent).join("\n\n") };
}

export async function graphRetrieve(state: typeof AgentState.State) {
  const session = neo4jClient.getSession();
  if (!neo4jClient.isConnected() || !session) {
    return { graphContext: "" };
  }
  try {
    return { graphContext: await searchGraphContext(session, state.question) };
  } catch {
    return { graphContext: "" };
  }
}

export async function agentReason(state: typeof AgentState.State) {
  const iterations = state.iterations ?? 0;

  if (!state.messages.length) {
    const systemParts = [
      "You are a helpful AI assistant. Keep answers under 150 words.",
      "",
      TOOL_DESCRIPTIONS,
    ];
    if (state.context?.trim()) {
      systemParts.push(`\nPDF Context:\n${state.context}`);
    }
    if (state.graphContext?.trim()) {
      systemParts.push(`\nKnowledge Graph Context:\n${state.graphContext}`);
    }
    if (state.chatHistory?.trim()) {
      systemParts.push(`\nChat History:\n${state.chatHistory}`);
    }

    const initialMessages = [
      new SystemMessage(systemParts.join("\n")),
      new HumanMessage(state.question),
    ];
    const response = await llm.invoke(initialMessages);

    return {
      messages: [...initialMessages, response],
      iterations: iterations + 1,
      answer: (response.content as string) || "",
    };
  } else {
    const response = await llm.invoke(state.messages);
    return {
      messages: [response],
      iterations: iterations + 1,
      answer: (response.content as string) || "",
    };
  }
}

export async function executeTools(state: typeof AgentState.State) {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg.content === "string" ? lastMsg.content : "";
  const toolCall = parseToolCall(content);

  if (!toolCall) {
    return { messages: [], toolsUsed: [] };
  }

  const func = TOOL_MAP[toolCall.tool];
  let resultText: string;
  if (!func) {
    resultText = `Unknown tool: ${toolCall.tool}`;
  } else {
    const argValue = Object.values(toolCall.args)[0] || "";
    resultText = await Promise.resolve(func(argValue));
  }

  const resultMsg = new HumanMessage(
    `Tool result from ${toolCall.tool}:\n${resultText}\n\nNow answer the original question using this information.`,
  );

  return {
    messages: [resultMsg],
    toolsUsed: [toolCall.tool],
  };
}
