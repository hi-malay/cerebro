import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { retrieve, graphRetrieve, agentReason, executeTools } from "./nodes";
import { routeAgent } from "./router";

const graph = new StateGraph(AgentState)
  .addNode("retrieve", retrieve)
  .addNode("graphRetrieve", graphRetrieve)
  .addNode("agentReason", agentReason)
  .addNode("executeTools", executeTools)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "graphRetrieve")
  .addEdge("graphRetrieve", "agentReason")
  .addConditionalEdges("agentReason", routeAgent, {
    use_tools: "executeTools",
    done: END,
  })
  .addEdge("executeTools", "agentReason");

export const appGraph = graph.compile();
