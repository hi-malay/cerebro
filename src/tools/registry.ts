import { runWebSearch } from "./web-search.js";
import { runCalculator } from "./calculator.js";
import { runSearchPdf } from "./search-pdf.js";

export const TOOL_MAP: Record<string, (arg: string) => Promise<string> | string> = {
  web_search: runWebSearch,
  calculator: runCalculator,
  search_pdf: runSearchPdf,
};

export const TOOL_DESCRIPTIONS = `You have access to these tools. To use one, respond with ONLY a JSON block like this:
\`\`\`json
{"tool": "tool_name", "args": {"arg_name": "value"}}
\`\`\`

Tools:
- web_search(query: str): Search the internet for current information not in the PDF.
- calculator(expression: str): Evaluate math. Examples: "2 + 2", "(52340 * 0.15)", "2 ** 8" don't accept string this will break tool flow
- search_pdf(query: str): Re-search the PDF with a different/more specific query.

Rules:
- ALWAYS use the calculator tool for ANY math, even simple arithmetic. Never compute math yourself.
- ALWAYS use web_search for ANY question about current events, real-time data, or facts you're not 100% certain about.
- ALWAYS use search_pdf when a PDF is loaded and the question could relate to its content.
- When using a tool, respond with ONLY the JSON block. No other text.
- Only answer directly (no JSON) when the question is purely conversational and needs no computation, search, or PDF lookup.
- Never wrap tool calls in XML tags or any other format.`;

export function parseToolCall(
  text: string,
): { tool: string; args: Record<string, string> } | null {
  const codeBlock = text.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
  if (codeBlock) {
    try {
      const parsed = JSON.parse(codeBlock[1]);
      if (parsed.tool) return parsed;
    } catch {}
  }

  const rawJson = text.match(/\{[^{}]*"tool"\s*:\s*"[^"]+?"[^{}]*\}/);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson[0]);
      if (parsed.tool) return parsed;
    } catch {}
  }

  return null;
}
