import { ragState } from "../qdrant/client.js";

export async function runSearchPdf(query: string): Promise<string> {
  if (!ragState.enabled || !ragState.retriever) {
    return "No PDF is currently loaded.";
  }
  const docs = await ragState.retriever.similaritySearch(query, 4);
  if (!docs.length) return "No relevant sections found for this query.";
  return docs.map((d) => d.pageContent).join("\n\n");
}
