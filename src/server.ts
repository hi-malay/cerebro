import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "crypto";
import { ChatGroq } from "@langchain/groq";
import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { Document } from "@langchain/core/documents";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { tavily } from "@tavily/core";
// @ts-ignore — pdf-parse has no types
import pdfParse from "pdf-parse";
import neo4j, { type Driver, type Session } from "neo4j-driver";

const PORT = process.env.PORT || 8000;
const MAX_ITERATIONS = 5;

// --- In-memory state ---
const sessions = new Map<string, string>(); // session_id → chat history
const ragState: {
  enabled: boolean;
  pdfName: string | null;
  retriever: QdrantVectorStore | null;
} = { enabled: false, pdfName: null, retriever: null };

let neo4jConnected = false;
let neo4jSession: Session | null = null;
let neo4jDriver: Driver | null = null;

// --- LLM ---
const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: process.env.GROQ_API_KEY,
});

// --- Neo4j (optional) ---
try {
  if (process.env.NEO_URL && process.env.NEO_USER && process.env.NEO_PASSWORD) {
    neo4jDriver = neo4j.driver(
      process.env.NEO_URL,
      neo4j.auth.basic(process.env.NEO_USER, process.env.NEO_PASSWORD),
    );
    await neo4jDriver.verifyConnectivity();
    neo4jSession = neo4jDriver.session({ database: process.env.NEO_USER });
    neo4jConnected = true;
    console.log("Neo4j connected.");
  }
} catch (e: any) {
  console.log(
    `Neo4j unavailable (${e.message}). Running without knowledge graph.`,
  );
}

// --- Tools (prompt-based, same approach as Python version) ---
// LLM outputs JSON like {"tool": "name", "args": {...}}, we parse and execute

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });

async function runWebSearch(query: string): Promise<string> {
  try {
    const response = await tvly.search(query, { maxResults: 3 });
    if (!response.results.length) return "No results found.";
    return response.results.map((r) => `- ${r.title}: ${r.content}`).join("\n");
  } catch (e: any) {
    return `Search failed: ${e.message}`;
  }
}

function runCalculator(expression: string): string {
  const allowed = new Set("0123456789+-*/.() ".split(""));
  if (![...expression].every((c) => allowed.has(c))) {
    return "Error: only numbers and +-*/.() are allowed.";
  }
  try {
    console.log("expression", expression);
    // Function constructor is safer than eval — no access to outer scope
    const result = new Function(`return (${expression})`)();
    return String(result);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

async function runSearchPdf(query: string): Promise<string> {
  if (!ragState.enabled || !ragState.retriever) {
    return "No PDF is currently loaded.";
  }
  const docs = await ragState.retriever.similaritySearch(query, 4);
  if (!docs.length) return "No relevant sections found for this query.";
  return docs.map((d) => d.pageContent).join("\n\n");
}

const TOOL_MAP: Record<string, (arg: string) => Promise<string> | string> = {
  web_search: runWebSearch,
  calculator: runCalculator,
  search_pdf: runSearchPdf,
};

// Injected into the system prompt — tells the LLM how to request a tool
const TOOL_DESCRIPTIONS = `You have access to these tools. To use one, respond with ONLY a JSON block like this:
\`\`\`json
{"tool": "tool_name", "args": {"arg_name": "value"}}
\`\`\`

Tools:
- web_search(query: str): Search the internet for current information not in the PDF.
- calculator(expression: str): Evaluate math. Examples: "2 + 2", "(52340 * 0.15)", "2 ** 8" don't accept string this will break tool flow
- search_pdf(query: str): Re-search the PDF with a different/more specific query.

Rules:
- ALWAYS use the calculator tool for ANY math, even simple arithmetic. Never compute math yourself.
- ALWAYS use web_search for ANY question about current events, real-time data, or facts you're not 100% certain about.
- ALWAYS use search_pdf when a PDF is loaded and the question could relate to its content.
- When using a tool, respond with ONLY the JSON block. No other text.
- Only answer directly (no JSON) when the question is purely conversational and needs no computation, search, or PDF lookup.
- Never wrap tool calls in XML tags or any other format.`;

// Scan LLM text output for a JSON tool call
function parseToolCall(
  text: string,
): { tool: string; args: Record<string, string> } | null {
  // Try ```json { ... } ``` first
  const codeBlock = text.match(/```(?:json)?\s*(\{.*?\})\s*```/s);

  if (codeBlock) {
    try {
      const parsed = JSON.parse(codeBlock[1]);
      if (parsed.tool) return parsed;
    } catch {}
  }

  // Try raw JSON with "tool" key
  const rawJson = text.match(/\{[^{}]*"tool"\s*:\s*"[^"]+?"[^{}]*\}/);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson[0]);
      if (parsed.tool) return parsed;
    } catch {}
  }

  return null;
}

// --- LangGraph state definition ---
// In LangGraph.js, state is defined with Annotation (not TypedDict)
// reducer: how to merge new values — concat = append mode, default = replace mode
const AgentState = Annotation.Root({
  question: Annotation<string>(),
  context: Annotation<string>(),
  graphContext: Annotation<string>(),
  chatHistory: Annotation<string>(),
  answer: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b), // append mode (like Python's operator.add)
    default: () => [],
  }),
  iterations: Annotation<number>(),
  toolsUsed: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

// --- Graph nodes ---
// Flow: START → retrieve → graphRetrieve → agentReason ←→ executeTools → END

async function retrieve(state: typeof AgentState.State) {
  if (!ragState.enabled || !ragState.retriever) {
    return { context: "" };
  }
  const docs = await ragState.retriever.similaritySearch(state.question, 4);
  return { context: docs.map((d) => d.pageContent).join("\n\n") };
}

async function graphRetrieve(state: typeof AgentState.State) {
  if (!neo4jConnected || !neo4jSession) {
    return { graphContext: "" };
  }
  try {
    // Simple keyword search in Neo4j (simplified vs Python's CypherQAChain)
    const result = await neo4jSession.run(
      "MATCH (n) WHERE toLower(n.id) CONTAINS toLower($query) RETURN n LIMIT 5",
      { query: state.question },
    );
    const records = result.records.map((r) =>
      JSON.stringify(r.get("n").properties),
    );
    return { graphContext: records.join("\n") || "" };
  } catch {
    return { graphContext: "" };
  }
}

async function agentReason(state: typeof AgentState.State) {
  const iterations = state.iterations ?? 0;

  if (!state.messages.length) {
    // First call — build system prompt with context + tool instructions
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

    const initialMessages: BaseMessage[] = [
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
    // Subsequent calls — LLM sees full history including tool results
    const response = await llm.invoke(state.messages);

    return {
      messages: [response], // appended via reducer
      iterations: iterations + 1,
      answer: (response.content as string) || "",
    };
  }
}

async function executeTools(state: typeof AgentState.State) {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg.content === "string" ? lastMsg.content : "";
  const toolCall = parseToolCall(content);

  if (!toolCall) {
    return { messages: [], toolsUsed: [] };
  }
  const toolName = toolCall.tool;
  const func = TOOL_MAP[toolName];

  let resultText: string;
  if (!func) {
    resultText = `Unknown tool: ${toolName}`;
  } else {
    const argValue = Object.values(toolCall.args)[0] || "";
    resultText = await Promise.resolve(func(argValue));
  }

  const resultMsg = new HumanMessage(
    `Tool result from ${toolName}:\n${resultText}\n\nNow answer the original question using this information.`,
  );
  console.log("toolCall :>> ", toolCall, content, lastMsg, resultMsg, func);

  return {
    messages: [resultMsg],
    toolsUsed: [toolName],
  };
}

function routeAgent(state: typeof AgentState.State): "use_tools" | "done" {
  if (!state.messages.length) return "done";

  const last = state.messages[state.messages.length - 1];
  const content = typeof last.content === "string" ? last.content : "";
  const hasToolCall = parseToolCall(content) !== null;
  const underLimit = (state.iterations ?? 0) < MAX_ITERATIONS;
  console.log("underLimit :>> ", underLimit, hasToolCall, content, last);
  return hasToolCall && underLimit ? "use_tools" : "done";
}

// --- Build the LangGraph pipeline ---
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
  .addEdge("executeTools", "agentReason"); // loop back

const appGraph = graph.compile();

// --- Express server ---
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "/tmp/uploads/" });

app.get("/status", (_req, res) => {
  res.json({
    rag_enabled: ragState.enabled,
    pdf_name: ragState.pdfName,
    neo4j_connected: neo4jConnected,
    active_sessions: sessions.size,
    tools: Object.keys(TOOL_MAP),
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { question, session_id } = req.body;
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const sessionId = session_id || crypto.randomUUID();
    const chatHistory = sessions.get(sessionId) || "";

    const result = await appGraph.invoke({
      question,
      context: "",
      graphContext: "",
      chatHistory,
      answer: "",
      messages: [],
      iterations: 0,
      toolsUsed: [],
    });

    const answer = result.answer;
    sessions.set(
      sessionId,
      chatHistory + `Human: ${question}\nAssistant: ${answer}\n`,
    );

    // Collect which tools were used
    const toolsUsed = result.toolsUsed || [];

    res.json({
      answer,
      session_id: sessionId,
      rag_enabled: ragState.enabled,
      tools_used: toolsUsed,
      iterations: result.iterations || 0,
    });
  } catch (e: any) {
    console.error("Chat error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file || !file.originalname.endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF files are accepted." });
    return;
  }

  try {
    // Read and parse PDF
    const buffer = fs.readFileSync(file.path);
    const pdf = await pdfParse(buffer);

    // Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.createDocuments([pdf.text]);
    console.log(`Split into ${docs.length} chunks.`);

    // Embed locally with all-MiniLM-L6-v2 (same model as Python version)
    const embeddings = new HuggingFaceTransformersEmbeddings({
      model: "Xenova/all-MiniLM-L6-v2",
    });

    // Reset and create Qdrant collection
    const qdrantClient = new QdrantClient({ host: "localhost", port: 6333 });
    const collectionName = "pdf_docs";
    const collections = await qdrantClient.getCollections();
    if (collections.collections.some((c) => c.name === collectionName)) {
      await qdrantClient.deleteCollection(collectionName);
    }
    await qdrantClient.createCollection(collectionName, {
      vectors: { size: 384, distance: "Cosine" },
    });

    // Batch embed and store
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        client: qdrantClient,
        collectionName,
      },
    );
    const batchSize = 50;
    for (let i = 0; i < docs.length; i += batchSize) {
      await vectorStore.addDocuments(docs.slice(i, i + batchSize));
      console.log(
        `  Qdrant batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(docs.length / batchSize)}`,
      );
    }

    ragState.retriever = vectorStore;
    ragState.enabled = true;
    ragState.pdfName = file.originalname;

    res.json({
      message: "PDF loaded successfully",
      filename: file.originalname,
      chunks: docs.length,
      rag_enabled: true,
    });
  } catch (e: any) {
    console.error("Upload error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlinkSync(file.path);
  }
});

app.delete("/session/:sessionId", (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ message: "Session cleared" });
});

app.post("/reset-rag", (_req, res) => {
  ragState.enabled = false;
  ragState.pdfName = null;
  ragState.retriever = null;
  res.json({ message: "RAG disabled, back to plain chat mode" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Neo4j: ${neo4jConnected ? "connected" : "disconnected"}`);
});

// Cleanup Neo4j on exit
process.on("SIGINT", async () => {
  if (neo4jSession) await neo4jSession.close();
  if (neo4jDriver) await neo4jDriver.close();
  process.exit();
});
