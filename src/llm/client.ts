import { ChatGroq } from "@langchain/groq";
import { config } from "../config/env.js";

export const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: config.groqApiKey,
});

export const extractionLlm = new ChatGroq({
  model: "llama-3.1-8b-instant",
  apiKey: config.groqApiKey,
  temperature: 0,
  maxTokens: 512,
});
