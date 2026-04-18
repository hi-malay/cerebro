import { Router } from "express";
import { appGraph } from "../agent/graph";
import * as neo4jClient from "../neo4j/client";
import { saveChatTurn } from "../neo4j/repository";
import { extractMemoryGraph } from "../memory/extractor";

export const sessions = new Map<string, string>();

const router = Router();

router.post("/chat", async (req, res) => {
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

    const toolsUsed = result.toolsUsed || [];

    // Fire-and-forget: extract memory + save to Neo4j
    if (neo4jClient.isConnected()) {
      const session = neo4jClient.getSession()!;
      extractMemoryGraph(question, answer, chatHistory)
        .then((memoryGraph) =>
          saveChatTurn(session, {
            sessionId,
            question,
            answer,
            toolsUsed,
            memoryGraph,
          }),
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
