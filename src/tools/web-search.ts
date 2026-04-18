import { tavily } from "@tavily/core";
import { config } from "../config/env";

const tvly = tavily({ apiKey: config.tavilyApiKey });

export async function runWebSearch(query: string): Promise<string> {
  try {
    const response = await tvly.search(query, { maxResults: 3 });
    if (!response.results.length) return "No results found.";
    return response.results.map((r) => `- ${r.title}: ${r.content}`).join("\n");
  } catch (e: any) {
    return `Search failed: ${e.message}`;
  }
}
