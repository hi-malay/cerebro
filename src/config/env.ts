import "dotenv/config";

export interface Config {
  port: number;
  isVercel: boolean;
  groqApiKey: string;
  tavilyApiKey: string;
  geminiApiKey: string | null;
  qdrantUrl: string | null;
  qdrantApiKey: string | null;
  qdrantCollection: string;
  neo4jUrl: string | null;
  neo4jUser: string | null;
  neo4jPassword: string | null;
  neo4jDatabase: string | null;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config: Config = {
  port: Number(process.env.PORT) || 8000,
  isVercel: Boolean(process.env.VERCEL),
  groqApiKey: requireEnv("GROQ_API_KEY"),
  tavilyApiKey: requireEnv("TAVILY_API_KEY"),
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  qdrantUrl: process.env.QDRANT_URL || null,
  qdrantApiKey: process.env.QDRANT_API_KEY || null,
  qdrantCollection: process.env.QDRANT_COLLECTION || "pdf_docs",
  neo4jUrl: process.env.NEO_URL || null,
  neo4jUser: process.env.NEO_USER || null,
  neo4jPassword: process.env.NEO_PASSWORD || null,
  neo4jDatabase: process.env.NEO_DATABASE?.trim() || null,
};
