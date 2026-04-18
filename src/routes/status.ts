import { Router } from "express";
import * as neo4jClient from "../neo4j/client";
import { ragState } from "../qdrant/client";
import { TOOL_MAP } from "../tools/registry";
import { config } from "../config/env";
import { sessions } from "./chat";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({
    rag_enabled: ragState.enabled,
    pdf_name: ragState.pdfName,
    pdf_upload_available: Boolean(config.qdrantUrl),
    neo4j_connected: neo4jClient.isConnected(),
    active_sessions: sessions.size,
    tools: Object.keys(TOOL_MAP),
  });
});

export default router;
