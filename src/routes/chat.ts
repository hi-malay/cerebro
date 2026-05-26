import { Router } from "express";
import { appGraph } from "../agent/graph.js";
import * as neo4jClient from "../neo4j/client.js";
import { loadChatHistory, saveChatTurn } from "../neo4j/repository.js";
import { extractMemoryGraph } from "../memory/extractor.js";
import { chatLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/chat", chatLimiter, async (req, res) => {
  try {
    const { question, session_id } = req.body;
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const sessionId = session_id || crypto.randomUUID();

    // Load history from Neo4j so context survives cold starts.
    const chatHistory = neo4jClient.isConnected()
      ? await neo4jClient.withSession((s) => loadChatHistory(s, sessionId))
      : "";

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
    const toolsUsed = result.toolsUsed || [];

    // Fire-and-forget: extract memory + persist chat turn to Neo4j.
    if (neo4jClient.isConnected()) {
      extractMemoryGraph(question, answer, chatHistory)
        .then((memoryGraph) =>
          neo4jClient.withSession((s) =>
            saveChatTurn(s, {
              sessionId,
              question,
              answer,
              toolsUsed,
              memoryGraph,
            }),
          ),
        )
        .catch((err) => console.error("Memory save failed:", err.message));
    }

    res.json({
      answer,
      session_id: sessionId,
      rag_enabled: false,
      tools_used: toolsUsed,
      iterations: result.iterations || 0,
      neo4j_saved: neo4jClient.isConnected(),
    });
  } catch (e: any) {
    console.error("Chat error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
