import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config/env.js";

export const ragState: {
  enabled: boolean;
  pdfName: string | null;
  retriever: QdrantVectorStore | null;
} = { enabled: false, pdfName: null, retriever: null };

export function getQdrantClient(): QdrantClient {
  if (!config.qdrantUrl) {
    throw new Error(
      "QDRANT_URL is required for PDF upload/indexing in deployed environments.",
    );
  }
  return new QdrantClient({
    url: config.qdrantUrl,
    apiKey: config.qdrantApiKey ?? undefined,
  });
}
