import { Router } from "express";
import * as neo4jClient from "../neo4j/client.js";
import { DELETE_CHAT_SESSION } from "../neo4j/queries.js";

const router = Router();

router.delete("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  if (!neo4jClient.isConnected()) {
    res.json({ message: "Session cleared (Neo4j not connected — nothing to delete)" });
    return;
  }
  try {
    await neo4jClient.withSession((s) =>
      s.run(DELETE_CHAT_SESSION, { sessionId }),
    );
    res.json({ message: "Session cleared" });
  } catch (e: any) {
    console.error("Session delete failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
