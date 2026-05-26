import { Router } from "express";
import * as neo4jClient from "../neo4j/client.js";
import { ragState } from "../qdrant/client.js";
import { TOOL_MAP } from "../tools/registry.js";
import { config } from "../config/env.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({
    rag_enabled: ragState.enabled,
    pdf_name: ragState.pdfName,
    pdf_upload_available: Boolean(config.qdrantUrl),
    neo4j_connected: neo4jClient.isConnected(),
    tools: Object.keys(TOOL_MAP),
  });
});

export default router;
