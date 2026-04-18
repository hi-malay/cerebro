import { Router } from "express";
import multer from "multer";
import fs from "fs";
// @ts-ignore — pdf-parse has no types
import pdfParse from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantVectorStore } from "@langchain/qdrant";
import { config } from "../config/env";
import { ragState, getQdrantClient } from "../qdrant/client";

fs.mkdirSync("/tmp/uploads", { recursive: true });
const upload = multer({ dest: "/tmp/uploads/" });

const router = Router();

router.post("/upload-pdf", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file || !file.originalname.endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF files are accepted." });
    return;
  }

  try {
    if (!config.qdrantUrl) {
      res.status(503).json({
        error:
          "PDF upload is not configured. Set QDRANT_URL (and QDRANT_API_KEY if needed) before deploying.",
      });
      return;
    }

    const buffer = fs.readFileSync(file.path);
    const pdf = await pdfParse(buffer);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.createDocuments([pdf.text]);

    const { HuggingFaceTransformersEmbeddings } = await import(
      "@langchain/community/embeddings/huggingface_transformers"
    );
    const embeddings = new HuggingFaceTransformersEmbeddings({
      model: "Xenova/all-MiniLM-L6-v2",
    });

    const qdrantClient = getQdrantClient();
    const collectionName = config.qdrantCollection;
    const collections = await qdrantClient.getCollections();
    if (collections.collections.some((c) => c.name === collectionName)) {
      await qdrantClient.deleteCollection(collectionName);
    }
    await qdrantClient.createCollection(collectionName, {
      vectors: { size: 384, distance: "Cosine" },
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      { client: qdrantClient, collectionName },
    );
    const batchSize = 50;
    for (let i = 0; i < docs.length; i += batchSize) {
      await vectorStore.addDocuments(docs.slice(i, i + batchSize));
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
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
});

router.post("/reset-rag", (_req, res) => {
  ragState.enabled = false;
  ragState.pdfName = null;
  ragState.retriever = null;
  res.json({ message: "RAG disabled, back to plain chat mode" });
});

export default router;
